import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { projectGoogleCSV, contactSuggestions, importContactCSV } from './contact-csv.ts';
import { validateObservations, readMuseRecency, renderDashboard, DASHBOARD_SCRIPT } from './contact-dashboard.ts';
import type { Observation } from './contact-dashboard.ts';
import type { ManualRun } from './manual-retrieval.ts';

const now = '2026-11-26T12:00:00.000Z';
const bytes = (csv: string) => Buffer.from(csv, 'utf8');
const csv = 'First Name,Middle Name,Last Name,E-mail 1 - Value,Phone 1 - Value,Notes\r\n' +
  '"Ada, Jr.",,Fixture,ada@example.invalid,+1 (202) 555-0100,"excluded fixture note, with ""quote""\r\nnewline"\r\n' +
  'Ada,,Fixture,other@example.invalid,+12025550100,excluded second note\r\n';

function capture() {
  const source: ManualRun['sources'][number] = {
    source: 'text-messages', account: 'fixture-messages', connector: 'fixture-ui',
    fields: ['threads.id', 'threads.idKind', 'threads.kind'], status: 'partial',
    operation: 'fixture.metadata', responseRefs: ['fixture-metadata.json'], retrievedAt: now,
    gaps: ['Incomplete fixture capture'], handoff: {
      schemaVersion: 1, dataClass: 'synthetic', source: 'text-messages', account: 'fixture-messages', connector: 'fixture-ui',
      coverage: { start: null, end: null, completeness: 'unknown', basis: 'Bounded fixture' },
      pages: [{ cursor: null, nextCursor: null, retrievedAt: now, identities: [],
        threads: [{ id: 'fixture-thread', idKind: 'local', kind: 'unknown' }], memberships: [], events: [] }]
    }
  };
  const rows: Observation[] = [
    { messageUiId: 'fixture-1', threadUiId: 'fixture-thread', coreUiIdMatches: true, isOutgoing: true, isRcs: true,
      inferredLocalDate: '2026-11-14', dateBasis: 'Fixture divider, inferred year', temporalPrecision: 'day',
      possibleInstantRange: { startInclusive: '2026-11-14T00:00:00Z', endExclusive: '2026-11-15T00:00:00Z' },
      yearIndependentlyVerified: false, requestedWindowMembership: 'inferred-inside' },
    { messageUiId: 'fixture-2', threadUiId: 'fixture-thread', coreUiIdMatches: true, isOutgoing: false, isRcs: null,
      inferredLocalDate: '2026-11-26', dateBasis: 'Fixture today divider', temporalPrecision: 'day',
      possibleInstantRange: { startInclusive: '2026-11-26T00:00:00Z', endExclusive: '2026-11-27T00:00:00Z' },
      yearIndependentlyVerified: false, requestedWindowMembership: 'inferred-overlaps-boundary' },
    { messageUiId: 'fixture-3', threadUiId: 'fixture-thread', coreUiIdMatches: true, isOutgoing: null, isRcs: null,
      inferredLocalDate: null, dateBasis: null, temporalPrecision: 'unknown', possibleInstantRange: null,
      yearIndependentlyVerified: false, requestedWindowMembership: 'unknown' }
  ];
  return { schemaVersion: 1, dataClass: 'synthetic', kind: 'bounded-ui-metadata-observations',
    manualRun: { schemaVersion: 1, dataClass: 'synthetic', period: { preset: 'custom', timeZone: 'UTC',
      start: '2026-11-13T00:00:00Z', end: now, asOf: now }, sources: [source] },
    observedUiMetadata: { account: source.account, messages: rows, dateEvidence: [], selectedForRequestedWindow: rows.slice(0, 2) } };
}

test('Google CSV projects selected columns, handles quoted multiline cells and preserves snapshot-local identities', () => {
  const snapshot = projectGoogleCSV(bytes('\uFEFF' + csv), 'synthetic', now);
  assert.equal(snapshot.contacts.length, 2);
  assert.equal(snapshot.contacts[0].displayName, 'Ada, Jr. Fixture');
  assert.equal(snapshot.contacts[0].idKind, 'local');
  assert.ok(!JSON.stringify(snapshot).includes('excluded'));
  assert.notEqual(snapshot.contacts[0].personId, snapshot.contacts[1].personId, 'same names do not merge');
  assert.deepEqual(projectGoogleCSV(bytes('\uFEFF' + csv), 'synthetic', now), snapshot, 'exact bytes replay identically');
  assert.notEqual(projectGoogleCSV(bytes(csv), 'synthetic', now).contacts[0].personId, snapshot.contacts[0].personId,
    'different export bytes require review instead of claiming cross-export identity');
  const matches = contactSuggestions(snapshot);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].people.length, 2);
});

