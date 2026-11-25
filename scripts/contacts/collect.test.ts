import type { Checkpoint, RecordEntry, CollectionRequest } from './types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { collect, resolvePeriod, outputLocation } from './collect.ts';
import { handoff, writeDemo, period } from './demo.ts';

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'contacts-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const input = handoff('email', 'email');
  const request: CollectionRequest = { schemaVersion: 1, dataClass: 'synthetic', period, output: path.join(folder, 'store'),
    sources: [{ source: 'email', account: input.account, connector: input.connector, mode: 'metadata-import', input: 'input.json' }] };
  function write() { fs.writeFileSync(path.join(folder, 'input.json'), JSON.stringify(input)); }
  function run() { write(); return collect(request, folder); }
  function state() { return JSON.parse(fs.readFileSync(path.join(request.output, 'collection.json'), 'utf8')); }
  return { folder, input, request, write, run, state };
}
const events = state => Object.values<RecordEntry>(state.records).filter(value => value.record.type === 'event');

for (const [source, channel, connector] of [
  ['text-messages', 'sms', 'synctech-xml-metadata-v1'],
  ['messenger', 'messenger', 'messenger-json-snapshot-v1']
]) {
  test(`${source} shares snapshot replay, overlap, namespace and rollback enforcement`, t => {
    const f = fixture(t);
    const make = digest => {
      let input = handoff(source, channel);
      input.connector = connector;
      if (source === 'text-messages') {
        input.textArchive = { profile: connector, archiveRef: 'fixture-archive', sha256: digest, ledgerDigest: 'c'.repeat(64) };
      } else {
        const ids = new Map(['self', 'person-a', 'thread-1', 'message-1'].map((id, index) =>
          [id, `${connector}:${digest}:${String(index).padStart(64, '0')}`]));
        input = JSON.parse(JSON.stringify(input, (field, value) => ids.get(value) || value));
      }
      return input;
    };
    const run = input => {
      Object.assign(f.request.sources[0], { source, account: input.account, connector: input.connector });
      fs.writeFileSync(path.join(f.folder, 'input.json'), JSON.stringify(input));
      return collect(f.request, f.folder).manifest.sources[0];
    };
    const first = make('a'.repeat(64));
    const invalid = structuredClone(first);
    Object.assign(invalid.pages[0].events[0], { body: 'Synthetic rejected content' });
    assert.equal(run(invalid).status, 'failed');
    assert.deepEqual(f.state().records, {});
    assert.deepEqual(f.state().checkpoints, {});
    assert.equal(f.state().textArchives, undefined);
    assert.equal(run(first).status, 'collected');
    assert.equal(run(first).status, 'collected');
    assert.equal(events(f.state()).length, 1);
    const before = f.state();
    const rejected = [
      make('b'.repeat(64)),
      { ...first, connector: 'alternate-route', textArchive: undefined },
      source === 'text-messages' ? { ...first, textArchive: undefined } :
        { ...first, pages: [{ ...first.pages[0], events: [{ ...first.pages[0].events[0], id: 'unlabeled-event' }] }] }
    ];
    for (const input of rejected) {
      assert.equal(run(input).error.code, 'snapshot_conflict');
      assert.deepEqual(f.state().records, before.records);
      assert.deepEqual(f.state().checkpoints, before.checkpoints);
      assert.deepEqual(f.state().textArchives, before.textArchives);
    }
    assert.equal(run({ ...make('b'.repeat(64)), account: 'different-fixture-account' }).status, 'collected');
    assert.equal(events(f.state()).length, 2);
  });
}

test('email gate payload preserves messages, roles and classes without promoting terminal pages to complete history', t => {
  const f = fixture(t);
  f.input = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'email-gate.synthetic.json'), 'utf8'));
  f.request.sources[0].account = f.input.account;
  f.request.sources[0].connector = f.input.connector;
  fs.writeFileSync(path.join(f.folder, 'input.json'), JSON.stringify(f.input));
  const run = () => collect(f.request, f.folder);
  const result = run();
  assert.equal(result.exitCode, 2);
  assert.equal(result.manifest.sources[0].paginationComplete, true);
  assert.equal(result.manifest.sources[0].coverage.completeness, 'partial');
  assert.equal(result.manifest.sources[0].observedOnly, true);
  let rows = events(f.state());
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => row.record.classification).sort(),
    ['automated', 'bulk', 'interpersonal', 'interpersonal', 'unclassified']);
  const group = rows.find(row => row.record.recipients.length === 2);
  assert.deepEqual(Object.fromEntries(group.record.recipients.map(recipient =>
    [f.state().records[recipient.identityKey].record.addresses[0].value, recipient.role])),
  { 'peer@example.invalid': 'to', 'other@example.invalid': 'cc' });
  assert.equal(f.state().records[group.record.threadKey].record.kind, 'group');
  const uncertain = rows.find(row => row.record.classification === 'unclassified');
  assert.equal(f.state().records[uncertain.record.threadKey].record.kind, 'unknown');
  assert.equal(run().exitCode, 2);
  rows = events(f.state());
  assert.equal(rows.length, 5);
});

