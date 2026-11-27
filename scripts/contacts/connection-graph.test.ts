import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hash } from './lib.ts';
import { profileKey, readProfilePhotos, readPhotoLinks, readSelfLinks, connectionModel, connectionsPanel } from './connection-graph.ts';
import { projectGoogleCSV, importContactCSV } from './contact-csv.ts';
import { renderDashboard, readMuseRecency } from './contact-dashboard.ts';
import { photoLinkCandidates, confirmPhotoLinks } from './photo-links.ts';
import { selfLinkCandidates, confirmSelfLinks, saveOwnerNameRule } from './self-links.ts';

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
  const model = connectionModel(null, [muse(['https://www.facebook.com/profile.php?id=100001'])], photos, 'America/Los_Angeles');
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
  assert.match(older.lastNote, /10 days before its 2026-11-26 snapshot · latest group-chat activity, not necessarily with them/);
  const unidentified = connectionModel(null, [muse()], photos);
  assert.equal(unidentified.selfIdentified, false);
  assert.equal(unidentified.nodes.filter(node => node.label === 'Owner Fixture').length, 1);
  for (const selfIds of [['owner.handle'], ['https://www.facebook.com/profile.php?id=999999']]) {
    const unresolved = connectionModel(null, [muse(selfIds)], photos);
    assert.equal(unresolved.selfIdentified, false, 'self IDs that resolve to no drawn participant never claim identification');
    assert.equal(unresolved.nodes.filter(node => node.label === 'Owner Fixture').length, 1);
  }

  const html = renderDashboard(projectGoogleCSV(Buffer.from('Name\nFixture\n'), 'synthetic', now), null, [], [muse(['100001'])], photos);
  assert.match(html, /script-src 'sha256-[^']+' 'sha256-[^']+'; style-src 'unsafe-inline'; img-src 'self';/);
  assert.equal(html.match(/<image href="photos\//g).length, 1);
  assert.equal(html.match(/data-spoke=/g).length, 1, 'only the one-to-one participant gets a spoke');
  assert.ok(!html.includes('<b>Ada</b>'));
  assert.ok(html.includes('never by automatic name or face matching'));
});

test('owner-confirmed photo links attach faces to ID-less participants only where confirmed', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-links-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'links.json');
  const link = { source: 'messenger', reportedChatId: 'group-2', participantIndex: 0, participantName: 'Name Only',
    profileReference: 'https://www.facebook.com/ada.fixture' };
  const write = (links: unknown[], extra: Record<string, unknown> = {}) => fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1,
    dataClass: 'synthetic', kind: 'owner-confirmed-photo-links', photosInputDigest: 'x', confirmedAt: now, links, ...extra }));
  write([link]);
  const model = connectionModel(null, [muse()], photos, 'UTC', readPhotoLinks(file, 'synthetic', photos));
  const confirmed = model.nodes.filter(node => node.photo === photoName);
  assert.equal(confirmed.length, 1, 'the confirmed participant joins the exact-ID person rather than duplicating them');
  assert.equal(confirmed[0].chats.length, 3);
  assert.equal(confirmed[0].ring, 'today', 'the joined person keeps their latest shared activity');
  assert.equal(model.nodes.filter(node => node.label === 'Name Only' && node.photo === null).length, 1, 'unconfirmed same name stays separate');
  write([{ ...link, participantName: 'Someone Else' }]);
  assert.throws(() => connectionModel(null, [muse()], photos, 'UTC', readPhotoLinks(file, 'synthetic', photos)), /no longer matches/);
  write([{ ...link, participantIndex: 9 }]);
  assert.throws(() => connectionModel(null, [muse()], photos, 'UTC', readPhotoLinks(file, 'synthetic', photos)), /no matching/);
  write([{ ...link, profileReference: 'https://www.facebook.com/unsaved' }]);
  assert.throws(() => readPhotoLinks(file, 'synthetic', photos), /saved photo/);
  write([link], { photosInputDigest: 'y' });
  assert.throws(() => readPhotoLinks(file, 'synthetic', photos), /different photo manifest/);
});

