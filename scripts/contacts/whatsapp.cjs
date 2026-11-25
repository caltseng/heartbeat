const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder, isDeepStrictEqual } = require('node:util');
const { outputLocation, resolvePeriod } = require('./collect.cjs');

const PROFILE = 'whatsapp-ios-txt-metadata-v1';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
class ConversionError extends Error {
  constructor(code, status = 'failed') { super(code); this.code = code; this.status = status; }
}
function need(value, code, status) {
  if (!value) throw new ConversionError(code, status);
}
function shape(value, fields) {
  need(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => fields.includes(key)), 'invalid_manifest');
}
function id(value) {
  need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value), 'invalid_local_id');
}
function list(value) { need(Array.isArray(value), 'invalid_manifest'); return value; }
function header(line) {
  return line.match(/^\u200E?\[(\d{1,2}\/\d{1,2}\/\d{4}, \d{2}:\d{2}:\d{2})\] (.*)$/);
}
function wallParts(text) {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})$/);
  need(match, 'unsupported_timestamp', 'unsupported');
  const [, day, month, year, hour, minute, second] = match.map(Number);
  const value = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(value);
  need(year >= 1970 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && hour < 24 && minute < 60 && second < 60, 'invalid_calendar_time');
  return value;
}
function timeInstant(wallTime, evidence, offset, retrievedAt) {
  need(evidence !== undefined, 'missing_time_evidence', 'requires_setup');
  shape(evidence, ['zone', 'evidenceRef', 'clockVerified']);
  need(evidence.clockVerified === true, 'unverified_clock', 'requires_setup');
  id(evidence.evidenceRef);
  need(typeof evidence.zone === 'string' && evidence.zone.length > 0, 'missing_source_zone', 'requires_setup');
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: evidence.zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (error) {
    if (error instanceof RangeError) throw new ConversionError('unsupported_source_zone', 'unsupported');
    throw error;
  }
  const local = instant => {
    const p = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  };
  const wall = wallParts(wallTime), offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = wall + hours * 3600000;
    offsets.add(local(instant) - instant);
  }
  let candidates = [...offsets].map(delta => ({ instant: wall - delta, delta }))
    .filter(row => local(row.instant) === wall);
  if (offset !== undefined) {
    need(typeof offset === 'string' && /^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(offset),
      'invalid_reviewed_offset', 'unsupported');
    const delta = (offset[0] === '-' ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) * 60000;
    candidates = candidates.filter(row => row.delta === delta);
  }
  need(candidates.length === 1, 'unresolved_source_time', 'unsupported');
  need(candidates[0].instant <= Date.parse(retrievedAt), 'future_event');
  return { timestamp: new Date(candidates[0].instant).toISOString(), offsetSeconds: candidates[0].delta / 1000 };
}