test('email gate approval and unsupported-source gaps remain unavailable rather than empty success', t => {
  const f = fixture(t);
  for (const [status, reason] of [
    ['requires_setup', 'No separately authorized Gmail metadata route; CONTACTS-010 remains open.'],
    ['unsupported', 'Selected Gmail route cannot read a non-Gmail account.']
  ]) {
    f.request.sources = [{ source: 'email', account: 'synthetic-only', connector: 'none',
      mode: 'unavailable', status, reason }];
    const result = collect(f.request, f.folder);
    assert.equal(result.exitCode, 2);
    assert.equal(result.manifest.sources[0].status, status);
    assert.equal(result.manifest.sources[0].reason, reason);
    assert.equal(result.manifest.sources[0].coverage, null);
    assert.equal(events(f.state()).length, 0);
  }
});

test('private requests fail closed for every source before reading handoffs or creating output', t => {
  const f = fixture(t);
  f.request.dataClass = 'private';
  for (const source of ['google-contacts', 'email', 'text-messages', 'messenger', 'whatsapp']) {
    f.request.sources[0].source = source;
    f.request.sources[0].input = 'missing-private-input.json';
    assert.throws(() => collect(f.request, f.folder), { code: 'private_collection_disabled' });
    assert.equal(fs.existsSync(f.request.output), false);
  }
  f.request.sources = [{ source: 'email', account: 'fixture', connector: 'none',
    mode: 'unavailable', status: 'requires_setup', reason: 'No source approval.' }];
  assert.throws(() => collect(f.request, f.folder), { code: 'private_collection_disabled' });
  assert.equal(fs.existsSync(f.request.output), false);
});

test('private denial preserves existing snapshots and cannot be bypassed by request approval claims', t => {
  const f = fixture(t);
  f.run();
  const file = path.join(f.request.output, 'collection.json');
  const before = fs.readFileSync(file, 'utf8');
  f.request.dataClass = 'private';
  assert.throws(() => collect(f.request, f.folder), { code: 'private_collection_disabled' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(f.request.output, 'collection.lock')), false);
  Object.assign(f.request, { approved: true });
  assert.throws(() => collect(f.request, f.folder), /unsupported fields/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('CLI private denial exits 1 without publishing a manifest or account references', t => {
  const f = fixture(t);
  f.request.dataClass = 'private';
  const file = path.join(f.folder, 'request.json');
  fs.writeFileSync(file, JSON.stringify(f.request));
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'collect.ts'), '--request', file], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /\[private_collection_disabled\]/);
  assert.ok(!result.stderr.includes(f.request.sources[0].account));
  assert.ok(!result.stderr.includes(f.request.output));
  assert.equal(fs.existsSync(f.request.output), false);
});

test('a private-labeled handoff cannot import records through a synthetic request', t => {
  const f = fixture(t);
  f.input.dataClass = 'private';
  const result = f.run();
  assert.equal(result.exitCode, 2);
  assert.equal(result.manifest.sources[0].status, 'failed');
  assert.match(result.manifest.sources[0].error.message, /data class does not match/);
  assert.deepEqual(f.state().records, {});
  assert.deepEqual(f.state().checkpoints, {});
});

test('all five synthetic sources persist metadata, not inferred cross-source people; repeated imports are idempotent', t => {
  const f = fixture(t);
  const demo = writeDemo(path.join(f.folder, 'demo'));
  const result = collect(demo.request, demo.folder);
  assert.equal(result.exitCode, 0);
  const file = JSON.parse(fs.readFileSync(result.file, 'utf8'));
  assert.equal(events(file).length, 4);
  assert.equal(result.manifest.unresolvedIdentityKeys.length, 5);
  assert.equal(result.manifest.identityMappingRevision, null);
  assert.equal(result.manifest.sources[0].coverage.kind, 'identity-snapshot');
  collect(demo.request, demo.folder);
  assert.equal(events(JSON.parse(fs.readFileSync(result.file, 'utf8'))).length, 4);
  const replayed = JSON.parse(fs.readFileSync(result.file, 'utf8'));
  assert.equal(replayed.history.length, 1);
  assert.equal(replayed.history[0].status, 'collected');
  assert.equal(replayed.history[0].sources.length, 5);
});

