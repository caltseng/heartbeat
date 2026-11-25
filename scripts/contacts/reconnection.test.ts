import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collect } from './collect.ts';
import { handoff, period } from './demo.ts';
import { review } from './identity-review.ts';
import { curate } from './curated.ts';
import { prayer } from './prayer.ts';
import { reconnection } from './reconnection.ts';
import { readCollection } from './collection-store.ts';

function fixture(t, kind = 'direct') {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'contacts-reconnection-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const source = handoff('email', 'email');
  source.pages[0].threads[0].kind = kind;
  fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(source));
  const collection = collect({ schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: [{ source: 'email', account: source.account, connector: source.connector, mode: 'metadata-import', input: 'input.json' }]
  }, folder).file;
  const mapping = { schemaVersion: 1, dataClass: 'synthetic', collection, output: 'mapping', reason: 'Synthetic review' };
  function applyMapping(operations) {
    const current = review(mapping, folder, true);
    return review({ ...mapping, expectedRevision: current.revision, collectionDigest: current.collectionDigest, operations }, folder);
  }
  applyMapping([]);
  const person = Object.keys(review(mapping, folder, true).view.people)[0];
  applyMapping([
    { type: 'household', id: 'household-a', label: 'Synthetic A', people: [person] },
    { type: 'household', id: 'household-b', label: 'Synthetic B', people: [] },
    { type: 'household', id: 'household-c', label: 'Synthetic C', people: [] }
  ]);
  const curation = { schemaVersion: 1, dataClass: 'synthetic', collection, mapping: 'mapping', output: 'curated', reason: 'Synthetic records' };
  function applyNotes(operations) {
    const current = curate(curation, folder, true);
    return curate({ ...curation, expectedRevision: current.revision, mappingDigest: current.mappingDigest, operations }, folder);
  }
  const original = '  Synthetic commitment: ask about the decision.\r\nKeep the original.  ';
  applyNotes([
    { type: 'note', id: 'note-a', originalText: original, encounteredOn: '2026-10-25', households: ['household-a'], people: [person] },
    { type: 'note', id: 'note-b', originalText: 'Synthetic upcoming appointment', encounteredOn: null, households: ['household-b'], people: [] },
    { type: 'connection', id: 'connection-a', occurredOn: '2026-10-25', households: ['household-a'], people: [person],
      groupId: null, noteIds: ['note-a'], context: 'Explicit synthetic meaningful connection' },
    { type: 'rhythm', household: 'household-a', intervalDays: 30, reason: 'Individually chosen synthetic rhythm' },
    { type: 'rhythm', household: 'household-b', intervalDays: 90, reason: 'Different synthetic preference' }
  ]);
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection, mapping: 'mapping', curated: 'curated',
    output: path.join('curated', 'reconnection'), period, reason: 'Explicit synthetic weekly review' };
  const inspect = (extra = {}) => reconnection({ ...request, ...extra }, folder);
  function apply(operations) {
    const current = inspect();
    return reconnection({ ...request, expectedRevision: current.revision, evidenceDigest: current.evidenceDigest, operations }, folder, '--request');
  }
  const followup = { type: 'followup', id: 'followup-a', householdId: 'household-a',
    text: 'Ask about the synthetic decision', noteIds: ['note-a'], dueOn: '2026-11-24' };
  return { folder, collection, mapping, person, curation, original, request, inspect, apply, applyNotes, applyMapping, followup,
    file: path.join(folder, 'curated', 'reconnection', 'reconnection.json') };
}

