const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { outputLocation } = require('./collect.cjs');
const { curate } = require('./curated.cjs');
const { review } = require('./identity-review.cjs');
const { persist } = require('./local-json.cjs');

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function requireValue(condition, message, code = 'invalid_audience') {
  if (!condition) throw Object.assign(new Error(message), { code });
}
function object(value, fields) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => fields.includes(key)), 'Unsupported audience fields.');
}
function text(value) {
  requireValue(typeof value === 'string' && value.trim().length > 0, 'Expected nonempty audience text.');
  return value;
}
function identifier(value) {
  requireValue(typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value), 'Invalid audience reference.');
}
function email(value) {
  if (typeof value !== 'string' || !/^[^@\s<>;,]+@[^@\s<>;,]+\.[^@\s<>;,]+$/.test(value)) return null;
  return value.toLowerCase();
}
function wording(value) {
  if (value === null) return;
  object(value, ['text', 'reason']);
  text(value.text);
  text(value.reason);
}
function validateAudience(value) {
  object(value, ['purpose', 'households', 'recipients']);
  text(value.purpose);
  requireValue(Array.isArray(value.households) && value.households.length > 0 &&
    Array.isArray(value.recipients), 'Select at least one explicit household.');
  for (const [entries, key] of [[value.households, 'householdId'], [value.recipients, 'personId']]) {
    requireValue(new Set(entries.map(entry => entry?.[key])).size === entries.length, 'Duplicate audience reference.');
    for (const entry of entries) {
      object(entry, key === 'householdId' ? ['householdId', 'included', 'reason', 'wording'] :
        ['personId', 'householdId', 'included', 'reason', 'address', 'wording']);
      identifier(entry[key]);
      identifier(entry.householdId);
      requireValue(typeof entry.included === 'boolean', 'Selection must explicitly include or exclude.');
      text(entry.reason);
      wording(entry.wording);
      if (key === 'personId') {
        requireValue(entry.address === null || email(entry.address) !== null, 'Select one plain email address or null.');
        requireValue(value.households.some(household => household.householdId === entry.householdId),
          'Recipient must reference a selected household.');
      }
    }
  }
}
function project(audience, context, identities) {
  const issues = [];
  const candidates = [];
  const addIssue = (code, personId, blocking, details = {}) => issues.push({ code, personId, blocking, ...details });
  if (context.reconciliationRequired) addIssue('reconciliation_required', null, true);
  for (const selection of audience.households) {
    const household = context.canonical.households[selection.householdId];
    if (!Object.hasOwn(context.canonical.households, selection.householdId)) {
      addIssue('missing_household', null, true, { householdId: selection.householdId });
      continue;
    }
    const overrides = audience.recipients.filter(entry => entry.householdId === selection.householdId);
    const people = [...new Set([...household.people, ...overrides.map(entry => entry.personId)])].sort();
    if (people.length === 0) addIssue('empty_household', null, selection.included, { householdId: selection.householdId });
    for (const personId of people) {
      const override = overrides.find(entry => entry.personId === personId);
      const included = override ? override.included : selection.included;
      const member = household.people.includes(personId);
      const person = context.canonical.people[personId];
      const identityRows = identities.filter(identity => identity.personId === personId);
      const addresses = [];
      for (const identity of identityRows) {
        for (const address of identity.addresses || []) {
          if (address.type !== 'email') continue;
          const normalized = email(address.value.trim());
          if (!normalized) {
            addIssue('invalid_address', personId, false, { identityKey: identity.key, value: address.value });
            continue;
          }
          let entry = addresses.find(item => item.address === normalized);
          if (!entry) { entry = { address: normalized, identityKeys: [] }; addresses.push(entry); }
          if (!entry.identityKeys.includes(identity.key)) entry.identityKeys.push(identity.key);
        }
      }
      addresses.sort((a, b) => a.address.localeCompare(b.address));
      const selectedAddress = override?.address === null || override?.address === undefined ? null : email(override.address);
      const preference = override?.wording ?? selection.wording;
      if (!member || !person || person.mergedInto !== null) addIssue('household_membership_changed', personId, true);
      if (addresses.length === 0) addIssue('missing_address', personId, included);
      if (addresses.length > 1) addIssue('ambiguous_address', personId, included && selectedAddress === null);
      if (selectedAddress === null && addresses.length > 0) addIssue('address_selection_required', personId, included);
      if (selectedAddress !== null && !addresses.some(item => item.address === selectedAddress)) {
        addIssue('address_not_current', personId, included);
      }
      if (preference === null) addIssue('wording_required', personId, included);
      if (identityRows.some(identity => identity.isSelf)) addIssue('self_identity', personId, included);
      const keys = Object.entries(context.canonical.assignments).filter(([, id]) => id === personId).map(([key]) => key);
      if (keys.some(key => context.changedIdentityKeys.includes(key))) addIssue('identity_changed', personId, included);
      if (keys.some(key => context.inactiveIdentityKeys.includes(key))) addIssue('identity_inactive', personId, included);
      candidates.push({
        householdId: selection.householdId, householdLabel: household.label, personId, included,
        reason: override ? override.reason : selection.reason,
        selectionOrigin: override ? 'individual' : 'household',
        wording: preference, wordingOrigin: override?.wording ? 'individual' : preference ? 'household' : null,
        addresses, selectedAddress
      });
    }
  }
  for (const candidate of candidates) {
    for (const option of candidate.addresses) {
      const others = candidates.filter(other => other.personId !== candidate.personId &&
        other.addresses.some(entry => entry.address === option.address)).map(other => other.personId);
      if (others.length) addIssue('duplicate_address_option', candidate.personId, false, { address: option.address, otherPersonIds: others });
    }
  }
  const included = candidates.filter(candidate => candidate.included);
  for (const candidate of included) {
    if (candidate.selectedAddress && included.some(other => other.personId !== candidate.personId &&
        other.selectedAddress === candidate.selectedAddress)) addIssue('duplicate_recipient', candidate.personId, true);
  }
  if (included.length === 0) addIssue('no_recipients', null, true);
  return { candidates, issues };
}
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function audienceReview(request, requestFolder = process.cwd(), action = 'inspect') {
  object(request, ['schemaVersion', 'dataClass', 'collection', 'mapping', 'curated', 'output',
    'expectedRevision', 'inputsDigest', 'reason', 'audience']);
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private audience review is disabled; only schemaVersion 1 synthetic requests are supported.', 'private_collection_disabled');
  requireValue(['inspect', 'request', 'finalize'].includes(action), 'Unsupported audience action.');
  const context = curate({
    schemaVersion: 1, dataClass: 'synthetic', collection: request.collection,
    mapping: request.mapping, output: text(request.curated)
  }, requestFolder, true);
  const mapping = review({
    schemaVersion: 1, dataClass: 'synthetic', collection: request.collection, output: request.mapping
  }, requestFolder, true);
  requireValue(context.mappingRevision === mapping.revision && context.collectionDigest === mapping.collectionDigest &&
    context.mappingDigest === digest({ revision: mapping.revision, view: mapping.view }),
  'Inputs changed while reading; inspect again.', 'input_conflict');
  const binding = {
    collectionDigest: context.collectionDigest, mappingDigest: context.mappingDigest,
    mappingRevision: context.mappingRevision, curatedRevision: context.revision
  };
  const inputsDigest = digest(binding);
  const output = outputLocation(path.resolve(requestFolder, text(request.output)));
  const file = path.join(output, 'audience.json');
  const lock = path.join(output, 'audience.lock');
  let lockFd;
  if (action !== 'inspect') {
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    try { lockFd = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw Object.assign(new Error('Audience store is locked; verify the writer stopped before removing this exact lock.'), { code: 'store_locked' });
      throw error;
    }
  }
  try {
    if (lockFd !== undefined) fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    requireValue(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'Audience snapshot must not be a symbolic link.', 'unsafe_output');
    const state = fs.existsSync(file) ? readJSON(file) : {
      schemaVersion: 1, dataClass: 'synthetic', revision: 0, audience: null, reviewed: null, history: []
    };
    object(state, ['schemaVersion', 'dataClass', 'revision', 'audience', 'reviewed', 'history']);
    requireValue(state.schemaVersion === 1 && state.dataClass === 'synthetic' && Number.isSafeInteger(state.revision) &&
      state.revision >= 0 && Array.isArray(state.history) && state.history.length === state.revision, 'Invalid audience snapshot.');
    if (state.audience !== null) validateAudience(state.audience);
    if (state.reviewed !== null) {
      object(state.reviewed, ['inputsDigest', 'reviewedAt', 'reason']);
      requireValue(typeof state.reviewed.inputsDigest === 'string' && /^[a-f0-9]{64}$/.test(state.reviewed.inputsDigest) &&
        typeof state.reviewed.reviewedAt === 'string' && Number.isFinite(Date.parse(state.reviewed.reviewedAt)),
      'Invalid stored audience review.');
      text(state.reviewed.reason);
    }
    if (action !== 'inspect') {
      requireValue(request.expectedRevision === state.revision, 'Audience revision changed; inspect again.', 'revision_conflict');
      requireValue(request.inputsDigest === inputsDigest, 'Audience inputs changed; inspect again.', 'input_conflict');
      text(request.reason);
      if (action === 'request') {
        validateAudience(request.audience);
        for (const household of request.audience.households) {
          requireValue(Object.hasOwn(context.canonical.households, household.householdId), 'Unknown selected household.');
        }
        for (const recipient of request.audience.recipients) {
          requireValue(context.canonical.households[recipient.householdId].people.includes(recipient.personId),
            'Recipient must be a current member of its selected household.');
        }
        state.audience = structuredClone(request.audience);
        state.reviewed = null;
      } else {
        requireValue(request.audience === undefined, 'Save edits before final review.');
        requireValue(state.audience !== null, 'Save a candidate audience before final review.');
        const projected = project(state.audience, context, mapping.identities);
        requireValue(!projected.issues.some(issue => issue.blocking),
          'Audience has unresolved issues; inspect and edit before final review.', 'audience_unresolved');
        state.reviewed = { inputsDigest, reviewedAt: new Date().toISOString(), reason: request.reason };
      }
      state.revision++;
      state.history.push({
        revision: state.revision, action, reason: request.reason, inputsDigest,
        capturedAt: new Date().toISOString(), audience: structuredClone(state.audience)
      });
    }
    const projected = state.audience === null ? { candidates: [], issues: [{ code: 'audience_not_started', personId: null, blocking: true }] } :
      project(state.audience, context, mapping.identities);
    const reviewed = state.reviewed !== null && state.reviewed.inputsDigest === inputsDigest &&
      !projected.issues.some(issue => issue.blocking);
    const result = {
      heading: 'Heartbeat life-update audience review', schemaVersion: 1, dataClass: 'synthetic',
      file, revision: state.revision, inputsDigest, binding, audience: state.audience, ...projected,
      sources: context.sources, reconciliationRequired: context.reconciliationRequired,
      collisions: context.collisions, unresolvedTargets: context.unresolvedTargets, pendingTargets: context.pendingTargets,
      reviewed, reviewStale: state.reviewed !== null && !reviewed,
      reviewedAt: reviewed ? state.reviewed.reviewedAt : null,
      finalRecipients: reviewed ? projected.candidates.filter(candidate => candidate.included).map(candidate => ({
        householdId: candidate.householdId, personId: candidate.personId,
        address: candidate.selectedAddress, reason: candidate.reason, wording: candidate.wording
      })) : null,
      sending: 'not_supported',
      exitCode: context.exitCode === 2 || !reviewed ? 2 : 0
    };
    if (action !== 'inspect') persist(file, state);
    return result;
  } finally {
    if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); }
  }
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && ['--inspect', '--request', '--finalize'].includes(args[0]),
      'Usage: node scripts\\contacts\\audience.cjs --inspect <request.json> | --request <request.json> | --finalize <request.json>', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = audienceReview(readJSON(file), path.dirname(file), args[0].slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`Audience review failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
module.exports = { audienceReview };