test('overlapping connectors reuse reviewed source/account IDs and retain both provenance locators', t => {
  const f = fixture(t);
  assert.equal(f.run().exitCode, 0);
  f.input.connector = 'second-metadata-export';
  f.request.sources[0].connector = f.input.connector;
  assert.equal(f.run().exitCode, 0);
  const rows = events(f.state());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provenance.length, 2);
  assert.ok(rows[0].provenance.every(item => item.inputDigest.length === 64));
});

test('pagination resumes at persisted cursor and rejects a changed interval', t => {
  const f = fixture(t);
  const next = structuredClone(f.input.pages[0]);
  next.cursor = 'page-2';
  next.events[0].id = 'message-2';
  f.input.pages[0].nextCursor = 'page-2';
  f.input.pages.push(next);
  f.request.maxPages = 1;
  let result = f.run();
  assert.equal(result.exitCode, 2);
  assert.equal(result.manifest.sources[0].nextCursor, 'page-2');
  assert.equal(events(f.state()).length, 1);
  f.request.resume = true;
  result = f.run();
  assert.equal(result.exitCode, 0);
  assert.equal(events(f.state()).length, 2);
  f.request.period = { ...period, preset: '30d' };
  result = f.run();
  assert.equal(result.exitCode, 2);
  assert.equal(result.manifest.sources[0].error.code, 'checkpoint_mismatch');
});

test('failed page leaves the previous page and cursor intact, and a repaired page can resume', t => {
  const f = fixture(t);
  const next = structuredClone(f.input.pages[0]);
  next.cursor = 'page-2';
  next.events[0].id = 'message-2';
  Object.assign(next.events[0], { body: 'Synthetic body must never be persisted' });
  f.input.pages[0].nextCursor = 'page-2';
  f.input.pages.push(next);
  let result = f.run();
  assert.equal(result.manifest.sources[0].status, 'failed');
  assert.equal(events(f.state()).length, 1);
  assert.equal(Object.values<Checkpoint>(f.state().checkpoints)[0].nextCursor, 'page-2');
  assert.ok(!fs.readFileSync(result.file, 'utf8').includes('Synthetic body'));
  Reflect.deleteProperty(next.events[0], 'body');
  f.request.resume = true;
  result = f.run();
  assert.equal(result.exitCode, 0);
  assert.equal(events(f.state()).length, 2);
});

test('group membership and broadcast recipient roles do not manufacture pairwise observations', t => {
  const f = fixture(t);
  const page = f.input.pages[0];
  page.threads[0].kind = 'group';
  for (const id of ['person-b', 'person-c']) {
    page.identities.push({ id, idKind: 'local', isSelf: false });
    page.memberships.push({ threadId: 'thread-1', identityId: id });
  }
  page.events[0].recipients.push({ identityId: 'person-b', role: 'cc' }, { identityId: 'person-c', role: 'bcc' });
  assert.equal(f.run().exitCode, 0);
  assert.equal(events(f.state()).length, 1);
  assert.deepEqual(events(f.state())[0].record.recipients.map(item => item.role).sort(), ['bcc', 'cc', 'to']);
  page.threads[0].id = 'new-direct';
  page.threads[0].kind = 'direct';
  page.memberships.forEach(item => { item.threadId = 'new-direct'; });
  page.events[0].threadId = 'new-direct';
  page.events[0].id = 'invalid-direct';
  assert.equal(f.run().manifest.sources[0].status, 'failed');
  assert.equal(events(f.state()).length, 1);
});

test('source errors, unknown history, unavailable sources, and successful sources remain distinct', t => {
  const f = fixture(t);
  f.input.coverage.completeness = 'unknown';
  f.input.coverage.start = null;
  f.input.coverage.end = null;
  f.input.errors = [{ code: 'history_unavailable', retryable: false }];
  f.request.sources.push({ source: 'messenger', account: 'fixture-messenger', connector: 'none',
    mode: 'unavailable', status: 'requires_setup', reason: 'No verified personal-inbox tool configured.' });
  f.request.sources.push({ source: 'whatsapp', account: 'fixture-whatsapp', connector: 'none',
    mode: 'unavailable', status: 'unsupported', reason: 'Native archive parsing is not implemented.' });
  const contacts = handoff('google-contacts', null);
  fs.writeFileSync(path.join(f.folder, 'contacts.json'), JSON.stringify(contacts));
  f.request.sources.push({ source: contacts.source, account: contacts.account, connector: contacts.connector,
    mode: 'metadata-import', input: 'contacts.json' });
  const result = f.run();
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.manifest.sources.map(source => source.status), ['partial', 'requires_setup', 'unsupported', 'collected']);
  assert.equal(result.manifest.sources[0].paginationComplete, true);
  assert.equal(result.manifest.sources[0].coverage.start, null);
  assert.equal(result.manifest.sources[0].upstreamErrors[0].code, 'history_unavailable');
  assert.equal(result.manifest.sources[0].observedOnly, true);
  assert.equal(events(f.state()).length, 1);
  Object.assign(f.input.pages[0].events[0], { body: 'Synthetic rejected payload' });
  const failed = f.run();
  assert.deepEqual(failed.manifest.sources.map(source => source.status), ['failed', 'requires_setup', 'unsupported', 'collected']);
});

