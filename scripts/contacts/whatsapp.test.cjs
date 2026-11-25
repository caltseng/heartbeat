const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readCollection } = require('./collection-store.cjs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { convert } = require('./whatsapp.cjs');
const { collect } = require('./collect.cjs');

const SECRET = 'SYNTHETIC_BODY_MUST_NOT_SURVIVE';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(text = `[24/11/2026, 12:00:00] Peer: A: ${SECRET}\n`) {
  const bytes = Buffer.from(text);
  const manifest = {
    schemaVersion: 1, dataClass: 'synthetic', profile: 'whatsapp-ios-txt-metadata-v1',
    producer: { platform: 'ios', appVersion: 'synthetic', osVersion: 'synthetic',
      locale: 'day-first-24h-seconds', exportOption: 'without-media', deviceRole: 'primary-phone' },
    account: 'fixture-account', archive: { ref: 'archive-one', sha256: hash(bytes) }, ledgerRevision: 'review-one',
    period: { preset: '7d', timeZone: 'America/Los_Angeles', asOf: '2026-11-24T21:00:00Z' },
    retrievedAt: '2026-11-24T21:00:00.000Z',
    identities: [{ id: 'self', isSelf: true }, { id: 'peer-a', isSelf: false }],
    thread: { id: 'chat-one', kind: 'direct', members: ['self', 'peer-a'], membershipEvidenceRef: 'roster-review' },
    timeEvidence: { zone: 'America/Los_Angeles', evidenceRef: 'source-zone-review', clockVerified: true },
    rows: text === '' ? [] : [{ startLine: 1, endLine: 1, kind: 'message', senderId: 'peer-a',
      senderLabel: 'Peer: A', wallTime: '24/11/2026, 12:00:00' }]
  };
  return { bytes, manifest, run(registry) { return convert(this.bytes, this.manifest, registry).handoff; } };
}
function changed(f, text) {
  f.bytes = Buffer.isBuffer(text) ? text : Buffer.from(text);
  f.manifest.archive.sha256 = hash(f.bytes);
  return f;
}
function binding(f) {
  const { handoff, audit } = convert(f.bytes, f.manifest);
  return structuredClone({ account: f.manifest.account, binding: handoff.whatsappArchive, audit });
}
function temporary(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-whatsapp-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
function rejects(f, code, registry) {
  assert.throws(() => f.run(registry), error => error.code === code);
}
function cli(folder, f, output = path.join(folder, 'output')) {
  const txt = path.join(folder, 'fixture.txt'), manifest = path.join(folder, 'manifest.json');
  fs.writeFileSync(txt, f.bytes);
  fs.writeFileSync(manifest, JSON.stringify(f.manifest));
  return spawnSync(process.execPath, [path.join(__dirname, 'whatsapp.cjs'),
    '--txt', txt, '--manifest', manifest, '--output', output], { encoding: 'utf8' });
}
function importer(folder, f) {
  let handoff = f.run();
  const request = { schemaVersion: 1, dataClass: 'synthetic', period: f.manifest.period, output: folder,
    sources: [{ source: 'whatsapp', account: handoff.account, connector: handoff.connector,
      mode: 'metadata-import', input: 'handoff.json' }] };
  return {
    request,
    set(value) { handoff = value; },
    run() {
      fs.writeFileSync(path.join(folder, 'handoff.json'), JSON.stringify(handoff));
      return collect(request, folder);
    },
    state() { return readCollection(path.join(folder, 'collection.json')).value; }
  };
}

test('direct snapshot uses explicit local identities, colon-bearing sender and original zone; bodies never enter metadata', () => {
  const f = fixture();
  const handoff = f.run(), page = handoff.pages[0];
  assert.deepEqual(page.events, [{ id: 'archive-one:record:1', idKind: 'local', eventType: 'message',
    threadId: 'chat-one', senderId: 'peer-a', timestamp: '2026-11-24T20:00:00.000Z',
    channel: 'whatsapp', recipients: [], classification: 'unclassified' }]);
  assert.equal(page.threads[0].kind, 'direct');
  assert.ok(page.identities.every(row => row.idKind === 'local'));
  assert.equal(handoff.coverage.completeness, 'unknown');
  assert.equal(handoff.coverage.start, null);
  assert.equal(handoff.coverage.end, null);
  assert.match(handoff.coverage.basis, /lower bounds/);
  assert.ok(!JSON.stringify(handoff).includes(SECRET));
  assert.ok(!JSON.stringify(handoff).includes('Peer: A'));
  f.manifest.period.timeZone = 'Asia/Tokyo';
  assert.deepEqual(f.run(), handoff);
});

test('four-person group and identical-looking rows retain distinct ordinals with no pairwise recipients', () => {
  const line = `[24/11/2026, 12:00:00] Peer: A: ${SECRET}\n`;
  const f = fixture(line + line);
  f.manifest.identities.push({ id: 'peer-b', isSelf: false }, { id: 'peer-c', isSelf: false });
  f.manifest.thread.kind = 'group';
  f.manifest.thread.members.push('peer-b', 'peer-c');
  f.manifest.rows.push({ ...f.manifest.rows[0], startLine: 2, endLine: 2 });
  const page = f.run().pages[0];
  assert.equal(page.threads[0].kind, 'group');
  assert.equal(page.memberships.length, 4);
  assert.equal(page.events.length, 2);
  assert.equal(new Set(page.events.map(row => row.id)).size, 2);
  assert.ok(page.events.every(row => row.recipients.length === 0 && row.senderId === 'peer-a'));
});

test('reviewed multiline header lookalikes, BOM, LRM and CRLF do not manufacture events', () => {
  const f = fixture(`${String.fromCodePoint(0xfeff)}\u200E[24/11/2026, 12:00:00] Peer: A: ${SECRET}\r\n` +
    `${SECRET}\r\n[24/11/2026, 12:01:00] Lookalike: ${SECRET}\r\n`);
  rejects(f, 'unreviewed_record_boundaries');
  f.manifest.rows[0].endLine = 3;
  assert.equal(f.run().pages[0].events.length, 1);
  const registry = [binding(f)];
  f.manifest.rows.push({ ...f.manifest.rows[0], startLine: 3, endLine: 3,
    senderLabel: 'Lookalike', wallTime: '24/11/2026, 12:01:00' });
  f.manifest.rows[0].endLine = 2;
  rejects(f, 'whatsapp_archive_conflict', registry);
});

test('DST folds need reviewed offsets, gaps and unverifiable travel/clock/zone evidence fail closed', () => {
  const f = fixture('[1/11/2026, 01:30:00] Peer: A: synthetic\n');
  f.manifest.rows[0].wallTime = '1/11/2026, 01:30:00';
  rejects(f, 'unresolved_source_time');
  f.manifest.rows[0].offset = '-07:00';
  assert.equal(f.run().pages[0].events[0].timestamp, '2026-11-01T08:30:00.000Z');
  f.manifest.rows[0].offset = '-08:00';
  assert.equal(f.run().pages[0].events[0].timestamp, '2026-11-01T09:30:00.000Z');
  f.manifest.rows[0].offset = '-06:00';
  rejects(f, 'unresolved_source_time');
  const gap = fixture('[8/3/2026, 02:30:00] Peer: A: synthetic\n');
  gap.manifest.rows[0].wallTime = '8/3/2026, 02:30:00';
  rejects(gap, 'unresolved_source_time');
  const travel = fixture();
  travel.manifest.timeEvidence.clockVerified = false;
  rejects(travel, 'unverified_clock');
  travel.manifest.rows[0].timeEvidence = { zone: 'Asia/Tokyo', evidenceRef: 'travel-review', clockVerified: true };
  assert.equal(travel.run().pages[0].events[0].timestamp, '2026-11-24T03:00:00.000Z');
  travel.manifest.rows[0].timeEvidence.zone = '';
  rejects(travel, 'missing_source_zone');
  travel.manifest.rows[0].timeEvidence.zone = 'invalid/zone';
  rejects(travel, 'unsupported_source_zone');
});

test('unsupported layouts, invalid dates/UTF-8, future records and unreviewed boundaries fail visibly', () => {
  for (const [text, code] of [
    ['orphan text\n', 'unreviewed_record_boundaries'],
    ['24/11/2026, 12:00 - Peer: synthetic\n', 'unsupported_txt_layout'],
    ['[24/11/26, 12:00:00] Peer: synthetic\n', 'unsupported_txt_layout'],
    ['[24/11/2026, 12:00] Peer: synthetic\n', 'unsupported_txt_layout'],
    ['[24/11/2026, 01:00:00 PM] Peer: synthetic\n', 'unsupported_txt_layout'],
    ['\u200F[24/11/2026, 12:00:00] Peer: synthetic\n', 'unsupported_txt_layout'],
    [`${String.fromCodePoint(0xfeff).repeat(2)}[24/11/2026, 12:00:00] Peer: synthetic\n`, 'unsupported_txt_layout'],
    ['[31/2/2026, 12:00:00] Peer: synthetic\n', 'invalid_calendar_time'],
    ['[24/11/2026, 24:00:00] Peer: synthetic\n', 'invalid_calendar_time'],
    ['[24/11/2026, 12:00:00] Peer: A: synthetic\n[bad\n', 'unreviewed_record_boundaries']
  ]) rejects(fixture(text), code);
  rejects(changed(fixture(), Buffer.from([0xFF])), 'invalid_utf8');
  const f = fixture();
  f.manifest.rows[0].timeEvidence = { zone: 'Pacific/Honolulu', evidenceRef: 'zone', clockVerified: true };
  rejects(f, 'future_event');
  f.manifest.dataClass = 'private';
  rejects(f, 'private_collection_disabled');
});

test('missing IDs, self, membership, producer and sender evidence never infer identities from names or You', () => {
  const cases = [
    [f => { delete f.manifest.archive.ref; }, 'invalid_local_id'],
    [f => { f.manifest.identities[0].isSelf = false; }, 'unverified_self'],
    [f => { f.manifest.identities[1].isSelf = true; }, 'unverified_self'],
    [f => { f.manifest.thread.members = ['peer-a']; }, 'unverified_membership'],
    [f => { f.manifest.producer.deviceRole = 'linked-device'; }, 'unverified_producer'],
    [f => { f.manifest.rows[0].senderId = 'You'; }, 'unresolved_sender'],
    [f => { f.manifest.rows[0].senderLabel = 'Unknown'; }, 'unresolved_sender'],
    [f => { delete f.manifest.timeEvidence; }, 'missing_time_evidence'],
    [f => { f.manifest.rows[0].kind = 'ambiguous'; }, 'ambiguous_record_type']
  ];
  for (const [change, code] of cases) { const f = fixture(); change(f); rejects(f, code); }
});

test('all excluded types preserve logical ordinals; zero accepted records and empty inputs remain unknown', () => {
  const f = fixture(Array.from({ length: 6 }, () => '[24/11/2026, 12:00:00] Peer: A: synthetic\n').join(''));
  f.manifest.rows = ['system', 'call', 'deletion', 'reaction', 'media', 'message'].map((kind, i) =>
    ({ ...f.manifest.rows[0], startLine: i + 1, endLine: i + 1, kind }));
  const handoff = f.run();
  assert.equal(handoff.pages[0].events[0].id, 'archive-one:record:6');
  assert.equal(handoff.errors[0].code, 'non_message_rows_excluded');
  f.manifest.rows[5].kind = 'system';
  assert.equal(f.run().pages[0].events.length, 0);
  const empty = fixture('').run();
  assert.equal(empty.pages[0].events.length, 0);
  assert.equal(empty.coverage.completeness, 'unknown');
});

test('registry permits only exact bytes/ledger replay per account/thread and distinct verified chats', () => {
  const f = fixture(), registry = [binding(f)];
  assert.deepEqual(f.run(registry), f.run());
  changed(f, f.bytes.toString().replace(/\n/g, '\r\n'));
  rejects(f, 'whatsapp_archive_conflict', registry);
  const edited = fixture();
  edited.manifest.ledgerRevision = 'review-two';
  rejects(edited, 'whatsapp_archive_conflict', registry);
  const reexport = fixture();
  reexport.manifest.archive.ref = 'new-archive';
  rejects(reexport, 'whatsapp_archive_conflict', registry);
  const different = fixture();
  different.manifest.thread.id = 'chat-two';
  rejects(different, 'whatsapp_archive_conflict', registry);
  changed(different, different.bytes.toString() + '\n');
  different.manifest.rows[0].endLine = 2;
  different.manifest.archive.ref = 'archive-two';
  assert.equal(different.run(registry).pages[0].threads[0].id, 'chat-two');
});

test('shared importer replays idempotently, preserves unknown history and prevents overlapping/alternate-connector bypass', t => {
  const folder = temporary(t), f = fixture(), importerState = importer(folder, f);
  assert.equal(importerState.run().exitCode, 2);
  assert.equal(importerState.run().manifest.sources[0].status, 'partial');
  const events = () => Object.values(importerState.state().records).filter(row => row.record.type === 'event');
  assert.equal(events().length, 1);
  const reexport = fixture();
  reexport.manifest.archive.ref = 'another-archive';
  importerState.set(reexport.run());
  assert.equal(importerState.run().manifest.sources[0].error.code, 'snapshot_conflict');
  const unbound = f.run();
  delete unbound.whatsappArchive;
  unbound.connector = importerState.request.sources[0].connector = 'other-connector';
  importerState.set(unbound);
  assert.equal(importerState.run().manifest.sources[0].error.code, 'snapshot_conflict');
  assert.equal(events().length, 1);
  assert.ok(!JSON.stringify(importerState.state()).includes(SECRET));
});

test('failed pages do not reserve importer bindings; pre-existing unbound history blocks native binding', t => {
  const folder = temporary(t), f = fixture(), state = importer(folder, f);
  const invalid = f.run();
  invalid.pages[0].events[0].body = SECRET;
  delete invalid.whatsappArchive;
  invalid.whatsappArchive = { ...f.run().whatsappArchive, metadataDigest: hash(JSON.stringify(invalid)) };
  state.set(invalid);
  assert.equal(state.run().manifest.sources[0].status, 'failed');
  assert.equal(state.state().whatsappArchives, undefined);
  const unbound = f.run();
  delete unbound.whatsappArchive;
  unbound.connector = state.request.sources[0].connector = 'legacy';
  state.set(unbound);
  assert.equal(state.run().manifest.sources[0].status, 'partial');
  state.request.sources[0].connector = f.run().connector;
  state.set(f.run());
  assert.equal(state.run().manifest.sources[0].error.code, 'snapshot_conflict');
  assert.equal(state.state().whatsappArchives, undefined);
});

test('CLI persists immutable snapshot/registry, replays safely and outputs sanitized partial/unsupported/failed exits', t => {
  const folder = temporary(t), f = fixture();
  let result = cli(folder, f);
  assert.equal(result.status, 2, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { status: 'partial', code: 'snapshot_unknown_history', live: false });
  const output = path.join(folder, 'output');
  const registry = fs.readFileSync(path.join(output, 'whatsapp-registry.synthetic.json'), 'utf8');
  assert.ok(!registry.includes(SECRET));
  assert.deepEqual(JSON.parse(registry)[0].audit.resolutions[0], {
    ordinal: 1, wallTime: '24/11/2026, 12:00:00', zone: 'America/Los_Angeles',
    evidenceRef: 'source-zone-review', offsetSeconds: -28800, timestamp: '2026-11-24T20:00:00.000Z'
  });
  result = cli(folder, f);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(fs.readFileSync(path.join(output, 'whatsapp-registry.synthetic.json'), 'utf8'), registry);
  const bundle = fs.readdirSync(output).find(name => fs.statSync(path.join(output, name)).isDirectory());
  const collectResult = spawnSync(process.execPath, [path.join(__dirname, 'collect.cjs'),
    '--request', path.join(output, bundle, 'request.synthetic.json')], { encoding: 'utf8' });
  assert.equal(collectResult.status, 2, collectResult.stderr);
  assert.equal(JSON.parse(collectResult.stdout).sources[0].status, 'partial');
  changed(f, f.bytes.toString().replace(SECRET, 'changed synthetic body'));
  result = cli(folder, f);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).code, 'whatsapp_archive_conflict');
  assert.equal(fs.readFileSync(path.join(output, 'whatsapp-registry.synthetic.json'), 'utf8'), registry);
  assert.ok(!result.stderr.includes('changed synthetic body'));
  fs.writeFileSync(path.join(output, 'whatsapp-conversion.lock'), 'synthetic lock');
  result = cli(folder, fixture());
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'conversion_locked');
});

