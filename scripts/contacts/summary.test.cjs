const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { collect } = require('./collect.cjs');
const { handoff } = require('./demo.cjs');
const { review } = require('./identity-review.cjs');
const { tempFolder, mappingFixture } = require('./fixtures.cjs');
const { summary, selectView, run } = require('./summary.cjs');

const period = { preset: 'custom', timeZone: 'America/Los_Angeles',
  start: '2026-10-31T07:00:00Z', end: '2026-11-03T08:00:00Z', asOf: '2026-11-03T08:00:00Z' };
const key = (source, type, id) => JSON.stringify([source, 'fixture-account', type, id]);
function fixture(t, change = () => {}) {
  const folder = tempFolder(t, 'heartbeat-summary-synthetic-');
  const inputs = [handoff('email', 'email'), handoff('text-messages', 'sms')];
  for (const input of inputs) {
    input.coverage = { start: period.start, end: period.end, completeness: 'complete', basis: 'Synthetic interval.' };
    const page = input.pages[0];
    page.retrievedAt = period.asOf;
    page.identities = ['self', 'a', 'b', 'idle'].map(id =>
      ({ id, idKind: 'provider', isSelf: id === 'self', displayName: 'Synthetic same name' }));
    page.threads = ['direct', 'group'].map(id => ({ id, idKind: 'local', kind: id }));
    page.memberships = ['self', 'a', 'b'].map(identityId => ({ threadId: 'group', identityId }))
      .concat(['self', 'a'].map(identityId => ({ threadId: 'direct', identityId })));
    page.events = [];
  }
  const message = (id, senderId, timestamp, extra = {}) => ({
    id, idKind: 'local', eventType: 'message', threadId: 'direct', senderId, timestamp,
    channel: 'email', classification: 'interpersonal',
    recipients: [{ identityId: senderId === 'self' ? 'a' : 'self', role: 'to' }], ...extra
  });
  inputs[0].pages[0].events = [
    message('start', 'self', period.start),
    message('fold-1', 'a', '2026-11-01T08:30:00Z'),
    message('fold-2', 'self', '2026-11-01T09:30:00Z'),
    message('group-b', 'b', '2026-11-01T10:00:00Z', { threadId: 'group' }),
    message('group-self', 'self', '2026-11-01T11:00:00Z', { threadId: 'group' }),
    message('cc', 'a', '2026-11-01T12:00:00Z', { recipients: [{ identityId: 'self', role: 'cc' }] }),
    message('bulk', 'a', '2026-11-01T12:00:00Z', { classification: 'bulk' }),
    message('outside', 'a', period.end)
  ];
  inputs[1].pages[0].events = [message('text', 'a', '2026-11-01T13:00:00Z', { channel: 'sms' })];
  const request = { schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: inputs.map(input => ({ source: input.source, account: input.account, connector: input.connector,
      mode: 'metadata-import', input: `${input.source}.json` })) };
  change(inputs, request);
  for (const input of inputs) fs.writeFileSync(path.join(folder, `${input.source}.json`), JSON.stringify(input));
  const collected = collect(request, folder);
  const identityMapping = mappingFixture(folder, collected.file, 'mapping', 'Synthetic separate identities.');
  const inspection = identityMapping.inspect();
  identityMapping.apply([]);
  const mappingFile = path.join(folder, 'mapping', 'identity-review.json');
  const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
  const collection = JSON.parse(fs.readFileSync(collected.file, 'utf8'));
  assert.ok(collection.manifest.sources.filter(source => source.connector === 'synthetic-handoff')
    .every(source => source.status === 'collected' || source.status === 'partial'), JSON.stringify(collection.manifest.sources));
  const options = { period, channels: ['email', 'sms'], collectionDigest: inspection.collectionDigest, identityMappingRevision: 1 };
  const cliRequest = { schemaVersion: 1, dataClass: 'synthetic', collection: collected.file,
    mapping: mappingFile, period, channels: options.channels, identityMappingRevision: 1, output: 'report' };
  return { folder, collection, mapping, options, cliRequest, collectionFile: collected.file, mappingFile,
    build: (extra = {}) => summary(collection, mapping, { ...options, ...extra }) };
}
function reconciles(report) {
  const { summary: { metrics }, peopleTable, perChannel, timeline } = report.views;
  const events = report.evidence.events.filter(row => row.disposition === 'included');
  assert.equal(metrics.messages.observed, events.length);
  assert.equal(perChannel.reduce((sum, row) => sum + row.observedMessages, 0), events.length);
  assert.equal(timeline.reduce((sum, row) => sum + row.observedMessages, 0), events.length);
  assert.equal(metrics.observedDirectPeople + metrics.observedGroupOnlyPeople + metrics.noObservedActivityPeople,
    metrics.cohortPeople);
  assert.equal(peopleTable.reduce((sum, row) => sum + row.observedDirectMessages.observed, 0),
    events.flatMap(row => row.personAttributions).filter(row => row.kind.startsWith('direct-')).length);
  for (const person of peopleTable) {
    assert.equal(person.perChannel.reduce((sum, row) => sum + row.direct.messages.observed, 0),
      person.observedDirectMessages.observed);
    assert.equal(person.perChannel.reduce((sum, row) => sum + row.groupPosted, 0), person.group.observedPosted);
  }
  for (const day of timeline) {
    assert.equal(day.perChannel.reduce((sum, row) => sum + row.messages.observed, 0), day.observedMessages);
    assert.equal(day.sent + day.received + day.other, day.observedMessages);
  }
  assert.equal(report.context.audit.includedMessages, events.length);
}

