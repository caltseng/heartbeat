const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readCollection } = require('./collection-store.cjs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { acquire, run, CONNECTOR, ENDPOINT, PARAMETERS } = require('./google.cjs');
const { collect } = require('./collect.cjs');

const now = '2026-11-24T20:00:00.000Z';
const options = { account: 'fixture-google', dataClass: 'synthetic' };
const person = (id = 'a', displayName = 'Fixture Peer') => ({
  resourceName: `people/${id}`, etag: `fixture-etag-${id}`,
  metadata: { sources: [{ type: 'CONTACT', id: `fixture-source-${id}` }] },
  names: [{ displayName, metadata: { primary: true } }],
  emailAddresses: [{ value: `${id}@example.invalid` }]
});
const page = (connections, extra = {}) => ({ status: 200, body: { connections, ...extra } });
const terminal = (connections = [], sync = 'fixture-sync') => page(connections, { nextSyncToken: sync });
function mock(responses) {
  const calls = [];
  return { calls, transport: async request => {
    calls.push(request);
    assert.ok(responses.length, 'unexpected extra request');
    return responses.shift();
  } };
}
async function cycle(responses, extra = {}, config = options) {
  const transport = mock(responses);
  const result = await acquire(config, { ...transport, now, delay: async () => {}, ...extra });
  return { ...result, calls: transport.calls };
}
function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'google-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const configFile = path.join(folder, 'config.json');
  const fixtureFile = path.join(folder, 'pages.json');
  const output = path.join(folder, 'acquisition');
  const config = { schemaVersion: 1, ...options, output, fixture: 'pages.json' };
  const write = responses => {
    fs.writeFileSync(configFile, JSON.stringify(config));
    fs.writeFileSync(fixtureFile, JSON.stringify({ dataClass: 'synthetic', responses }));
  };
  const saved = () => JSON.parse(fs.readFileSync(path.join(output, 'google-acquisition.json')));
  return { folder, configFile, output, config, write, saved };
}
function importHandoff(folder, handoff, output = path.join(folder, 'collection')) {
  fs.writeFileSync(path.join(folder, 'handoff.json'), JSON.stringify(handoff));
  return collect({ schemaVersion: 1, dataClass: 'synthetic', output,
    period: { preset: '7d', timeZone: 'UTC', asOf: now },
    sources: [{ source: 'google-contacts', account: options.account, connector: CONNECTOR,
      mode: 'metadata-import', input: 'handoff.json' }] }, folder);
}

test('selected endpoint paginates fixed fields, deduplicates IDs, projects metadata and imports no activity', async t => {
  const f = fixture(t);
  const a = person();
  a.biographies = [{ value: 'discard-native-note' }];
  a.metadata.sources[0].profileMetadata = { secret: 'discard-native-source' };
  const result = await cycle([page([a], { nextPageToken: 'fixture-page-2' }), terminal([a, person('b')])]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.pages, 2);
  assert.equal(result.report.duplicates, 1);
  assert.equal(result.handoff.pages[0].identities.length, 2);
  assert.deepEqual(result.handoff.pages[0].identities.map(value => value.displayName), ['Fixture Peer', 'Fixture Peer']);
  assert.deepEqual(result.calls, [
    { url: ENDPOINT, parameters: PARAMETERS },
    { url: ENDPOINT, parameters: { ...PARAMETERS, pageToken: 'fixture-page-2' } }
  ]);
  assert.ok(!JSON.stringify(result).includes('discard-native'));
  assert.ok(!JSON.stringify(result.handoff).includes('fixture-sync'));
  assert.equal(result.state.current['people/a'].evidence.sources[0].id, 'fixture-source-a');
  const imported = importHandoff(f.folder, result.handoff);
  assert.equal(imported.exitCode, 0);
  const store = readCollection(imported.file).value;
  assert.equal(Object.keys(store.records).length, 2);
  assert.ok(Object.values(store.records).every(value => value.record.type === 'identity'));
  assert.ok(Object.values(store.records).every(value => value.provenance[0].inputDigest.length === 64));
  assert.equal(importHandoff(f.folder, result.handoff).exitCode, 0);
});

