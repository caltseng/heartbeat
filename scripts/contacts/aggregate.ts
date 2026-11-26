import type { CanonicalPerson, RecordEntry } from './types.ts';
import fs from 'node:fs';
import path from 'node:path';
import { hash, readJSONWithDigest as readJSON, createGuard, createValidators, CHANNELS,
  publish, runCLI, outputLocation } from './lib.ts';
import { resolvePeriod } from './period.ts';
import { expandCollection } from './collection-store.ts';

const ROLES = ['to', 'cc', 'bcc', 'recipient'];
const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();
const accountKey = (source, account) => JSON.stringify([source, account]);
const requireValue = createGuard('invalid_aggregation');
const { object } = createValidators(requireValue, {
  objectMessage: label => `${label} must be an object.`,
  fieldsMessage: label => `${label} contains unsupported fields.`
});
function namespace(key, type?: string) {
  let tuple;
  try { tuple = JSON.parse(key); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    requireValue(false, 'Invalid source record key.');
  }
  requireValue(Array.isArray(tuple) && tuple.length === 4 && Object.hasOwn(CHANNELS, tuple[0]) &&
    tuple.every(value => typeof value === 'string' && value.length > 0) &&
    (!type || tuple[2] === type) && JSON.stringify(tuple) === key, 'Invalid source record namespace.');
  return tuple;
}
function timestamp(value) {
  requireValue(typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value)), 'Invalid event timestamp.');
  return new Date(value).toISOString();
}
function bounds(observed, complete) {
  return { observed, total: complete ? observed : null,
    certainty: complete ? 'exact' : observed > 0 ? 'lower_bound' : 'unknown' };
}
function stats() {
  return { observedMessages: 0, sent: 0, received: 0, other: 0, activeDates: [], latestObserved: null };
}
function add(row, event) {
  row.observedMessages++;
  row[event.direction]++;
  row.activeDates.push(event.date);
  if (row.latestObserved === null || event.timestamp > row.latestObserved) row.latestObserved = event.timestamp;
}
function finish(row, complete) {
  row.activeDates = sorted(row.activeDates);
  return { ...row, activeDays: row.activeDates.length, messages: bounds(row.observedMessages, complete) };
}
function covered(coverage, period, retrievedAt) {
  return coverage?.completeness === 'complete' && coverage.start !== null && coverage.end !== null &&
    timestamp(coverage.start) <= period.start && timestamp(coverage.end) >= period.end &&
    retrievedAt !== null && timestamp(coverage.end) <= timestamp(retrievedAt);
}
function historicalKind(entry, revision) {
  const version = entry.revisions?.find(row => row.id === revision);
  const evidence = version ? version.provenance : revision === '$initial' ? entry.provenance : [];
  const kinds = sorted((evidence || []).map(row => row.context?.threadKind).filter(Boolean));
  return kinds.length === 1 ? kinds[0] : 'unknown';
}

