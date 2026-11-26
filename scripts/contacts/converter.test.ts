import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createError } from './lib.ts';
import { writeHandoffBundle } from './converter.ts';
import type { Handoff } from './types.ts';

const failure = createError('synthetic-converter');
const options = { period: { preset: '7d' as const, timeZone: 'UTC', asOf: '2026-11-25T12:00:00Z' },
  report: { status: 'partial' }, failure };
const handoff: Handoff = { schemaVersion: 1, dataClass: 'synthetic', source: 'messenger',
  account: 'synthetic-owner', connector: 'synthetic-fixture',
  coverage: { start: null, end: null, completeness: 'unknown', basis: 'Synthetic fixture only.' },
  pages: [], errors: [] };
function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-converter-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

test('failed new bundle publication is atomic and preserves existing output and foreign locks', t => {
  const parent = fixture(t), folder = path.join(parent, 'bundle');
  const rename = t.mock.method(fs, 'renameSync', () => {
    throw Object.assign(new Error('Synthetic disk failure'), { code: 'EIO' });
  });
  assert.throws(() => writeHandoffBundle(folder, handoff, options), { code: 'EIO' });
  assert.deepEqual(fs.readdirSync(parent), []);
  rename.mock.restore();
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'foreign.json'), 'synthetic original');
  assert.throws(() => writeHandoffBundle(folder, handoff, options), { code: 'output_exists' });
  assert.equal(fs.readFileSync(path.join(folder, 'foreign.json'), 'utf8'), 'synthetic original');
  const lock = `${folder}.bundle.lock`;
  fs.writeFileSync(lock, 'foreign lock');
  assert.throws(() => writeHandoffBundle(folder, handoff, options), { code: 'output_locked' });
  assert.equal(fs.readFileSync(lock, 'utf8'), 'foreign lock');
});

test('replay completes interrupted artifacts without clobbering conflicts or advancing its request', t => {
  const folder = path.join(fixture(t), 'bundle'), replay = { ...options, mode: 'replay' as const };
  fs.mkdirSync(folder);
  const report = path.join(folder, 'report.json');
  fs.writeFileSync(report, 'synthetic conflict');
  assert.throws(() => writeHandoffBundle(folder, handoff, replay), { code: 'output_conflict' });
  assert.equal(fs.readFileSync(report, 'utf8'), 'synthetic conflict');
  assert.equal(fs.existsSync(path.join(folder, 'request.synthetic.json')), false);
  fs.unlinkSync(report);
  writeHandoffBundle(folder, handoff, replay);
  const before = fs.readFileSync(path.join(folder, 'handoff.json'), 'utf8');
  writeHandoffBundle(folder, handoff, replay);
  assert.equal(fs.readFileSync(path.join(folder, 'handoff.json'), 'utf8'), before);
  assert.deepEqual(fs.readdirSync(folder).sort(), ['handoff.json', 'report.json', 'request.synthetic.json']);
  assert.throws(() => writeHandoffBundle(folder, { ...handoff, account: 'other' }, replay), { code: 'output_conflict' });
  assert.equal(fs.readFileSync(path.join(folder, 'handoff.json'), 'utf8'), before);
});

test('unsupported conversion publishes only its report, never a fabricated handoff or importer request', t => {
  const folder = path.join(fixture(t), 'unsupported');
  writeHandoffBundle(folder, null, options);
  assert.deepEqual(fs.readdirSync(folder), ['report.json']);
});

test('empty-directory publication preserves text aliases and refuses occupied or private output', t => {
  const parent = fixture(t), folder = path.join(parent, 'bundle');
  fs.mkdirSync(folder);
  const empty = { ...options, mode: 'empty' as const, handoffName: 'text.synthetic.json' as const };
  writeHandoffBundle(folder, handoff, empty);
  assert.equal(fs.readFileSync(path.join(folder, 'text.synthetic.json'), 'utf8'),
    fs.readFileSync(path.join(folder, 'handoff.json'), 'utf8'));
  assert.throws(() => writeHandoffBundle(folder, handoff, empty), { code: 'output_not_empty' });
  const privateFolder = path.join(parent, 'private');
  assert.throws(() => writeHandoffBundle(privateFolder, { ...handoff, dataClass: 'private' }, options),
    { code: 'private_collection_disabled' });
  assert.equal(fs.existsSync(privateFolder), false);
  assert.equal(fs.existsSync(`${privateFolder}.bundle.lock`), false);
});

test('shared converter CLI preserves domain-specific status and sanitizes foreign failures', () => {
  const library = JSON.stringify(path.join(__dirname, 'converter.ts'));
  const lib = JSON.stringify(path.join(__dirname, 'lib.ts'));
  for (const [action, config, status, stderr] of [
    ['() => 0', { domain: 'fixture', fallback: 'io_failure' }, 0, ''],
    ['async () => 2', { domain: 'fixture', fallback: 'io_failure' }, 2, ''],
    [`() => { throw require(${lib}).createError('fixture')('missing_evidence', 'requires_setup'); }`,
      { domain: 'fixture', fallback: 'io_failure' }, 2, '{"status":"requires_setup","code":"missing_evidence"}\n'],
    [`async () => { throw require(${lib}).createError('other')('PRIVATE_DETAIL'); }`,
      { domain: 'fixture', fallback: 'io_failure', label: 'Fixture conversion' }, 1,
      'Fixture conversion failed [io_failure].\n'],
    ['() => { throw new Error("PRIVATE_DETAIL"); }', { domain: 'fixture', fallback: 'io_failure' },
      1, '{"status":"failed","code":"io_failure"}\n']
  ] as const) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e',
      `require(${library}).runConverter(${action}, ${JSON.stringify(config)});`], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, stderr);
  }
});