test('review explains exact due boundary, confirmed versus observed dates, unknowns, threads and limits', t => {
  const f = fixture(t);
  let result = f.inspect({ limit: 1 });
  assert.equal(fs.existsSync(path.dirname(f.file)), false);
  assert.equal(result.heading, 'Heartbeat weekly reconnection review');
  assert.equal(result.reviewOn, '2026-11-24');
  assert.equal(result.candidateCount, 3);
  assert.equal(result.remaining.length, 2);
  const row = result.recommendations[0];
  assert.equal(row.householdId, 'household-a');
  assert.equal(row.lastConfirmedConnection, '2026-10-25');
  assert.equal(row.elapsedCalendarDays, 30);
  assert.equal(row.reasons[0].code, 'curated_rhythm_due');
  assert.deepEqual(row.reasons[0].connectionIds, ['connection-a']);
  assert.equal(row.originalNotes['note-a'].originalText, f.original);
  assert.equal(row.nextAction.type, 'existing_thread');
  assert.equal(row.nextAction.sourceThreadId, 'thread-1');
  assert.equal(row.nextAction.url, null);
  assert.equal(row.nextAction.eventKeys.length, 1);
  assert.match(row.nextAction.instruction, /manually/);
  assert.equal(result.remaining[0].lastConfirmedConnection, null);
  assert.equal(result.remaining[0].nextAction.type, 'review_context');
  assert.equal(result.prayer.status, 'not_provided');
  result = f.inspect({ period: { ...period, asOf: '2026-11-23T20:00:00Z' } });
  assert.equal(result.recommendations.some(row => row.householdId === 'household-a'), false);
  f.applyNotes([{ type: 'connection', id: 'future', occurredOn: '2027-01-01', households: ['household-a'],
    people: [], groupId: null, noteIds: [], context: 'Synthetic future record, not a confirmed past connection' }]);
  assert.equal(f.inspect().recommendations[0].lastConfirmedConnection, '2026-10-25');
});

test('follow-up completion, deferral expiry and explicit saved links preserve all upstream bytes and rhythms', t => {
  const f = fixture(t);
  const originals = [f.collection, path.join(f.folder, 'mapping', 'identity-review.json'), path.join(f.folder, 'curated', 'curated.json')];
  const bytes = originals.map(file => fs.readFileSync(file));
  const threadKey = f.inspect().recommendations[0].nextAction.threadKey;
  let result = f.apply([f.followup, { type: 'followup', id: 'followup-b', householdId: 'household-b',
    text: 'Synthetic explicit commitment', noteIds: ['note-b'], dueOn: '2026-11-20' },
  { type: 'thread-link', threadKey, url: 'https://example.invalid/synthetic/thread-1' }]);
  assert.deepEqual(result.recommendations.map(row => row.householdId), ['household-a', 'household-b', 'household-c']);
  assert.equal(result.recommendations[0].reasons[0].code, 'followup_due');
  assert.equal(result.recommendations[0].nextAction.url, 'https://example.invalid/synthetic/thread-1');
  result = f.apply([{ type: 'complete', id: 'followup-a', completedOn: '2026-11-24' },
    { type: 'defer', householdId: 'household-a', until: '2026-12-01', reason: 'Explicit synthetic snooze' }]);
  assert.equal(result.recommendations[0].householdId, 'household-b');
  assert.equal(result.deferred[0].householdId, 'household-a');
  assert.equal(result.deferred[0].followups.length, 0);
  assert.equal(result.deferred[0].lastConfirmedConnection, '2026-10-25');
  assert.equal(result.deferred[0].rhythm.intervalDays, 30);
  result = f.inspect({ period: { ...period, asOf: '2026-12-01T20:00:00Z' } });
  assert.equal(result.deferred.length, 0);
  assert.equal(result.recommendations.some(row => row.householdId === 'household-a'), true);
  originals.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), bytes[index]));
  const current = f.inspect();
  const published = reconnection({ ...f.request, expectedRevision: current.revision, evidenceDigest: current.evidenceDigest },
    f.folder, '--report');
  assert.ok('reportFile' in published && typeof published.reportFile === 'string');
  assert.deepEqual(JSON.parse(fs.readFileSync(published.reportFile, 'utf8')).recommendations, current.recommendations);
  assert.throws(() => reconnection({ ...f.request, expectedRevision: current.revision, evidenceDigest: current.evidenceDigest }, f.folder, '--report'), { code: 'EEXIST' });
});

