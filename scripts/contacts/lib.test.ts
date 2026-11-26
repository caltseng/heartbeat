import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readJSON, readJSONValue, readJSONWithDigest, openLock, releaseLock,
  persist, publishText, CollectionError, createGuard, createValidators,
  createError, isError, createCodeGuard, createCodeValidators, instant } from './lib.ts';
import { ConversionError as TextConversionError } from './text-xml.ts';
import { ConversionError as WhatsAppConversionError } from './whatsapp.ts';

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-lib-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

test('shared validators retain command messages, identifier bounds and canonical timestamp policies', () => {
  const validators = createValidators(createGuard('invalid_curation'), {
    fieldsMessage: label => `Invalid ${label} fields.`,
    identifierMessage: 'Invalid curated identifier.',
    canonicalInstant: true, instantMessage: 'Invalid capture instant.'
  });
  for (const value of [null, [], 'text', { unexpected: true }]) {
    assert.throws(() => validators.object(value, ['allowed'], 'note'),
      { code: 'invalid_curation', message: 'Invalid note fields.' });
  }
  validators.object({ allowed: null }, ['allowed'], 'note');
  assert.equal(validators.text(' original note ', 'note'), ' original note ');
  assert.throws(() => validators.text(' \n', 'note'),
    { code: 'invalid_curation', message: 'note must be nonempty text.' });
  assert.equal(validators.identifier('a' + '1'.repeat(95)), 'a' + '1'.repeat(95));
  for (const value of ['a'.repeat(97), 'A', 'a_b', 'a b', null]) {
    assert.throws(() => validators.identifier(value),
      { code: 'invalid_curation', message: 'Invalid curated identifier.' });
  }
  assert.equal(validators.instant('2026-01-02T03:04:05.000Z'), '2026-01-02T03:04:05.000Z');
  for (const value of ['2026-01-02T03:04:05Z', '2026-01-02T04:04:05.000+01:00', '2026-02-30T00:00:00.000Z', null]) {
    assert.throws(() => validators.instant(value),
      { code: 'invalid_curation', message: 'Invalid capture instant.' });
  }
  assert.equal(instant('2026-01-02T04:04:05+01:00', 'timestamp'), '2026-01-02T03:04:05.000Z');
  assert.throws(() => instant('2026-02-30T00:00:00Z', 'timestamp'), { code: 'invalid_input' });
});

test('code-oriented validators preserve override codes, converter statuses and strict Messenger instants', () => {
  const failure = createError('messenger', code => `Messenger conversion failed [${code}].`);
  const guard = createCodeGuard('invalid_manifest', failure);
  const validators = createCodeValidators(guard, 'invalid_manifest');
  assert.throws(() => validators.object({ extra: true }, [], 'unsupported_layout'),
    { code: 'unsupported_layout', message: 'Messenger conversion failed [unsupported_layout].' });
  for (const value of ['2026-01-02T03:04:05Z', '+010000-01-02T03:04:05.000Z', '2026-02-30T03:04:05.000Z']) {
    assert.throws(() => validators.instant(value), { code: 'invalid_manifest' });
  }
  assert.equal(validators.instant('2026-01-02T03:04:05.000Z'), '2026-01-02T03:04:05.000Z');
  assert.throws(() => guard(false, 'missing_time_evidence', 'requires_setup'),
    { code: 'missing_time_evidence', status: 'requires_setup' });
});

test('one shared error type preserves adapter catch boundaries and retryability', () => {
  const google = createError('google');
  const email = createError('email', code => `Email acquisition failed [${code}].`);
  const error = google('quota_exhausted', 'failed', true);
  assert.ok(error instanceof CollectionError);
  assert.equal(error.retryable, true);
  assert.equal(isError(error, 'google'), true);
  assert.equal(isError(error, 'email'), false);
  assert.equal(isError(new CollectionError('invalid_input'), 'google'), false);
  assert.equal(isError(Object.assign(new Error('external'), { code: 'quota_exhausted' }), 'google'), false);
  assert.equal(email('metadata_incomplete').message, 'Email acquisition failed [metadata_incomplete].');
});