test('private CLI denial precedes native stat/read, registry and output resolution without disclosing account/paths', t => {
  const folder = temporary(t), file = path.join(folder, 'private.json');
  fs.writeFileSync(file, JSON.stringify({ dataClass: 'private', account: 'PRIVATE_ACCOUNT_MUST_NOT_LEAK' }));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'whatsapp.cjs'), '--txt', 'NONEXISTENT_PRIVATE_FILE',
    '--manifest', file, '--output', __dirname], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), { status: 'failed', code: 'private_collection_disabled' });
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes('PRIVATE_ACCOUNT'));
  assert.ok(!result.stderr.includes('NONEXISTENT'));
  assert.deepEqual(fs.readdirSync(folder), ['private.json']);
});

test('interrupted artifact publication retains reservation, blocks different bytes, and exact replay completes', t => {
  const folder = temporary(t), f = fixture(), output = path.join(folder, 'output');
  const bundle = path.join(output, `acquisition-${hash(JSON.stringify([f.manifest.account, f.manifest.archive.ref]))}`);
  fs.mkdirSync(bundle, { recursive: true });
  const target = path.join(bundle, 'whatsapp.synthetic.json');
  fs.writeFileSync(target, 'synthetic conflicting output');
  const result = cli(folder, f);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'output_conflict');
  assert.ok(fs.existsSync(path.join(output, 'whatsapp-registry.synthetic.json')));
  const other = fixture();
  changed(other, other.bytes.toString().replace(SECRET, 'different synthetic data'));
  assert.equal(JSON.parse(cli(folder, other).stderr).code, 'whatsapp_archive_conflict');
  fs.unlinkSync(target);
  assert.equal(cli(folder, f).status, 2);
  assert.ok(fs.existsSync(path.join(bundle, 'request.synthetic.json')));
  assert.ok(!fs.existsSync(path.join(output, 'whatsapp-conversion.lock')));
});

