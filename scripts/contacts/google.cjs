const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { outputLocation } = require('./collect.cjs');

const CONNECTOR = 'google-people-connections-v1';
const ENDPOINT = 'https://people.googleapis.com/v1/people/me/connections';
const PARAMETERS = Object.freeze({ personFields: 'metadata,names,emailAddresses,phoneNumbers',
  sources: 'READ_SOURCE_TYPE_CONTACT', pageSize: 100, requestSyncToken: true });
const BASIS = 'Contact-only current identity snapshot; no activity/history, Other Contacts, directory or profiles. ' +
  'Optional absent fields are unknown; email/phone fields are limited to 100 each. No point-in-time consistency guarantee.';

class AdapterError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}
function check(condition, code = 'invalid_page') {
  if (!condition) throw new AdapterError(code);
}
const text = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.hasOwn(value, key);
const sorted = values => [...new Set(values)].sort();
function token(value) { check(value === undefined || text(value)); return value; }
function list(value) { check(value === undefined || Array.isArray(value)); return value || []; }
function project(person, selfIds) {
  check(record(person) && /^people\/[^/\s]+$/.test(person.resourceName));
  const id = person.resourceName;
  const metadata = person.metadata === undefined ? {} : person.metadata;
  check(record(metadata) && (metadata.deleted === undefined || typeof metadata.deleted === 'boolean'));
  const evidence = {};
  if (person.etag !== undefined) { check(text(person.etag)); evidence.etag = person.etag; }
  for (const field of ['previousResourceNames', 'linkedPeopleResourceNames']) {
    if (metadata[field] !== undefined) {
      evidence[field] = sorted(list(metadata[field]).map(value => { check(text(value)); return value; }));
    }
  }
  evidence.sources = list(metadata.sources).map(source => {
    check(record(source) && text(source.type) && text(source.id));
    const result = { type: source.type, id: source.id };
    for (const field of ['etag', 'updateTime']) {
      if (source[field] !== undefined) { check(text(source[field])); result[field] = source[field]; }
    }
    return result;
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (metadata.deleted) return { id, deleted: true, evidence };
  const identity = { id, idKind: 'provider', isSelf: selfIds.includes(id) };
  const names = list(person.names);
  names.forEach(name => check(record(name) && text(name.displayName) &&
    (name.metadata === undefined || record(name.metadata))));
  const primary = names.filter(name => name.metadata && name.metadata.primary === true);
  check(primary.length <= 1);
  if (primary.length === 1) identity.displayName = primary[0].displayName;
  else if (names.length === 1) identity.displayName = names[0].displayName;
  const addresses = [];
  let limited = false;
  for (const [field, type] of [['emailAddresses', 'email'], ['phoneNumbers', 'phone']]) {
    const entries = list(person[field]);
    limited ||= entries.length >= 100;
    for (const entry of entries) {
      check(record(entry) && text(entry.value));
      addresses.push({ type, value: entry.value });
    }
  }
  identity.addresses = sorted(addresses.map(value => JSON.stringify(value))).map(value => JSON.parse(value));
  return { id, identity, evidence, limited };
}
function validateOptions(options) {
  check(record(options) && Object.keys(options).every(key =>
    ['account', 'dataClass', 'selfIds', 'maxPages'].includes(key)), 'invalid_config');
  check(text(options.account) && ['synthetic', 'private'].includes(options.dataClass), 'invalid_config');
  check(options.selfIds === undefined || (Array.isArray(options.selfIds) &&
    options.selfIds.every(id => typeof id === 'string' && /^people\/[^/\s]+$/.test(id))), 'invalid_config');
  check(options.maxPages === undefined || (Number.isSafeInteger(options.maxPages) &&
    options.maxPages > 0 && options.maxPages <= 10000), 'invalid_config');
}

// Transport is injected for synthetic validation; no network or credential loader is shipped.
async function acquire(options, { transport, previous = null, now = new Date().toISOString(),
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  validateOptions(options);
  check(typeof now === 'string' && Number.isFinite(Date.parse(now)), 'invalid_clock');
  const selfIds = sorted(options.selfIds || []);
  const binding = { connector: CONNECTOR, account: options.account, dataClass: options.dataClass,
    parameters: PARAMETERS, selfIds };
  if (previous !== null) {
    check(record(previous) && isDeepStrictEqual(previous.binding, binding) &&
      Number.isSafeInteger(previous.generation) && previous.generation > 0 &&
      text(previous.syncToken) && text(previous.fullSyncedAt) &&
      Number.isFinite(Date.parse(previous.fullSyncedAt)) &&
      Date.parse(previous.fullSyncedAt) <= Date.parse(now) &&
      record(previous.current) && record(previous.baseline) && record(previous.pending), 'checkpoint_mismatch');
  }
  const report = { title: 'Heartbeat Google identity acquisition', source: 'google-contacts',
    connector: CONNECTOR, dataClass: options.dataClass, status: 'pending', retrievedAt: now,
    paginationComplete: false, stale: previous !== null, pages: 0, duplicates: 0,
    resynced: false, reconciliation: [], errors: [], coverage: { start: null, end: null,
      completeness: 'unknown', basis: BASIS } };
  const fail = (status, code, retryable = false) => {
    Object.assign(report, { status, errors: [{ code, retryable }] });
    return { state: previous, handoff: null, report, exitCode: 2 };
  };
  if (options.dataClass !== 'synthetic') return fail('requires_setup', 'private_run_not_authorized');
  if (typeof transport !== 'function') return fail('requires_setup', 'authorized_transport_unavailable');
  let incremental = previous !== null &&
    Date.parse(now) - Date.parse(previous.fullSyncedAt) < 7 * 86400000;
  report.resynced = previous !== null && !incremental;
  let seen = new Map(), pageToken, nextSyncToken;
  const cursors = new Set();
  try {
    while (true) {
      if (report.pages >= (options.maxPages || 100)) throw new AdapterError('page_budget_exhausted', true);
      const parameters = { ...PARAMETERS };
      if (incremental) parameters.syncToken = previous.syncToken;
      if (pageToken !== undefined) parameters.pageToken = pageToken;
      let response;
      for (let retry = 0; ; retry++) {
        try { response = await transport({ url: ENDPOINT, parameters: { ...parameters } }); }
        catch { throw new AdapterError('transport_failed', true); }
        check(record(response) && Number.isInteger(response.status));
        if (response.status !== 429 && response.status < 500) break;
        if (retry === 2) throw new AdapterError(response.status === 429 ? 'quota_exhausted' : 'upstream_unavailable', true);
        await delay(50 * (2 ** retry));
      }
      report.pages++;
      if (response.status === 401 || response.status === 403) {
        return fail('requires_setup', 'auth_unavailable');
      }
      if (response.status === 410 && incremental) {
        incremental = false;
        report.resynced = true;
        seen = new Map();
        pageToken = undefined;
        cursors.clear();
        continue;
      }
      if (response.status !== 200) throw new AdapterError(response.status === 410 ? 'full_sync_expired' : 'http_failure');
      const body = response.body;
      check(record(body));
      const next = token(body.nextPageToken);
      nextSyncToken = token(body.nextSyncToken);
      check(next === undefined ? nextSyncToken !== undefined : nextSyncToken === undefined);
      for (const person of list(body.connections)) {
        const observation = project(person, selfIds);
        if (seen.has(observation.id)) {
          check(isDeepStrictEqual(seen.get(observation.id), observation), 'conflicting_duplicate');
          report.duplicates++;
        } else seen.set(observation.id, observation);
      }
      if (next === undefined) break;
      check(!cursors.has(next), 'pagination_cycle');
      cursors.add(next);
      pageToken = next;
    }
  } catch (error) {
    if (!(error instanceof AdapterError)) throw error;
    return fail('failed', error.code, error.retryable);
  }
  const current = incremental ? structuredClone(previous.current) : Object.create(null);
  for (const [id, observation] of seen) current[id] = observation;
  const baseline = previous ? structuredClone(previous.baseline) : Object.create(null);
  const pending = previous ? structuredClone(previous.pending) : Object.create(null);
  const stage = (id, reason, observation) => {
    pending[id] ||= { reasons: [], observations: [] };
    if (!pending[id].reasons.includes(reason)) pending[id].reasons.push(reason);
    if (observation && !pending[id].observations.some(value => isDeepStrictEqual(value, observation))) {
      pending[id].observations.push(observation);
    }
  };
  for (const [id, observation] of Object.entries(current)) {
    if (observation.deleted) stage(id, 'source_tombstone', observation);
    else if (['previousResourceNames', 'linkedPeopleResourceNames'].some(field => observation.evidence[field]?.length)) {
      stage(id, 'resource_alias_review', observation);
    } else if (has(baseline, id) && !isDeepStrictEqual(baseline[id], observation.identity)) {
      stage(id, 'identity_revision_unsupported', observation);
    }
  }
  for (const id of Object.keys(baseline)) {
    if (!has(current, id)) stage(id, 'full_snapshot_absence');
  }
  const identities = [];
  for (const [id, observation] of Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) {
    if (!has(pending, id)) {
      baseline[id] = observation.identity;
      identities.push(observation.identity);
    }
  }
  for (const [id, value] of Object.entries(pending).sort(([a], [b]) => a.localeCompare(b))) {
    for (const reason of value.reasons) report.reconciliation.push({ id, reason });
  }
  const limited = Object.values(current).some(value => value.limited);
  const partial = limited || report.reconciliation.length > 0;
  Object.assign(report, { status: partial ? 'partial' : 'collected', stale: false,
    paginationComplete: true, identities: identities.length,
    coverage: { ...report.coverage, completeness: partial ? 'partial' : 'complete' } });
  if (limited) report.errors.push({ code: 'address_field_limit', retryable: false });
  if (report.reconciliation.length) report.errors.push({ code: 'reconciliation_unsupported', retryable: false });
  const handoff = { schemaVersion: 1, dataClass: options.dataClass, source: 'google-contacts',
    account: options.account, connector: CONNECTOR, coverage: report.coverage, errors: report.errors,
    pages: [{ cursor: null, nextCursor: null, retrievedAt: now, identities, threads: [], memberships: [], events: [] }] };
  return { state: { binding, generation: (previous?.generation || 0) + 1,
    syncToken: nextSyncToken, fullSyncedAt: incremental ? previous.fullSyncedAt : now, current, baseline, pending },
  report, handoff, exitCode: partial ? 2 : 0 };
}

function readPrivate(file) {
  return JSON.parse(fs.readFileSync(outputLocation(file), 'utf8').replace(/^\uFEFF/, ''));
}
function writeAtomic(file, value) {
  check(!fs.existsSync(file) || !fs.lstatSync(file).isSymbolicLink(), 'unsafe_output');
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
async function run(configFile) {
  const config = readPrivate(configFile);
  check(record(config) && config.schemaVersion === 1 && Object.keys(config).every(key =>
    ['schemaVersion', 'dataClass', 'account', 'output', 'fixture', 'selfIds', 'maxPages'].includes(key)), 'invalid_config');
  const options = Object.fromEntries(['dataClass', 'account', 'selfIds', 'maxPages']
    .filter(field => config[field] !== undefined).map(field => [field, config[field]]));
  validateOptions(options);
  check(text(config.output) && (config.fixture === undefined || text(config.fixture)), 'invalid_config');
  const folder = path.dirname(path.resolve(configFile));
  const output = outputLocation(path.resolve(folder, config.output));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const lock = path.join(output, 'google-acquisition.lock');
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new AdapterError('store_locked');
    throw error;
  }
  try {
    const file = path.join(output, 'google-acquisition.json');
    const saved = fs.existsSync(file) ? readPrivate(file) : null;
    check(saved === null || (saved.schemaVersion === 1 && has(saved, 'state')), 'invalid_checkpoint');
    let transport;
    if (config.dataClass === 'synthetic' && config.fixture !== undefined) {
      const fixture = readPrivate(path.resolve(folder, config.fixture));
      check(record(fixture) && fixture.dataClass === 'synthetic' && Array.isArray(fixture.responses), 'invalid_fixture');
      let index = 0;
      transport = async () => {
        if (index >= fixture.responses.length) throw new AdapterError('fixture_exhausted');
        return fixture.responses[index++];
      };
    }
    const result = await acquire(options, { transport, previous: saved?.state || null });
    let handoffFile = null;
    if (result.handoff) {
      handoffFile = `google-handoff-${crypto.randomUUID()}.json`;
      writeAtomic(path.join(output, handoffFile), result.handoff);
    }
    writeAtomic(file, { schemaVersion: 1, state: result.state, report: result.report, handoffFile });
    return result;
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}
if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      check(args.length === 2 && args[0] === '--config', 'invalid_arguments');
      const result = await run(path.resolve(args[1]));
      process.stdout.write(JSON.stringify({ title: result.report.title, status: result.report.status,
        errors: result.report.errors }) + '\n');
      process.exitCode = result.exitCode;
    } catch (error) {
      process.stderr.write(`Google acquisition failed [${error instanceof AdapterError ? error.code : 'local_io_or_config_failure'}].\n`);
      process.exitCode = 1;
    }
  })();
}
module.exports = { acquire, run, CONNECTOR, ENDPOINT, PARAMETERS };
