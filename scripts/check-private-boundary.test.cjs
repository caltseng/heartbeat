const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const { checkBoundary, OUTPUT_ROOTS } = require('./check-private-boundary.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  function write(file, contents = 'synthetic') {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return target;
  }
  return { root, write };
}

test('private ignored workflow stays local, including reports and graph files', t => {
  const f = fixture(t);
  f.write('.gitignore', '.private/\n');
  for (const file of ['config.local.json', 'request.synthetic.json', 'operation.synthetic.json', 'collection.json',
    'collection.lock', 'identity-review.json', 'identity-review.lock', 'identity-review.json.123.tmp',
    'curated.json', 'curated.lock', 'curated.json.123.tmp',
    'identity-review.json.lock', 'identity-review.json.tmp', 'google-acquisition.json',
    'google-acquisition.lock', 'google-acquisition.json.123.tmp', 'google-handoff-synthetic.json',
    'whatsapp-registry.synthetic.json', 'whatsapp-conversion.lock', 'whatsapp.synthetic.json',
    'whatsapp.synthetic.json.12345678-abcd.tmp', 'request.synthetic.json.12345678-abcd.tmp',
    'handoff.json', 'checkpoint.json', 'aggregates.json', 'aggregate.synthetic.json',
    'aggregates.12345678-1234-1234-1234-123456789abc.tmp', 'report.json', 'graph.html', 'graph.svg']) {
    f.write(path.join('.private', 'contacts', 'synthetic', file));
  }
  f.write(path.join('docs', 'spec', 'contacts-local-workflow.md'));
  f.write(path.join('scripts', 'contacts', 'fixtures', 'email-gate.synthetic.json'), '{}');
  f.write(path.join('.private', 'contacts', '.email-staging-synthetic', 'opaque.bin'));
  fs.mkdirSync(path.join(f.root, 'dist'));
  assert.doesNotThrow(() => checkBoundary(f.root));
  execFileSync('git', ['add', '--force', '.private'], { cwd: f.root });
  assert.throws(() => checkBoundary(f.root), /Private operational artifact/);
});

test('all public output roots reject docs, tooling, private data, checkpoints and graphs', t => {
  const f = fixture(t);
  const artifacts = ['docs/spec/contacts-local-workflow.md', 'scripts/contacts/collect.cjs',
    '.github/skills/contacts-collect/SKILL.md',
    '.private/contacts/collection.json', 'collection.lock', 'graph.html', 'graph.svg',
    '.email-staging-synthetic/opaque.bin',
    'renamed-dataset.bin'];
  for (const output of OUTPUT_ROOTS) {
    for (const artifact of artifacts) {
      f.write(path.join(output, ...artifact.split('/')));
      assert.throws(() => checkBoundary(f.root), /Public output must/);
      fs.rmSync(path.join(f.root, output), { recursive: true });
    }
  }
});

test('reserved private handoffs fail outside ignored storage', t => {
  const f = fixture(t);
  for (const name of ['request.json', 'request.synthetic.json', 'operation.json', 'operation.synthetic.json', 'collection.json', 'collection.lock',
    'collection.json.123.tmp', 'config.local.json', 'identity-review.json', 'identity-review.lock',
    'identity-review.json.123.tmp', 'identity-review.json.lock', 'identity-review.json.tmp',
    'curated.json', 'curated.lock', 'curated.json.123.tmp',
    'google-acquisition.json', 'google-acquisition.lock', 'google-acquisition.json.123.tmp',
    'google-handoff-synthetic.json', 'google-handoff-synthetic.json.123.tmp',
    'whatsapp-registry.synthetic.json', 'whatsapp-registry.synthetic.json.12345678-abcd.tmp',
    'whatsapp-conversion.lock', 'whatsapp.synthetic.json', 'whatsapp.synthetic.json.12345678-abcd.tmp',
    'request.synthetic.json.12345678-abcd.tmp',
    'handoff.json', 'checkpoint.json', 'aggregates.json', 'aggregate.json', 'aggregate.synthetic.json',
    'aggregates.12345678-1234-1234-1234-123456789abc.tmp',
    'report.json', 'graph.html', 'graph.svg', '.env.local', 'private.key']) {
    const target = f.write(path.join('accidental', name));
    assert.throws(() => checkBoundary(f.root), /Private operational artifact/);
    fs.unlinkSync(target);
  }
  f.write(path.join('accidental', '.email-staging-synthetic', 'opaque.bin'));
  assert.throws(() => checkBoundary(f.root), /Private operational artifact/);
});