test('incremental pagination binds one sync token; expiry discards staged pages and safely resyncs', async () => {
  const first = await cycle([terminal([person()], 'fixture-sync-1')]);
  const sync = await cycle([page([person('b')], { nextPageToken: 'fixture-page' }),
    terminal([person('c')], 'fixture-sync-2')], { previous: first.state });
  assert.deepEqual(sync.calls.map(call => call.parameters.syncToken), ['fixture-sync-1', 'fixture-sync-1']);
  assert.equal(sync.state.fullSyncedAt, first.state.fullSyncedAt);
  assert.equal(sync.state.syncToken, 'fixture-sync-2');
  assert.equal(Object.keys(sync.state.current).length, 3);
  const recovered = await cycle([page([person('discarded')], { nextPageToken: 'expired-page' }),
    { status: 410, body: { error: { status: 'EXPIRED_SYNC_TOKEN' } } },
    terminal([person()], 'fixture-resynced')], { previous: first.state });
  assert.equal(recovered.report.resynced, true);
  assert.equal(recovered.exitCode, 0);
  assert.equal(recovered.calls[2].parameters.syncToken, undefined);
  assert.equal(recovered.calls[2].parameters.pageToken, undefined);
  assert.deepEqual(Object.keys(recovered.state.current), ['people/a']);
  assert.equal(first.state.syncToken, 'fixture-sync-1');
  const expiredByTime = await cycle([terminal([person()])],
    { previous: first.state, now: '2026-12-01T20:00:00.000Z' });
  assert.equal(expiredByTime.calls[0].parameters.syncToken, undefined);
  assert.equal(expiredByTime.report.resynced, true);
});

test('changed profiles, aliases, tombstones and full-snapshot absence stay partial without touching curated files', async t => {
  const f = fixture(t);
  const curated = path.join(f.folder, 'curated.json');
  const curatedBytes = JSON.stringify({ notes: [{ id: 'fixture-note', text: 'Synthetic curated note' }],
    mappings: { 'people/a': 'fixture-canonical' } });
  fs.writeFileSync(curated, curatedBytes);
  const first = await cycle([terminal([person(), person('b'), person('c')])]);
  const imported = importHandoff(f.folder, first.handoff);
  const before = readCollection(imported.file).value.records;
  const alias = person('d');
  alias.metadata.previousResourceNames = ['people/old-d'];
  const next = await cycle([terminal([person('a', 'Changed fixture'),
    { resourceName: 'people/b', metadata: { deleted: true } }, alias, person('e')])],
  { previous: first.state });
  assert.equal(next.exitCode, 2);
  assert.deepEqual(next.report.reconciliation.map(value => value.reason).sort(),
    ['identity_revision_unsupported', 'resource_alias_review', 'source_tombstone']);
  assert.deepEqual(next.handoff.pages[0].identities.map(value => value.id), ['people/c', 'people/e']);
  assert.equal(importHandoff(f.folder, next.handoff).exitCode, 2);
  const after = readCollection(imported.file).value.records;
  for (const [id, row] of Object.entries(before)) assert.deepEqual(after[id].record, row.record);
  assert.equal(fs.readFileSync(curated, 'utf8'), curatedBytes);
  const replay = await cycle([terminal()], { previous: next.state });
  assert.equal(replay.report.status, 'partial', 'pending revision cannot disappear on a zero-change sync');
  assert.equal(replay.handoff.pages[0].identities.some(value => value.id === 'people/a'), false);
  const aliasesOmitted = await cycle([terminal([person('a'), person('b'), person('d')])], { previous: replay.state });
  assert.equal(aliasesOmitted.report.status, 'partial', 'later payloads cannot silently clear prior review evidence');
  assert.deepEqual(aliasesOmitted.handoff.pages[0].identities.map(value => value.id), ['people/c', 'people/e']);
  assert.deepEqual(aliasesOmitted.state.pending['people/d'].observations[0].evidence.previousResourceNames,
    ['people/old-d']);
  const full = await cycle([{ status: 410 }, terminal([person('a')])], { previous: first.state });
  assert.equal(full.report.status, 'partial');
  assert.deepEqual(full.report.reconciliation.map(value => value.reason),
    ['full_snapshot_absence', 'full_snapshot_absence']);
  assert.equal(fs.readFileSync(curated, 'utf8'), curatedBytes);
});