function convert(bytes, manifest, registry = []) {
  need(manifest?.dataClass === 'synthetic', 'private_collection_disabled');
  shape(manifest, ['schemaVersion', 'dataClass', 'profile', 'producer', 'account', 'archive', 'ledgerRevision',
    'period', 'retrievedAt', 'identities', 'thread', 'timeEvidence', 'rows']);
  need(manifest.schemaVersion === 1 && manifest.profile === PROFILE, 'unsupported_profile', 'unsupported');
  shape(manifest.producer, ['platform', 'appVersion', 'osVersion', 'locale', 'exportOption', 'deviceRole']);
  need(manifest.producer.platform === 'ios' && manifest.producer.locale === 'day-first-24h-seconds' &&
    manifest.producer.exportOption === 'without-media' && manifest.producer.deviceRole === 'primary-phone' &&
    manifest.producer.appVersion === 'synthetic' && manifest.producer.osVersion === 'synthetic',
  'unverified_producer', 'requires_setup');
  id(manifest.account);
  id(manifest.ledgerRevision);
  shape(manifest.archive, ['ref', 'sha256']);
  id(manifest.archive.ref);
  need(Buffer.isBuffer(bytes) && bytes.length <= 16 * 1024 * 1024, 'txt_size_limit', 'unsupported');
  need(manifest.archive.sha256 === hash(bytes), 'archive_digest_mismatch');
  const period = resolvePeriod(manifest.period);
  need(typeof manifest.retrievedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(manifest.retrievedAt) &&
    Number.isFinite(Date.parse(manifest.retrievedAt)) && new Date(manifest.retrievedAt).toISOString() === manifest.retrievedAt &&
    period.asOf <= manifest.retrievedAt && Date.parse(manifest.retrievedAt) <= Date.now(), 'invalid_retrieval_time');
  let txt;
  try { txt = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new ConversionError('invalid_utf8'); }
  txt = txt.replace(/^\uFEFF/, '');
  need(!/\r(?!\n)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF]/.test(txt), 'unsupported_txt_layout', 'unsupported');
  const lines = txt === '' ? [] : txt.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  need(lines.length <= 100000, 'txt_structure_limit', 'unsupported');
  for (const line of lines) {
    const parsed = header(line);
    if (parsed) wallParts(parsed[1]);
    else need(!/^[\u200E\u200F\u202A-\u202E\u2066-\u2069]?(?:\[\d|\d{1,4}[/.-]\d)/.test(line),
      'unsupported_txt_layout', 'unsupported');
  }
  const identities = list(manifest.identities), byId = new Map();
  for (const identity of identities) {
    shape(identity, ['id', 'isSelf']);
    id(identity.id);
    need(typeof identity.isSelf === 'boolean' && !byId.has(identity.id), 'invalid_identity');
    byId.set(identity.id, identity);
  }
  need(identities.filter(identity => identity.isSelf).length === 1, 'unverified_self', 'requires_setup');
  const thread = manifest.thread;
  shape(thread, ['id', 'kind', 'members', 'membershipEvidenceRef']);
  id(thread.id);
  id(thread.membershipEvidenceRef);
  const members = list(thread.members);
  need(new Set(members).size === members.length && members.every(member => byId.has(member)) &&
    members.some(member => byId.get(member).isSelf) && members.length === identities.length,
  'unverified_membership', 'requires_setup');
  need((thread.kind === 'direct' && members.length === 2) ||
    (thread.kind === 'group' && members.length >= 2), 'invalid_chat_kind', 'requires_setup');
  const page = { cursor: null, nextCursor: null, retrievedAt: manifest.retrievedAt,
    identities: identities.map(identity => ({ ...identity, idKind: 'local' })),
    threads: [{ id: thread.id, idKind: 'local', kind: thread.kind }],
    memberships: members.map(identityId => ({ threadId: thread.id, identityId })), events: [] };
  const resolutions = [];
  let nextLine = 1, excluded = 0;
  for (const [index, row] of list(manifest.rows).entries()) {
    shape(row, ['startLine', 'endLine', 'kind', 'senderId', 'senderLabel', 'wallTime', 'timeEvidence', 'offset']);
    need(row.startLine === nextLine && Number.isSafeInteger(row.endLine) &&
      row.endLine >= row.startLine && row.endLine <= lines.length, 'unreviewed_record_boundaries', 'requires_setup');
    const parsed = header(lines[row.startLine - 1]);
    need(parsed && row.wallTime === parsed[1], 'unreviewed_record_boundaries', 'requires_setup');
    nextLine = row.endLine + 1;
    need(['message', 'system', 'call', 'deletion', 'reaction', 'media'].includes(row.kind),
      'ambiguous_record_type', 'unsupported');
    const evidence = row.timeEvidence === undefined ? manifest.timeEvidence : row.timeEvidence;
    const { timestamp, offsetSeconds } = timeInstant(row.wallTime, evidence, row.offset, manifest.retrievedAt);
    resolutions.push({ ordinal: index + 1, wallTime: row.wallTime, zone: evidence.zone,
      evidenceRef: evidence.evidenceRef, offsetSeconds, timestamp });
    if (row.kind !== 'message') { excluded++; continue; }
    need(byId.has(row.senderId) && typeof row.senderLabel === 'string' && row.senderLabel.length > 0 &&
      !/[\r\n]/.test(row.senderLabel) && parsed[2].startsWith(`${row.senderLabel}: `),
    'unresolved_sender', 'unsupported');
    page.events.push({ id: `${manifest.archive.ref}:record:${index + 1}`, idKind: 'local', eventType: 'message',
      threadId: thread.id, senderId: row.senderId, timestamp, channel: 'whatsapp',
      recipients: [], classification: 'unclassified' });
  }
  need(nextLine === lines.length + 1, 'unreviewed_record_boundaries', 'requires_setup');
  const handoff = {
    schemaVersion: 1, dataClass: 'synthetic', source: 'whatsapp', account: manifest.account, connector: PROFILE,
    coverage: { start: null, end: null, completeness: 'unknown',
      basis: 'Selected primary-phone local TXT snapshot only; unselected chats, historical roster, deleted/disappeared/view-once/restricted and older-device history unknown. System/call/deletion/reaction/media rows excluded; counts are lower bounds, not live sync or all interactions.' },
    errors: excluded ? [{ code: 'non_message_rows_excluded', retryable: false }] : [], pages: [page]
  };
  const { period: reportingPeriod, ...acquisition } = manifest;
  const audit = { acquisition, resolutions };
  handoff.whatsappArchive = { profile: PROFILE, threadId: thread.id, archiveRef: manifest.archive.ref,
    sha256: manifest.archive.sha256, ledgerDigest: hash(JSON.stringify(audit)), metadataDigest: hash(JSON.stringify(handoff)) };
  const binding = handoff.whatsappArchive;
  for (const entry of list(registry)) {
    shape(entry, ['account', 'binding', 'audit']);
    need(entry.account && entry.binding && entry.audit?.acquisition &&
      entry.account === entry.audit.acquisition.account &&
      entry.binding.profile === PROFILE && entry.binding.threadId === entry.audit.acquisition.thread?.id &&
      entry.binding.archiveRef === entry.audit.acquisition.archive?.ref &&
      entry.binding.sha256 === entry.audit.acquisition.archive?.sha256 &&
      entry.binding.ledgerDigest === hash(JSON.stringify(entry.audit)), 'invalid_registry');
    if (entry.account !== manifest.account) continue;
    if (entry.binding.threadId === thread.id) need(isDeepStrictEqual(entry.binding, binding),
      'whatsapp_archive_conflict', 'unsupported');
    else need(entry.binding.archiveRef !== binding.archiveRef && entry.binding.sha256 !== binding.sha256,
      'whatsapp_archive_conflict', 'unsupported');
  }
  return { handoff, audit };
}

