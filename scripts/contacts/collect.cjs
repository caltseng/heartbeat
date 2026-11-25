const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const ROOT = path.resolve(__dirname, '..', '..');
const PRIVATE = path.join(ROOT, '.private', 'contacts');
const SOURCES = ['google-contacts', 'email', 'text-messages', 'messenger', 'whatsapp'];
const CHANNELS = {
  email: ['email'], 'text-messages': ['sms', 'mms', 'rcs', 'imessage'],
  messenger: ['messenger'], whatsapp: ['whatsapp'], 'google-contacts': []
};

class CollectionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireValue(condition, message, code = 'invalid_input') {
  if (!condition) throw new CollectionError(code, message);
}
function object(value, allowed, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  requireValue(Object.keys(value).every(key => allowed.includes(key)), `${label} has unsupported fields; message bodies and credentials are not accepted.`);
}
function text(value, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text.`);
  return value;
}
function array(value, label) {
  requireValue(Array.isArray(value), `${label} must be an array.`);
  return value;
}
function instant(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp with an offset.`);
  const date = value.slice(0, 10);
  requireValue(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, `${label} has an invalid calendar date.`);
  return new Date(value).toISOString();
}
const key = (source, account, type, id) => JSON.stringify([source, account, type, id]);
const sourceKey = source => JSON.stringify([source.source, source.account, source.connector]);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function dateFormatter(timeZone) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch (error) {
    if (error instanceof RangeError) throw new CollectionError('invalid_input', 'period.timeZone must be a supported IANA time zone.');
    throw error;
  }
}
function localDate(formatter, time) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function resolvePeriod(input) {
  object(input, ['preset', 'timeZone', 'asOf', 'start', 'end'], 'period');
  const timeZone = text(input.timeZone, 'period.timeZone');
  const formatter = dateFormatter(timeZone);
  const asOf = instant(input.asOf, 'period.asOf');
  requireValue(['7d', '30d', 'custom'].includes(input.preset), 'period.preset must be 7d, 30d, or custom.');
  let start, end;
  if (input.preset === 'custom') {
    start = instant(input.start, 'period.start');
    end = instant(input.end, 'period.end');
  } else {
    requireValue(input.start === undefined && input.end === undefined, 'Preset periods resolve their own boundaries.');
    const today = localDate(formatter, Date.parse(asOf));
    const target = new Date(Date.parse(`${today}T00:00:00Z`) - (input.preset === '7d' ? 6 : 29) * 86400000).toISOString().slice(0, 10);
    const anchor = Date.parse(`${target}T00:00:00Z`);
    let low = anchor - 36 * 3600000, high = anchor + 36 * 3600000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (localDate(formatter, middle) < target) low = middle + 1;
      else high = middle;
    }
    requireValue(localDate(formatter, low) === target, 'The requested start calendar day does not exist in this time zone; use an explicit custom interval.');
    start = new Date(low).toISOString();
    end = asOf;
  }
  requireValue(start < end && end <= asOf, 'The interval must be nonempty and end no later than asOf.');
  return { preset: input.preset, timeZone, start, end, asOf, bounds: '[start,end)', currentDayPartial: input.preset !== 'custom' };
}
function readJSON(file) {
  let data;
  try { data = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (['ENOENT', 'EACCES', 'EISDIR'].includes(error.code)) throw new CollectionError('input_unreadable', 'A requested JSON input cannot be read.');
    throw error;
  }
  try { return { value: JSON.parse(data.replace(/^\uFEFF/, '')), digest: hash(data) }; }
  catch (error) {
    if (error instanceof SyntaxError) throw new CollectionError('invalid_json', 'A requested input is not valid JSON.');
    throw error;
  }
}
function within(folder, file) {
  const relative = path.relative(folder, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function realLocation(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  requireValue(parent !== file, 'Cannot resolve output location.');
  return path.join(realLocation(parent), path.basename(file));
}
function outputLocation(value) {
  const target = path.resolve(text(value, 'output'));
  const resolved = realLocation(target);
  const root = fs.realpathSync(ROOT);
  const privateRoot = path.join(root, '.private', 'contacts');
  requireValue(!within(root, resolved) || (within(privateRoot, resolved) && within(PRIVATE, target)),
    'Output inside this checkout is allowed only under .private\\contacts, never in website or tracked data folders.', 'unsafe_output');
  requireValue(target === resolved || !within(root, resolved), 'Private output must not use a redirected directory.', 'unsafe_output');
  return target;
}
function validateSource(source) {
  object(source, ['source', 'account', 'connector', 'mode', 'input', 'status', 'reason'], 'source');
  requireValue(SOURCES.includes(source.source), 'Unknown source family.');
  text(source.account, 'source.account');
  text(source.connector, 'source.connector');
  requireValue(['metadata-import', 'unavailable'].includes(source.mode), 'Only metadata-import or explicit unavailable sources are supported.');
  if (source.mode === 'metadata-import') {
    text(source.input, 'source.input');
    requireValue(source.status === undefined && source.reason === undefined, 'Import status is determined by the collector.');
  } else {
    requireValue(['requires_setup', 'unsupported'].includes(source.status), 'Unavailable sources need requires_setup or unsupported status.');
    text(source.reason, 'source.reason');
    requireValue(source.input === undefined, 'Unavailable sources cannot specify input.');
  }
}
function cursor(value) { requireValue(value === null || (typeof value === 'string' && value.length > 0), 'Cursors must be nonempty strings or null.'); }
function coverage(input, source) {
  object(input, ['start', 'end', 'completeness', 'basis'], 'coverage');
  requireValue(['complete', 'partial', 'unknown'].includes(input.completeness), 'Invalid coverage completeness.');
  const start = input.start === null ? null : instant(input.start, 'coverage.start');
  const end = input.end === null ? null : instant(input.end, 'coverage.end');
  requireValue(start === null || end === null || start < end, 'Invalid coverage interval.');
  requireValue(input.completeness !== 'complete' || source === 'google-contacts' || (start !== null && end !== null), 'Complete activity coverage requires explicit boundaries.');
  return { kind: source === 'google-contacts' ? 'identity-snapshot' : 'activity-interval',
    start, end, completeness: input.completeness, basis: text(input.basis, 'coverage.basis') };
}
function identifier(record, fields, label) {
  object(record, ['id', 'idKind', 'revision', ...fields], label);
  text(record.id, `${label}.id`);
  requireValue(['provider', 'local'].includes(record.idKind), `${label}.idKind must distinguish provider and local IDs.`);
}
function versions(entry) {
  return entry.revisions || [{ id: '$initial', supersedes: null, record: entry.record, provenance: entry.provenance }];
}
function heads(entry) {
  const rows = versions(entry);
  const replaced = new Set(rows.flatMap(row => row.supersedes === null ? [] : [row.supersedes].flat()));
  return rows.filter(row => !replaced.has(row.id));
}
function current(entry) {
  if (!entry) return undefined;
  const leaves = heads(entry);
  requireValue(leaves.length === 1, 'Referenced source record has unresolved revision branches.', 'revision_collision');
  return { record: leaves[0].record, revision: { id: leaves[0].id } };
}
function reviewTranslations(input) {
  if (input === undefined) return null;
  object(input, ['revision', 'reviewedAt', 'basis', 'mappings'], 'overlapReview');
  text(input.revision, 'overlapReview.revision');
  const reviewedAt = instant(input.reviewedAt, 'overlapReview.reviewedAt');
  text(input.basis, 'overlapReview.basis');
  const mappings = array(input.mappings, 'overlapReview.mappings');
  const seen = new Set();
  for (const mapping of mappings) {
    object(mapping, ['source', 'account', 'connector', 'type', 'id', 'targetId'], 'mapping');
    requireValue(SOURCES.includes(mapping.source) && ['identity', 'thread', 'event'].includes(mapping.type), 'Invalid translation namespace/type.');
    ['account', 'connector', 'id', 'targetId'].forEach(field => text(mapping[field], `mapping.${field}`));
    const locator = JSON.stringify([mapping.source, mapping.account, mapping.connector, mapping.type, mapping.id]);
    requireValue(!seen.has(locator) && mapping.id !== mapping.targetId, 'Duplicate or self translation.');
    seen.add(locator);
  }
  requireValue(!mappings.some(a => mappings.some(b => a.source === b.source && a.account === b.account &&
    a.type === b.type && a.targetId === b.id)), 'Translations must point directly to untranslated canonical source IDs.');
  return { ...input, reviewedAt };
}
function reconcile(state) {
  const records = {}, collisions = [], unresolvedTargets = [];
  for (const [id, entry] of Object.entries(state.records)) {
    const leaves = heads(entry);
    if (leaves.length !== 1) collisions.push({ key: id, revisions: leaves.map(row => row.id).sort() });
    else records[id] = { revision: leaves[0].id, record: leaves[0].record, editedBy: [], deletedBy: [] };
  }
  for (const [id, row] of Object.entries(records)) {
    if (['edit', 'deletion'].includes(row.record.eventType) && !row.record.targetKey) {
      unresolvedTargets.push(id);
      continue;
    }
    if (!row.record.targetKey) continue;
    const target = records[row.record.targetKey];
    if (!target || target.record.type !== 'event' || target.record.eventType !== 'message' ||
        target.record.threadKey !== row.record.threadKey || target.record.channel !== row.record.channel ||
        target.record.timestamp > row.record.timestamp) {
      unresolvedTargets.push(id);
    } else if (row.record.eventType === 'deletion') target.deletedBy.push(id);
    else target.editedBy.push(id);
  }
  state.reconciliation = { schemaVersion: 1, records, collisions, unresolvedTargets: unresolvedTargets.sort() };
  state.manifest.reconciliationRequired = collisions.length > 0 || unresolvedTargets.length > 0;
}
function preparePage(page, source, state, provenance) {
  object(page, ['cursor', 'nextCursor', 'retrievedAt', 'identities', 'threads', 'memberships', 'events', 'threadCoverage'], 'page');
  cursor(page.cursor); cursor(page.nextCursor);
  requireValue(page.nextCursor === null || page.nextCursor !== page.cursor, 'A page cannot advance to its own cursor.');
  const retrievedAt = instant(page.retrievedAt, 'page.retrievedAt');
  const prefix = (type, id) => {
    const mapping = state.overlapReviews.flatMap(review => review.mappings).find(item => item.source === source.source &&
      item.account === source.account && item.connector === source.connector && item.type === type && item.id === id);
    return key(source.source, source.account, type, mapping ? mapping.targetId : id);
  };
  const additions = [];
  const known = (type, id) => [...additions].reverse().find(item => item.key === prefix(type, id)) || current(state.records[prefix(type, id)]);
  const add = (type, id, record, evidence, revision, context) => {
    const recordKey = prefix(type, id);
    if (recordKey !== key(source.source, source.account, type, id)) {
      const target = state.records[recordKey] || additions.find(item => item.key === recordKey);
      requireValue(target, 'Import canonical target evidence before translated aliases.', 'translation_target_missing');
      record.idKind = target.record.idKind;
    }
    const rows = [...(state.records[recordKey] ? versions(state.records[recordKey]) : []),
      ...additions.filter(item => item.key === recordKey).map(item => ({ ...item.revision, record: item.record }))];
    if (revision !== undefined) {
      object(revision, ['id', 'supersedes'], 'revision');
      text(revision.id, 'revision.id');
      requireValue(revision.id !== '$initial', 'Reserved revision ID.');
      const predecessors = revision.supersedes === null ? [] : [revision.supersedes].flat();
      requireValue((revision.supersedes === null || typeof revision.supersedes === 'string' || Array.isArray(revision.supersedes)) &&
        predecessors.every(id => typeof id === 'string' && id.length > 0) &&
        (!Array.isArray(revision.supersedes) || predecessors.length > 0) && new Set(predecessors).size === predecessors.length,
      'revision.supersedes must be an ID, a nonempty distinct ID list, or null.');
      requireValue(predecessors.every(id => id !== revision.id && rows.some(row => row.id === id)),
        'Revision predecessor must already exist.', 'revision_conflict');
      revision = { id: revision.id, supersedes: Array.isArray(revision.supersedes) ? [...revision.supersedes].sort() : revision.supersedes };
    } else revision = { id: '$initial', supersedes: null };
    const existing = rows.find(row => row.id === revision.id);
    requireValue(!existing || (isDeepStrictEqual(existing.supersedes, revision.supersedes) && isDeepStrictEqual(existing.record, record)),
      'An existing source ID/revision has conflicting metadata; supply an explicit new revision.', 'record_conflict');
    additions.push({ key: recordKey, record, revision, provenance: { ...provenance,
      overlapReview: state.overlapReviews.find(review => review.mappings.some(item => item.source === source.source &&
        item.account === source.account && item.connector === source.connector && item.type === type && item.id === id))?.revision || null, originalId: id,
      sourceRecord: evidence, ...(context ? { context } : {}), pageCursor: page.cursor, retrievedAt } });
  };
  for (const identity of array(page.identities, 'page.identities')) {
    identifier(identity, ['displayName', 'addresses', 'isSelf', 'deleted'], 'identity');
    requireValue(typeof identity.isSelf === 'boolean', 'identity.isSelf must be explicit.');
    const record = { type: 'identity', idKind: identity.idKind, isSelf: identity.isSelf };
    if (identity.deleted !== undefined) {
      requireValue(typeof identity.deleted === 'boolean' && identity.revision !== undefined, 'Identity tombstones require explicit revisions and boolean deleted.');
      record.deleted = identity.deleted;
    }
    if (identity.displayName !== undefined) record.displayName = text(identity.displayName, 'identity.displayName');
    if (identity.addresses !== undefined) record.addresses = array(identity.addresses, 'identity.addresses').map(address => {
      object(address, ['type', 'value'], 'address');
      requireValue(['email', 'phone'].includes(address.type), 'Unknown address type.');
      return { type: address.type, value: text(address.value, 'address.value') };
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    add('identity', identity.id, record, identity, identity.revision);
  }
  for (const thread of array(page.threads, 'page.threads')) {
    identifier(thread, ['kind', 'title', 'deleted'], 'thread');
    requireValue(['direct', 'group', 'broadcast', 'unknown'].includes(thread.kind), 'Invalid thread kind.');
    const record = { type: 'thread', idKind: thread.idKind, kind: thread.kind };
    if (thread.deleted !== undefined) {
      requireValue(typeof thread.deleted === 'boolean' && thread.revision !== undefined, 'Thread tombstones require explicit revisions and boolean deleted.');
      record.deleted = thread.deleted;
    }
    if (thread.title !== undefined) record.title = text(thread.title, 'thread.title');
    add('thread', thread.id, record, thread, thread.revision);
  }
  for (const membership of array(page.memberships, 'page.memberships')) {
    object(membership, ['threadId', 'identityId', 'validFrom', 'validUntil'], 'membership');
    text(membership.threadId, 'membership.threadId'); text(membership.identityId, 'membership.identityId');
    requireValue(known('thread', membership.threadId) && known('identity', membership.identityId), 'Membership references an unknown identity or thread.');
    const validFrom = membership.validFrom == null ? null : instant(membership.validFrom, 'membership.validFrom');
    const validUntil = membership.validUntil == null ? null : instant(membership.validUntil, 'membership.validUntil');
    requireValue(validFrom === null || validUntil === null || validFrom < validUntil, 'Invalid membership validity interval.');
    const threadKey = prefix('thread', membership.threadId), identityKey = prefix('identity', membership.identityId);
    const temporal = membership.validFrom !== undefined || membership.validUntil !== undefined;
    const id = temporal ? JSON.stringify([threadKey, identityKey, validFrom, validUntil]) :
      JSON.stringify([JSON.parse(threadKey)[3], JSON.parse(identityKey)[3]]);
    add('membership', id, { type: 'membership', threadKey, identityKey,
      ...(temporal ? { validFrom, validUntil } : {}) }, membership);
  }
  const memberships = [...Object.values(state.records), ...additions].map(item => item.record).filter(record => record.type === 'membership');
  for (const event of array(page.events, 'page.events')) {
    identifier(event, ['threadId', 'senderId', 'timestamp', 'channel', 'eventType', 'recipients', 'classification', 'targetId'], 'event');
    requireValue(known('thread', text(event.threadId, 'event.threadId')), 'Event references an unknown thread.');
    requireValue(event.senderId === null || known('identity', text(event.senderId, 'event.senderId')), 'Event references an unknown sender.');
    requireValue(CHANNELS[source.source].includes(event.channel), 'Event channel does not match the source.');
    requireValue(['message', 'reaction', 'membership', 'edit', 'deletion'].includes(event.eventType), 'Unsupported event type.');
    requireValue(event.eventType !== 'message' || event.senderId !== null, 'Message events require an identified sender.');
    requireValue(['interpersonal', 'bulk', 'automated', 'unclassified'].includes(event.classification), 'An explicit mail/activity classification is required.');
    const recipients = array(event.recipients, 'event.recipients').map(recipient => {
      object(recipient, ['identityId', 'role'], 'recipient');
      requireValue(known('identity', text(recipient.identityId, 'recipient.identityId')), 'Event references an unknown recipient.');
      requireValue(['to', 'cc', 'bcc', 'recipient'].includes(recipient.role), 'Unknown recipient role.');
      return { identityKey: prefix('identity', recipient.identityId), role: recipient.role };
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const observedThread = known('thread', event.threadId);
    const thread = observedThread.record;
    if (thread.kind === 'direct') {
      const time = instant(event.timestamp, 'event.timestamp');
      const people = new Set(memberships.filter(record => record.threadKey === prefix('thread', event.threadId) &&
        (!record.validFrom || record.validFrom <= time) && (!record.validUntil || time < record.validUntil)).map(record => record.identityKey));
      requireValue(people.size === 2 && [...people].filter(id => ([...additions].reverse().find(item => item.key === id) || current(state.records[id])).record.isSelf).length === 1 &&
        (event.senderId === null || people.has(prefix('identity', event.senderId))) && recipients.every(recipient => people.has(recipient.identityKey)),
      'A direct event requires exactly two known members including self, with sender and recipients in that thread.');
    }
    const timestamp = instant(event.timestamp, 'event.timestamp');
    requireValue(timestamp <= retrievedAt, 'An observation cannot occur after its retrieval timestamp.');
    requireValue(event.targetId === undefined || ['edit', 'deletion'].includes(event.eventType), 'Only edits/deletions can specify targetId.');
    requireValue(!['edit', 'deletion'].includes(event.eventType) || event.targetId !== undefined, 'Edits/deletions require an explicit targetId.');
    const targetKey = event.targetId === undefined ? undefined : prefix('event', text(event.targetId, 'event.targetId'));
    requireValue(targetKey !== prefix('event', event.id), 'An event cannot target itself.');
    add('event', event.id, {
      type: 'event', idKind: event.idKind, threadKey: prefix('thread', event.threadId),
      senderKey: event.senderId === null ? null : prefix('identity', event.senderId),
      timestamp, channel: event.channel,
      eventType: event.eventType, recipients, classification: event.classification,
      ...(targetKey ? { targetKey } : {})
    }, event, event.revision, { threadRevision: observedThread.revision.id, threadKind: thread.kind });
  }
  for (const item of array(page.threadCoverage === undefined ? [] : page.threadCoverage, 'page.threadCoverage')) {
    object(item, ['threadId', 'start', 'end', 'completeness', 'basis'], 'threadCoverage');
    requireValue(known('thread', text(item.threadId, 'threadCoverage.threadId')), 'Coverage references an unknown thread.');
    const { threadId, ...bounds } = item;
    const record = { type: 'threadCoverage', threadKey: prefix('thread', threadId), ...coverage(bounds, source.source) };
    add('threadCoverage', hash(JSON.stringify([record, source.connector, provenance.inputDigest, page.cursor])), record, item);
  }
  requireValue(source.source !== 'google-contacts' || (page.threads.length === 0 && page.memberships.length === 0 && page.events.length === 0),
    'Google contact presence cannot create communication activity.');
  return additions;
}
function persist(file, state) {
  reconcile(state);
  state.manifest.unresolvedIdentityKeys = Object.entries(state.records)
    .filter(([, value]) => value.record.type === 'identity' && !value.record.isSelf).map(([id]) => id).sort();
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function importSource(source, requestFolder, request, period, state, file, report) {
  const input = readJSON(path.resolve(requestFolder, source.input));
  object(input.value, ['schemaVersion', 'dataClass', 'source', 'account', 'connector', 'coverage', 'pages', 'errors', 'textArchive'], 'handoff');
  const handoff = input.value;
  requireValue(handoff.schemaVersion === 1 && handoff.dataClass === request.dataClass, 'Handoff version/data class does not match the request.');
  requireValue(['source', 'account', 'connector'].every(field => handoff[field] === source[field]), 'Handoff source/account/connector does not match the request.');
  const archiveKey = JSON.stringify([source.source, source.account]);
  const previousArchive = state.textArchives?.[archiveKey];
  if (handoff.textArchive !== undefined) {
    const archive = handoff.textArchive;
    object(archive, ['profile', 'archiveRef', 'sha256', 'ledgerDigest'], 'textArchive');
    requireValue(source.source === 'text-messages' && source.connector === 'synctech-xml-metadata-v1' &&
      handoff.dataClass === 'synthetic' && archive.profile === source.connector &&
      typeof archive.archiveRef === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(archive.archiveRef) &&
      [archive.sha256, archive.ledgerDigest].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)),
    'Invalid synthetic text archive binding.');
    requireValue(previousArchive ? isDeepStrictEqual(previousArchive, archive) :
      !Object.keys(state.records).some(recordKey => {
        const [family, account, type] = JSON.parse(recordKey);
        return family === source.source && account === source.account && type === 'event';
      }), 'A changed, overlapping or unbound text archive requires explicit reconciliation.', 'text_archive_conflict');
  } else requireValue(!previousArchive && source.connector !== 'synctech-xml-metadata-v1',
    'This text source/account requires its original archive binding.', 'text_archive_conflict');
  const declaredCoverage = coverage(handoff.coverage, source.source);
  report.upstreamErrors = array(handoff.errors === undefined ? [] : handoff.errors, 'handoff.errors').map(error => {
    object(error, ['code', 'retryable'], 'upstream error');
    requireValue(typeof error.retryable === 'boolean', 'Upstream errors need explicit retryability.');
    return { code: text(error.code, 'upstream error.code'), retryable: error.retryable };
  });
  const pages = array(handoff.pages, 'handoff.pages');
  requireValue(pages.length > 0, 'At least one page is required, including for a verified empty result.');
  const checkpointKey = sourceKey(source);
  const signature = hash(JSON.stringify(period));
  const previous = state.checkpoints[checkpointKey];
  if (request.resume && previous) requireValue(previous.periodSignature === signature, 'Resume interval differs from the saved checkpoint; restart with resume=false.', 'checkpoint_mismatch');
  const firstCursor = request.resume && previous && !previous.finished ? previous.nextCursor : null;
  const start = pages.findIndex(page => page.cursor === firstCursor);
  requireValue(start >= 0, 'The saved cursor is not present in the supplied handoff.', 'checkpoint_not_found');
  const visited = new Set();
  let expected = firstCursor;
  let processed = 0;
  let terminal = false;
  let lastRetrieval = null;
  for (let index = start; index < pages.length && processed < (request.maxPages || Infinity); index++) {
    const page = pages[index];
    requireValue(page.cursor === expected && !visited.has(page.cursor), 'Page sequence contains a gap or repeated cursor.', 'pagination_error');
    visited.add(page.cursor);
    const additions = preparePage(page, source, state, { connector: source.connector, inputDigest: input.digest });
    requireValue(page.nextCursor === null || !visited.has(page.nextCursor), 'Pagination contains a cursor cycle.', 'pagination_error');
    let duplicates = 0;
    for (const addition of additions) {
      let existing = state.records[addition.key];
      if (!existing) {
        existing = { record: addition.record, provenance: [], revisions: [] };
        state.records[addition.key] = existing;
      } else if (!existing.revisions) existing.revisions = structuredClone(versions(existing));
      const version = existing.revisions.find(row => row.id === addition.revision.id);
      if (version) {
        duplicates++;
        if (!version.provenance.some(item => isDeepStrictEqual(item, addition.provenance))) version.provenance.push(addition.provenance);
      } else existing.revisions.push({ ...addition.revision, record: addition.record, provenance: [addition.provenance] });
      if (!existing.provenance.some(item => isDeepStrictEqual(item, addition.provenance))) existing.provenance.push(addition.provenance);
    }
    if (handoff.textArchive) {
      state.textArchives ||= {};
      state.textArchives[archiveKey] = handoff.textArchive;
    }
    processed++;
    report.persistedPages = processed;
    report.duplicateRecords += duplicates;
    lastRetrieval = instant(page.retrievedAt, 'page.retrievedAt');
    expected = page.nextCursor;
    terminal = expected === null;
    state.checkpoints[checkpointKey] = { periodSignature: signature, nextCursor: expected, finished: terminal };
    Object.assign(report, { status: 'partial', observedOnly: true, coverage: declaredCoverage,
      retrievedAt: lastRetrieval, nextCursor: expected, paginationComplete: terminal });
    persist(file, state);
    if (terminal) {
      requireValue(index === pages.length - 1, 'Handoff includes unreachable pages after a terminal cursor.', 'pagination_error');
      break;
    }
  }
  const imported = Object.entries(state.records).filter(([id, row]) =>
    JSON.parse(id)[0] === source.source && JSON.parse(id)[1] === source.account && row.provenance.some(item =>
      item.connector === source.connector && item.inputDigest === input.digest));
  report.threadCoverage = imported.filter(([, row]) => row.record.type === 'threadCoverage').map(([, row]) => row.record);
  const coversPeriod = row => row.completeness === 'complete' && row.start !== null && row.end !== null &&
    row.start <= period.start && row.end >= period.end && row.end <= lastRetrieval;
  const sourceRecords = Object.entries(state.records).filter(([id, row]) =>
    JSON.parse(id)[0] === source.source && JSON.parse(id)[1] === source.account &&
      row.provenance.some(item => item.connector === source.connector));
  const threadKeys = [...new Set(sourceRecords.flatMap(([id, row]) => row.record.type === 'thread' ? [id] :
    row.record.threadKey ? [row.record.threadKey] : []))];
  const explicitThreadCoverage = pages.some(page => page.threadCoverage !== undefined) ||
    sourceRecords.some(([, row]) => row.record.type === 'threadCoverage');
  report.threadCoverageMode = explicitThreadCoverage ? 'per-thread' : 'inherited-source-declaration';
  const threadsCovered = !explicitThreadCoverage || threadKeys.every(threadKey =>
    report.threadCoverage.some(row => row.threadKey === threadKey && coversPeriod(row)) &&
    report.threadCoverage.filter(row => row.threadKey === threadKey).every(coversPeriod));
  const covered = threadsCovered && declaredCoverage.completeness === 'complete' && (source.source === 'google-contacts' ||
    (declaredCoverage.start <= period.start && declaredCoverage.end >= period.end && declaredCoverage.end <= lastRetrieval));
  Object.assign(report, { status: terminal && covered ? 'collected' : 'partial', coverage: declaredCoverage,
    retrievedAt: lastRetrieval, paginationComplete: terminal, nextCursor: expected,
    observedOnly: !(terminal && covered), transport: 'metadata-import' });
  if (report.upstreamErrors.length) report.status = 'partial';
  report.observedOnly = report.status !== 'collected';
}
function collect(request, requestFolder = process.cwd()) {
  object(request, ['schemaVersion', 'dataClass', 'period', 'output', 'sources', 'resume', 'maxPages', 'overlapReview'], 'request');
  requireValue(request.schemaVersion === 1, 'Only schemaVersion 1 is supported.');
  requireValue(['synthetic', 'private'].includes(request.dataClass), 'dataClass must be synthetic or private.');
  requireValue(request.dataClass === 'synthetic',
    'Private collection is disabled: CONTACTS-010 policy approval is not source/account or per-run authorization. Local ACL, disk encryption, storage location and retention/deletion controls are not verified by this importer.',
    'private_collection_disabled');
  requireValue(request.resume === undefined || typeof request.resume === 'boolean', 'resume must be boolean.');
  requireValue(request.maxPages === undefined || (Number.isSafeInteger(request.maxPages) && request.maxPages > 0), 'maxPages must be a positive integer.');
  const period = resolvePeriod(request.period);
  const overlapReview = reviewTranslations(request.overlapReview);
  const sources = array(request.sources, 'sources');
  requireValue(sources.length > 0, 'Request at least one source.');
  sources.forEach(validateSource);
  requireValue(new Set(sources.map(sourceKey)).size === sources.length, 'Duplicate source/account/connector requests are not allowed.');
  const output = outputLocation(path.resolve(requestFolder, text(request.output, 'output')));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const lock = path.join(output, 'collection.lock');
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new CollectionError('store_locked', 'Collection store is locked. Confirm no collector is running before removing the exact stale lock file.');
    throw error;
  }
  try {
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    const file = path.join(output, 'collection.json');
    requireValue(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'Collection snapshot must not be a symbolic link.', 'unsafe_output');
    const state = fs.existsSync(file) ? readJSON(file).value : { schemaVersion: 1, dataClass: request.dataClass, records: {}, checkpoints: {}, history: [] };
    requireValue(state.schemaVersion === 1 && state.dataClass === request.dataClass && state.records && state.checkpoints && Array.isArray(state.history),
      'Stored schema/data class does not match.');
    state.overlapReviews ||= [];
    if (overlapReview) {
      const previousReview = state.overlapReviews.find(row => row.revision === overlapReview.revision);
      requireValue(!previousReview || isDeepStrictEqual(previousReview, overlapReview), 'An overlap review revision cannot be changed.', 'review_conflict');
      const allMappings = [...state.overlapReviews.flatMap(review => review.mappings), ...overlapReview.mappings];
      requireValue(!allMappings.some(a => allMappings.some(b => a.source === b.source && a.account === b.account &&
        a.type === b.type && a.targetId === b.id)), 'Saved and new translations must not form chains or cycles.', 'review_conflict');
      for (const mapping of overlapReview.mappings) {
        requireValue(!state.records[key(mapping.source, mapping.account, mapping.type, mapping.id)],
          'Translation alias was already imported; retain this store and replay into a fresh store with the review.', 'review_conflict');
        requireValue(!state.overlapReviews.some(review => review.mappings.some(row =>
          ['source', 'account', 'connector', 'type', 'id'].every(field => row[field] === mapping[field]) && row.targetId !== mapping.targetId)),
        'An imported translation cannot be retargeted; preserve the store and replay with a corrected review.', 'review_conflict');
      }
      if (!previousReview) state.overlapReviews.push(overlapReview);
    }
    if (state.manifest) {
      const { collectedAt, period: previousPeriod, status, sources: previousSources } = state.manifest;
      state.history.push({ collectedAt, period: previousPeriod, status, sources: previousSources });
    }
    state.manifest = { schemaVersion: 1, dataClass: request.dataClass, collectedAt: new Date().toISOString(), period,
      status: 'in_progress', identityMappingRevision: null,
      sources: sources.map(source => ({ source: source.source, account: source.account, connector: source.connector, status: 'pending',
        persistedPages: 0, duplicateRecords: 0, coverage: null, retrievedAt: null, paginationComplete: false, nextCursor: null })),
      unresolvedIdentityKeys: [],
      limitations: ['Metadata handoff imports only; native conversion is separate and no live endpoints are connected.',
        'Provider/account namespaces and local IDs require review before overlapping imports; unreviewed different IDs remain distinct.',
        'Use reconciliation.records for unique current revisions; raw records retain original evidence.',
        'Edits, deletions and membership events are not messages; deletedBy marks message tombstones.'] };
    persist(file, state);
    for (const [index, source] of sources.entries()) {
      const report = state.manifest.sources[index];
      if (source.mode === 'unavailable') Object.assign(report, { status: source.status, reason: source.reason });
      else {
        try { importSource(source, requestFolder, request, period, state, file, report); }
        catch (error) {
          if (!(error instanceof CollectionError)) throw error;
          Object.assign(report, { status: 'failed', error: { code: error.code, message: error.message } });
        }
      }
      persist(file, state);
    }
    state.manifest.status = state.manifest.sources.every(source => source.status === 'collected') &&
      !state.manifest.reconciliationRequired ? 'collected' : 'partial';
    persist(file, state);
    return { file, manifest: state.manifest, exitCode: state.manifest.status === 'collected' ? 0 : 2 };
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (args.length === 3 && args[0] === '--demo' && args[1] === '--output') {
      const { writeDemo } = require('./demo.cjs');
      const demo = writeDemo(outputLocation(args[2]));
      result = collect(demo.request, demo.folder);
    } else {
      requireValue(args.length === 2 && args[0] === '--request', 'Usage: node scripts\\contacts\\collect.cjs --request <request.json> | --demo --output <directory>', 'invalid_arguments');
      const requestFile = path.resolve(args[1]);
      result = collect(readJSON(requestFile).value, path.dirname(requestFile));
    }
    process.stdout.write(JSON.stringify({ file: result.file, ...result.manifest }, null, 2) + '\n');
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`Collection failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { collect, resolvePeriod, outputLocation };