test('recency rings use local calendar days against each source snapshot and never guess', () => {
  const chat = (chatType: string, at: string | null) => ({ chatType, reportedChatId: null, reportedLatestSentAt: at,
    nativeEvidenceVerified: false as const, participants: [{ name: `${chatType} ${at}`, id: null }] });
  const source = (retrievedAt: string, records: ReturnType<typeof chat>[]) => ({ source: 'messenger' as const, retrievedAt, records });
  const ring = (model: ReturnType<typeof connectionModel>, label: string) => model.nodes.find(node => node.label === label);
  const local = connectionModel(null, [source('2026-11-25T17:00:00-08:00', [chat('one_to_one', '2026-11-25T15:00:00-08:00'),
    chat('unknown', '2026-11-20T10:00:00-08:00'), chat('one_to_one', '2026-10-26T10:00:00-08:00'), chat('one_to_one', '2026-10-27T10:00:00-08:00')])],
  null, 'America/Los_Angeles');
  assert.equal(ring(local, 'one_to_one 2026-11-25T15:00:00-08:00').ring, 'today', 'same local day, despite a different UTC day');
  assert.equal(local.asOf, '2026-11-25');
  assert.match(ring(local, 'unknown 2026-11-20T10:00:00-08:00').lastNote, /chat of unknown type, not necessarily with them/);
  assert.equal(ring(local, 'one_to_one 2026-10-26T10:00:00-08:00').ring, 'older', '30 calendar days old is outside the last 30 days');
  assert.equal(ring(local, 'one_to_one 2026-10-27T10:00:00-08:00').ring, 'month');

  const noZone = connectionModel(null, [source('2026-11-25T17:00:00-08:00', [chat('one_to_one', '2026-11-25T15:00:00-08:00')])]);
  assert.equal(noZone.nodes[0].ring, 'unknown');
  assert.match(noZone.nodes[0].lastNote, /No time zone supplied/);

  const text = { period: { end: '2026-11-27T08:00:00.000Z', timeZone: 'America/Los_Angeles' },
    messages: [{ threadUiId: 't', inferredLocalDate: '2026-11-20', requestedWindowMembership: 'inferred-inside' }] };
  const mixed = connectionModel(text, [source('2026-10-20T12:00:00-07:00', [chat('one_to_one', '2026-10-20T09:00:00-07:00')])]);
  assert.equal(ring(mixed, 'one_to_one 2026-10-20T09:00:00-07:00').ring, 'today', 'an older source is not aged by a newer one');
  assert.equal(ring(mixed, 'Conversation 1').ring, 'week');
  assert.equal(mixed.asOf, '2026-10-20 to 2026-11-26');
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

test('photo-link review proposes unique exact-name pairs, and only approved numbers become links', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-link-review-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const photoDir = path.join(folder, 'photos'), review = path.join(folder, 'review'), other = `profile-photo-${'d'.repeat(64)}.png`;
  fs.mkdirSync(photoDir); fs.mkdirSync(review);
  fs.writeFileSync(path.join(photoDir, photoName), png); fs.writeFileSync(path.join(photoDir, other), png);
  const saved = manifest('private');
  saved.profiles.push({ ...saved.profiles[0], profileReference: 'https://www.facebook.com/bo.one', displayName: 'Bo Fixture', file: other },
    { ...saved.profiles[0], profileReference: 'https://www.facebook.com/bo.two', displayName: 'Bo Fixture', file: other });
  const photosFile = path.join(photoDir, 'profile-photos.json');
  fs.writeFileSync(photosFile, JSON.stringify(saved));
  const record = (id: string, participants: { name: string; id: string | null }[]) =>
    ({ chatType: 'group', reportedChatId: id, participants, reportedLatestSentAt: now, nativeEvidenceVerified: false });
  const museFile = path.join(folder, 'muse.private.json');
  fs.writeFileSync(museFile, JSON.stringify({ schemaVersion: 1, dataClass: 'private', kind: 'muse-reported-chat-recency', source: 'messenger',
    retrievedAt: now, requestedPeriod: 'last 14 days', coverage: 'partial', gaps: ['Synthetic gap'], records: [
      record('g1', [{ name: 'ada  FIXTURE', id: null }, { name: 'Bo Fixture', id: null }]),
      record('g2', [{ name: 'Ada Fixture', id: null }, { name: 'Ada Fixture', id: 'https://www.facebook.com/someone.else' }])] }));
  assert.deepEqual(photoLinkCandidates(museFile, photosFile, review), { candidates: 1, participants: 2, ambiguous: 1 });
  assert.deepEqual(fs.readdirSync(path.join(review, 'photos')), [photoName]);
  assert.ok(!fs.readFileSync(path.join(review, 'review.html'), 'utf8').includes('<script'));
  const candidates = path.join(review, 'photo-link-candidates.json'), links = path.join(folder, 'links.json');
  assert.throws(() => confirmPhotoLinks(candidates, '2', links), /candidate numbers/);
  assert.equal(confirmPhotoLinks(candidates, '1', links, 'private', now).links, 2);
  const model = connectionModel(null, [readMuseRecency(museFile, 'private')], readProfilePhotos(photosFile, 'private'), 'UTC',
    readPhotoLinks(links, 'private', readProfilePhotos(photosFile, 'private')));
  const ada = model.nodes.filter(node => node.photo === photoName);
  assert.equal(ada.length, 1);
  assert.deepEqual(ada[0].chats.length, 2, 'approved pairings join one person across chats');
  assert.equal(model.nodes.filter(node => node.label === 'Bo Fixture')[0].photo, null);
  const csv = path.join(folder, 'fixture.csv'), output = path.join(folder, 'preview-out');
  fs.writeFileSync(csv, 'Name\nFixture\n'); fs.mkdirSync(output);
  importContactCSV(csv, output, undefined, [museFile], photosFile, 'UTC', links);
  const imported = JSON.parse(fs.readFileSync(path.join(output, 'preview', 'contact-import.json'), 'utf8')).profilePhotos;
  assert.match(imported.linkRule, /owner-confirmed/);
  assert.deepEqual([imported.ownerConfirmedLinks.links, imported.ownerConfirmedLinks.inputDigest], [2, hash(fs.readFileSync(links))]);
  assert.deepEqual(fs.readFileSync(path.join(output, 'preview', 'photo-links.original.json')), fs.readFileSync(links));
});

test('self review hides only owner-approved same-name slots from the graph', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'self-link-review-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const review = path.join(folder, 'review'), museFile = path.join(folder, 'muse.private.json');
  fs.mkdirSync(review);
  const record = (id: string, participants: { name: string; id: string | null }[]) =>
    ({ chatType: 'group', reportedChatId: id, participants, reportedLatestSentAt: now, nativeEvidenceVerified: false });
  fs.writeFileSync(museFile, JSON.stringify({ schemaVersion: 1, dataClass: 'private', kind: 'muse-reported-chat-recency', source: 'messenger',
    retrievedAt: now, requestedPeriod: 'last 14 days', coverage: 'partial', gaps: ['Synthetic gap'], records: [
      record('g1', [{ name: 'Owner  FIXTURE', id: null }, { name: 'Ada Fixture', id: null }]),
      record('g2', [{ name: 'Owner Fixture', id: null }, { name: 'Bo Fixture', id: null }]),
      record('g3', [{ name: 'Owner Fixture', id: null }, { name: 'Owner Fixture', id: 'https://www.facebook.com/owner.other' }])] }));
  assert.deepEqual(selfLinkCandidates(museFile, 'owner fixture', review), { candidates: 3, withoutChatId: 0 });
  assert.ok(!fs.readFileSync(path.join(review, 'review.html'), 'utf8').includes('<script'));
  const candidates = path.join(review, 'self-link-candidates.json'), self = path.join(folder, 'self.json');
  assert.throws(() => confirmSelfLinks(candidates, '4', self), /candidate numbers/);
  confirmSelfLinks(candidates, '1,3', self, 'private', now);
  const muse = readMuseRecency(museFile, 'private');
  const model = connectionModel(null, [muse], null, 'UTC', null, readSelfLinks(self, 'private'));
  assert.deepEqual([model.selfIdentified, model.selfHidden], [false, 2], 'name-based hiding never claims the owner account is identified');
  assert.equal(model.nodes.filter(node => node.label.toLowerCase().replace(/\s+/g, ' ') === 'owner fixture').length, 2,
    'an unapproved same-name slot and a different reported profile both stay');
  assert.equal(model.chats[0].members.length, 1);
  const csv = path.join(folder, 'fixture.csv'), output = path.join(folder, 'preview-out');
  fs.writeFileSync(csv, 'Name\nFixture\n'); fs.mkdirSync(output);
  importContactCSV(csv, output, undefined, [museFile], undefined, 'UTC', undefined, self);
  const imported = JSON.parse(fs.readFileSync(path.join(output, 'preview', 'contact-import.json'), 'utf8')).ownerConfirmedSelf;
  assert.deepEqual([imported.slots, imported.museInputDigest], [2, muse.inputDigest]);
  assert.deepEqual(fs.readFileSync(path.join(output, 'preview', 'self-links.original.json')), fs.readFileSync(self));
  const stale = JSON.parse(fs.readFileSync(self, 'utf8'));
  fs.writeFileSync(self, JSON.stringify({ ...stale, museInputDigest: 'e'.repeat(64) }));
  const again = path.join(folder, 'preview-again'); fs.mkdirSync(again);
  assert.throws(() => importContactCSV(csv, again, undefined, [museFile], undefined, 'UTC', undefined, self), /different Muse snapshot/);
});