test('CSV rejects malformed rows, duplicate headers and invalid UTF-8 without partial import', () => {
  for (const invalid of ['Name,Name\nA,B\n', 'Name,Phone 1 - Value\nA\n', 'Name\n"unfinished',
    'Name\n"quoted"x\n', 'Name\nun"quoted\n']) {
    assert.throws(() => projectGoogleCSV(bytes(invalid), 'synthetic', now));
  }
  assert.throws(() => projectGoogleCSV(Buffer.from([0xff]), 'synthetic', now), /UTF-8/);
  const snapshot = projectGoogleCSV(bytes('Name,Notes\n,"ignored note"\nReplacement �,\n'), 'synthetic', now);
  assert.equal(snapshot.ignoredRows, 1);
  assert.equal(snapshot.contacts[0].displayName, 'Replacement �');
});

test('observation validation preserves uncertainty and rejects false ranges, duplicate IDs and extra fields', () => {
  const original = capture();
  const valid = validateObservations(original, 'synthetic');
  assert.deepEqual(valid.messages.map(m => m.requestedWindowMembership), ['inferred-inside', 'inferred-overlaps-boundary', 'unknown']);
  assert.throws(() => validateObservations(capture(), 'private'), /envelope/);
  const badMembership = capture();
  badMembership.observedUiMetadata.messages[1].requestedWindowMembership = 'inferred-inside';
  assert.throws(() => validateObservations(badMembership, 'synthetic'), /membership/);
  const badRange = capture();
  badRange.observedUiMetadata.messages[0].possibleInstantRange.endExclusive = '2026-11-16T00:00:00Z';
  assert.throws(() => validateObservations(badRange, 'synthetic'), /calendar day/);
  const duplicates = capture();
  duplicates.observedUiMetadata.messages.push(duplicates.observedUiMetadata.messages[0]);
  assert.throws(() => validateObservations(duplicates, 'synthetic'), /Duplicate/);
  const extra = capture();
  Object.assign(extra.observedUiMetadata.messages[0], { body: 'excluded fixture body' });
  assert.throws(() => validateObservations(extra, 'synthetic'), /unsupported fields/);
  const fractional = capture();
  fractional.observedUiMetadata.messages[0].possibleInstantRange.startInclusive = '2026-11-14T00:00:00.500Z';
  assert.throws(() => validateObservations(fractional, 'synthetic'), /calendar day/);
  const selected = capture();
  selected.observedUiMetadata.selectedForRequestedWindow = [];
  assert.throws(() => validateObservations(selected, 'synthetic'), /window candidates/);
  const undeclared = capture();
  undeclared.observedUiMetadata.messages[0].threadUiId = 'undeclared-fixture-thread';
  assert.throws(() => validateObservations(undeclared, 'synthetic'), /source receipt/);
});

test('day ranges use local midnights across both daylight-saving transitions', () => {
  for (const [day, start, end, periodStart] of [
    ['2026-03-08', '2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z', '2026-03-07T08:00:00Z'],
    ['2026-11-01', '2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z', '2026-10-31T07:00:00Z']
  ]) {
    const input = capture(), row = input.observedUiMetadata.messages[0];
    Object.assign(input.manualRun.period, { timeZone: 'America/Los_Angeles', start: periodStart, end, asOf: now });
    Object.assign(row, { inferredLocalDate: day, possibleInstantRange: { startInclusive: start, endExclusive: end } });
    input.observedUiMetadata.messages = [row];
    input.observedUiMetadata.selectedForRequestedWindow = [row];
    assert.equal(validateObservations(input, 'synthetic').messages[0].requestedWindowMembership, 'inferred-inside');
  }
});

