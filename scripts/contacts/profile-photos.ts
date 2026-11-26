import fs from 'node:fs';
import path from 'node:path';
import { manualOutputLocation } from './manual-retrieval.ts';
import { array, object, text, instant, requireValue, hash, publish, publishText, errorCode } from './lib.ts';

interface ProfilePhoto {
  profileReference: string | null;
  displayName: string | null;
  photoUrl: string | null;
  friendshipEvidence: 'friends-list' | 'profile-friends-control';
  pictureReference: string | null;
}
interface PhotoRequest {
  schemaVersion: 1;
  dataClass: 'private';
  kind: 'facebook-profile-photo-metadata';
  observedAt: string;
  profiles: ProfilePhoto[];
  gaps: string[];
}
const escape = (value: string) => value.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const credentialQuery = /^(access_token|token|authorization|password|cookie)$/i;

function imageURL(value: string): URL {
  const url = new URL(value);
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
    ['fbcdn.net', 'fbsbx.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)),
  'Use only the observed Facebook image CDN.', 'photo_url_disallowed');
  requireValue(![...url.searchParams.keys()].some(key => credentialQuery.test(key)),
    'Credential-bearing photo URLs are not permitted.', 'photo_url_disallowed');
  return url;
}

function validatePhotoRequest(value: unknown): PhotoRequest {
  object(value, ['schemaVersion', 'dataClass', 'kind', 'observedAt', 'profiles', 'gaps'], 'profile photo request');
  requireValue(value.schemaVersion === 1 && value.dataClass === 'private' &&
    value.kind === 'facebook-profile-photo-metadata', 'Invalid private profile photo request.');
  const observedAt = instant(value.observedAt, 'observedAt');
  const rows = array(value.profiles, 'profiles');
  requireValue(rows.length <= 100, 'Profile metadata exceeds the bounded round.');
  const references = new Set<string>();
  const profiles = rows.map((profile): ProfilePhoto => {
    object(profile, ['profileReference', 'displayName', 'photoUrl', 'friendshipEvidence', 'pictureReference'], 'profile photo');
    requireValue(profile.friendshipEvidence === 'friends-list' || profile.friendshipEvidence === 'profile-friends-control',
      'Only natively confirmed Facebook friends may have photos saved.', 'photo_friendship_unverified');
    if (profile.profileReference !== null) {
      text(profile.profileReference, 'profile reference');
      const ref = new URL(profile.profileReference);
      const nativePersonPath = ref.pathname === '/profile.php' && /^\d+$/.test(ref.searchParams.get('id') ?? '') ||
        /^\/people\/[^/]+\/\d+\/?$/.test(ref.pathname) ||
        /^\/[a-z0-9.]+\/?$/i.test(ref.pathname) && !/^\/(friends|groups|events|messages|photo|photos|watch|pages|reel|reels|home|search|me|profile.php)\/?$/i.test(ref.pathname);
      requireValue(ref.protocol === 'https:' && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(ref.hostname) &&
        !ref.username && !ref.password && !ref.port && !ref.hash && nativePersonPath &&
        ![...ref.searchParams.keys()].some(key => credentialQuery.test(key)),
      'Use an observed Facebook person-profile reference.');
      requireValue(!references.has(profile.profileReference), 'Duplicate observed profile reference.');
      references.add(profile.profileReference);
    }
    if (profile.displayName !== null) text(profile.displayName, 'display name');
    if (profile.photoUrl !== null) {
      text(profile.photoUrl, 'photo URL');
      requireValue(profile.profileReference !== null, 'A photo needs its observed profile reference.');
      imageURL(profile.photoUrl);
      const picture = new URL(text(profile.pictureReference, 'expanded current picture reference'));
      requireValue(picture.protocol === 'https:' && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(picture.hostname) &&
        !picture.username && !picture.password && !picture.port && !picture.hash &&
        ![...picture.searchParams.keys()].some(key => credentialQuery.test(key)) && /^\/photo(?:\/|\.php)?$/.test(picture.pathname) &&
        /^\d+$/.test(picture.searchParams.get('fbid') ?? ''),
      'Use the native expanded current profile-picture reference.', 'photo_picture_unverified');
    } else {
      requireValue(profile.pictureReference === null, 'Missing photo URLs must not claim an expanded picture.');
    }
    return { profileReference: profile.profileReference === null ? null : text(profile.profileReference, 'profile reference'),
      displayName: profile.displayName === null ? null : text(profile.displayName, 'display name'),
      photoUrl: profile.photoUrl === null ? null : text(profile.photoUrl, 'photo URL'),
      friendshipEvidence: profile.friendshipEvidence === 'friends-list' ? 'friends-list' : 'profile-friends-control',
      pictureReference: profile.pictureReference === null ? null : text(profile.pictureReference, 'picture reference') };
  });
  const gaps = array(value.gaps, 'photo gaps');
  requireValue(gaps.length > 0, 'Observed photo rounds need explicit identity/coverage gaps.');
  return { schemaVersion: 1, dataClass: 'private', kind: 'facebook-profile-photo-metadata',
    observedAt, profiles, gaps: gaps.map(gap => text(gap, 'photo gap')) };
}

