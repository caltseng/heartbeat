import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { collect } from './collect.ts';
import { handoff } from './demo.ts';
import { review } from './identity-review.ts';
import { summary } from './summary.ts';
import { graphModel, render, run } from './graph.ts';

const period: import('./collect.ts').PeriodRequest = { preset: 'custom', timeZone: 'UTC', start: '2026-11-01T00:00:00Z',
  end: '2026-11-11T00:00:00Z', asOf: '2026-11-11T00:00:00Z' };
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(t, { partial = false, extraPeers = 0 } = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-graph-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const input = handoff('email', 'email');
  input.coverage = { start: period.start, end: period.end, completeness: partial ? 'partial' : 'complete',
    basis: 'Synthetic graph interval only.' };
  const page = input.pages[0];
  page.retrievedAt = period.asOf;
  const peers = ['frequent', 'regular', 'occasional', 'group', 'idle', 'member',
    ...Array.from({ length: extraPeers }, (_, i) => `idle-${i}`)];
  page.identities = ['self', ...peers].map(id =>
    ({ id, idKind: 'provider', isSelf: id === 'self', displayName: 'Synthetic same name' }));
  page.threads = ['frequent', 'regular', 'occasional'].map(id => ({ id, idKind: 'local', kind: 'direct' }))
    .concat({ id: 'group', idKind: 'local', kind: 'group' });
  page.memberships = ['frequent', 'regular', 'occasional'].flatMap(threadId =>
    ['self', threadId].map(identityId => ({ threadId, identityId })))
    .concat(['self', 'group', 'member'].map(identityId => ({ threadId: 'group', identityId })));
  page.events = ['frequent', 'regular', 'occasional', 'group'].flatMap((peer, i) =>
    Array.from({ length: [5, 2, 1, 1][i] }, (_, day) => ({
      id: `${peer}-${day}`, idKind: 'local', threadId: peer, senderId: peer, eventType: 'message',
      timestamp: `2026-11-0${day + 1}T12:00:00Z`, channel: 'email', classification: 'interpersonal',
      recipients: [{ identityId: 'self', role: 'to' }]
    })));
  fs.writeFileSync(path.join(folder, 'email.json'), JSON.stringify(input));
  const request: import('./types.ts').CollectionRequest = { schemaVersion: 1, dataClass: 'synthetic', period, output: 'store',
    sources: [{ source: 'email', account: input.account, connector: input.connector,
      mode: 'metadata-import', input: 'email.json' }] };
  if (partial) request.sources.push({ source: 'messenger', account: 'fixture-unavailable', connector: 'none',
    mode: 'unavailable', status: 'requires_setup', reason: 'Synthetic auth-limited source; not empty history.' });
  const collected = collect(request, folder);
  const reviewRequest: import('./types.ts').ReviewRequest = { schemaVersion: 1, dataClass: 'synthetic', collection: collected.file,
    output: 'mapping', expectedRevision: 0, reason: 'Separate synthetic peers.', operations: [] };
  const inspection = review(reviewRequest, folder, true);
  reviewRequest.collectionDigest = inspection.collectionDigest;
  const reviewed = review(reviewRequest, folder);
  const collection = JSON.parse(fs.readFileSync(collected.file, 'utf8'));
  const mapping = JSON.parse(fs.readFileSync(reviewed.file, 'utf8'));
  const options = { period, channels: partial ? ['email', 'messenger'] : ['email'],
    collectionDigest: inspection.collectionDigest, identityMappingRevision: 1 };
  const report = summary(collection, mapping, options);
  const reportFile = path.join(folder, 'report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report));
  const reportDigest = digest(fs.readFileSync(reportFile));
  const graphRequest = { schemaVersion: 1, dataClass: 'synthetic', report: 'report.json',
    reportDigest, output: 'graph' };
  const forPeer = (model, id) => model.people.find(person =>
    person.identityKeys.some(key => JSON.parse(key)[3] === id));
  return { folder, report, options, collection, mapping, graphRequest, forPeer, reportFile };
}
test('real synthetic collector/report pipeline drives intentional exact threshold radii and recency', t => {
  const f = fixture(t);
  const before = JSON.stringify(f.report);
  const model = graphModel(f.report);
  for (const [peer, band, days] of [['frequent', 'frequent', 5], ['regular', 'regular', 2],
    ['occasional', 'occasional', 1], ['group', 'group', 0], ['idle', 'inactive', 0], ['member', 'inactive', 0]]) {
    const person = f.forPeer(model, peer);
    assert.equal(person.band, band);
    assert.equal(person.directDays, days);
    assert.equal(person.periodDays, 10);
  }
  const html = render(f.report, f.graphRequest.reportDigest);
  assert.match(html, /cx="540" cy="540" r="36"/);
  assert.match(html, />You<\/text>/);
  for (const radius of [105, 180, 255, 330, 405, 480]) assert.match(html, new RegExp(`r="${radius}"`));
  assert.equal((html.match(/<line class="activity" x1="540"/g) || []).length, 3);
  assert.match(html, /2026-11-05/);
  assert.match(html, /Elapsed days since latest attributed activity: 5/);
  assert.match(html, /frequency is not emotional closeness/);
  assert.equal(JSON.stringify(f.report), before);
  assert.equal(render(f.report, f.graphRequest.reportDigest), html);
});
test('group membership is dashed evidence, never a direct spoke; historical membership respects selected interval', t => {
  const f = fixture(t);
  let model = graphModel(f.report);
  const member = f.forPeer(model, 'member');
  assert.equal(member.observedDirectMessages.observed, 0);
  assert.equal(member.group.observedPosted, 0);
  assert.equal(member.threads.length, 1);
  assert.equal(member.threads[0].activities.length, 0);
  assert.equal(member.threads[0].memberships.length, 1);
  const group = f.forPeer(model, 'group');
  assert.equal(group.threads[0].activities[0].kind, 'group-posted');
  const link = f.report.evidence.membershipLinks.find(row => row.personId === member.personId);
  link.validUntil = period.start;
  assert.equal(f.forPeer(graphModel(f.report), 'member').threads.length, 0);
  link.validUntil = null;
  link.validFrom = period.end;
  assert.equal(f.forPeer(graphModel(f.report), 'member').threads.length, 0);
  link.validFrom = null;
  model = graphModel(f.report);
  assert.equal(f.forPeer(model, 'member').threads.length, 1);
  assert.match(render(f.report, f.graphRequest.reportDigest), /class="membership"/);
});
test('partial observations have unknown and group-only categories, retain auth limits and lower bounds', t => {
  const f = fixture(t, { partial: true });
  const model = graphModel(f.report);
  assert.equal(f.forPeer(model, 'idle').band, 'unknown');
  assert.equal(f.forPeer(model, 'group').band, 'group');
  assert.equal(f.forPeer(model, 'frequent').observedDirectMessages.certainty, 'lower_bound');
  const result = run(f.graphRequest, f.folder);
  assert.equal(result.exitCode, 2);
  const html = fs.readFileSync(result.file, 'utf8');
  assert.match(html, /auth-limited source/);
  assert.match(html, /requires_setup/);
  assert.match(html, /0 observed; unknown; total unknown/);
  assert.match(html, /Positive counts under incomplete coverage are lower bounds/);
});
test('7d/30d/custom and channels use only their shared saved report across all views and evidence', t => {
  const f = fixture(t);
  for (const preset of ['7d', '30d']) {
    const report = summary(f.collection, f.mapping, { ...f.options, period: {
      preset, timeZone: 'UTC', asOf: '2026-11-11T12:00:00Z' } });
    const model = graphModel(report);
    assert.ok(model.people.every(person => person.periodDays === (preset === '7d' ? 7 : 30)));
    const html = render(report, f.graphRequest.reportDigest);
    assert.match(html, new RegExp(`all ${model.people[0].periodDays} local dates`));
    assert.match(html, /Current date partial: true/);
  }
  const report = summary(f.collection, f.mapping, { ...f.options, channels: ['sms'] });
  const model = graphModel(report);
  assert.ok(model.people.every(person => person.directDays === 0 && person.threads.length === 0));
  assert.ok(model.people.every(person => person.band === 'unknown'));
  const html = render(report, f.graphRequest.reportDigest);
  assert.match(html, /Channels: sms/);
  assert.doesNotMatch(html, /<line class="activity"/);
  assert.equal((html.match(/<caption>Channels in this same filtered report/g) || []).length, 1);
});
test('large cohorts paginate without omissions, with native keyboard links and responsive scroll alternatives', t => {
  const f = fixture(t, { extraPeers: 43 });
  const model = graphModel(f.report);
  assert.equal(model.sheets, 8);
  const html = render(f.report, f.graphRequest.reportDigest);
  assert.equal((html.match(/class="self"/g) || []).length, 8);
  for (const person of model.people) {
    assert.equal((html.match(new RegExp(`id="${person.anchor}"`, 'g')) || []).length, 1);
    assert.equal((html.match(new RegExp(`<circle class="person ${person.band}"`, 'g')) || []).length,
      model.people.filter(row => row.band === person.band).length);
    assert.match(html, new RegExp(`<a href="#${person.anchor}" aria-label=`));
  }
  assert.match(html, /width=device-width, initial-scale=1/);
  assert.match(html, /@media\(max-width:600px\)/);
  assert.match(html, /Skip map to accessible people table/);
  assert.match(html, /role="region" aria-label="Scrollable map sheet/);
  assert.match(html, /:focus-visible/);
  assert.doesNotMatch(html, /<script|<iframe|<img|<link|\bon\w+=|(?:href|src)="(?:https?:|javascript:)/i);
});
test('HTML escapes report strings, emits no scripts/remote assets and rejects malformed reports', t => {
  const f = fixture(t);
  f.report.context.sources[0].reason = '<script>alert("synthetic")</script>';
  const html = render(f.report, f.graphRequest.reportDigest);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /default-src 'none'/);
  f.report.views.peopleTable[0].group.observedPosted = '<svg onload=alert(1)>';
  assert.throws(() => render(f.report, f.graphRequest.reportDigest), /Invalid graph person/);
  assert.throws(() => render({ ...f.report, schemaVersion: 2 }, f.graphRequest.reportDigest), /Invalid/);
});
test('CLI is immutable, pins exact input bytes, denies private input before reads and rejects unsafe output', t => {
  const f = fixture(t);
  const requestFile = path.join(f.folder, 'request.json');
  const cli = path.join(__dirname, 'graph.ts');
  function invoke(request) {
    fs.writeFileSync(requestFile, JSON.stringify(request));
    return spawnSync(process.execPath, ['--import', 'tsx', cli, '--request', requestFile], { encoding: 'utf8' });
  }
  const snapshot = fs.readFileSync(f.reportFile);
  const result = invoke(f.graphRequest);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const html = fs.readFileSync(output.file);
  assert.equal(output.reportDigest, digest(snapshot));
  assert.equal(invoke(f.graphRequest).status, 1);
  assert.deepEqual(fs.readFileSync(output.file), html);
  assert.deepEqual(fs.readdirSync(path.dirname(output.file)), ['graph.html']);
  assert.deepEqual(fs.readFileSync(f.reportFile), snapshot);
  const bad = invoke({ ...f.graphRequest, reportDigest: 'a'.repeat(64), output: 'stale' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /report_conflict/);
  assert.equal(fs.existsSync(path.join(f.folder, 'stale')), false);
  const privateResult = invoke({ ...f.graphRequest, dataClass: 'private', report: 'does-not-exist', output: 'denied' });
  assert.equal(privateResult.status, 1);
  assert.match(privateResult.stderr, /private_collection_disabled/);
  assert.doesNotMatch(privateResult.stderr, /does-not-exist/);
  assert.equal(fs.existsSync(path.join(f.folder, 'denied')), false);
  fs.writeFileSync(f.reportFile, JSON.stringify({ ...f.report, dataClass: 'private' }));
  assert.match(invoke({ ...f.graphRequest, output: 'denied' }).stderr, /private_collection_disabled/);
  fs.writeFileSync(f.reportFile, snapshot);
  const unsafe = invoke({ ...f.graphRequest, output: path.resolve(__dirname, '..', '..', 'public') });
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /unsafe_output/);
  const partial = fixture(t, { partial: true });
  assert.equal(invoke({ ...partial.graphRequest, report: partial.reportFile, output: path.join(partial.folder, 'cli') }).status, 2);
});
