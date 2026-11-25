const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { convertSnapshot, runRequest } = require('./messenger.cjs');
const { collect } = require('./collect.cjs');

const at = '2026-11-24T20:00:00.000Z';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function scenario(layout = 'messages-inbox') {
  const root = layout === 'messages-inbox' ? 'messages/' : 'your_facebook_activity/messages/';
  const people = ['Fixture Self', 'Fixture Peer', 'Fixture Third', 'Fixture Fourth'];
  const thread = (name, count) => ({
    threadPath: `inbox/${name}`, directRecipientsReviewed: count === 2,
    identities: people.slice(0, count).map((name, index) => ({ slot: `slot-${index}`, name, isSelf: index === 0 }))
  });
  const native = (name, count, timestamp = 1795435200123) => ({
    participants: people.slice(0, count).map(name => ({ name })), thread_path: `inbox/${name}`,
    thread_type: count === 2 ? 'Regular' : 'RegularGroup',
    messages: [{ sender_name: people[1], timestamp_ms: timestamp, type: 'Generic', is_unsent: false,
      content: 'SYNTHETIC BODY DO NOT RETAIN', photos: [{ uri: 'SYNTHETIC PRIVATE URI' }] }],
    title: 'SYNTHETIC TITLE DO NOT RETAIN'
  });
  const files = new Map([
    [`${root}inbox/direct/message_1.json`, Buffer.from(JSON.stringify(native('direct', 2)))],
    [`${root}inbox/group/message_1.json`, Buffer.from(JSON.stringify(native('group', 4)))],
    [`${root}inbox/group/message_2.json`, Buffer.from(JSON.stringify(native('group', 4)))]
  ]);
  const manifest = { schemaVersion: 1, dataClass: 'synthetic', profile: 'messenger-json-snapshot-v1',
    layout, account: 'fixture-messenger', retrievedAt: at, producerVersion: null,
    exportCreatedAt: null, exportDownloadedAt: null, categories: ['inbox'],
    history: { truncated: false, encryptedHistory: 'unknown' },
    period: { preset: 'custom', timeZone: 'UTC', asOf: at, start: '2026-11-01T00:00:00Z', end: at },
    shards: [...files].map(([path, bytes]) => ({ path, sha256: digest(bytes) })),
    threads: [thread('direct', 2), thread('group', 4)] };
  return { manifest, files, read: name => {
    if (!files.has(name)) throw Object.assign(new Error('SYNTHETIC PRIVATE PATH'), { code: 'ENOENT' });
    return files.get(name);
  } };
}
function mutateShard(fixture, index, change) {
  const shard = fixture.manifest.shards[index];
  const native = JSON.parse(fixture.files.get(shard.path));
  change(native);
  const bytes = Buffer.from(JSON.stringify(native));
  fixture.files.set(shard.path, bytes);
  shard.sha256 = digest(bytes);
}
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-messenger-synthetic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function importResult(dir, handoff, connector = handoff.connector, overlapReview) {
  fs.writeFileSync(path.join(dir, 'handoff.json'), JSON.stringify({ ...handoff, connector }));
  return collect({ schemaVersion: 1, dataClass: 'synthetic', period: scenario().manifest.period,
    ...(overlapReview ? { overlapReview } : {}),
    output: path.join(dir, 'store'), sources: [{ source: 'messenger', account: handoff.account,
      connector, mode: 'metadata-import', input: 'handoff.json' }] }, dir);
}
function stored(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'store', 'collection.json'), 'utf8'));
}
test('direct and four-member group shards preserve one sender/event, metadata, UTC milliseconds and replay', t => {
  for (const layout of ['messages-inbox', 'activity-messages-inbox']) {
    const fixture = scenario(layout);
    const result = convertSnapshot(fixture.manifest, fixture.read);
    const page = result.handoff.pages[0];
    assert.equal(result.exitCode, 2);
    assert.equal(result.report.convertedShards, 3);
    assert.equal(page.events.length, 3);
    assert.equal(page.identities.length, 6);
    assert.ok([...page.identities, ...page.threads, ...page.events].every(row => row.idKind === 'local'));
    assert.ok(page.events.every(event => event.timestamp === '2026-11-23T12:00:00.123Z' && event.senderId));
    const group = page.threads.find(thread => thread.kind === 'group');
    assert.equal(page.memberships.filter(item => item.threadId === group.id).length, 4);
    assert.deepEqual(page.events.filter(event => event.threadId === group.id).map(event => event.recipients), [[], []]);
    assert.equal(page.events.find(event => event.threadId !== group.id).recipients.length, 1);
    assert.equal(new Set(page.events.map(event => event.id)).size, 3);
    assert.deepEqual(result.handoff.coverage.start, null);
    assert.equal(result.handoff.coverage.completeness, 'unknown');
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC BODY'));
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC PRIVATE URI'));
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC TITLE'));
    fixture.manifest.shards.reverse();
    fixture.manifest.threads.reverse();
    assert.deepEqual(convertSnapshot(fixture.manifest, fixture.read), result);
    const dir = temp(t);
    assert.equal(importResult(dir, result.handoff).exitCode, 2);
    assert.equal(importResult(dir, result.handoff).exitCode, 2);
    assert.equal(Object.values(stored(dir).records).filter(row => row.record.type === 'event').length, 3);
  }
});
test('equal timestamps within a shard remain distinct, and excluded records keep original event indices', () => {
  const fixture = scenario();
  mutateShard(fixture, 0, native => {
    native.messages.push({ type: 'Call', call_duration: 20 }, { ...native.messages[0], is_unsent: true },
      structuredClone(native.messages[0]));
  });
  const result = convertSnapshot(fixture.manifest, fixture.read);
  assert.equal(result.report.excludedEvents, 2);
  assert.equal(result.handoff.pages[0].events.length, 4);
  assert.equal(new Set(result.handoff.pages[0].events.map(event => event.id)).size, 4);
  assert.ok(result.report.errors.some(error => error.code === 'excluded_event_types'));
});
test('changed or overlapping snapshots and other routes cannot be added to the same account in either order', t => {
  const fixture = scenario();
  const first = convertSnapshot(fixture.manifest, fixture.read);
  const dir = temp(t);
  importResult(dir, first.handoff);
  const before = stored(dir).records;
  const checkpoints = stored(dir).checkpoints;
  mutateShard(fixture, 2, native => { native.messages.push(structuredClone(native.messages[0])); });
  const changed = convertSnapshot(fixture.manifest, fixture.read);
  assert.notEqual(changed.report.snapshot, first.report.snapshot);
  assert.equal(importResult(dir, changed.handoff).manifest.sources[0].error.code, 'snapshot_conflict');
  assert.deepEqual(stored(dir).records, before);
  assert.deepEqual(stored(dir).checkpoints, checkpoints);
  assert.equal(importResult(dir, first.handoff, 'other-route').manifest.sources[0].error.code, 'snapshot_conflict');
  const reverse = temp(t);
  importResult(reverse, first.handoff, 'other-route');
  assert.equal(importResult(reverse, first.handoff).manifest.sources[0].error.code, 'snapshot_conflict');
});
test('interruption, digest mismatch, missing shard numbers and truncated/encrypted history stay visibly partial', () => {
  const fixture = scenario();
  fixture.manifest.history = { truncated: true, encryptedHistory: 'omitted' };
  fixture.files.delete(fixture.manifest.shards[2].path);
  const interrupted = convertSnapshot(fixture.manifest, fixture.read);
  assert.equal(interrupted.report.convertedShards, 2);
  assert.equal(interrupted.handoff.pages[0].events.length, 2);
  for (const code of ['truncated_history', 'encrypted_history_omitted', 'shard_unreadable']) {
    assert.ok(interrupted.report.errors.some(error => error.code === code));
  }
  assert.ok(!JSON.stringify(interrupted).includes('SYNTHETIC PRIVATE PATH'));
  const restored = scenario();
  assert.equal(convertSnapshot(restored.manifest, restored.read).report.convertedShards, 3);
  fixture.files.set(fixture.manifest.shards[1].path, Buffer.from('{}'));
  assert.ok(convertSnapshot(fixture.manifest, fixture.read).report.errors.some(error => error.code === 'shard_digest_mismatch'));
  const gap = scenario();
  const shard = gap.manifest.shards[2];
  const bytes = gap.files.get(shard.path);
  shard.path = shard.path.replace('message_2', 'message_3');
  gap.files.set(shard.path, bytes);
  assert.ok(convertSnapshot(gap.manifest, gap.read).report.errors.some(error => error.code === 'missing_shards'));
});
test('shared overlap reviews do not bypass the Messenger immutable snapshot gate', t => {
  const fixture = scenario(), dir = temp(t);
  const first = convertSnapshot(fixture.manifest, fixture.read);
  importResult(dir, first.handoff);
  const before = stored(dir).records;
  mutateShard(fixture, 0, native => { native.title = 'Changed synthetic packaging'; });
  const changed = convertSnapshot(fixture.manifest, fixture.read);
  const review = { revision: 'fixture-messenger-overlap', reviewedAt: at,
    basis: 'Synthetic candidate translation; route gate remains enforced.',
    mappings: [{ source: 'messenger', account: first.handoff.account, connector: first.handoff.connector,
      type: 'event', id: changed.handoff.pages[0].events[0].id, targetId: first.handoff.pages[0].events[0].id }] };
  const result = importResult(dir, changed.handoff, changed.handoff.connector, review);
  assert.equal(result.manifest.sources[0].error.code, 'snapshot_conflict');
  assert.deepEqual(stored(dir).records, before);
});
test('retrying interrupted conversion into the same store adds only missing events, not duplicate messages', t => {
  const fixture = scenario(), dir = temp(t);
  const shard = fixture.manifest.shards[2], saved = fixture.files.get(shard.path);
  fixture.files.delete(shard.path);
  const interrupted = convertSnapshot(fixture.manifest, fixture.read);
  importResult(dir, interrupted.handoff);
  fixture.files.set(shard.path, saved);
  const retried = convertSnapshot(fixture.manifest, fixture.read);
  assert.equal(retried.report.snapshot, interrupted.report.snapshot);
  assert.equal(importResult(dir, retried.handoff).manifest.sources[0].status, 'partial');
  assert.equal(Object.values(stored(dir).records).filter(row => row.record.type === 'event').length, 3);
  mutateShard(fixture, 2, native => { native.participants.pop(); });
  const conflict = convertSnapshot(fixture.manifest, fixture.read);
  assert.ok(conflict.report.errors.some(error => error.code === 'shard_roster_conflict'));
  assert.equal(conflict.report.convertedShards, 2);
});
test('unsupported profiles/layouts and encrypted backup wrappers never become successful empty handoffs', () => {
  for (const change of [
    manifest => { manifest.profile = 'meta-v1'; },
    manifest => { manifest.layout = 'encrypted-backup'; },
    manifest => { manifest.shards[0].path = 'messages/inbox/direct/../../outside.json'; }
  ]) {
    const fixture = scenario();
    change(fixture.manifest);
    const result = convertSnapshot(fixture.manifest, () => assert.fail('must not read unsupported paths'));
    assert.equal(result.report.status, 'unsupported');
    assert.equal(result.handoff, null);
    assert.equal(result.exitCode, 2);
  }
  const fixture = scenario();
  for (let index = 0; index < 3; index++) mutateShard(fixture, index, native => {
    for (const key of Object.keys(native)) delete native[key];
    native.encrypted_backup = 'SYNTHETIC RAW DATA';
  });
  const result = convertSnapshot(fixture.manifest, fixture.read);
  assert.equal(result.report.status, 'unsupported');
  assert.equal(result.handoff, null);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC RAW DATA'));
});
test('unknown layouts, timestamps, roster conflicts and unresolved senders roll back the entire shard', () => {
  for (const change of [
    native => { native.messages.push({ ...native.messages[0], timestamp_ms: '1795435200123' }); },
    native => { native.messages[0].timestamp_ms = 1.5; },
    native => { native.messages[0].timestamp_ms = Date.parse(at) + 1; },
    native => { native.messages[0].sender_name = 'Unmapped departed sender'; },
    native => { native.participants[1].name = native.participants[0].name; },
    native => { native.thread_path = 'inbox/other'; },
    native => { native.thread_type = 'Unknown'; },
    native => { native.messages[0].unknown_payload = 'DO NOT RETAIN'; }
  ]) {
    const fixture = scenario();
    mutateShard(fixture, 0, change);
    const result = convertSnapshot(fixture.manifest, fixture.read);
    assert.equal(result.report.convertedShards, 2);
    assert.equal(result.handoff.pages[0].events.length, 2);
    assert.ok(result.report.errors.length > 3);
    assert.ok(!JSON.stringify(result).includes('DO NOT RETAIN'));
  }
});
test('reviewed departed group sender survives without inferred membership; duplicate-name/self ambiguity fails before reads', () => {
  const fixture = scenario();
  fixture.manifest.threads[1].identities.push({ slot: 'departed', name: 'Departed Fixture', isSelf: false });
  mutateShard(fixture, 1, native => { native.messages[0].sender_name = 'Departed Fixture'; });
  const result = convertSnapshot(fixture.manifest, fixture.read);
  const page = result.handoff.pages[0];
  const departed = page.identities.find(identity => identity.displayName === 'Departed Fixture');
  assert.equal(page.events.filter(event => event.senderId === departed.id).length, 1);
  assert.ok(!page.memberships.some(item => item.identityId === departed.id));
  for (const change of [
    manifest => { manifest.threads[0].identities[1].name = 'Fixture Self'; },
    manifest => { manifest.threads[0].identities[1].isSelf = true; },
    manifest => { manifest.threads[0].identities[0].isSelf = false; }
  ]) {
    const broken = scenario();
    change(broken.manifest);
    assert.throws(() => convertSnapshot(broken.manifest, () => assert.fail('must not read')), { code: 'identity_mapping' });
  }
});
test('CLI persists only private synthetic projection, refuses overwrite/private runs, and sanitizes fatal errors', t => {
  const dir = temp(t), fixture = scenario();
  for (const [relative, bytes] of fixture.files) {
    const file = path.join(dir, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  const request = { manifest: fixture.manifest, inputRoot: '.', output: 'converted' };
  const file = path.join(dir, 'request.json');
  const cli = () => spawnSync(process.execPath, [path.join(__dirname, 'messenger.cjs'), '--synthetic-request', file], { encoding: 'utf8' });
  fs.writeFileSync(file, JSON.stringify(request));
  const converted = cli();
  assert.equal(converted.status, 2, converted.stderr);
  assert.match(converted.stdout, /Heartbeat synthetic Messenger conversion: partial/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'converted')).sort(), ['handoff.json', 'report.json']);
  const handoff = fs.readFileSync(path.join(dir, 'converted', 'handoff.json'), 'utf8');
  assert.ok(!handoff.includes('SYNTHETIC BODY'));
  assert.equal(cli().status, 1);
  request.manifest.dataClass = 'private';
  request.inputRoot = 'SYNTHETIC SECRET MUST NOT READ';
  request.output = 'private-disabled';
  fs.writeFileSync(file, JSON.stringify(request));
  const rejected = cli();
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /private_conversion_disabled/);
  assert.ok(!rejected.stderr.includes('SYNTHETIC SECRET'));
  assert.ok(!fs.existsSync(path.join(dir, request.output)));
  request.manifest = scenario().manifest;
  request.output = path.join(__dirname, 'unsafe-output');
  assert.throws(() => runRequest(request, dir), { code: 'unsafe_output' });
});
test('redirected export directories are not followed; malformed JSON and empty snapshots stay explicit', t => {
  const dir = temp(t), fixture = scenario();
  const actual = path.join(dir, 'actual');
  fs.mkdirSync(actual);
  const redirected = path.join(dir, 'redirected');
  fs.symlinkSync(actual, redirected, 'junction');
  const request = { manifest: fixture.manifest, inputRoot: redirected, output: 'redirect-rejected' };
  const result = runRequest(request, dir);
  assert.equal(result.report.status, 'unsupported');
  assert.ok(result.report.errors.some(error => error.code === 'redirected_input'));
  assert.ok(!fs.existsSync(path.join(dir, request.output, 'handoff.json')));
  const broken = scenario();
  const shard = broken.manifest.shards[0], invalid = Buffer.from('{"messages":[');
  broken.files.set(shard.path, invalid);
  shard.sha256 = digest(invalid);
  assert.ok(convertSnapshot(broken.manifest, broken.read).report.errors.some(error => error.code === 'invalid_shard_json'));
  const empty = scenario();
  for (let index = 0; index < 3; index++) mutateShard(empty, index, native => { native.messages = []; });
  const converted = convertSnapshot(empty.manifest, empty.read);
  assert.equal(converted.report.status, 'partial');
  assert.deepEqual(converted.handoff.pages[0].events, []);
  assert.equal(converted.handoff.coverage.completeness, 'unknown');
});
test('trusted OS aliases above inputRoot are allowed without permitting redirected export descendants', t => {
  const dir = temp(t), fixture = scenario();
  const parent = path.join(dir, 'real-parent'), root = path.join(parent, 'export');
  for (const [relative, bytes] of fixture.files) {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  const alias = path.join(dir, 'alias-parent');
  fs.symlinkSync(parent, alias, 'junction');
  const result = runRequest({ manifest: fixture.manifest, inputRoot: path.join(alias, 'export'),
    output: 'allowed-ancestor-alias' }, dir);
  assert.equal(result.report.convertedShards, 3);
  assert.equal(result.handoff.pages[0].events.length, 3);
  const redirected = path.join(dir, 'redirected-descendant');
  fs.mkdirSync(redirected);
  fs.symlinkSync(path.join(root, 'messages'), path.join(redirected, 'messages'), 'junction');
  const rejected = runRequest({ manifest: fixture.manifest, inputRoot: redirected,
    output: 'rejected-descendant-alias' }, dir);
  assert.equal(rejected.report.status, 'unsupported');
  assert.ok(rejected.report.errors.some(error => error.code === 'redirected_input'));
  assert.equal(rejected.handoff, null);
});
