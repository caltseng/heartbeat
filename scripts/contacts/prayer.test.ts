import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collect } from './collect.ts';
import { handoff, period } from './demo.ts';
import { tempFolder, mappingFixture } from './fixtures.ts';
import { curate } from './curated.ts';
import { prayer } from './prayer.ts';

function fixture(t) {
  const folder = tempFolder(t, 'contacts-prayer-synthetic-');
  const source = handoff('email', 'email');
  fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(source));
  const collection = collect({
    schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: [{ source: 'email', account: source.account, connector: source.connector, mode: 'metadata-import', input: 'input.json' }]
  }, folder).file;
  const { inspect: inspectMapping, apply: applyMapping } =
    mappingFixture(folder, collection, 'mapping', 'Synthetic review');
  applyMapping([]);
  const person = Object.keys(inspectMapping().view.people)[0];
  applyMapping([{ type: 'household', id: 'household-a', label: 'Synthetic household', people: [person] }]);
  const curation = { schemaVersion: 1, dataClass: 'synthetic', collection, mapping: 'mapping', output: 'curated', reason: 'Synthetic notes' };
  const applyNotes = operations => {
    const current = curate(curation, folder, true);
    return curate({ ...curation, operations, expectedRevision: current.revision, mappingDigest: current.mappingDigest }, folder);
  };
  const original = '  Synthetic request: help with a difficult decision.\r\nKeep this original.  ';
  applyNotes([
    { type: 'note', id: 'note-a', originalText: original, encounteredOn: '2000-01-01', households: ['household-a'], people: [person] },
    { type: 'note', id: 'note-b', originalText: 'Synthetic update: things are different; status unclear.',
      encounteredOn: null, households: ['household-a'], people: [] }
  ]);
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection, mapping: 'mapping', curated: 'curated',
    output: path.join('curated', 'prayer'), reason: 'Explicit synthetic prayer triage' };
  const inspect = () => prayer(request, folder, true);
  const apply = operations => {
    const current = inspect();
    return prayer({ ...request, expectedRevision: current.revision, curatedDigest: current.curatedDigest, operations }, folder);
  };
  const creation = { type: 'request', id: 'prayer-a', text: 'Synthetic decision request', noteIds: ['note-a'], recordedOn: '2000-01-01' };
  const update = { type: 'update', id: 'update-a', requestId: 'prayer-a', text: 'Synthetic status unclear',
    noteIds: ['note-b'], status: null, statusConfirmed: false };
  return { folder, collection, curation, original, request, inspect, apply, applyNotes, creation, update,
    file: path.join(folder, 'curated', 'prayer', 'prayer.json') };
}

test('originals survive prayer capture, explicit status transitions and editable ordered plans', t => {
  const f = fixture(t);
  const originals = [f.collection, path.join(f.folder, 'mapping', 'identity-review.json'), path.join(f.folder, 'curated', 'curated.json')];
  const bytes = originals.map(file => fs.readFileSync(file));
  assert.equal(f.inspect().revision, 0);
  assert.equal(fs.existsSync(path.dirname(f.file)), false);
  const plan = { type: 'plan', id: 'plan-a', label: 'Synthetic personal plan', requestIds: ['prayer-a', 'prayer-b'] };
  const result = f.apply([f.creation, { ...f.creation, id: 'prayer-b', recordedOn: null }, plan]);
  assert.equal(result.requests['prayer-a'].status, 'unknown');
  assert.equal(result.requests['prayer-a'].originalNotes['note-a'].originalText, f.original);
  assert.deepEqual(result.requests['prayer-a'].originalNotes['note-a'].households, ['household-a']);
  f.apply([{ ...f.update, status: 'active', statusConfirmed: true }]);
  f.apply([{ ...f.update, id: 'update-b', text: 'Explicit synthetic answered statement', status: 'answered', statusConfirmed: true }]);
  f.apply([{ ...plan, requestIds: ['prayer-b', 'prayer-a'] }]);
  assert.deepEqual(f.inspect().records.plans['plan-a'].requestIds, ['prayer-b', 'prayer-a']);
  const edited = f.apply([{ ...plan, label: 'Edited synthetic plan', requestIds: ['prayer-b'] }]);
  assert.equal(edited.requests['prayer-a'].text, f.creation.text);
  assert.equal(edited.requests['prayer-a'].updates.length, 2);
  assert.equal(edited.requests['prayer-a'].status, 'answered');
  assert.equal(edited.requests['prayer-a'].needsStatusReview, false);
  assert.equal(edited.requests['prayer-b'].recordedOn, null);
  assert.equal(edited.records.requests['prayer-a'].recordedOn, '2000-01-01');
  assert.notEqual(edited.records.requests['prayer-a'].capturedAt.slice(0, 10), '2000-01-01');
  f.apply([{ ...plan, requestIds: [] }]);
  assert.equal(Object.keys(f.inspect().requests).length, 2);
  originals.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), bytes[index]));
  const curated = curate(f.curation, f.folder, true);
  assert.equal(JSON.stringify(curated).includes(f.creation.text), false);
  assert.equal(Object.hasOwn(curated.records, 'requests'), false);
});

