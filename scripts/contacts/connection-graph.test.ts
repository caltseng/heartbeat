import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hash } from './lib.ts';
import { profileKey, readProfilePhotos, connectionModel } from './connection-graph.ts';
import { projectGoogleCSV, importContactCSV } from './contact-csv.ts';
import { renderDashboard } from './contact-dashboard.ts';

const now = '2026-11-26T12:00:00.000Z';
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic fixture image')]);
const photoName = `profile-photo-${'a'.repeat(64)}.png`;
const muse = (selfIds?: string[]) => ({ source: 'messenger' as const, retrievedAt: now, gaps: ['Synthetic gap'], ...(selfIds ? { selfIds } : {}),
  records: [
    { chatType: 'one_to_one' as const, reportedChatId: 'direct', reportedLatestSentAt: now, nativeEvidenceVerified: false as const,
      participants: [{ name: 'Owner Fixture', id: '100001' }, { name: '<b>Ada</b> Fixture', id: 'https://www.facebook.com/Ada.Fixture' }] },
    { chatType: 'group' as const, reportedChatId: 'group', reportedLatestSentAt: null, nativeEvidenceVerified: false as const,
      participants: [{ name: 'Owner Fixture', id: '100001' }, { name: '<b>Ada</b> Fixture', id: 'https://www.facebook.com/other.fixture' },
        { name: 'Name Only', id: null }, { name: 'Ada Fixture', id: 'https://www.facebook.com/ada.fixture/' }] },
    { chatType: 'group' as const, reportedChatId: 'group-2', reportedLatestSentAt: '2026-11-16T12:00:00.000Z', nativeEvidenceVerified: false as const,
      participants: [{ name: 'Name Only', id: null }] }
  ] });
const manifest = (dataClass: string, extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, dataClass,
  kind: 'facebook-profile-photo-assets', inputDigest: 'x', observedAt: now, retrievedAt: now, coverage: 'partial', attempts: 1, gaps: [],
  limitations: [], profiles: [{ profileReference: 'https://www.facebook.com/ada.fixture', displayName: 'Ada Fixture',
    friendshipEvidence: 'friends-list', pictureReference: null, status: 'saved', file: photoName, digest: hash(png), ...extra }] });
const photos = { inputDigest: 'x', photos: [{ key: 'user:ada.fixture', file: photoName, bytes: png, digest: hash(png) }] };

test('profile keys use exact native Facebook references and never derive identity from names', () => {
  assert.equal(profileKey('https://www.facebook.com/Ada.Fixture/'), 'user:ada.fixture');
  assert.equal(profileKey('https://www.facebook.com/profile.php?id=1234567'), 'id:1234567');
  assert.equal(profileKey('https://www.facebook.com/people/Ada-Fixture/1234567/'), 'id:1234567');
  assert.equal(profileKey('1234567'), 'id:1234567');
  for (const value of ['Ada Fixture', 'ada.fixture', 'https://www.facebook.com/friends', 'https://evil.example/ada.fixture', 'http://www.facebook.com/ada.fixture']) {
    assert.equal(profileKey(value), null, value);
  }
});

