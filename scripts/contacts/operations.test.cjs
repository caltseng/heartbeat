const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { collect } = require('./collect.cjs');
const { handoff, period } = require('./demo.cjs');
const { operate, retentionCutoff } = require('./operations.cjs');

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-operations-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const input = handoff('email', 'email');
  const request = { schemaVersion: 1, dataClass: 'synthetic', period, output: path.join(folder, 'store'),
    sources: [{ source: 'email', account: input.account, connector: input.connector, mode: 'metadata-import', input: 'input.json' }] };
  const write = () => fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(input));
  write();
  collect(request, folder);
  const file = path.join(request.output, 'collection.json');
  const state = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = input.pages.at(-1).retrievedAt;
  const operation = { schemaVersion: 1, dataClass: 'synthetic', store: request.output, now };
  const run = (action, extra = {}) => operate({ ...operation, action, ...extra }, folder);
  const notes = path.join(request.output, 'curated.json');
  fs.writeFileSync(notes, '{"notes":["unchanged synthetic note"]}\n');
  return { folder, input, request, write, file, state, operation, run, notes };
}
const eventCount = state => Object.values(state.records).filter(row => row.record.type === 'event').length;

test('calendar retention clamps leap day and expires the exact boundary, not 365 days', () => {
  assert.equal(retentionCutoff('2024-02-29T12:30:00Z'), '2023-02-28T12:30:00.000Z');
  assert.equal(retentionCutoff('2025-03-31T12:30:00Z'), '2024-03-31T12:30:00.000Z');
});

test('refresh resumes committed pagination and freshness becomes stale at the exact age threshold', t => {
  const f = fixture(t);
  const second = structuredClone(f.input.pages[0]);
  f.input.pages[0].nextCursor = 'second';
  second.cursor = 'second';
  second.events[0].id = 'message-2';
  f.input.pages.push(second);
  f.write();
  collect({ ...f.request, maxPages: 1 }, f.folder);
  assert.equal(Object.values(f.state().checkpoints)[0].nextCursor, 'second');
  const result = f.run('refresh', { collectionRequest: f.request });
  assert.equal(result.exitCode, 0);
  assert.equal(eventCount(f.state()), 2);
  assert.equal(Object.values(f.state().checkpoints)[0].finished, true);
  assert.throws(() => collect(f.request, f.folder), { code: 'operation_required' });
  f.operation.now = new Date(Date.parse(f.operation.now) + 168 * 3600000 - 1).toISOString();
  assert.equal(f.run('status').status, 'current');
  f.operation.now = new Date(Date.parse(f.operation.now) + 1).toISOString();
  assert.equal(f.run('status').status, 'stale');
});

test('retention expiry uses original event age at the inclusive calendar cutoff', t => {
  const f = fixture(t);
  const timestamp = f.input.pages[0].events[0].timestamp;
  const yearLater = new Date(timestamp);
  yearLater.setUTCFullYear(yearLater.getUTCFullYear() + 1);
  f.operation.now = new Date(yearLater.getTime() - 1).toISOString();
  assert.equal(f.run('status').retentionRequired, false);
  f.operation.now = yearLater.toISOString();
  assert.equal(f.run('status').retentionRequired, true);
});

test('refresh resumes interruption, expired cursor requires resync, replay stays unique and disconnection stays stale', t => {
  const f = fixture(t);
  const firstCount = eventCount(f.state());
  const state = f.state();
  const checkpoint = Object.values(state.checkpoints)[0];
  checkpoint.finished = false;
  checkpoint.nextCursor = 'expired-fixture-cursor';
  fs.writeFileSync(f.file, JSON.stringify(state));
  let result = f.run('refresh', { collectionRequest: f.request });
  assert.equal(result.exitCode, 2);
  assert.equal(result.sources[0].stale, true);
  assert.equal(result.sources[0].recovery, 'resync');
  result = f.run('resync', { collectionRequest: f.request });
  assert.equal(result.exitCode, 0);
  assert.equal(eventCount(f.state()), firstCount);
  result = f.run('refresh', { collectionRequest: { ...f.request, sources: [
    { source: 'email', account: f.input.account, connector: f.input.connector,
      mode: 'unavailable', status: 'requires_setup', reason: 'Synthetic disconnection.' }
  ] } });
  assert.equal(result.exitCode, 2);
  assert.equal(result.sources[0].stale, true);
  assert.equal(result.sources[0].coverage, null);
  assert.equal(eventCount(f.state()), firstCount);
  f.run('refresh', { collectionRequest: f.request });
  assert.equal(eventCount(f.state()), firstCount);
  assert.equal(fs.readFileSync(f.notes, 'utf8'), '{"notes":["unchanged synthetic note"]}\n');
});

