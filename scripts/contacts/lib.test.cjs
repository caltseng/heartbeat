const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { readJSON, readJSONValue, readJSONWithDigest, openLock, releaseLock,
  persist, publishText } = require('./lib.cjs');

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-lib-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

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
  const library = JSON.stringify(path.join(__dirname, 'lib.cjs'));
  for (const [action, expected] of [
    ['() => 0', 0], ['async () => 2', 2],
    ['() => { throw new Error("not for output"); }', 1],
    ['async () => { throw new Error("not for output"); }', 1]
  ]) {
    const result = spawnSync(process.execPath, ['-e',
      `require(${library}).runCLI(${action}, () => { process.stderr.write('sanitized\\n'); return 1; });`
    ], { encoding: 'utf8' });
    assert.equal(result.status, expected);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, expected === 1 ? 'sanitized\n' : '');
  }
});
