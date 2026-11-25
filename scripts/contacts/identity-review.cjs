const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { hash: digest, readJSONWithDigest: readJSON, createGuard, persist, openLock, releaseLock, runCLI,
  outputLocation } = require('./lib.cjs');
const { expandCollection } = require('./collection-store.cjs');

const SOURCES = ['google-contacts', 'email', 'text-messages', 'messenger', 'whatsapp'];
const own = (value, key) => Object.hasOwn(value, key);
const requireValue = createGuard('invalid_review');
function object(value, fields, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  requireValue(Object.keys(value).every(key => fields.includes(key)), `${label} contains unsupported fields.`);
}
function text(value, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text.`);
  return value;
}
function list(value, label, minimum = 0) {
  requireValue(Array.isArray(value) && value.length >= minimum && new Set(value).size === value.length,
    `${label} must be an array of distinct values.`);
  return value;
}
const personId = key => `person-${digest(key)}`;
function identifier(value) {
  requireValue(typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value), 'Invalid canonical identifier.');
  return value;
}
function normalized(type, value) {
  if (type === 'email') {
    const email = value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
    const [local, domain] = email.split('@');
    return `${local}@${domain.toLowerCase()}`;
  }
  const phone = value.replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}
function identitiesFrom(collection) {
  requireValue(collection.schemaVersion === 1 && collection.dataClass === 'synthetic',
    'Private identity review is disabled: source/run authorization and verified local controls remain required under CONTACTS-010.', 'private_collection_disabled');
  collection = expandCollection(collection);
  requireValue(collection.records && typeof collection.records === 'object' && !Array.isArray(collection.records) &&
    collection.manifest && ['collected', 'partial'].includes(collection.manifest.status) &&
    Array.isArray(collection.manifest.sources) && collection.manifest.sources.length > 0,
  'Expected a completed collector snapshot, including explicit source status.');
  const projection = collection.reconciliation;
  requireValue(projection && projection.schemaVersion === 1 && projection.records &&
    typeof projection.records === 'object' && !Array.isArray(projection.records) &&
    Array.isArray(projection.collisions) && Array.isArray(projection.unresolvedTargets) &&
    Array.isArray(projection.pendingTargets),
  'Expected CONTACTS-021 reconciliation; replay synthetic handoffs with the current collector before identity review.');
  const identities = {};
  const excludedIdentityKeys = new Set(projection.collisions.map(collision => collision.key)
    .filter(key => JSON.parse(key)[2] === 'identity'));
  for (const [key, entry] of Object.entries(projection.records)) {
    if (entry.record?.type !== 'identity') continue;
    const tuple = JSON.parse(key);
    requireValue(Array.isArray(tuple) && tuple.length === 4 && SOURCES.includes(tuple[0]) &&
      typeof tuple[1] === 'string' && tuple[1].length > 0 && tuple[2] === 'identity' &&
      typeof tuple[3] === 'string' && tuple[3].length > 0 && JSON.stringify(tuple) === key,
    'Invalid namespaced identity key.');
    const record = entry.record;
    object(record, ['type', 'idKind', 'isSelf', 'displayName', 'addresses', 'deleted'], 'identity');
    requireValue(['provider', 'local'].includes(record.idKind) && typeof record.isSelf === 'boolean',
      'Identity must retain ID kind and explicit self status.');
    requireValue(record.deleted === undefined || typeof record.deleted === 'boolean', 'Identity deleted status must be boolean.');
    if (record.deleted === true || excludedIdentityKeys.has(key)) {
      excludedIdentityKeys.add(key);
      continue;
    }
    if (record.displayName !== undefined) text(record.displayName, 'displayName');
    if (record.addresses !== undefined) {
      requireValue(Array.isArray(record.addresses), 'Identity addresses must be an array.');
      for (const address of record.addresses) {
        object(address, ['type', 'value'], 'address');
        requireValue(['email', 'phone'].includes(address.type), 'Unknown address kind.');
        text(address.value, 'address');
      }
    }
    identities[key] = record;
  }
  return { identities, excludedIdentityKeys: [...excludedIdentityKeys].sort() };
}
function validateView(view, identities, retainedKeys) {
  object(view, ['people', 'assignments', 'households'], 'mapping view');
  for (const field of ['people', 'assignments', 'households']) {
    requireValue(view[field] && typeof view[field] === 'object' && !Array.isArray(view[field]), 'Invalid mapping dictionaries.');
  }
  for (const [id, person] of Object.entries(view.people)) {
    identifier(id);
    object(person, ['mergedInto'], 'person');
    requireValue(person.mergedInto === null || (person.mergedInto !== id && own(view.people, person.mergedInto) &&
      view.people[person.mergedInto].mergedInto === null), 'Person aliases must resolve directly to an active person.');
  }
  for (const [key, id] of Object.entries(view.assignments)) {
    requireValue((own(identities, key) || retainedKeys.has(key)) && own(view.people, id) && view.people[id].mergedInto === null,
      'Mapping references a missing identity or inactive person.');
  }
  for (const [id, household] of Object.entries(view.households)) {
    identifier(id);
    object(household, ['label', 'people'], 'household');
    text(household.label, 'household label');
    list(household.people, 'household people');
    requireValue(household.people.every(person => own(view.people, person) && view.people[person].mergedInto === null),
      'Households may reference active canonical people only.');
  }
  const memberships = Object.values(view.households).flatMap(household => household.people);
  requireValue(new Set(memberships).size === memberships.length, 'A person can belong to at most one curated household.');
  for (const id of Object.keys(view.people)) {
    const assigned = Object.entries(view.assignments).filter(([key, person]) => person === id && own(identities, key))
      .map(([key]) => identities[key].isSelf);
    requireValue(assigned.every(value => value === assigned[0]), 'Self identities cannot be combined with other people.');
  }
}
function merge(view, operation, identities) {
  object(operation, ['type', 'people', 'into', 'evidence'], 'merge');
  const people = list(operation.people, 'merge people', 2);
  requireValue(people.includes(operation.into) && people.every(id => own(view.people, id) && view.people[id].mergedInto === null),
    'Merge needs active people and an explicit surviving person.');
  requireValue(Array.isArray(operation.evidence) && operation.evidence.length > 0, 'A merge requires reviewed evidence.');
  const links = new Map(people.map(id => [id, new Set()]));
  for (const evidence of operation.evidence) {
    object(evidence, ['kind', 'identityKeys', 'reference'], 'evidence');
    requireValue(['email', 'phone', 'provider'].includes(evidence.kind), 'Name-only and group-membership matches are not evidence.');
    const keys = list(evidence.identityKeys, 'evidence identities', 2);
    requireValue(keys.every(key => own(identities, key) && people.includes(view.assignments[key])), 'Evidence must reference the selected people.');
    if (evidence.kind === 'provider') {
      text(evidence.reference, 'reviewed provider reference');
      requireValue(keys.every(key => identities[key].idKind === 'provider'), 'Provider evidence needs provider identities.');
    } else {
      requireValue(evidence.reference === undefined, 'Address evidence is checked from source addresses, not a supplied reference.');
      const addresses = keys.map(key => (identities[key].addresses || [])
        .filter(address => address.type === evidence.kind).map(address => normalized(address.type, address.value)).filter(Boolean));
      requireValue(addresses[0].some(value => addresses.every(values => values.includes(value))),
        'Reviewed address evidence must share an exact conservative normalized value.');
    }
    const members = keys.map(key => view.assignments[key]);
    for (const a of members) for (const b of members) links.get(a).add(b);
  }
  const reached = new Set([operation.into]);
  for (const id of reached) for (const neighbor of links.get(id)) reached.add(neighbor);
  requireValue(reached.size === people.length, 'Reviewed evidence must connect every selected person.');
  const householdIds = Object.entries(view.households).filter(([, household]) => household.people.some(id => people.includes(id))).map(([id]) => id);
  requireValue(householdIds.length <= 1, 'Resolve conflicting curated households explicitly before merging.');
  for (const [key, id] of Object.entries(view.assignments)) if (people.includes(id)) view.assignments[key] = operation.into;
  for (const [id, person] of Object.entries(view.people)) {
    if (people.includes(id) || people.includes(person.mergedInto)) person.mergedInto = id === operation.into ? null : operation.into;
  }
  for (const household of Object.values(view.households)) {
    household.people = [...new Set(household.people.map(id => people.includes(id) ? operation.into : id))].sort();
  }
}
function split(view, operation) {
  object(operation, ['type', 'from', 'into', 'identityKeys'], 'split');
  requireValue(own(view.people, operation.from) && view.people[operation.from].mergedInto === null, 'Split needs an active source person.');
  const target = identifier(operation.into);
  requireValue(target !== operation.from && (!own(view.people, target) || view.people[target].mergedInto === operation.from),
    'Split destination must be new or an alias of the source person.');
  const keys = list(operation.identityKeys, 'split identities', 1);
  requireValue(keys.every(key => own(view.assignments, key) && view.assignments[key] === operation.from), 'Split identities must belong to the source person.');
  requireValue(Object.values(view.assignments).filter(id => id === operation.from).length > keys.length,
    'A split must leave at least one identity with the original person.');
  view.people[target] = { mergedInto: null };
  for (const key of keys) view.assignments[key] = target;
  // Notes keep their original person references. A partial split cannot guess their owner.
  // Household membership is deliberately not copied to the split destination.
}
function applyOperations(view, operations, identities, retainedKeys) {
  for (const operation of operations) {
    requireValue(operation && typeof operation === 'object', 'Invalid operation.');
    if (operation.type === 'refresh') {
      object(operation, ['type', 'identityKeys'], 'refresh');
      requireValue(list(operation.identityKeys, 'refresh identities', 1).every(key => own(identities, key)),
        'Only current, nondeleted, unambiguous identities can be refreshed.');
    } else if (operation.type === 'merge') merge(view, operation, identities);
    else if (operation.type === 'split') split(view, operation);
    else if (operation.type === 'household') {
      object(operation, ['type', 'id', 'label', 'people'], 'household operation');
      const id = identifier(operation.id);
      text(operation.label, 'household label');
      list(operation.people, 'household people');
      view.households[id] = { label: operation.label, people: [...operation.people].sort() };
    } else requireValue(false, 'Unknown operation; undo must be the sole operation.');
    validateView(view, identities, retainedKeys);
  }
}
function review(request, requestFolder = process.cwd(), inspect = false) {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'output', 'expectedRevision', 'collectionDigest', 'reason', 'operations'], 'request');
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private identity review is disabled; only schemaVersion 1 synthetic requests are supported.', 'private_collection_disabled');
  const input = readJSON(path.resolve(requestFolder, text(request.collection, 'collection')));
  const { identities, excludedIdentityKeys } = identitiesFrom(input.value);
  const projection = input.value.reconciliation;
  const reconciliationRequired = input.value.manifest.reconciliationRequired === true ||
    projection.collisions.length > 0 || projection.unresolvedTargets.length > 0;
  const sourceState = {
    sources: input.value.manifest.sources, reconciliationRequired, excludedIdentityKeys,
    collisions: projection.collisions, unresolvedTargets: projection.unresolvedTargets, pendingTargets: projection.pendingTargets,
    exitCode: input.value.manifest.status === 'collected' && !reconciliationRequired ? 0 : 2
  };
  const output = outputLocation(path.resolve(requestFolder, text(request.output, 'output')));
  const file = path.join(output, 'identity-review.json');
  if (!inspect) fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  let lockFd;
  const lock = path.join(output, 'identity-review.lock');
  if (!inspect) {
    lockFd = openLock(lock, () => Object.assign(new Error('Identity review is locked; verify the writer stopped before removing this exact lock.'), { code: 'store_locked' }));
  }
  try {
    if (!inspect) fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    requireValue(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'Review snapshot must not be a symbolic link.', 'unsafe_output');
    const state = fs.existsSync(file) ? readJSON(file).value : {
      schemaVersion: 1, dataClass: request.dataClass, revision: 0, collectionDigest: null,
      identityDigests: {}, inactiveIdentityKeys: [], view: { people: {}, assignments: {}, households: {} }, history: []
    };
    object(state, ['schemaVersion', 'dataClass', 'revision', 'collectionDigest', 'identityDigests', 'inactiveIdentityKeys', 'view', 'history'], 'stored review');
    requireValue(state.schemaVersion === 1 && state.dataClass === request.dataClass &&
      Number.isSafeInteger(state.revision) && state.revision >= 0 && Array.isArray(state.history) &&
      state.history.length === state.revision && state.identityDigests && typeof state.identityDigests === 'object',
    'Stored review schema, data class or revision is invalid.');
    const retainedKeys = new Set(Object.keys(state.identityDigests));
    validateView(state.view, identities, retainedKeys);
    requireValue(Object.keys(state.view.assignments).every(key => retainedKeys.has(key)), 'Stored identity fingerprints are missing.', 'identity_conflict');
    const changedIdentityKeys = Object.entries(state.identityDigests)
      .filter(([key, hash]) => own(identities, key) && digest(JSON.stringify(identities[key])) !== hash).map(([key]) => key).sort();
    const inactiveIdentityKeys = Object.keys(state.view.assignments).filter(key => !own(identities, key)).sort();
    if (inspect) return {
      heading: 'Heartbeat identity review', revision: state.revision, collectionDigest: input.digest, view: state.view,
      ...sourceState, changedIdentityKeys, inactiveIdentityKeys,
      unassignedPersonIds: Object.keys(state.view.people).filter(id => state.view.people[id].mergedInto === null &&
        !Object.values(state.view.assignments).includes(id)),
      identities: Object.entries(identities).map(([key, record]) => ({
        key, ...record, personId: state.view.assignments[key] || null, suggestedPersonId: personId(key)
      }))
    };
    requireValue(request.expectedRevision === state.revision, 'Mapping revision changed; inspect and review again.', 'revision_conflict');
    requireValue(request.collectionDigest === input.digest, 'Collection changed; inspect and review the exact snapshot again.', 'collection_conflict');
    text(request.reason, 'review reason');
    requireValue(Array.isArray(request.operations), 'Review operations must be an array.');
    const refreshedKeys = new Set(request.operations.filter(operation => operation?.type === 'refresh')
      .flatMap(operation => list(operation.identityKeys, 'refresh identities', 1)));
    requireValue(changedIdentityKeys.every(key => refreshedKeys.has(key)),
      'Current identity metadata changed; inspect it and explicitly refresh those keys before accepting this review.', 'identity_conflict');
    const before = structuredClone(state.view);
    const undo = request.operations.length === 1 && request.operations[0]?.type === 'undo';
    if (undo) {
      const operation = request.operations[0];
      object(operation, ['type', 'revision'], 'undo');
      requireValue(operation.revision === state.revision && state.revision > 0, 'Only the current revision can be undone.');
      state.view = structuredClone(state.history.at(-1).before);
      for (const id of Object.keys(before.people)) {
        if (own(state.view.people, id)) continue;
        const destinations = new Set(Object.entries(before.assignments).filter(([, person]) => person === id)
          .map(([key]) => state.view.assignments[key]).filter(Boolean));
        state.view.people[id] = { mergedInto: destinations.size === 1 ? [...destinations][0] : null };
      }
      for (const [id, household] of Object.entries(before.households)) {
        if (!own(state.view.households, id)) state.view.households[id] = { label: household.label, people: [] };
      }
    } else {
      for (const key of Object.keys(identities).sort()) {
        if (own(state.view.assignments, key)) continue;
        const id = personId(key);
        requireValue(!own(state.view.people, id) || (state.view.people[id].mergedInto === null &&
          !Object.values(state.view.assignments).includes(id)), 'Canonical ID collision; preserve the existing review.', 'identity_conflict');
        state.view.people[id] = { mergedInto: null };
        state.view.assignments[key] = id;
      }
      applyOperations(state.view, request.operations, identities, retainedKeys);
    }
    validateView(state.view, identities, retainedKeys);
    requireValue(undo || !isDeepStrictEqual(before, state.view) || state.collectionDigest !== input.digest,
      'Review contains no mapping changes or new collection snapshot.');
    state.revision++;
    state.collectionDigest = input.digest;
    state.identityDigests = { ...state.identityDigests, ...Object.fromEntries(Object.keys(state.view.assignments)
      .map(key => [key, own(identities, key) ? digest(JSON.stringify(identities[key])) : state.identityDigests[key]])) };
    state.inactiveIdentityKeys = Object.keys(state.view.assignments).filter(key => !own(identities, key)).sort();
    state.history.push({
      revision: state.revision, reviewedAt: new Date().toISOString(), reason: request.reason,
      collectionDigest: input.digest, inactiveIdentityKeys: [...state.inactiveIdentityKeys],
      operations: structuredClone(request.operations), before, after: structuredClone(state.view)
    });
    persist(file, state);
    return {
      heading: 'Heartbeat identity review', file, revision: state.revision, collectionDigest: input.digest,
      ...sourceState, inactiveIdentityKeys: state.inactiveIdentityKeys
    };
  } finally {
    releaseLock(lock, lockFd);
  }
}
if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && ['--request', '--inspect'].includes(args[0]),
      'Usage: node scripts\\contacts\\identity-review.cjs --inspect <request.json> | --request <request.json>', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = review(readJSON(file).value, path.dirname(file), args[0] === '--inspect');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Identity review failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    return 1;
  });
}

module.exports = { review };
