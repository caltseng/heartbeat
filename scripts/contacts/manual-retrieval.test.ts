import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveManualRun } from './manual-retrieval.ts';
import type { ManualRun, ManualSource } from './manual-retrieval.ts';
import { handoff, period } from './demo.ts';
import { collect } from './collect.ts';
import { tempFolder } from './fixtures.ts';
import { readJSON } from './lib.ts';

function mockRun(): ManualRun {
  const metadata = handoff('email', 'email');
  metadata.pages[0].identities.forEach(identity => { delete identity.displayName; });
  const fields = Object.entries(metadata.pages[0]).flatMap(([kind, records]) =>
    Array.isArray(records) ? records.flatMap(record => Object.keys(record).map(field => `${kind}.${field}`)) : []);
  const source: ManualSource = {
    source: metadata.source, account: metadata.account, connector: metadata.connector,
    fields: [...new Set(fields)], status: 'collected', operation: 'mock-source.listMetadata',
    responseRefs: ['mock-call-page-1'], retrievedAt: period.asOf, gaps: [], handoff: metadata
  };
  return { schemaVersion: 1, dataClass: 'synthetic', period, sources: [source] };
}

test('mock structured retrieval retains source evidence alongside an unavailable requested source', t => {
  const folder = tempFolder(t, 'heartbeat-manual-');
  const run = mockRun();
  run.sources.push({ source: 'messenger', account: 'fixture-messenger', connector: 'unavailable-tool',
    fields: ['events.id', 'events.timestamp'], status: 'requires_setup', operation: null,
    responseRefs: [], retrievedAt: null, gaps: ['Normal client sign-in required; no account read attempted.'], handoff: null });
  const result = saveManualRun(run, folder);
  assert.equal(result.exitCode, 2);
  const saved = readJSON(result.file).value;
  assert.equal(saved.period.bounds, '[start,end)');
  assert.equal(saved.sources[1].handoff, null);
  assert.equal(saved.sources[1].status, 'requires_setup');
  assert.deepEqual(saved.sources[0].responseRefs, ['mock-call-page-1']);
  assert.deepEqual(saved.sources[0].handoff, run.sources[0].handoff);
  const before = fs.readFileSync(result.file);
  assert.throws(() => saveManualRun(run, folder), /EEXIST/);
  assert.deepEqual(fs.readFileSync(result.file), before);
  assert.deepEqual(fs.readdirSync(folder), ['manual-handoff.json']);
});

test('mock handoff reuses importer shapes but private importer denial remains before reads', t => {
  const folder = tempFolder(t, 'heartbeat-manual-contract-');
  const run = mockRun();
  assert.equal(saveManualRun(run, folder).exitCode, 0);
  const input = path.join(folder, 'source.synthetic.json');
  fs.writeFileSync(input, JSON.stringify(run.sources[0].handoff));
  const request = { schemaVersion: 1, dataClass: 'synthetic', period,
    output: path.join(folder, 'collection'), sources: [
      { source: 'email', account: run.sources[0].account, connector: run.sources[0].connector, mode: 'metadata-import', input }
    ] };
  assert.equal(collect(request, folder).exitCode, 0);
  request.dataClass = 'private';
  request.sources[0].input = 'nonexistent-private-input.json';
  request.output = path.join(folder, 'must-not-exist');
  assert.throws(() => collect(request, folder), { code: 'private_collection_disabled' });
  assert.equal(fs.existsSync(request.output), false);
});

test('partial enumeration saves actual cursors and coverage without claiming completeness', t => {
  const folder = tempFolder(t, 'heartbeat-manual-partial-');
  const run = mockRun();
  const source = run.sources[0];
  source.status = 'partial';
  source.gaps = ['Approved page budget reached; upstream history unknown.'];
  source.handoff.coverage.completeness = 'unknown';
  source.handoff.pages[0].nextCursor = 'mock-next-page';
  assert.equal(saveManualRun(run, folder).exitCode, 2);
  assert.equal(readJSON(path.join(folder, 'manual-handoff.json')).value.sources[0].handoff.pages[0].nextCursor, 'mock-next-page');
});

