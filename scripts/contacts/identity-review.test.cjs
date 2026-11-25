const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { collect } = require('./collect.cjs');
const { handoff, period } = require('./demo.cjs');
const { review } = require('./identity-review.cjs');

function fixture(t, group = false) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'contacts-review-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const input = handoff('email', 'email');
  const page = input.pages[0];
  page.memberships[1].identityId = 'peer';
  page.events[0].senderId = 'peer';
  page.identities = [
    { id: 'self', idKind: 'provider', isSelf: true, displayName: 'Synthetic User' },
    { id: 'peer', idKind: 'provider', isSelf: false, displayName: 'Alex Example',
      addresses: [{ type: 'email', value: 'alex@example.invalid' }, { type: 'phone', value: '+1 (202) 555-0101' }] },
    { id: 'unrelated', idKind: 'provider', isSelf: false, displayName: 'Alex Example' },
    { id: 'mail-alias', idKind: 'provider', isSelf: false, displayName: 'A. Example',
      addresses: [{ type: 'email', value: 'alex@EXAMPLE.INVALID' }] },
    { id: 'phone-alias', idKind: 'provider', isSelf: false, displayName: 'Synthetic Phone',
      addresses: [{ type: 'phone', value: '+12025550101' }] },
    { id: 'provider-alias', idKind: 'provider', isSelf: false, displayName: 'Synthetic Profile' }
  ];
  if (group) {
    page.threads[0].kind = 'group';
    page.memberships = page.identities.slice(0, 4).map(identity => ({ threadId: 'thread-1', identityId: identity.id }));
  }
  fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(input));
  const collected = collect({
    schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: [{ source: 'email', account: input.account, connector: input.connector, mode: 'metadata-import', input: 'input.json' }]
  }, folder);
  assert.equal(collected.exitCode, 0);
  const request = {
    schemaVersion: 1, dataClass: 'synthetic', collection: collected.file, output: path.join(folder, 'review'),
    expectedRevision: 0, reason: 'Synthetic manual review', operations: []
  };
  const inspect = () => review(request, folder, true);
  const initial = inspect();
  request.collectionDigest = initial.collectionDigest;
  const key = id => JSON.stringify(['email', input.account, 'identity', id]);
  const id = name => initial.identities.find(identity => identity.key === key(name)).suggestedPersonId;
  const file = path.join(request.output, 'identity-review.json');
  const state = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const apply = operations => {
    request.operations = operations;
    request.expectedRevision = inspect().revision;
    request.collectionDigest = inspect().collectionDigest;
    return review(request, folder);
  };
  const merge = (names, kind = 'email') => ({
    type: 'merge', people: names.map(id), into: id(names[0]),
    evidence: [{ kind, identityKeys: names.map(key), ...(kind === 'provider' ? { reference: 'synthetic-reviewed-profile' } : {}) }]
  });
  return { folder, request, inspect, key, id, file, state, apply, merge, collection: collected.file };
}

test('inspection is read-only; registration keeps same names and shared addresses distinct until reviewed', t => {
  const f = fixture(t);
  assert.equal(fs.existsSync(f.request.output), false);
  assert.equal(f.inspect().revision, 0);
  const original = fs.readFileSync(f.collection);
  f.apply([]);
  const state = f.state();
  assert.equal(state.revision, 1);
  assert.equal(new Set(Object.values(state.view.assignments)).size, 6);
  assert.notEqual(state.view.assignments[f.key('peer')], state.view.assignments[f.key('unrelated')]);
  assert.deepEqual(state.view.households, {});
  assert.deepEqual(fs.readFileSync(f.collection), original);
  assert.equal(JSON.parse(original).manifest.identityMappingRevision, null);
});