test('owner name rule hides every exact-name participant in any snapshot', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-name-rule-synthetic-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const museFile = path.join(folder, 'muse.private.json'), rule = path.join(folder, 'self.json');
  const record = (id: string, participants: { name: string; id: string | null }[]) =>
    ({ chatType: 'group', reportedChatId: id, participants, reportedLatestSentAt: now, nativeEvidenceVerified: false });
  fs.writeFileSync(museFile, JSON.stringify({ schemaVersion: 1, dataClass: 'private', kind: 'muse-reported-chat-recency', source: 'messenger',
    retrievedAt: now, requestedPeriod: 'last 14 days', coverage: 'partial', gaps: ['Synthetic gap'], records: [
      record('g1', [{ name: 'Owner  FIXTURE', id: null }, { name: 'Ada Fixture', id: null }]),
      record('g2', [{ name: 'Owner Fixture', id: 'https://www.facebook.com/owner.other' }, { name: 'Owner Fixtures', id: null }])] }));
  assert.throws(() => saveOwnerNameRule('  ', rule), /display name/);
  saveOwnerNameRule('owner fixture', rule, 'private', now);
  const model = connectionModel(null, [readMuseRecency(museFile, 'private')], null, 'UTC', null, readSelfLinks(rule, 'private'));
  assert.deepEqual([model.selfIdentified, model.selfHidden], [false, 2]);
  assert.deepEqual(model.nodes.map(node => node.label).sort(), ['Ada Fixture', 'Owner Fixtures'], 'only an exact normalized match is hidden');
  assert.match(connectionsPanel(model), /2 of your own participant entries were hidden/);
  const csv = path.join(folder, 'fixture.csv'), output = path.join(folder, 'preview-out');
  fs.writeFileSync(csv, 'Name\nFixture\n'); fs.mkdirSync(output);
  importContactCSV(csv, output, undefined, [museFile], undefined, 'UTC', undefined, rule);
  const imported = JSON.parse(fs.readFileSync(path.join(output, 'preview', 'contact-import.json'), 'utf8')).ownerConfirmedSelf;
  assert.deepEqual([imported.slots, imported.museInputDigest], [null, null]);
  assert.match(imported.rule, /exactly the owner/);
});