test('partial artifact writes cannot expose a truncated final file or prevent exact replay', t => {
  const folder = temporary(t), f = fixture();
  const txt = path.join(folder, 'fixture.txt'), manifest = path.join(folder, 'manifest.json'), output = path.join(folder, 'output');
  fs.writeFileSync(txt, f.bytes);
  fs.writeFileSync(manifest, JSON.stringify(f.manifest));
  const script = `
    const fs = require('node:fs');
    const open = fs.openSync, write = fs.writeFileSync;
    let artifact;
    fs.openSync = function(file, ...args) {
      const fd = open.call(this, file, ...args);
      if (String(file).includes('whatsapp.synthetic.json.') && String(file).endsWith('.tmp')) artifact = fd;
      return fd;
    };
    fs.writeFileSync = function(file, value, ...args) {
      if (file === artifact && artifact !== undefined) {
        write.call(this, file, String(value).slice(0, 10), ...args);
        throw Object.assign(new Error('synthetic interrupted write'), { code: 'EIO' });
      }
      return write.call(this, file, value, ...args);
    };
    process.argv = [process.execPath, process.argv[1], '--txt', process.argv[2],
      '--manifest', process.argv[3], '--output', process.argv[4]];
    require('node:module').runMain();
  `;
  const result = spawnSync(process.execPath, ['-e', script, path.join(__dirname, 'whatsapp.cjs'),
    txt, manifest, output], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stderr).code, 'conversion_input_or_io_error');
  const bundle = fs.readdirSync(output).find(name => name.startsWith('acquisition-'));
  assert.deepEqual(fs.readdirSync(path.join(output, bundle)), []);
  assert.equal(cli(folder, f).status, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, bundle, 'whatsapp.synthetic.json'))).source, 'whatsapp');
});
