import type { RecordEntry } from './types.ts';
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
import { operate } from './operations.ts';
import { readCollection } from './collection-store.ts';

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'contacts-curated-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const source = handoff('email', 'email');
  fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(source));
  const collected = collect({
    schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: [{ source: 'email', account: source.account, connector: source.connector, mode: 'metadata-import', input: 'input.json' }]
  }, folder);
  const identityRequest = {
    schemaVersion: 1, dataClass: 'synthetic', collection: collected.file, output: 'mapping',
    reason: 'Synthetic canonical review', operations: []
  };
  const applyMapping = operations => {
    const inspected = review(identityRequest, folder, true);
    return review({ ...identityRequest, operations, expectedRevision: inspected.revision, collectionDigest: inspected.collectionDigest }, folder);
  };
  applyMapping([]);
  const people = Object.keys(review(identityRequest, folder, true).view.people);
  applyMapping([
    { type: 'household', id: 'household-a', label: 'Synthetic one-person household', people: [people[0]] },
    { type: 'household', id: 'household-b', label: 'Synthetic second household', people: [people[1]] }
  ]);
  const request = {
    schemaVersion: 1, dataClass: 'synthetic', collection: collected.file, mapping: 'mapping',
    output: 'curated', reason: 'Explicit synthetic curation'
  };
  const inspect = () => curate(request, folder, true);
  const apply = operations => {
    const current = inspect();
    return curate({ ...request, operations, expectedRevision: current.revision, mappingDigest: current.mappingDigest }, folder);
  };
  const file = path.join(folder, 'curated', 'curated.json');
  const state = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const note = {
    type: 'note', id: 'note-a', originalText: '  Synthetic original.\r\nNo rewrite.  ',
    encounteredOn: '2026-10-12', households: ['household-a', 'household-b'], people: [people[1]]
  };
  const connection = {
    type: 'connection', id: 'connection-a', occurredOn: '2026-10-12',
    households: ['household-a'], people: [], groupId: null, noteIds: ['note-a'],
    context: 'Explicitly confirmed synthetic encounter'
  };
  return { folder, source, request, inspect, apply, file, state, people, note, connection, applyMapping, collection: collected.file };
}

test('one-person households, multi-household unchanged notes and distinct dates persist without implicit confirmation', t => {
  const f = fixture(t);
  assert.equal(fs.existsSync(path.join(f.folder, 'curated')), false);
  assert.equal(f.inspect().revision, 0);
  const sourceBytes = fs.readFileSync(f.collection);
  const mappingBytes = fs.readFileSync(path.join(f.folder, 'mapping', 'identity-review.json'));
  const result = f.apply([f.note]);
  const saved = f.state().records.notes['note-a'];
  assert.equal(saved.originalText, f.note.originalText);
  assert.equal(saved.encounteredOn, '2026-10-12');
  assert.notEqual(saved.capturedAt.slice(0, 10), saved.encounteredOn);
  assert.deepEqual(saved.households, ['household-a', 'household-b']);
  assert.equal(result.canonical.households['household-a'].people.length, 1);
  assert.deepEqual(result.lastConfirmedConnections, { 'household-a': null, 'household-b': null });
  assert.deepEqual(fs.readFileSync(f.collection), sourceBytes);
  assert.deepEqual(fs.readFileSync(path.join(f.folder, 'mapping', 'identity-review.json')), mappingBytes);
  const bytes = fs.readFileSync(f.file);
  assert.throws(() => f.apply([{ ...f.note, originalText: 'Replacement' }]), /immutable/);
  assert.deepEqual(fs.readFileSync(f.file), bytes);
});

test('only explicit connections advance confirmed dates; groups and household-specific rhythms stay curated', t => {
  const f = fixture(t);
  const group = { type: 'group', id: 'group-a', label: 'Synthetic recurring group', households: ['household-a', 'household-b'], people: f.people };
  f.apply([
    group, f.note, { ...f.connection, groupId: 'group-a' },
    { type: 'rhythm', household: 'household-a', intervalDays: 21, reason: 'Explicit synthetic preference' },
    { type: 'rhythm', household: 'household-b', intervalDays: 60, reason: 'Different synthetic preference' }
  ]);
  assert.deepEqual(f.inspect().lastConfirmedConnections, { 'household-a': '2026-10-12', 'household-b': null });
  f.apply([{ ...f.connection, id: 'earlier-connection', occurredOn: '2026-09-10' }]);
  f.apply([{ ...group, label: 'Renamed synthetic group' }]);
  assert.equal(f.inspect().lastConfirmedConnections['household-a'], '2026-10-12');
  assert.equal(f.state().records.rhythms['household-a'].intervalDays, 21);
  assert.equal(f.state().records.rhythms['household-b'].intervalDays, 60);
  f.apply([{ type: 'rhythm', household: 'household-a', intervalDays: null, reason: 'Explicitly unset' }]);
  assert.equal(f.inspect().lastConfirmedConnections['household-a'], '2026-10-12');
  assert.throws(() => f.apply([{ ...f.connection, occurredOn: '2026-11-25' }]), /append-only/);
});