// Pure reducer: collectionDigest is the SHA-256 of the exact snapshot bytes read by the caller.
function aggregate(collection, mapping, options) {
  requireValue(collection?.dataClass === 'synthetic' && mapping?.dataClass === 'synthetic',
    'Private aggregation is disabled; source/run authorization and verified local controls remain required.',
    'private_collection_disabled');
  collection = expandCollection(collection);
  object(options, ['collectionDigest', 'identityMappingRevision', 'period', 'channels'], 'options');
  const period = resolvePeriod(options.period);
  requireValue(typeof options.collectionDigest === 'string' && /^[a-f0-9]{64}$/.test(options.collectionDigest),
    'An exact collection byte digest is required.');
  requireValue(collection.schemaVersion === 1 && collection.records && collection.manifest &&
    ['collected', 'partial'].includes(collection.manifest.status) && Array.isArray(collection.manifest.sources) &&
    collection.manifest.sources.length > 0, 'Expected a completed collector snapshot.');
  const projection = collection.reconciliation;
  requireValue(projection?.schemaVersion === 1 && projection.records && Array.isArray(projection.collisions) &&
    Array.isArray(projection.unresolvedTargets) && Array.isArray(projection.pendingTargets),
  'CONTACTS-021 reconciliation is required; replay with the current collector.');
  requireValue(mapping.schemaVersion === 1 && Number.isSafeInteger(options.identityMappingRevision) &&
    options.identityMappingRevision > 0 && Array.isArray(mapping.history), 'An explicit saved mapping revision is required.');
  const revisions = mapping.history.filter(row => row.revision === options.identityMappingRevision);
  requireValue(revisions.length === 1 && revisions[0].collectionDigest === options.collectionDigest,
    'Mapping revision does not bind this exact collection snapshot.', 'collection_conflict');
  const view = revisions[0].after;
  requireValue(view?.people && view.assignments && view.households, 'Invalid saved mapping view.');
  const channels = options.channels === undefined ? Object.values(CHANNELS).flat().sort() : options.channels;
  requireValue(Array.isArray(channels) && channels.length > 0 && new Set(channels).size === channels.length &&
    channels.every(channel => Object.values(CHANNELS).flat().includes(channel)), 'Invalid channel filter.');
  const selectedChannels = sorted(channels);
  const records = projection.records;
  const identities = new Map(Object.entries<RecordEntry>(records).filter(([, row]) => row.record.type === 'identity')
    .map(([key, row]) => [key, row.record]));
  const isSelf = key => identities.get(key)?.isSelf === true;
  const active = key => identities.has(key) && identities.get(key).deleted !== true;
  const personFor = key => active(key) && Object.hasOwn(view.assignments, key) ? view.assignments[key] : null;
  const people = new Map();
  for (const [id, person] of Object.entries<CanonicalPerson>(view.people).sort(([a], [b]) => a.localeCompare(b))) {
    requireValue(person.mergedInto === null || (person.mergedInto !== id &&
      view.people[person.mergedInto]?.mergedInto === null), 'Invalid canonical person alias.');
    if (person.mergedInto !== null) continue;
    const identityKeys = Object.keys(view.assignments).filter(key => view.assignments[key] === id).sort();
    const currentKeys = identityKeys.filter(active);
    requireValue(currentKeys.every(key => isSelf(key) === isSelf(currentKeys[0])), 'Mixed self and peer mapping.');
    if (currentKeys.length > 0 && currentKeys.every(isSelf)) continue;
    people.set(id, { personId: id, identityKeys: currentKeys,
      inactiveIdentityKeys: identityKeys.filter(key => !active(key)),
      cohortState: currentKeys.length ? 'current' : identityKeys.length ? 'inactive' : 'unassigned',
      direct: { sent: 0, received: 0, sentDates: [], receivedDates: [], latestObserved: null },
      group: { observedPosted: 0, activeDates: [], sharedParticipationDates: [] },
      recipientRoles: Object.fromEntries(ROLES.map(role => [role, { selfSentTo: 0, peerSentToSelf: 0 }])),
      activeDates: [], latestObserved: null });
  }
  for (const [key, id] of Object.entries<string>(view.assignments)) {
    namespace(key, 'identity');
    requireValue(Object.hasOwn(view.people, id) && view.people[id].mergedInto === null, 'Invalid identity assignment.');
  }
  const unresolvedIdentities = sorted([...identities.keys()].filter(key => active(key) && !personFor(key)));
  const sources = structuredClone(collection.manifest.sources).sort((a, b) =>
    JSON.stringify([a.source, a.account, a.connector]).localeCompare(JSON.stringify([b.source, b.account, b.connector])));
  const seenSources = new Set();
  for (const source of sources) {
    requireValue(Object.hasOwn(CHANNELS, source.source) && typeof source.account === 'string' &&
      typeof source.connector === 'string' &&
      ['collected', 'partial', 'failed', 'unsupported', 'requires_setup'].includes(source.status),
    'Invalid source manifest status.');
    const key = JSON.stringify([source.source, source.account, source.connector]);
    requireValue(!seenSources.has(key), 'Duplicate source manifest.');
    seenSources.add(key);
  }
  for (const key of Object.keys(collection.records).sort()) {
    const [source, account] = namespace(key);
    if (!sources.some(row => row.source === source && row.account === account)) {
      sources.push({ source, account, connector: null, status: 'not_requested', coverage: null,
        retrievedAt: null, reason: 'Retained records have no current manifest coverage.' });
    }
  }
  const events = [], unresolvedReferences = [];
  const totals = stats(), channelRows = new Map(selectedChannels.map(channel => [channel, stats()]));
  const threadRows = new Map(), dayRows = new Map();
  const groupDays = new Map();
  const exclusions = { outsidePeriod: 0, channelFiltered: 0, nonMessage: 0,
    bulk: 0, automated: 0, unclassified: 0, unresolvedRevision: 0 };
  let repeatedEventEvidence = 0, deletedMessagesIncluded = 0;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: period.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const dateAt = time => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const sourceObserved = new Map(), sourceUnclassified = new Set();
  const sourceUncertain = new Set();
  for (const key of projection.collisions.map(row => row.key).concat(projection.unresolvedTargets)) {
    const [source, account] = namespace(key);
    sourceUncertain.add(accountKey(source, account));
  }
  for (const key of Object.keys(collection.records).sort()) {
    const [source, account, type] = namespace(key);
    if (type !== 'event') continue;
    const raw = collection.records[key];
    repeatedEventEvidence += Math.max(0, (raw.provenance?.length || 1) - 1);
    const projected = records[key];
    if (!projected) {
      requireValue(projection.collisions.some(row => row.key === key), 'Missing current event projection.');
      events.push({ key, source, account, disposition: 'unresolvedRevision' });
      exclusions.unresolvedRevision++;
      continue;
    }
    const event = projected.record;
    requireValue(event.type === 'event' && CHANNELS[source].includes(event.channel) &&
      ['message', 'reaction', 'membership', 'edit', 'deletion'].includes(event.eventType) &&
      ['interpersonal', 'bulk', 'automated', 'unclassified'].includes(event.classification) &&
      Array.isArray(event.recipients), 'Invalid projected event.');
    const time = timestamp(event.timestamp);
    const threadTuple = namespace(event.threadKey, 'thread');
    requireValue(threadTuple[0] === source && threadTuple[1] === account, 'Cross-account event thread.');
    for (const identityKey of [event.senderKey, ...event.recipients.map(row => row.identityKey)].filter(Boolean)) {
      const tuple = namespace(identityKey, 'identity');
      requireValue(tuple[0] === source && tuple[1] === account, 'Cross-account event participant.');
    }
    requireValue(event.recipients.every(row => ROLES.includes(row.role)), 'Invalid recipient role.');
    const direction = isSelf(event.senderKey) ? 'sent' :
      event.recipients.some(row => isSelf(row.identityKey)) ? 'received' : 'other';
    const row = { key, source, account, revision: projected.revision, threadKey: event.threadKey,
      channel: event.channel, timestamp: time, date: dateAt(time), eventType: event.eventType,
      classification: event.classification, direction, threadKind: historicalKind(raw, projected.revision),
      deleted: (projected.deletedBy || []).length > 0, disposition: 'included', personAttributions: [] };
    if (!selectedChannels.includes(event.channel)) row.disposition = 'channelFiltered';
    else if (time < period.start || time >= period.end) row.disposition = 'outsidePeriod';
    else if (event.eventType !== 'message') row.disposition = 'nonMessage';
    else if (event.classification !== 'interpersonal') row.disposition = event.classification;
    events.push(row);
    if (row.disposition !== 'included') {
      exclusions[row.disposition]++;
      if (row.disposition === 'unclassified') sourceUnclassified.add(accountKey(source, account));
      continue;
    }
    if (row.deleted) deletedMessagesIncluded++;
    const sourceId = accountKey(source, account);
    sourceObserved.set(sourceId, (sourceObserved.get(sourceId) || 0) + 1);
    if (!threadRows.has(event.threadKey)) threadRows.set(event.threadKey, { ...stats(), source, account });
    if (!dayRows.has(row.date)) dayRows.set(row.date, stats());
    for (const bucket of [totals, channelRows.get(event.channel), threadRows.get(event.threadKey), dayRows.get(row.date)]) add(bucket, row);
    const missing = sorted([event.senderKey, ...event.recipients.map(recipient => recipient.identityKey)]
      .filter(identityKey => identityKey && (!active(identityKey) || !personFor(identityKey))));
    for (const identityKey of missing) unresolvedReferences.push({ eventKey: key, identityKey });
    if (row.threadKind === 'unknown') unresolvedReferences.push({ eventKey: key, threadKey: event.threadKey });
    const senderPerson = personFor(event.senderKey);
    const sender = people.get(senderPerson);
    const primary = event.recipients.filter(recipient => ['to', 'recipient'].includes(recipient.role));
    const direct = row.threadKind === 'direct' && missing.length === 0;
    const attributed = new Set();
    const directPeers = new Map();
    if (direct && isSelf(event.senderKey)) {
      const peers = sorted(primary.filter(recipient => !isSelf(recipient.identityKey))
        .map(recipient => personFor(recipient.identityKey)));
      if (peers.length === 1) directPeers.set(peers[0], 'sent');
    } else if (direct && sender && primary.some(recipient => isSelf(recipient.identityKey))) {
      directPeers.set(senderPerson, 'received');
    }
    for (const [id, kind] of directPeers) {
      const peer = people.get(id);
      peer.direct[kind]++;
      peer.direct[`${kind}Dates`].push(row.date);
      if (peer.direct.latestObserved === null || time > peer.direct.latestObserved) peer.direct.latestObserved = time;
      peer.activeDates.push(row.date);
      attributed.add(id);
      row.personAttributions.push({ personId: id, kind: `direct-${kind}` });
    }
    for (const role of ROLES) {
      if (isSelf(event.senderKey)) {
        const recipients = sorted(event.recipients.filter(recipient => recipient.role === role)
          .map(recipient => personFor(recipient.identityKey)).filter(id => people.has(id)));
        for (const id of recipients) people.get(id).recipientRoles[role].selfSentTo++;
      } else if (sender && event.recipients.some(recipient => recipient.role === role && isSelf(recipient.identityKey))) {
        sender.recipientRoles[role].peerSentToSelf++;
      }
    }
    if (row.threadKind === 'group') {
      if (!groupDays.has(event.threadKey)) groupDays.set(event.threadKey, { self: [], peers: new Map() });
      const group = groupDays.get(event.threadKey);
      if (isSelf(event.senderKey)) group.self.push(row.date);
      else if (sender) {
        sender.group.observedPosted++;
        sender.group.activeDates.push(row.date);
        sender.activeDates.push(row.date);
        if (!group.peers.has(senderPerson)) group.peers.set(senderPerson, []);
        group.peers.get(senderPerson).push(row.date);
        attributed.add(senderPerson);
        row.personAttributions.push({ personId: senderPerson, kind: 'group-posted' });
      }
    }
    for (const id of attributed) {
      const peer = people.get(id);
      if (peer.latestObserved === null || time > peer.latestObserved) peer.latestObserved = time;
    }
  }
  for (const group of groupDays.values()) {
    const selfDates = new Set(group.self);
    for (const [id, dates] of group.peers) {
      people.get(id).group.sharedParticipationDates.push(...dates.filter(date => selfDates.has(date)));
    }
  }
  const sourceComplete = source => source.status === 'collected' && source.paginationComplete === true &&
    !(source.upstreamErrors || []).length && covered(source.coverage, period, source.retrievedAt) &&
    (source.threadCoverageMode !== 'per-thread' || Object.entries<RecordEntry>(records)
      .filter(([key, row]) => {
        const tuple = namespace(key);
        return tuple[0] === source.source && tuple[1] === source.account && row.record.type === 'thread';
      }).every(([key]) => {
        const rows = (source.threadCoverage || []).filter(row => row.threadKey === key);
        return rows.length > 0 && rows.every(row => covered(row, period, source.retrievedAt));
      })) &&
    !sourceUncertain.has(accountKey(source.source, source.account)) &&
    !sourceUnclassified.has(accountKey(source.source, source.account));
  const activitySources = sources.filter(source => CHANNELS[source.source].some(channel => selectedChannels.includes(channel)));
  const completeAccount = (source, account) => {
    const rows = activitySources.filter(row => row.source === source && row.account === account);
    return rows.length > 0 && rows.every(sourceComplete);
  };
  const complete = activitySources.length > 0 && activitySources.every(sourceComplete);
  const peopleRows = [...people.values()].map(peer => {
    peer.direct.sentDates = sorted(peer.direct.sentDates);
    peer.direct.receivedDates = sorted(peer.direct.receivedDates);
    peer.direct.activeDates = sorted([...peer.direct.sentDates, ...peer.direct.receivedDates]);
    peer.direct.bothPostedDates = peer.direct.sentDates.filter(date => peer.direct.receivedDates.includes(date));
    peer.group.activeDates = sorted(peer.group.activeDates);
    peer.group.sharedParticipationDates = sorted(peer.group.sharedParticipationDates);
    peer.activeDates = sorted(peer.activeDates);
    return { ...peer, activeDays: peer.activeDates.length,
      observedDirectMessages: bounds(peer.direct.sent + peer.direct.received,
        complete && unresolvedIdentities.length === 0 && unresolvedReferences.length === 0),
      groupOnly: peer.group.observedPosted > 0 && peer.direct.sent + peer.direct.received === 0 };
  });
  const membershipLinks = Object.entries<RecordEntry>(records).filter(([, row]) => row.record.type === 'membership')
    .map(([key, row]) => ({ key, ...row.record, personId: personFor(row.record.identityKey) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const partial = !complete || unresolvedIdentities.length > 0 || unresolvedReferences.length > 0 ||
    collection.manifest.reconciliationRequired === true || sources.some(source => source.status !== 'collected');
  return {
    heading: 'Heartbeat cross-source aggregation', schemaVersion: 1, dataClass: 'synthetic',
    collectionDigest: options.collectionDigest, identityMappingRevision: options.identityMappingRevision,
    period, filters: { channels: selectedChannels, classifications: ['interpersonal'], deletedMessages: 'include-observed-originals' },
    status: partial ? 'partial' : 'complete', exitCode: partial ? 2 : 0,
    sources, unresolvedIdentities, unresolvedReferences,
    reconciliation: { collisions: structuredClone(projection.collisions),
      unresolvedTargets: [...projection.unresolvedTargets], pendingTargets: [...projection.pendingTargets] },
    exclusions, audit: { uniqueSourceEvents: events.length, includedMessages: totals.observedMessages,
      excludedEvents: Object.values(exclusions).reduce((a, b) => a + b, 0), repeatedEventEvidence,
      deletedMessagesIncluded },
    totals: finish(totals, complete),
    perSource: sorted(activitySources.map(row => accountKey(row.source, row.account))).map(key => {
      const [source, account] = JSON.parse(key);
      return { source, account, messages: bounds(sourceObserved.get(key) || 0, completeAccount(source, account)) };
    }),
    perChannel: [...channelRows].map(([channel, row]) => ({ channel, ...finish(row,
      activitySources.some(source => CHANNELS[source.source].includes(channel)) &&
      activitySources.filter(source => CHANNELS[source.source].includes(channel)).every(sourceComplete)) })),
    perThread: [...threadRows].sort(([a], [b]) => a.localeCompare(b))
      .map(([threadKey, row]) => ({ threadKey, ...finish(row, completeAccount(row.source, row.account)) })),
    daily: [...dayRows].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({ date, ...finish(row, complete) })),
    people: peopleRows, personAliases: Object.entries<CanonicalPerson>(view.people).filter(([, person]) => person.mergedInto !== null)
      .sort(([a], [b]) => a.localeCompare(b)).map(([personId, person]) => ({ personId, ...person })),
    membershipLinks, events,
    limitations: [
      'Synthetic local snapshots only; no source access or private-run authorization.',
      'Counts are observed metadata, not relationship quality or confirmed meaningful connections.',
      'Per-person attributions are not additive message totals; CC/BCC/addressing and membership alone are not direct activity.',
      'Active dates are time-zone date unions; shared group dates are same-thread co-participation, not direct exchanges.',
      'Only emitted daily/thread rows have observed messages; absent rows are not evidence of zero.',
      'Coverage is declared source evidence, not independent upstream verification; unclassified messages make interpersonal totals lower bounds.',
      'Current source revisions apply to the snapshot, not an as-of historical reconstruction; deleted originals remain observed messages.'
    ]
  };
}
function run(request, folder = process.cwd()) {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'mapping', 'identityMappingRevision', 'period', 'channels', 'output'], 'request');
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private aggregation is disabled; only schemaVersion 1 synthetic requests are supported.', 'private_collection_disabled');
  requireValue(['collection', 'mapping', 'output'].every(field =>
    typeof request[field] === 'string' && request[field].trim().length > 0), 'Explicit input and output paths are required.');
  const collection = readJSON(path.resolve(folder, request.collection));
  requireValue(collection.value.dataClass === 'synthetic', 'Private aggregation is disabled.', 'private_collection_disabled');
  const mapping = readJSON(path.resolve(folder, request.mapping));
  const report = aggregate(collection.value, mapping.value, {
    collectionDigest: collection.digest, identityMappingRevision: request.identityMappingRevision,
    period: request.period, channels: request.channels
  });
  const output = outputLocation(path.resolve(folder, request.output));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const file = path.join(output, 'aggregates.json');
  publish(file, report);
  return { heading: report.heading, file, status: report.status, exitCode: report.exitCode };
}
if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--request',
      'Usage: node --import tsx scripts\\contacts\\aggregate.ts --request <request.json>', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = run(readJSON(file).value, path.dirname(file));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Aggregation failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    return 1;
  });
}

export { aggregate, run };
