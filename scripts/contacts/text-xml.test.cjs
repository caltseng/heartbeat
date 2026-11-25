const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { convert } = require('./text-xml.cjs');
const { collect } = require('./collect.cjs');

const SECRET = 'SYNTHETIC_CONTENT_MUST_NOT_SURVIVE';
const sms = (extra = '', date = '1795478400000') =>
  `<sms address="+12025550101" date="${date}" date_sent="0" type="1" sub_id="1" body="${SECRET} &amp; &#65;" ${extra}/>`;
const mms = `<mms date="1795478460000" date_sent="1795478459000" msg_box="1" m_type="132" sub_id="1" subject="${SECRET}">
  <parts><part ct="text/plain" text="${SECRET}"/><part ct="image/png" data="${SECRET}"/></parts>
  <addrs><addr address="+12025550101" type="137"/><addr address="+12025550100" type="151"/>
  <addr address="+12025550102" type="130"/><addr address="+12025550103" type="129"/></addrs></mms>`;
function fixture(records = [sms(), mms]) {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!-- File Created By SMS Backup & Restore v10.30.009 on synthetic fixture only -->
<smses count="${records.length}" backup_set="synthetic-set" backup_date="1795478500000">${records.join('\n')}</smses>`);
  const manifest = {
    schemaVersion: 1, dataClass: 'synthetic', profile: 'synctech-xml-metadata-v1',
    producerVersion: '10.30.009', androidVersion: '14', backupKind: 'full', account: 'fixture-account',
    archive: { ref: 'fixture-archive', sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
    period: { preset: '7d', timeZone: 'America/Los_Angeles', asOf: '2026-11-24T20:00:00Z' },
    retrievedAt: '2026-11-24T20:00:00.000Z',
    identities: ['self', 'peer-a', 'peer-b', 'peer-c'].map((id, i) =>
      ({ id, address: `+1202555010${i}`, isSelf: i === 0 })),
    selfBySubId: { 1: 'self' },
    threads: [{ id: 'direct', kind: 'direct', members: ['self', 'peer-a'] },
      { id: 'group', kind: 'group', members: ['self', 'peer-a', 'peer-b', 'peer-c'] }],
    rows: records.map((record, i) => ({ ordinal: i + 1, transport: record.startsWith('<mms') ? 'mms' : 'sms',
      threadId: record.startsWith('<mms') ? 'group' : 'direct' }))
  };
  return { bytes, manifest, run() { return convert(this.bytes, this.manifest); } };
}
function changed(f, transform) {
  f.bytes = Buffer.from(transform(f.bytes.toString()));
  f.manifest.archive.sha256 = crypto.createHash('sha256').update(f.bytes).digest('hex');
  return f;
}
function temporary(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-text-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
function rejects(f, code, status) {
  assert.throws(() => f.run(), error => error.code === code && (!status || error.status === status));
}

test('direct SMS and four-person MMS retain one sender/event, all roles, original milliseconds and metadata only', () => {
  const f = fixture();
  const handoff = f.run(), page = handoff.pages[0];
  assert.equal(page.events.length, 2);
  assert.deepEqual(page.events[0], {
    id: 'fixture-archive:record:1', idKind: 'local', eventType: 'message', threadId: 'fixture-archive:thread:direct',
    senderId: 'peer-a', timestamp: '2026-11-24T00:00:00.000Z', channel: 'sms',
    recipients: [{ identityId: 'self', role: 'recipient' }], classification: 'unclassified'
  });
  assert.equal(page.events[1].timestamp, '2026-11-24T00:01:00.000Z');
  assert.equal(page.events[1].senderId, 'peer-a');
  assert.deepEqual(page.events[1].recipients, [
    { identityId: 'self', role: 'to' }, { identityId: 'peer-b', role: 'cc' }, { identityId: 'peer-c', role: 'bcc' }
  ]);
  assert.equal(page.memberships.filter(row => row.threadId.endsWith(':group')).length, 4);
  assert.equal(page.threads[1].kind, 'group');
  assert.deepEqual(handoff.coverage.start, null);
  assert.equal(handoff.coverage.completeness, 'unknown');
  assert.ok(!JSON.stringify(handoff).includes(SECRET));
  assert.ok(!JSON.stringify(handoff).includes('date_sent'));
});

test('outgoing SMS and MMS resolve self only from reviewed SIM mapping and preserve recipients', () => {
  const f = fixture([sms().replace('type="1"', 'type="2"'),
    mms.replace('msg_box="1" m_type="132"', 'msg_box="2" m_type="128"')
      .replace('+12025550101" type="137"', 'insert-address-token" type="137"')
      .replace('+12025550100" type="151"', '+12025550101" type="151"')]);
  const events = f.run().pages[0].events;
  assert.ok(events.every(event => event.senderId === 'self'));
  assert.equal(events[0].recipients[0].identityId, 'peer-a');
  assert.deepEqual(events[1].recipients.map(row => row.role), ['to', 'cc', 'bcc']);
});

test('DST-fold instants, missing vendor IDs and duplicate-looking rows remain distinct and unchanged across zones', () => {
  const f = fixture([sms('readable_date="ambiguous 01:30"', String(Date.parse('2026-11-01T08:30:00Z'))),
    sms('', String(Date.parse('2026-11-01T09:30:00Z'))), sms('', String(Date.parse('2026-11-01T09:30:00Z')))]);
  const first = f.run().pages[0].events;
  assert.deepEqual(first.map(row => row.timestamp), ['2026-11-01T08:30:00.000Z', '2026-11-01T09:30:00.000Z', '2026-11-01T09:30:00.000Z']);
  assert.equal(new Set(first.map(row => row.id)).size, 3);
  f.manifest.period.timeZone = 'Asia/Tokyo';
  assert.deepEqual(f.run().pages[0].events, first);
  rejects(fixture([sms().replace('1795478400000', '2026-11-01 01:30')]), 'invalid_epoch_milliseconds');
  rejects(fixture([sms().replace('1795478400000', '999999999999999999')]), 'invalid_epoch_milliseconds');
  rejects(fixture([sms().replace('1795478400000', '1895478400000')]), 'invalid_epoch_milliseconds');
});

test('unverified self/addresses are visibly omitted; missing thread evidence yields isolated unknown, never direct', () => {
  const f = fixture();
  f.manifest.selfBySubId = {};
  const unavailable = f.run();
  assert.equal(unavailable.pages[0].events.length, 0);
  assert.deepEqual(unavailable.errors.map(row => row.code), ['row_1_unverified_self', 'row_2_unverified_self']);
  f.manifest.selfBySubId = { 1: 'self' };
  delete f.manifest.rows[0].threadId;
  const page = f.run().pages[0];
  assert.equal(page.threads[0].kind, 'unknown');
  assert.equal(page.threads[0].id, 'fixture-archive:unknown:1');
  assert.equal(page.events[0].threadId, page.threads[0].id);
  f.manifest.identities.pop();
  f.manifest.threads[1].members.pop();
  const unresolved = f.run();
  assert.equal(unresolved.pages[0].events.length, 1);
  assert.ok(unresolved.errors.some(row => row.code === 'row_2_unresolved_addresses'));
});

test('ambiguous direction, roles, protocol, layout and producer fail visibly without payload diagnostics', () => {
  for (const [f, code] of [
    [fixture([sms().replace('type="1"', 'type="9"')]), 'ambiguous_direction'],
    [fixture([mms.replace('m_type="132"', 'm_type="128"')]), 'contradictory_mms_direction'],
    [fixture([mms.replace('type="129"', 'type="999"')]), 'unknown_address_role'],
    [fixture([mms.replace('type="151"', 'type="137"')]), 'ambiguous_sender'],
    [fixture([sms('s_chat="true"')]), 'unsupported_rcs_or_restricted'],
    [fixture([sms('restricted="1"')]), 'unsupported_rcs_or_restricted'],
    [changed(fixture(), xml => xml.replace('10.30.009', '10.30.010')), 'unsupported_producer'],
    [changed(fixture(), xml => xml.replace('File Created By ', 'Unverified ')), 'unsupported_producer'],
    [changed(fixture(), xml => xml.replace('<smses ', '<smses xmlns="urn:other" ')), 'unsupported_backup_layout'],
    [changed(fixture(), xml => xml.replace('<smses ', '<smses type="incremental" ')), 'unsupported_backup_layout'],
    [changed(fixture(), xml => xml.replace('count="2"', 'count="3"')), 'xml_count_mismatch'],
    [changed(fixture(), xml => xml.replace('<parts>', '<unknown>').replace('</parts>', '</unknown>')), 'unsupported_xml_layout']
  ]) rejects(f, code);
  const f = fixture();
  f.manifest.rows = [];
  rejects(f, 'unverified_transport', 'requires_setup');
  f.manifest.rows = [{ ordinal: 1, transport: 'rcs' }];
  rejects(f, 'unsupported_transport', 'unsupported');
  f.manifest.dataClass = 'private';
  rejects(f, 'private_collection_disabled', 'failed');
});

test('malformed XML, entities, DTDs, instructions, duplicate attributes and invalid UTF-8 cannot be imported', () => {
  const quoted = changed(fixture(), xml => xml.replace('<?xml version="1.0" encoding="UTF-8"?>',
    "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>").replace('<smses ', "<smses type='full' "));
  assert.equal(quoted.run().pages[0].events.length, 2);
  for (const [from, to, code] of [
    ['</smses>', '', 'invalid_xml'],
    ['</smses>', '</smses><smses/>', 'invalid_xml'],
    ['body="', 'body="&external;', 'invalid_xml_entity'],
    ['body="', 'body="&#0;', 'invalid_xml'],
    ['body="', 'body="<', 'invalid_xml'],
    ['<sms address=', '<sms type="1" address=', 'invalid_xml'],
    ['<smses ', '<!DOCTYPE smses SYSTEM "file:///synthetic-secret"><smses ', 'unsupported_xml_construct'],
    ['<smses ', '<?xml-stylesheet href="https://invalid.example/"?><smses ', 'unsupported_xml_construct']
  ]) rejects(changed(fixture(), xml => xml.replace(from, to)), code);
  const f = fixture();
  f.bytes = Buffer.concat([f.bytes, Buffer.from([0xFF])]);
  f.manifest.archive.sha256 = crypto.createHash('sha256').update(f.bytes).digest('hex');
  rejects(f, 'invalid_utf8');
  f.bytes = Buffer.alloc(32 * 1024 * 1024 + 1, 32);
  f.manifest.archive.sha256 = crypto.createHash('sha256').update(f.bytes).digest('hex');
  rejects(f, 'xml_size_limit', 'unsupported');
});

test('excluded non-message rows keep document ordinals and empty archives never imply complete history', () => {
  const f = fixture([sms().replace('type="1"', 'type="3"'), mms.replace('m_type="132"', 'm_type="134"'), sms()]);
  const handoff = f.run();
  assert.equal(handoff.pages[0].events[0].id, 'fixture-archive:record:3');
  assert.equal(handoff.errors[0].code, 'non_message_rows_excluded');
  const empty = fixture([]).run();
  assert.equal(empty.pages[0].events.length, 0);
  assert.equal(empty.coverage.completeness, 'unknown');
});

test('imported archive replay is idempotent and changed exports or ledgers cannot overlap even under another connector', t => {
  const folder = temporary(t), f = fixture();
  let handoff = f.run();
  const request = { schemaVersion: 1, dataClass: 'synthetic', period: f.manifest.period, output: folder,
    sources: [{ source: handoff.source, account: handoff.account, connector: handoff.connector, mode: 'metadata-import', input: 'text.json' }] };
  const run = () => {
    fs.writeFileSync(path.join(folder, 'text.json'), JSON.stringify(handoff));
    return collect(request, folder);
  };
  assert.equal(run().exitCode, 2);
  assert.equal(run().exitCode, 2);
  const state = () => JSON.parse(fs.readFileSync(path.join(folder, 'collection.json')));
  const events = () => Object.values(state().records).filter(row => row.record.type === 'event');
  assert.equal(events().length, 2);
  assert.ok(!JSON.stringify(state()).includes(SECRET));
  f.manifest.period.timeZone = 'Asia/Tokyo';
  handoff = f.run();
  assert.equal(run().manifest.sources[0].status, 'partial');
  assert.equal(events().length, 2);
  changed(f, xml => xml + '\n');
  handoff = f.run();
  assert.equal(run().manifest.sources[0].error.code, 'text_archive_conflict');
  assert.equal(events().length, 2);
  handoff = fixture().run();
  handoff.textArchive.ledgerDigest = 'a'.repeat(64);
  assert.equal(run().manifest.sources[0].error.code, 'text_archive_conflict');
  delete handoff.textArchive;
  handoff.connector = request.sources[0].connector = 'another-connector';
  assert.equal(run().manifest.sources[0].error.code, 'text_archive_conflict');
});

test('failed first page does not reserve archive, and existing unbound text events block conversion', t => {
  const folder = temporary(t), f = fixture();
  const handoff = f.run();
  const request = { schemaVersion: 1, dataClass: 'synthetic', period: f.manifest.period, output: folder,
    sources: [{ source: handoff.source, account: handoff.account, connector: handoff.connector, mode: 'metadata-import', input: 'text.json' }] };
  const run = () => {
    fs.writeFileSync(path.join(folder, 'text.json'), JSON.stringify(handoff));
    return collect(request, folder);
  };
  handoff.pages[0].events[0].body = SECRET;
  assert.equal(run().manifest.sources[0].status, 'failed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'collection.json'))).textArchives, undefined);
  delete handoff.pages[0].events[0].body;
  const binding = handoff.textArchive;
  delete handoff.textArchive;
  handoff.connector = request.sources[0].connector = 'legacy-handoff';
  assert.equal(run().manifest.sources[0].status, 'partial');
  handoff.textArchive = binding;
  handoff.connector = request.sources[0].connector = binding.profile;
  assert.equal(run().manifest.sources[0].error.code, 'text_archive_conflict');
});

test('CLI writes only private metadata bundle, reports partial, imports/replays, and never leaks failing input', t => {
  const folder = temporary(t), f = fixture();
  const xml = path.join(folder, 'fixture.xml'), manifest = path.join(folder, 'manifest.json'), output = path.join(folder, 'bundle');
  fs.writeFileSync(xml, f.bytes);
  fs.writeFileSync(manifest, JSON.stringify(f.manifest));
  const cli = path.join(__dirname, 'text-xml.cjs');
  const args = [cli, '--xml', xml, '--manifest', manifest, '--output', output];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'partial');
  const request = JSON.parse(fs.readFileSync(path.join(output, 'request.synthetic.json')));
  assert.equal(collect(request, output).manifest.sources[0].status, 'partial');
  assert.ok(!fs.readFileSync(path.join(output, 'text.synthetic.json'), 'utf8').includes(SECRET));
  assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 1);
  const unsafe = [...args.slice(0, -1), path.join(__dirname, 'unsafe-synthetic-output')];
  assert.equal(spawnSync(process.execPath, unsafe, { encoding: 'utf8' }).status, 1);
  assert.ok(!fs.existsSync(unsafe[unsafe.length - 1]));
  f.manifest.profile = SECRET;
  fs.writeFileSync(manifest, JSON.stringify(f.manifest));
  const failure = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(failure.status, 2);
  assert.equal(JSON.parse(failure.stderr).status, 'unsupported');
  assert.ok(!failure.stderr.includes(SECRET));
});

test('CLI rejects a private manifest before even inspecting the raw XML path', t => {
  const folder = temporary(t), f = fixture();
  f.manifest.dataClass = 'private';
  const manifest = path.join(folder, 'private-manifest.json'), output = path.join(folder, 'must-not-exist');
  fs.writeFileSync(manifest, JSON.stringify(f.manifest));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'text-xml.cjs'),
    '--xml', path.join(folder, 'nonexistent.xml'), '--manifest', manifest, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), { status: 'failed', code: 'private_collection_disabled' });
  assert.equal(result.stdout, '');
  assert.ok(!fs.existsSync(output));
});
