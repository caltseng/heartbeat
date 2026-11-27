import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hash } from './lib.ts';
import { readGooglePhotos, matchGooglePhotos } from './google-photos.ts';
import { connectionModel } from './connection-graph.ts';
import { projectGoogleCSV, importContactCSV } from './contact-csv.ts';
import { renderDashboard } from './contact-dashboard.ts';
import type { GmailSource } from './gmail-metadata.ts';

const now = '2026-11-27T12:00:00.000Z';
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic raster fixture')]);
const digest = hash(png), filename = `google-photo-${digest}.png`;
const asset = () => ({ url: 'https://lh3.googleusercontent.com/fixture', default: false,
  sourceType: 'CONTACT', redirectUrls: [] as string[], file: filename, sha256: digest });
const connection = (id = 'fixture') => ({ resourceName: `people/${id}`,
  emailAddresses: [{ value: 'ada@example.invalid' }], phoneNumbers: [{ value: '+1 (202) 555-0100' }], photos: [asset()] });
const manifest = (dataClass = 'synthetic') => ({ schemaVersion: 1, dataClass, kind: 'google-connections-photo-assets',
  observedAt: now, coverage: 'partial', connections: [connection()] });
function fixture(t: { after: (fn: () => void) => void }, value = manifest()) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-google-photo-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'google-photos.json');
  fs.writeFileSync(file, JSON.stringify(value));
  fs.writeFileSync(path.join(folder, filename), png);
  return { folder, file, read: () => readGooglePhotos(file, value.dataClass) };
}
const person = (...addresses: [string, string][]) => ({ addresses: addresses.map(([type, value]) => ({ type, value })) });
const gmail = (): GmailSource => ({ account: 'owner@example.invalid',
  coverage: { start: '2026-11-01T00:00:00Z', end: now, completeness: 'partial', basis: 'synthetic fixture' },
  observations: [{ timestamp: '2026-11-26T12:00:00Z', direction: 'sent', from: 'owner@example.invalid',
    to: ['ada@example.invalid'], cc: [] }] });

test('saved Google bundle validates hashes, defaults and CONTACT preference without network access', t => {
  const profileBytes = Buffer.concat([png, Buffer.from('other synthetic picture')]), profileDigest = hash(profileBytes);
  const value = manifest(), profile = { ...asset(), sourceType: 'PROFILE',
    file: `google-photo-${profileDigest}.png`, sha256: profileDigest };
  value.connections[0].photos = [profile, asset(), { ...asset(), default: true, file: null, sha256: null }];
  const { read, file, folder } = fixture(t, value);
  fs.writeFileSync(path.join(folder, profile.file), profileBytes);
  const saved = read();
  assert.equal(saved.inputDigest, hash(fs.readFileSync(file)));
  assert.equal(saved.saved, 2);
  assert.equal(saved.skippedDefault, 1);
  assert.equal(saved.connections[0].photo.file, filename);
  value.connections[0].photos = [profile];
  fs.writeFileSync(file, JSON.stringify(value));
  assert.equal(read().connections[0].photo.file, profile.file, 'PROFILE is a fallback');
  value.connections[0].photos = [asset(), asset(), profile];
  fs.writeFileSync(file, JSON.stringify(value));
  assert.equal(read().connections[0].photo, null, 'ambiguous CONTACT photos do not fall through to PROFILE');
  value.connections[0].photos = [{ ...asset(), default: true, file: null, sha256: null }];
  fs.writeFileSync(file, JSON.stringify(value));
  assert.equal(read().connections[0].photo, null, 'default-only connection is never attached');
});

