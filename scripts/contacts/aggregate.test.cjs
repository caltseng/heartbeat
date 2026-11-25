const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { collect } = require('./collect.cjs');
const { handoff } = require('./demo.cjs');
const { review } = require('./identity-review.cjs');
const { tempFolder, mappingFixture } = require('./fixtures.cjs');
const { aggregate, run } = require('./aggregate.cjs');
const { readCollection } = require('./collection-store.cjs');

const period = { preset: 'custom', timeZone: 'America/Los_Angeles',
  start: '2026-10-31T07:00:00Z', end: '2026-11-03T08:00:00Z', asOf: '2026-11-03T08:00:00Z' };
const key = (source, type, id) => JSON.stringify([source, 'fixture-account', type, id]);
function message(id, senderId, timestamp, extra = {}) {
  return { id, idKind: 'provider', eventType: 'message', threadId: 'direct', senderId, timestamp,
    channel: 'email', classification: 'interpersonal',
    recipients: [{ identityId: senderId === 'self' ? 'a' : 'self', role: 'to' }], ...extra };
}
function fixture(t, change = () => {}) {
  const folder = tempFolder(t, 'contacts-aggregate-synthetic-');
  const inputs = [
    handoff('email', 'email'), handoff('text-messages', 'sms'),
    handoff('whatsapp', 'whatsapp'), handoff('google-contacts', null)
  ];
  for (const input of inputs) {
    input.coverage = { start: period.start, end: period.end, completeness: 'complete', basis: 'Synthetic interval.' };
    const page = input.pages[0];
    page.retrievedAt = period.asOf;
    page.identities = ['self', 'a', 'b', 'c', 'idle'].map(id =>
      ({ id, idKind: 'provider', isSelf: id === 'self', displayName: 'Same synthetic name' }));
    page.threads = input.source === 'google-contacts' ? [] : [
      { id: 'direct', idKind: 'provider', kind: 'direct' },
      { id: 'group', idKind: 'provider', kind: 'group' },
      { id: 'broadcast', idKind: 'provider', kind: 'broadcast' }
    ];
    page.memberships = input.source === 'google-contacts' ? [] :
      ['self', 'a'].map(identityId => ({ threadId: 'direct', identityId })).concat(
        ['self', 'a', 'b', 'c'].map(identityId => ({ threadId: 'group', identityId })));
    page.events = [];
  }
  inputs[0].pages[0].events = [
    message('start', 'self', period.start),
    message('before', 'a', '2026-10-31T06:59:59.999Z'),
    message('end', 'a', period.end),
    message('fold-1', 'a', '2026-11-01T08:30:00Z'),
    message('fold-2', 'self', '2026-11-01T09:30:00Z'),
    message('cc', 'a', '2026-11-01T11:00:00Z', { recipients: [{ identityId: 'self', role: 'cc' }] }),
    message('group-b', 'b', '2026-11-02T10:00:00Z', { threadId: 'group' }),
    message('group-self', 'self', '2026-11-02T11:00:00Z', { threadId: 'group',
      recipients: ['a', 'b', 'c'].map(identityId => ({ identityId, role: 'recipient' })) }),
    message('group-a', 'a', '2026-11-02T12:00:00Z', { threadId: 'group' }),
    message('broadcast', 'self', '2026-11-02T12:30:00Z', { threadId: 'broadcast',
      recipients: [{ identityId: 'a', role: 'to' }, { identityId: 'b', role: 'to' }, { identityId: 'c', role: 'cc' }] }),
    ...['bulk', 'automated', 'unclassified'].map(classification =>
      message(classification, 'a', '2026-11-02T13:00:00Z', { classification })),
    message('reaction', 'a', '2026-11-02T13:00:00Z', { eventType: 'reaction' }),
    message('deletion', 'a', '2026-11-02T14:00:00Z', { eventType: 'deletion', targetId: 'fold-1' })
  ];
  inputs[1].pages[0].events = [
    message('fold-1', 'a', '2026-11-01T10:00:00Z', { channel: 'sms', recipients: [{ identityId: 'self', role: 'recipient' }] }),
    message('next-day', 'a', '2026-11-02T09:00:00Z', { channel: 'sms', recipients: [{ identityId: 'self', role: 'recipient' }] })
  ];
  const request = { schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: inputs.map(input => ({ source: input.source, account: input.account, connector: input.connector,
      mode: 'metadata-import', input: `${input.source}.${input.connector}.json` })) };
  change(inputs, request);
  for (const input of inputs) fs.writeFileSync(path.join(folder, `${input.source}.${input.connector}.json`), JSON.stringify(input));
  collect(request, folder);
  // Replay to prove source-event IDs, not import attempts or connector observations, are counted.
  const collected = collect(request, folder);
  const collection = readCollection(collected.file).value;
  const identityMapping = mappingFixture(folder, collected.file, 'review', 'Synthetic explicit registration.');
  const inspected = identityMapping.inspect();
  identityMapping.apply([]);
  const mappingFile = path.join(folder, 'review', 'identity-review.json');
  let mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
  const person = (source, id) => mapping.view.assignments[key(source, 'identity', id)];
  identityMapping.apply([{
    type: 'merge', people: [person('email', 'a'), person('text-messages', 'a')], into: person('email', 'a'),
    evidence: [{ kind: 'provider', identityKeys: [key('email', 'identity', 'a'), key('text-messages', 'identity', 'a')],
      reference: 'Synthetic reviewed provider equivalence.' }]
  }]);
  mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
  const options = { period, identityMappingRevision: 2, collectionDigest: inspected.collectionDigest };
  const reduce = (extra = {}) => aggregate(collection, mapping, { ...options, ...extra });
  return { folder, collection, mapping, options, reduce, person, collectionFile: collected.file, mappingFile,
    cliRequest: { schemaVersion: 1, dataClass: 'synthetic', collection: collected.file,
      mapping: mappingFile, identityMappingRevision: 2, period, output: 'report' } };
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function reconciles(result) {
  const included = result.events.filter(row => row.disposition === 'included');
  assert.equal(result.audit.uniqueSourceEvents, result.events.length);
  assert.equal(result.audit.includedMessages, included.length);
  assert.equal(result.audit.uniqueSourceEvents, result.audit.includedMessages + result.audit.excludedEvents);
  assert.equal(result.totals.observedMessages, included.length);
  for (const field of ['perSource', 'perChannel', 'perThread', 'daily']) {
    assert.equal(result[field].reduce((sum, row) => sum + (row.observedMessages ?? row.messages.observed), 0), included.length, field);
  }
  assert.equal(result.totals.sent + result.totals.received + result.totals.other, included.length);
  assert.equal(new Set(result.events.map(row => row.key)).size, result.events.length);
}

test('pure deterministic source-ID reducer reconciles half-open boundaries and discloses every exclusion', t => {
  const f = fixture(t);
  freeze(f.collection); freeze(f.mapping); freeze(f.options);
  const result = f.reduce();
  reconciles(result);
  assert.equal(result.totals.observedMessages, 10);
  assert.deepEqual(result.exclusions, { outsidePeriod: 2, channelFiltered: 0, nonMessage: 2,
    bulk: 1, automated: 1, unclassified: 1, unresolvedRevision: 0 });
  assert.equal(result.audit.deletedMessagesIncluded, 1);
  assert.equal(result.events.find(row => row.key === key('email', 'event', 'start')).disposition, 'included');
  assert.equal(result.events.find(row => row.key === key('email', 'event', 'end')).disposition, 'outsidePeriod');
  assert.equal(result.events.filter(row => row.key.endsWith('"fold-1"]')).length, 2);
  assert.equal(result.totals.messages.certainty, 'lower_bound');
  assert.equal(result.totals.messages.total, null);
  const reordered = structuredClone(f.collection);
  reordered.records = Object.fromEntries(Object.entries(reordered.records).reverse());
  reordered.reconciliation.records = Object.fromEntries(Object.entries(reordered.reconciliation.records).reverse());
  reordered.manifest.sources.reverse();
  assert.deepEqual(aggregate(reordered, f.mapping, f.options), result);
  assert.deepEqual(f.reduce(), result);
});

test('DST dates and reviewed cross-channel identity mappings form unions, not summed days', t => {
  const f = fixture(t);
  const result = f.reduce();
  const a = result.people.find(row => row.personId === f.person('email', 'a'));
  assert.deepEqual(a.direct.activeDates, ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(a.direct.bothPostedDates, ['2026-11-01']);
  assert.equal(a.activeDays, 3);
  assert.equal(a.direct.sent, 2);
  assert.equal(a.direct.received, 3);
  assert.equal(a.group.observedPosted, 1);
  assert.deepEqual(a.group.sharedParticipationDates, ['2026-11-02']);
  assert.equal(result.events.find(row => row.key === key('email', 'event', 'fold-1')).date, '2026-11-01');
  assert.equal(result.events.find(row => row.key === key('email', 'event', 'fold-2')).date, '2026-11-01');
  assert.deepEqual(result.totals.activeDates, ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(result.people.some(row => row.personId === f.person('text-messages', 'a') && row.identityKeys.length === 1), false);
  assert.equal(result.personAliases.length, 1);
  const firstRevision = f.reduce({ identityMappingRevision: 1 });
  assert.equal(firstRevision.people.find(row => row.personId === f.person('email', 'a')).direct.received, 1);
  assert.throws(() => f.reduce({ identityMappingRevision: 3 }), /bind/);
  assert.throws(() => f.reduce({ collectionDigest: 'a'.repeat(64) }), /bind/);
});

test('reviewed different-ID connector translations retain provenance without multiplying source events', t => {
  const f = fixture(t, (inputs, request) => {
    const alias = structuredClone(inputs[0]);
    alias.connector = 'second-synthetic-handoff';
    const mappings = alias.pages[0].events.map(event => {
      const targetId = event.id;
      event.id += '-alias';
      return { source: alias.source, account: alias.account, connector: alias.connector, type: 'event', id: event.id, targetId };
    });
    inputs.push(alias);
    request.sources.push({ source: alias.source, account: alias.account, connector: alias.connector,
      mode: 'metadata-import', input: `${alias.source}.${alias.connector}.json` });
    request.overlapReview = { revision: 'synthetic-overlap-1', reviewedAt: period.asOf,
      basis: 'Synthetic explicit same-provider-message translation.', mappings };
  });
  const result = f.reduce();
  reconciles(result);
  assert.equal(result.audit.uniqueSourceEvents, 17);
  assert.equal(result.audit.repeatedEventEvidence, 15);
  assert.equal(result.totals.observedMessages, 10);
  assert.equal(result.perSource.filter(row => row.source === 'email').length, 1);
  assert.equal(result.sources.filter(row => row.source === 'email').length, 2);
});

test('group-only activity, To/CC roles, passive membership and broadcast are not direct exchanges', t => {
  const f = fixture(t);
  const result = f.reduce();
  const b = result.people.find(row => row.personId === f.person('email', 'b'));
  const c = result.people.find(row => row.personId === f.person('email', 'c'));
  const a = result.people.find(row => row.personId === f.person('email', 'a'));
  assert.equal(b.groupOnly, true);
  assert.equal(b.group.observedPosted, 1);
  assert.equal(b.direct.sent + b.direct.received, 0);
  assert.equal(b.recipientRoles.to.selfSentTo, 1);
  assert.equal(c.activeDays, 0);
  assert.equal(c.group.observedPosted, 0);
  assert.equal(c.groupOnly, false);
  assert.equal(c.recipientRoles.cc.selfSentTo, 1);
  assert.equal(a.recipientRoles.cc.peerSentToSelf, 1);
  assert.equal(result.events.find(row => row.key === key('email', 'event', 'cc')).personAttributions.length, 0);
  assert.equal(result.events.find(row => row.key === key('email', 'event', 'broadcast')).personAttributions.length, 0);
  assert.ok(result.membershipLinks.some(row => row.personId === c.personId));
  const knownIdle = result.people.find(row => row.personId === f.person('google-contacts', 'idle'));
  assert.equal(knownIdle.activeDays, 0);
  assert.equal(knownIdle.latestObserved, null);
  assert.equal(knownIdle.observedDirectMessages.total, null);
});

test('shared group days require both people to post in the same thread on that date', t => {
  const f = fixture(t, inputs => {
    const page = inputs[0].pages[0];
    page.threads.push({ id: 'other-group', idKind: 'provider', kind: 'group' });
    page.events = [
      message('peer-post', 'b', '2026-11-01T10:00:00Z', { threadId: 'group' }),
      message('self-other-thread', 'self', '2026-11-01T11:00:00Z', { threadId: 'other-group' })
    ];
  });
  const b = f.reduce().people.find(row => row.personId === f.person('email', 'b'));
  assert.equal(b.group.observedPosted, 1);
  assert.deepEqual(b.group.sharedParticipationDates, []);
});

test('BCC-only receipt is not direct; recipient roles deduplicate canonical aliases and repeated recipients', t => {
  const f = fixture(t, inputs => {
    const page = inputs[0].pages[0];
    page.events = [
      message('bcc-only', 'a', '2026-11-01T10:00:00Z', { recipients: [{ identityId: 'self', role: 'bcc' }] }),
      message('repeated-group-recipient', 'self', '2026-11-01T11:00:00Z', { threadId: 'group',
        recipients: [{ identityId: 'b', role: 'to' }, { identityId: 'b', role: 'to' },
          { identityId: 'c', role: 'to' }, { identityId: 'b', role: 'cc' }] })
    ];
  });
  review({
    schemaVersion: 1, dataClass: 'synthetic', collection: f.collectionFile, output: 'review', expectedRevision: 2,
    collectionDigest: f.options.collectionDigest, reason: 'Synthetic explicit alias review.',
    operations: [{ type: 'merge', people: [f.person('email', 'b'), f.person('email', 'c')], into: f.person('email', 'b'),
      evidence: [{ kind: 'provider', identityKeys: [key('email', 'identity', 'b'), key('email', 'identity', 'c')],
        reference: 'Synthetic provider alias equivalence.' }] }]
  }, f.folder);
  const result = aggregate(f.collection, JSON.parse(fs.readFileSync(f.mappingFile, 'utf8')),
    { ...f.options, identityMappingRevision: 3, channels: ['email'] });
  reconciles(result);
  const a = result.people.find(row => row.personId === f.person('email', 'a'));
  const b = result.people.find(row => row.personId === f.person('email', 'b'));
  assert.equal(a.direct.received, 0);
  assert.equal(a.recipientRoles.bcc.peerSentToSelf, 1);
  assert.equal(b.recipientRoles.to.selfSentTo, 1);
  assert.equal(b.recipientRoles.cc.selfSentTo, 1);
  assert.equal(b.activeDays, 0);
});

test('spring-forward and preset periods retain actual instants and union calendar dates', t => {
  const spring = { preset: 'custom', timeZone: period.timeZone,
    start: '2026-03-07T08:00:00Z', end: '2026-03-10T07:00:00Z', asOf: '2026-03-10T07:00:00Z' };
  const f = fixture(t, (inputs, request) => {
    request.period = spring;
    for (const input of inputs) {
      input.coverage = { ...input.coverage, start: spring.start, end: spring.end };
      input.pages[0].retrievedAt = spring.asOf;
      input.pages[0].events = [];
    }
    inputs[0].pages[0].events = [
      message('before-jump', 'a', '2026-03-08T09:59:59Z'),
      message('after-jump', 'self', '2026-03-08T10:00:00Z'),
      message('next-midnight', 'a', '2026-03-09T07:00:00Z')
    ];
    inputs[1].pages[0].events = [message('same-day-sms', 'a', '2026-03-09T06:59:59Z', {
      channel: 'sms', recipients: [{ identityId: 'self', role: 'recipient' }]
    })];
  });
  const result = f.reduce({ period: spring });
  reconciles(result);
  assert.equal(result.totals.observedMessages, 4);
  assert.deepEqual(result.totals.activeDates, ['2026-03-08', '2026-03-09']);
  const peer = result.people.find(row => row.personId === f.person('email', 'a'));
  assert.equal(peer.activeDays, 2);
  assert.deepEqual(peer.direct.bothPostedDates, ['2026-03-08']);
  for (const preset of ['7d', '30d']) {
    const report = f.reduce({ period: { preset, timeZone: spring.timeZone, asOf: spring.asOf } });
    assert.equal(report.period.currentDayPartial, true);
    assert.equal(report.totals.observedMessages, 4);
    assert.equal(report.totals.messages.total, null);
    reconciles(report);
  }
});

test('complete empty sources mean zero; missing/unavailable/partial/failed coverage means unknown or lower bound', t => {
  const f = fixture(t, (inputs, request) => {
    inputs[0].pages[0].events = [];
    inputs[1].pages[0].events = [];
    request.sources.push({ source: 'messenger', account: 'unavailable-fixture', connector: 'none',
      mode: 'unavailable', status: 'requires_setup', reason: 'Synthetic unavailable route.' });
  });
  const result = f.reduce();
  reconciles(result);
  assert.deepEqual(result.totals.messages, { observed: 0, total: null, certainty: 'unknown' });
  assert.deepEqual(result.perChannel.find(row => row.channel === 'whatsapp').messages,
    { observed: 0, total: 0, certainty: 'exact' });
  assert.equal(result.perChannel.find(row => row.channel === 'messenger').messages.total, null);
  assert.equal(result.sources.find(row => row.source === 'messenger').reason, 'Synthetic unavailable route.');
  assert.equal(result.exitCode, 2);
  const onlyEmail = f.reduce({ channels: ['email'] });
  assert.deepEqual(onlyEmail.totals.messages, { observed: 0, total: 0, certainty: 'exact' });
  // Unavailable sources outside the numerical filter remain disclosed.
  assert.equal(onlyEmail.exitCode, 2);
  const g = fixture(t, inputs => {
    inputs[0].pages[0].events = inputs[0].pages[0].events.filter(row => row.classification !== 'unclassified');
  });
  assert.equal(g.reduce().totals.messages.total, 10);
  for (const status of ['partial', 'failed', 'unsupported', 'requires_setup']) {
    const collection = structuredClone(g.collection);
    collection.manifest.sources[0].status = status;
    const report = aggregate(collection, g.mapping, g.options);
    assert.equal(report.totals.messages.certainty, 'lower_bound');
    assert.equal(report.totals.messages.total, null);
  }
  const wider = { ...period, start: '2026-10-30T07:00:00Z' };
  assert.equal(g.reduce({ period: wider }).totals.messages.total, null);
});

test('thread coverage, retained out-of-manifest records and channel filters stay conservative', t => {
  const f = fixture(t, inputs => {
    inputs[0].pages[0].threadCoverage = [{ threadId: 'direct', ...inputs[0].coverage }];
  });
  const result = f.reduce();
  assert.equal(result.sources.find(row => row.source === 'email').status, 'partial');
  assert.equal(result.perSource.find(row => row.source === 'email').messages.total, null);
  const sms = f.reduce({ channels: ['sms'] });
  reconciles(sms);
  assert.equal(sms.totals.messages.total, 2);
  assert.equal(sms.exclusions.channelFiltered, 15);
  const retained = structuredClone(f.collection);
  retained.manifest.sources = retained.manifest.sources.filter(row => row.source !== 'text-messages');
  const report = aggregate(retained, f.mapping, f.options);
  assert.equal(report.sources.find(row => row.source === 'text-messages').status, 'not_requested');
  assert.equal(report.perSource.find(row => row.source === 'text-messages').messages.certainty, 'lower_bound');
});

test('current revisions, historical thread kind, collisions and inactive/unreviewed identities remain explicit', t => {
  const f = fixture(t);
  const collection = structuredClone(f.collection);
  const eventKey = key('email', 'event', 'start');
  const old = collection.reconciliation.records[eventKey];
  collection.records[eventKey].revisions.push({ id: 'new', supersedes: '$initial',
    record: { ...old.record, classification: 'bulk' }, provenance: [{
      context: { threadKind: 'group' }
    }] });
  collection.reconciliation.records[eventKey] = { ...old, revision: 'new',
    record: { ...old.record, classification: 'bulk' } };
  collection.reconciliation.records[key('email', 'thread', 'direct')].record.kind = 'group';
  const collisionKey = key('email', 'event', 'fold-2');
  delete collection.reconciliation.records[collisionKey];
  collection.reconciliation.collisions.push({ key: collisionKey, revisions: ['$initial', 'branch'] });
  collection.reconciliation.pendingTargets.push(key('email', 'event', 'historical-deletion'));
  collection.reconciliation.records[key('email', 'identity', 'b')].record.deleted = true;
  const mapping = structuredClone(f.mapping);
  delete mapping.history[1].after.assignments[key('email', 'identity', 'a')];
  const report = aggregate(collection, mapping, f.options);
  reconciles(report);
  assert.equal(report.events.find(row => row.key === eventKey).disposition, 'bulk');
  assert.equal(report.exclusions.unresolvedRevision, 1);
  assert.equal(report.events.find(row => row.key === key('email', 'event', 'fold-1')).threadKind, 'direct');
  assert.ok(report.unresolvedIdentities.includes(key('email', 'identity', 'a')));
  assert.ok(report.unresolvedReferences.some(row => row.identityKey === key('email', 'identity', 'b')));
  assert.equal(report.people.find(row => row.personId === f.person('email', 'b')).cohortState, 'inactive');
  assert.equal(report.people.find(row => row.personId === f.person('email', 'b')).group.observedPosted, 0);
  assert.equal(report.reconciliation.pendingTargets.length, 1);
  assert.equal(report.exitCode, 2);
});

test('CLI persists only local immutable output with 0/2/1 exits and denies private runs before input access', t => {
  const f = fixture(t);
  const cli = request => {
    const file = path.join(f.folder, 'aggregate-request.json');
    fs.writeFileSync(file, JSON.stringify(request));
    return spawnSync(process.execPath, [path.join(__dirname, 'aggregate.cjs'), '--request', file], { encoding: 'utf8' });
  };
  const originalCollection = fs.readFileSync(f.collectionFile);
  const originalMapping = fs.readFileSync(f.mappingFile);
  const partial = cli(f.cliRequest);
  assert.equal(partial.status, 2, partial.stderr);
  const output = JSON.parse(fs.readFileSync(path.join(f.folder, 'report', 'aggregates.json')));
  reconciles(output);
  const immutable = cli(f.cliRequest);
  assert.equal(immutable.status, 1);
  assert.match(immutable.stderr, /EEXIST/);
  const complete = cli({ ...f.cliRequest, output: 'complete', channels: ['sms'] });
  assert.equal(complete.status, 0, complete.stderr);
  const privateRun = cli({ ...f.cliRequest, dataClass: 'private', collection: 'do-not-read-secret.json', output: 'denied' });
  assert.equal(privateRun.status, 1);
  assert.match(privateRun.stderr, /private_collection_disabled/);
  assert.doesNotMatch(privateRun.stderr, /do-not-read-secret|fixture-account/);
  assert.equal(fs.existsSync(path.join(f.folder, 'denied')), false);
  assert.throws(() => run({ ...f.cliRequest, identityMappingRevision: 99, output: 'bad-revision' }, f.folder), /bind/);
  assert.equal(fs.existsSync(path.join(f.folder, 'bad-revision')), false);
  assert.throws(() => run({ ...f.cliRequest, output: path.resolve(__dirname, '..', '..', 'tracked-report') }, f.folder),
    error => error.code === 'unsafe_output');
  assert.throws(() => aggregate({ ...f.collection, dataClass: 'private' }, f.mapping, f.options),
    error => error.code === 'private_collection_disabled');
  const privateSnapshot = path.join(f.folder, 'private-snapshot.json');
  fs.writeFileSync(privateSnapshot, JSON.stringify({ dataClass: 'private' }));
  const deniedSnapshot = cli({ ...f.cliRequest, collection: privateSnapshot, mapping: 'must-not-read.json', output: 'private-denied' });
  assert.equal(deniedSnapshot.status, 1);
  assert.match(deniedSnapshot.stderr, /private_collection_disabled/);
  assert.doesNotMatch(deniedSnapshot.stderr, /must-not-read/);
  assert.equal(fs.existsSync(path.join(f.folder, 'private-denied')), false);
  assert.throws(() => f.reduce({ channels: ['not-a-channel'] }), /channel/);
  assert.deepEqual(fs.readFileSync(f.collectionFile), originalCollection);
  assert.deepEqual(fs.readFileSync(f.mappingFile), originalMapping);
});