test('refresh cannot hide a historical cached source omitted from the latest request', t => {
  const f = fixture(t);
  const google = handoff('google-contacts', null);
  fs.writeFileSync(path.join(f.folder, 'google.json'), JSON.stringify(google));
  const collectionRequest = { ...f.request, sources: [
    { source: google.source, account: google.account, connector: google.connector,
      mode: 'metadata-import', input: 'google.json' }
  ] };
  const result = f.run('resync', { collectionRequest });
  assert.equal(result.exitCode, 2);
  assert.equal(result.sources.find(source => source.source === 'google-contacts').stale, false);
  const email = result.sources.find(source => source.source === 'email');
  assert.equal(email.status, 'not_refreshed');
  assert.equal(email.stale, true);
  assert.equal(email.coverage, null);
  assert.equal(email.lastKnownCoverage.completeness, 'complete');
  assert.equal(f.run('status').sources.find(source => source.source === 'email').stale, true);
  assert.equal(eventCount(f.state()), 1);
});

test('retention purges every metadata copy and orphan identifier, preserves notes and fences replay', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.request.output, 'cache'));
  fs.mkdirSync(path.join(f.request.output, 'derived'));
  for (const relative of ['cache/input.json', 'cache/native-checkpoint.json', 'derived/graph.html']) {
    fs.writeFileSync(path.join(f.request.output, relative), 'synthetic cached metadata');
  }
  fs.writeFileSync(`${f.file}.123.tmp`, 'synthetic pre-crash metadata');
  f.operation.now = '2028-01-31T12:00:00Z';
  assert.equal(f.run('status').retentionRequired, true);
  assert.throws(() => f.run('refresh', { collectionRequest: f.request }), { code: 'retention_required' });
  const before = fs.readFileSync(f.file, 'utf8');
  assert.throws(() => f.run('retain', { confirm: 'purge-cached-metadata' }), { code: 'inventory_incomplete' });
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  f.run('retain', { confirm: 'purge-cached-metadata',
    artifacts: ['cache\\input.json', 'cache\\native-checkpoint.json', 'derived\\graph.html'] });
  const state = f.state();
  assert.deepEqual(state.records, {});
  assert.deepEqual(state.checkpoints, {});
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.overlapReviews, []);
  assert.equal(state.textArchives, undefined);
  assert.equal(state.reconciliation.records && Object.keys(state.reconciliation.records).length, 0);
  assert.equal(fs.readdirSync(path.join(f.request.output, 'cache')).length, 0);
  assert.equal(fs.readdirSync(path.join(f.request.output, 'derived')).length, 0);
  assert.equal(fs.existsSync(`${f.file}.123.tmp`), false);
  assert.equal(f.run('status').status, 'stale');
  const replay = f.run('resync', { collectionRequest: f.request });
  assert.equal(replay.exitCode, 2);
  assert.equal(replay.sources[0].error.code, 'retention_required');
  assert.equal(eventCount(f.state()), 0);
  assert.ok(fs.readFileSync(f.notes, 'utf8').includes('unchanged synthetic note'));
});

test('explicit deletion blocks old acquisition and old events even in a freshly retrieved page', t => {
  const f = fixture(t);
  f.run('delete', { confirm: 'purge-cached-metadata' });
  let result = f.run('resync', { collectionRequest: f.request });
  assert.equal(result.sources[0].error.code, 'deleted_input');
  const later = new Date(Date.parse(f.operation.now) + 3600000).toISOString();
  f.operation.now = later;
  f.input.pages.forEach(page => { page.retrievedAt = later; });
  f.write();
  result = f.run('resync', { collectionRequest: f.request });
  assert.equal(result.sources[0].error.code, 'retention_required');
  assert.equal(eventCount(f.state()), 0);
  f.input.pages.forEach(page => page.events.forEach(event => { event.timestamp = later; }));
  f.write();
  result = f.run('resync', { collectionRequest: f.request });
  assert.equal(result.sources[0].error, undefined);
  const count = eventCount(f.state());
  assert.ok(count > 0);
  f.run('resync', { collectionRequest: f.request });
  assert.equal(eventCount(f.state()), count);
});