test('concentric graph keeps group membership spoke-free, excludes self IDs and attaches faces only by exact profile ID', () => {
  const model = connectionModel(null, [muse(['https://www.facebook.com/profile.php?id=100001'])], photos);
  assert.equal(model.selfIdentified, true);
  assert.ok(!model.nodes.some(node => node.label === 'Owner Fixture'));
  const ada = model.nodes.filter(node => node.label.includes('Ada'));
  assert.equal(ada.length, 2, 'same display name with different IDs never merges');
  const direct = ada.find(node => node.kind === 'direct');
  assert.equal(direct.photo, photoName);
  assert.equal(direct.chats.length, 2, 'exact profile ID joins the person across chats');
  assert.equal(ada.find(node => node.kind === 'group').photo, null, 'same name with another profile never gets the photo');
  assert.equal(model.nodes.filter(node => node.label === 'Name Only').length, 2, 'ID-less participants stay chat-local');
  assert.equal(model.linkedPhotos.length, 1);
  assert.equal(model.asOf, '2026-11-26');
  assert.deepEqual([direct.ring, direct.lastActivity], ['today', '2026-11-26'], 'ring is the latest shared-chat day');
  assert.equal(ada.find(node => node.kind === 'group').ring, 'unknown', 'no returned date stays unknown, not old');
  const older = model.nodes.find(node => node.label === 'Name Only' && node.lastActivity !== null);
  assert.equal(older.ring, 'fortnight');
  assert.match(older.lastNote, /10 days ago · latest group-chat activity, not necessarily with them/);
  const unidentified = connectionModel(null, [muse()], photos);
  assert.equal(unidentified.selfIdentified, false);
  assert.equal(unidentified.nodes.filter(node => node.label === 'Owner Fixture').length, 1);

  const html = renderDashboard(projectGoogleCSV(Buffer.from('Name\nFixture\n'), 'synthetic', now), null, [], [muse(['100001'])], photos);
  assert.match(html, /script-src 'sha256-[^']+' 'sha256-[^']+'; style-src 'unsafe-inline'; img-src 'self';/);
  assert.equal(html.match(/<image href="photos\//g).length, 1);
  assert.equal(html.match(/data-spoke=/g).length, 1, 'only the one-to-one participant gets a spoke');
  assert.ok(!html.includes('<b>Ada</b>'));
  assert.ok(html.includes('never by name or face'));
});

test('saved photos require native friendship evidence, matching digests and image signatures', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-photos-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'profile-photos.json');
  fs.writeFileSync(path.join(folder, photoName), png);
  fs.writeFileSync(file, JSON.stringify(manifest('synthetic')));
  assert.equal(readProfilePhotos(file, 'synthetic').photos[0].key, 'user:ada.fixture');
  assert.throws(() => readProfilePhotos(file, 'private'), /Invalid saved profile photo/);
  for (const [extra, pattern] of [[{ digest: 'b'.repeat(64) }, /digest/], [{ friendshipEvidence: 'name-match' }, /natively confirmed/],
    [{ file: '../x.png' }, /Invalid saved photo/], [{ profileReference: 'Ada Fixture' }, /distinct observed profile/]] as const) {
    fs.writeFileSync(file, JSON.stringify(manifest('synthetic', extra)));
    assert.throws(() => readProfilePhotos(file, 'synthetic'), pattern);
  }
  fs.writeFileSync(path.join(folder, photoName), Buffer.from('not an image'));
  fs.writeFileSync(file, JSON.stringify(manifest('synthetic', { digest: hash(Buffer.from('not an image')) })));
  assert.throws(() => readProfilePhotos(file, 'synthetic'), /signature/);
});

test('private preview copies only exactly linked photos beside the dashboard', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-preview-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const input = path.join(folder, 'fixture.csv'), output = path.join(folder, 'output'), photoDir = path.join(folder, 'photos');
  fs.writeFileSync(input, 'Name\nFixture\n'); fs.mkdirSync(output); fs.mkdirSync(photoDir);
  const unlinked = `profile-photo-${'c'.repeat(64)}.png`;
  fs.writeFileSync(path.join(photoDir, photoName), png); fs.writeFileSync(path.join(photoDir, unlinked), png);
  const saved = manifest('private');
  saved.profiles.push({ ...saved.profiles[0], profileReference: 'https://www.facebook.com/someone.else', file: unlinked });
  fs.writeFileSync(path.join(photoDir, 'profile-photos.json'), JSON.stringify(saved));
  const { gaps, retrievedAt, ...rest } = muse(['100001']);
  const museFile = path.join(folder, 'muse.private.json');
  fs.writeFileSync(museFile, JSON.stringify({ schemaVersion: 1, dataClass: 'private', kind: 'muse-reported-chat-recency',
    retrievedAt, requestedPeriod: 'last 14 days', coverage: 'partial', gaps, ...rest }));
  importContactCSV(input, output, undefined, [museFile], path.join(photoDir, 'profile-photos.json'));
  const preview = path.join(output, 'preview');
  assert.deepEqual(fs.readdirSync(path.join(preview, 'photos')), [photoName]);
  assert.deepEqual(fs.readFileSync(path.join(preview, 'photos', photoName)), png);
  const record = JSON.parse(fs.readFileSync(path.join(preview, 'contact-import.json'), 'utf8')).profilePhotos;
  assert.deepEqual([record.saved, record.linked, record.directory], [2, 1, 'photos']);
});
