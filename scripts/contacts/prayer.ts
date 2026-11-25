import type { PrayerRequest } from './types.ts';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hashJSON, readJSONValue as readJSON, createGuard, persist, openLock, releaseLock, runCLI,
  outputLocation } from './lib.ts';
import { curate } from './curated.ts';

const STATUSES = ['unknown', 'active', 'paused', 'answered', 'resolved'];
const requireValue = createGuard('invalid_prayer');
function object(value, fields) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => fields.includes(key)), 'Invalid prayer fields.');
}
function text(value) {
  requireValue(typeof value === 'string' && value.trim().length > 0, 'Expected nonempty prayer text.');
  return value;
}
function identifier(value) {
  requireValue(typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value), 'Invalid prayer identifier.');
  return value;
}
function references(values, records, minimum = 0) {
  requireValue(Array.isArray(values) && values.length >= minimum && new Set(values).size === values.length &&
    values.every(id => typeof id === 'string' && Object.hasOwn(records, id)), 'Invalid prayer references.');
}
function instant(value) {
  requireValue(typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value, 'Invalid prayer capture instant.');
}
function date(value) {
  requireValue(value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value),
  'Prayer recordedOn must be a real YYYY-MM-DD or null.');
}
function validateRecords(records, notes) {
  object(records, ['requests', 'plans']);
  for (const dictionary of [records.requests, records.plans]) {
    requireValue(dictionary && typeof dictionary === 'object' && !Array.isArray(dictionary), 'Invalid prayer dictionary.');
  }
  for (const [id, request] of Object.entries<PrayerRequest>(records.requests)) {
    identifier(id);
    object(request, ['text', 'noteIds', 'recordedOn', 'capturedAt', 'updates']);
    text(request.text);
    references(request.noteIds, notes, 1);
    date(request.recordedOn);
    instant(request.capturedAt);
    requireValue(Array.isArray(request.updates), 'Invalid prayer updates.');
    const ids = new Set();
    for (const update of request.updates) {
      object(update, ['id', 'text', 'noteIds', 'status', 'statusConfirmed', 'capturedAt']);
      identifier(update.id);
      requireValue(!ids.has(update.id), 'Prayer updates are append-only.');
      ids.add(update.id);
      text(update.text);
      references(update.noteIds, notes, 1);
      requireValue((update.status === null && update.statusConfirmed === false) ||
        (STATUSES.includes(update.status) && update.statusConfirmed === true),
      'A status change requires explicit user confirmation; use null/false for ambiguity.', 'status_confirmation_required');
      instant(update.capturedAt);
    }
  }
  for (const [id, plan] of Object.entries<{ label: string; requestIds: string[] }>(records.plans)) {
    identifier(id);
    object(plan, ['label', 'requestIds']);
    text(plan.label);
    references(plan.requestIds, records.requests);
  }
}
function prayer(request, requestFolder = process.cwd(), inspect = false) {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'mapping', 'curated', 'output',
    'expectedRevision', 'curatedDigest', 'reason', 'operations']);
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private prayer content is disabled; only schemaVersion 1 synthetic requests are supported.', 'private_collection_disabled');
  const curated = curate({
    schemaVersion: 1, dataClass: request.dataClass, collection: request.collection,
    mapping: request.mapping, output: text(request.curated)
  }, requestFolder, true);
  const curatedDigest = hashJSON({
    revision: curated.revision, records: curated.records,
    mappingDigest: curated.mappingDigest, collectionDigest: curated.collectionDigest
  });
  const output = outputLocation(path.resolve(requestFolder, text(request.output)));
  const file = path.join(output, 'prayer.json');
  const lock = path.join(output, 'prayer.lock');
  let lockFd;
  if (!inspect) {
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    lockFd = openLock(lock, () => Object.assign(new Error('Prayer store is locked; verify the writer stopped before removing this exact lock.'), { code: 'store_locked' }));
  }
  try {
    if (!inspect) fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    requireValue(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'Unsafe prayer snapshot.', 'unsafe_output');
    const state = fs.existsSync(file) ? readJSON(file) : {
      schemaVersion: 1, dataClass: 'synthetic', revision: 0, records: { requests: {}, plans: {} }, history: []
    };
    object(state, ['schemaVersion', 'dataClass', 'revision', 'records', 'history']);
    requireValue(state.schemaVersion === 1 && state.dataClass === 'synthetic' &&
      Number.isSafeInteger(state.revision) && state.revision >= 0 &&
      Array.isArray(state.history) && state.history.length === state.revision, 'Invalid stored prayer state.');
    validateRecords(state.records, curated.records.notes);
    const result = () => ({
      heading: 'Heartbeat private prayer triage', audience: 'private-local-only', file,
      revision: state.revision, curatedRevision: curated.revision, curatedDigest,
      mappingRevision: curated.mappingRevision, mappingDigest: curated.mappingDigest,
      collectionDigest: curated.collectionDigest, sources: curated.sources,
      reconciliationRequired: curated.reconciliationRequired, collisions: curated.collisions,
      unresolvedTargets: curated.unresolvedTargets, pendingTargets: curated.pendingTargets,
      changedIdentityKeys: curated.changedIdentityKeys, inactiveIdentityKeys: curated.inactiveIdentityKeys,
      canonical: curated.canonical, records: state.records,
      requests: Object.fromEntries(Object.entries<PrayerRequest>(state.records.requests).map(([id, entry]) => {
        const confirmed = entry.updates.filter(update => update.statusConfirmed).at(-1);
        const status = confirmed ? confirmed.status : 'unknown';
        const needsStatusReview = !confirmed || entry.updates.at(-1)?.status === null || status === 'unknown';
        const noteIds = [...new Set([...entry.noteIds, ...entry.updates.flatMap(update => update.noteIds)])];
        return [id, {
          ...entry, status, needsStatusReview,
          statusQuestion: needsStatusReview ? 'Has this request changed? Please explicitly confirm its current status.' : null,
          originalNotes: Object.fromEntries(noteIds.map(noteId => [noteId, curated.records.notes[noteId]]))
        }];
      })),
      exitCode: curated.exitCode
    });
    if (inspect) return result();
    requireValue(request.expectedRevision === state.revision, 'Prayer revision changed; inspect again.', 'revision_conflict');
    requireValue(request.curatedDigest === curatedDigest, 'Curated evidence changed; inspect again.', 'curated_conflict');
    text(request.reason);
    requireValue(Array.isArray(request.operations) && request.operations.length > 0, 'Provide explicit prayer operations.');
    const before = structuredClone(state.records);
    const capturedAt = new Date().toISOString();
    for (const operation of request.operations) {
      requireValue(operation && typeof operation === 'object', 'Invalid prayer operation.');
      if (operation.type === 'request') {
        object(operation, ['type', 'id', 'text', 'noteIds', 'recordedOn']);
        const id = identifier(operation.id);
        requireValue(!Object.hasOwn(state.records.requests, id), 'Original prayer requests are immutable; append an update.');
        state.records.requests[id] = {
          text: operation.text, noteIds: operation.noteIds, recordedOn: operation.recordedOn, capturedAt, updates: []
        };
      } else if (operation.type === 'update') {
        object(operation, ['type', 'id', 'requestId', 'text', 'noteIds', 'status', 'statusConfirmed']);
        requireValue(typeof operation.requestId === 'string' && Object.hasOwn(state.records.requests, operation.requestId),
          'Unknown prayer request.');
        state.records.requests[operation.requestId].updates.push({
          id: operation.id, text: operation.text, noteIds: operation.noteIds,
          status: operation.status, statusConfirmed: operation.statusConfirmed, capturedAt
        });
      } else if (operation.type === 'plan') {
        object(operation, ['type', 'id', 'label', 'requestIds']);
        state.records.plans[identifier(operation.id)] = { label: operation.label, requestIds: operation.requestIds };
      } else requireValue(false, 'Unknown prayer operation.');
      validateRecords(state.records, curated.records.notes);
    }
    requireValue(!isDeepStrictEqual(before, state.records), 'No prayer changes.');
    state.revision++;
    state.history.push({
      revision: state.revision, capturedAt, reason: request.reason, curatedDigest,
      curatedRevision: curated.revision, mappingDigest: curated.mappingDigest,
      collectionDigest: curated.collectionDigest, operations: structuredClone(request.operations)
    });
    persist(file, state);
    return result();
  } finally {
    releaseLock(lock, lockFd);
  }
}
if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && ['--inspect', '--request'].includes(args[0]),
      'Expected --inspect or --request and a synthetic request file.', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = prayer(readJSON(file), path.dirname(file), args[0] === '--inspect');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    const knownCodes = ['invalid_prayer', 'private_collection_disabled', 'store_locked',
      'unsafe_output', 'status_confirmation_required', 'revision_conflict', 'curated_conflict', 'invalid_arguments'];
    const code = knownCodes.includes(error.code) ? error.code : 'prayer_failed';
    process.stderr.write(`Prayer triage failed [${code}].\n`);
    return 1;
  });
}

export { prayer };