test('rejects content, unrequested metadata, missing evidence, false completeness and out-of-bounds events before publication', t => {
  const folder = tempFolder(t, 'heartbeat-manual-reject-');
  const mutations: ((run: ManualRun) => void)[] = [
    run => { Object.assign(run.sources[0].handoff.pages[0].events[0], { body: 'mock forbidden body' }); },
    run => { run.sources[0].fields = ['events.id']; },
    run => { run.sources[0].responseRefs = []; },
    run => { run.sources[0].handoff.account = 'different-mock-account'; },
    run => { run.sources[0].handoff.pages[0].nextCursor = 'unfinished'; },
    run => { run.sources[0].handoff.coverage.completeness = 'unknown'; },
    run => { run.sources[0].handoff.pages[0].events[0].timestamp = period.asOf; },
    run => { run.sources[0].handoff.pages[0].events[0].timestamp = '2020-01-01T00:00:00Z'; },
    run => { Object.assign(run.sources[0].handoff.pages[0].identities[0], { isSelf: { token: 'mock' } }); },
    run => { run.sources[0].status = 'unsupported'; },
    run => { run.sources[0].handoff.pages[0].events[0].recipients[0].role = 'invented-role'; }
  ];
  for (const mutate of mutations) {
    const run = mockRun(); mutate(run);
    assert.throws(() => saveManualRun(run, folder));
    assert.equal(fs.existsSync(path.join(folder, 'manual-handoff.json')), false);
  }
});

test('Google contact snapshots cannot claim thread activity even without events', t => {
  const folder = tempFolder(t, 'heartbeat-manual-google-');
  const run = mockRun();
  run.sources[0].source = 'google-contacts';
  run.sources[0].handoff.source = 'google-contacts';
  run.sources[0].handoff.pages[0].events = [];
  assert.throws(() => saveManualRun(run, folder), /Identity snapshots cannot create activity/);
  assert.equal(fs.existsSync(path.join(folder, 'manual-handoff.json')), false);
});

test('private output rejects any containing Git worktree without reading real data', t => {
  const folder = tempFolder(t, 'heartbeat-manual-output-');
  fs.writeFileSync(path.join(folder, '.git'), 'mock-worktree-marker');
  const run = mockRun();
  run.dataClass = 'private';
  run.sources[0].handoff.dataClass = 'private';
  assert.throws(() => saveManualRun(run, folder), { code: 'unsafe_output' });
  assert.deepEqual(fs.readdirSync(folder), ['.git']);
});

test('mock private-class metadata can be saved outside Git without enabling import', t => {
  const folder = tempFolder(t, 'heartbeat-manual-private-class-');
  const run = mockRun();
  run.dataClass = 'private';
  run.sources[0].handoff.dataClass = 'private';
  assert.equal(saveManualRun(run, folder).exitCode, 0);
  assert.equal(readJSON(path.join(folder, 'manual-handoff.json')).value.dataClass, 'private');
});

test('CLI reports sanitized 0/2/1 exits for mock retrieval, partial and invalid inputs', t => {
  const folder = tempFolder(t, 'heartbeat-manual-cli-');
  for (const status of ['collected', 'partial', 'invalid']) {
    const run = mockRun();
    if (status === 'partial') { run.sources[0].status = 'partial'; run.sources[0].gaps = ['Mock page budget.']; }
    if (status === 'invalid') run.sources[0].account = 'DO-NOT-PRINT-MOCK-ACCOUNT';
    const input = path.join(folder, `${status}.synthetic.json`);
    const output = path.join(folder, status);
    fs.mkdirSync(output);
    fs.writeFileSync(input, JSON.stringify(run));
    const child = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'manual-retrieval.ts'),
      '--input', input, '--output', output], { encoding: 'utf8' });
    assert.equal(child.status, status === 'collected' ? 0 : status === 'partial' ? 2 : 1, child.stderr);
    assert.equal((child.stdout + child.stderr).includes('DO-NOT-PRINT'), false);
    assert.equal(fs.existsSync(path.join(output, 'manual-handoff.json')), status !== 'invalid');
  }
});
