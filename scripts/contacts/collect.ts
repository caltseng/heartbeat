import type { RecordEntry } from './types.ts';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { writeDemo } from './demo.ts';
import { CollectionError, requireValue, object, text, array, instant, hash, readJSON, within,
  SOURCES, CHANNELS, versions, sourceIdentifier as identifier,
  outputLocation, openLock, releaseLock, runCLI } from './lib.ts';
import { readCollection, persistCollection } from './collection-store.ts';
import { resolvePeriod } from './period.ts';
export type { PeriodPreset, PeriodRequest, ResolvedPeriod } from './period.ts';
export interface SourceReference {
  source: string;
  account: string;
  connector: string;
}

const key = (source: string, account: string, type: string, id: string): string => JSON.stringify([source, account, type, id]);
const sourceKey = (source: SourceReference): string => JSON.stringify([source.source, source.account, source.connector]);
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
const translationKey = mapping => JSON.stringify([mapping.source, mapping.account, mapping.connector, mapping.type, mapping.id]);
function directTranslations(mappings) {
  const ids = new Set(mappings.map(row => key(row.source, row.account, row.type, row.id)));
  return mappings.every(row => !ids.has(key(row.source, row.account, row.type, row.targetId)));
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
    const locator = translationKey(mapping);
    requireValue(!seen.has(locator) && mapping.id !== mapping.targetId, 'Duplicate or self translation.');
    seen.add(locator);
  }
  requireValue(directTranslations(mappings), 'Translations must point directly to untranslated canonical source IDs.');
  return { ...input, reviewedAt };
}
function reconcile(state) {
  const records = {}, collisions = [], unresolvedTargets = [], pendingTargets = [];
  for (const [id, entry] of Object.entries<RecordEntry>(state.records)) {
    const leaves = heads(entry);
    if (leaves.length !== 1) collisions.push({ key: id, revisions: leaves.map(row => row.id).sort() });
    else records[id] = { revision: leaves[0].id, record: leaves[0].record, editedBy: [], deletedBy: [] };
  }
  for (const [id, row] of Object.entries<RecordEntry>(records)) {
    if (['edit', 'deletion'].includes(row.record.eventType) && !row.record.targetKey) {
      unresolvedTargets.push(id);
      continue;
    }
    if (!row.record.targetKey) continue;
    const target = records[row.record.targetKey];
    if (!target && !state.records[row.record.targetKey]) {
      pendingTargets.push(id);
      continue;
    }
    if (!target || target.record.type !== 'event' || target.record.eventType !== 'message' ||
        target.record.threadKey !== row.record.threadKey || target.record.channel !== row.record.channel ||
        target.record.timestamp > row.record.timestamp) {
      unresolvedTargets.push(id);
    } else if (row.record.eventType === 'deletion') target.deletedBy.push(id);
    else target.editedBy.push(id);
  }
  state.reconciliation = { schemaVersion: 1, records, collisions,
    unresolvedTargets: unresolvedTargets.sort(), pendingTargets: pendingTargets.sort() };
  state.manifest.reconciliationRequired = collisions.length > 0 || unresolvedTargets.length > 0;
}
function preparePage(page, source, state, provenance, storedMemberships) {
  object(page, ['cursor', 'nextCursor', 'retrievedAt', 'identities', 'threads', 'memberships', 'events', 'threadCoverage'], 'page');
  cursor(page.cursor); cursor(page.nextCursor);
  requireValue(page.nextCursor === null || page.nextCursor !== page.cursor, 'A page cannot advance to its own cursor.');
  const retrievedAt = instant(page.retrievedAt, 'page.retrievedAt');
  if (state.operations) {
    const { cutoff, deletedThrough } = state.operations;
    requireValue(!deletedThrough || retrievedAt > deletedThrough,
      'Deleted acquisition metadata cannot be replayed; explicitly acquire a fresh synthetic snapshot.', 'deleted_input');
    requireValue(retrievedAt > cutoff && array(page.events, 'page.events').every(event =>
      instant(event.timestamp, 'event.timestamp') > cutoff &&
      (!deletedThrough || instant(event.timestamp, 'event.timestamp') > deletedThrough)),
    'This page contains expired or explicitly deleted metadata; prepare a bounded fresh handoff.', 'retention_required');
  }
  const translations = new Map();
  for (const review of state.overlapReviews) {
    for (const mapping of review.mappings) {
      if (mapping.source !== source.source || mapping.account !== source.account || mapping.connector !== source.connector) continue;
      const locator = JSON.stringify([mapping.type, mapping.id]);
      if (!translations.has(locator)) translations.set(locator, { targetId: mapping.targetId, revision: review.revision });
    }
  }
  const translation = (type, id) => translations.get(JSON.stringify([type, id]));
  const prefix = (type, id) => key(source.source, source.account, type, translation(type, id)?.targetId ?? id);
  const additions = [];
  const latest = new Map(), first = new Map(), revisions = new Map(), saved = new Map();
  const knownKey = recordKey => {
    if (latest.has(recordKey)) return latest.get(recordKey);
    if (!saved.has(recordKey)) saved.set(recordKey, current(state.records[recordKey]));
    return saved.get(recordKey);
  };
  const known = (type, id) => knownKey(prefix(type, id));
  const add = (type, id, record, evidence, revision?: import('./types.ts').Revision, context?: import('./types.ts').Provenance['context']) => {
    const recordKey = prefix(type, id);
    if (recordKey !== key(source.source, source.account, type, id)) {
      const target = state.records[recordKey] || first.get(recordKey);
      requireValue(target, 'Import canonical target evidence before translated aliases.', 'translation_target_missing');
      record.idKind = target.record.idKind;
    }
    if (!revisions.has(recordKey)) revisions.set(recordKey,
      new Map((state.records[recordKey] ? versions(state.records[recordKey]) : []).map(row => [row.id, row])));
    const rows = revisions.get(recordKey);
    if (revision !== undefined) {
      object(revision, ['id', 'supersedes'], 'revision');
      text(revision.id, 'revision.id');
      requireValue(revision.id !== '$initial', 'Reserved revision ID.');
      const predecessors = revision.supersedes === null ? [] : [revision.supersedes].flat();
      requireValue((revision.supersedes === null || typeof revision.supersedes === 'string' || Array.isArray(revision.supersedes)) &&
        predecessors.every(id => typeof id === 'string' && id.length > 0) &&
        (!Array.isArray(revision.supersedes) || predecessors.length > 0) && new Set(predecessors).size === predecessors.length,
      'revision.supersedes must be an ID, a nonempty distinct ID list, or null.');
      requireValue(predecessors.every(id => id !== revision.id && rows.has(id)),
        'Revision predecessor must already exist.', 'revision_conflict');
      revision = { id: revision.id, supersedes: Array.isArray(revision.supersedes) ? [...revision.supersedes].sort() : revision.supersedes };
    } else revision = { id: '$initial', supersedes: null };
    const existing = rows.get(revision.id);
    requireValue(!existing || (isDeepStrictEqual(existing.supersedes, revision.supersedes) && isDeepStrictEqual(existing.record, record)),
      'An existing source ID/revision has conflicting metadata; supply an explicit new revision.', 'record_conflict');
    const addition = { key: recordKey, record, revision, provenance: { ...provenance,
      overlapReview: translation(type, id)?.revision || null, originalId: id,
      sourceRecord: evidence, ...(context ? { context } : {}), pageCursor: page.cursor, retrievedAt } };
    additions.push(addition);
    latest.set(recordKey, addition);
    if (!first.has(recordKey)) first.set(recordKey, addition);
    if (!existing) rows.set(revision.id, { ...revision, record });
  };
  for (const identity of array(page.identities, 'page.identities')) {
    identifier(identity, ['displayName', 'addresses', 'isSelf', 'deleted'], 'identity');
    requireValue(typeof identity.isSelf === 'boolean', 'identity.isSelf must be explicit.');
    const record: import('./types.ts').SourceRecord = { type: 'identity', idKind: identity.idKind, isSelf: identity.isSelf };
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
    const record: import('./types.ts').SourceRecord = { type: 'thread', idKind: thread.idKind, kind: thread.kind };
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
  const memberships = new Map();
  for (const { record } of additions) {
    if (record.type !== 'membership') continue;
    if (!memberships.has(record.threadKey)) memberships.set(record.threadKey, [...(storedMemberships.get(record.threadKey) || [])]);
    memberships.get(record.threadKey).push(record);
  }
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
      const threadMemberships = memberships.get(prefix('thread', event.threadId)) ||
        storedMemberships.get(prefix('thread', event.threadId)) || [];
      const people = new Set(threadMemberships.filter(record =>
        (!record.validFrom || record.validFrom <= time) && (!record.validUntil || time < record.validUntil)).map(record => record.identityKey));
      requireValue(people.size === 2 && [...people].filter(id => knownKey(id).record.isSelf).length === 1 &&
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
  state.manifest.unresolvedIdentityKeys = Object.entries<RecordEntry>(state.records)
    .filter(([, value]) => value.record.type === 'identity' && !value.record.isSelf).map(([id]) => id).sort();
  persistCollection(file, state);
}
interface SnapshotBinding {
  profile: string;
  ref: string;
  scope: string;
  sha256: string;
  ledgerDigest: string | null;
  metadataDigest: string | null;
}
interface SnapshotProfile {
  source: string;
  connector: string;
  field: 'textArchive' | 'whatsappArchive' | null;
  store: 'textArchives' | 'whatsappArchives' | null;
}
const SNAPSHOT_PROFILES: SnapshotProfile[] = [
  { source: 'text-messages', connector: 'synctech-xml-metadata-v1', field: 'textArchive', store: 'textArchives' },
  { source: 'messenger', connector: 'messenger-json-snapshot-v1', field: null, store: null },
  { source: 'whatsapp', connector: 'whatsapp-ios-txt-metadata-v1', field: 'whatsappArchive', store: 'whatsappArchives' }
];

const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function messengerNamespace(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const parts = id.split(':');
  return parts.length === 3 && parts[0] === 'messenger-json-snapshot-v1' &&
    digest(parts[1]) && digest(parts[2]) ? parts[1] : null;
}
function normalizedBinding(profile: SnapshotProfile, source: SourceReference, archive): SnapshotBinding {
  return { profile: archive.profile, ref: archive.archiveRef,
    scope: profile.source === 'whatsapp' ? archive.threadId : JSON.stringify([source.source, source.account]),
    sha256: archive.sha256, ledgerDigest: archive.ledgerDigest, metadataDigest: archive.metadataDigest ?? null };
}
interface IndexedRecord {
  key: string;
  type: string;
  id: string;
  entry: RecordEntry;
}
function snapshotBinding(handoff, source, state, existing: Map<string, IndexedRecord>) {
  let reservation = null;
  for (const profile of SNAPSHOT_PROFILES) {
    const declared = profile.field && handoff[profile.field] !== undefined;
    requireValue(!declared || (source.source === profile.source && source.connector === profile.connector),
      'Snapshot binding does not match the source/connector.', 'snapshot_conflict');
    if (source.source !== profile.source) continue;
    if (profile.source === 'whatsapp') {
      for (const page of handoff.pages) {
        object(page, ['cursor', 'nextCursor', 'retrievedAt', 'identities', 'threads', 'memberships', 'events', 'threadCoverage'], 'page');
        array(page.threads, 'page.threads');
        array(page.events, 'page.events');
      }
    }
    const accountScope = JSON.stringify([source.source, source.account]);
    const bindings = new Map<string, SnapshotBinding>();
    if (profile.store) {
      for (const [id, archive] of Object.entries(state[profile.store] || {})) {
        if (profile.source === 'whatsapp' ? JSON.parse(id)[0] === source.account : id === accountScope) {
          bindings.set(id, normalizedBinding(profile, source, archive));
        }
      }
    }
    if (source.connector !== profile.connector) {
      const touches = profile.source === 'whatsapp' ? [...bindings.values()].some(binding => handoff.pages.some(page =>
        page.threads.some(row => row?.id === binding.scope) ||
        page.events.some(row => row?.threadId === binding.scope ||
          (typeof row?.id === 'string' && row.id.startsWith(`${binding.ref}:record:`))))) :
        bindings.size > 0 || (profile.source === 'messenger' &&
          [...existing.values()].some(row => row.entry.provenance.some(item => item.connector === profile.connector)));
      requireValue(!touches,
        'This source scope requires its original snapshot binding.', 'snapshot_conflict');
      continue;
    }
    requireValue(!profile.field || declared, 'This converter requires its snapshot binding.', 'snapshot_conflict');
    let binding: SnapshotBinding;
    if (profile.source === 'messenger') {
      let namespace: string | null = null;
      for (const page of handoff.pages) {
        for (const kind of ['identities', 'threads', 'events']) {
          for (const row of array(page[kind], `page.${kind}`)) {
            const observed = messengerNamespace(row.id);
            requireValue(observed && (namespace === null || observed === namespace),
              'Snapshot IDs must share one labeled immutable namespace.', 'snapshot_conflict');
            namespace = observed;
          }
        }
      }
      requireValue(namespace, 'Snapshot IDs must share one labeled immutable namespace.', 'snapshot_conflict');
      binding = { profile: profile.connector, ref: namespace, scope: accountScope,
        sha256: namespace, ledgerDigest: null, metadataDigest: null };
    } else {
      const archive = handoff[profile.field];
      object(archive, profile.source === 'whatsapp' ?
        ['profile', 'threadId', 'archiveRef', 'sha256', 'ledgerDigest', 'metadataDigest'] :
        ['profile', 'archiveRef', 'sha256', 'ledgerDigest'], profile.field);
      if (profile.source === 'whatsapp') {
        const { whatsappArchive, ...metadata } = handoff;
        requireValue([archive.threadId, archive.archiveRef].every(value =>
          typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) &&
          [archive.sha256, archive.ledgerDigest, archive.metadataDigest].every(digest) &&
          archive.metadataDigest === hash(JSON.stringify(metadata)), 'Invalid synthetic archive binding.', 'snapshot_conflict');
        requireValue(handoff.pages.length === 1 && handoff.pages[0].cursor === null && handoff.pages[0].nextCursor === null &&
          handoff.pages[0].threads.length === 1 && handoff.pages[0].threads[0]?.id === archive.threadId &&
          handoff.pages[0].events.every(row => row?.threadId === archive.threadId && row.idKind === 'local' &&
            typeof row.id === 'string' && row.id.startsWith(`${archive.archiveRef}:record:`)) &&
          handoff.coverage.completeness === 'unknown', 'Invalid snapshot scope.', 'snapshot_conflict');
      } else {
        requireValue(typeof archive.archiveRef === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(archive.archiveRef) &&
          [archive.sha256, archive.ledgerDigest].every(digest),
        'Invalid synthetic text archive binding.', 'snapshot_conflict');
      }
      binding = normalizedBinding(profile, source, archive);
    }
    requireValue(handoff.dataClass === 'synthetic' && binding.profile === source.connector,
      'Invalid synthetic snapshot profile.', 'snapshot_conflict');
    const scope = profile.source === 'whatsapp' ? JSON.stringify([source.account, binding.scope]) : accountScope;
    const previous = bindings.get(scope);
    requireValue((!previous || (isDeepStrictEqual(previous, binding) &&
      isDeepStrictEqual(state[profile.store][scope], handoff[profile.field]))) &&
      (previous || [...existing.values()].every(({ type, id, entry }) => {
        if (profile.source === 'messenger') return entry.provenance.every(item => item.connector === profile.connector) &&
          (entry.record.type === 'membership' || messengerNamespace(id) === binding.ref);
        if (type !== 'event') return true;
        return profile.source === 'whatsapp' && versions(entry).every(({ record }) =>
          record.threadKey !== key(source.source, source.account, 'thread', binding.scope) &&
          !id.startsWith(`${binding.ref}:record:`));
      })) &&
      [...bindings].every(([id, other]) => id === scope || profile.source !== 'whatsapp' ||
        (other.ref !== binding.ref && other.sha256 !== binding.sha256)),
    'Changed, overlapping or unbound snapshot history requires explicit reconciliation.', 'snapshot_conflict');
    if (profile.store) reservation = { store: profile.store, scope, binding: handoff[profile.field] };
  }
  return reservation;
}

function importSource(source, requestFolder, request, period, state, file, report) {
  const input = readJSON(path.resolve(requestFolder, source.input));
  object(input.value, ['schemaVersion', 'dataClass', 'source', 'account', 'connector', 'coverage', 'pages', 'errors', 'textArchive', 'whatsappArchive'], 'handoff');
  const handoff = input.value;
  requireValue(handoff.schemaVersion === 1 && handoff.dataClass === request.dataClass, 'Handoff version/data class does not match the request.');
  requireValue(['source', 'account', 'connector'].every(field => handoff[field] === source[field]), 'Handoff source/account/connector does not match the request.');
  const declaredCoverage = coverage(handoff.coverage, source.source);
  report.upstreamErrors = array(handoff.errors === undefined ? [] : handoff.errors, 'handoff.errors').map(error => {
    object(error, ['code', 'retryable'], 'upstream error');
    requireValue(typeof error.retryable === 'boolean', 'Upstream errors need explicit retryability.');
    return { code: text(error.code, 'upstream error.code'), retryable: error.retryable };
  });
  const pages = array(handoff.pages, 'handoff.pages');
  requireValue(pages.length > 0, 'At least one page is required, including for a verified empty result.');
  const sourceRecords = new Map<string, IndexedRecord>();
  const memberships = new Map<string, import('./types.ts').SourceRecord[]>();
  for (const [id, entry] of Object.entries<RecordEntry>(state.records)) {
    const [family, account, type, recordId] = JSON.parse(id);
    if (family === source.source && account === source.account) {
      sourceRecords.set(id, { key: id, type, id: recordId, entry });
    }
    if (entry.record.type === 'membership') {
      if (!memberships.has(entry.record.threadKey)) memberships.set(entry.record.threadKey, []);
      memberships.get(entry.record.threadKey).push(entry.record);
    }
  }
  const binding = snapshotBinding(handoff, source, state, sourceRecords);
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
    const additions = preparePage(page, source, state, { connector: source.connector, inputDigest: input.digest }, memberships);
    requireValue(page.nextCursor === null || !visited.has(page.nextCursor), 'Pagination contains a cursor cycle.', 'pagination_error');
    let duplicates = 0;
    const revisionIndexes = new Map();
    for (const addition of additions) {
      let existing = state.records[addition.key];
      if (!existing) {
        existing = { record: addition.record, provenance: [], revisions: [] };
        state.records[addition.key] = existing;
        const [, , type, id] = JSON.parse(addition.key);
        sourceRecords.set(addition.key, { key: addition.key, type, id, entry: existing });
        if (addition.record.type === 'membership') {
          if (!memberships.has(addition.record.threadKey)) memberships.set(addition.record.threadKey, []);
          memberships.get(addition.record.threadKey).push(addition.record);
        }
      } else if (!existing.revisions) existing.revisions = structuredClone(versions(existing));
      if (!revisionIndexes.has(addition.key)) revisionIndexes.set(addition.key,
        new Map(existing.revisions.map(row => [row.id, row])));
      const revisionIndex = revisionIndexes.get(addition.key);
      const version = revisionIndex.get(addition.revision.id);
      if (version) {
        duplicates++;
        if (!version.provenance.some(item => isDeepStrictEqual(item, addition.provenance))) version.provenance.push(addition.provenance);
      } else {
        const row = { ...addition.revision, record: addition.record, provenance: [addition.provenance] };
        existing.revisions.push(row);
        revisionIndex.set(row.id, row);
      }
      if (!existing.provenance.some(item => isDeepStrictEqual(item, addition.provenance))) existing.provenance.push(addition.provenance);
    }
    if (binding) {
      state[binding.store] ||= {};
      state[binding.store][binding.scope] = binding.binding;
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
  report.threadCoverage = [];
  const threadKeys = new Set<string>();
  let explicitThreadCoverage = pages.some(page => page.threadCoverage !== undefined);
  for (const { key: id, entry } of sourceRecords.values()) {
    let fromConnector = false, fromInput = false;
    for (const item of entry.provenance) {
      if (item.connector !== source.connector) continue;
      fromConnector = true;
      if (item.inputDigest === input.digest) fromInput = true;
    }
    if (!fromConnector) continue;
    if (entry.record.type === 'thread') threadKeys.add(id);
    else if (entry.record.threadKey) threadKeys.add(entry.record.threadKey);
    if (entry.record.type === 'threadCoverage') {
      explicitThreadCoverage = true;
      if (fromInput) report.threadCoverage.push(entry.record);
    }
  }
  const coversPeriod = row => row.completeness === 'complete' && row.start !== null && row.end !== null &&
    row.start <= period.start && row.end >= period.end && row.end <= lastRetrieval;
  report.threadCoverageMode = explicitThreadCoverage ? 'per-thread' : 'inherited-source-declaration';
  const coveredThreads = new Map();
  for (const row of report.threadCoverage) {
    coveredThreads.set(row.threadKey, (coveredThreads.get(row.threadKey) ?? true) && coversPeriod(row));
  }
  const threadsCovered = !explicitThreadCoverage || [...threadKeys].every(threadKey => coveredThreads.get(threadKey) === true);
  const covered = threadsCovered && declaredCoverage.completeness === 'complete' && (source.source === 'google-contacts' ||
    (declaredCoverage.start <= period.start && declaredCoverage.end >= period.end && declaredCoverage.end <= lastRetrieval));
  Object.assign(report, { status: terminal && covered ? 'collected' : 'partial', coverage: declaredCoverage,
    retrievedAt: lastRetrieval, paginationComplete: terminal, nextCursor: expected,
    observedOnly: !(terminal && covered), transport: 'metadata-import' });
  if (report.upstreamErrors.length) report.status = 'partial';
  report.observedOnly = report.status !== 'collected';
}
function collect(request, requestFolder = process.cwd(), operationAsOf = null) {
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
  lockFd = openLock(lock, () => new CollectionError('store_locked', 'Collection store is locked. Confirm no collector is running before removing the exact stale lock file.'));
  try {
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    const file = path.join(output, 'collection.json');
    requireValue(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'Collection snapshot must not be a symbolic link.', 'unsafe_output');
    const state = fs.existsSync(file) ? readCollection(file).value : { schemaVersion: 1, dataClass: request.dataClass, records: {}, checkpoints: {}, history: [] };
    requireValue(state.schemaVersion === 1 && state.dataClass === request.dataClass && state.records && state.checkpoints && Array.isArray(state.history),
      'Stored schema/data class does not match.');
    requireValue(!state.operations?.pendingArtifacts,
      'An interrupted purge must finish with contacts:operate recover before importing.', 'recovery_required');
    requireValue(!state.operations || operationAsOf === state.operations.asOf,
      'Use contacts:operate refresh/resync for this managed store so retention is checked at time of use.', 'operation_required');
    state.overlapReviews ||= [];
    if (overlapReview) {
      const previousReview = state.overlapReviews.find(row => row.revision === overlapReview.revision);
      requireValue(!previousReview || isDeepStrictEqual(previousReview, overlapReview), 'An overlap review revision cannot be changed.', 'review_conflict');
      const allMappings = [...state.overlapReviews.flatMap(review => review.mappings), ...overlapReview.mappings];
      requireValue(directTranslations(allMappings), 'Saved and new translations must not form chains or cycles.', 'review_conflict');
      const savedMappings = new Map(state.overlapReviews.flatMap(review => review.mappings)
        .map(row => [translationKey(row), row.targetId]));
      for (const mapping of overlapReview.mappings) {
        requireValue(!state.records[key(mapping.source, mapping.account, mapping.type, mapping.id)],
          'Translation alias was already imported; retain this store and replay into a fresh store with the review.', 'review_conflict');
        requireValue(!savedMappings.has(translationKey(mapping)) || savedMappings.get(translationKey(mapping)) === mapping.targetId,
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
        'Synthetic conversion does not authorize private processing.',
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
    releaseLock(lock, lockFd);
  }
}

if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    let result;
    if (args.length === 3 && args[0] === '--demo' && args[1] === '--output') {
      const demo = writeDemo(outputLocation(args[2]));
      result = collect(demo.request, demo.folder);
    } else {
      requireValue(args.length === 2 && args[0] === '--request', 'Usage: node --import tsx scripts\\contacts\\collect.ts --request <request.json> | --demo --output <directory>', 'invalid_arguments');
      const requestFile = path.resolve(args[1]);
      result = collect(readJSON(requestFile).value, path.dirname(requestFile));
    }
    process.stdout.write(JSON.stringify({ file: result.file, ...result.manifest }, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Collection failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    return 1;
  });
}

export { collect, resolvePeriod, outputLocation, persist, readJSON, instant, requireValue, object };