test('Google bundle rejects remote/credential/redirect, path, digest, signature and bounded-size violations', t => {
  const { file, folder, read } = fixture(t);
  const reject = (edit: (value: ReturnType<typeof manifest>) => void) => {
    const value = manifest(); edit(value);
    fs.writeFileSync(file, JSON.stringify(value));
    assert.throws(read);
  };
  for (const url of ['http://lh3.googleusercontent.com/a', 'https://googleusercontent.com/a',
    'https://lh3.googleusercontent.com.evil.invalid/a', 'https://user:pass@lh3.googleusercontent.com/a',
    'https://lh3.googleusercontent.com/a?access_token=secret', 'https://evil.invalid/a']) {
    reject(value => { value.connections[0].photos[0].url = url; });
  }
  reject(value => { value.connections[0].photos[0].redirectUrls = ['https://evil.invalid/a']; });
  reject(value => { value.connections[0].photos[0].redirectUrls = Array(4).fill(asset().url); });
  reject(value => { Object.assign(value.connections[0].photos[0], { cookies: 'not permitted' }); });
  reject(value => { value.connections[0].photos[0].file = `..\\${filename}`; });
  reject(value => { value.connections[0].photos[0].sha256 = 'a'.repeat(64); });
  reject(value => { value.connections.push(connection()); });
  reject(value => { value.connections = Array.from({ length: 101 }, (_, i) => connection(`fixture${i}`)); });
  reject(value => { value.connections[0].photos = Array.from({ length: 101 }, asset); });
  reject(value => { value.connections[0].emailAddresses = Array(101).fill({ value: 'a@example.invalid' }); });
  fs.writeFileSync(file, JSON.stringify(manifest()));
  fs.writeFileSync(path.join(folder, filename), Buffer.alloc(5 * 1024 * 1024 + 1));
  assert.throws(read, /bounded/);
  fs.writeFileSync(path.join(folder, filename), Buffer.from('not the saved image'));
  assert.throws(read, /sha256 mismatch/);
  const invalid = Buffer.from('not a raster image signature'), invalidDigest = hash(invalid);
  const value = manifest();
  value.connections[0].photos[0] = { ...asset(), file: `google-photo-${invalidDigest}.png`, sha256: invalidDigest };
  fs.writeFileSync(path.join(folder, value.connections[0].photos[0].file), invalid);
  fs.writeFileSync(file, JSON.stringify(value));
  assert.throws(read, /signature/);
});

test('Google photos match exact normalized email/phone only and preserve all ambiguity', t => {
  const { read } = fixture(t), bundle = read(), email = person(['email', ' ada@EXAMPLE.INVALID ']),
    phone = person(['phone', '+12025550100']);
  assert.equal(matchGooglePhotos([email], bundle).get(email).file, filename);
  assert.equal(matchGooglePhotos([phone], bundle).get(phone).file, filename);
  assert.equal(matchGooglePhotos([email, phone], bundle).size, 0, 'one connection matching two people is ambiguous');
  assert.equal(matchGooglePhotos([email, person(['email', 'ada@example.invalid'])], bundle).size, 0, 'shared address');
  assert.equal(matchGooglePhotos([person(['phone', '2025550100'])], bundle).size, 0, 'no country inference');
  assert.equal(matchGooglePhotos([person(['email', 'ada+tag@example.invalid'])], bundle).size, 0, 'no mailbox alias inference');
  assert.equal(matchGooglePhotos([person(['email', 'ADA@example.invalid'])], bundle).size, 0, 'email local-part case is preserved');
  assert.equal(matchGooglePhotos([{ displayName: 'Ada', addresses: [] }], bundle).size, 0, 'no name matching');
  const duplicate = { ...bundle.connections[0], resourceName: 'people/second', photo: null };
  assert.equal(matchGooglePhotos([email], { ...bundle, connections: [...bundle.connections, duplicate] }).size, 0,
    'a connection without a selected photo still blocks shared evidence');
  const other = { ...duplicate, addresses: [{ type: 'phone', value: '+12025550101' }] };
  assert.equal(matchGooglePhotos([person(['email', 'ada@example.invalid'], ['phone', '+12025550101'])],
    { ...bundle, connections: [...bundle.connections, other] }).size, 0, 'multiple connections matching one person stay unresolved');
});

