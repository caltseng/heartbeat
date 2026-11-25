import type { Connection, CuratedNote, Group, Rhythm } from './types.ts';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hashJSON, readJSONValue as readJSON, createGuard, persist, openLock, releaseLock, runCLI,
  outputLocation } from './lib.ts';
import { review } from './identity-review.ts';

const requireValue = createGuard('invalid_curation');
function object(value, fields, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => fields.includes(key)), `Invalid ${label} fields.`);
}
function text(value, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text.`);
  return value;
}
function identifier(value) {
  requireValue(typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value), 'Invalid curated identifier.');
  return value;
}
function dictionary(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected a record dictionary.');
}
function references(values, records, label, minimum = 0) {
  requireValue(Array.isArray(values) && values.length >= minimum && new Set(values).size === values.length &&
    values.every(id => typeof id === 'string' && Object.hasOwn(records, id)), `Invalid ${label} references.`);
}
function date(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  'Encounter/connection dates must be real YYYY-MM-DD calendar dates.');
}
function instant(value) {
  requireValue(typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value, 'Invalid capture instant.');
}
function validateRecords(records, mapping) {
  object(records, ['groups', 'notes', 'connections', 'rhythms'], 'curated records');
  for (const field of ['groups', 'notes', 'connections', 'rhythms']) dictionary(records[field]);
  const targets = record => {
    references(record.households, mapping.households, 'household', 1);
    references(record.people, mapping.people, 'person');
  };
  for (const [id, group] of Object.entries<Group>(records.groups)) {
    identifier(id);
    object(group, ['label', 'households', 'people'], 'group');
    text(group.label, 'group label');
    targets(group);
  }
  for (const [id, note] of Object.entries<CuratedNote>(records.notes)) {
    identifier(id);
    object(note, ['originalText', 'capturedAt', 'encounteredOn', 'households', 'people'], 'note');
    text(note.originalText, 'original note');
    instant(note.capturedAt);
    if (note.encounteredOn !== null) date(note.encounteredOn);
    targets(note);
  }
  for (const [id, connection] of Object.entries<Connection>(records.connections)) {
    identifier(id);
    object(connection, ['occurredOn', 'capturedAt', 'households', 'people', 'groupId', 'noteIds', 'context'], 'connection');
    date(connection.occurredOn);
    instant(connection.capturedAt);
    targets(connection);
    requireValue(connection.groupId === null || Object.hasOwn(records.groups, connection.groupId), 'Unknown curated group.');
    references(connection.noteIds, records.notes, 'note');
    text(connection.context, 'connection context');
  }
  for (const [household, rhythm] of Object.entries<Rhythm>(records.rhythms)) {
    requireValue(Object.hasOwn(mapping.households, household), 'Unknown rhythm household.');
    object(rhythm, ['intervalDays', 'reason'], 'rhythm');
    requireValue(rhythm.intervalDays === null || (Number.isSafeInteger(rhythm.intervalDays) && rhythm.intervalDays > 0),
      'Rhythm intervalDays must be a positive safe integer or null (unset).');
    text(rhythm.reason, 'rhythm reason');
  }
}
function curate(request, requestFolder = process.cwd(), inspect = false) {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'mapping', 'output', 'expectedRevision',
    'mappingDigest', 'reason', 'operations'], 'request');
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private curated content is disabled; only schemaVersion 1 synthetic requests are supported.', 'private_collection_disabled');
  const mapping = review({
    schemaVersion: 1, dataClass: request.dataClass, collection: request.collection,
    output: text(request.mapping, 'mapping directory')
  }, requestFolder, true);
  requireValue(mapping.revision > 0, 'Register canonical people and households with identity review first.');
  const binding = { revision: mapping.revision, view: mapping.view };
  const mappingDigest = hashJSON(binding);
  const output = outputLocation(path.resolve(requestFolder, text(request.output, 'output')));
  const file = path.join(output, 'curated.json');
  const lock = path.join(output, 'curated.lock');
  let lockFd;
  if (!inspect) {
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    lockFd = openLock(lock, () => Object.assign(new Error('Curated store is locked; verify the writer stopped before removing this exact lock.'), { code: 'store_locked' }));
  }
  try {
    if (!inspect) fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    requireValue(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'Curated snapshot must not be a symbolic link.', 'unsafe_output');
    const state = fs.existsSync(file) ? readJSON(file) : {
      schemaVersion: 1, dataClass: 'synthetic', revision: 0,
      records: { groups: {}, notes: {}, connections: {}, rhythms: {} }, history: []
    };
    object(state, ['schemaVersion', 'dataClass', 'revision', 'records', 'history'], 'stored curation');
    requireValue(state.schemaVersion === 1 && state.dataClass === 'synthetic' && Number.isSafeInteger(state.revision) &&
      state.revision >= 0 && Array.isArray(state.history) && state.history.length === state.revision, 'Invalid stored curation.');
    validateRecords(state.records, mapping.view);
    const result = () => ({
      heading: 'Heartbeat curated relationships', file, revision: state.revision,
      mappingRevision: mapping.revision, mappingDigest, collectionDigest: mapping.collectionDigest,
      sources: mapping.sources, reconciliationRequired: mapping.reconciliationRequired,
      collisions: mapping.collisions, unresolvedTargets: mapping.unresolvedTargets, pendingTargets: mapping.pendingTargets,
      changedIdentityKeys: mapping.changedIdentityKeys, inactiveIdentityKeys: mapping.inactiveIdentityKeys,
      unassignedPersonIds: mapping.unassignedPersonIds, canonical: mapping.view, records: state.records,
      lastConfirmedConnections: Object.fromEntries(Object.keys(mapping.view.households).map(id => [
        id, Object.values<Connection>(state.records.connections).filter(connection => connection.households.includes(id))
          .map(connection => connection.occurredOn).sort().at(-1) || null
      ])),
      exitCode: mapping.exitCode
    });
    if (inspect) return result();
    requireValue(request.expectedRevision === state.revision, 'Curated revision changed; inspect again.', 'revision_conflict');
    requireValue(request.mappingDigest === mappingDigest, 'Canonical mapping changed; inspect again.', 'mapping_conflict');
    text(request.reason, 'curation reason');
    requireValue(Array.isArray(request.operations) && request.operations.length > 0, 'Provide explicit curated operations.');
    const before = structuredClone(state.records);
    const capturedAt = new Date().toISOString();
    for (const operation of request.operations) {
      requireValue(operation && typeof operation === 'object', 'Invalid operation.');
      if (operation.type === 'group') {
        object(operation, ['type', 'id', 'label', 'households', 'people'], 'group operation');
        state.records.groups[identifier(operation.id)] = {
          label: operation.label, households: operation.households, people: operation.people
        };
      } else if (operation.type === 'note') {
        object(operation, ['type', 'id', 'originalText', 'encounteredOn', 'households', 'people'], 'note operation');
        const id = identifier(operation.id);
        requireValue(!Object.hasOwn(state.records.notes, id), 'Original notes are immutable; capture a new note with a new identifier.');
        state.records.notes[id] = {
          originalText: operation.originalText, capturedAt, encounteredOn: operation.encounteredOn,
          households: operation.households, people: operation.people
        };
      } else if (operation.type === 'connection') {
        object(operation, ['type', 'id', 'occurredOn', 'households', 'people', 'groupId', 'noteIds', 'context'], 'connection operation');
        const id = identifier(operation.id);
        requireValue(!Object.hasOwn(state.records.connections, id), 'Confirmed connections are append-only.');
        state.records.connections[id] = {
          occurredOn: operation.occurredOn, capturedAt, households: operation.households,
          people: operation.people, groupId: operation.groupId, noteIds: operation.noteIds, context: operation.context
        };
      } else if (operation.type === 'rhythm') {
        object(operation, ['type', 'household', 'intervalDays', 'reason'], 'rhythm operation');
        identifier(operation.household);
        state.records.rhythms[operation.household] = { intervalDays: operation.intervalDays, reason: operation.reason };
      } else requireValue(false, 'Unknown curated operation; observations cannot confirm connections.');
      validateRecords(state.records, mapping.view);
    }
    requireValue(!isDeepStrictEqual(before, state.records), 'No curated changes.');
    state.revision++;
    state.history.push({
      revision: state.revision, capturedAt, reason: request.reason, mappingRevision: mapping.revision,
      mappingDigest, collectionDigest: mapping.collectionDigest, operations: structuredClone(request.operations)
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
      'Usage: node --import tsx scripts\\contacts\\curated.ts --inspect <request.json> | --request <request.json>', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = curate(readJSON(file), path.dirname(file), args[0] === '--inspect');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Curated relationships failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    return 1;
  });
}

export { curate };