test('WhatsApp acquisition bundle remains private even if its handoff is renamed', t => {
  const f = fixture(t);
  f.write(path.join('accidental', `acquisition-${'a'.repeat(64)}`, 'renamed.bin'));
  assert.throws(() => checkBoundary(f.root), /Private operational artifact/);
});

test('additional output locations, filesystem redirects and CLI errors fail closed', t => {
  const f = fixture(t);
  const output = path.join(f.root, 'custom-export');
  assert.doesNotThrow(() => checkBoundary(f.root, [output]));
  f.write(path.join('custom-export', 'renamed.txt'));
  assert.throws(() => checkBoundary(f.root, [output]), /Public output must/);
  fs.symlinkSync(output, path.join(f.root, 'public'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => checkBoundary(f.root), /Public output must/);
  fs.unlinkSync(path.join(f.root, 'public'));
  f.write('dist', '');
  assert.throws(() => checkBoundary(f.root), /Public output must/);
  const cli = path.join(__dirname, 'check-private-boundary.cjs');
  const result = spawnSync(process.execPath, [cli, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Public output must/);
  const bad = spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Usage:/);
});

test('documented synthetic collection-to-review-to-aggregation handoff stays private and pins unchanged inputs', t => {
  const f = fixture(t);
  f.write('.gitignore', '.private/\n');
  const demo = path.join(f.root, '.private', 'contacts', 'demo');
  const collector = path.join(__dirname, 'contacts', 'collect.cjs');
  const reviewer = path.join(__dirname, 'contacts', 'identity-review.cjs');
  function run(cli, args) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  run(collector, ['--demo', '--output', demo]);
  run(collector, ['--request', path.join(demo, 'request.synthetic.json')]);
  const snapshot = fs.readFileSync(path.join(demo, 'collection.json'));
  const request = { schemaVersion: 1, dataClass: 'synthetic', collection: 'collection.json',
    output: '../reviewed', expectedRevision: 0,
    reason: 'Register synthetic identities separately; no matching decisions.', operations: [] };
  const requestFile = f.write(path.join('.private', 'contacts', 'demo', 'review.synthetic.json'), JSON.stringify(request));
  const inspection = run(reviewer, ['--inspect', requestFile]);
  request.expectedRevision = inspection.revision;
  request.collectionDigest = inspection.collectionDigest;
  fs.writeFileSync(requestFile, JSON.stringify(request));
  const result = run(reviewer, ['--request', requestFile]);
  const mapping = JSON.parse(fs.readFileSync(result.file, 'utf8'));
  assert.equal(mapping.schemaVersion, 1);
  assert.equal(mapping.dataClass, 'synthetic');
  assert.equal(mapping.revision, 1);
  assert.equal(mapping.collectionDigest, inspection.collectionDigest);
  const mappingBytes = fs.readFileSync(result.file);
  const aggregationRequest = {
    schemaVersion: 1, dataClass: 'synthetic', collection: 'collection.json',
    mapping: '../reviewed/identity-review.json', identityMappingRevision: 1,
    period: { preset: '7d', timeZone: 'America/Los_Angeles', asOf: '2026-11-24T20:00:00Z' },
    output: '../reports/run-001'
  };
  const aggregationFile = f.write(path.join('.private', 'contacts', 'demo', 'aggregate.synthetic.json'),
    JSON.stringify(aggregationRequest));
  const aggregated = run(path.join(__dirname, 'contacts', 'aggregate.cjs'), ['--request', aggregationFile]);
  const dataset = JSON.parse(fs.readFileSync(aggregated.file, 'utf8'));
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(dataset.dataClass, 'synthetic');
  assert.equal(dataset.collectionDigest, inspection.collectionDigest);
  assert.equal(dataset.identityMappingRevision, 1);
  assert.equal(dataset.totals.observedMessages, 4);
  assert.equal(dataset.audit.uniqueSourceEvents, 4);
  assert.deepEqual(fs.readFileSync(result.file), mappingBytes);
  assert.deepEqual(fs.readFileSync(path.join(demo, 'collection.json')), snapshot);
  assert.doesNotThrow(() => checkBoundary(f.root));
  execFileSync('git', ['add', '--force', path.relative(f.root, result.file)], { cwd: f.root });
  assert.throws(() => checkBoundary(f.root), /Private operational artifact/);
});
