const fs = require('node:fs');
const { readCollection } = require('./collection-store.cjs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { hashJSON: digest, createGuard, persist, publish, openLock, releaseLock, runCLI, outputLocation,
  readJSON } = require('./lib.cjs');
const { summary } = require('./summary.cjs');
const { curate } = require('./curated.cjs');
const { prayer } = require('./prayer.cjs');

const requireValue = createGuard('invalid_reconnection');
function object(value, fields) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => fields.includes(key)), 'Unsupported reconnection fields.');
}
function text(value) {
  requireValue(typeof value === 'string' && value.trim().length > 0, 'Expected nonempty text.');
  return value;
}
function identifier(value) {
  requireValue(typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value), 'Invalid identifier.');
  return value;
}
function date(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  'Expected a real YYYY-MM-DD date.');
}
function safeLink(value) {
  text(value);
  let url;
  try { url = new URL(value); }
  catch (error) {
    if (!(error instanceof TypeError)) throw error;
    requireValue(false, 'Invalid source link.');
  }
  requireValue(url.protocol === 'https:' && !url.username && !url.password, 'Only explicit credential-free HTTPS source links are supported.');
}
function validateRecords(records, curated) {
  object(records, ['followups', 'deferrals', 'threadLinks']);
  for (const dictionary of Object.values(records)) {
    requireValue(dictionary && typeof dictionary === 'object' && !Array.isArray(dictionary), 'Invalid record dictionary.');
  }
  const household = id => requireValue(Object.hasOwn(curated.canonical.households, id), 'Unknown household.');
  for (const [id, entry] of Object.entries(records.followups)) {
    identifier(id);
    object(entry, ['householdId', 'text', 'noteIds', 'dueOn', 'completedOn']);
    household(entry.householdId);
    text(entry.text);
    requireValue(Array.isArray(entry.noteIds) && entry.noteIds.length > 0 &&
      new Set(entry.noteIds).size === entry.noteIds.length && entry.noteIds.every(noteId =>
        Object.hasOwn(curated.records.notes, noteId) &&
        curated.records.notes[noteId].households.includes(entry.householdId)), 'Follow-ups require original household note evidence.');
    if (entry.dueOn !== null) date(entry.dueOn);
    if (entry.completedOn !== null) date(entry.completedOn);
  }
  for (const [id, entry] of Object.entries(records.deferrals)) {
    household(id);
    object(entry, ['until', 'reason']);
    date(entry.until);
    text(entry.reason);
  }
  for (const [key, link] of Object.entries(records.threadLinks)) {
    text(key);
    safeLink(link);
  }
}
function recommendations(curated, periodReport, prayerView, records, reviewOn, limit) {
  const candidates = [];
  for (const [householdId, household] of Object.entries(curated.canonical.households).sort(([a], [b]) => a.localeCompare(b))) {
    const notes = Object.fromEntries(Object.entries(curated.records.notes)
      .filter(([, note]) => note.households.includes(householdId)));
    const connections = Object.entries(curated.records.connections).filter(([, connection]) =>
      connection.households.includes(householdId) && connection.occurredOn <= reviewOn);
    const lastConfirmed = connections.map(([, connection]) => connection.occurredOn).sort().at(-1) || null;
    const connectionIds = connections.filter(([, connection]) => connection.occurredOn === lastConfirmed).map(([id]) => id);
    const rhythm = curated.records.rhythms[householdId] || null;
    const elapsedDays = lastConfirmed === null ? null : (Date.parse(reviewOn) - Date.parse(lastConfirmed)) / 86400000;
    const followups = Object.entries(records.followups).filter(([, entry]) =>
      entry.householdId === householdId && (entry.completedOn === null || entry.completedOn > reviewOn))
      .map(([id, entry]) => ({ id, ...entry }));
    const dueFollowups = followups.filter(entry => entry.dueOn !== null && entry.dueOn <= reviewOn);
    const prayerRequests = Object.entries(prayerView?.requests || {}).filter(([, entry]) =>
      entry.originalNotes && Object.keys(entry.originalNotes).some(id => Object.hasOwn(notes, id)) &&
      (entry.status === 'active' || entry.needsStatusReview))
      .map(([id, entry]) => ({ id, ...entry }));
    const reasons = [];
    if (dueFollowups.length) reasons.push({ code: 'followup_due', followupIds: dueFollowups.map(entry => entry.id) });
    if (rhythm?.intervalDays != null && elapsedDays !== null && elapsedDays >= rhythm.intervalDays) {
      reasons.push({ code: 'curated_rhythm_due', intervalDays: rhythm.intervalDays, elapsedDays, connectionIds, reason: rhythm.reason });
    }
    if (lastConfirmed === null) reasons.push({ code: 'connection_unknown', message: 'No confirmed connection on or before the review date; not proof of neglect.' });
    if (followups.length && !dueFollowups.length) reasons.push({ code: 'outstanding_followup', followupIds: followups.map(entry => entry.id) });
    if (prayerRequests.length) reasons.push({ code: 'prayer_context', requestIds: prayerRequests.map(entry => entry.id) });
    if (!reasons.length) continue;
    const observed = periodReport.evidence.events.filter(event => event.disposition === 'included' && !event.deleted &&
      event.personAttributions.some(row => household.people.includes(row.personId)));
    const threads = [...new Set(observed.map(event => event.threadKey))].map(threadKey => {
      const events = observed.filter(event => event.threadKey === threadKey);
      const latest = events.map(event => event.timestamp).sort().at(-1);
      const [source, account, , sourceThreadId] = JSON.parse(threadKey);
      return { threadKey, source, account, sourceThreadId, latestObserved: latest,
        kind: events.find(event => event.timestamp === latest).threadKind,
        eventKeys: events.map(event => event.key), url: records.threadLinks[threadKey] || null };
    }).sort((a, b) => (a.kind === 'direct' ? 0 : 1) - (b.kind === 'direct' ? 0 : 1) ||
      b.latestObserved.localeCompare(a.latestObserved) || a.threadKey.localeCompare(b.threadKey));
    const actionableThreads = threads.filter(thread =>
      periodReport.threadAvailability[thread.threadKey] === true);
    const thread = actionableThreads[0] || null;
    candidates.push({
      householdId, label: household.label, reasons, lastConfirmedConnection: lastConfirmed,
      connectionIds, rhythm, elapsedCalendarDays: elapsedDays, originalNotes: notes, followups, prayerRequests,
      observedActivity: { period: periodReport.context.period, threads,
        people: periodReport.views.peopleTable.filter(person => household.people.includes(person.personId)) },
      nextAction: thread ? { type: 'existing_thread', ...thread,
        instruction: thread.url ? 'Open the saved source link and review the existing conversation; nothing is sent.' :
          'Locate this existing source/account/thread manually; a source-opening link is unavailable. Nothing is sent.' } :
        { type: 'review_context', threadKey: null, url: null,
          instruction: 'Review saved context or confirm a connection; no usable existing conversation is evidenced in this period.' },
      deferredUntil: records.deferrals[householdId]?.until || null,
      deferralReason: records.deferrals[householdId]?.reason || null
    });
  }
  // Order evidence categories, never relationship worth or message volume.
  const priority = row => row.reasons[0].code === 'followup_due' ? 0 :
    row.reasons.some(reason => reason.code === 'curated_rhythm_due') ? 1 : 2;
  candidates.sort((a, b) => priority(a) - priority(b) || a.householdId.localeCompare(b.householdId));
  const deferred = candidates.filter(row => row.deferredUntil !== null && row.deferredUntil > reviewOn);
  const eligible = candidates.filter(row => !deferred.includes(row));
  return { recommendations: eligible.slice(0, limit), deferred, remaining: eligible.slice(limit), candidateCount: candidates.length };
}
function reconnection(request, folder = process.cwd(), mode = '--inspect') {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'mapping', 'curated', 'prayer', 'output',
    'period', 'limit', 'expectedRevision', 'evidenceDigest', 'reason', 'operations']);
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private reconnection review is disabled.', 'private_collection_disabled');
  requireValue(['--inspect', '--request', '--report'].includes(mode), 'Invalid command.', 'invalid_arguments');
  const limit = request.limit === undefined ? 5 : request.limit;
  requireValue(Number.isSafeInteger(limit) && limit > 0, 'Limit must be a positive safe integer.');
  const curated = curate({ schemaVersion: 1, dataClass: request.dataClass, collection: request.collection,
    mapping: request.mapping, output: text(request.curated) }, folder, true);
  const collection = readCollection(path.resolve(folder, text(request.collection)));
  const mapping = readJSON(path.join(path.resolve(folder, text(request.mapping)), 'identity-review.json'));
  requireValue(collection.digest === curated.collectionDigest &&
    digest({ revision: mapping.value.revision, view: mapping.value.view }) === curated.mappingDigest,
  'Evidence changed while reading; inspect again.', 'evidence_conflict');
  const report = summary(collection.value, mapping.value, { collectionDigest: collection.digest,
    identityMappingRevision: curated.mappingRevision, period: request.period });
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: report.context.period.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(report.context.period.asOf))
    .map(part => [part.type, part.value]));
  const reviewOn = `${parts.year}-${parts.month}-${parts.day}`;
  const prayerView = request.prayer === undefined ? null : prayer({
    schemaVersion: 1, dataClass: request.dataClass, collection: request.collection, mapping: request.mapping,
    curated: request.curated, output: text(request.prayer)
  }, folder, true);
  const curatedDigest = digest({ revision: curated.revision, records: curated.records,
    mappingDigest: curated.mappingDigest, collectionDigest: curated.collectionDigest });
  requireValue(prayerView === null || prayerView.curatedDigest === curatedDigest,
    'Prayer evidence changed while reading; inspect again.', 'evidence_conflict');
  const evidenceDigest = digest({ curatedDigest, report, prayerView, limit });
  const output = outputLocation(path.resolve(folder, text(request.output)));
  const file = path.join(output, 'reconnection.json'), lock = path.join(output, 'reconnection.lock');
  let lockFd;
  if (mode !== '--inspect') {
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    lockFd = openLock(lock, () => Object.assign(new Error('Reconnection store is locked; verify the writer stopped.'), { code: 'store_locked' }));
  }
  try {
    if (lockFd !== undefined) fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    requireValue(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'Unsafe snapshot.', 'unsafe_output');
    const state = fs.existsSync(file) ? readJSON(file).value : { schemaVersion: 1, dataClass: 'synthetic',
      revision: 0, records: { followups: {}, deferrals: {}, threadLinks: {} }, history: [] };
    object(state, ['schemaVersion', 'dataClass', 'revision', 'records', 'history']);
    requireValue(state.schemaVersion === 1 && state.dataClass === 'synthetic' &&
      Number.isSafeInteger(state.revision) && state.revision >= 0 &&
      Array.isArray(state.history) && state.history.length === state.revision, 'Invalid saved review state.');
    validateRecords(state.records, curated);
    report.threadAvailability = Object.fromEntries(Object.entries(collection.value.reconciliation.records)
      .filter(([, row]) => row.record.type === 'thread')
      .map(([key, row]) => [key, row.record.deleted !== true]));
    const result = () => ({
      heading: 'Heartbeat weekly reconnection review', schemaVersion: 1, dataClass: 'synthetic',
      audience: 'private-local-only', file, revision: state.revision, evidenceDigest, reviewOn,
      context: report.context, curatedRevision: curated.revision,
      prayer: prayerView === null ? { status: 'not_provided', message: 'Prayer context unavailable; not an empty or resolved request list.' } :
        { status: 'saved_synthetic', revision: prayerView.revision },
      records: state.records, ...recommendations(curated, report, prayerView, state.records, reviewOn, limit),
      limitations: ['Manual review only; no sending, source access or scheduling.',
        'Observed activity never confirms a meaningful connection. Future-dated confirmed connections are excluded.',
        'Thread references are saved evidence, not verified live access. Group posts are not direct exchanges.',
        'Only explicitly saved HTTPS links are used; unsupported source-opening links remain unavailable.'],
      exitCode: report.context.exitCode === 2 || curated.exitCode === 2 || prayerView?.exitCode === 2 ? 2 : 0
    });
    if (mode === '--inspect') return result();
    requireValue(request.expectedRevision === state.revision, 'Revision changed; inspect again.', 'revision_conflict');
    requireValue(request.evidenceDigest === evidenceDigest, 'Evidence changed; inspect again.', 'evidence_conflict');
    if (mode === '--report') {
      requireValue(request.operations === undefined, 'Report publication cannot apply operations.');
      const value = result();
      const reportFile = path.join(output, 'report.json');
      publish(reportFile, value);
      return { ...value, reportFile };
    }
    text(request.reason);
    requireValue(Array.isArray(request.operations) && request.operations.length > 0, 'Provide explicit operations.');
    const before = structuredClone(state.records);
    for (const operation of request.operations) {
      requireValue(operation && typeof operation === 'object', 'Invalid operation.');
      if (operation.type === 'followup') {
        object(operation, ['type', 'id', 'householdId', 'text', 'noteIds', 'dueOn']);
        const id = identifier(operation.id);
        requireValue(!Object.hasOwn(state.records.followups, id), 'Follow-ups are immutable; explicitly complete an existing commitment.');
        state.records.followups[id] = { householdId: operation.householdId, text: operation.text,
          noteIds: operation.noteIds, dueOn: operation.dueOn, completedOn: null };
      } else if (operation.type === 'complete') {
        object(operation, ['type', 'id', 'completedOn']);
        const entry = state.records.followups[identifier(operation.id)];
        requireValue(Object.hasOwn(state.records.followups, operation.id) && entry.completedOn === null, 'Unknown or completed follow-up.');
        date(operation.completedOn);
        requireValue(operation.completedOn <= reviewOn, 'Completion cannot be in the future.');
        entry.completedOn = operation.completedOn;
      } else if (operation.type === 'defer') {
        object(operation, ['type', 'householdId', 'until', 'reason']);
        identifier(operation.householdId);
        date(operation.until);
        requireValue(operation.until > reviewOn, 'Deferral must end after the review date.');
        state.records.deferrals[operation.householdId] = { until: operation.until, reason: operation.reason };
      } else if (operation.type === 'thread-link') {
        object(operation, ['type', 'threadKey', 'url']);
        requireValue(Object.hasOwn(report.threadAvailability, operation.threadKey) &&
          report.threadAvailability[operation.threadKey], 'Link must reference an existing nondeleted thread.');
        state.records.threadLinks[operation.threadKey] = operation.url;
      } else requireValue(false, 'Unsupported operation; record confirmed connections through contacts:curate.');
      validateRecords(state.records, curated);
    }
    requireValue(!isDeepStrictEqual(before, state.records), 'No review changes.');
    state.revision++;
    state.history.push({ revision: state.revision, capturedAt: new Date().toISOString(), reason: request.reason,
      reviewOn, evidenceDigest, operations: structuredClone(request.operations) });
    persist(file, state);
    return result();
  } finally {
    releaseLock(lock, lockFd);
  }
}
if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && ['--inspect', '--request', '--report'].includes(args[0]),
      'Expected a command and synthetic request file.', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = reconnection(readJSON(file).value, path.dirname(file), args[0]);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    const knownCodes = ['invalid_reconnection', 'private_collection_disabled', 'store_locked',
      'unsafe_output', 'revision_conflict', 'evidence_conflict', 'invalid_arguments', 'collection_conflict'];
    const code = knownCodes.includes(error.code) ? error.code : 'reconnection_failed';
    process.stderr.write(`Reconnection review failed [${code}].\n`);
    return 1;
  });
}

module.exports = { reconnection };
