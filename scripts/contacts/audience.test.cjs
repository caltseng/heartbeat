const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { collect } = require('./collect.cjs');
const { handoff, period } = require('./demo.cjs');
const { tempFolder, mappingFixture } = require('./fixtures.cjs');
const { curate } = require('./curated.cjs');
const { audienceReview } = require('./audience.cjs');

const preference = { text: 'Use the explicitly requested neutral version.', reason: 'Synthetic stated wording preference, not a belief classification.' };
function fixture(t) {
  const folder = tempFolder(t, 'heartbeat-audience-synthetic-');
  const source = handoff('google-contacts', null);
  source.pages[0].identities = [
    { id: 'a', idKind: 'local', isSelf: false, displayName: 'Synthetic A',
      addresses: [{ type: 'email', value: 'SHARED@example.invalid' }, { type: 'email', value: 'a@example.invalid' }] },
    { id: 'b', idKind: 'local', isSelf: false, displayName: 'Synthetic B',
      addresses: [{ type: 'email', value: 'shared@example.invalid' }] },
    { id: 'c', idKind: 'local', isSelf: false, displayName: 'Synthetic C' },
    { id: 'd', idKind: 'local', isSelf: false, displayName: 'Synthetic D',
      addresses: [{ type: 'email', value: 'not-an-address' }] }
  ];
  fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(source));
  const collected = collect({
    schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: [{ source: source.source, account: source.account, connector: source.connector, mode: 'metadata-import', input: 'input.json' }]
  }, folder);
  const { inspect: inspectMapping, apply: map } =
    mappingFixture(folder, collected.file, 'mapping', 'Synthetic canonical review');
  map([]);
  const people = Object.fromEntries(inspectMapping().identities.map(identity => [JSON.parse(identity.key)[3], identity.personId]));
  map([
    { type: 'household', id: 'household-a', label: 'Synthetic couple', people: [people.a, people.b] },
    { type: 'household', id: 'household-c', label: 'Synthetic singleton', people: [people.c] },
    { type: 'household', id: 'household-d', label: 'Synthetic invalid-address household', people: [people.d] }
  ]);
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection: collected.file, mapping: 'mapping', curated: 'curated', output: 'audience' };
  const inspect = () => audienceReview(request, folder);
  const apply = audience => {
    const current = inspect();
    return audienceReview({ ...request, audience, reason: 'Explicit synthetic audience edits', expectedRevision: current.revision, inputsDigest: current.inputsDigest }, folder, 'request');
  };
  const finalize = () => {
    const current = inspect();
    return audienceReview({ ...request, reason: 'Reviewed the exact synthetic candidate list and source limitations',
      expectedRevision: current.revision, inputsDigest: current.inputsDigest }, folder, 'finalize');
  };
  const household = (householdId, included = true, wording = null) => ({ householdId, included, reason: 'Explicit synthetic inclusion/exclusion', wording });
  const recipient = (id, included, address, wording = null) => ({
    personId: people[id], householdId: id === 'b' ? 'household-a' : `household-${id}`,
    included, address, wording, reason: 'Explicit synthetic member selection'
  });
  const audience = {
    purpose: 'Share a synthetic life update',
    households: [household('household-a'), household('household-c'), household('household-d')],
    recipients: []
  };
  const clean = () => ({
    ...audience,
    households: [household('household-a', true, preference), household('household-c', false), household('household-d', false)],
    recipients: [recipient('a', true, 'a@example.invalid'), recipient('b', false, null)]
  });
  return { folder, request, inspect, apply, finalize, people, household, recipient, audience, clean, map,
    collection: collected.file, file: path.join(folder, 'audience', 'audience.json') };
}

test('households expand to editable individuals with reasons and visible missing, ambiguous, invalid and duplicate addresses', t => {
  const f = fixture(t);
  assert.equal(f.inspect().revision, 0);
  assert.equal(fs.existsSync(path.dirname(f.file)), false);
  const result = f.apply(f.audience);
  assert.equal(result.candidates.length, 4);
  assert.equal(result.finalRecipients, null);
  assert.equal(result.exitCode, 2);
  for (const code of ['missing_address', 'ambiguous_address', 'invalid_address', 'duplicate_address_option', 'wording_required']) {
    assert.ok(result.issues.some(issue => issue.code === code), code);
  }
  assert.ok(result.candidates.every(candidate => candidate.reason && candidate.selectionOrigin === 'household'));
  assert.ok(result.candidates.every(candidate => candidate.wording === null));
  const original = fs.readFileSync(f.file);
  assert.throws(f.finalize, { code: 'audience_unresolved' });
  assert.deepEqual(fs.readFileSync(f.file), original);
  const edited = f.apply(f.clean());
  assert.equal(edited.candidates.find(candidate => candidate.personId === f.people.b).included, false);
  assert.ok(!edited.issues.some(issue => issue.blocking));
  assert.equal(edited.finalRecipients, null);
  const finalized = f.finalize();
  assert.equal(finalized.reviewed, true);
  assert.equal(finalized.exitCode, 0);
  assert.deepEqual(finalized.finalRecipients, [{
    householdId: 'household-a', personId: f.people.a, address: 'a@example.invalid',
    reason: 'Explicit synthetic member selection', wording: preference
  }]);
  assert.deepEqual(f.inspect().finalRecipients, finalized.finalRecipients);
});

