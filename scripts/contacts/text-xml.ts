import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { hash as digest, stripBOM, readJSONValue, runCLI, outputLocation } from './lib.ts';
import { resolvePeriod } from './collect.ts';

const PROFILE = 'synctech-xml-metadata-v1';
class ConversionError extends Error {
  constructor(public readonly code: string, public readonly status = 'failed') { super(code); this.code = code; this.status = status; }
}
function need(condition: unknown, code: string, status?: string) {
  if (!condition) throw new ConversionError(code, status);
}
function shape(value, fields) {
  need(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => fields.includes(key)), 'invalid_manifest');
}
function id(value) { need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value), 'invalid_local_id'); }
function list(value) { need(Array.isArray(value), 'invalid_manifest'); return value; }
function xmlChars(value) {
  for (const char of value) {
    const n = char.codePointAt(0);
    need(n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xD7FF) ||
      (n >= 0xE000 && n <= 0xFFFD) || (n >= 0x10000 && n <= 0x10FFFF), 'invalid_xml');
  }
  return value;
}
function unescape(value) {
  need(!value.includes('<'), 'invalid_xml');
  return value.replace(/&([^;]*);|&/g, (match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    need(typeof entity === 'string' && /^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity), 'invalid_xml_entity');
    const n = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    need(Number.isSafeInteger(n) && n >= 0 && n <= 0x10FFFF, 'invalid_xml_entity');
    return xmlChars(String.fromCodePoint(n));
  });
}

// A deliberately bounded XML subset: no DTDs, external entities, CDATA or processing instructions.
function parseXML(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length <= 32 * 1024 * 1024, 'xml_size_limit', 'unsupported');
  let xml;
  try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ConversionError('invalid_utf8'); }
  xmlChars(xml);
  xml = stripBOM(xml);
  const declaration = xml.match(/^<\?xml[\t\r\n ]+version[\t\r\n ]*=[\t\r\n ]*(["'])1\.0\1[\t\r\n ]+encoding[\t\r\n ]*=[\t\r\n ]*(["'])UTF-8\2(?:[\t\r\n ]+standalone[\t\r\n ]*=[\t\r\n ]*(["'])(?:yes|no)\3)?[\t\r\n ]*\?>/);
  need(declaration, 'unsupported_xml_declaration', 'unsupported');
  xml = xml.slice(declaration[0].length);
  const roots = [], stack = [], comments = [];
  let position = 0, nodes = 0;
  while (position < xml.length) {
    if (xml[position] !== '<') {
      const end = xml.indexOf('<', position);
      const next = end === -1 ? xml.length : end;
      need(/^[\t\r\n ]*$/.test(xml.slice(position, next)), 'invalid_xml_text');
      position = next;
      continue;
    }
    if (xml.startsWith('<!--', position)) {
      const end = xml.indexOf('-->', position + 4);
      need(end !== -1, 'invalid_xml');
      const comment = xml.slice(position + 4, end);
      need(!comment.includes('--') && !comment.endsWith('-'), 'invalid_xml');
      comments.push(comment);
      position = end + 3;
      continue;
    }
    need(!xml.startsWith('<!', position) && !xml.startsWith('<?', position), 'unsupported_xml_construct', 'unsupported');
    const close = xml.slice(position).match(/^<\/([A-Za-z_][\w.-]*)[\t\r\n ]*>/);
    if (close) {
      need(stack.length && stack.pop().name === close[1], 'invalid_xml');
      position += close[0].length;
      continue;
    }
    const open = xml.slice(position).match(/^<([A-Za-z_][\w.-]*)/);
    need(open, 'invalid_xml');
    position += open[0].length;
    const node = { name: open[1], attrs: Object.create(null), children: [] };
    while (!xml.startsWith('/>', position) && xml[position] !== '>') {
      const attribute = xml.slice(position).match(/^[\t\r\n ]+([A-Za-z_][\w.-]*)[\t\r\n ]*=[\t\r\n ]*(?:"([^"]*)"|'([^']*)')/);
      if (!attribute) {
        const trailing = xml.slice(position).match(/^[\t\r\n ]+(?=\/?>)/);
        need(trailing, 'invalid_xml');
        position += trailing[0].length;
        break;
      }
      need(!Object.hasOwn(node.attrs, attribute[1]), 'invalid_xml');
      node.attrs[attribute[1]] = unescape(attribute[2] === undefined ? attribute[3] : attribute[2]);
      position += attribute[0].length;
    }
    const empty = xml.startsWith('/>', position);
    need(empty || xml[position] === '>', 'invalid_xml');
    position += empty ? 2 : 1;
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    need(++nodes <= 100000 && stack.length < 16, 'xml_structure_limit', 'unsupported');
    if (!empty) stack.push(node);
  }
  need(stack.length === 0 && roots.length === 1, 'invalid_xml');
  const versions = comments.flatMap(comment => {
    const creation = comment.match(/^[\t\r\n ]*File Created By SMS Backup & Restore v([0-9.]+)(?:\s|$)/);
    return creation ? [creation[1]] : [];
  });
  need(versions.length === 1 && versions[0] === '10.30.009', 'unsupported_producer', 'unsupported');
  return roots[0];
}