test('verified empty pages differ from missing inputs and contact presence never creates activity', t => {
  const f = fixture(t);
  f.input.pages[0].events = [];
  assert.equal(f.run().exitCode, 0);
  assert.equal(events(f.state()).length, 0);
  f.request.sources[0].input = 'missing-file.json';
  const result = f.run();
  assert.equal(result.exitCode, 2);
  assert.equal(result.manifest.sources[0].error.code, 'input_unreadable');
  assert.equal(result.manifest.sources[0].coverage, null);
  const contact = handoff('google-contacts', null);
  contact.pages[0].events = [handoff('email', 'email').pages[0].events[0]];
  Object.assign(f.input, contact);
  Object.assign(f.request.sources[0], { source: contact.source, account: contact.account, connector: contact.connector, input: 'input.json' });
  assert.equal(f.run().manifest.sources[0].status, 'failed');
  assert.equal(events(f.state()).length, 0);
});

test('conflicting source events are not overwritten or advanced; edits stay separate event types', t => {
  const f = fixture(t);
  f.run();
  const original = events(f.state())[0].record;
  f.input.pages[0].events[0].timestamp = '2026-11-22T12:00:00Z';
  const result = f.run();
  assert.equal(result.manifest.sources[0].error.code, 'record_conflict');
  assert.deepEqual(events(f.state())[0].record, original);
  f.input.pages[0].events[0].id = 'edit-1';
  f.input.pages[0].events[0].eventType = 'edit';
  f.input.pages[0].events[0].targetId = 'message-1';
  f.input.pages[0].events[0].timestamp = original.timestamp;
  assert.equal(f.run().exitCode, 0);
  assert.equal(events(f.state()).filter(value => value.record.eventType === 'message').length, 1);
  assert.equal(events(f.state()).filter(value => value.record.eventType === 'edit').length, 1);
});

test('explicit profile, thread and message revisions retain evidence, replay, branch and resolve without replacement', t => {
  const f = fixture(t);
  assert.equal(f.run().exitCode, 0);
  const page = f.input.pages[0];
  const original = structuredClone(f.state().records);
  page.identities[1].displayName = 'Synthetic renamed peer';
  page.identities[1].revision = { id: 'profile-2', supersedes: '$initial' };
  page.threads[0].title = 'Synthetic renamed thread';
  page.threads[0].revision = { id: 'thread-2', supersedes: '$initial' };
  page.events[0].classification = 'unclassified';
  page.events[0].revision = { id: 'message-2', supersedes: '$initial' };
  assert.equal(f.run().exitCode, 0);
  assert.equal(f.run().exitCode, 0);
  let state = f.state();
  for (const [id, row] of Object.entries<RecordEntry>(original)) {
    assert.deepEqual(state.records[id].record, row.record);
    if (['thread', 'event'].includes(row.record.type) || row.record.isSelf === false) {
      assert.equal(state.records[id].revisions.length, 2);
    }
  }
  const peerKey = Object.keys(state.records).find(id => state.records[id].record.isSelf === false);
  assert.equal(state.reconciliation.records[peerKey].record.displayName, 'Synthetic renamed peer');
  page.identities[1].displayName = 'Synthetic competing profile';
  page.identities[1].revision = { id: 'profile-branch', supersedes: '$initial' };
  page.threads = []; page.memberships = []; page.events = [];
  assert.equal(f.run().exitCode, 2);
  state = f.state();
  assert.equal(state.reconciliation.collisions.length, 1);
  assert.equal(state.reconciliation.records[peerKey], undefined);
  page.identities[1].revision = { id: 'profile-reviewed', supersedes: ['profile-2', 'profile-branch'] };
  assert.equal(f.run().exitCode, 0);
  assert.equal(f.state().records[peerKey].revisions.length, 4);
  assert.equal(f.state().reconciliation.records[peerKey].revision, 'profile-reviewed');
  assert.equal(f.run().exitCode, 0);
  assert.ok(Array.isArray(page.identities[1].revision.supersedes));
  page.identities[1].revision.supersedes.reverse();
  assert.equal(f.run().exitCode, 0);
  assert.equal(f.state().records[peerKey].revisions.length, 4);
  page.identities[1].deleted = true;
  page.identities[1].revision = { id: 'profile-deleted', supersedes: 'profile-reviewed' };
  assert.equal(f.run().exitCode, 0);
  assert.equal(f.state().reconciliation.records[peerKey].record.deleted, true);
  assert.deepEqual(f.state().records[peerKey].record, original[peerKey].record);
});

