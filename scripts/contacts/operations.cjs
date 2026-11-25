const fs = require('node:fs');
const path = require('node:path');
const { collect, outputLocation, persist, readJSON, instant, requireValue, object } = require('./collect.cjs');

function retentionCutoff(now) {
  const date = new Date(instant(now, 'now'));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}
function expired(state, cutoff) {
  return Object.values(state.records).some(entry => {
    const rows = entry.revisions || [{ record: entry.record, provenance: entry.provenance }];
    return rows.some(row => row.record.type === 'event' ?
      !row.record.timestamp || instant(row.record.timestamp, 'event timestamp') <= cutoff :
      !row.provenance?.length || row.provenance.some(provenance =>
        !provenance.retrievedAt || instant(provenance.retrievedAt, 'retrieval timestamp') <= cutoff));
  }) || (state.history || []).some(row => !row.collectedAt || row.collectedAt <= cutoff) ||
    (state.manifest?.collectedAt && state.manifest.collectedAt <= cutoff);
}
function artifactPaths(store, inventory) {
  requireValue(Array.isArray(inventory) && new Set(inventory).size === inventory.length,
    'artifacts must be a distinct list of relative cache file paths.');
  return inventory.map(relative => {
    requireValue(typeof relative === 'string' && relative.length > 0 && !path.isAbsolute(relative) &&
      !relative.includes(':') && !relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..'),
    'Artifact paths must be contained relative paths.', 'unsafe_output');
    const parts = relative.split(/[\\/]/);
    requireValue(['cache', 'derived'].includes(parts[0]) && parts.length > 1,
      'Only inventoried files below cache or derived may be purged; curated files are never artifacts.', 'unsafe_output');
    let file = store;
    for (const part of parts) {
      file = path.join(file, part);
      if (fs.existsSync(file)) requireValue(!fs.lstatSync(file).isSymbolicLink(),
        'Artifact paths must not traverse symbolic links.', 'unsafe_output');
    }
    if (fs.existsSync(file)) requireValue(fs.lstatSync(file).isFile(),
      'An artifact must be an exact file, never a directory.', 'unsafe_output');
    return file;
  });
}
function cacheFiles(store) {
  const found = [];
  function visit(folder, relative) {
    if (!fs.existsSync(folder)) return;
    requireValue(!fs.lstatSync(folder).isSymbolicLink(), 'Cache directories must not be redirected.', 'unsafe_output');
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const name = path.join(relative, item.name);
      requireValue(!item.isSymbolicLink(), 'Cache files must not be redirected.', 'unsafe_output');
      if (item.isDirectory()) visit(path.join(folder, item.name), name);
      else {
        requireValue(item.isFile(), 'Cache inventory contains a non-file.', 'unsafe_output');
        found.push(name);
      }
    }
  }
  for (const folder of ['cache', 'derived']) visit(path.join(store, folder), folder);
  // An interrupted atomic write can contain an entire pre-purge snapshot.
  for (const file of fs.readdirSync(store)) {
    if (/^collection\.json\.\d+\.tmp$/.test(file)) {
      requireValue(fs.lstatSync(path.join(store, file)).isFile() &&
        !fs.lstatSync(path.join(store, file)).isSymbolicLink(), 'Unsafe collection temporary file.', 'unsafe_output');
      found.push(file);
    } else requireValue(['collection.json', 'collection.lock', 'cache', 'derived', 'curated', 'curated.json'].includes(file),
      'Unclassified store artifact: use the managed cache/derived layout before purging.', 'inventory_incomplete');
  }
  return found;
}
function finishPurge(store, file, state) {
  const pending = state.operations.pendingArtifacts;
  requireValue(Array.isArray(pending) && pending.every(name => typeof name === 'string'),
    'Invalid purge journal.', 'recovery_required');
  const regular = pending.filter(name => !/^collection\.json\.\d+\.tmp$/.test(name));
  artifactPaths(store, regular);
  for (const name of pending) {
    const target = path.join(store, name);
    if (fs.existsSync(target)) {
      requireValue(!fs.lstatSync(target).isSymbolicLink() && fs.lstatSync(target).isFile(),
        'Purge target changed; recovery requires an exact regular file.', 'unsafe_output');
      fs.unlinkSync(target);
    }
  }
  delete state.operations.pendingArtifacts;
  persist(file, state);
}
function sourceStatus(state, now, maxAgeHours) {
  const namespace = source => JSON.stringify([source.source, source.account, source.connector]);
  const sources = new Map((state.manifest.sources || []).map(source => [namespace(source), source]));
  for (const previous of [...(state.history || [])].reverse()) {
    for (const source of previous.sources || []) {
      if (!sources.has(namespace(source))) sources.set(namespace(source), { ...source,
        status: 'not_refreshed', coverage: null, lastKnownCoverage: source.lastKnownCoverage || source.coverage,
        lastKnownStatus: source.lastKnownStatus || source.status });
    }
  }
  return [...sources.values()].map(source => {
    const age = source.retrievedAt ? Date.parse(now) - Date.parse(source.retrievedAt) : Infinity;
    const stale = source.status !== 'collected' || !Number.isFinite(age) || age < 0 ||
      age >= maxAgeHours * 3600000;
    const errors = [source.error?.code, ...(source.upstreamErrors || []).map(error => error.code)];
    return { ...source, stale, observedOnly: stale || source.observedOnly,
      recovery: errors.some(code => ['checkpoint_not_found', 'cursor_expired', 'full_sync_expired', 'history_expired'].includes(code)) ? 'resync' :
        source.status === 'requires_setup' ? 'reconnect-explicitly-then-refresh' : stale ? 'refresh' : null };
  });
}
function operate(request, requestFolder = process.cwd()) {
  object(request, ['schemaVersion', 'dataClass', 'action', 'store', 'now', 'maxAgeHours',
    'artifacts', 'confirm', 'collectionRequest'], 'operation');
  requireValue(request.schemaVersion === 1 && ['synthetic', 'private'].includes(request.dataClass), 'Invalid operation version/data class.');
  requireValue(request.dataClass === 'synthetic', 'Private operations remain disabled.', 'private_collection_disabled');
  requireValue(['status', 'refresh', 'resync', 'retain', 'delete', 'recover'].includes(request.action), 'Unsupported operation; scheduling is not implemented.');
  const now = instant(request.now, 'now');
  const cutoff = retentionCutoff(now);
  const maxAgeHours = request.maxAgeHours === undefined ? 168 : request.maxAgeHours;
  requireValue(Number.isFinite(maxAgeHours) && maxAgeHours > 0, 'maxAgeHours must be positive.');
  const store = outputLocation(path.resolve(requestFolder, request.store));
  requireValue(fs.existsSync(store) && !fs.lstatSync(store).isSymbolicLink(), 'An existing unredirected store is required.', 'unsafe_output');
  const file = path.join(store, 'collection.json');
  requireValue(fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink(), 'An existing unredirected snapshot is required.', 'unsafe_output');
  const lock = path.join(store, 'collection.lock');
  if (request.action === 'recover' && fs.existsSync(lock)) {
    requireValue(!fs.lstatSync(lock).isSymbolicLink(), 'Unsafe lock.', 'unsafe_output');
    const owner = readJSON(lock).value;
    requireValue(Number.isSafeInteger(owner.pid) && owner.pid > 0, 'Unverifiable lock owner.', 'store_locked');
    let dead = false;
    try { process.kill(owner.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') dead = true; else throw error; }
    requireValue(dead, 'Lock owner is still active; do not recover this store.', 'store_locked');
    fs.unlinkSync(lock);
  }
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') requireValue(false, 'Store is locked; recover only after its owner exits.', 'store_locked');
    throw error;
  }
  let collectionRequest, previousHistory;
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: now }));
    const state = readJSON(file).value;
    requireValue(state.schemaVersion === 1 && state.dataClass === 'synthetic' && state.records &&
      state.checkpoints && Array.isArray(state.history) && state.manifest, 'Invalid synthetic collection store.');
    requireValue(!state.operations || now >= state.operations.asOf, 'Operation clock cannot move backwards.');
    if (request.action === 'recover') {
      if (state.operations?.pendingArtifacts) finishPurge(store, file, state);
      return { title: 'Heartbeat source recovery', status: 'recovered', exitCode: 0 };
    }
    requireValue(!state.operations?.pendingArtifacts, 'Finish interrupted purge with recover.', 'recovery_required');
    const needsRetention = expired(state, cutoff);
    if (request.action === 'status') {
      const sources = sourceStatus(state, now, maxAgeHours);
      const stale = sources.length === 0 || state.manifest.status !== 'collected' ||
        sources.some(source => source.stale) || needsRetention;
      return { title: 'Heartbeat source operations', status: stale ? 'stale' : 'current',
        retentionRequired: needsRetention, sources, exitCode: stale ? 2 : 0 };
    }
    if (['retain', 'delete'].includes(request.action)) {
      requireValue(request.confirm === 'purge-cached-metadata',
        'Explicit confirm=purge-cached-metadata is required; curated files are preserved.');
      const approved = request.artifacts || [];
      const approvedPaths = new Set(artifactPaths(store, approved));
      const existing = cacheFiles(store);
      requireValue(existing.every(name => approvedPaths.has(path.join(store, name)) ||
        /^collection\.json\.\d+\.tmp$/.test(name)),
      'Inventory every cache/derived file before purging; no partial deletion was started.', 'inventory_incomplete');
      const previous = state.operations;
      const operations = { schemaVersion: 1, asOf: now, cutoff,
        deletedThrough: request.action === 'delete' ? now : previous?.deletedThrough || null,
        pendingArtifacts: [...new Set([...approvedPaths].map(file => path.relative(store, file)).concat(existing))] };
      const purged = { schemaVersion: 1, dataClass: 'synthetic', records: {}, checkpoints: {},
        history: [], overlapReviews: [], operations,
        manifest: { schemaVersion: 1, dataClass: 'synthetic', collectedAt: now, period: null,
          status: 'partial', sources: [], unresolvedIdentityKeys: [],
          limitations: ['Cached metadata purged. Coverage is unknown; explicitly resync from fresh bounded inputs. Curated files were not changed.'] } };
      persist(file, purged);
      finishPurge(store, file, purged);
      return { title: 'Heartbeat metadata purge', status: 'purged', coverage: 'unknown', exitCode: 0 };
    }
    requireValue(!needsRetention, 'Run explicit retention before refresh/resync.', 'retention_required');
    requireValue(request.collectionRequest && typeof request.collectionRequest === 'object', 'A synthetic collectionRequest is required.');
    collectionRequest = { ...request.collectionRequest, resume: request.action === 'refresh' };
    requireValue(collectionRequest.dataClass === 'synthetic' &&
      outputLocation(path.resolve(requestFolder, collectionRequest.output)) === store,
    'Collection must target the same synthetic store.');
    previousHistory = [...state.history, { sources: state.manifest.sources }];
    // Keep the fence even after successful imports, so old immutable inputs cannot restore erased history.
    state.operations = { ...state.operations, schemaVersion: 1, asOf: now, cutoff };
    persist(file, state);
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
  const result = collect(collectionRequest, requestFolder, now);
  const sources = sourceStatus({ manifest: result.manifest, history: previousHistory }, now, maxAgeHours);
  const stale = sources.some(source => source.stale);
  return { title: 'Heartbeat source refresh', ...result, sources, exitCode: stale ? 2 : result.exitCode };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--request',
      'Usage: node scripts\\contacts\\operations.cjs --request <operation.synthetic.json>');
    const file = path.resolve(args[1]);
    const result = operate(readJSON(file).value, path.dirname(file));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`Operation failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
module.exports = { operate, retentionCutoff };
