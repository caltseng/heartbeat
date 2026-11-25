import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('test runner discovers nested TypeScript tests, excludes helpers and forwards filters', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat runner '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const nested = path.join(directory, 'nested');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'example.test.ts'), `
    const { test } = require('node:test');
    const value: number = 42;
    test('selected TypeScript case', () => { if (value !== 42) throw new Error('bad value'); });
    test('excluded case', () => { throw new Error('filter was not forwarded'); });
  `);
  fs.writeFileSync(path.join(directory, 'helper.ts'), 'throw new Error("helper must not run");');
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'test.ts'),
    directory, '--test-name-pattern=selected TypeScript case'], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /selected TypeScript case/);
  assert.match(result.stdout, /# pass 1/);
});

test('test runner preserves test failures and rejects an empty selection', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-runner-failure-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath,
    ['--import', 'tsx', path.join(__dirname, 'test.ts'), directory], { encoding: 'utf8' });
  const empty = run();
  assert.ifError(empty.error);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /No TypeScript tests found/);
  fs.writeFileSync(path.join(directory, 'failure.test.ts'),
    "require('node:test').test('synthetic failure', () => { throw new Error('expected failure'); });");
  const failed = run();
  assert.ifError(failed.error);
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /expected failure/);
});
