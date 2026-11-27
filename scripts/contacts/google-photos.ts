import fs from 'node:fs';
import path from 'node:path';
import { array, object, text, instant, requireValue, hash } from './lib.ts';
import { manualOutputLocation } from './manual-retrieval.ts';
import { normalized } from './identity-review.ts';

interface GooglePhoto {
  key: string;
  file: string;
  bytes: Buffer;
  digest: string;
}
interface GooglePhotoConnection {
  resourceName: string;
  addresses: { type: string; value: string }[];
  photo: GooglePhoto | null;
}
interface GooglePhotoSet {
  inputDigest: string;
  observedAt: string;
  connections: GooglePhotoConnection[];
  saved: number;
  skippedDefault: number;
}
const addressKey = (address: { type: string; value: string }) => {
  if (!['email', 'phone'].includes(address.type)) return null;
  const value = normalized(address.type, address.value);
  return value === null ? null : `${address.type}:${value}`;
};

function googleImageURL(value: unknown): void {
  const url = new URL(text(value, 'Google image URL'));
  requireValue(url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com') &&
    !url.username && !url.password && !url.port && !url.hash &&
    ![...url.searchParams.keys()].some(key => /token|auth|password|cookie|credential|secret|key/i.test(key)),
  'Use only credential-free HTTPS Google image URLs.', 'google_photo_url_disallowed');
}

// This validates a projected, already saved round. It never follows URLs or reads credentials.
function readGooglePhotos(file: string, dataClass: string): GooglePhotoSet {
  const manifest = path.resolve(file), folder = path.dirname(manifest);
  if (dataClass === 'private') manualOutputLocation(folder, 'private');
  requireValue(fs.realpathSync(manifest) === manifest && fs.statSync(manifest).isFile() &&
    fs.statSync(manifest).size <= 1024 * 1024, 'Choose a bounded, non-redirected Google photo manifest.');
  const bytes = fs.readFileSync(manifest);
  requireValue(bytes.length <= 1024 * 1024 && Buffer.from(bytes.toString('utf8')).equals(bytes),
    'Google photo manifest must be bounded UTF-8.');
  const value = JSON.parse(bytes.toString('utf8'));
  object(value, ['schemaVersion', 'dataClass', 'kind', 'observedAt', 'coverage', 'connections'], 'Google photo bundle');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass &&
    value.kind === 'google-connections-photo-assets' && value.coverage === 'partial', 'Invalid Google photo bundle.');
  const observedAt = instant(value.observedAt, 'Google photo observation time');
  const rows = array(value.connections, 'Google connections'), ids = new Set<string>();
  requireValue(rows.length <= 100, 'Google photo round exceeds 100 connections.');
  let totalBytes = 0, saved = 0, skippedDefault = 0, photoRows = 0;
  const connections = rows.map((row): GooglePhotoConnection => {
    object(row, ['resourceName', 'emailAddresses', 'phoneNumbers', 'photos'], 'Google photo connection');
    const resourceName = text(row.resourceName, 'connection resourceName');
    requireValue(/^people\/[A-Za-z0-9_-]+$/.test(resourceName) && !ids.has(resourceName), 'Invalid or duplicate connection resourceName.');
    ids.add(resourceName);
    const addresses: GooglePhotoConnection['addresses'] = [];
    for (const [field, type] of [['emailAddresses', 'email'], ['phoneNumbers', 'phone']]) {
      const values = array(row[field], field);
      requireValue(values.length <= 100, 'Connection address field exceeds 100 values.');
      for (const address of values) {
        object(address, ['value'], 'connection address');
        addresses.push({ type, value: text(address.value, 'connection address value') });
      }
    }
    const candidates: { source: string; photo: GooglePhoto }[] = [];
    for (const photo of array(row.photos, 'connection photos')) {
      requireValue(++photoRows <= 100, 'Google photo round exceeds 100 photo records.');
      object(photo, ['url', 'default', 'sourceType', 'redirectUrls', 'file', 'sha256'], 'Google photo');
      googleImageURL(photo.url);
      requireValue(typeof photo.default === 'boolean' && ['CONTACT', 'PROFILE'].includes(photo.sourceType as string),
        'Each Google photo needs an explicit default flag and CONTACT/PROFILE source.');
      const redirects = array(photo.redirectUrls, 'Google photo redirects');
      requireValue(redirects.length <= 3, 'Google photo redirect limit exceeded.');
      redirects.forEach(googleImageURL);
      if (photo.default) {
        requireValue(photo.file === null && photo.sha256 === null, 'Default photos must not carry saved assets.');
        skippedDefault++;
        continue;
      }
      const digest = text(photo.sha256, 'Google photo sha256'), name = text(photo.file, 'Google photo file');
      requireValue(/^[0-9a-f]{64}$/.test(digest) &&
        new RegExp(`^google-photo-${digest}\\.(png|jpg|webp)$`).test(name), 'Google photo filename must bind its sha256.');
      const target = path.join(folder, name);
      requireValue(fs.realpathSync(target) === target && fs.statSync(target).isFile() &&
        fs.statSync(target).size <= 5 * 1024 * 1024, 'Choose bounded, contained Google photo assets.');
      const image = fs.readFileSync(target);
      requireValue(image.length <= 5 * 1024 * 1024, 'Google photo exceeds 5 MB.');
      totalBytes += image.length;
      requireValue(totalBytes <= 50 * 1024 * 1024, 'Google photo bundle exceeds 50 MB.');
      requireValue(hash(image) === digest, 'Google photo sha256 mismatch.', 'google_photo_digest_mismatch');
      requireValue(name.endsWith('.png') ? image.length >= 24 && image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) :
        name.endsWith('.jpg') ? image.length >= 4 && image[0] === 255 && image[1] === 216 && image[2] === 255 :
          image.length >= 16 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP',
      'Invalid Google raster signature.', 'google_photo_image_invalid');
      saved++;
      candidates.push({ source: photo.sourceType as string, photo: { key: resourceName, file: name, bytes: image, digest } });
    }
    const preferred = candidates.some(candidate => candidate.source === 'CONTACT') ? 'CONTACT' : 'PROFILE';
    const selected = candidates.filter(candidate => candidate.source === preferred);
    return { resourceName, addresses, photo: selected.length === 1 ? selected[0].photo : null };
  });
  return { inputDigest: hash(bytes), observedAt, connections, saved, skippedDefault };
}