test('exported converter error constructors retain status arguments and converter-specific instance checks', () => {
  for (const [Constructor, other, domain] of [
    [TextConversionError, WhatsAppConversionError, 'text-xml'],
    [WhatsAppConversionError, TextConversionError, 'whatsapp']
  ] as const) {
    for (const status of [undefined, 'requires_setup', 'unsupported']) {
      const error = new Constructor('missing_time_evidence', status);
      assert.equal(error.code, 'missing_time_evidence');
      assert.equal(error.message, 'missing_time_evidence');
      assert.equal(error.status, status ?? 'failed');
      assert.ok(error instanceof CollectionError);
      assert.ok(error instanceof Constructor);
      assert.equal(error instanceof other, false);
      assert.equal(isError(error, domain), true);
    }
    assert.ok(createError(domain)('invalid_utf8') instanceof Constructor);
    assert.equal(new CollectionError('invalid_input') instanceof Constructor, false);
  }
});

test('JSON helpers accept one leading BOM without changing byte digests or caller error contracts', t => {
  const file = path.join(fixture(t), 'input.json');
  const bom = String.fromCodePoint(0xfeff);
  const raw = `${bom}{ "synthetic": true }\n`;
  fs.writeFileSync(file, raw);
  const expected = { value: { synthetic: true },
    digest: crypto.createHash('sha256').update(raw).digest('hex') };
  assert.deepEqual(readJSON(file), expected);
  assert.deepEqual(readJSONWithDigest(file), expected);
  assert.deepEqual(readJSONValue(file), expected.value);
  fs.writeFileSync(file, bom + raw);
  assert.throws(() => readJSONValue(file), SyntaxError);
  assert.throws(() => readJSON(file), { code: 'invalid_json' });
  fs.unlinkSync(file);
  assert.throws(() => readJSONValue(file), { code: 'ENOENT' });
  assert.throws(() => readJSON(file), { code: 'input_unreadable' });
});

test('lock conflicts keep the existing lock and caller error; other I/O errors propagate', t => {
  const folder = fixture(t), lock = path.join(folder, 'store.lock');
  const conflict = Object.assign(new Error('Synthetic lock conflict.'), { code: 'conversion_locked' });
  const fd = openLock(lock, () => conflict);
  try {
    fs.writeFileSync(fd, 'synthetic owner');
    assert.throws(() => openLock(lock, () => conflict), error => error === conflict);
    releaseLock(lock, undefined);
    assert.equal(fs.readFileSync(lock, 'utf8'), 'synthetic owner');
  } finally { releaseLock(lock, fd); }
  assert.equal(fs.existsSync(lock), false);
  assert.throws(() => openLock(path.join(folder, 'missing', 'store.lock'), () => conflict), { code: 'ENOENT' });
});

test('atomic persistence preserves the snapshot and removes only its own temporary on failure', t => {
  const folder = fixture(t), file = path.join(folder, 'state.json');
  const temporary = `${file}.${process.pid}.tmp`;
  persist(file, { revision: 1 });
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(temporary, 'another writer');
  assert.throws(() => persist(file, { revision: 2 }), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.readFileSync(temporary, 'utf8'), 'another writer');
  fs.unlinkSync(temporary);
  const failure = Object.assign(new Error('Synthetic rename failure.'), { code: 'EIO' });
  const rename = t.mock.method(fs, 'renameSync', () => { throw failure; });
  try {
    assert.throws(() => persist(file, { revision: 2 }), error => error === failure);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.existsSync(temporary), false);
  } finally { rename.mock.restore(); }
  persist(file, { revision: 2 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "revision": 2\n}\n');
});

test('immutable publication never replaces a destination and cleans up after failed publication', t => {
  const folder = fixture(t), file = path.join(folder, 'report.json');
  publishText(file, 'synthetic original\n');
  assert.throws(() => publishText(file, 'replacement\n'), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(file, 'utf8'), 'synthetic original\n');
  assert.deepEqual(fs.readdirSync(folder), ['report.json']);
});

test('CLI wrapper preserves synchronous and asynchronous status and caller-sanitized failures', () => {
  const library = JSON.stringify(path.join(__dirname, 'lib.ts'));
  for (const [action, expected] of [
    ['() => 0', 0], ['async () => 2', 2],
    ['() => { throw new Error("not for output"); }', 1],
    ['async () => { throw new Error("not for output"); }', 1]
  ]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e',
      `require(${library}).runCLI(${action}, () => { process.stderr.write('sanitized\\n'); return 1; });`
    ], { encoding: 'utf8' });
    assert.equal(result.status, expected);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, expected === 1 ? 'sanitized\n' : '');
  }
});
