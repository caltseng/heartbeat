import type { RecordEntry } from './types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireEmail, fixtureTransport, runFixture } from './email.ts';
import { collect } from './collect.ts';
import { readCollection } from './collection-store.ts';

const at = '2026-11-24T20:00:00.000Z';
interface NativeMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  historyId?: string;
  payload?: { headers: { name: string; value: string }[] };
  errorStatus?: number;
}
interface NativePage {
  pageToken: string | null;
  response: {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
    errorStatus?: number;
  };
}
function scenario() {
  const config = {
    schemaVersion: 1, dataClass: 'synthetic', provider: 'gmail', account: 'fixture-email',
    selfAddresses: ['self@example.invalid'],
    period: { preset: 'custom', timeZone: 'UTC', asOf: at,
      start: '2026-11-01T00:00:00Z', end: at },
    maxPages: 10, pageSize: 100, interpersonalIds: ['direct', 'multi'],
    reviewedThreads: [
      { id: 'thread-direct', kind: 'direct', addresses: ['self@example.invalid', 'peer@example.invalid'] },
      { id: 'thread-multi', kind: 'group', addresses: ['self@example.invalid', 'peer@example.invalid', 'other@example.invalid'] },
      { id: 'thread-list', kind: 'broadcast', addresses: ['self@example.invalid', 'list@example.invalid'] }
    ]
  };
  function message(id, from, recipients, extra = []) {
    return { id, threadId: `thread-${id}`, labelIds: ['INBOX'], internalDate: '1795521600000',
      historyId: 'native-history-90', payload: { headers: [
        { name: 'From', value: from },
        { name: 'Date', value: 'Mon, 23 Nov 2026 12:00:00 +0000' }, ...recipients, ...extra
      ] } };
  }
  const to = { name: 'To', value: 'self@example.invalid' };
  const details: Record<string, NativeMessage> = {
    direct: message('direct', '"Peer, Synthetic" <peer@example.invalid>', [to]),
    multi: message('multi', 'self@example.invalid', [
      { name: 'To', value: 'Team: "Peer, Example" <peer@example.invalid>;' },
      { name: 'Cc', value: 'Other <other@example.invalid>' },
      { name: 'Bcc', value: 'visible@example.invalid' }
    ]),
    list: message('list', 'list@example.invalid', [to], [{ name: 'List-Id', value: 'Synthetic list <list.example.invalid>' }]),
    bulk: message('bulk', 'bulk@example.invalid', [to], [{ name: 'Precedence', value: 'bulk' }]),
    auto: message('auto', 'robot@example.invalid', [to], [{ name: 'Auto-Submitted', value: 'auto-generated' }]),
    unknown: message('unknown', 'peer@example.invalid', [])
  };
  const listed = ids => ids.map(id => ({ id, threadId: details[id].threadId }));
  const fixture: { schemaVersion: number; dataClass: string; retrievedAt: string; pages: NativePage[]; details: Record<string, NativeMessage> } = { schemaVersion: 1, dataClass: 'synthetic', retrievedAt: at,
    pages: [
      { pageToken: null, response: { messages: listed(['direct', 'multi']), nextPageToken: 'gmail-native-page-2', resultSizeEstimate: 1 } },
      { pageToken: 'gmail-native-page-2', response: { messages: listed(['direct', 'list', 'bulk', 'auto', 'unknown']) } }
    ], details };
  return { config, fixture };
}
function folder(t) {
  const result = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-email-synthetic-'));
  t.after(() => fs.rmSync(result, { recursive: true, force: true }));
  return result;
}
function write(dir, name, value) { fs.writeFileSync(path.join(dir, name), JSON.stringify(value)); }
function importResult(dir, handoff) {
  write(dir, 'handoff.json', handoff);
  return collect({ schemaVersion: 1, dataClass: 'synthetic', period: scenario().config.period,
    output: path.join(dir, 'store'), sources: [{ source: 'email', account: handoff.account,
      connector: handoff.connector, mode: 'metadata-import', input: 'handoff.json' }] }, dir);
}
test('native pages normalize one event per message, preserve roles/classes, and import/replay as partial', async t => {
  const { config, fixture } = scenario();
  const calls = [], base = fixtureTransport(fixture);
  const result = await acquireEmail(config, {
    ...base,
    list: async request => { calls.push(request); return base.list(request); },
    get: async request => {
      assert.equal(request.format, 'metadata');
      assert.equal(request.fields, 'id,threadId,labelIds,historyId,internalDate,payload(headers)');
      assert.deepEqual(request.metadataHeaders, ['From', 'To', 'Cc', 'Bcc', 'Date', 'List-Id', 'Precedence', 'Auto-Submitted']);
      return base.get(request);
    }
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(request => request.includeSpamTrash === true && !('q' in request) && !('labelIds' in request)));
  assert.equal(calls[1].pageToken, 'gmail-native-page-2');
  const events = result.handoff.pages[0].events;
  assert.equal(events.length, 6);
  assert.deepEqual(events.map(event => event.classification), ['interpersonal', 'interpersonal', 'bulk', 'bulk', 'automated', 'unclassified']);
  assert.deepEqual(events.find(event => event.id === 'multi').recipients.map(item => item.role).sort(), ['bcc', 'cc', 'to']);
  assert.deepEqual(result.handoff.pages[0].threads.map(thread => thread.kind), ['direct', 'group', 'broadcast', 'unknown', 'unknown', 'unknown']);
  assert.equal(result.checkpoint.nativeCursor.domain, 'gmail.messages.list');
  assert.equal(result.report.paginationComplete, true);
  assert.equal(result.handoff.coverage.completeness, 'partial');
  assert.equal(result.handoff.pages[0].nextCursor, null);
  assert.ok(!JSON.stringify(result.handoff).includes('native-history'));
  const dir = folder(t);
  assert.equal(importResult(dir, result.handoff).exitCode, 2);
  assert.equal(importResult(dir, result.handoff).exitCode, 2);
  const stored = readCollection(path.join(dir, 'store', 'collection.json')).value;
  assert.equal(Object.values<RecordEntry>(stored.records).filter(row => row.record.type === 'event').length, 6);
});
test('budget cursor resumes independently of a terminal immutable handoff and binds account/period/policy', async () => {
  const { config, fixture } = scenario();
  config.maxPages = 1;
  const first = await acquireEmail(config, fixtureTransport(fixture));
  assert.equal(first.checkpoint.nativeCursor.nextPageToken, 'gmail-native-page-2');
  assert.equal(first.handoff.pages[0].nextCursor, null);
  assert.equal(first.handoff.pages[0].events.length, 2);
  assert.equal(first.report.errors[0].code, 'page_budget');
  config.maxPages = 5;
  const second = await acquireEmail(config, fixtureTransport(fixture), first.checkpoint);
  assert.equal(second.handoff.pages[0].events.length, 6);
  assert.equal(second.report.paginationComplete, true);
  assert.equal(first.checkpoint.messages.length, 2);
  const reordered: Record<string, unknown> = Object.fromEntries(Object.entries(config).reverse());
  reordered.period = Object.fromEntries(Object.entries(config.period).reverse());
  assert.equal((await acquireEmail(reordered, fixtureTransport(fixture), first.checkpoint)).report.paginationComplete, true);
  for (const changed of [{ ...config, account: 'other' }, { ...config, selfAddresses: [...config.selfAddresses, 'alias@example.invalid'] },
    { ...config, period: { ...config.period, start: '2026-11-02T00:00:00Z' } }]) {
    await assert.rejects(acquireEmail(changed, fixtureTransport(fixture), first.checkpoint), { code: 'checkpoint_mismatch' });
  }
  const history = structuredClone(first.checkpoint);
  history.nativeCursor.domain = 'gmail.history.list';
  await assert.rejects(acquireEmail(config, fixtureTransport(fixture), history), { code: 'checkpoint_mismatch' });
});
test('same-page duplicate indexes preserve order and discard all additions on conflict before retry', async () => {
  const { config, fixture } = scenario();
  const listed = fixture.pages[0].response.messages[0];
  fixture.pages = [{ pageToken: null, response: { messages: [listed, listed,
    fixture.pages[0].response.messages[1]] } }];
  const base = fixtureTransport(fixture);
  const first = await acquireEmail(config, base);
  assert.deepEqual(first.checkpoint.messages.map(row => row.id), ['direct', 'multi']);
  let reads = 0;
  const failed = await acquireEmail(config, { ...base, get: async request => {
    const message = await base.get(request);
    if (++reads === 2) message.payload.headers[1].value = '23 Nov 2026 13:00:00 +0000';
    return message;
  } });
  assert.deepEqual(failed.report.errors, [{ code: 'record_conflict', retryable: false }]);
  assert.deepEqual(failed.checkpoint.messages, []);
  assert.deepEqual(failed.checkpoint.pageTokens, []);
  assert.equal(failed.checkpoint.nativeCursor.nextPageToken, null);
  const retried = await acquireEmail(config, base, failed.checkpoint);
  assert.deepEqual(retried, first);
});

test('single-page synthetic imports preserve 2000 and 4000 ordered events across growing direct rosters', async t => {
  const template = scenario(), original = template.fixture.details.direct;
  for (const count of [2000, 4000]) {
    const { config, fixture } = scenario();
    config.interpersonalIds = [];
    config.reviewedThreads = [];
    fixture.details = {};
    fixture.pages = [{ pageToken: null, response: { messages: [] } }];
    for (let i = 0; i < count; i++) {
      const id = `message-${i}`, threadId = `thread-${Math.floor(i / 40)}`;
      const peer = `peer-${Math.floor(i / 40)}@example.invalid`;
      config.interpersonalIds.push(id);
      if (i % 40 === 0) config.reviewedThreads.push({ id: threadId, kind: 'direct',
        addresses: ['self@example.invalid', peer] });
      fixture.pages[0].response.messages.push({ id, threadId });
      const message = structuredClone(original);
      Object.assign(message, { id, threadId });
      message.payload.headers[0].value = peer;
      fixture.details[id] = message;
    }
    const dir = folder(t), started = performance.now();
    const result = await acquireEmail(config, fixtureTransport(fixture));
    const imported = importResult(dir, result.handoff);
    t.diagnostic(`${count} events acquired and persisted in ${(performance.now() - started).toFixed(0)} ms`);
    assert.equal(imported.exitCode, 2);
    assert.deepEqual(result.checkpoint.messages.map(row => row.id), config.interpersonalIds);
    assert.ok(result.checkpoint.messages.every(row => row.classification === 'interpersonal'));
    assert.equal(result.handoff.pages[0].threads.length, count / 40);
    assert.equal(result.handoff.pages[0].memberships.length, count / 20);
    const stored = readCollection(imported.file).value;
    const rows = Object.values<RecordEntry>(stored.records).filter(row => row.record.type === 'event');
    assert.equal(rows.length, count);
    assert.deepEqual(rows.map(row => row.provenance[0].originalId), config.interpersonalIds);
    assert.ok(rows.every(row => row.record.recipients[0].role === 'to' &&
      row.provenance[0].context.threadKind === 'direct'));
  }
});

test('401/403 explicitly require setup and never manufacture a successful empty source', async t => {
  for (const status of [401, 403]) {
    const { config, fixture } = scenario();
    fixture.pages[0].response = { errorStatus: status };
    const result = await acquireEmail(config, fixtureTransport(fixture));
    assert.equal(result.report.status, 'requires_setup');
    assert.equal(result.exitCode, 2);
    assert.equal(result.checkpoint.nativeCursor.finished, false);
    assert.equal(result.handoff.pages[0].events.length, 0);
    assert.equal(importResult(folder(t), result.handoff).exitCode, 2);
    // An initial failed-page checkpoint remains retryable.
    const retry = await acquireEmail(config, fixtureTransport(scenario().fixture), result.checkpoint);
    assert.equal(retry.handoff.pages[0].events.length, 6);
  }
});
test('auth, expired tokens, transient failures and detail disappearance retain only committed native pages', async () => {
  for (const [status, code, retryable] of [
    [401, 'requires_setup', false], [400, 'cursor_expired', false],
    [429, 'rate_limited', true], [503, 'upstream_unavailable', true]
  ] as const) {
    const { config, fixture } = scenario();
    fixture.pages[1].response = { errorStatus: status };
    const result = await acquireEmail(config, fixtureTransport(fixture));
    assert.equal(result.checkpoint.messages.length, 2);
    assert.equal(result.checkpoint.nativeCursor.nextPageToken, 'gmail-native-page-2');
    assert.deepEqual(result.report.errors, [{ code, retryable }]);
    assert.equal(result.report.resyncRequired, status === 400);
    assert.equal(result.report.status, 'partial');
  }
  const { config, fixture } = scenario();
  fixture.details.list = { errorStatus: 404 };
  const result = await acquireEmail(config, fixtureTransport(fixture));
  assert.equal(result.checkpoint.messages.length, 2);
  assert.equal(result.report.errors[0].code, 'message_unavailable');
  const recovered = await acquireEmail(config, fixtureTransport(scenario().fixture), result.checkpoint);
  assert.equal(recovered.handoff.pages[0].events.length, 6);
  assert.equal(recovered.report.paginationComplete, true);
  fixture.details.list = { errorStatus: 400 };
  const invalidDetail = await acquireEmail(config, fixtureTransport(fixture));
  assert.equal(invalidDetail.report.errors[0].code, 'metadata_incomplete');
  assert.equal(invalidDetail.report.resyncRequired, false);
});
test('unexpected content, ambiguous sender/date and malformed recipients fail a whole page without cursor advancement', async () => {
  for (const mutate of [
    message => { message.snippet = 'must never be persisted'; },
    message => { message.payload.body = { data: 'must never be persisted' }; },
    message => { message.payload.headers.push({ name: 'Subject', value: 'must never be persisted' }); },
    message => { message.payload.headers[0].value = 'a@example.invalid, b@example.invalid'; },
    message => { message.payload.headers[0].value = '"Unclosed <peer@example.invalid>'; },
    message => { message.payload.headers[1].value = '31 Nov 2026 12:00:00 +0000'; },
    message => { message.payload.headers[1].value = '23 Nov 2026 12:00:00 -0000'; },
    message => { message.payload.headers[1].value = '25 Nov 2026 12:00:00 +0000'; },
    message => { message.payload.headers.push({ name: 'Date', value: '23 Nov 2026 12:00:00 +0000' }); },
    message => { message.payload.headers.push({ name: 'To', value: 'invalid address' }); }
  ]) {
    const { config, fixture } = scenario();
    mutate(fixture.details.multi);
    const result = await acquireEmail(config, fixtureTransport(fixture));
    assert.equal(result.checkpoint.messages.length, 0);
    assert.equal(result.checkpoint.nativeCursor.nextPageToken, null);
    assert.equal(result.checkpoint.nativeCursor.finished, false);
    assert.equal(result.report.errors[0].code, 'metadata_incomplete');
    assert.ok(!JSON.stringify(result).includes('must never be persisted'));
  }
});
test('draft exclusions and local half-open sent-date filtering do not stop enumeration or use internalDate', async () => {
  const { config, fixture } = scenario();
  fixture.details.direct.labelIds.push('DRAFT');
  fixture.details.direct.payload.headers = [];
  fixture.details.multi.payload.headers[1].value = '24 Nov 2026 20:00:00 +0000';
  fixture.details.bulk.payload.headers[1].value = '01 Nov 2026 00:00:00 +0000';
  fixture.details.auto.payload.headers[1].value = '31 Oct 2026 12:00:00 +0000';
  const result = await acquireEmail(config, fixtureTransport(fixture));
  assert.deepEqual(result.handoff.pages[0].events.map(event => event.id), ['list', 'bulk', 'unknown']);
  assert.equal(result.report.persistedSourcePages, 2);
});
test('unknown roster and conflicting classifiers remain unknown/unclassified; aliases are not inferred', async () => {
  const { config, fixture } = scenario();
  config.reviewedThreads = [];
  config.interpersonalIds = [];
  fixture.details.direct.payload.headers.push({ name: 'Auto-Submitted', value: 'auto-generated' }, { name: 'Precedence', value: 'bulk' });
  fixture.details.multi.payload.headers[0].value = 'alias@example.invalid';
  const result = await acquireEmail(config, fixtureTransport(fixture));
  assert.ok(result.handoff.pages[0].threads.every(thread => thread.kind === 'unknown'));
  assert.equal(result.handoff.pages[0].events[0].classification, 'unclassified');
  assert.equal(result.handoff.pages[0].identities.find(item => item.id === 'alias@example.invalid').isSelf, false);
});
test('a purported direct thread with an observed outsider rolls back the native page visibly', async () => {
  const { config, fixture } = scenario();
  fixture.details.direct.payload.headers.push({ name: 'Cc', value: 'outsider@example.invalid' });
  const result = await acquireEmail(config, fixtureTransport(fixture));
  assert.equal(result.report.errors[0].code, 'reviewed_roster_conflict');
  assert.equal(result.checkpoint.messages.length, 0);
  assert.equal(result.checkpoint.nativeCursor.finished, false);
  assert.equal(result.checkpoint.nativeCursor.nextPageToken, null);
});
test('cycles, conflicting duplicate messages and unrecognized transports fail explicitly', async () => {
  const { config, fixture } = scenario();
  fixture.pages[1].response.nextPageToken = 'gmail-native-page-2';
  let result = await acquireEmail(config, fixtureTransport(fixture));
  assert.equal(result.report.errors[0].code, 'pagination_cycle');
  assert.equal(result.checkpoint.messages.length, 2);
  const acrossRuns = scenario();
  acrossRuns.config.maxPages = 1;
  acrossRuns.fixture.pages[1].response.nextPageToken = 'third';
  acrossRuns.fixture.pages.push({ pageToken: 'third', response: { nextPageToken: 'gmail-native-page-2' } });
  let continuation = await acquireEmail(acrossRuns.config, fixtureTransport(acrossRuns.fixture));
  continuation = await acquireEmail(acrossRuns.config, fixtureTransport(acrossRuns.fixture), continuation.checkpoint);
  continuation = await acquireEmail(acrossRuns.config, fixtureTransport(acrossRuns.fixture), continuation.checkpoint);
  assert.equal(continuation.report.errors[0].code, 'pagination_cycle');
  assert.equal(continuation.checkpoint.nativeCursor.nextPageToken, 'third');
  const fresh = scenario();
  const base = fixtureTransport(fresh.fixture);
  let directReads = 0;
  result = await acquireEmail(fresh.config, { ...base, get: async request => {
    const message = await base.get(request);
    if (request.id === 'direct' && directReads++ > 0) message.payload.headers[1].value = '23 Nov 2026 13:00:00 +0000';
    return message;
  } });
  assert.equal(result.report.errors[0].code, 'record_conflict');
  assert.equal(result.checkpoint.messages.length, 2);
  await assert.rejects(acquireEmail(config, { list: async () => { throw new Error('private upstream text'); } }), { code: 'transport_failure' });
});
test('synthetic-only boundary and saved-record allowlist cannot be bypassed through checkpoint input', async () => {
  const { config, fixture } = scenario();
  await assert.rejects(acquireEmail({ ...config, dataClass: 'private' }, fixtureTransport(fixture)), { code: 'private_collection_disabled' });
  assert.throws(() => fixtureTransport({ ...fixture, dataClass: 'private' }), { code: 'private_collection_disabled' });
  await assert.rejects(acquireEmail({ ...config, provider: 'other' }, fixtureTransport(fixture)), { code: 'unsupported_provider' });
  const first = await acquireEmail(config, fixtureTransport(fixture));
  Object.assign(first.checkpoint.messages[0], { body: 'rejected private field' });
  await assert.rejects(acquireEmail(config, fixtureTransport(fixture), first.checkpoint), { code: 'metadata_incomplete' });
});
test('terminal empty enumeration stays partial and does not trigger a repeat native scan on resume', async t => {
  const { config, fixture } = scenario();
  fixture.pages[0].response = { resultSizeEstimate: 0 };
  const result = await acquireEmail(config, fixtureTransport(fixture));
  assert.equal(result.report.paginationComplete, true);
  assert.equal(result.handoff.coverage.completeness, 'partial');
  assert.equal(importResult(folder(t), result.handoff).exitCode, 2);
  const replay = await acquireEmail(config, { list: () => assert.fail('must not enumerate a finished checkpoint') }, result.checkpoint);
  assert.equal(replay.handoff.pages[0].events.length, 0);
});
test('CLI publishes an immutable handoff/checkpoint pair, resumes to a fresh directory, and returns nonzero', async t => {
  const dir = folder(t), { config, fixture } = scenario();
  config.maxPages = 1;
  write(dir, 'fixture.json', fixture);
  const request: { config: typeof config; fixture: string; output: string; previous?: string } = { config, fixture: 'fixture.json', output: 'first' };
  write(dir, 'request.json', request);
  const cli = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'email.ts'), '--synthetic-request', path.join(dir, 'request.json')], { encoding: 'utf8' });
  assert.equal(cli.status, 2, cli.stderr);
  const saved = fs.readFileSync(path.join(dir, 'first', 'handoff.json'), 'utf8');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'first')).sort(),
    ['checkpoint.json', 'handoff.json', 'report.json', 'request.synthetic.json']);
  const importerRequest = JSON.parse(fs.readFileSync(path.join(dir, 'first', 'request.synthetic.json'), 'utf8'));
  assert.equal(collect(importerRequest, path.join(dir, 'first')).exitCode, 2);
  assert.equal(JSON.parse(saved).pages[0].events.length, 2);
  await assert.rejects(runFixture(request, dir), { code: 'output_exists' });
  request.previous = path.join('first', 'checkpoint.json');
  request.output = 'second';
  await runFixture(request, dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'second', 'handoff.json'), 'utf8')).pages[0].events.length, 6);
  assert.equal(fs.readFileSync(path.join(dir, 'first', 'handoff.json'), 'utf8'), saved);
  assert.equal(importResult(dir, JSON.parse(fs.readFileSync(path.join(dir, 'second', 'handoff.json'), 'utf8'))).exitCode, 2);
  request.output = path.join(__dirname, 'unsafe-synthetic-output');
  await assert.rejects(runFixture(request, dir), { code: 'unsafe_output' });
  const privateRequest = { config: { ...config, dataClass: 'private' },
    fixture: 'nonexistent-fixture.json', previous: 'nonexistent-checkpoint.json', output: 'private-output-must-not-exist' };
  await assert.rejects(runFixture(privateRequest, dir), { code: 'private_collection_disabled' });
  write(dir, 'request.json', privateRequest);
  const invalid = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'email.ts'), '--synthetic-request', path.join(dir, 'request.json')], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /private_collection_disabled/);
  assert.equal(fs.existsSync(path.join(dir, privateRequest.output)), false);
});
test('failed filesystem publication leaves neither an advanced output checkpoint nor a partial handoff', async t => {
  const dir = folder(t), { config, fixture } = scenario();
  write(dir, 'fixture.json', fixture);
  const original = fs.renameSync;
  const stub = t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('synthetic disk failure'), { code: 'EIO' }); });
  await assert.rejects(runFixture({ config, fixture: 'fixture.json', output: 'failed' }, dir), { code: 'EIO' });
  stub.mock.restore();
  assert.equal(fs.renameSync, original);
  assert.deepEqual(fs.readdirSync(dir), ['fixture.json']);
});