test('targeted edits and deletion tombstones retain one message and surface unresolved targets', t => {
  const f = fixture(t);
  const page = f.input.pages[0];
  const message = structuredClone(page.events[0]);
  page.events.push({ ...message, id: 'edit-1', eventType: 'edit', targetId: message.id },
    { ...message, id: 'delete-1', eventType: 'deletion', targetId: message.id });
  assert.equal(f.run().exitCode, 0);
  const original = events(f.state()).find(row => row.record.eventType === 'message');
  const projected = Object.values<RecordEntry>(f.state().reconciliation.records).find(row => row.record.eventType === 'message');
  assert.equal(projected.deletedBy.length, 1);
  assert.equal(projected.editedBy.length, 1);
  assert.deepEqual(projected.record, original.record);
  assert.equal(events(f.state()).filter(row => row.record.eventType === 'message').length, 1);
  page.events = [{ ...message, id: 'unknown-delete', eventType: 'deletion', targetId: 'not-yet-imported' }];
  assert.equal(f.run().exitCode, 0);
  assert.equal(f.state().reconciliation.pendingTargets.length, 1);
  assert.equal(f.state().reconciliation.unresolvedTargets.length, 0);
  page.events = [{ ...message, id: 'not-yet-imported' }];
  assert.equal(f.run().exitCode, 0);
  assert.equal(f.state().reconciliation.unresolvedTargets.length, 0);
  assert.equal(f.state().reconciliation.pendingTargets.length, 0);
  page.events = [{ ...message, id: 'invalid-edit', eventType: 'edit' }];
  assert.equal(f.run().manifest.sources[0].error.code, 'invalid_input');
});

test('out-of-window mutation targets stay informational across later periods and unrelated sources', t => {
  const f = fixture(t);
  const page = f.input.pages[0];
  page.events[0] = { ...page.events[0], id: 'delete-historical-message', eventType: 'deletion', targetId: 'message-from-2024' };
  assert.equal(f.run().exitCode, 0);
  const pending = f.state().reconciliation.pendingTargets;
  assert.equal(pending.length, 1);
  assert.equal(f.state().manifest.reconciliationRequired, false);
  page.events = [];
  f.request.period = { preset: 'custom', timeZone: period.timeZone, asOf: period.asOf,
    start: '2026-11-01T00:00:00Z', end: period.asOf };
  assert.equal(f.run().exitCode, 0);
  const contacts = handoff('google-contacts', null);
  Object.assign(f.input, contacts);
  Object.assign(f.request.sources[0], { source: contacts.source, account: contacts.account, connector: contacts.connector });
  assert.equal(f.run().exitCode, 0);
  assert.deepEqual(f.state().reconciliation.pendingTargets, pending);
  assert.equal(f.state().reconciliation.unresolvedTargets.length, 0);
});

test('present but invalid mutation targets still require reconciliation', t => {
  const f = fixture(t);
  const page = f.input.pages[0];
  const message = structuredClone(page.events[0]);
  const mutation = { ...message, id: 'invalid-delete', eventType: 'deletion', targetId: message.id };
  page.events.push(mutation);
  mutation.timestamp = '2026-11-22T12:00:00Z';
  assert.equal(f.run().exitCode, 2);
  assert.equal(f.state().reconciliation.unresolvedTargets.length, 1);
  assert.equal(f.state().reconciliation.pendingTargets.length, 0);
  mutation.timestamp = message.timestamp;
  mutation.revision = { id: 'fixed-time', supersedes: '$initial' };
  page.threads.push({ id: 'other-thread', idKind: 'local', kind: 'group' });
  mutation.threadId = 'other-thread';
  assert.equal(f.run().exitCode, 2);
  assert.equal(f.state().reconciliation.unresolvedTargets.length, 1);
  mutation.threadId = message.threadId;
  mutation.targetId = 'non-message-target';
  mutation.revision = { id: 'wrong-type', supersedes: 'fixed-time' };
  page.events.push({ ...message, id: 'non-message-target', eventType: 'reaction' });
  assert.equal(f.run().exitCode, 2);
  assert.equal(f.state().reconciliation.unresolvedTargets.length, 1);
  mutation.targetId = message.id;
  mutation.revision = { id: 'fixed-target', supersedes: 'wrong-type' };
  assert.equal(f.run().exitCode, 0);
  assert.equal(f.state().reconciliation.records[JSON.stringify(['email', f.input.account, 'event', message.id])].deletedBy.length, 1);
});