test('one fixed fixture drives summary, people, channels and DST calendar without role/group fan-out', t => {
  const f = fixture(t);
  const original = JSON.stringify([f.collection, f.mapping, f.options]);
  const report = f.build();
  reconciles(report);
  assert.deepEqual(report.views.summary.metrics, {
    messages: { observed: 7, total: 7, certainty: 'exact' }, sent: 3, received: 4, other: 0,
    activeDays: 2, latestObserved: '2026-11-01T13:00:00.000Z',
    cohortPeople: 6, observedDirectPeople: 2, observedGroupOnlyPeople: 1, noObservedActivityPeople: 3
  });
  assert.match(report.views.summary.statements[0], /messages: 7 \(exact; complete total 7\)/);
  assert.equal(report.context.exclusions.bulk, 1);
  assert.equal(report.context.exclusions.outsidePeriod, 1);
  assert.deepEqual(report.views.timeline.map(row => [row.date, row.observedMessages]),
    [['2026-10-31', 1], ['2026-11-01', 6], ['2026-11-02', 0]]);
  const fold = report.views.timeline[1];
  assert.equal(Date.parse(fold.end) - Date.parse(fold.start), 25 * 3600000);
  assert.equal(fold.partialDay, false);
  assert.equal(report.views.timeline[2].messages.certainty, 'exact');
  const idle = report.views.peopleTable.find(row => row.identityKeys.includes(key('email', 'identity', 'idle')));
  assert.equal(idle.observedDirectMessages.total, 0);
  assert.equal(idle.latestObserved, null);
  assert.equal(report.views.peopleTable.find(row => row.identityKeys.includes(key('email', 'identity', 'b'))).groupOnly, true);
  assert.deepEqual(f.build(), report);
  assert.equal(JSON.stringify([f.collection, f.mapping, f.options]), original);
});

test('standalone views retain identical period, binding, exclusions, freshness, coverage and report digest', t => {
  const f = fixture(t, (inputs, request) => {
    inputs[0].pages[0].retrievedAt = '2026-11-04T08:00:00Z';
    request.sources.push({ source: 'messenger', account: 'fixture-unavailable', connector: 'none',
      mode: 'unavailable', status: 'requires_setup', reason: 'Synthetic auth-limited source; not empty.' });
  });
  const report = f.build();
  reconciles(report);
  assert.equal(report.context.exitCode, 2);
  assert.equal(report.context.coverage, 'complete-declared');
  assert.equal(report.context.sourceFreshness.find(row => row.source === 'messenger').relationToAsOf, 'unknown');
  assert.equal(report.context.sourceFreshness.find(row => row.source === 'email').relationToAsOf, 'after');
  assert.match(report.context.sources.find(row => row.source === 'messenger').reason, /auth-limited/);
  const digests = [];
  for (const name of Object.keys(report.views)) {
    const output = selectView(report, name);
    assert.deepEqual(output.context, report.context);
    assert.deepEqual(output.data, report.views[name]);
    digests.push(output.reportDigest);
    output.context.sources.length = 0;
    assert.equal(report.context.sources.length, 3);
  }
  assert.equal(new Set(digests).size, 1);
  assert.throws(() => selectView(report, 'invented'), /Invalid/);
  const withUnrequestedChannel = f.build({ channels: ['email', 'sms', 'whatsapp'] });
  assert.ok(withUnrequestedChannel.views.peopleTable.every(person =>
    person.perChannel.find(row => row.channel === 'whatsapp').direct.messages.certainty === 'unknown'));
});

