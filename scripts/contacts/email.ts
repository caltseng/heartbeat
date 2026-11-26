import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hashJSON, readJSONValue, outputLocation,
  createError, isError, createCodeGuard, createCodeValidators, isText as text } from './lib.ts';
import { resolvePeriod } from './period.ts';
import { writeHandoffBundle, runConverter } from './converter.ts';

const CONNECTOR = 'gmail-metadata-v1';
const HEADERS = ['From', 'To', 'Cc', 'Bcc', 'Date', 'List-Id', 'Precedence', 'Auto-Submitted'];
const FIELDS = 'id,threadId,labelIds,historyId,internalDate,payload(headers)';
const emailError = createError('email', code => `Email acquisition failed [${code}].`);
const requireValue = createCodeGuard('metadata_incomplete', emailError);
const { object } = createCodeValidators(requireValue, 'metadata_incomplete');
function requireSynthetic(dataClass) {
  requireValue(dataClass === 'synthetic', dataClass === 'private' ? 'private_collection_disabled' : 'synthetic_only');
}
const token = value => value === null || text(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const digest = value => hashJSON(canonical(value));
function address(value) {
  requireValue(typeof value === 'string' &&
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value));
  const [local, domain] = value.split('@');
  requireValue(domain.split('.').every(part => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(part)));
  return `${local}@${domain.toLowerCase()}`;
}
function mailboxes(value) {
  requireValue(typeof value === 'string' && !/[\r\n\x00]/.test(value));
  const result = [];
  let part = '', quoted = false, escaped = false, angle = false, group = false;
  const emit = () => {
    const item = part.trim();
    part = '';
    if (!item) return;
    const match = /^(?:(?:"(?:[^"\\]|\\.)*"|[^"<>:;]+)\s*)?<([^<>]+)>$/.exec(item);
    result.push(address(match ? match[1].trim() : item));
  };
  for (const char of value) {
    if (escaped) { part += char; escaped = false; continue; }
    if (quoted && char === '\\') { part += char; escaped = true; continue; }
    if (char === '"') quoted = !quoted;
    if (!quoted) {
      if (char === '<') { requireValue(!angle); angle = true; }
      if (char === '>') { requireValue(angle); angle = false; }
      if (!angle && char === ':') {
        requireValue(!group && text(part) && !part.includes('@'));
        part = ''; group = true; continue;
      }
      if (!angle && char === ';') {
        requireValue(group); emit(); group = false; continue;
      }
      if (!angle && char === ',') { emit(); continue; }
    }
    part += char;
  }
  requireValue(!quoted && !escaped && !angle && !group);
  emit();
  return [...new Set(result)];
}
function sentTime(value, retrievedAt) {
  const match = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}|GMT|UT)$/.exec(value || '');
  requireValue(match);
  const [, day, month, year, hour, minute, second, zone] = match;
  const monthIndex = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').indexOf(month);
  const local = new Date(Date.UTC(+year, monthIndex, +day, +hour, +minute, +second));
  requireValue(+year >= 1900 && local.getUTCFullYear() === +year && local.getUTCMonth() === monthIndex &&
    local.getUTCDate() === +day && +hour < 24 && +minute < 60 && +second < 60 && zone !== '-0000');
  const hours = zone === 'GMT' || zone === 'UT' ? 0 : +zone.slice(1, 3);
  const minutes = zone === 'GMT' || zone === 'UT' ? 0 : +zone.slice(3, 5);
  requireValue(hours < 24 && minutes < 60);
  const offset = (hours * 60 + minutes) * (zone[0] === '-' ? -1 : 1);
  const timestamp = new Date(local.getTime() - offset * 60000).toISOString();
  requireValue(timestamp <= retrievedAt);
  return timestamp;
}
function classify(headers, reviewed) {
  const auto = headers['auto-submitted'] || [];
  const list = headers['list-id'] || [];
  const precedence = headers.precedence || [];
  if ([auto, list, precedence].some(values => values.length > 1)) return 'unclassified';
  const a = auto[0]?.toLowerCase(), p = precedence[0]?.toLowerCase();
  if ((auto.length && !['no', 'auto-generated', 'auto-replied'].includes(a)) ||
    (list.length && !/^(?:[^<>]*\s)?<[^<>\s]+[.][^<>\s]+>$/.test(list[0])) ||
    (precedence.length && !['bulk', 'list', 'normal', 'first-class'].includes(p))) return 'unclassified';
  const automated = a && a !== 'no';
  const bulk = list.length > 0 || ['bulk', 'list'].includes(p);
  if (automated && bulk) return 'unclassified';
  return automated ? 'automated' : bulk ? 'bulk' : reviewed ? 'interpersonal' : 'unclassified';
}
function normalize(message, listed, retrievedAt, interpersonalIds) {
  object(message, ['id', 'threadId', 'labelIds', 'historyId', 'internalDate', 'payload']);
  requireValue(message.id === listed.id && message.threadId === listed.threadId);
  requireValue(message.labelIds === undefined || (Array.isArray(message.labelIds) && message.labelIds.every(text)));
  requireValue(message.historyId === undefined || text(message.historyId));
  requireValue(message.internalDate === undefined || /^\d+$/.test(message.internalDate));
  object(message.payload, ['headers']);
  requireValue(Array.isArray(message.payload.headers));
  const headers: Record<string, string[]> = {};
  for (const header of message.payload.headers) {
    object(header, ['name', 'value']);
    requireValue(text(header.name) && typeof header.value === 'string' &&
      HEADERS.some(name => name.toLowerCase() === header.name.toLowerCase()));
    (headers[header.name.toLowerCase()] ||= []).push(header.value.trim());
  }
  if (message.labelIds?.includes('DRAFT')) return null;
  requireValue(headers.from?.length === 1 && headers.date?.length === 1);
  const senders = mailboxes(headers.from[0]);
  requireValue(senders.length === 1);
  const recipients = [];
  for (const role of ['to', 'cc', 'bcc']) {
    for (const value of headers[role] || []) {
      for (const identityId of mailboxes(value)) recipients.push({ identityId, role });
    }
  }
  const unique = [...new Map(recipients.map(item => [JSON.stringify(item), item])).values()]
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const timestamp = sentTime(headers.date[0], retrievedAt);
  return { id: message.id, idKind: 'local', eventType: 'message', threadId: message.threadId,
    senderId: senders[0], timestamp, channel: 'email', recipients: unique,
    classification: classify(headers, interpersonalIds.has(message.id)) };
}
function validateConfig(config) {
  object(config, ['schemaVersion', 'dataClass', 'provider', 'account', 'selfAddresses', 'period',
    'maxPages', 'pageSize', 'reviewedThreads', 'interpersonalIds']);
  requireSynthetic(config.dataClass);
  requireValue(config.schemaVersion === 1, 'synthetic_only');
  requireValue(config.provider === 'gmail', 'unsupported_provider');
  requireValue(text(config.account) && Array.isArray(config.selfAddresses) && config.selfAddresses.length > 0);
  requireValue(config.selfAddresses.every(value => address(value) === value));
  requireValue(Number.isSafeInteger(config.maxPages) && config.maxPages > 0);
  requireValue(Number.isSafeInteger(config.pageSize) && config.pageSize > 0 && config.pageSize <= 500);
  requireValue(Array.isArray(config.interpersonalIds) && config.interpersonalIds.every(text));
  requireValue(Array.isArray(config.reviewedThreads));
  requireValue(new Set(config.reviewedThreads.map(item => item.id)).size === config.reviewedThreads.length);
  for (const thread of config.reviewedThreads) {
    object(thread, ['id', 'kind', 'addresses']);
    requireValue(text(thread.id) && ['direct', 'group', 'broadcast'].includes(thread.kind));
    requireValue(Array.isArray(thread.addresses) && thread.addresses.every(value => address(value) === value));
    requireValue(new Set(thread.addresses).size === thread.addresses.length);
    if (thread.kind === 'direct') requireValue(thread.addresses.length === 2 &&
      thread.addresses.filter(value => config.selfAddresses.includes(value)).length === 1);
    if (thread.kind === 'group') requireValue(thread.addresses.length > 2);
  }
  return resolvePeriod(config.period);
}
function upstream(error, operation) {
  if (isError(error, 'email')) return { code: error.code, retryable: false };
  if (error?.status === 401 || error?.status === 403) return { code: 'requires_setup', retryable: false };
  if (error?.status === 400) return { code: operation === 'list' ? 'cursor_expired' : 'metadata_incomplete', retryable: false };
  if (error?.status === 404) return { code: operation === 'list' ? 'source_unavailable' : 'message_unavailable', retryable: false };
  if (error?.status === 429) return { code: 'rate_limited', retryable: true };
  if (Number.isInteger(error?.status) && error.status >= 500) return { code: 'upstream_unavailable', retryable: true };
  throw emailError('transport_failure');
}
function validateSavedEvent(event, period) {
  object(event, ['id', 'idKind', 'eventType', 'threadId', 'senderId', 'timestamp', 'channel', 'recipients', 'classification']);
  requireValue(text(event.id) && text(event.threadId) && event.idKind === 'local' &&
    event.eventType === 'message' && event.channel === 'email' && address(event.senderId) === event.senderId &&
    typeof event.timestamp === 'string' && Number.isFinite(Date.parse(event.timestamp)) &&
    event.timestamp === new Date(event.timestamp).toISOString() &&
    event.timestamp >= period.start && event.timestamp < period.end &&
    ['interpersonal', 'bulk', 'automated', 'unclassified'].includes(event.classification), 'checkpoint_mismatch');
  requireValue(Array.isArray(event.recipients), 'checkpoint_mismatch');
  for (const recipient of event.recipients) {
    object(recipient, ['identityId', 'role']);
    requireValue(address(recipient.identityId) === recipient.identityId &&
      ['to', 'cc', 'bcc'].includes(recipient.role), 'checkpoint_mismatch');
  }
}
async function acquireEmail(config, transport, previous = null) {
  const period = validateConfig(config);
  const selfAddresses = new Set(config.selfAddresses);
  const interpersonalIds = new Set(config.interpersonalIds);
  const reviewedThreads = new Map<string, { kind: string; addresses: string[]; addressSet: Set<string> }>(config.reviewedThreads.map(thread =>
    [thread.id, { ...thread, addressSet: new Set(thread.addresses) }]));
  // The binding excludes budgets; a resumed scan may use a different page budget.
  const { maxPages, ...binding } = config;
  const signature = digest({ ...binding, period });
  if (previous !== null) {
    object(previous, ['schemaVersion', 'signature', 'nativeCursor', 'pageTokens', 'messages', 'retrievedAt']);
    object(previous.nativeCursor, ['domain', 'nextPageToken', 'finished']);
    requireValue(previous.schemaVersion === 1 && previous.signature === signature &&
      previous.nativeCursor.domain === 'gmail.messages.list' && token(previous.nativeCursor.nextPageToken) &&
      typeof previous.nativeCursor.finished === 'boolean' &&
      (!previous.nativeCursor.finished || previous.nativeCursor.nextPageToken === null) &&
      Array.isArray(previous.messages) && Array.isArray(previous.pageTokens) &&
      previous.pageTokens.every(token) && new Set(previous.pageTokens).size === previous.pageTokens.length,
    'checkpoint_mismatch');
    requireValue(previous.retrievedAt === null || (typeof previous.retrievedAt === 'string' &&
      Number.isFinite(Date.parse(previous.retrievedAt)) &&
      previous.retrievedAt === new Date(previous.retrievedAt).toISOString()), 'checkpoint_mismatch');
    requireValue(previous.retrievedAt !== null || (!previous.nativeCursor.finished &&
      previous.nativeCursor.nextPageToken === null && previous.messages.length === 0), 'checkpoint_mismatch');
    requireValue(previous.nativeCursor.nextPageToken !== null || previous.nativeCursor.finished ||
      previous.retrievedAt === null, 'checkpoint_mismatch');
    requireValue(previous.retrievedAt === null ? previous.pageTokens.length === 0 :
      previous.pageTokens.length > 0 && previous.pageTokens[0] === null, 'checkpoint_mismatch');
    requireValue(previous.nativeCursor.finished || !previous.pageTokens.includes(previous.nativeCursor.nextPageToken),
      'checkpoint_mismatch');
    previous.messages.forEach(event => validateSavedEvent(event, period));
    requireValue(new Set(previous.messages.map(event => event.id)).size === previous.messages.length &&
      previous.messages.every(event => event.timestamp <= previous.retrievedAt), 'checkpoint_mismatch');
  }
  const checkpoint = previous ? structuredClone(previous) : {
    schemaVersion: 1, signature, nativeCursor: { domain: 'gmail.messages.list', nextPageToken: null, finished: false },
    pageTokens: [], messages: [], retrievedAt: null
  };
  const errors = [];
  const messages = new Map(checkpoint.messages.map(event => [event.id, event]));
  let pages = 0;
  const visited = new Set(checkpoint.pageTokens);
  while (!checkpoint.nativeCursor.finished && pages < maxPages) {
    const pageToken = checkpoint.nativeCursor.nextPageToken;
    let operation = 'list';
    try {
      requireValue(!visited.has(pageToken), 'pagination_cycle');
      visited.add(pageToken);
      const response = await transport.list({ userId: 'me', maxResults: config.pageSize,
        includeSpamTrash: true, ...(pageToken === null ? {} : { pageToken }),
        fields: 'messages(id,threadId),nextPageToken,resultSizeEstimate' });
      object(response, ['messages', 'nextPageToken', 'resultSizeEstimate']);
      requireValue(response.nextPageToken === undefined || text(response.nextPageToken));
      const next = response.nextPageToken ?? null;
      requireValue(next === null || !visited.has(next), 'pagination_cycle');
      requireValue(response.messages === undefined || Array.isArray(response.messages));
      const retrievedAt = transport.now();
      requireValue(typeof retrievedAt === 'string' && Number.isFinite(Date.parse(retrievedAt)));
      const at = new Date(retrievedAt).toISOString();
      requireValue(checkpoint.retrievedAt === null || at >= checkpoint.retrievedAt, 'retrieval_time_regressed');
      const additions = [];
      const pageMessages = new Map();
      operation = 'get';
      for (const listed of response.messages || []) {
        object(listed, ['id', 'threadId']);
        requireValue(text(listed.id) && text(listed.threadId));
        const message = await transport.get({ userId: 'me', id: listed.id, format: 'metadata',
          metadataHeaders: [...HEADERS], fields: FIELDS });
        const event = normalize(message, listed, at, interpersonalIds);
        if (!event || event.timestamp < period.start || event.timestamp >= period.end) continue;
        const reviewed = reviewedThreads.get(event.threadId);
        if (reviewed?.kind === 'direct') requireValue([event.senderId, ...event.recipients.map(item => item.identityId)]
          .every(value => reviewed.addressSet.has(value)), 'reviewed_roster_conflict');
        const existing = messages.get(event.id) || pageMessages.get(event.id);
        requireValue(!existing || isDeepStrictEqual(existing, event), 'record_conflict');
        if (!existing) {
          additions.push(event);
          pageMessages.set(event.id, event);
        }
      }
      checkpoint.messages.push(...additions);
      for (const event of additions) messages.set(event.id, event);
      checkpoint.pageTokens.push(pageToken);
      checkpoint.retrievedAt = at;
      checkpoint.nativeCursor = { domain: 'gmail.messages.list', nextPageToken: next, finished: next === null };
      pages++;
    } catch (error) {
      errors.push(upstream(error, operation));
      break;
    }
  }
  if (!checkpoint.nativeCursor.finished && !errors.length) errors.push({ code: 'page_budget', retryable: true });
  const identities = new Map(), threads = new Map(), memberships = new Map();
  for (const event of checkpoint.messages) {
    const roster = new Set([event.senderId, ...event.recipients.map(item => item.identityId)]);
    const reviewed = reviewedThreads.get(event.threadId);
    if (reviewed?.kind === 'direct') {
      requireValue([...roster].every(value => reviewed.addressSet.has(value)), 'reviewed_roster_conflict');
    }
    for (const value of reviewed?.addresses || []) roster.add(value);
    threads.set(event.threadId, { id: event.threadId, idKind: 'local', kind: reviewed?.kind || 'unknown' });
    for (const value of roster) {
      identities.set(value, { id: value, idKind: 'local', isSelf: selfAddresses.has(value),
        addresses: [{ type: 'email', value }] });
      memberships.set(JSON.stringify([event.threadId, value]), { threadId: event.threadId, identityId: value });
    }
  }
  const unavailable = errors[0]?.code === 'requires_setup' && checkpoint.messages.length === 0;
  const handoff = {
    schemaVersion: 1, dataClass: 'synthetic', source: 'email', account: config.account, connector: CONNECTOR,
    coverage: { start: period.start, end: period.end, completeness: 'partial',
      basis: 'Accessible Gmail metadata only; drafts excluded, spam/trash included. Hidden BCC, aliases, deleted mail and concurrent changes are unverified. Terminal enumeration is not complete history.' },
    errors,
    pages: [{ cursor: null, nextCursor: null, retrievedAt: checkpoint.retrievedAt || period.asOf,
      identities: [...identities.values()], threads: [...threads.values()],
      memberships: [...memberships.values()], events: checkpoint.messages }]
  };
  return { handoff, checkpoint, report: { status: unavailable ? 'requires_setup' : 'partial',
    paginationComplete: checkpoint.nativeCursor.finished, persistedSourcePages: pages, errors,
    resyncRequired: errors.some(error => error.code === 'cursor_expired') }, exitCode: 2 };
}
function fixtureTransport(fixture) {
  object(fixture, ['schemaVersion', 'dataClass', 'retrievedAt', 'pages', 'details']);
  requireSynthetic(fixture.dataClass);
  requireValue(fixture.schemaVersion === 1, 'synthetic_only');
  requireValue(Array.isArray(fixture.pages) && fixture.details && typeof fixture.details === 'object');
  const unwrap = value => {
    requireValue(value);
    if (value.errorStatus !== undefined) {
      object(value, ['errorStatus']);
      throw { status: value.errorStatus };
    }
    return structuredClone(value);
  };
  return {
    now: () => fixture.retrievedAt,
    list: async request => {
      const page = fixture.pages.find(item => item.pageToken === (request.pageToken ?? null));
      requireValue(page, 'cursor_expired');
      object(page, ['pageToken', 'response']);
      return unwrap(page.response);
    },
    get: async request => unwrap(fixture.details[request.id])
  };
}
async function runFixture(request, folder) {
  object(request, ['config', 'fixture', 'previous', 'output']);
  requireSynthetic(request.config?.dataClass);
  requireValue(text(request.fixture) && text(request.output));
  requireValue(request.previous === undefined || text(request.previous));
  const read = file => readJSONValue(path.resolve(folder, file));
  const previous = request.previous ? read(request.previous) : null;
  const result = await acquireEmail(request.config, fixtureTransport(read(request.fixture)), previous);
  const output = outputLocation(path.resolve(folder, request.output));
  writeHandoffBundle(output, result.handoff, { period: request.config.period,
    checkpoint: result.checkpoint, report: result.report, failure: emailError });
  return { output, exitCode: result.exitCode };
}
if (require.main === module) {
  runConverter(async () => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--synthetic-request', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const request = readJSONValue(file);
    const result = await runFixture(request, path.dirname(file));
    process.stdout.write('Synthetic email acquisition persisted; coverage is partial.\n');
    return result.exitCode;
  }, { domain: 'email', fallback: 'input_or_storage_failure', label: 'Email acquisition' });
}

export { acquireEmail, fixtureTransport, runFixture };