function immutable(file, value) {
  if (fs.existsSync(file)) {
    need(!fs.lstatSync(file).isSymbolicLink() && fs.readFileSync(file, 'utf8') === value, 'output_conflict');
  } else fs.writeFileSync(file, value, { flag: 'wx', mode: 0o600 });
}
function run(argv) {
  need(argv.length === 6 && argv[0] === '--txt' && argv[2] === '--manifest' && argv[4] === '--output', 'invalid_arguments');
  const manifest = JSON.parse(fs.readFileSync(argv[3], 'utf8').replace(/^\uFEFF/, ''));
  need(manifest?.dataClass === 'synthetic', 'private_collection_disabled');
  const folder = outputLocation(argv[5]);
  const registryFile = path.join(folder, 'whatsapp-registry.synthetic.json');
  need(!fs.existsSync(registryFile) || !fs.lstatSync(registryFile).isSymbolicLink(), 'unsafe_registry');
  const registry = fs.existsSync(registryFile) ? JSON.parse(fs.readFileSync(registryFile, 'utf8')) : [];
  need(fs.statSync(argv[1]).size <= 16 * 1024 * 1024, 'txt_size_limit', 'unsupported');
  const bytes = fs.readFileSync(argv[1]);
  convert(bytes, manifest, registry);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const lock = path.join(folder, 'whatsapp-conversion.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new ConversionError('conversion_locked');
    throw error;
  }
  const temporary = path.join(folder, `whatsapp-registry.${crypto.randomUUID()}.tmp`);
  let temporaryWritten = false;
  try {
    const latest = fs.existsSync(registryFile) ? JSON.parse(fs.readFileSync(registryFile, 'utf8')) : [];
    const { handoff, audit } = convert(bytes, manifest, latest);
    if (!latest.some(entry => entry.account === manifest.account && entry.binding.threadId === manifest.thread.id)) {
      latest.push({ account: manifest.account, binding: handoff.whatsappArchive, audit });
      fs.writeFileSync(temporary, JSON.stringify(latest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      temporaryWritten = true;
      fs.renameSync(temporary, registryFile);
      temporaryWritten = false;
    }
    const bundle = path.join(folder, `acquisition-${hash(JSON.stringify([manifest.account, manifest.archive.ref]))}`);
    fs.mkdirSync(bundle, { recursive: true, mode: 0o700 });
    need(!fs.lstatSync(bundle).isSymbolicLink(), 'unsafe_output');
    immutable(path.join(bundle, 'whatsapp.synthetic.json'), JSON.stringify(handoff, null, 2) + '\n');
    const request = { schemaVersion: 1, dataClass: 'synthetic', period: manifest.period, output: '..', resume: false,
      sources: [{ source: 'whatsapp', account: manifest.account, connector: PROFILE, mode: 'metadata-import', input: 'whatsapp.synthetic.json' }] };
    immutable(path.join(bundle, 'request.synthetic.json'), JSON.stringify(request, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ status: 'partial', code: 'snapshot_unknown_history', live: false }) + '\n');
    return 2;
  } finally {
    if (temporaryWritten) fs.unlinkSync(temporary);
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
if (require.main === module) {
  try { process.exitCode = run(process.argv.slice(2)); }
  catch (error) {
    const known = error instanceof ConversionError;
    process.stderr.write(JSON.stringify({ status: known ? error.status : 'failed',
      code: known ? error.code : 'conversion_input_or_io_error' }) + '\n');
    process.exitCode = known && error.status !== 'failed' ? 2 : 1;
  }
}
module.exports = { convert, ConversionError };
