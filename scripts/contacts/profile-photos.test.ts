import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePhotoRequest, saveProfilePhotos } from './profile-photos.ts';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ00AAAAASUVORK5CYII=', 'base64');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-round-synthetic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'photos.private.json'), output = path.join(root, 'output');
  fs.mkdirSync(output);
  const request = { schemaVersion: 1, dataClass: 'private', kind: 'facebook-profile-photo-metadata',
    observedAt: '2026-11-26T18:00:00Z', profiles: [
      { profileReference: 'https://www.facebook.com/fixture.one', displayName: '<script>fixture</script>', photoUrl: 'https://scontent.fbcdn.net/fixture.png', friendshipEvidence: 'friends-list', pictureReference: 'https://www.facebook.com/photo/?fbid=1' },
      { profileReference: 'https://www.facebook.com/fixture.two', displayName: 'Missing fixture', photoUrl: null, friendshipEvidence: 'profile-friends-control', pictureReference: null }
    ], gaps: ['Synthetic observed references only; canonical identity is unresolved.'] };
  const write = () => fs.writeFileSync(input, JSON.stringify(request));
  write();
  return { root, input, output, request, write };
}

test('one-round photo assets preserve provenance, escape labels and refuse overwrites', async t => {
  const f = fixture(t);
  let calls = 0;
  const result = await saveProfilePhotos(f.input, f.output, async (_, init) => {
    calls++; assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'manual');
    return new Response(new Uint8Array(pixel), { headers: { 'content-type': 'image/png' } });
  });
  assert.equal(calls, 1); assert.equal(result.saved, 1); assert.equal(result.exitCode, 2);
  const folder = path.join(f.output, 'photos');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'profile-photos.json'), 'utf8'));
  assert.deepEqual(manifest.profiles.map(p => p.status), ['saved', 'missing']);
  assert.deepEqual(fs.readFileSync(path.join(folder, manifest.profiles[0].file)), pixel);
  assert.deepEqual(fs.readFileSync(path.join(folder, 'input.original.private.json')), fs.readFileSync(f.input));
  assert.ok(!fs.readFileSync(result.file, 'utf8').includes('<script>fixture</script>'));
  await assert.rejects(saveProfilePhotos(f.input, f.output), /fresh output/);
});

test('photo input rejects credentials, non-provider URLs, groups and unrequested content before reads', async t => {
  const f = fixture(t);
  for (const uri of ['http://scontent.fbcdn.net/a.png', 'https://evil.example.invalid/a.png',
    'https://scontent.fbcdn.net/a.png?access_token=fixture', 'https://user:pass@scontent.fbcdn.net/a.png']) {
    f.request.profiles[0].photoUrl = uri;
    assert.throws(() => validatePhotoRequest(f.request));
  }
  f.request.profiles[0].photoUrl = 'https://scontent.fbcdn.net/a.png';
  f.request.profiles[0].friendshipEvidence = 'unknown';
  assert.throws(() => validatePhotoRequest(f.request), /confirmed Facebook friends/);
  f.request.profiles[0].friendshipEvidence = 'friends-list';
  f.request.profiles[0].profileReference = 'https://www.facebook.com/groups/fixture';
  assert.throws(() => validatePhotoRequest(f.request), /person-profile/);
  f.request.profiles[0].profileReference = 'https://www.facebook.com/fixture.one';
  Object.assign(f.request.profiles[0], { bio: 'excluded fixture content' });
  f.write();
  let read = false;
  await assert.rejects(saveProfilePhotos(f.input, f.output, async () => { read = true; return new Response(); }), /unsupported fields/);
  assert.equal(read, false); assert.deepEqual(fs.readdirSync(f.output), []);
});

test('auth, rate limits, invalid images and redirects become explicit partial receipts', async t => {
  for (const response of [
    () => new Response(null, { status: 403 }),
    () => new Response(null, { status: 429 }),
    () => new Response('<html>fixture</html>', { headers: { 'content-type': 'image/png' } }),
    () => new Response(null, { status: 302, headers: { location: 'https://evil.example.invalid/image.png' } }),
    () => new Response(null, { headers: { 'content-type': 'image/png', 'content-length': '6000000' } })
  ]) {
    const f = fixture(t);
    f.request.profiles[1].photoUrl = 'https://scontent.fbcdn.net/second.png';
    f.request.profiles[1].pictureReference = 'https://www.facebook.com/photo/?fbid=2'; f.write();
    let calls = 0;
    const result = await saveProfilePhotos(f.input, f.output, async () => { calls++; return response(); });
    assert.equal(result.saved, 0); assert.equal(result.exitCode, 2);
    const manifest = JSON.parse(fs.readFileSync(path.join(f.output, 'photos', 'profile-photos.json'), 'utf8'));
    assert.ok(manifest.profiles.every(p => p.status !== 'saved'));
    if (manifest.profiles[0].httpStatus === 429) { assert.equal(calls, 1); assert.equal(manifest.profiles[1].status, 'rate_limited'); }
  }
});

test('a single photo round stops at 25 attempts without losing remaining profile evidence', async t => {
  const f = fixture(t);
  f.request.profiles = Array.from({ length: 26 }, (_, i) => ({
    profileReference: `https://www.facebook.com/fixture.${i}`, displayName: 'Synthetic fixture',
    photoUrl: 'https://scontent.fbcdn.net/pixel.png', friendshipEvidence: 'friends-list', pictureReference: `https://www.facebook.com/photo/?fbid=${i + 1}`
  }));
  f.write();
  let calls = 0;
  const result = await saveProfilePhotos(f.input, f.output, async () => { calls++; return new Response(new Uint8Array(pixel), { headers: { 'content-type': 'image/png' } }); });
  assert.equal(calls, 25); assert.equal(result.saved, 25);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.output, 'photos', 'profile-photos.json'), 'utf8'));
  assert.equal(manifest.profiles[25].status, 'budget_stop');
});