function milliseconds(value, asOf) {
  need(typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value), 'invalid_epoch_milliseconds');
  const n = Number(value);
  need(Number.isSafeInteger(n) && n >= 0 && n <= Date.parse(asOf), 'invalid_epoch_milliseconds');
  return new Date(n).toISOString();
}

function convert(bytes, manifest) {
  shape(manifest, ['schemaVersion', 'dataClass', 'profile', 'producerVersion', 'androidVersion', 'backupKind',
    'account', 'archive', 'period', 'retrievedAt', 'identities', 'selfBySubId', 'threads', 'rows']);
  need(manifest.schemaVersion === 1 && manifest.profile === PROFILE, 'unsupported_profile', 'unsupported');
  need(manifest.dataClass === 'synthetic', 'private_collection_disabled');
  need(manifest.producerVersion === '10.30.009' && manifest.androidVersion === '14' && manifest.backupKind === 'full',
    'unsupported_acquisition_profile', 'unsupported');
  id(manifest.account);
  shape(manifest.archive, ['ref', 'sha256']);
  id(manifest.archive.ref);
  need(Buffer.isBuffer(bytes) && manifest.archive.sha256 === digest(bytes), 'archive_digest_mismatch');
  const period = resolvePeriod(manifest.period);
  need(typeof manifest.retrievedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(manifest.retrievedAt) &&
    Number.isFinite(Date.parse(manifest.retrievedAt)) &&
    new Date(manifest.retrievedAt).toISOString() === manifest.retrievedAt, 'invalid_retrieval_time');
  const asOf = manifest.retrievedAt;
  need(period.asOf <= asOf, 'invalid_retrieval_time');
  const root = parseXML(bytes);
  need(root.name === 'smses' && root.children.every(row => ['sms', 'mms'].includes(row.name)), 'unsupported_xml_layout', 'unsupported');
  need(Object.keys(root.attrs).every(field => ['count', 'backup_set', 'backup_date', 'type'].includes(field)) &&
    (root.attrs.type === undefined || root.attrs.type === 'full'), 'unsupported_backup_layout', 'unsupported');
  need(/^(?:0|[1-9]\d*)$/.test(root.attrs.count) && Number(root.attrs.count) === root.children.length, 'xml_count_mismatch');
  need(typeof root.attrs.backup_set === 'string' && root.attrs.backup_set.length > 0, 'missing_backup_set');
  milliseconds(root.attrs.backup_date, asOf);
  const identities = list(manifest.identities);
  const byAddress = new Map(), byId = new Map();
  for (const identity of identities) {
    shape(identity, ['id', 'address', 'isSelf']);
    id(identity.id);
    need(typeof identity.address === 'string' && identity.address.length > 0 &&
      identity.address !== 'insert-address-token' && typeof identity.isSelf === 'boolean', 'invalid_identity');
    need(!byId.has(identity.id) && !byAddress.has(identity.address), 'duplicate_identity');
    byId.set(identity.id, identity);
    byAddress.set(identity.address, identity);
  }
  shape(manifest.selfBySubId, Object.keys(manifest.selfBySubId || {}));
  for (const self of Object.values(manifest.selfBySubId)) need(byId.get(self)?.isSelf, 'unverified_self', 'requires_setup');
  const ledger = new Map();
  for (const thread of list(manifest.threads)) {
    shape(thread, ['id', 'kind', 'members']);
    id(thread.id);
    need(['direct', 'group', 'unknown'].includes(thread.kind) && !ledger.has(thread.id), 'invalid_thread');
    const members = list(thread.members);
    need(new Set(members).size === members.length && members.every(member => byId.has(member)), 'invalid_thread_members');
    if (thread.kind === 'direct') need(members.length === 2 && members.filter(member => byId.get(member).isSelf).length === 1, 'invalid_direct_thread');
    ledger.set(thread.id, thread);
  }
  const rows = new Map();
  for (const row of list(manifest.rows)) {
    shape(row, ['ordinal', 'transport', 'threadId']);
    need(Number.isSafeInteger(row.ordinal) && row.ordinal > 0 && row.ordinal <= root.children.length &&
      !rows.has(row.ordinal), 'invalid_row_ledger');
    need(['sms', 'mms'].includes(row.transport), 'unsupported_transport', 'unsupported');
    need(row.threadId === undefined || ledger.has(row.threadId), 'unverified_thread', 'requires_setup');
    rows.set(row.ordinal, row);
  }
  const page = { cursor: null, nextCursor: null, retrievedAt: asOf, identities: [], threads: [], memberships: [], events: [] };
  const errors = [], usedThreads = new Map(), usedIdentities = new Set();
  let excluded = 0;
  const archiveRef = manifest.archive.ref;
  for (const [index, node] of root.children.entries()) {
    const ordinal = index + 1, attrs = node.attrs, evidence = rows.get(ordinal);
    const addresses = [attrs.address, ...node.children.filter(child => child.name === 'addrs')
      .flatMap(child => child.children.map(addr => addr.attrs.address))];
    need(!['s_chat', 'restricted'].some(field => Object.hasOwn(attrs, field)) &&
      !addresses.some(value => typeof value === 'string' && /(?:@rcs|\brcs:)/i.test(value)),
    'unsupported_rcs_or_restricted', 'unsupported');
    need(evidence && evidence.transport === node.name, 'unverified_transport', 'requires_setup');
    const timestamp = milliseconds(attrs.date, asOf);
    if (attrs.date_sent !== undefined && attrs.date_sent !== '0') milliseconds(attrs.date_sent, asOf);
    const direction = node.name === 'sms' ? attrs.type : attrs.msg_box;
    need(['1', '2', '3', '4', '5', '6'].includes(direction), 'ambiguous_direction');
    if (node.name === 'sms') need(node.children.length === 0, 'unsupported_xml_layout', 'unsupported');
    else {
      need(node.children.every(child => ['parts', 'addrs'].includes(child.name)) &&
        node.children.filter(child => child.name === 'parts').length <= 1 &&
        node.children.filter(child => child.name === 'addrs').length === 1, 'unsupported_xml_layout', 'unsupported');
      for (const child of node.children) need(child.children.every(item =>
        item.name === (child.name === 'parts' ? 'part' : 'addr') && item.children.length === 0), 'unsupported_xml_layout', 'unsupported');
      if (['130', '134', '136'].includes(attrs.m_type)) { excluded++; continue; }
      if (['1', '2'].includes(direction)) need(attrs.m_type === (direction === '1' ? '132' : '128'), 'contradictory_mms_direction');
      else need(['128', '130', '132', '134', '136'].includes(attrs.m_type), 'ambiguous_mms_type');
    }
    if (!['1', '2'].includes(direction)) { excluded++; continue; }
    const self = byId.get(manifest.selfBySubId[attrs.sub_id]);
    if (!self?.isSelf) { errors.push({ code: `row_${ordinal}_unverified_self`, retryable: false }); continue; }
    const lookup = address => address === 'insert-address-token' ? self : byAddress.get(address);
    let sender, recipients;
    if (node.name === 'sms') {
      const peer = byAddress.get(attrs.address);
      if (!peer || peer.isSelf) { errors.push({ code: `row_${ordinal}_unresolved_peer`, retryable: false }); continue; }
      sender = direction === '1' ? peer : self;
      recipients = [{ identityId: direction === '1' ? self.id : peer.id, role: 'recipient' }];
    } else {
      const addresses = node.children.find(child => child.name === 'addrs').children;
      need(addresses.every(addr => ['137', '151', '130', '129'].includes(addr.attrs.type)), 'unknown_address_role');
      const senders = addresses.filter(addr => addr.attrs.type === '137');
      need(senders.length === 1, 'ambiguous_sender');
      sender = lookup(senders[0].attrs.address);
      recipients = addresses.filter(addr => addr.attrs.type !== '137').map(addr =>
        ({ identityId: lookup(addr.attrs.address)?.id, role: { 151: 'to', 130: 'cc', 129: 'bcc' }[addr.attrs.type] }));
      if (!sender || !recipients.length || recipients.some(recipient => !recipient.identityId)) {
        errors.push({ code: `row_${ordinal}_unresolved_addresses`, retryable: false }); continue;
      }
      need((direction === '2' ? sender.id === self.id : !sender.isSelf && recipients.some(recipient => recipient.identityId === self.id)),
        'contradictory_self_direction');
      need(new Set(recipients.map(recipient => recipient.identityId)).size === recipients.length &&
        recipients.every(recipient => recipient.identityId !== sender.id), 'ambiguous_recipients');
    }
    const participants = [...new Set([sender.id, ...recipients.map(recipient => recipient.identityId)])];
    const reviewed = ledger.get(evidence.threadId);
    need(!reviewed || participants.every(person => reviewed.members.includes(person)), 'thread_participant_mismatch');
    const threadId = reviewed ? `${archiveRef}:thread:${reviewed.id}` : `${archiveRef}:unknown:${ordinal}`;
    if (!reviewed) errors.push({ code: `row_${ordinal}_unknown_thread`, retryable: false });
    usedThreads.set(threadId, { kind: reviewed?.kind || 'unknown', members: reviewed?.members || participants });
    participants.forEach(person => usedIdentities.add(person));
    page.events.push({ id: `${archiveRef}:record:${ordinal}`, idKind: 'local', eventType: 'message',
      threadId, senderId: sender.id, timestamp, channel: node.name, recipients, classification: 'unclassified' });
  }
  for (const [threadId, thread] of usedThreads) {
    page.threads.push({ id: threadId, idKind: 'local', kind: thread.kind });
    for (const identityId of thread.members) {
      usedIdentities.add(identityId);
      page.memberships.push({ threadId, identityId });
    }
  }
  page.identities = identities.filter(identity => usedIdentities.has(identity.id)).map(identity =>
    ({ id: identity.id, idKind: 'local', isSelf: identity.isSelf, addresses: [{ type: 'phone', value: identity.address }] }));
  if (excluded) errors.push({ code: 'non_message_rows_excluded', retryable: false });
  return {
    schemaVersion: 1, dataClass: 'synthetic', source: 'text-messages', account: manifest.account, connector: PROFILE,
    textArchive: { profile: PROFILE, archiveRef, sha256: manifest.archive.sha256,
      ledgerDigest: digest(JSON.stringify({ identities, selfBySubId: manifest.selfBySubId, threads: manifest.threads, rows: manifest.rows })) },
    coverage: { start: null, end: null, completeness: 'unknown',
      basis: 'Local full XML only; cloud/deleted/RCS/iMessage/other-device history and original display zone unknown; observed totals are lower bounds.' },
    errors, pages: [page]
  };
}