test('reviewed connector ID translations deduplicate all references and retain original source evidence', t => {
  const f = fixture(t);
  for (const row of [...f.input.pages[0].identities, ...f.input.pages[0].threads, ...f.input.pages[0].events]) row.idKind = 'provider';
  assert.equal(f.run().exitCode, 0);
  const page = f.input.pages[0];
  const connector = 'second-export';
  const mappings = [];
  for (const [type, rows] of [['identity', page.identities], ['thread', page.threads], ['event', page.events]] as const) {
    for (const row of rows) {
      mappings.push({ source: 'email', account: f.input.account, connector, type, id: `other-${row.id}`, targetId: row.id });
      row.id = `other-${row.id}`;
      row.idKind = 'local';
    }
  }
  for (const row of page.memberships) {
    row.threadId = `other-${row.threadId}`; row.identityId = `other-${row.identityId}`;
  }
  for (const row of page.events) {
    row.threadId = `other-${row.threadId}`; row.senderId = `other-${row.senderId}`;
    row.recipients.forEach(recipient => { recipient.identityId = `other-${recipient.identityId}`; });
  }
  f.request.overlapReview = { revision: 'synthetic-review-1', reviewedAt: period.asOf,
    basis: 'Synthetic exact provider ID translation reviewed locally.', mappings };
  f.input.connector = connector; f.request.sources[0].connector = connector;
  assert.equal(f.run().exitCode, 0);
  assert.equal(events(f.state()).length, 1);
  const evidence = events(f.state())[0].provenance.find(row => row.connector === connector);
  assert.equal(evidence.originalId, 'other-message-1');
  assert.equal(evidence.sourceRecord.threadId, 'other-thread-1');
  assert.equal(evidence.sourceRecord.idKind, 'local');
  assert.equal(events(f.state())[0].record.idKind, 'provider');
  assert.equal(evidence.overlapReview, 'synthetic-review-1');
  assert.equal(f.state().overlapReviews.length, 1);
  assert.equal(f.run().exitCode, 0);
  const review = f.request.overlapReview;
  delete f.request.overlapReview;
  assert.equal(f.run().exitCode, 0);
  assert.equal(events(f.state()).length, 1);
  f.request.overlapReview = review;
  f.request.overlapReview.basis = 'Changed immutable review';
  assert.throws(f.run, /cannot be changed/);
});

test('per-thread coverage cannot promote incomplete or omitted thread histories to complete', t => {
  const f = fixture(t);
  const page = f.input.pages[0];
  page.threads.push({ id: 'group-2', idKind: 'local', kind: 'group' });
  page.threadCoverage = [{ threadId: 'thread-1', ...f.input.coverage },
    { threadId: 'group-2', start: null, end: null, completeness: 'unknown', basis: 'Synthetic unavailable history.' }];
  assert.equal(f.run().exitCode, 2);
  assert.equal(f.state().manifest.sources[0].threadCoverage.length, 2);
  page.threadCoverage.pop();
  assert.equal(f.run().exitCode, 2);
  page.threadCoverage.push({ threadId: 'group-2', ...f.input.coverage });
  assert.equal(f.run().exitCode, 0);
  assert.ok(Object.values<RecordEntry>(f.state().records).filter(row => row.record.type === 'threadCoverage').length >= 3);
  page.threadCoverage = [];
  assert.equal(f.run().exitCode, 2);
  delete page.threadCoverage;
  assert.equal(f.run().exitCode, 2);
  assert.equal(f.state().manifest.sources[0].threadCoverageMode, 'per-thread');
});

test('legacy snapshots upgrade additively and retain unresolved untargeted mutation evidence', t => {
  const f = fixture(t);
  f.run();
  const legacy = f.state();
  delete legacy.reconciliation;
  delete legacy.overlapReviews;
  for (const row of Object.values<RecordEntry>(legacy.records)) {
    delete row.revisions;
    row.provenance.forEach(item => { delete item.sourceRecord; delete item.originalId; delete item.context; delete item.overlapReview; });
  }
  const messageKey = Object.keys(legacy.records).find(id => legacy.records[id].record.type === 'event');
  const editKey = JSON.stringify(['email', f.input.account, 'event', 'legacy-edit']);
  legacy.records[editKey] = structuredClone(legacy.records[messageKey]);
  legacy.records[editKey].record.eventType = 'edit';
  fs.writeFileSync(path.join(f.request.output, 'collection.json'), JSON.stringify(legacy));
  assert.equal(f.run().exitCode, 2);
  let state = f.state();
  assert.deepEqual(state.reconciliation.unresolvedTargets, [editKey]);
  assert.deepEqual(state.records[messageKey].provenance[0], legacy.records[messageKey].provenance[0]);
  f.input.pages[0].events = [{ ...f.input.pages[0].events[0], id: 'legacy-edit', eventType: 'edit',
    targetId: 'message-1', revision: { id: 'target-reviewed', supersedes: '$initial' } }];
  assert.equal(f.run().exitCode, 0);
  state = f.state();
  assert.equal(state.records[editKey].record.targetKey, undefined);
  assert.equal(state.reconciliation.records[messageKey].editedBy.length, 1);
});