test('source changes and unavailable activity cannot overwrite curated notes or reset meaningful dates', t => {
  const f = fixture(t);
  f.apply([f.note, f.connection]);
  const bytes = fs.readFileSync(f.file);
  const collection = readCollection(f.collection).value;
  const identity = Object.values<RecordEntry>(collection.reconciliation.records).find(entry => entry.record.type === 'identity');
  identity.record.displayName = 'Changed synthetic source name';
  collection.manifest.status = 'partial';
  collection.manifest.sources[0].status = 'requires_setup';
  collection.manifest.sources[0].errors = [{ code: 'auth_required', message: 'Synthetic unavailable source' }];
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  const current = f.inspect();
  assert.equal(current.exitCode, 2);
  assert.equal(current.changedIdentityKeys.length, 1);
  assert.equal(current.sources[0].status, 'requires_setup');
  assert.equal(current.lastConfirmedConnections['household-a'], '2026-10-12');
  assert.equal(current.records.notes['note-a'].originalText, f.note.originalText);
  assert.deepEqual(fs.readFileSync(f.file), bytes);
  assert.throws(() => f.apply([{ type: 'observation', household: 'household-a', occurredOn: '2026-11-25' }]), /Unknown curated/);
});

test('alias merge, split and undo retain original note references and text', t => {
  const f = fixture(t);
  f.apply([f.note]);
  const original = fs.readFileSync(f.file);
  const mappingFile = path.join(f.folder, 'mapping', 'identity-review.json');
  const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
  const keys = Object.keys(mapping.view.assignments);
  // Two synthetic source identities explicitly reviewed as the same person.
  const collection = readCollection(f.collection).value;
  for (const key of keys) {
    collection.reconciliation.records[key].record.isSelf = false;
    collection.reconciliation.records[key].record.idKind = 'provider';
  }
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  f.applyMapping([
    { type: 'refresh', identityKeys: keys },
    { type: 'household', id: 'household-b', label: 'Synthetic second household', people: [] },
    { type: 'merge', people: f.people, into: f.people[0], evidence: [{ kind: 'provider', identityKeys: keys, reference: 'Explicit synthetic equivalence' }] }
  ]);
  assert.equal(f.inspect().canonical.people[f.people[1]].mergedInto, f.people[0]);
  assert.deepEqual(f.inspect().records.notes['note-a'].people, [f.people[1]]);
  f.applyMapping([{ type: 'split', from: f.people[0], into: f.people[1], identityKeys: [keys.find(key => mapping.view.assignments[key] === f.people[1])] }]);
  assert.equal(f.inspect().canonical.people[f.people[1]].mergedInto, null);
  const splitRevision = f.inspect().mappingRevision;
  f.applyMapping([{ type: 'undo', revision: splitRevision }]);
  assert.deepEqual(fs.readFileSync(f.file), original);
});

test('managed metadata deletion preserves separate curated directories, including lock and atomic-write remnants', t => {
  for (const layout of ['sibling', 'nested']) {
    const f = fixture(t);
    if (layout === 'nested') f.request.output = path.join('store', 'curated');
    const result = f.apply([
      f.note, f.connection,
      { type: 'rhythm', household: 'household-a', intervalDays: 21, reason: 'Explicit synthetic preference' }
    ]);
    const directory = path.dirname(result.file);
    const lock = path.join(directory, 'curated.lock');
    const temporary = `${result.file}.123.tmp`;
    fs.writeFileSync(lock, 'Synthetic interrupted curation lock');
    fs.writeFileSync(temporary, 'Synthetic interrupted curation snapshot');
    const preserved = [result.file, lock, temporary, path.join(f.folder, 'mapping', 'identity-review.json')];
    const originals = preserved.map(file => fs.readFileSync(file));
    const store = path.dirname(f.collection);
    fs.mkdirSync(path.join(store, 'cache'));
    fs.mkdirSync(path.join(store, 'derived'));
    fs.writeFileSync(path.join(store, 'cache', 'input.json'), 'Synthetic cached source metadata');
    fs.writeFileSync(path.join(store, 'derived', 'graph.html'), 'Synthetic derived metadata');
    const operation = {
      schemaVersion: 1, dataClass: 'synthetic', action: 'delete', store,
      now: f.source.pages.at(-1).retrievedAt, confirm: 'purge-cached-metadata',
      artifacts: [path.join('cache', 'input.json'), path.join('derived', 'graph.html')]
    };
    const before = fs.readFileSync(f.collection);
    for (const name of ['curated.lock', 'curated.json.123.tmp']) {
      const misplaced = path.join(store, name);
      fs.writeFileSync(misplaced, 'Synthetic unclassified root artifact');
      assert.throws(() => operate(operation, f.folder), { code: 'inventory_incomplete' });
      assert.deepEqual(fs.readFileSync(f.collection), before);
      fs.unlinkSync(misplaced);
    }
    assert.equal(operate(operation, f.folder).exitCode, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.collection, 'utf8')).records, {});
    assert.equal(fs.existsSync(path.join(store, 'cache', 'input.json')), false);
    assert.equal(fs.existsSync(path.join(store, 'derived', 'graph.html')), false);
    for (let i = 0; i < preserved.length; i++) assert.deepEqual(fs.readFileSync(preserved[i]), originals[i]);
  }
});