test('interruption, malformed terminal pages, budgets and conflicts never advance a last-good generation', async () => {
  const first = await cycle([terminal([person()])]);
  const badPages = [
    [page([person('b')], { nextPageToken: 'fixture-more' }), { status: 503 }],
    [{ status: 410 }, { status: 503 }, { status: 503 }, { status: 503 }],
    [page([], {})],
    [page([], { nextSyncToken: 'fixture-sync', nextPageToken: 'fixture-more' })],
    [page([], { nextPageToken: 'loop' }), page([], { nextPageToken: 'loop' })],
    [terminal([person(), person('a', 'Conflicting fixture')])],
    [terminal([{ resourceName: 'people/b', metadata: { sources: [{}] } }])]
  ];
  for (const responses of badPages) {
    const result = await cycle(responses, { previous: first.state });
    assert.equal(result.exitCode, 2);
    assert.equal(result.report.status, 'failed');
    assert.equal(result.handoff, null);
    assert.deepEqual(result.state, first.state);
    assert.equal(result.report.stale, true);
    assert.equal(result.report.coverage.completeness, 'unknown');
  }
  const budget = await cycle([page([person('b')], { nextPageToken: 'fixture-more' })],
    { previous: first.state }, { ...options, maxPages: 1 });
  assert.equal(budget.report.errors[0].code, 'page_budget_exhausted');
  assert.deepEqual(budget.state, first.state);
  const replay = await cycle([terminal([person('b')])], { previous: budget.state });
  assert.equal(replay.exitCode, 0);
  assert.equal(Object.keys(replay.state.current).length, 2);
});

test('missing authorization and private runs are explicit; auth/quota failures are bounded and sanitized', async () => {
  const missing = await acquire(options, { now });
  assert.equal(missing.report.status, 'requires_setup');
  assert.equal(missing.exitCode, 2);
  assert.equal(missing.handoff, null);
  await assert.rejects(acquire({ ...options, dataClass: 'private' },
    { now, transport: () => { assert.fail('private transport must never run'); } }),
  { code: 'private_collection_disabled' });
  for (const status of [401, 403]) {
    const result = await cycle([{ status, body: { token: 'fixture-do-not-log' } }]);
    assert.equal(result.report.status, 'requires_setup');
    assert.ok(!JSON.stringify(result).includes('fixture-do-not-log'));
  }
  const waits = [];
  const quota = await cycle([{ status: 429 }, { status: 429 }, { status: 429 }],
    { delay: async ms => waits.push(ms) });
  assert.equal(quota.calls.length, 3);
  assert.deepEqual(waits, [50, 100]);
  assert.deepEqual(quota.report.errors, [{ code: 'quota_exhausted', retryable: true }]);
  const recovered = await cycle([{ status: 503 }, terminal()]);
  assert.equal(recovered.exitCode, 0);
  const thrown = await acquire(options, { now, transport: () => { throw new Error('fixture-secret'); } });
  assert.equal(thrown.report.errors[0].code, 'transport_failed');
  assert.ok(!JSON.stringify(thrown).includes('fixture-secret'));
});

test('empty full snapshots, zero-change syncs, primary names, self flags and address limits retain their meaning', async () => {
  const empty = await cycle([terminal()]);
  assert.equal(empty.handoff.pages[0].identities.length, 0);
  assert.equal(empty.report.coverage.completeness, 'complete');
  const a = person();
  a.names.unshift({ displayName: 'Not primary' });
  a.phoneNumbers = [{ value: '+1-fixture' }, { value: '+1-fixture' }];
  const first = await cycle([terminal([a])], {}, { ...options, selfIds: ['people/a'] });
  assert.equal(first.handoff.pages[0].identities[0].displayName, 'Fixture Peer');
  assert.equal(first.handoff.pages[0].identities[0].isSelf, true);
  assert.equal(first.handoff.pages[0].identities[0].addresses.length, 2);
  const zeroChanges = await cycle([terminal()], { previous: first.state }, { ...options, selfIds: ['people/a'] });
  assert.equal(zeroChanges.handoff.pages[0].identities.length, 1);
  const limited = person();
  limited.emailAddresses = Array.from({ length: 100 }, (_, index) => ({ value: `fixture-${index}@example.invalid` }));
  const partial = await cycle([terminal([limited])]);
  assert.equal(partial.exitCode, 2);
  assert.equal(partial.handoff.coverage.completeness, 'partial');
  assert.equal(partial.report.errors[0].code, 'address_field_limit');
});

