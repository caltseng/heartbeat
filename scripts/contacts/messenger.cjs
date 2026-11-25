const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { hash, parseJSON, readJSONValue, writeExclusive, runCLI, outputLocation } = require('./lib.cjs');
const { resolvePeriod } = require('./collect.cjs');

const CONNECTOR = 'messenger-json-snapshot-v1';
class MessengerError extends Error {
  constructor(code) { super(`Messenger conversion failed [${code}].`); this.code = code; }
}
function requireValue(value, code = 'invalid_manifest') {
  if (!value) throw new MessengerError(code);
}
function object(value, keys, code = 'invalid_manifest') {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key)), code);
}
const text = value => typeof value === 'string' && value.trim().length > 0;
function instant(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return value;
}
function synthetic(value) {
  requireValue(value === 'synthetic', value === 'private' ? 'private_conversion_disabled' : 'synthetic_only');
}
function validateManifest(manifest) {
  object(manifest, ['schemaVersion', 'dataClass', 'profile', 'layout', 'account', 'retrievedAt',
    'producerVersion', 'exportCreatedAt', 'exportDownloadedAt', 'period', 'categories', 'history',
    'shards', 'threads']);
  synthetic(manifest.dataClass);
  requireValue(manifest.schemaVersion === 1 && manifest.profile === CONNECTOR, 'unsupported_profile');
  requireValue(['messages-inbox', 'activity-messages-inbox'].includes(manifest.layout), 'unsupported_layout');
  requireValue(text(manifest.account));
  instant(manifest.retrievedAt);
  for (const key of ['exportCreatedAt', 'exportDownloadedAt']) {
    requireValue(manifest[key] === null || instant(manifest[key]) <= manifest.retrievedAt);
  }
  requireValue(manifest.producerVersion === null || text(manifest.producerVersion));
  resolvePeriod(manifest.period);
  requireValue(Array.isArray(manifest.categories) && manifest.categories.length > 0 &&
    manifest.categories.every(text) && new Set(manifest.categories).size === manifest.categories.length);
  object(manifest.history, ['truncated', 'encryptedHistory']);
  requireValue(typeof manifest.history.truncated === 'boolean' &&
    ['unknown', 'omitted'].includes(manifest.history.encryptedHistory));
  requireValue(Array.isArray(manifest.shards) && manifest.shards.length > 0);
  const root = manifest.layout === 'messages-inbox' ? 'messages/' : 'your_facebook_activity/messages/';
  const seen = new Set();
  for (const shard of manifest.shards) {
    object(shard, ['path', 'sha256']);
    requireValue(typeof shard.path === 'string' && shard.path.startsWith(root), 'unsupported_layout');
    const relative = shard.path.slice(root.length);
    requireValue(/^inbox\/[A-Za-z0-9_-]+\/message_[1-9]\d*\.json$/.test(relative), 'unsupported_layout');
    requireValue(!seen.has(shard.path.toLowerCase()), 'duplicate_shard');
    seen.add(shard.path.toLowerCase());
    requireValue(typeof shard.sha256 === 'string' && /^[a-f0-9]{64}$/.test(shard.sha256));
    requireValue(Number.isSafeInteger(Number(/message_(\d+)\.json$/.exec(relative)[1])));
  }
  requireValue(Array.isArray(manifest.threads) && manifest.threads.length > 0);
  const threadPaths = new Set();
  for (const thread of manifest.threads) {
    object(thread, ['threadPath', 'identities', 'directRecipientsReviewed']);
    requireValue(typeof thread.threadPath === 'string' && /^inbox\/[A-Za-z0-9_-]+$/.test(thread.threadPath) &&
      !threadPaths.has(thread.threadPath), 'identity_mapping');
    threadPaths.add(thread.threadPath);
    requireValue(typeof thread.directRecipientsReviewed === 'boolean' &&
      Array.isArray(thread.identities) && thread.identities.length > 0, 'identity_mapping');
    const names = new Set(), slots = new Set();
    for (const identity of thread.identities) {
      object(identity, ['slot', 'name', 'isSelf']);
      requireValue(text(identity.slot) && text(identity.name) && typeof identity.isSelf === 'boolean' &&
        !names.has(identity.name) && !slots.has(identity.slot), 'identity_mapping');
      names.add(identity.name); slots.add(identity.slot);
    }
    requireValue(thread.identities.filter(identity => identity.isSelf).length === 1, 'identity_mapping');
    requireValue(manifest.shards.some(shard => shard.path.startsWith(`${root}${thread.threadPath}/`)));
  }
  requireValue(manifest.shards.every(shard => threadPaths.has(shard.path.slice(root.length).split('/').slice(0, -1).join('/'))),
    'identity_mapping');
  return root;
}
function projectShard(native, mapping, shardPath, localId, retrievedAt) {
  const code = 'unsupported_shard';
  object(native, ['participants', 'thread_type', 'thread_path', 'messages', 'title', 'is_still_participant',
    'magic_words', 'image', 'joinable_mode'], code);
  requireValue(native.thread_path === mapping.threadPath && Array.isArray(native.participants) &&
    native.participants.length > 0 && Array.isArray(native.messages), code);
  requireValue(['Regular', 'RegularGroup'].includes(native.thread_type), code);
  const roster = native.participants.map(participant => {
    object(participant, ['name'], code);
    requireValue(text(participant.name), code);
    const identity = mapping.identities.find(item => item.name === participant.name);
    requireValue(identity, 'identity_mapping');
    return identity;
  });
  requireValue(new Set(roster.map(identity => identity.slot)).size === roster.length, 'identity_mapping');
  const direct = native.thread_type === 'Regular';
  requireValue(roster.filter(identity => identity.isSelf).length === 1, 'identity_mapping');
  if (direct) requireValue(roster.length === 2 && mapping.identities.length === 2 &&
    mapping.directRecipientsReviewed, 'identity_mapping');
  const threadId = localId('thread', mapping.threadPath);
  const identities = mapping.identities.map(identity => ({
    id: localId('identity', mapping.threadPath, identity.slot), idKind: 'local',
    isSelf: identity.isSelf, displayName: identity.name
  }));
  const events = [];
  let excluded = 0;
  for (const [index, message] of native.messages.entries()) {
    object(message, ['sender_name', 'timestamp_ms', 'type', 'is_unsent', 'content', 'photos', 'videos',
      'audio_files', 'files', 'gifs', 'sticker', 'share', 'reactions', 'call_duration',
      'missed', 'users', 'ip', 'is_geoblocked_for_viewer', 'is_taken_down', 'bumped_message_metadata'], code);
    requireValue(text(message.type) && (message.is_unsent === undefined || typeof message.is_unsent === 'boolean'), code);
    if (message.type !== 'Generic' || message.is_unsent === true) { excluded++; continue; }
    requireValue(Number.isSafeInteger(message.timestamp_ms) && message.timestamp_ms >= 0 &&
      message.timestamp_ms <= Date.parse(retrievedAt), 'invalid_timestamp');
    const sender = mapping.identities.find(identity => identity.name === message.sender_name);
    requireValue(sender, 'identity_mapping');
    events.push({ id: localId('event', mapping.threadPath, shardPath, index), idKind: 'local',
      eventType: 'message', threadId, senderId: localId('identity', mapping.threadPath, sender.slot),
      timestamp: new Date(message.timestamp_ms).toISOString(), channel: 'messenger',
      recipients: direct ? roster.filter(identity => identity.slot !== sender.slot)
        .map(identity => ({ identityId: localId('identity', mapping.threadPath, identity.slot), role: 'recipient' })) : [],
      classification: 'unclassified' });
  }
  return { identities, threads: [{ id: threadId, idKind: 'local', kind: direct ? 'direct' : 'group' }],
    memberships: roster.map(identity => ({ threadId, identityId: localId('identity', mapping.threadPath, identity.slot) })),
    events, excluded };
}
function convertSnapshot(manifest, readShard) {
  let root;
  try { root = validateManifest(manifest); }
  catch (failure) {
    if (!(failure instanceof MessengerError) || !['unsupported_profile', 'unsupported_layout'].includes(failure.code)) throw failure;
    return { handoff: null, report: { status: 'unsupported', profile: CONNECTOR,
      errors: [{ code: failure.code, retryable: false }] }, exitCode: 2 };
  }
  const shards = [...manifest.shards].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const snapshot = hash(JSON.stringify([manifest.account, shards.map(shard => [shard.path, shard.sha256])]));
  const localId = (...tuple) => `${CONNECTOR}:${snapshot}:${hash(JSON.stringify(tuple))}`;
  const errors = [{ code: 'history_unverified', retryable: false }];
  const error = code => { if (!errors.some(item => item.code === code)) errors.push({ code, retryable: false }); };
  if (manifest.history.truncated) error('truncated_history');
  error(manifest.history.encryptedHistory === 'omitted' ? 'encrypted_history_omitted' : 'encrypted_history_unverified');
  if (manifest.categories.some(category => category !== 'inbox')) error('unsupported_categories');
  error('other_folders_unverified');
  const records = { identities: new Map(), threads: new Map(), memberships: new Map(), events: new Map() };
  const rosters = new Map();
  let convertedShards = 0, excludedEvents = 0;
  for (const mapping of manifest.threads) {
    const numbers = shards.filter(shard => shard.path.startsWith(`${root}${mapping.threadPath}/`))
      .map(shard => Number(/message_(\d+)\.json$/.exec(shard.path)[1])).sort((a, b) => a - b);
    if (numbers[0] !== 1 || numbers.some((number, index) => index > 0 && number !== numbers[index - 1] + 1)) error('missing_shards');
  }
  for (const shard of shards) {
    try {
      const bytes = readShard(shard.path);
      requireValue(Buffer.isBuffer(bytes) && hash(bytes) === shard.sha256, 'shard_digest_mismatch');
      let native;
      try { native = parseJSON(bytes.toString('utf8')); }
      catch (failure) {
        if (!(failure instanceof SyntaxError)) throw failure;
        throw new MessengerError('invalid_shard_json');
      }
      const threadPath = shard.path.slice(root.length).split('/').slice(0, -1).join('/');
      const projected = projectShard(native, manifest.threads.find(thread => thread.threadPath === threadPath),
        shard.path, localId, manifest.retrievedAt);
      const roster = projected.memberships.map(row => row.identityId).sort();
      requireValue(!rosters.has(threadPath) || isDeepStrictEqual(rosters.get(threadPath), roster), 'shard_roster_conflict');
      for (const kind of Object.keys(records)) {
        for (const row of projected[kind]) {
          const id = row.id || JSON.stringify([row.threadId, row.identityId]);
          requireValue(!records[kind].has(id) || isDeepStrictEqual(records[kind].get(id), row), 'shard_metadata_conflict');
        }
      }
      for (const kind of Object.keys(records)) for (const row of projected[kind]) {
        records[kind].set(row.id || JSON.stringify([row.threadId, row.identityId]), row);
      }
      rosters.set(threadPath, roster);
      convertedShards++;
      excludedEvents += projected.excluded;
    } catch (failure) {
      if (failure instanceof MessengerError) error(failure.code);
      else if (['ENOENT', 'EACCES', 'EISDIR', 'EPERM'].includes(failure.code)) error('shard_unreadable');
      else throw failure;
    }
  }
  if (excludedEvents) error('excluded_event_types');
  const report = { status: convertedShards ? 'partial' : 'unsupported', profile: CONNECTOR,
    producerVersion: manifest.producerVersion, snapshot, idKind: 'local',
    declaredShards: shards.length, convertedShards, excludedEvents, errors };
  const handoff = convertedShards ? {
    schemaVersion: 1, dataClass: 'synthetic', source: 'messenger', account: manifest.account, connector: CONNECTOR,
    coverage: { start: null, end: null, completeness: 'unknown',
      basis: 'Supplied immutable JSON snapshot only; requested range is not coverage. Encrypted history, other folders, deletions and historical recipients are unverified.' },
    errors, pages: [{ cursor: null, nextCursor: null, retrievedAt: manifest.retrievedAt,
      ...Object.fromEntries(Object.entries(records).map(([kind, rows]) => [kind, [...rows.values()]])) }]
  } : null;
  return { handoff, report, exitCode: 2 };
}
function readLocalShard(root, relative) {
  const base = path.resolve(root);
  const file = path.join(base, ...relative.split('/'));
  requireValue(!fs.lstatSync(base).isSymbolicLink(), 'redirected_input');
  requireValue(fs.statSync(base).isDirectory(), 'shard_unreadable');
  let current = base;
  // OS aliases above the selected root are not export-controlled paths.
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    requireValue(!fs.lstatSync(current).isSymbolicLink(), 'redirected_input');
  }
  requireValue(fs.statSync(file).isFile(), 'shard_unreadable');
  return fs.readFileSync(file);
}
function runRequest(request, folder) {
  object(request, ['manifest', 'inputRoot', 'output']);
  synthetic(request.manifest?.dataClass);
  requireValue(text(request.inputRoot) && text(request.output));
  const output = outputLocation(path.resolve(folder, request.output));
  requireValue(!fs.existsSync(output), 'output_exists');
  const result = convertSnapshot(request.manifest,
    relative => readLocalShard(path.resolve(folder, request.inputRoot), relative));
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(path.join(path.dirname(output), '.messenger-staging-'));
  try {
    fs.chmodSync(staging, 0o700);
    for (const [name, value] of Object.entries({ 'report.json': result.report,
      ...(result.handoff ? { 'handoff.json': result.handoff } : {}) })) {
      writeExclusive(path.join(staging, name), JSON.stringify(value, null, 2) + '\n');
    }
    fs.renameSync(staging, output);
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
  }
  return { output, ...result };
}
if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--synthetic-request', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const request = readJSONValue(file);
    const result = runRequest(request, path.dirname(file));
    process.stdout.write(`Heartbeat synthetic Messenger conversion: ${result.report.status}; history is unverified.\n`);
    return result.exitCode;
  }, failure => {
    process.stderr.write(`Messenger conversion failed [${failure instanceof MessengerError ? failure.code : 'input_or_storage_failure'}].\n`);
    return 1;
  });
}

module.exports = { convertSnapshot, runRequest };