test('invalid revision ancestry and conflicting translations roll back pages without losing source evidence', t => {
  const f = fixture(t);
  f.run();
  const before = f.state();
  const page = f.input.pages[0];
  page.identities[1].revision = { id: 'bad-revision', supersedes: 'missing-version' };
  page.identities[1].displayName = 'Synthetic rejected update';
  assert.equal(f.run().manifest.sources[0].error.code, 'revision_conflict');
  assert.deepEqual(f.state().records, before.records);
  delete page.identities[1].revision;
  page.identities[1].displayName = 'Synthetic person A';
  page.events[0].id = 'unreviewed-other-message';
  assert.equal(f.run().exitCode, 0);
  assert.equal(events(f.state()).length, 2);
  f.request.overlapReview = { revision: 'too-late', reviewedAt: period.asOf, basis: 'Synthetic review after alias import.',
    mappings: [{ source: 'email', account: f.input.account, connector: f.input.connector, type: 'event',
      id: 'unreviewed-other-message', targetId: 'message-1' }] };
  assert.throws(f.run, /already imported/);
  assert.equal(events(f.state()).length, 2);
  f.request.overlapReview.mappings[0].id = 'new-alias';
  page.events[0].id = 'new-alias';
  page.events[0].classification = 'bulk';
  assert.equal(f.run().manifest.sources[0].error.code, 'record_conflict');
  assert.equal(events(f.state()).length, 2);
  f.request.overlapReview = { revision: 'chain-review', reviewedAt: period.asOf, basis: 'Synthetic invalid chain.',
    mappings: [{ source: 'email', account: f.input.account, connector: f.input.connector, type: 'event',
      id: 'message-1', targetId: 'third-id' }] };
  assert.throws(f.run, /chains or cycles/);
});

test('historical membership intervals preserve group rosters and bound direct-thread validation', t => {
  const f = fixture(t);
  const page = f.input.pages[0];
  page.identities.push({ id: 'former-peer', idKind: 'local', isSelf: false });
  page.memberships[1].validFrom = '2026-11-20T00:00:00Z';
  page.memberships.push({ threadId: 'thread-1', identityId: 'former-peer',
    validFrom: null, validUntil: '2026-11-20T00:00:00Z' });
  assert.equal(f.run().exitCode, 0);
  const previous = structuredClone(page.events[0]);
  previous.id = 'historical-message'; previous.senderId = 'former-peer'; previous.timestamp = '2026-11-19T12:00:00Z';
  page.events.push(previous);
  assert.equal(f.run().exitCode, 0);
  assert.equal(events(f.state()).length, 2);
  page.events = [{ ...previous, id: 'outside-membership', timestamp: '2026-11-23T12:00:00Z' }];
  assert.equal(f.run().manifest.sources[0].status, 'failed');
  page.threads[0].kind = 'group';
  page.threads[0].revision = { id: 'group-kind', supersedes: '$initial' };
  page.events = [];
  assert.equal(f.run().exitCode, 0);
  const memberships = Object.values<RecordEntry>(f.state().records).filter(row => row.record.type === 'membership');
  assert.equal(memberships.length, 3);
  assert.equal(memberships.find(row => row.record.validUntil).record.validUntil, '2026-11-20T00:00:00.000Z');
  assert.equal(events(f.state()).length, 2);
});

test('same-page revision indexes preserve ancestry, latest references, replay and atomic conflicts', t => {
  const f = fixture(t), page = f.input.pages[0];
  const original = structuredClone(page.identities[1]);
  page.identities.push({ ...original, displayName: 'Synthetic revised peer',
    revision: { id: 'peer-2', supersedes: '$initial' } });
  const thread = structuredClone(page.threads[0]);
  page.threads.push({ ...thread, kind: 'group', revision: { id: 'thread-2', supersedes: '$initial' } },
    { ...thread, revision: { id: 'thread-3', supersedes: 'thread-2' } });
  page.events.push(structuredClone(page.events[0]));
  assert.equal(f.run().exitCode, 0);
  const before = f.state();
  const threadKey = JSON.stringify(['email', f.input.account, 'thread', thread.id]);
  assert.deepEqual(before.records[threadKey].revisions.map(row => row.id), ['$initial', 'thread-2', 'thread-3']);
  assert.equal(events(before)[0].provenance[0].context.threadRevision, 'thread-3');
  assert.equal(before.manifest.sources[0].duplicateRecords, 1);
  assert.equal(f.run().exitCode, 0);
  assert.deepEqual(f.state().records, before.records);
  page.identities.push({ ...original, displayName: 'Conflicting same-page revision',
    revision: { id: 'peer-2', supersedes: '$initial' } });
  assert.equal(f.run().manifest.sources[0].error.code, 'record_conflict');
  assert.deepEqual(f.state().records, before.records);
});