test('checkpoint bindings reject account, data class, self identity or route changes before transport', async () => {
  const first = await cycle([terminal([person()])]);
  for (const changed of [{ ...options, account: 'other-fixture' },
    { ...options, selfIds: ['people/a'] }]) {
    await assert.rejects(acquire(changed, { previous: first.state, now,
      transport: () => assert.fail('mismatched checkpoint must not call transport') }),
    { code: 'checkpoint_mismatch' });
  }
  const tampered = structuredClone(first.state);
  tampered.binding.parameters.pageSize = 1000;
  await assert.rejects(acquire(options, { previous: tampered, now }), { code: 'checkpoint_mismatch' });
  const differentClass = structuredClone(first.state);
  differentClass.binding.dataClass = 'private';
  await assert.rejects(acquire(options, { previous: differentClass, now }), { code: 'checkpoint_mismatch' });
});

test('synthetic CLI persists handoffs in a private folder; errors preserve last good state and handoff pointer', async t => {
  const f = fixture(t);
  f.write([terminal([person()])]);
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'google.cjs'), '--config', f.configFile], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(!cli.stdout.includes(options.account));
  const first = f.saved();
  const handoff = JSON.parse(fs.readFileSync(path.join(f.output, first.handoffFile)));
  assert.equal(importHandoff(f.folder, handoff).exitCode, 0);
  f.write([{ status: 401, body: { message: 'fixture-secret' } }]);
  const unauthorized = spawnSync(process.execPath, [path.join(__dirname, 'google.cjs'), '--config', f.configFile], { encoding: 'utf8' });
  assert.equal(unauthorized.status, 2);
  assert.ok(!unauthorized.stdout.includes('fixture-secret'));
  assert.deepEqual(f.saved().state, first.state);
  assert.equal(f.saved().handoffFile, first.handoffFile);
  assert.ok(fs.existsSync(path.join(f.output, first.handoffFile)));
  delete f.config.fixture;
  f.write([]);
  const missing = await run(f.configFile);
  assert.equal(missing.report.status, 'requires_setup');
  assert.equal(missing.report.errors[0].code, 'authorized_transport_unavailable');
  assert.deepEqual(f.saved().state, first.state);
  assert.equal(f.saved().handoffFile, first.handoffFile);
  f.config.fixture = 'pages.json';
  f.write([{ status: 503 }, { status: 503 }, { status: 503 }]);
  const unavailable = await run(f.configFile);
  assert.equal(unavailable.report.errors[0].code, 'upstream_unavailable');
  assert.equal(f.saved().handoffFile, first.handoffFile);
  assert.deepEqual(f.saved().state, first.state);
  f.write([terminal([person('b')])]);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (path.basename(to) === 'google-acquisition.json') throw Object.assign(new Error('fixture-write-failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(run(f.configFile), { code: 'EIO' });
  assert.deepEqual(f.saved().state, first.state);
  assert.equal(fs.existsSync(path.join(f.output, 'google-acquisition.lock')), false);
  assert.ok(!fs.readdirSync(f.output).some(file => file.endsWith('.tmp')));
});

test('CLI disables private collection before output resolution, directory creation, fixture or checkpoint reads', async t => {
  const f = fixture(t);
  f.config.dataClass = 'private';
  f.config.fixture = 'missing-private-fixture.json';
  f.write([]);
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'google.cjs'), '--config', f.configFile], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.match(cli.stderr, /private_collection_disabled/);
  assert.equal(fs.existsSync(f.output), false);
  f.config.output = path.join(__dirname, '..', '..', 'docs', 'fixture-forbidden');
  f.write([]);
  await assert.rejects(run(f.configFile), { code: 'private_collection_disabled' });
});

test('CLI rejects public configuration/output, concurrent writers and invalid configuration without leaking input', async t => {
  const f = fixture(t);
  f.write([terminal()]);
  fs.mkdirSync(f.output);
  fs.writeFileSync(path.join(f.output, 'google-acquisition.lock'), 'fixture-lock');
  await assert.rejects(run(f.configFile), { code: 'store_locked' });
  fs.unlinkSync(path.join(f.output, 'google-acquisition.lock'));
  f.config.output = path.join(__dirname, '..', '..', 'docs', 'fixture-forbidden');
  f.write([terminal()]);
  await assert.rejects(run(f.configFile), { code: 'unsafe_output' });
  await assert.rejects(run(path.join(__dirname, '..', '..', 'package.json')), { code: 'unsafe_output' });
  f.config.output = f.output;
  f.config.accessToken = 'fixture-do-not-print';
  f.write([terminal()]);
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'google.cjs'), '--config', f.configFile], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.ok(!cli.stderr.includes('fixture-do-not-print'));
});