test('prayer context is original-note grounded with ambiguous status explicit and group posts labeled', t => {
  const f = fixture(t, 'group');
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection: f.collection, mapping: 'mapping',
    curated: 'curated', output: path.join('curated', 'prayer'), reason: 'Synthetic prayer evidence' };
  const current = prayer(request, f.folder, true);
  prayer({ ...request, expectedRevision: current.revision, curatedDigest: current.curatedDigest, operations: [
    { type: 'request', id: 'prayer-a', text: 'Synthetic request', noteIds: ['note-a'], recordedOn: null }
  ] }, f.folder);
  const result = f.inspect({ prayer: request.output });
  assert.equal(result.recommendations[0].prayerRequests[0].status, 'unknown');
  assert.equal(result.recommendations[0].prayerRequests[0].needsStatusReview, true);
  assert.equal(result.recommendations[0].prayerRequests[0].originalNotes['note-a'].originalText, f.original);
  assert.equal(result.recommendations[0].nextAction.kind, 'group');
  const prayerCurrent = prayer(request, f.folder, true);
  prayer({ ...request, expectedRevision: prayerCurrent.revision, curatedDigest: prayerCurrent.curatedDigest, operations: [
    { type: 'update', id: 'resolved', requestId: 'prayer-a', text: 'Explicit synthetic resolution',
      noteIds: ['note-a'], status: 'resolved', statusConfirmed: true }
  ] }, f.folder);
  assert.equal(f.inspect({ prayer: request.output }).recommendations[0].prayerRequests.length, 0);
  const snapshot = readCollection(f.collection).value;
  const eventKey = Object.keys(snapshot.records).find(key => JSON.parse(key)[2] === 'event');
  snapshot.reconciliation.records[eventKey].record.senderKey = JSON.stringify(['email', 'fixture-account', 'identity', 'self']);
  fs.writeFileSync(f.collection, JSON.stringify(snapshot));
  f.applyMapping([]);
  const passive = f.inspect();
  assert.equal(passive.recommendations[0].nextAction.type, 'review_context');
  assert.equal(passive.recommendations[0].observedActivity.threads.length, 0);
});

test('calendar-day rhythm and deferral boundaries honor the selected zone across DST and UTC midnight', t => {
  const f = fixture(t);
  f.applyNotes([
    { type: 'connection', id: 'dst-connection', occurredOn: '2026-10-31', households: ['household-a'],
      people: [], groupId: null, noteIds: [], context: 'Synthetic pre-DST connection' },
    { type: 'rhythm', household: 'household-a', intervalDays: 2, reason: 'Synthetic calendar-day boundary' }
  ]);
  let result = f.inspect({ period: { ...period, asOf: '2026-11-02T07:30:00Z' } });
  assert.equal(result.reviewOn, '2026-11-01');
  assert.equal(result.recommendations.some(row => row.householdId === 'household-a'), false);
  result = f.inspect({ period: { ...period, asOf: '2026-11-02T08:30:00Z' } });
  assert.equal(result.reviewOn, '2026-11-02');
  assert.equal(result.recommendations[0].elapsedCalendarDays, 2);
  assert.equal(result.recommendations[0].reasons[0].code, 'curated_rhythm_due');
});

test('tombstoned or missing threads never offer an actionable existing conversation or saved link', t => {
  const f = fixture(t);
  const threadKey = f.inspect().recommendations[0].nextAction.threadKey;
  f.apply([{ type: 'thread-link', threadKey, url: 'https://example.invalid/synthetic/thread' }]);
  const collection = readCollection(f.collection).value;
  collection.reconciliation.records[threadKey].record.deleted = true;
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  f.applyMapping([]);
  let row = f.inspect().recommendations[0];
  assert.equal(row.nextAction.type, 'review_context');
  assert.equal(row.nextAction.url, null);
  assert.throws(() => f.apply([{ type: 'thread-link', threadKey, url: 'https://example.invalid/another' }]));
  delete collection.reconciliation.records[threadKey];
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  f.applyMapping([]);
  row = f.inspect().recommendations[0];
  assert.equal(row.nextAction.type, 'review_context');
});