test('partial and unavailable sources stay lower-bound/unknown, including empty days and inactive cohort', t => {
  const f = fixture(t, (inputs, request) => {
    inputs[0].coverage.completeness = 'partial';
    request.sources.push({ source: 'messenger', account: 'fixture-unavailable', connector: 'none',
      mode: 'unavailable', status: 'unsupported', reason: 'Synthetic unsupported route.' });
  });
  f.collection.reconciliation.records[key('email', 'identity', 'idle')].record.deleted = true;
  const report = f.build({ channels: ['email', 'sms', 'messenger'] });
  reconciles(report);
  assert.equal(report.views.summary.metrics.messages.certainty, 'lower_bound');
  assert.equal(report.context.exitCode, 2);
  assert.equal(report.views.timeline[2].messages.total, null);
  assert.equal(report.views.timeline[2].messages.certainty, 'unknown');
  assert.equal(report.views.perChannel.find(row => row.channel === 'messenger').messages.total, null);
  assert.equal(report.views.timeline[1].perChannel.find(row => row.channel === 'messenger').messages.certainty, 'unknown');
  const idle = report.views.peopleTable.find(row => row.inactiveIdentityKeys.includes(key('email', 'identity', 'idle')));
  assert.equal(idle.cohortState, 'inactive');
  assert.equal(idle.activeDays, 0);
  assert.equal(idle.observedDirectMessages.certainty, 'unknown');
  assert.equal(report.views.peopleTable.length, 6);
});

test('7d/30d and partial custom days use the same filtered ledger and union calendar dates', t => {
  const f = fixture(t);
  for (const preset of ['7d', '30d']) {
    const report = f.build({ period: { preset, timeZone: period.timeZone, asOf: '2026-11-03T20:00:00Z' } });
    reconciles(report);
    assert.equal(report.views.timeline.length, preset === '7d' ? 7 : 30);
    assert.equal(report.views.timeline.at(-1).date, '2026-11-03');
    assert.equal(report.views.timeline.at(-1).partialDay, true);
    assert.equal(report.context.period.currentDayPartial, true);
    assert.equal(report.views.summary.metrics.messages.total, null);
  }
  const report = f.build({ channels: ['sms'], period: { ...period,
    start: '2026-11-01T08:00:00Z', end: '2026-11-01T14:00:00Z' } });
  reconciles(report);
  assert.equal(report.views.timeline.length, 1);
  assert.equal(report.views.timeline[0].partialDay, true);
  assert.equal(report.views.summary.metrics.messages.observed, 1);
  assert.deepEqual(report.context.filters.channels, ['sms']);
  assert.equal(report.context.exclusions.channelFiltered, 8);
});

test('local calendar skips nonexistent dates and excludes an end-at-midnight date', t => {
  const f = fixture(t, inputs => inputs.forEach(input => { input.pages[0].events = []; }));
  const report = f.build({ period: { preset: 'custom', timeZone: 'Pacific/Apia',
    start: '2011-12-29T10:00:00Z', end: '2011-12-31T10:00:00Z', asOf: period.asOf } });
  assert.deepEqual(report.views.timeline.map(row => row.date), ['2011-12-29', '2011-12-31']);
  assert.ok(report.views.timeline.every(row => row.partialDay === false));
  assert.equal(report.views.summary.metrics.messages.certainty, 'unknown');
});

