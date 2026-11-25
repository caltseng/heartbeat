const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { aggregate } = require('./aggregate.cjs');
const { readJSON, requireValue, object, outputLocation } = require('./collect.cjs');
const { publish } = require('./local-json.cjs');

function messageCount(observed, complete) {
  return { observed, total: complete ? observed : null,
    certainty: complete ? 'exact' : observed > 0 ? 'lower_bound' : 'unknown' };
}
function calendar(period) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: period.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const dateAt = instant => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const start = Date.parse(period.start), end = Date.parse(period.end);
  const last = dateAt(end - 1), result = [];
  function boundary(date) {
    const anchor = Date.parse(`${date}T00:00:00Z`);
    let low = anchor - 36 * 3600000, high = anchor + 36 * 3600000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (dateAt(middle) < date) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  for (let date = dateAt(start); date <= last;) {
    // Advance a civil date, not 24 elapsed hours in the reporting zone.
    const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const dayStart = boundary(date), dayEnd = boundary(next);
    if (dayStart < dayEnd) result.push({ date,
      start: new Date(Math.max(start, dayStart)).toISOString(),
      end: new Date(Math.min(end, dayEnd)).toISOString(),
      partialDay: start > dayStart || end < dayEnd });
    date = next;
  }
  return result;
}
function emptyStats(complete) {
  return { observedMessages: 0, sent: 0, received: 0, other: 0, activeDates: [],
    activeDays: 0, latestObserved: null, messages: messageCount(0, complete) };
}
function summary(collection, mapping, options) {
  const reduced = aggregate(collection, mapping, options);
  const included = reduced.events.filter(row => row.disposition === 'included');
  const peopleTable = reduced.people.map(person => ({
    ...person,
    perChannel: reduced.perChannel.map(channelRow => {
      const { channel } = channelRow;
      const events = included.filter(event => event.channel === channel);
      const attributions = events.flatMap(event => event.personAttributions
        .filter(row => row.personId === person.personId).map(row => ({ ...row, event })));
      const sent = attributions.filter(row => row.kind === 'direct-sent').length;
      const received = attributions.filter(row => row.kind === 'direct-received').length;
      const groupPosted = attributions.filter(row => row.kind === 'group-posted').length;
      return { channel, direct: { sent, received,
        messages: messageCount(sent + received, person.observedDirectMessages.certainty === 'exact' &&
          channelRow.messages.certainty === 'exact') },
      groupPosted, activeDates: [...new Set(attributions.map(row => row.event.date))].sort() };
    })
  }));
  const timeline = calendar(reduced.period).map(day => {
    const observed = reduced.daily.find(row => row.date === day.date);
    const events = included.filter(event => event.date === day.date);
    return { ...day, ...(observed || emptyStats(reduced.totals.messages.certainty === 'exact')),
      perChannel: reduced.perChannel.map(channel => {
        const rows = events.filter(event => event.channel === channel.channel);
        return { channel: channel.channel,
          messages: messageCount(rows.length, channel.messages.certainty === 'exact'),
          sent: rows.filter(row => row.direction === 'sent').length,
          received: rows.filter(row => row.direction === 'received').length,
          other: rows.filter(row => row.direction === 'other').length };
      }) };
  });
  const metrics = {
    messages: reduced.totals.messages,
    sent: reduced.totals.sent, received: reduced.totals.received, other: reduced.totals.other,
    activeDays: reduced.totals.activeDays, latestObserved: reduced.totals.latestObserved,
    cohortPeople: peopleTable.length,
    observedDirectPeople: peopleTable.filter(person => person.observedDirectMessages.observed > 0).length,
    observedGroupOnlyPeople: peopleTable.filter(person => person.groupOnly).length,
    noObservedActivityPeople: peopleTable.filter(person => person.activeDays === 0).length
  };
  const statements = [
    `Observed interpersonal messages: ${metrics.messages.observed} (${metrics.messages.certainty}; ` +
      `complete total ${metrics.messages.total === null ? 'unknown' : metrics.messages.total}).`,
    `Observed directions: ${metrics.sent} sent, ${metrics.received} received, ${metrics.other} other.`,
    `Observed active local dates: ${metrics.activeDays}. Latest observed activity: ${metrics.latestObserved || 'unknown'}.`,
    `Reviewed cohort: ${metrics.cohortPeople} people; ${metrics.observedDirectPeople} with observed direct activity, ` +
      `${metrics.observedGroupOnlyPeople} with observed group-only activity, ` +
      `${metrics.noObservedActivityPeople} with no observed activity (not proof of inactivity).`
  ];
  return {
    heading: 'Heartbeat period summary', schemaVersion: 1, dataClass: 'synthetic',
    context: {
      collectionDigest: reduced.collectionDigest, identityMappingRevision: reduced.identityMappingRevision,
      period: reduced.period, filters: reduced.filters, status: reduced.status, exitCode: reduced.exitCode,
      exclusions: reduced.exclusions, audit: reduced.audit, sources: reduced.sources,
      sourceFreshness: reduced.sources.map(source => ({
        source: source.source, account: source.account, connector: source.connector,
        retrievedAt: source.retrievedAt ?? null,
        relationToAsOf: source.retrievedAt == null ? 'unknown' :
          Date.parse(source.retrievedAt) > Date.parse(reduced.period.asOf) ? 'after' :
            Date.parse(source.retrievedAt) < Date.parse(reduced.period.asOf) ? 'before' : 'at'
      })),
      coverage: reduced.totals.messages.certainty === 'exact' ? 'complete-declared' : 'incomplete-or-uncertain',
      unresolvedIdentities: reduced.unresolvedIdentities, unresolvedReferences: reduced.unresolvedReferences,
      reconciliation: reduced.reconciliation,
      limitations: reduced.limitations.filter(text => !text.startsWith('Only emitted daily/thread rows')).concat([
        'Timeline contains every existing local date intersecting the period; empty observations are exact zero only with complete declared coverage.',
        'Person direct/group attributions are not an additive partition of all messages; unassigned, self group posts and role-only messages remain in the event ledger.',
        'Freshness is retrieval time relative to as-of, not a live check or a claim that later retrieval reconstructs historical state.'
      ])
    },
    views: { summary: { metrics, statements }, peopleTable, perChannel: reduced.perChannel, timeline },
    evidence: { events: reduced.events, perSource: reduced.perSource, perThread: reduced.perThread,
      personAliases: reduced.personAliases, membershipLinks: reduced.membershipLinks }
  };
}
function selectView(report, name) {
  requireValue(report?.schemaVersion === 1 && report.dataClass === 'synthetic' &&
    report.heading === 'Heartbeat period summary' && report.context && report.views &&
    ['summary', 'peopleTable', 'perChannel', 'timeline'].includes(name), 'Invalid Heartbeat reporting view.');
  return { heading: report.heading, schemaVersion: report.schemaVersion, dataClass: report.dataClass,
    reportDigest: crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex'),
    context: structuredClone(report.context), view: name, data: structuredClone(report.views[name]) };
}
function run(request, folder = process.cwd()) {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'mapping', 'identityMappingRevision', 'period', 'channels', 'output'], 'request');
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private summaries are disabled; only schemaVersion 1 synthetic requests are supported.', 'private_collection_disabled');
  requireValue(['collection', 'mapping', 'output'].every(field =>
    typeof request[field] === 'string' && request[field].trim().length > 0), 'Explicit input and output paths are required.');
  const collection = readJSON(path.resolve(folder, request.collection));
  requireValue(collection.value.dataClass === 'synthetic', 'Private summaries are disabled.', 'private_collection_disabled');
  const mapping = readJSON(path.resolve(folder, request.mapping));
  const report = summary(collection.value, mapping.value, {
    collectionDigest: collection.digest, identityMappingRevision: request.identityMappingRevision,
    period: request.period, channels: request.channels
  });
  const output = outputLocation(path.resolve(folder, request.output));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const file = path.join(output, 'report.json');
  publish(file, report);
  return { heading: report.heading, file, status: report.context.status, exitCode: report.context.exitCode };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--request',
      'Usage: node scripts\\contacts\\summary.cjs --request <request.json>', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = run(readJSON(file).value, path.dirname(file));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`Summary failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
module.exports = { summary, selectView, run };
