const fs = require('node:fs');
const path = require('node:path');
const { hashJSON, publish, runCLI, readJSON, requireValue, object, outputLocation } = require('./lib.cjs');
const { aggregate } = require('./aggregate.cjs');
const { curate } = require('./curated.cjs');

const DAY = 86400000;
const TUNING = Object.freeze({ minimumWindowDays: 28, minimumBaselineMessages: 8,
  minimumBaselineActiveDays: 4, maximumCurrentToBaselineRatio: 0.5 });

function localDate(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function direct(person) {
  return { messages: person.observedDirectMessages,
    activeDays: person.direct.activeDates.length, latestObserved: person.direct.latestObserved };
}
function run(request, folder = process.cwd()) {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'mapping', 'curated',
    'identityMappingRevision', 'baselinePeriod', 'currentPeriod', 'channels', 'output'], 'request');
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private opportunities are disabled; only schemaVersion 1 synthetic requests are supported.',
    'private_collection_disabled');
  requireValue(['collection', 'mapping', 'curated', 'output'].every(field =>
    typeof request[field] === 'string' && request[field].trim().length > 0),
  'Explicit collection, mapping directory, curated directory and output paths are required.');
  const collection = readJSON(path.resolve(folder, request.collection));
  requireValue(collection.value.dataClass === 'synthetic', 'Private opportunities are disabled.',
    'private_collection_disabled');
  const mapping = readJSON(path.resolve(folder, request.mapping, 'identity-review.json'));
  const options = { collectionDigest: collection.digest,
    identityMappingRevision: request.identityMappingRevision, channels: request.channels };
  const baseline = aggregate(collection.value, mapping.value, { ...options, period: request.baselinePeriod });
  const current = aggregate(collection.value, mapping.value, { ...options, period: request.currentPeriod });
  const before = baseline.period, now = current.period;
  const duration = Date.parse(now.end) - Date.parse(now.start);
  requireValue(before.end === now.start && before.asOf === now.asOf && before.timeZone === now.timeZone &&
    Date.parse(before.end) - Date.parse(before.start) === duration,
  'Baseline and current periods must be adjacent, equal elapsed durations with the same zone and asOf.');
  const curated = curate({ schemaVersion: 1, dataClass: 'synthetic',
    collection: request.collection, mapping: request.mapping, output: request.curated }, folder, true);
  requireValue(curated.mappingRevision === request.identityMappingRevision &&
    curated.collectionDigest === collection.digest,
  'Curated inspection and activity must use the same current mapping revision and collection.', 'mapping_conflict');
  // Use retained history, not just the comparison windows, to explain last observed contact.
  const historyStart = Object.values(collection.value.reconciliation.records)
    .filter(row => row.record.type === 'event').map(row => row.record.timestamp)
    .reduce((earliest, value) => Date.parse(value) < Date.parse(earliest) ? value : earliest, before.start);
  const history = aggregate(collection.value, mapping.value, { ...options,
    period: { preset: 'custom', timeZone: now.timeZone, asOf: now.asOf,
      start: historyStart, end: now.end } });
  const coverageIssues = [];
  if ([baseline, current].some(report => report.status !== 'complete' ||
      report.perChannel.some(row => row.messages.certainty !== 'exact'))) {
    coverageIssues.push('incomplete_or_uncertain_coverage');
  }
  if (duration < TUNING.minimumWindowDays * DAY) coverageIssues.push('insufficient_window');
  const people = current.people.map(person => {
    const prior = baseline.people.find(row => row.personId === person.personId);
    const retained = history.people.find(row => row.personId === person.personId);
    const reasons = [...coverageIssues];
    if (person.cohortState !== 'current') reasons.push('inactive_or_unassigned_identity');
    if (prior.observedDirectMessages.certainty !== 'exact' ||
        person.observedDirectMessages.certainty !== 'exact') reasons.push('uncertain_person_attribution');
    if (prior.direct.sent + prior.direct.received < TUNING.minimumBaselineMessages ||
        prior.direct.activeDates.length < TUNING.minimumBaselineActiveDays) reasons.push('insufficient_person_baseline');
    const ratio = prior.observedDirectMessages.observed > 0 ?
      person.observedDirectMessages.observed / prior.observedDirectMessages.observed : null;
    const decline = reasons.length === 0 && ratio <= TUNING.maximumCurrentToBaselineRatio;
    return { personId: person.personId, cohortState: person.cohortState,
      baseline: direct(prior), current: direct(person),
      lastObservedDirectContact: retained.direct.latestObserved,
      lastObservedActivity: retained.latestObserved,
      coverage: { baselineExact: prior.observedDirectMessages.certainty === 'exact',
        currentExact: person.observedDirectMessages.certainty === 'exact', suppressionReasons: reasons },
      currentToBaselineRatio: ratio, signal: decline ? 'covered_direct_decline' : null,
      reason: decline ?
        `Observed direct messages decreased from ${prior.observedDirectMessages.observed} to ` +
        `${person.observedDirectMessages.observed} across equal covered windows; proposed ratio threshold <= ${TUNING.maximumCurrentToBaselineRatio}.` :
        reasons.length ? `No decline assessment: ${reasons.join(', ')}.` : 'No proposed decline threshold crossed.' };
  });
  const asOfDate = localDate(now.asOf, now.timeZone);
  const rhythms = Object.entries(curated.records.rhythms).sort(([a], [b]) => a.localeCompare(b))
    .map(([householdId, rhythm]) => {
      const connections = Object.entries(curated.records.connections).filter(([, connection]) =>
        connection.households.includes(householdId) && connection.occurredOn <= asOfDate &&
        Date.parse(connection.capturedAt) <= Date.parse(now.asOf));
      const lastConfirmedConnection = connections.map(([, connection]) => connection.occurredOn).sort().at(-1) || null;
      const elapsedDays = lastConfirmedConnection === null ? null :
        (Date.parse(asOfDate) - Date.parse(lastConfirmedConnection)) / DAY;
      const dueDay = lastConfirmedConnection === null || rhythm.intervalDays === null ? null :
        Date.parse(lastConfirmedConnection) / DAY + rhythm.intervalDays;
      requireValue(dueDay === null || dueDay <= Date.parse('9999-12-31') / DAY,
        'Rhythm due date exceeds the supported calendar range.');
      const dueOn = dueDay === null ? null : new Date(dueDay * DAY).toISOString().slice(0, 10);
      const state = rhythm.intervalDays === null ? 'unset' : elapsedDays === null ? 'unknown' :
        elapsedDays >= rhythm.intervalDays ? 'due' : 'not_due';
      const memberIds = curated.canonical.households[householdId].people;
      return { householdId, personIds: memberIds, intervalDays: rhythm.intervalDays,
        preferenceReason: rhythm.reason, lastConfirmedConnection, dueOn, elapsedDays, state,
        connectionIds: connections.filter(([, connection]) => connection.occurredOn === lastConfirmedConnection).map(([id]) => id).sort(),
        lastObservedDirectContact: people.filter(person => memberIds.includes(person.personId))
          .map(person => person.lastObservedDirectContact).filter(Boolean).sort().at(-1) || null,
        reason: state === 'due' ? `Curated ${rhythm.intervalDays}-day rhythm is due on ${dueOn}; only explicit confirmed connections set this date.` :
          state === 'unknown' ? 'No confirmed connection known by asOf; no due date invented.' :
            state === 'unset' ? 'Curated rhythm is unset.' : `Curated rhythm is not due until ${dueOn}.` };
    });
  const exitCode = Math.max(baseline.exitCode, current.exitCode, curated.exitCode,
    coverageIssues.includes('incomplete_or_uncertain_coverage') ? 2 : 0);
  const report = { heading: 'Heartbeat reconnection opportunities', schemaVersion: 1, dataClass: 'synthetic',
    context: { collectionDigest: collection.digest, identityMappingRevision: request.identityMappingRevision,
      curatedRevision: curated.revision,
      curatedDigest: hashJSON({
        revision: curated.revision, records: curated.records, mappingDigest: curated.mappingDigest
      }),
      baselinePeriod: before, currentPeriod: now, asOfDate, filters: current.filters,
      status: exitCode === 0 ? 'complete' : 'partial', exitCode,
      tuning: { status: 'engineering_proposal_not_relationship_score', ...TUNING },
      sources: current.sources, coverage: { baseline: baseline.perSource, current: current.perSource,
        channels: { baseline: baseline.perChannel, current: current.perChannel } },
      unresolvedIdentities: current.unresolvedIdentities, unresolvedReferences: current.unresolvedReferences,
      reconciliation: current.reconciliation,
      limitations: current.limitations.concat([
        'Decline uses direct interpersonal messages only, never population frequency or group membership.',
        'Coverage must be complete for every requested source and selected channel in both windows; absent channels suppress decline.',
        'Last contact is observed retained metadata before current end, not a confirmed connection or proof of complete history.',
        'Rhythms use civil dates in the reporting zone; no observed activity resets a confirmed connection.',
        'Curated preferences are current saved values, not an as-of reconstruction; only connection dates and capture instants are filtered.',
        'Signals are separate unsorted-by-priority explanations, not importance, guilt, neglect or outreach instructions.'
      ]) },
    people, rhythms, evidence: {
      baseline: { events: baseline.events, exclusions: baseline.exclusions, audit: baseline.audit },
      current: { events: current.events, exclusions: current.exclusions, audit: current.audit }
    } };
  const output = outputLocation(path.resolve(folder, request.output));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const file = path.join(output, 'report.json');
  publish(file, report);
  return { heading: report.heading, file, status: report.context.status, exitCode };
}
if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--request',
      'Usage: node scripts\\contacts\\opportunities.cjs --request <request.json>', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = run(readJSON(file).value, path.dirname(file));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Opportunities failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    return 1;
  });
}

module.exports = { run };