test('invalid operations, stale evidence/revision and write failure roll back without upstream changes', t => {
  const f = fixture(t);
  f.apply([f.followup]);
  const stale = { ...f.request, expectedRevision: f.inspect().revision, evidenceDigest: f.inspect().evidenceDigest,
    operations: [{ type: 'complete', id: 'followup-a', completedOn: '2026-11-24' }] };
  f.apply([{ type: 'defer', householdId: 'household-b', until: '2026-11-30', reason: 'Synthetic' }]);
  assert.throws(() => reconnection(stale, f.folder, '--request'), { code: 'revision_conflict' });
  stale.expectedRevision = f.inspect().revision;
  f.applyNotes([{ type: 'note', id: 'new-evidence', originalText: 'Synthetic new note', encounteredOn: null, households: ['household-a'], people: [] }]);
  assert.throws(() => reconnection(stale, f.folder, '--request'), { code: 'evidence_conflict' });
  const before = fs.readFileSync(f.file);
  const threadKey = f.inspect().recommendations[0].nextAction.threadKey;
  for (const operation of [
    f.followup,
    { ...f.followup, id: 'invalid-note', noteIds: ['note-b'] },
    { ...f.followup, id: 'missing-note', noteIds: [] },
    { ...f.followup, id: 'bad-date', dueOn: '2026-02-30' },
    { type: 'complete', id: 'missing', completedOn: '2026-11-24' },
    { type: 'complete', id: 'followup-a', completedOn: '2026-11-25' },
    { type: 'defer', householdId: 'missing', until: '2026-11-30', reason: 'Synthetic' },
    { type: 'defer', householdId: 'household-a', until: '2026-11-24', reason: 'Synthetic' },
    { type: 'thread-link', threadKey, url: 'javascript:alert(1)' },
    { type: 'thread-link', threadKey, url: 'https://user:secret@example.invalid/thread' },
    { type: 'thread-link', threadKey: 'missing', url: 'https://example.invalid/thread' },
    { type: 'send' }, { type: 'schedule' }
  ]) {
    assert.throws(() => f.apply([{ ...f.followup, id: 'rolled-back' }, operation]));
    assert.deepEqual(fs.readFileSync(f.file), before);
  }
  const lock = path.join(path.dirname(f.file), 'reconnection.lock');
  fs.writeFileSync(lock, 'Synthetic writer');
  assert.throws(() => f.apply([{ type: 'complete', id: 'followup-a', completedOn: '2026-11-24' }]), { code: 'store_locked' });
  fs.unlinkSync(lock);
  const rename = t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('Synthetic disk failure'), { code: 'EIO' }); });
  assert.throws(() => f.apply([{ type: 'complete', id: 'followup-a', completedOn: '2026-11-24' }]), /Synthetic disk failure/);
  rename.mock.restore();
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['reconnection.json']);
});

test('CLI retains unavailable sources and 0/2/1 exits; private denial precedes all evidence/output reads', t => {
  const f = fixture(t);
  const cli = path.join(__dirname, 'reconnection.ts');
  const file = path.join(f.folder, 'request.json');
  function run(request, mode = '--inspect') {
    fs.writeFileSync(file, JSON.stringify(request));
    return spawnSync(process.execPath, ['--import', 'tsx', cli, mode, file], { encoding: 'utf8' });
  }
  let result = run(f.request);
  assert.equal(result.status, 0, result.stderr);
  const current = JSON.parse(result.stdout);
  result = run({ ...f.request, expectedRevision: current.revision, evidenceDigest: current.evidenceDigest, operations: [f.followup] }, '--request');
  assert.equal(result.status, 0, result.stderr);
  const collection = readCollection(f.collection).value;
  collection.manifest.status = 'partial';
  collection.manifest.sources[0].status = 'requires_setup';
  collection.manifest.sources[0].errors = [{ code: 'auth_required', message: 'Synthetic unavailable source' }];
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  f.applyMapping([]);
  result = run(f.request);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).context.sources[0].status, 'requires_setup');
  assert.equal(JSON.parse(result.stdout).context.sources[0].errors[0].code, 'auth_required');
  assert.equal(JSON.parse(result.stdout).recommendations[0].observedActivity.people[0].observedDirectMessages.certainty, 'lower_bound');
  for (const mode of ['--inspect', '--request', '--report']) {
    result = run({ ...f.request, dataClass: 'private', collection: 'SYNTHETIC-SENSITIVE', curated: 'missing',
      mapping: 'missing', output: 'forbidden-output' }, mode);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /private_collection_disabled/);
    assert.equal(result.stderr.includes('SYNTHETIC-SENSITIVE'), false);
    assert.equal(result.stdout, '');
    assert.equal(fs.existsSync(path.join(f.folder, 'forbidden-output')), false);
  }
  result = run({ ...f.request, output: path.join(__dirname, '..', '..', 'public') }, '--request');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe_output/);
});
