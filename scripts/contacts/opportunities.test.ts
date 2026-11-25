import type { Connection } from './types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { collect } from './collect.ts';
import { handoff } from './demo.ts';
import { review } from './identity-review.ts';
import { curate } from './curated.ts';
import { run } from './opportunities.ts';

const asOf = '2027-02-26T00:00:00Z';
const baselinePeriod: import('./collect.ts').PeriodRequest = { preset: 'custom', timeZone: 'UTC', asOf,
  start: '2027-01-01T00:00:00Z', end: '2027-01-29T00:00:00Z' };
const currentPeriod = { ...baselinePeriod, start: baselinePeriod.end, end: asOf };
const key = (type, id) => JSON.stringify(['email', 'fixture-account', type, id]);
function fixture(t, change: (source: import('./types.ts').Handoff, request: import('./types.ts').CollectionRequest) => void = () => {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-opportunities-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const source = handoff('email', 'email');
  source.coverage = { start: '2026-12-01T00:00:00Z', end: asOf, completeness: 'complete',
    basis: 'Synthetic complete history for comparison.' };
  const page = source.pages[0];
  page.retrievedAt = asOf;
  page.identities = ['self', 'peer', 'group-peer', 'idle'].map(id =>
    ({ id, idKind: 'provider', isSelf: id === 'self', displayName: `Synthetic ${id}` }));
  page.threads = ['direct', 'group', 'old'].map(id => ({
    id, idKind: 'local', kind: id === 'group' ? 'group' : 'direct'
  }));
  page.memberships = ['self', 'peer'].map(identityId => ({ threadId: 'direct', identityId }))
    .concat(['self', 'idle'].map(identityId => ({ threadId: 'old', identityId })),
      ['self', 'peer', 'group-peer'].map(identityId => ({ threadId: 'group', identityId })));
  const event = (id, timestamp, extra = {}) => ({ id, idKind: 'local', eventType: 'message',
    timestamp, channel: 'email', threadId: 'direct', senderId: 'peer',
    recipients: [{ identityId: 'self', role: 'to' }], classification: 'interpersonal', ...extra });
  page.events = [
    ...Array.from({ length: 8 }, (_, i) => event(`baseline-${i}`, `2027-01-0${2 + Math.floor(i / 2)}T0${i % 2}:00:00Z`)),
    ...Array.from({ length: 4 }, (_, i) => event(`current-${i}`, `2027-02-0${i + 1}T00:00:00Z`)),
    ...Array.from({ length: 12 }, (_, i) => event(`group-${i}`, `2027-01-0${2 + i % 4}T02:00:00Z`,
      { threadId: 'group', senderId: 'group-peer' })),
    event('old-contact', '2026-12-15T00:00:00Z', { threadId: 'old', senderId: 'idle' }),
    event('end-boundary', asOf)
  ];
  const collectRequest: import('./types.ts').CollectionRequest = { schemaVersion: 1, dataClass: 'synthetic', output: 'store',
    period: { ...baselinePeriod, start: source.coverage.start, end: asOf },
    sources: [{ source: source.source, account: source.account, connector: source.connector,
      mode: 'metadata-import', input: 'input.json' }] };
  change(source, collectRequest);
  fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(source));
  const collection = collect(collectRequest, folder);
  const identityRequest = { schemaVersion: 1, dataClass: 'synthetic', collection: collection.file,
    output: 'mapping', reason: 'Synthetic reviewed households.', operations: [] };
  const applyMapping = operations => {
    const inspection = review(identityRequest, folder, true);
    return review({ ...identityRequest, operations, expectedRevision: inspection.revision,
      collectionDigest: inspection.collectionDigest }, folder);
  };
  applyMapping([]);
  const assignments = review(identityRequest, folder, true).view.assignments;
  const peer = assignments[key('identity', 'peer')], idle = assignments[key('identity', 'idle')];
  applyMapping([{ type: 'household', id: 'household-peer', label: 'Synthetic peer', people: [peer] },
    { type: 'household', id: 'household-idle', label: 'Synthetic idle', people: [idle] }]);
  const curatedRequest = { schemaVersion: 1, dataClass: 'synthetic', collection: collection.file,
    mapping: 'mapping', output: 'curated', reason: 'Explicit synthetic preference.' };
  const inspected = curate(curatedRequest, folder, true);
  curate({ ...curatedRequest, expectedRevision: inspected.revision, mappingDigest: inspected.mappingDigest,
    operations: [
      { type: 'connection', id: 'confirmed', occurredOn: '2027-01-29', households: ['household-peer'],
        people: [], groupId: null, noteIds: [], context: 'Synthetic explicit confirmation.' },
      { type: 'connection', id: 'future', occurredOn: '2027-03-01', households: ['household-peer'],
        people: [], groupId: null, noteIds: [], context: 'Synthetic future date must not reset clock.' },
      { type: 'rhythm', household: 'household-peer', intervalDays: 28, reason: 'Synthetic chosen interval.' },
      { type: 'rhythm', household: 'household-idle', intervalDays: 60, reason: 'Different chosen interval.' }
    ] }, folder);
  const curatedFile = path.join(folder, 'curated', 'curated.json');
  const saved = JSON.parse(fs.readFileSync(curatedFile, 'utf8'));
  for (const connection of Object.values<Connection>(saved.records.connections)) {
    connection.capturedAt = '2026-12-01T00:00:00.000Z';
  }
  fs.writeFileSync(curatedFile, JSON.stringify(saved));
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection: collection.file,
    mapping: 'mapping', curated: 'curated', identityMappingRevision: 2,
    baselinePeriod, currentPeriod, channels: ['email'], output: 'opportunities' };
  let count = 0;
  const build = (extra = {}) => {
    const result = run({ ...request, output: `opportunities-${count++}`, ...extra }, folder);
    return JSON.parse(fs.readFileSync(result.file, 'utf8'));
  };
  return { folder, request, build, peer, idle, collection: collection.file,
    group: assignments[key('identity', 'group-peer')] };
}
test('covered own-baseline decline and due rhythm are distinct, explained, immutable and not frequency rankings', t => {
  const f = fixture(t);
  const files = [f.collection, path.join(f.folder, 'mapping', 'identity-review.json'),
    path.join(f.folder, 'curated', 'curated.json')];
  const before = files.map(file => fs.readFileSync(file));
  const report = f.build();
  assert.equal(report.context.exitCode, 0);
  const peer = report.people.find(row => row.personId === f.peer);
  assert.equal(peer.signal, 'covered_direct_decline');
  assert.equal(peer.baseline.messages.total, 8);
  assert.equal(peer.baseline.activeDays, 4);
  assert.equal(peer.current.messages.total, 4);
  assert.equal(peer.currentToBaselineRatio, 0.5);
  assert.equal(peer.lastObservedDirectContact, '2027-02-04T00:00:00.000Z');
  assert.match(peer.reason, /8 to 4/);
  assert.equal(report.people.find(row => row.personId === f.group).signal, null);
  const idle = report.people.find(row => row.personId === f.idle);
  assert.equal(idle.signal, null);
  assert.equal(idle.lastObservedDirectContact, '2026-12-15T00:00:00.000Z');
  assert.ok(idle.coverage.suppressionReasons.includes('insufficient_person_baseline'));
  const rhythm = report.rhythms.find(row => row.householdId === 'household-peer');
  assert.equal(rhythm.state, 'due');
  assert.equal(rhythm.lastConfirmedConnection, '2027-01-29');
  assert.equal(rhythm.dueOn, '2027-02-26');
  assert.deepEqual(rhythm.connectionIds, ['confirmed']);
  assert.equal(rhythm.lastObservedDirectContact, peer.lastObservedDirectContact);
  assert.equal(report.rhythms.find(row => row.householdId === 'household-idle').state, 'unknown');
  assert.equal(report.evidence.baseline.events.filter(row => row.disposition === 'included')
    .flatMap(row => row.personAttributions).filter(row => row.personId === f.peer && row.kind.startsWith('direct-')).length, 8);
  assert.deepEqual(f.build(), report);
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]));
});
test('partial, unavailable, mismatched period coverage and unrepresented channels cannot produce decline', t => {
  for (const change of [
    source => { source.coverage.completeness = 'partial'; },
    source => { source.coverage.start = baselinePeriod.end; },
    source => { source.coverage.end = baselinePeriod.end; },
    (source, request) => request.sources.push({ source: 'messenger', account: 'fixture-unavailable',
      connector: 'none', mode: 'unavailable', status: 'requires_setup', reason: 'Synthetic auth-limited source.' })
  ]) {
    const f = fixture(t, change), report = f.build();
    assert.equal(report.context.exitCode, 2);
    assert.ok(report.people.every(row => row.signal === null));
    assert.ok(report.people.every(row => row.coverage.suppressionReasons.includes('incomplete_or_uncertain_coverage')));
    assert.equal(report.rhythms.find(row => row.householdId === 'household-peer').state, 'due');
  }
  const f = fixture(t), absent = f.build({ channels: ['email', 'whatsapp'] });
  assert.equal(absent.context.exitCode, 2);
  assert.ok(absent.people.every(row => row.signal === null));
  assert.ok(absent.people.every(row => row.coverage.suppressionReasons.includes('incomplete_or_uncertain_coverage')));
});
test('minimum baseline days, counts, ratio and window thresholds have real boundaries', t => {
  for (const change of [
    source => { source.pages[0].events = source.pages[0].events.filter(row => row.id !== 'baseline-7'); },
    source => { source.pages[0].events.filter(row => row.id.startsWith('baseline-'))
      .forEach(row => { row.timestamp = '2027-01-02T00:00:00Z'; }); },
    source => { source.pages[0].events.push({ ...source.pages[0].events.find(row => row.id === 'current-0'),
      id: 'current-extra' }); }
  ]) {
    const f = fixture(t, change);
    assert.equal(f.build().people.find(row => row.personId === f.peer).signal, null);
  }
  const f = fixture(t);
  const short = f.build({ baselinePeriod: { ...baselinePeriod, start: '2027-01-15T00:00:00Z' },
    currentPeriod: { ...currentPeriod, end: '2027-02-12T00:00:00Z' } });
  assert.ok(short.people.every(row => row.coverage.suppressionReasons.includes('insufficient_window')));
  assert.throws(() => f.build({ currentPeriod: { ...currentPeriod, start: '2027-01-30T00:00:00Z' } }), /adjacent/);
  assert.throws(() => f.build({ currentPeriod: { ...currentPeriod, timeZone: 'America/Los_Angeles' } }), /same zone/);
  assert.throws(() => f.build({ identityMappingRevision: 1 }), /same current mapping/);
  const zero = fixture(t, source => {
    source.pages[0].events = source.pages[0].events.filter(row => !row.id.startsWith('current-'));
  });
  const silent = zero.build().people.find(row => row.personId === zero.peer);
  assert.equal(silent.current.messages.total, 0);
  assert.equal(silent.signal, 'covered_direct_decline');
  assert.equal(silent.lastObservedDirectContact, '2027-01-05T01:00:00.000Z');
});
test('rhythms use civil dates across DST, exclude late captures and never infer unknown dates', t => {
  const f = fixture(t);
  const file = path.join(f.folder, 'curated', 'curated.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.records.connections.confirmed.occurredOn = '2026-10-31';
  state.records.connections.confirmed.capturedAt = '2026-11-25T00:00:00.000Z';
  state.records.rhythms['household-peer'].intervalDays = 1;
  fs.writeFileSync(file, JSON.stringify(state));
  const report = f.build({
    baselinePeriod: { ...baselinePeriod, timeZone: 'America/Los_Angeles',
      start: '2026-10-29T08:00:00Z', end: '2026-10-30T08:00:00Z', asOf: '2026-11-01T08:00:00Z' },
    currentPeriod: { ...currentPeriod, timeZone: 'America/Los_Angeles',
      start: '2026-10-30T08:00:00Z', end: '2026-10-31T08:00:00Z', asOf: '2026-11-01T08:00:00Z' }
  });
  // The fixture capture is later than this historical asOf.
  assert.equal(report.rhythms.find(row => row.householdId === 'household-peer').state, 'unknown');
  state.records.connections.confirmed.capturedAt = '2026-10-31T07:00:00.000Z';
  fs.writeFileSync(file, JSON.stringify(state));
  const dst = f.build({
    baselinePeriod: { ...baselinePeriod, timeZone: 'America/Los_Angeles',
      start: '2026-10-04T08:00:00Z', end: '2026-11-01T08:00:00Z', asOf: '2026-11-29T08:00:00Z' },
    currentPeriod: { ...currentPeriod, timeZone: 'America/Los_Angeles',
      start: '2026-11-01T08:00:00Z', end: '2026-11-29T08:00:00Z', asOf: '2026-11-29T08:00:00Z' }
  });
  const rhythm = dst.rhythms.find(row => row.householdId === 'household-peer');
  assert.equal(rhythm.dueOn, '2026-11-01');
  assert.equal(rhythm.elapsedDays, 29);
  assert.equal(rhythm.state, 'due');
  state.records.rhythms['household-peer'].intervalDays = null;
  fs.writeFileSync(file, JSON.stringify(state));
  assert.equal(f.build().rhythms.find(row => row.householdId === 'household-peer').state, 'unset');
});
test('actual CLI 0/2/1, private denial before reads, unsafe output and immutable publication', t => {
  const f = fixture(t);
  const requestFile = path.join(f.folder, 'request.json');
  const cli = request => {
    fs.writeFileSync(requestFile, JSON.stringify(request));
    return spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, path.join(__dirname, 'opportunities.ts'), '--request', requestFile],
      { encoding: 'utf8', cwd: f.folder });
  };
  const success = cli(f.request);
  assert.equal(success.status, 0, success.stderr);
  const reportFile = path.join(f.folder, f.request.output, 'report.json');
  const before = fs.readFileSync(reportFile);
  assert.equal(cli(f.request).status, 1);
  assert.deepEqual(fs.readFileSync(reportFile), before);
  const partial = fixture(t, source => { source.coverage.completeness = 'partial'; });
  assert.equal(cli({ ...partial.request, mapping: path.join(partial.folder, 'mapping'),
    curated: path.join(partial.folder, 'curated'), output: 'partial' }).status, 2);
  const denied = cli({ ...f.request, dataClass: 'private', collection: 'must-not-read',
    mapping: 'must-not-read', curated: 'must-not-read', output: 'must-not-create' });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /private_collection_disabled/);
  assert.doesNotMatch(denied.stderr + denied.stdout, /must-not/);
  assert.equal(fs.existsSync(path.join(f.folder, 'must-not-create')), false);
  assert.throws(() => run({ ...f.request, output: path.resolve(__dirname, '..', '..', 'public') }, f.folder),
    error => error instanceof Error && 'code' in error && error.code === 'unsafe_output');
});