test('offline dashboard renders contact evidence safely and executes its filters against the same observed dataset', () => {
  const snapshot = projectGoogleCSV(bytes('Name,E-mail 1 - Value,Notes\n"</script><script>bad()</script>",x@example.invalid,excluded\n'), 'synthetic', now);
  const observations = validateObservations(capture(), 'synthetic');
  const html = renderDashboard(snapshot, observations, []);
  assert.ok(!html.includes('</script><script>bad()'));
  assert.ok(!html.includes('excluded'));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes('Not included in this preview'));
  assert.ok(html.includes('No verified participant-number link'));
  assert.ok(html.includes('not exact native timestamps'));
  const data = JSON.parse(html.match(/<script id="preview-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const elements = new Map<string, { textContent: string; value: string; hidden: boolean; style: Record<string, string>;
    className: string; children: unknown[]; addEventListener: (name: string, listener: () => void) => void;
    replaceChildren: () => void; append: (...items: unknown[]) => void; setAttribute: () => void }>();
  const make = () => ({ textContent: '', value: '', hidden: false, style: {}, className: '', children: [],
    addEventListener() {}, replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); }, setAttribute() {} });
  let filter: () => void;
  const document = {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, make());
      const element = elements.get(id);
      if (id === 'preview-data') element.textContent = JSON.stringify(data);
      if (id === 'conversation-filter') element.addEventListener = (_, listener) => { filter = listener; };
      return element;
    },
    querySelectorAll: () => [],
    createElement: make
  };
  vm.runInNewContext(DASHBOARD_SCRIPT, { document });
  assert.equal(elements.get('inside-count').textContent, 1);
  assert.equal(elements.get('boundary-count').textContent, 1);
  assert.equal(elements.get('unknown-count').textContent, 1);
  assert.equal(elements.get('outgoing-count').textContent, 1);
  assert.equal(elements.get('incoming-count').textContent, 0, 'boundary candidates are not counted as confirmed in-window');
  assert.equal(elements.get('timeline').children.length, 14);
  elements.get('conversation-filter').value = 'missing-fixture-thread';
  filter();
  assert.equal(elements.get('inside-count').textContent, 0);
  assert.equal(elements.get('empty-chart').hidden, false);
});

test('private local CSV publication is atomic, preserves input bytes and refuses overwrites or Git locations', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-preview-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const input = path.join(folder, 'fixture.csv'), output = path.join(folder, 'output');
  fs.writeFileSync(input, csv); fs.mkdirSync(output);
  const result = importContactCSV(input, output);
  assert.equal(result.exitCode, 2);
  assert.equal(result.contacts, 2);
  const preview = path.join(output, 'preview');
  assert.deepEqual(fs.readFileSync(path.join(preview, 'contacts.original.csv')), fs.readFileSync(input));
  assert.equal(JSON.parse(fs.readFileSync(path.join(preview, 'contacts.json'), 'utf8')).dataClass, 'private');
  assert.ok(!fs.readFileSync(path.join(preview, 'dashboard.html'), 'utf8').includes('excluded'));
  const before = fs.readFileSync(result.file);
  assert.throws(() => importContactCSV(input, output), /fresh empty/);
  assert.deepEqual(fs.readFileSync(result.file), before);
  const bad = path.join(folder, 'bad'); fs.mkdirSync(bad); fs.writeFileSync(input, 'Name,Name\nA,B\n');
  assert.throws(() => importContactCSV(input, bad));
  assert.deepEqual(fs.readdirSync(bad), []);
  const repo = path.join(folder, 'repository'); fs.mkdirSync(repo); fs.mkdirSync(path.join(repo, '.git'));
  assert.throws(() => importContactCSV(input, repo), /Git/);
});

test('Muse recency stays separate from message counts and rejects invented native proof or content', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-muse-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'muse.private.json');
  const fixture = { schemaVersion: 1, dataClass: 'private', kind: 'muse-reported-chat-recency',
    source: 'messenger', retrievedAt: now, requestedPeriod: 'last 14 days', coverage: 'partial',
    gaps: ['Synthetic source-reported recency, not native enumeration.'], records: [
      { chatType: 'one_to_one', reportedChatId: 'fixture-direct', participants: [{ name: '<script>fixture</script>', id: null }],
        reportedLatestSentAt: now, nativeEvidenceVerified: false },
      { chatType: 'group', reportedChatId: 'fixture-group', participants: [{ name: 'Group fixture', id: null }],
        reportedLatestSentAt: null, nativeEvidenceVerified: false }
    ] };
  fs.writeFileSync(file, JSON.stringify(fixture));
  const source = readMuseRecency(file, 'private');
  const html = renderDashboard(projectGoogleCSV(bytes('Name\nFixture\n'), 'synthetic', now), null, [], [source]);
  assert.ok(html.includes('One-to-one chat') && html.includes('Group chat'));
  assert.ok(html.includes('Latest sent as returned: Unknown'));
  assert.ok(!html.includes('<script>fixture</script>'));
  assert.ok(html.includes('not message totals'));
  assert.ok(html.includes('Not included in this preview'), 'Instagram is not relabeled as Messenger');
  assert.throws(() => readMuseRecency(file, 'synthetic'), /Invalid bounded/);
  fixture.records[0].nativeEvidenceVerified = true;
  fs.writeFileSync(file, JSON.stringify(fixture));
  assert.throws(() => readMuseRecency(file, 'private'), /unverified native/);
  fixture.records[0].nativeEvidenceVerified = false;
  Object.assign(fixture.records[0].participants[0], { body: 'excluded fixture body' });
  fs.writeFileSync(file, JSON.stringify(fixture));
  assert.throws(() => readMuseRecency(file, 'private'), /unsupported fields/);
});