test('complete empty evidence is known zero; reviewed cross-channel people retain union days and channel counts', t => {
  const empty = fixture(t, inputs => inputs.forEach(input => { input.pages[0].events = []; }));
  const zero = empty.build();
  reconciles(zero);
  assert.deepEqual(zero.views.summary.metrics.messages, { observed: 0, total: 0, certainty: 'exact' });
  assert.equal(zero.views.peopleTable.length, 6);
  assert.ok(zero.views.timeline.every(day => day.messages.total === 0));
  const f = fixture(t);
  const a = source => f.mapping.history[0].after.assignments[key(source, 'identity', 'a')];
  review({ schemaVersion: 1, dataClass: 'synthetic', collection: f.collectionFile,
    output: 'mapping', expectedRevision: 1, collectionDigest: f.options.collectionDigest,
    reason: 'Synthetic cross-channel provider equivalence.', operations: [{
      type: 'merge', people: [a('email'), a('text-messages')], into: a('email'),
      evidence: [{ kind: 'provider', identityKeys: [key('email', 'identity', 'a'), key('text-messages', 'identity', 'a')],
        reference: 'Synthetic explicit reviewed link.' }]
    }] }, f.folder);
  const mapping = JSON.parse(fs.readFileSync(f.mappingFile, 'utf8'));
  const report = summary(f.collection, mapping, { ...f.options, identityMappingRevision: 2 });
  reconciles(report);
  const person = report.views.peopleTable.find(row => row.personId === a('email'));
  assert.deepEqual(person.perChannel.map(row => row.direct.messages.observed), [3, 1]);
  assert.equal(person.activeDays, 2);
  assert.equal(person.direct.bothPostedDates.length, 1);
  assert.equal(report.views.summary.metrics.observedDirectPeople, 1);
  assert.equal(report.evidence.personAliases.length, 1);
});

test('CLI saves one immutable dataset, preserves inputs and exposes 0/2/1 without private access', t => {
  const f = fixture(t);
  const before = [f.collectionFile, f.mappingFile].map(file => fs.readFileSync(file));
  const cli = path.join(__dirname, 'summary.cjs');
  const requestFile = path.join(f.folder, 'summary.synthetic.json');
  function invoke(request) {
    fs.writeFileSync(requestFile, JSON.stringify(request));
    return spawnSync(process.execPath, [cli, '--request', requestFile], { encoding: 'utf8' });
  }
  const success = invoke(f.cliRequest);
  assert.equal(success.status, 0, success.stderr);
  const file = JSON.parse(success.stdout).file;
  const saved = fs.readFileSync(file);
  reconciles(JSON.parse(saved));
  assert.equal(invoke(f.cliRequest).status, 1);
  assert.deepEqual(fs.readFileSync(file), saved);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['report.json']);
  const partial = invoke({ ...f.cliRequest, output: 'partial',
    period: { preset: '7d', timeZone: period.timeZone, asOf: '2026-11-03T20:00:00Z' } });
  assert.equal(partial.status, 2, partial.stderr);
  assert.equal(JSON.parse(partial.stdout).status, 'partial');
  const privateRequest = { ...f.cliRequest, dataClass: 'private', collection: 'must-not-read',
    mapping: 'must-not-read', output: 'denied' };
  const denied = invoke(privateRequest);
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /private_collection_disabled/);
  assert.doesNotMatch(denied.stderr, /must-not-read|fixture-account/);
  assert.equal(fs.existsSync(path.join(f.folder, 'denied')), false);
  const privateCollection = path.join(f.folder, 'private-snapshot.json');
  fs.writeFileSync(privateCollection, JSON.stringify({ dataClass: 'private' }));
  const snapshotDenied = invoke({ ...f.cliRequest, collection: privateCollection,
    mapping: 'must-not-read', output: 'denied' });
  assert.equal(snapshotDenied.status, 1);
  assert.match(snapshotDenied.stderr, /private_collection_disabled/);
  assert.doesNotMatch(snapshotDenied.stderr, /must-not-read/);
  assert.throws(() => run({ ...f.cliRequest, output: path.join(__dirname, 'unsafe-output') }, f.folder), /Output inside/);
  assert.throws(() => run({ ...f.cliRequest, identityMappingRevision: 99 }, f.folder), /bind/);
  assert.throws(() => run({ ...f.cliRequest, channels: [] }, f.folder), /channel/);
  assert.throws(() => run({ ...f.cliRequest, dataClass: 'synthetic', extra: true }, f.folder), /unsupported/);
  assert.deepEqual([f.collectionFile, f.mappingFile].map(input => fs.readFileSync(input)), before);
});