test('reviewed email, phone and provider evidence combine transitively without changing observations or notes', t => {
  const f = fixture(t);
  f.apply([]);
  const notesFile = path.join(f.folder, 'curated.synthetic.json');
  const notes = JSON.stringify({ notes: [{ personId: f.id('mail-alias'), original: 'Unchanged synthetic note.' }] });
  fs.writeFileSync(notesFile, notes);
  const original = fs.readFileSync(f.collection);
  f.apply([f.merge(['peer', 'mail-alias'])]);
  f.apply([f.merge(['peer', 'phone-alias'], 'phone')]);
  f.apply([f.merge(['peer', 'provider-alias'], 'provider')]);
  const state = f.state();
  for (const name of ['peer', 'mail-alias', 'phone-alias', 'provider-alias']) {
    assert.equal(state.view.assignments[f.key(name)], f.id('peer'));
  }
  assert.equal(state.view.people[f.id('mail-alias')].mergedInto, f.id('peer'));
  assert.ok(state.view.people[f.id('unrelated')]);
  assert.equal(state.revision, 4);
  assert.equal(state.history[3].collectionDigest, f.inspect().collectionDigest);
  assert.deepEqual(fs.readFileSync(f.collection), original);
  assert.equal(fs.readFileSync(notesFile, 'utf8'), notes);
  f.apply([{ type: 'split', from: f.id('peer'), into: f.id('mail-alias'), identityKeys: [f.key('mail-alias')] }]);
  assert.equal(f.state().view.people[f.id('mail-alias')].mergedInto, null);
  assert.equal(f.state().view.assignments[f.key('mail-alias')], f.id('mail-alias'));
  assert.equal(fs.readFileSync(notesFile, 'utf8'), notes);
  assert.deepEqual(fs.readFileSync(f.collection), original);
});

test('cross-source/account namespaces combine only on reviewed evidence, not identical IDs', t => {
  const f = fixture(t);
  const collection = JSON.parse(fs.readFileSync(f.collection));
  const otherKey = JSON.stringify(['whatsapp', 'other-synthetic-account', 'identity', 'peer']);
  collection.records[otherKey] = structuredClone(collection.records[f.key('peer')]);
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  const otherId = f.inspect().identities.find(identity => identity.key === otherKey).suggestedPersonId;
  f.apply([]);
  assert.notEqual(f.state().view.assignments[otherKey], f.id('peer'));
  f.apply([{
    type: 'merge', into: f.id('peer'), people: [f.id('peer'), otherId],
    evidence: [{ kind: 'email', identityKeys: [f.key('peer'), otherKey] }]
  }]);
  assert.equal(f.state().view.assignments[otherKey], f.id('peer'));
  assert.ok(f.state().identityDigests[otherKey]);
});

test('invalid name/address/disconnected evidence and mixed self matches fail atomically', t => {
  const f = fixture(t);
  f.apply([]);
  const original = fs.readFileSync(f.file);
  const invalid = [
    f.merge(['peer', 'unrelated'], 'name'),
    f.merge(['peer', 'unrelated']),
    { ...f.merge(['peer', 'mail-alias']), people: [f.id('peer'), f.id('mail-alias'), f.id('unrelated')] },
    f.merge(['peer', 'self'], 'provider')
  ];
  for (const operation of invalid) {
    assert.throws(() => f.apply([operation]));
    assert.deepEqual(fs.readFileSync(f.file), original);
  }
  assert.throws(() => f.apply([f.merge(['peer', 'mail-alias']), { type: 'invalid' }]));
  assert.deepEqual(fs.readFileSync(f.file), original);
  assert.equal(fs.existsSync(path.join(f.request.output, 'identity-review.lock')), false);
});

test('conservative normalization rejects regional phones and email local-part/alias guesses', t => {
  for (const [type, value] of [['phone', '2025550101'], ['email', 'Alex@example.invalid'], ['email', 'alex+tag@example.invalid']]) {
    const f = fixture(t);
    const collection = JSON.parse(fs.readFileSync(f.collection));
    const alias = type === 'phone' ? 'phone-alias' : 'mail-alias';
    collection.records[f.key(alias)].record.addresses = [{ type, value }];
    fs.writeFileSync(f.collection, JSON.stringify(collection));
    f.apply([]);
    assert.throws(() => f.apply([f.merge(['peer', alias], type)]), /exact conservative/);
  }
});