test('old notes and ambiguous updates ask for status without inferring completion or overwriting confirmed status', t => {
  const f = fixture(t);
  let result = f.apply([f.creation, f.update]);
  assert.equal(result.requests['prayer-a'].status, 'unknown');
  assert.match(result.requests['prayer-a'].statusQuestion, /explicitly confirm/);
  result = f.apply([{ ...f.update, id: 'confirmed', status: 'active', statusConfirmed: true }]);
  assert.equal(result.requests['prayer-a'].needsStatusReview, false);
  result = f.apply([{ ...f.update, id: 'ambiguous-again', text: 'Synthetic: the appointment was last year.' }]);
  assert.equal(result.requests['prayer-a'].status, 'active');
  assert.equal(result.requests['prayer-a'].needsStatusReview, true);
  const before = fs.readFileSync(f.file);
  f.inspect();
  assert.deepEqual(fs.readFileSync(f.file), before);
  result = f.apply([{ ...f.update, id: 'confirmed-resolved', status: 'resolved', statusConfirmed: true }]);
  assert.equal(result.requests['prayer-a'].status, 'resolved');
  assert.equal(result.requests['prayer-a'].statusQuestion, null);
});

test('invalid evidence, implicit status, duplicate updates and outreach fields roll back the entire transaction', t => {
  const f = fixture(t);
  f.apply([f.creation, f.update]);
  const before = fs.readFileSync(f.file);
  for (const operation of [
    { ...f.creation, text: 'Overwritten' },
    { ...f.creation, id: 'bad-note', noteIds: [] },
    { ...f.creation, id: 'bad-note', noteIds: ['missing'] },
    { ...f.creation, id: 'bad-date', recordedOn: '2026-02-30' },
    f.update,
    { ...f.update, id: 'implicit', status: 'answered' },
    { ...f.update, id: 'inferred', status: 'resolved', statusConfirmed: false },
    { ...f.update, id: 'bad-status', status: 'probably-done', statusConfirmed: true },
    { ...f.update, id: 'missing-note', noteIds: ['missing'] },
    { ...f.update, id: 'missing-request', requestId: 'missing' },
    { type: 'plan', id: 'bad-plan', label: 'Synthetic', requestIds: ['missing'] },
    { type: 'plan', id: 'bad-plan', label: 'Synthetic', requestIds: ['prayer-a', 'prayer-a'] },
    { type: 'outreach', requestIds: ['prayer-a'] },
    { ...f.creation, id: 'outreach-leak', recipients: ['synthetic'] }
  ]) {
    assert.throws(() => f.apply([{ ...f.creation, id: 'rolled-back' }, operation]));
    assert.deepEqual(fs.readFileSync(f.file), before);
    assert.equal(fs.existsSync(path.join(path.dirname(f.file), 'prayer.lock')), false);
  }
});

test('stale evidence/revision, locking and failed atomic writes preserve snapshots', t => {
  const f = fixture(t);
  f.apply([f.creation]);
  const stale = { ...f.request, expectedRevision: f.inspect().revision, curatedDigest: f.inspect().curatedDigest,
    operations: [f.update] };
  f.apply([{ type: 'plan', id: 'plan-a', label: 'Synthetic', requestIds: ['prayer-a'] }]);
  assert.throws(() => prayer(stale, f.folder), { code: 'revision_conflict' });
  stale.expectedRevision = f.inspect().revision;
  f.applyNotes([{ type: 'note', id: 'note-c', originalText: 'Synthetic new note', encounteredOn: null, households: ['household-a'], people: [] }]);
  assert.throws(() => prayer(stale, f.folder), { code: 'curated_conflict' });
  const before = fs.readFileSync(f.file);
  const lock = path.join(path.dirname(f.file), 'prayer.lock');
  fs.writeFileSync(lock, 'Synthetic writer');
  assert.throws(() => f.apply([f.update]), { code: 'store_locked' });
  fs.unlinkSync(lock);
  const rename = t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('Synthetic disk failure'), { code: 'EIO' }); });
  assert.throws(() => f.apply([f.update]), /Synthetic disk failure/);
  rename.mock.restore();
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['prayer.json']);
});

test('CLI reports complete/partial/fatal explicitly and private denial never touches evidence or output', t => {
  const f = fixture(t);
  const cli = path.join(__dirname, 'prayer.ts');
  const file = path.join(f.folder, 'request.json');
  function run(request, mode = '--inspect') {
    fs.writeFileSync(file, JSON.stringify(request));
    return spawnSync(process.execPath, ['--import', 'tsx', cli, mode, file], { encoding: 'utf8' });
  }
  let result = run(f.request);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).heading, 'Heartbeat private prayer triage');
  const current = f.inspect();
  result = run({ ...f.request, expectedRevision: current.revision, curatedDigest: current.curatedDigest, operations: [f.creation] }, '--request');
  assert.equal(result.status, 0, result.stderr);
  const collection = JSON.parse(fs.readFileSync(f.collection, 'utf8'));
  collection.manifest.status = 'partial';
  collection.manifest.sources[0].status = 'requires_setup';
  collection.manifest.sources[0].errors = [{ code: 'auth_required', message: 'Synthetic unavailable source' }];
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  result = run(f.request);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).sources[0].status, 'requires_setup');
  assert.equal(JSON.parse(result.stdout).requests['prayer-a'].status, 'unknown');
  result = run({ ...f.request, collection: 'SYNTHETIC-SENSITIVE-PATH' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes('SYNTHETIC-SENSITIVE-PATH'), false);
  const privateRequest = { ...f.request, dataClass: 'private', collection: 'SYNTHETIC-SENSITIVE-PATH', mapping: 'missing',
    curated: 'missing', output: 'forbidden-output' };
  assert.throws(() => prayer(privateRequest, f.folder), { code: 'private_collection_disabled' });
  result = run(privateRequest, '--request');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private_collection_disabled/);
  assert.equal(result.stderr.includes('SYNTHETIC-SENSITIVE-PATH'), false);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(f.folder, 'forbidden-output')), false);
  result = run({ ...f.request, output: path.join(__dirname, '..', '..', 'public') }, '--request');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe_output/);
});