test('calendar presets, DST boundaries, 30 days, custom offsets and invalid dates are explicit', () => {
  const spring = resolvePeriod({ preset: '7d', timeZone: 'America/New_York', asOf: '2026-03-10T16:00:00Z' });
  assert.equal(spring.start, '2026-03-04T05:00:00.000Z');
  const fall = resolvePeriod({ preset: '7d', timeZone: 'America/New_York', asOf: '2026-11-03T17:00:00Z' });
  assert.equal(fall.start, '2026-10-28T04:00:00.000Z');
  assert.equal(resolvePeriod({ ...period, preset: '30d' }).start, '2026-10-26T07:00:00.000Z');
  const custom = resolvePeriod({ preset: 'custom', timeZone: 'America/Los_Angeles', asOf: period.asOf,
    start: '2026-11-01T01:30:00-07:00', end: '2026-11-01T01:30:00-08:00' });
  assert.equal(Date.parse(custom.end) - Date.parse(custom.start), 3600000);
  assert.equal(custom.bounds, '[start,end)');
  assert.throws(() => resolvePeriod({ ...period, timeZone: 'not/a-zone' }), /IANA/);
  assert.throws(() => resolvePeriod({ ...period, asOf: '2026-02-30T00:00:00Z' }), /calendar date/);
});

test('unsafe outputs and concurrent writers fail before changing stored records', t => {
  const f = fixture(t);
  assert.throws(() => outputLocation(path.resolve(__dirname, '..', '..', 'assets', 'contacts')), /only under/);
  assert.throws(() => outputLocation(path.resolve(__dirname, '..', '..', 'docs')), /only under/);
  f.run();
  const before = fs.readFileSync(path.join(f.request.output, 'collection.json'), 'utf8');
  fs.writeFileSync(path.join(f.request.output, 'collection.lock'), '');
  assert.throws(f.run, /locked/);
  assert.equal(fs.readFileSync(path.join(f.request.output, 'collection.json'), 'utf8'), before);
});

test('CLI demo and request run without endpoint access, with exit 2 for partial and exit 1 for invalid arguments', t => {
  const f = fixture(t);
  const cli = path.join(__dirname, 'collect.ts');
  const demo = spawnSync(process.execPath, ['--import', 'tsx', cli, '--demo', '--output', path.join(f.folder, 'cli-demo')], { encoding: 'utf8' });
  assert.equal(demo.status, 0, demo.stderr);
  assert.equal(JSON.parse(demo.stdout).dataClass, 'synthetic');
  assert.ok(!demo.stdout.includes('Synthetic person A'));
  const demoAgain = spawnSync(process.execPath, ['--import', 'tsx', cli, '--demo', '--output', path.join(f.folder, 'cli-demo')], { encoding: 'utf8' });
  assert.equal(demoAgain.status, 1);
  assert.match(demoAgain.stderr, /empty output directory/);
  f.request.sources = [{ source: 'email', account: 'fixture', connector: 'none', mode: 'unavailable',
    status: 'requires_setup', reason: 'No authorized email tool.' }];
  const requestFile = path.join(f.folder, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify(f.request));
  const partial = spawnSync(process.execPath, ['--import', 'tsx', cli, '--request', requestFile], { encoding: 'utf8' });
  assert.equal(partial.status, 2);
  assert.equal(JSON.parse(partial.stdout).sources[0].status, 'requires_setup');
  assert.equal(spawnSync(process.execPath, ['--import', 'tsx', cli, '--unknown'], { encoding: 'utf8' }).status, 1);
});

test('pagination gaps/cycles and out-of-snapshot observations fail explicitly', t => {
  const f = fixture(t);
  f.input.pages[0].nextCursor = 'cycle';
  const next = structuredClone(f.input.pages[0]);
  next.cursor = 'cycle';
  f.input.pages.push(next);
  let result = f.run();
  assert.equal(result.manifest.sources[0].error.code, 'invalid_input');
  assert.equal(events(f.state()).length, 1);
  f.input.pages = [structuredClone(handoff('email', 'email').pages[0])];
  f.input.pages[0].events[0].timestamp = '2026-11-25T00:00:00Z';
  result = f.run();
  assert.equal(result.manifest.sources[0].status, 'failed');
  assert.equal(events(f.state()).length, 1);
});