test('four-person chat membership does not create households or identity match evidence', t => {
  const f = fixture(t, true);
  f.apply([]);
  assert.deepEqual(f.state().view.households, {});
  assert.equal(new Set(Object.values(f.state().view.assignments)).size, 6);
  assert.throws(() => f.apply([f.merge(['peer', 'unrelated'], 'group-membership')]), /not evidence/);
});

test('new snapshots can explicitly reaffirm existing mappings or register new identities without losing decisions', t => {
  const f = fixture(t);
  f.apply([]);
  f.apply([f.merge(['peer', 'mail-alias'])]);
  const previous = f.state().view;
  assert.throws(() => f.apply([]), /no mapping changes/);
  const collection = JSON.parse(fs.readFileSync(f.collection));
  collection.manifest.collectedAt = '2026-11-25T01:00:00.000Z';
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  f.apply([]);
  assert.equal(f.state().revision, 3);
  assert.deepEqual(f.state().view, previous);
  assert.equal(f.state().collectionDigest, f.inspect().collectionDigest);
  f.apply([{ type: 'undo', revision: 3 }]);
  const newKey = f.key('new-synthetic-identity');
  collection.records[newKey] = { record: { type: 'identity', idKind: 'local', isSelf: false }, provenance: [] };
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  f.apply([]);
  assert.equal(f.state().revision, 5);
  assert.equal(f.state().view.assignments[f.key('mail-alias')], f.id('peer'));
  assert.ok(f.state().view.assignments[newKey]);
});

test('households are optional, explicit and not copied on split; conflicting households block merging', t => {
  const f = fixture(t);
  f.apply([]);
  assert.deepEqual(f.state().view.households, {});
  f.apply([{ type: 'household', id: 'household-a', label: 'Synthetic household', people: [f.id('peer')] }]);
  f.apply([f.merge(['peer', 'mail-alias'])]);
  f.apply([{ type: 'split', from: f.id('peer'), into: f.id('mail-alias'), identityKeys: [f.key('mail-alias')] }]);
  assert.deepEqual(f.state().view.households['household-a'].people, [f.id('peer')]);
  f.apply([{ type: 'household', id: 'household-b', label: 'Other synthetic household', people: [f.id('mail-alias')] }]);
  assert.throws(() => f.apply([f.merge(['peer', 'mail-alias'])]), /conflicting curated households/);
  assert.throws(() => f.apply([{ type: 'household', id: 'household-c', label: 'Duplicate', people: [f.id('peer')] }]), /at most one/);
  f.apply([{ type: 'household', id: 'household-b', label: 'Other synthetic household', people: [] }]);
  f.apply([f.merge(['peer', 'mail-alias'])]);
  assert.deepEqual(f.state().view.households['household-a'].people, [f.id('peer')]);
});

test('split and undo are persisted as new revisions, retaining stable IDs and original source evidence', t => {
  const f = fixture(t);
  f.apply([]);
  f.apply([f.merge(['peer', 'mail-alias'])]);
  const merged = f.state().view;
  f.apply([{ type: 'split', from: f.id('peer'), into: f.id('mail-alias'), identityKeys: [f.key('mail-alias')] }]);
  assert.equal(f.state().revision, 3);
  f.apply([{ type: 'undo', revision: 3 }]);
  assert.deepEqual(f.state().view, merged);
  assert.equal(f.state().revision, 4);
  assert.equal(f.state().history.length, 4);
  assert.throws(() => f.apply([{ type: 'undo', revision: 2 }]), /current revision/);
  f.apply([{ type: 'undo', revision: 4 }]);
  assert.equal(f.state().view.assignments[f.key('mail-alias')], f.id('mail-alias'));
  assert.equal(f.state().revision, 5);
  assert.throws(() => f.apply([{ type: 'split', from: f.id('peer'), into: 'split-person', identityKeys: [f.key('unrelated')] }]));
});