// Match the complete connection, not a photo/name. Shared evidence and competing connections fail closed.
function matchGooglePhotos<T extends { addresses: { type: string; value: string }[] }>(
  people: readonly T[], bundle: GooglePhotoSet): Map<T, GooglePhoto> {
  const owners = new Map<string, Set<T>>(), connections = new Map<string, Set<GooglePhotoConnection>>();
  const index = <V>(map: Map<string, Set<V>>, key: string, owner: V) => {
    if (key !== null) map.set(key, (map.get(key) ?? new Set()).add(owner));
  };
  for (const person of people) for (const address of person.addresses) index(owners, addressKey(address), person);
  for (const connection of bundle.connections) {
    for (const address of connection.addresses) index(connections, addressKey(address), connection);
  }
  const byPerson = new Map<T, Set<GooglePhotoConnection>>();
  for (const connection of bundle.connections) for (const address of connection.addresses) {
    for (const person of owners.get(addressKey(address)) ?? []) {
      byPerson.set(person, (byPerson.get(person) ?? new Set()).add(connection));
    }
  }
  const proposals = new Map<T, GooglePhoto[]>();
  for (const connection of bundle.connections) {
    if (!connection.photo) continue;
    const keys = [...new Set(connection.addresses.map(addressKey).filter(key => key !== null))];
    const matches = new Set(keys.flatMap(key => [...owners.get(key) ?? []]));
    if (matches.size !== 1 || keys.some(key => (owners.get(key)?.size ?? 0) > 1 || connections.get(key).size > 1)) continue;
    const person = [...matches][0];
    if (byPerson.get(person).size !== 1) continue;
    proposals.set(person, [...proposals.get(person) ?? [], connection.photo]);
  }
  return new Map([...proposals].filter(([, photos]) => photos.length === 1).map(([person, photos]) => [person, photos[0]]));
}

export { readGooglePhotos, matchGooglePhotos };
export type { GooglePhotoSet, GooglePhoto };