test('duplicate selected recipients block finalization; individual additions and wording overrides require explicit text', t => {
  const f = fixture(t);
  const selected = f.clean();
  selected.recipients = [f.recipient('a', true, 'SHARED@example.invalid'), f.recipient('b', true, 'shared@example.invalid')];
  assert.ok(f.apply(selected).issues.some(issue => issue.code === 'duplicate_recipient' && issue.blocking));
  assert.throws(f.finalize, { code: 'audience_unresolved' });
  selected.households[0].included = false;
  selected.recipients = [f.recipient('a', false, null), f.recipient('b', true, 'shared@example.invalid', {
    text: 'Use my explicitly requested Christian wording.', reason: 'Synthetic direct wording request; no beliefs inferred.'
  })];
  const result = f.apply(selected);
  assert.equal(result.candidates.find(candidate => candidate.personId === f.people.b).wordingOrigin, 'individual');
  assert.equal(f.finalize().finalRecipients[0].wording.text, selected.recipients[1].wording.text);
  const edited = f.apply({ ...selected, purpose: 'Edited synthetic purpose' });
  assert.equal(edited.reviewed, false);
  assert.equal(edited.finalRecipients, null);
  assert.throws(() => f.apply({ ...selected, beliefs: 'Unsupported classification' }), /Unsupported/);
});

test('exact revisions and inputs prevent stale review; unavailable sources stay explicit with exit 2', t => {
  const f = fixture(t);
  f.apply(f.clean());
  f.finalize();
  const current = f.inspect();
  const request = { ...f.request, reason: 'Synthetic stale review', expectedRevision: current.revision, inputsDigest: current.inputsDigest };
  assert.throws(() => audienceReview({ ...request, expectedRevision: 0 }, f.folder, 'finalize'), { code: 'revision_conflict' });
  const collection = JSON.parse(fs.readFileSync(f.collection));
  collection.manifest.status = 'partial';
  collection.manifest.sources.push({ source: 'messenger', status: 'requires_setup', reason: 'Synthetic auth-limited source; no access authorized.' });
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  assert.throws(() => audienceReview(request, f.folder, 'finalize'), { code: 'input_conflict' });
  const stale = f.inspect();
  assert.equal(stale.reviewStale, true);
  assert.equal(stale.finalRecipients, null);
  assert.equal(stale.sources.at(-1).status, 'requires_setup');
  const result = f.finalize();
  assert.equal(result.reviewed, true);
  assert.equal(result.exitCode, 2);
  assert.equal(result.sources.at(-1).reason, collection.manifest.sources.at(-1).reason);
});

test('changed identities and household memberships invalidate reviewed output without altering source or curated records', t => {
  const f = fixture(t);
  const curatedRequest = { schemaVersion: 1, dataClass: 'synthetic', collection: f.collection, mapping: 'mapping', output: 'curated' };
  const current = curate(curatedRequest, f.folder, true);
  const curated = curate({ ...curatedRequest, reason: 'Synthetic original context', expectedRevision: 0, mappingDigest: current.mappingDigest,
    operations: [{ type: 'note', id: 'note-a', originalText: 'SYNTHETIC-NOTE-NOT-FOR-OUTREACH', encounteredOn: null, households: ['household-a'], people: [] }] }, f.folder);
  const protectedFiles = [f.collection, path.join(f.folder, 'mapping', 'identity-review.json'), curated.file];
  const originals = protectedFiles.map(file => fs.readFileSync(file));
  f.apply(f.clean());
  const result = f.finalize();
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC-NOTE-NOT-FOR-OUTREACH/);
  protectedFiles.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), originals[i]));
  f.map([{ type: 'household', id: 'household-a', label: 'Synthetic changed membership', people: [f.people.b] }]);
  assert.ok(f.inspect().issues.some(issue => issue.code === 'household_membership_changed'));
  assert.equal(f.inspect().finalRecipients, null);
  assert.throws(f.finalize, { code: 'audience_unresolved' });
  const collection = JSON.parse(fs.readFileSync(f.collection));
  const identity = Object.values(collection.reconciliation.records).find(entry => entry.record.displayName === 'Synthetic B');
  identity.record.addresses = [{ type: 'email', value: 'changed@example.invalid' }];
  fs.writeFileSync(f.collection, JSON.stringify(collection));
  const edited = f.clean();
  edited.recipients = [f.recipient('b', true, 'shared@example.invalid')];
  const inspection = f.apply(edited);
  assert.ok(inspection.issues.some(issue => issue.code === 'identity_changed' && issue.blocking));
  assert.ok(inspection.issues.some(issue => issue.code === 'address_not_current' && issue.blocking));
});