test('stale reviews, changed identities, lock conflicts, unsafe output and private data fail visibly', t => {
  const f = fixture(t);
  f.apply([]);
  const original = fs.readFileSync(f.file);
  f.request.operations = [f.merge(['peer', 'mail-alias'])];
  f.request.expectedRevision = 0;
  assert.throws(() => review(f.request, f.folder), { code: 'revision_conflict' });
  f.request.expectedRevision = 1;
  f.request.collectionDigest = 'stale';
  assert.throws(() => review(f.request, f.folder), { code: 'collection_conflict' });
  fs.writeFileSync(path.join(f.request.output, 'identity-review.lock'), 'synthetic lock');
  assert.throws(() => f.apply([]), { code: 'store_locked' });
  fs.unlinkSync(path.join(f.request.output, 'identity-review.lock'));
  const unsafe = path.resolve(__dirname, '..', '..', 'public');
  assert.throws(() => review({ ...f.request, output: unsafe }, f.folder), { code: 'unsafe_output' });
  assert.throws(() => review({ ...f.request, dataClass: 'private' }, f.folder), { code: 'private_run_not_authorized' });
  const collection = JSON.parse(fs.readFileSync(f.collection));
  fs.writeFileSync(f.collection, JSON.stringify({ ...collection, dataClass: 'private' }));
  assert.throws(() => f.inspect(), { code: 'private_run_not_authorized' });
  collection.records[f.key('peer')].record.displayName = 'Changed synthetic profile';
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  assert.throws(() => f.apply([]), { code: 'identity_conflict' });
  assert.deepEqual(fs.readFileSync(f.file), original);
});

test('undo of a new split retains canonical references for notes; registration undo can be replayed', t => {
  const f = fixture(t);
  f.apply([]);
  f.apply([{ type: 'undo', revision: 1 }]);
  assert.deepEqual(f.state().view.assignments, {});
  assert.ok(f.inspect().unassignedPersonIds.includes(f.id('peer')));
  f.apply([]);
  f.apply([f.merge(['peer', 'mail-alias'])]);
  f.apply([{ type: 'split', from: f.id('peer'), into: 'synthetic-new-person', identityKeys: [f.key('mail-alias')] }]);
  const noteFile = path.join(f.folder, 'note.synthetic.json');
  const note = JSON.stringify({ personId: 'synthetic-new-person', original: 'Synthetic note after split.' });
  fs.writeFileSync(noteFile, note);
  f.apply([{ type: 'undo', revision: 5 }]);
  assert.equal(f.state().view.people['synthetic-new-person'].mergedInto, f.id('peer'));
  assert.equal(fs.readFileSync(noteFile, 'utf8'), note);
});

test('CLI reports 0/2/1 and retains unavailable source status without empty success', t => {
  const f = fixture(t);
  const cli = path.join(__dirname, 'identity-review.cjs');
  const requestFile = path.join(f.folder, 'review.synthetic.json');
  const run = option => {
    fs.writeFileSync(requestFile, JSON.stringify(f.request));
    return spawnSync(process.execPath, [cli, option, requestFile], { encoding: 'utf8' });
  };
  assert.equal(run('--inspect').status, 0);
  assert.equal(run('--request').status, 0);
  const collection = JSON.parse(fs.readFileSync(f.collection));
  collection.manifest.status = 'partial';
  collection.manifest.sources.push({ source: 'whatsapp', status: 'requires_setup', reason: 'Synthetic unavailable source' });
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  f.request.expectedRevision = 1;
  f.request.collectionDigest = f.inspect().collectionDigest;
  f.request.operations = [f.merge(['peer', 'mail-alias'])];
  const partial = run('--request');
  assert.equal(partial.status, 2, partial.stderr);
  assert.equal(JSON.parse(partial.stdout).sources[1].status, 'requires_setup');
  assert.equal(run('--request').status, 1);
  fs.writeFileSync(requestFile, '{bad');
  assert.equal(spawnSync(process.execPath, [cli, '--request', requestFile]).status, 1);
});