test('invalid references, dates and operations roll back whole transactions and release locks', t => {
  const f = fixture(t);
  f.apply([f.note]);
  const original = fs.readFileSync(f.file);
  const bad = [
    { ...f.note, id: 'bad-note', households: ['missing'] },
    { ...f.note, id: 'bad-note', encounteredOn: '2026-02-30' },
    { ...f.note, id: 'bad-note', capturedAt: '2026-11-25T00:00:00.000Z' },
    { ...f.connection, noteIds: ['missing'] },
    { ...f.connection, people: ['missing'] },
    { type: 'rhythm', household: 'household-a', intervalDays: 0, reason: 'Invalid' },
    { type: 'group', id: 'constructor', label: 'Synthetic', households: ['missing'], people: [] }
  ];
  for (const operation of bad) {
    assert.throws(() => f.apply([{ ...f.note, id: 'rollback-note' }, operation]));
    assert.deepEqual(fs.readFileSync(f.file), original);
    assert.equal(fs.existsSync(path.join(f.folder, 'curated', 'curated.lock')), false);
  }
});

test('stale revision/mapping, lock conflicts and failed atomic writes preserve snapshots', t => {
  const f = fixture(t);
  f.apply([f.note]);
  const current = f.inspect();
  const request = { ...f.request, operations: [f.connection], expectedRevision: current.revision, mappingDigest: current.mappingDigest };
  assert.throws(() => curate({ ...request, expectedRevision: 0 }, f.folder), { code: 'revision_conflict' });
  f.applyMapping([{ type: 'household', id: 'household-b', label: 'Explicit new label', people: [f.people[1]] }]);
  assert.throws(() => curate(request, f.folder), { code: 'mapping_conflict' });
  const original = fs.readFileSync(f.file);
  const lock = path.join(f.folder, 'curated', 'curated.lock');
  fs.writeFileSync(lock, 'synthetic lock');
  assert.throws(() => f.apply([f.connection]), { code: 'store_locked' });
  fs.unlinkSync(lock);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.file) throw Object.assign(new Error('Synthetic rename failure'), { code: 'EACCES' });
    return rename(from, to);
  });
  assert.throws(() => f.apply([f.connection]), { code: 'EACCES' });
  assert.deepEqual(fs.readFileSync(f.file), original);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['curated.json']);
});

test('private denial precedes all path access; unsafe output fails and actual CLI preserves 0/2/1 exits', t => {
  const f = fixture(t);
  assert.throws(() => curate({ schemaVersion: 1, dataClass: 'private', collection: 'missing', mapping: 'missing', output: 'forbidden' }, f.folder),
    { code: 'private_collection_disabled' });
  assert.equal(fs.existsSync(path.join(f.folder, 'forbidden')), false);
  assert.throws(() => curate({ ...f.request, output: path.resolve(__dirname, '..', '..', 'public') }, f.folder, true),
    { code: 'unsafe_output' });
  const requestFile = path.join(f.folder, 'request.json');
  const run = (request, mode = '--inspect') => {
    fs.writeFileSync(requestFile, JSON.stringify(request));
    return spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'curated.ts'), mode, requestFile], { encoding: 'utf8' });
  };
  const current = f.inspect();
  const success = run({ ...f.request, operations: [f.note], expectedRevision: 0, mappingDigest: current.mappingDigest }, '--request');
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).heading, 'Heartbeat curated relationships');
  const collection = readCollection(f.collection).value;
  collection.manifest.status = 'partial';
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  assert.equal(run(f.request).status, 2);
  const denied = run({ ...f.request, dataClass: 'private', collection: 'DO-NOT-DISCLOSE' }, '--request');
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /private_collection_disabled/);
  assert.equal(denied.stdout, '');
  assert.doesNotMatch(denied.stderr, /DO-NOT-DISCLOSE/);
});