async function retrieveImage(url: string, transport: typeof fetch) {
  let current = imageURL(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await transport(current.href, { method: 'GET', redirect: 'manual', credentials: 'omit',
      headers: { Accept: 'image/png,image/jpeg,image/webp' }, signal: AbortSignal.timeout(15000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      requireValue(location !== null && redirects < 3, 'Image redirect limit or location is invalid.', 'photo_redirect_failed');
      current = imageURL(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { status: [401, 403].includes(response.status) ? 'requires_setup' : 'failed', httpStatus: response.status };
    }
    const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime) ||
      !(Number(response.headers.get('content-length') ?? 0) <= 5 * 1024 * 1024)) await response.body?.cancel();
    requireValue(['image/png', 'image/jpeg', 'image/webp'].includes(mime), 'Unsupported image type.', 'photo_image_invalid');
    requireValue(Number(response.headers.get('content-length') ?? 0) <= 5 * 1024 * 1024,
      'Profile image exceeds 5 MB.', 'photo_too_large');
    requireValue(response.body !== null, 'Image response is empty.', 'photo_image_invalid');
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        requireValue(size <= 5 * 1024 * 1024, 'Profile image exceeds 5 MB.', 'photo_too_large');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = Buffer.concat(chunks);
    const valid = mime === 'image/png' ? bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) :
      mime === 'image/jpeg' ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
        bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    requireValue(valid, 'Image signature does not match its type.', 'photo_image_invalid');
    return { status: 'saved', bytes, extension: mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp' };
  }
  throw new Error('Unreachable image redirect state.');
}

async function saveProfilePhotos(input: string, output: string, transport: typeof fetch = fetch) {
  const file = path.resolve(input), folder = manualOutputLocation(path.resolve(output), 'private');
  manualOutputLocation(path.dirname(file), 'private');
  requireValue(fs.readdirSync(folder).length === 0 && fs.realpathSync(file) === file,
    'Choose a fresh output directory and non-redirected private input.', 'unsafe_output');
  requireValue(fs.statSync(file).isFile() && fs.statSync(file).size <= 10 * 1024 * 1024, 'Photo metadata exceeds its input limit.');
  const bytes = fs.readFileSync(file);
  requireValue(bytes.length <= 10 * 1024 * 1024 && Buffer.from(bytes.toString('utf8')).equals(bytes),
    'Photo metadata must be bounded UTF-8.');
  const request = validatePhotoRequest(JSON.parse(bytes.toString('utf8')));
  const staging = path.join(folder, '.photo-staging');
  fs.mkdirSync(staging);
  const created: string[] = [];
  const results: { profileReference: string | null; displayName: string | null; friendshipEvidence: ProfilePhoto['friendshipEvidence']; pictureReference: string | null; status: string;
    file?: string; digest?: string; httpStatus?: number; gap?: string }[] = [];
  let published = false, attempts = 0, rateLimited = false;
  try {
    for (const profile of request.profiles) {
      const result = { profileReference: profile.profileReference, displayName: profile.displayName,
        friendshipEvidence: profile.friendshipEvidence, pictureReference: profile.pictureReference, status: '' };
      if (!profile.profileReference || !profile.photoUrl) {
        results.push({ ...result, status: 'missing', gap: 'Profile identity or current photo URL is unavailable.' }); continue;
      }
      if (rateLimited) {
        results.push({ ...result, status: 'rate_limited', gap: 'The source rate-limited this round; no further image requests made.' }); continue;
      }
      if (attempts >= 25) {
        results.push({ ...result, status: 'budget_stop', gap: 'The single-round 25-image budget was reached.' }); continue;
      }
      attempts++;
      let image: Awaited<ReturnType<typeof retrieveImage>>;
      try { image = await retrieveImage(profile.photoUrl, transport); }
      catch (error) {
        const code = errorCode(error);
        if (code?.startsWith('photo_') || error instanceof Error &&
          (['AbortError', 'TimeoutError'].includes(error.name) || error instanceof TypeError && error.message === 'fetch failed')) {
          results.push({ ...result, status: 'failed', gap: code ?? 'photo_network_failed' }); continue;
        }
        throw error;
      }
      if (image.status !== 'saved') {
        rateLimited = image.httpStatus === 429;
        results.push({ ...result, status: image.status, httpStatus: image.httpStatus }); continue;
      }
      const name = `profile-photo-${hash(JSON.stringify([hash(bytes), profile.profileReference]))}.${image.extension}`;
      created.push(name);
      fs.writeFileSync(path.join(staging, name), image.bytes, { flag: 'wx', mode: 0o600 });
      results.push({ ...result, status: 'saved', file: name, digest: hash(image.bytes) });
    }
    created.push('input.original.private.json'); fs.writeFileSync(path.join(staging, created.at(-1)), bytes, { flag: 'wx', mode: 0o600 });
    created.push('profile-photos.json');
    publish(path.join(staging, created.at(-1)), { schemaVersion: 1, dataClass: 'private', kind: 'facebook-profile-photo-assets',
      inputDigest: hash(bytes), observedAt: request.observedAt, retrievedAt: new Date().toISOString(),
      coverage: 'partial', attempts, profiles: results, gaps: request.gaps,
      limitations: ['Source-bound observed references only; no canonical person matching or face analysis.',
        'Basic media signatures are checked; verify actual image loading locally.', 'Current profile photos are not activity or historical identity evidence.'] });
    created.push('gallery.html');
    publishText(path.join(staging, created.at(-1)), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Private profile photo round</title><style>body{font:16px system-ui;background:#faf7f2;color:#263332;margin:32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px}.card{background:white;padding:18px;border-radius:12px;overflow-wrap:anywhere}img{width:128px;height:128px;object-fit:cover;border-radius:50%}small{display:block;color:#65716b}</style></head>
<body><h1>Source-bound profile pictures</h1><p>Private, one-round snapshot. Not matched to contacts; no face recognition.</p><div class="grid">${results.map(row =>
      `<div class="card">${row.file ? `<img src="${row.file}" alt="Observed profile picture">` : ''}<p>${escape(row.displayName ?? 'Unidentified profile')}</p><small>${escape(row.status)}</small></div>`).join('')}</div></body></html>`);
    fs.renameSync(staging, path.join(folder, 'photos')); published = true;
    return { file: path.join(folder, 'photos', 'gallery.html'), saved: results.filter(row => row.status === 'saved').length, exitCode: 2 };
  } finally {
    if (!published) {
      for (const name of created) { const target = path.join(staging, name); if (fs.existsSync(target)) fs.unlinkSync(target); }
      fs.rmdirSync(staging);
    }
  }
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const args = process.argv.slice(2);
    requireValue(args.length === 4 && args[0] === '--input' && args[2] === '--output',
      'Usage: contacts:photos --input <private-metadata.json> --output <fresh-existing-local-directory>');
    const result = await saveProfilePhotos(args[1], args[3]);
    process.stdout.write('Private profile-photo round saved locally; identity and source coverage remain partial.\n');
    process.exitCode = result.exitCode;
  }).catch(error => {
    process.stderr.write(`Profile-photo round not saved (${errorCode(error) ?? 'photo_round_failed'}); no private URLs or profile details printed.\n`);
    process.exitCode = 1;
  });
}

export { validatePhotoRequest, saveProfilePhotos };