function run(argv) {
  need(argv.length === 6 && argv[0] === '--xml' && argv[2] === '--manifest' && argv[4] === '--output', 'invalid_arguments');
  const manifest = readJSONValue(argv[3]);
  need(manifest?.dataClass === 'synthetic', 'private_collection_disabled');
  const stat = fs.statSync(argv[1]);
  need(stat.size <= 32 * 1024 * 1024, 'xml_size_limit', 'unsupported');
  const handoff = convert(fs.readFileSync(argv[1]), manifest);
  const folder = outputLocation(argv[5]);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  need(fs.readdirSync(folder).length === 0, 'output_not_empty');
  fs.writeFileSync(path.join(folder, 'text.synthetic.json'), JSON.stringify(handoff, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(folder, 'request.synthetic.json'), JSON.stringify({
    schemaVersion: 1, dataClass: 'synthetic', period: manifest.period, output: '.', resume: false,
    sources: [{ source: handoff.source, account: handoff.account, connector: PROFILE, mode: 'metadata-import', input: 'text.synthetic.json' }]
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: 'partial', code: 'unknown_history_metadata_only' }) + '\n');
  return 2;
}
if (require.main === module) {
  runCLI(() => {
    return run(process.argv.slice(2));
  }, error => {
    const known = error instanceof ConversionError;
    process.stderr.write(JSON.stringify({ status: known ? error.status : 'failed', code: known ? error.code : 'conversion_input_or_io_error' }) + '\n');
    return known && error.status !== 'failed' ? 2 : 1;
  });
}

export { convert, ConversionError };