test('invalid edits, locks and atomic-write failures preserve the previous review', t => {
  const f = fixture(t);
  f.apply(f.clean());
  const before = fs.readFileSync(f.file);
  const invalid = [
    { ...f.clean(), recipients: [f.recipient('a', true, 'a@example.invalid\r\nBcc: other@example.invalid')] },
    { ...f.clean(), recipients: [f.recipient('c', false, null), f.recipient('c', true, null)] },
    { ...f.clean(), households: [f.household('missing')] },
    { ...f.clean(), recipients: [{ ...f.recipient('a', true, null), personId: f.people.c }] },
    { ...f.clean(), households: [{ ...f.household('household-a'), wording: { text: 'Unexplained' } }] }
  ];
  for (const value of invalid) {
    assert.throws(() => f.apply(value));
    assert.deepEqual(fs.readFileSync(f.file), before);
  }
  const lock = path.join(path.dirname(f.file), 'audience.lock');
  fs.writeFileSync(lock, 'Synthetic writer lock');
  assert.throws(() => f.apply(f.clean()), { code: 'store_locked' });
  fs.unlinkSync(lock);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.file) throw Object.assign(new Error('Synthetic rename failure'), { code: 'EACCES' });
    return rename(from, to);
  });
  assert.throws(f.finalize, { code: 'EACCES' });
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['audience.json']);
});

test('inactive identities, reconciliation gaps, self recipients and an empty selection cannot produce a final list', t => {
  const f = fixture(t);
  f.apply(f.clean());
  f.finalize();
  const original = JSON.parse(fs.readFileSync(f.collection));
  const changed = structuredClone(original);
  const identity = Object.values(changed.reconciliation.records).find(entry => entry.record.displayName === 'Synthetic A');
  identity.record.deleted = true;
  fs.writeFileSync(f.collection, JSON.stringify(changed));
  assert.ok(f.inspect().issues.some(issue => issue.code === 'identity_inactive' && issue.blocking));
  assert.equal(f.inspect().finalRecipients, null);
  assert.throws(f.finalize, { code: 'audience_unresolved' });
  fs.writeFileSync(f.collection, JSON.stringify({ ...original, manifest: { ...original.manifest, reconciliationRequired: true } }));
  assert.ok(f.inspect().issues.some(issue => issue.code === 'reconciliation_required'));
  assert.throws(f.finalize, { code: 'audience_unresolved' });
  const self = structuredClone(original);
  Object.values(self.reconciliation.records).find(entry => entry.record.displayName === 'Synthetic A').record.isSelf = true;
  fs.writeFileSync(f.collection, JSON.stringify(self));
  assert.ok(f.inspect().issues.some(issue => issue.code === 'self_identity' && issue.blocking));
  fs.writeFileSync(f.collection, JSON.stringify(original));
  const empty = f.clean();
  empty.households.forEach(household => { household.included = false; });
  empty.recipients = [];
  assert.ok(f.apply(empty).issues.some(issue => issue.code === 'no_recipients' && issue.blocking));
  assert.throws(f.finalize, { code: 'audience_unresolved' });
});

test('private denial precedes all path access, unsafe outputs fail, and the real CLI returns 0/2/1', t => {
  const f = fixture(t);
  const denied = { ...f.request, dataClass: 'private', collection: 'DO-NOT-DISCLOSE', output: 'forbidden' };
  assert.throws(() => audienceReview(denied, f.folder), { code: 'private_collection_disabled' });
  assert.equal(fs.existsSync(path.join(f.folder, 'forbidden')), false);
  assert.throws(() => audienceReview({ ...f.request, output: path.resolve(__dirname, '..', '..', 'public') }, f.folder), { code: 'unsafe_output' });
  const run = (request, action) => {
    const file = path.join(f.folder, 'request.json');
    fs.writeFileSync(file, JSON.stringify(request));
    return spawnSync(process.execPath, [path.join(__dirname, 'audience.cjs'), action, file], { encoding: 'utf8' });
  };
  const pending = run(f.request, '--inspect');
  assert.equal(pending.status, 2, pending.stderr);
  assert.equal(JSON.parse(pending.stdout).heading, 'Heartbeat life-update audience review');
  const initial = f.inspect();
  const saved = run({ ...f.request, audience: f.clean(), expectedRevision: initial.revision,
    inputsDigest: initial.inputsDigest, reason: 'Synthetic CLI edit' }, '--request');
  assert.equal(saved.status, 2, saved.stderr);
  const current = f.inspect();
  const finalized = run({ ...f.request, expectedRevision: current.revision, inputsDigest: current.inputsDigest, reason: 'Synthetic CLI review' }, '--finalize');
  assert.equal(finalized.status, 0, finalized.stderr);
  assert.equal(JSON.parse(finalized.stdout).finalRecipients.length, 1);
  const failure = run(denied, '--request');
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, '');
  assert.match(failure.stderr, /private_collection_disabled/);
  assert.doesNotMatch(failure.stderr, /DO-NOT-DISCLOSE/);
});