test('graph uses exact address evidence including unique saved-contact phone bridge, not names; Facebook wins', t => {
  const { read } = fixture(t), bundle = read();
  const build = (photos = bundle, contacts = [], facebook = null, muse = [], links = null) =>
    connectionModel(null, muse, facebook, 'UTC', null, null, gmail(), links, contacts, photos);
  assert.equal(build().nodes[0].photo, filename);
  assert.match(build().nodes[0].identityNote, /exact connection email\/phone/);
  const phoneOnly = { ...bundle, connections: bundle.connections.map(row => ({ ...row,
    addresses: row.addresses.filter(address => address.type === 'phone') })) };
  const contacts = [{ displayName: 'Different name', addresses: [
    { type: 'email', value: 'ada@example.invalid' }, { type: 'phone', value: '+12025550100' }] }];
  assert.equal(build(phoneOnly, contacts).nodes[0].photo, filename, 'phone matches same saved contact, never a name');
  assert.equal(build(phoneOnly).nodes[0].photo, null, 'no phone identity exists without contact bridge');
  assert.equal(build(phoneOnly, [...contacts, { displayName: 'Other', addresses: [
    { type: 'phone', value: '+12025550100' }] }]).nodes[0].photo, null, 'unshown contact still makes shared phone ambiguous');
  const nameOnly = { ...bundle, connections: bundle.connections.map(row => ({ ...row, addresses: [] })) };
  assert.equal(build(nameOnly, contacts).nodes[0].photo, null);
  const facebook = { inputDigest: 'fixture', photos: [{ key: 'id:123456', file: 'profile-photo-fixture.png', bytes: png, digest }] };
  const muse = [{ source: 'messenger' as const, records: [{ chatType: 'direct', reportedChatId: 'fixture',
    participants: [{ id: '123456', name: 'Ada' }], reportedLatestSentAt: now }] }];
  const links = { people: [{ displayName: 'Ada', members: [{ source: 'gmail' as const, address: 'ada@example.invalid' },
    { source: 'messenger' as const, reportedChatId: 'fixture', participantIndex: 0, participantName: 'Ada' }] }] };
  const model = build(bundle, [], facebook, muse, links);
  assert.equal(model.nodes.length, 1);
  assert.equal(model.nodes[0].photo, 'profile-photo-fixture.png');
  assert.equal(model.linkedPhotos.length, 1);
});

test('CSV Google bundle option copies only attached hashed assets and records counts with CSP unchanged', t => {
  const { folder, file } = fixture(t, manifest('private'));
  const input = path.join(folder, 'contacts.csv'), gmailFile = path.join(folder, 'gmail.json'), output = path.join(folder, 'output');
  fs.mkdirSync(output);
  fs.writeFileSync(input, 'Name,E-mail 1 - Value\nAda,ada@example.invalid\n');
  fs.writeFileSync(gmailFile, JSON.stringify({ ...gmail(), dataClass: 'private', source: 'email' }));
  const result = importContactCSV(input, output, undefined, [], undefined, 'UTC', undefined, undefined, gmailFile, undefined, file);
  const preview = path.join(output, 'preview'), html = fs.readFileSync(result.file, 'utf8');
  assert.deepEqual(fs.readFileSync(path.join(preview, 'photos', filename)), png);
  const report = JSON.parse(fs.readFileSync(path.join(preview, 'contact-import.json'), 'utf8'));
  assert.equal(report.googlePhotos.saved, 1);
  assert.equal(report.googlePhotos.linked, 1);
  assert.deepEqual(report.googlePhotos.assets, [{ file: filename, sha256: digest }]);
  const baseline = renderDashboard(projectGoogleCSV(fs.readFileSync(input), 'synthetic', now), null, []);
  const csp = (page: string) => page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(csp(html), csp(baseline));
  assert.ok(!html.includes('googleusercontent.com'), 'no remote photo URL is embedded');
  const output2 = path.join(folder, 'unattached'); fs.mkdirSync(output2);
  importContactCSV(input, output2, undefined, [], undefined, 'UTC', undefined, undefined, undefined, undefined, file);
  assert.ok(!fs.existsSync(path.join(output2, 'preview', 'photos')), 'no graph match means no copied photos');
  const output3 = path.join(folder, 'cli'); fs.mkdirSync(output3);
  const cli = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'contact-csv.ts'),
    '--input', input, '--output', output3, '--gmail', gmailFile, '--google-photos', file], { encoding: 'utf8' });
  assert.equal(cli.status, 2, cli.stderr);
  assert.deepEqual(fs.readFileSync(path.join(output3, 'preview', 'photos', filename)), png);
  assert.ok(!cli.stdout.includes('ada@example.invalid') && !cli.stderr.includes('googleusercontent'));
});