test('interrupted purge blocks direct collection and recover completes exact-file deletion idempotently', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.request.output, 'cache'));
  const artifact = path.join(f.request.output, 'cache', 'input.json');
  fs.writeFileSync(artifact, 'synthetic pre-interruption copy');
  const unlink = fs.unlinkSync;
  fs.unlinkSync = target => {
    if (target === artifact) throw Object.assign(new Error('Synthetic interrupted unlink.'), { code: 'EACCES' });
    return unlink(target);
  };
  try {
    assert.throws(() => f.run('delete', { confirm: 'purge-cached-metadata',
      artifacts: [path.join('cache', 'input.json')] }), { code: 'EACCES' });
  } finally { fs.unlinkSync = unlink; }
  assert.deepEqual(f.state().records, {});
  assert.ok(f.state().operations.pendingArtifacts.length);
  assert.throws(() => collect(f.request, f.folder), { code: 'recovery_required' });
  f.run('recover');
  assert.equal(fs.existsSync(artifact), false);
  assert.equal(f.state().operations.pendingArtifacts, undefined);
  assert.equal(f.run('recover').status, 'recovered');
  assert.ok(fs.existsSync(f.notes));
});

test('recovery removes a verified dead collector lock without changing its committed snapshot', t => {
  const f = fixture(t);
  const child = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  fs.writeFileSync(path.join(f.request.output, 'collection.lock'), JSON.stringify({ pid: child.pid }));
  const before = fs.readFileSync(f.file, 'utf8');
  f.run('recover');
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(f.request.output, 'collection.lock')), false);
});

test('purge refuses redirected cache directories and never follows them', t => {
  const f = fixture(t);
  const external = path.join(f.folder, 'outside');
  fs.mkdirSync(external);
  const original = path.join(external, 'input.json');
  fs.writeFileSync(original, 'synthetic external copy');
  try { fs.symlinkSync(external, path.join(f.request.output, 'cache'), 'junction'); }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host cannot create test junctions.'); return; }
    throw error;
  }
  assert.throws(() => f.run('delete', { confirm: 'purge-cached-metadata',
    artifacts: [path.join('cache', 'input.json')] }), { code: 'unsafe_output' });
  assert.equal(fs.readFileSync(original, 'utf8'), 'synthetic external copy');
});

test('operations CLI distinguishes current from stale coverage without creating a recurring job', t => {
  const f = fixture(t);
  const file = path.join(f.folder, 'operation.json');
  const invoke = () => spawnSync(process.execPath, [path.join(__dirname, 'operations.cjs'),
    '--request', file], { encoding: 'utf8' });
  fs.writeFileSync(file, JSON.stringify({ ...f.operation, action: 'status' }));
  let result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'current');
  fs.writeFileSync(file, JSON.stringify({ ...f.operation, action: 'status',
    now: new Date(Date.parse(f.operation.now) + 8 * 86400000).toISOString() }));
  result = invoke();
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).sources[0].stale, true);
  assert.deepEqual(fs.readdirSync(f.request.output).sort(), ['collection.json', 'curated.json']);
});

test('live lock, unsafe inventory, backwards clock, private runs and scheduling fail closed', t => {
  const f = fixture(t);
  const lock = path.join(f.request.output, 'collection.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  assert.throws(() => f.run('recover'), { code: 'store_locked' });
  assert.ok(fs.existsSync(lock));
  fs.unlinkSync(lock);
  for (const artifact of ['curated.json', '../outside.json', 'cache/../../curated.json', 'C:\\private.json']) {
    assert.throws(() => f.run('delete', { confirm: 'purge-cached-metadata', artifacts: [artifact] }), { code: 'unsafe_output' });
  }
  f.run('resync', { collectionRequest: f.request });
  assert.throws(() => f.run('status', { now: '2000-01-01T00:00:00Z' }), /backwards/);
  assert.throws(() => f.run('status', { dataClass: 'private' }), { code: 'private_collection_disabled' });
  assert.throws(() => f.run('schedule'), /scheduling is not implemented/);
  const cliRequest = path.join(f.folder, 'operation.json');
  fs.writeFileSync(cliRequest, JSON.stringify({ ...f.operation, dataClass: 'private', action: 'delete' }));
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'operations.cjs'), '--request', cliRequest], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.match(cli.stderr, /private_collection_disabled/);
  assert.ok(!cli.stderr.includes(f.request.output));
  assert.ok(fs.existsSync(f.notes));
});
