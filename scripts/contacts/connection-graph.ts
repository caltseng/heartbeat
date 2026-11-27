import fs from 'node:fs';
import path from 'node:path';
import { array, object, text, requireValue, hash } from './lib.ts';
import { manualOutputLocation } from './manual-retrieval.ts';
import { normalized } from './identity-review.ts';
import type { GmailSource } from './gmail-metadata.ts';
import { matchGooglePhotos } from './google-photos.ts';
import type { GooglePhotoSet } from './google-photos.ts';

type Platform = 'messenger' | 'instagram' | 'messages' | 'gmail';
type Ring = 'today' | 'week' | 'fortnight' | 'month' | 'older' | 'unknown';
type Kind = 'direct' | 'text' | 'group' | 'unknown';
interface Photo { key: string; file: string; bytes: Buffer; digest: string }
interface PhotoSet { inputDigest: string; photos: Photo[] }
interface MuseSource {
  source: 'messenger' | 'instagram';
  retrievedAt?: string;
  selfIds?: string[];
  records: { chatType: string; reportedChatId?: string | null; participants: { name: string | null; id: string | null }[]; reportedLatestSentAt: string | null }[];
}
// Owner-confirmed pairings of one ID-less chat participant with one saved friend photo, keyed `source|chatId|position`.
type PhotoLinks = Map<string, { name: string; key: string }> & { originalBytes?: Buffer; inputDigest?: string; confirmedAt?: string };
// Owner-confirmed chat participant slots that are the owner, keyed `source|chatId|position`; they are never drawn as people.
type SelfLinks = Map<string, string> & { originalBytes?: Buffer; inputDigest?: string; confirmedAt?: string; museInputDigest?: string;
  ownerName?: string; ownerAddresses?: string[]; sameNamePeople?: boolean; separateNames?: string[];
  sameAs?: { name: string; as: string; label: string }[]; hiddenNames?: string[]; businessNames?: string[]; personNames?: string[] };
// Owner-confirmed people: each groups entries from any source that the owner said are the same person.
type PersonMember = { source: 'messenger' | 'instagram'; reportedChatId: string; participantIndex: number; participantName: string } |
  { source: 'gmail'; address: string };
interface PeopleLinks { people: { displayName: string; members: PersonMember[] }[]; originalBytes?: Buffer; inputDigest?: string;
  confirmedAt?: string }
const memberRef = (member: PersonMember) => member.source === 'gmail' ? `gmail|${member.address}` :
  `${member.source}|${member.reportedChatId}|${member.participantIndex}`;
const emailKey = (value: string) => normalized('email', value)?.toLowerCase() ?? null;
// Gmail itself ignores dots and +tags in gmail.com addresses, so those spellings are one mailbox; other domains match exactly.
const mailboxKey = (value: string) => {
  const key = emailKey(value);
  if (key === null) return null;
  const [local, domain] = key.split('@');
  return domain === 'gmail.com' || domain === 'googlemail.com' ? `${local.split('+')[0].replace(/\./g, '')}@gmail.com` : key;
};
interface SavedContact { displayName: string | null; addresses: { type: string; value: string }[]; business?: 'label' | 'company' }
// Guesses only: role mailboxes (orders@, noreply@ …) and bulk-mail sending subdomains usually belong to organizations.
const ROLE_MAILBOX = /^(no-?reply|do-?not-?reply|donotreply|info|support|help|hello|team|sales|billing|orders?|receipts?|notifications?|news|newsletters?|marketing|admin|contact|service|customer-?service|accounts?|updates|mail|mailer|jobs|careers|office|events|reservations?|bookings?|feedback|press|shop|store|front-?desk|reception|appointments?|scheduling|general|registrar|webmaster|postmaster|alerts?|membership|donations?|giving|invoices?|payments?|bounces?)([._+-].*)?$/;
// The prefix must be a subdomain of an organization's domain (mail.shop.example), not a consumer provider (mail.com) or a school.
const BULK_DOMAIN = /^(e|em|email|mail|mailer|news|reply|notifications?|mg|mkt|marketing|info|bounce)\d*\.[^.]+\.[^.]+/;
const SCHOOL_DOMAIN = /\.(edu|edu\.[a-z]{2}|ac\.[a-z]{2})$/;
const automatedAddress = (address: string) => {
  const [local, domain = ''] = address.toLowerCase().split('@');
  return ROLE_MAILBOX.test(local) || (BULK_DOMAIN.test(domain) && !SCHOOL_DOMAIN.test(domain)) || /noreply|newsletter|mailer-daemon/.test(local);
};
const comparableName = (name: string | null | undefined) =>
  typeof name !== 'string' ? null : name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') || null;
interface TextObservations { period?: { end: string; timeZone: string }; messages: { threadUiId: string; inferredLocalDate: string | null; requestedWindowMembership: string }[] }
interface GraphNode {
  id: string; label: string; initials: string; ring: Ring; ringLabel: string; kind: Kind; lastActivity: string | null;
  lastNote: string; platforms: Platform[]; platformLabels: string[]; chats: string[]; photo: string | null; identityNote: string;
  hidden?: boolean; reportedOn?: Platform[]; confirmed?: boolean;
  groupChat?: string;
  // Why this entry counts as a business: the owner's Google Contacts, the owner's name rule, or an automated-address guess.
  business?: 'contacts' | 'rule' | 'guess';
}
interface GraphChat { id: string; platform: Platform; kind: 'one-to-one' | 'group' | 'unknown' | 'text'; label: string; latest: string | null; asOf: string | null; members: string[] }
interface ConnectionModel { nodes: GraphNode[]; groups: GraphNode[]; chats: GraphChat[]; linkedPhotos: Photo[]; selfIdentified: boolean; selfHidden: number;
  asOf: string | null; gmailHidden?: number | null; sameAsUnjoined?: number }

const PLATFORMS: Record<Platform, string> = { messenger: 'Messenger', instagram: 'Instagram', messages: 'Google Messages', gmail: 'Gmail' };
// Rings are calendar-day age of the latest shared-chat activity, relative to that chat's own source snapshot day.
const RINGS: { id: Ring; label: string; base: number; maxAge: number }[] = [
  { id: 'today', label: 'Today', base: 140, maxAge: 0 },
  { id: 'week', label: 'This week', base: 230, maxAge: 6 },
  { id: 'fortnight', label: 'Last two weeks', base: 320, maxAge: 13 },
  { id: 'month', label: 'Last 30 days', base: 410, maxAge: 29 },
  { id: 'older', label: 'Over a month ago', base: 500, maxAge: Infinity },
  { id: 'unknown', label: 'Date unknown', base: 580, maxAge: NaN }
];
const RESERVED = /^(friends|groups|events|messages|photo|photos|watch|pages|reel|reels|home|search|me|people|profile\.php)$/i;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Exact Facebook profile identity only; bare text (which could be a display name) never yields a key.
function profileKey(value: string | null): string | null {
  if (value === null) return null;
  if (/^\d{5,}$/.test(value)) return `id:${value}`;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname)) return null;
  if (url.pathname === '/profile.php') {
    const id = url.searchParams.get('id');
    return id && /^\d+$/.test(id) ? `id:${id}` : null;
  }
  const people = url.pathname.match(/^\/people\/[^/]+\/(\d+)\/?$/);
  if (people) return `id:${people[1]}`;
  const user = url.pathname.match(/^\/([a-z0-9.]+)\/?$/i);
  return user && !RESERVED.test(user[1]) ? `user:${user[1].toLowerCase()}` : null;
}
const participantKey = (platform: Platform, id: string | null) =>
  id === null ? null : platform === 'messenger' ? profileKey(id) : `raw:${id}`;

function readProfilePhotos(file: string, dataClass: string): PhotoSet {
  const manifest = path.resolve(file), folder = path.dirname(manifest);
  if (dataClass === 'private') manualOutputLocation(folder, 'private');
  requireValue(fs.realpathSync(manifest) === manifest && fs.statSync(manifest).isFile() &&
    fs.statSync(manifest).size <= 1024 * 1024, 'Choose a bounded, non-redirected profile photo manifest.');
  const bytes = fs.readFileSync(manifest);
  requireValue(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes), 'Photo manifest must be UTF-8.');
  const value = JSON.parse(bytes.toString('utf8'));
  object(value, ['schemaVersion', 'dataClass', 'kind', 'inputDigest', 'observedAt', 'retrievedAt', 'coverage',
    'attempts', 'profiles', 'gaps', 'limitations'], 'profile photo manifest');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && value.kind === 'facebook-profile-photo-assets' &&
    value.coverage === 'partial', 'Invalid saved profile photo manifest.');
  const rows = array(value.profiles, 'saved profile photos');
  requireValue(rows.length <= 100, 'Profile photo manifest exceeds its bounded round.');
  const photos: Photo[] = [], keys = new Set<string>();
  for (const row of rows) {
    object(row, ['profileReference', 'displayName', 'friendshipEvidence', 'pictureReference', 'status', 'file', 'digest',
      'httpStatus', 'gap'], 'saved profile photo');
    if (row.status !== 'saved') continue;
    requireValue(['friends-list', 'profile-friends-control'].includes(row.friendshipEvidence as string),
      'Only natively confirmed Facebook friends may have photos shown.', 'photo_friendship_unverified');
    const key = profileKey(text(row.profileReference, 'profile reference'));
    requireValue(key !== null && !keys.has(key), 'Each saved photo needs one distinct observed profile reference.');
    keys.add(key);
    requireValue(typeof row.file === 'string' && /^profile-photo-[0-9a-f]{64}\.(jpg|png|webp)$/.test(row.file) &&
      typeof row.digest === 'string' && /^[0-9a-f]{64}$/.test(row.digest), 'Invalid saved photo reference.');
    const target = path.join(folder, row.file);
    requireValue(fs.realpathSync(target) === target && fs.statSync(target).isFile() &&
      fs.statSync(target).size <= 5 * 1024 * 1024, 'Choose bounded, non-redirected saved photos.');
    const image = fs.readFileSync(target);
    requireValue(hash(image) === row.digest, 'Saved photo does not match its digest.', 'photo_digest_mismatch');
    const extension = row.file.slice(-4);
    requireValue(extension === '.png' ? image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) :
      extension === '.jpg' ? image[0] === 255 && image[1] === 216 && image[2] === 255 :
        image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP',
    'Saved photo signature does not match its type.', 'photo_image_invalid');
    photos.push({ key, file: row.file, bytes: image, digest: row.digest });
  }
  return { inputDigest: hash(bytes), photos };
}

// The owner's explicit per-participant decision is the identity evidence; nothing here matches names automatically.
function readPhotoLinks(file: string, dataClass: string, photos: PhotoSet): PhotoLinks {
  const resolved = path.resolve(file);
  if (dataClass === 'private') manualOutputLocation(path.dirname(resolved), 'private');
  requireValue(fs.realpathSync(resolved) === resolved && fs.statSync(resolved).isFile() && fs.statSync(resolved).size <= 1024 * 1024,
    'Choose a bounded, non-redirected photo links file.');
  const originalBytes = fs.readFileSync(resolved), value = JSON.parse(originalBytes.toString('utf8'));
  object(value, ['schemaVersion', 'dataClass', 'kind', 'photosInputDigest', 'confirmedAt', 'links'], 'photo links');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && value.kind === 'owner-confirmed-photo-links' &&
    !Number.isNaN(Date.parse(text(value.confirmedAt, 'confirmation time'))), 'Invalid owner-confirmed photo links.');
  requireValue(value.photosInputDigest === photos.inputDigest, 'Photo links were confirmed against a different photo manifest.');
  const rows = array(value.links, 'photo links'), keys = new Set(photos.photos.map(photo => photo.key)), links: PhotoLinks = new Map();
  requireValue(rows.length <= 200, 'Photo links exceed their bounded review.');
  for (const row of rows) {
    object(row, ['source', 'reportedChatId', 'participantIndex', 'participantName', 'profileReference'], 'photo link');
    const at = `${row.source}|${text(row.reportedChatId, 'reported chat ID')}|${row.participantIndex}`;
    const key = profileKey(text(row.profileReference, 'profile reference'));
    requireValue(row.source === 'messenger' && Number.isInteger(row.participantIndex) && row.participantIndex >= 0 &&
      key !== null && keys.has(key) && !links.has(at), 'Each photo link needs one distinct participant and a saved photo.');
    links.set(at, { name: text(row.participantName, 'participant name'), key });
  }
  return Object.assign(links, { originalBytes, inputDigest: hash(originalBytes), confirmedAt: value.confirmedAt as string });
}

// The owner's explicit "this name is that person" decisions. A name may be a chat display name or an email address you wrote to.
// Aliases never chain, never name the owner and never override a name the owner listed as separate people.
function nameEdits(value: Record<string, unknown>, ownerName: string, separateNames: string[]) {
  if (value.sameAs === undefined) return [];
  const rows = array(value.sameAs, 'same-as names').map(row => {
    object(row, ['name', 'as'], 'same-as name');
    return { name: comparableName(text(row.name, 'alias name')), as: comparableName(text(row.as, 'person name')),
      label: (row.as as string).normalize('NFKC').trim().replace(/\s+/g, ' ') };
  });
  const names = rows.map(row => row.name), targets = new Set(rows.map(row => row.as));
  requireValue(rows.length <= 500 && rows.every(row => row.name !== null && row.as !== null && row.name !== row.as) &&
    new Set(names).size === names.length && names.every(name => !targets.has(name)) &&
    rows.every(row => ![row.name, row.as].some(name => name === ownerName || separateNames.includes(name))),
    'Each same-as name joins one distinct name to a different person, without chains, your own name or names kept separate.');
  return rows;
}

function readSelfLinks(file: string, dataClass: string): SelfLinks {
  const resolved = path.resolve(file);
  if (dataClass === 'private') manualOutputLocation(path.dirname(resolved), 'private');
  requireValue(fs.realpathSync(resolved) === resolved && fs.statSync(resolved).isFile() && fs.statSync(resolved).size <= 1024 * 1024,
    'Choose a bounded, non-redirected self links file.');
  const originalBytes = fs.readFileSync(resolved), value = JSON.parse(originalBytes.toString('utf8'));
  if (value?.kind === 'owner-name-rule') {
    // The owner's standing rule: every participant with exactly the owner's normalized name is the owner, in any snapshot.
    object(value, ['schemaVersion', 'dataClass', 'kind', 'ownerName', 'confirmedAt', 'ownerAddresses', 'sameNamePeople', 'separateNames',
      'sameAs', 'hiddenNames', 'businessNames', 'personNames'], 'owner name rule');
    const ownerName = comparableName(text(value.ownerName, 'owner name'));
    const ownerAddresses = value.ownerAddresses === undefined ? [] :
      array(value.ownerAddresses, 'owner addresses').map(address => emailKey(text(address, 'owner address')));
    const separateNames = value.separateNames === undefined ? [] :
      array(value.separateNames, 'separate names').map(name => comparableName(text(name, 'separate name')));
    requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && ownerName !== null &&
      ownerAddresses.every(address => address !== null) && (value.ownerAddresses === undefined || ownerAddresses.length > 0) &&
      (value.sameNamePeople === undefined ? value.separateNames === undefined : value.sameNamePeople === true && value.separateNames !== undefined) &&
      separateNames.every(name => name !== null) && new Set(separateNames).size === separateNames.length &&
      !Number.isNaN(Date.parse(text(value.confirmedAt, 'confirmation time'))), 'Invalid owner name rule.');
    const sameAs = nameEdits(value, ownerName, separateNames);
    const hiddenNames = value.hiddenNames === undefined ? [] :
      array(value.hiddenNames, 'hidden names').map(name => comparableName(text(name, 'hidden name')));
    requireValue(hiddenNames.every(name => name !== null) && new Set(hiddenNames).size === hiddenNames.length,
      'Hidden names must be distinct names.');
    const category = (key: 'businessNames' | 'personNames', what: string) => value[key] === undefined ? [] :
      array(value[key], `${what} names`).map(name => comparableName(text(name, `${what} name`)));
    const businessNames = category('businessNames', 'business'), personNames = category('personNames', 'person');
    requireValue([businessNames, personNames].every(list => list.every(name => name !== null) && new Set(list).size === list.length) &&
      businessNames.every(name => !personNames.includes(name)), 'Business and person names must be distinct, and no name can be both.');
    return Object.assign(new Map<string, string>(), { originalBytes, inputDigest: hash(originalBytes),
      confirmedAt: value.confirmedAt as string, ownerName, ownerAddresses, sameNamePeople: value.sameNamePeople === true, separateNames,
      sameAs, hiddenNames, businessNames, personNames });
  }
  object(value, ['schemaVersion', 'dataClass', 'kind', 'museInputDigest', 'confirmedAt', 'slots'], 'self links');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && value.kind === 'owner-confirmed-self-slots' &&
    typeof value.museInputDigest === 'string' && /^[0-9a-f]{64}$/.test(value.museInputDigest) &&
    !Number.isNaN(Date.parse(text(value.confirmedAt, 'confirmation time'))), 'Invalid owner-confirmed self links.');
  const rows = array(value.slots, 'self slots'), links: SelfLinks = new Map();
  requireValue(rows.length <= 500, 'Self links exceed their bounded review.');
  for (const row of rows) {
    object(row, ['source', 'reportedChatId', 'participantIndex', 'participantName'], 'self slot');
    const at = `${row.source}|${text(row.reportedChatId, 'reported chat ID')}|${row.participantIndex}`;
    requireValue(['messenger', 'instagram'].includes(row.source) && Number.isInteger(row.participantIndex) && row.participantIndex >= 0 &&
      !links.has(at), 'Each self link needs one distinct chat participant.');
    links.set(at, text(row.participantName, 'participant name'));
  }
  return Object.assign(links, { originalBytes, inputDigest: hash(originalBytes), confirmedAt: value.confirmedAt as string,
    museInputDigest: value.museInputDigest as string });
}

// Each person is one explicit owner decision; nothing here joins entries by name, address or contact match.
function readPeopleLinks(file: string, dataClass: string): PeopleLinks {
  const resolved = path.resolve(file);
  if (dataClass === 'private') manualOutputLocation(path.dirname(resolved), 'private');
  requireValue(fs.realpathSync(resolved) === resolved && fs.statSync(resolved).isFile() && fs.statSync(resolved).size <= 1024 * 1024,
    'Choose a bounded, non-redirected people links file.');
  const originalBytes = fs.readFileSync(resolved), value = JSON.parse(originalBytes.toString('utf8'));
  object(value, ['schemaVersion', 'dataClass', 'kind', 'confirmedAt', 'inputs', 'people'], 'people links');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && value.kind === 'owner-confirmed-people-links' &&
    !Number.isNaN(Date.parse(text(value.confirmedAt, 'confirmation time'))), 'Invalid owner-confirmed people links.');
  const rows = array(value.people, 'confirmed people'), seen = new Set<string>();
  requireValue(rows.length <= 500, 'People links exceed their bounded review.');
  const people = rows.map(row => {
    object(row, ['displayName', 'members'], 'confirmed person');
    const members = array(row.members, 'person members').map(member => {
      object(member, ['source', 'reportedChatId', 'participantIndex', 'participantName', 'address'], 'person member');
      let parsed: PersonMember;
      if (member.source === 'gmail') {
        requireValue(Object.keys(member).length === 2, 'Gmail members hold only an address.');
        const address = emailKey(text(member.address, 'member address'));
        requireValue(address !== null, 'Gmail members need an email address.');
        parsed = { source: 'gmail', address };
      } else {
        requireValue(['messenger', 'instagram'].includes(member.source as string) && member.address === undefined &&
          Number.isInteger(member.participantIndex) && (member.participantIndex as number) >= 0, 'Invalid chat participant member.');
        parsed = { source: member.source as 'messenger', reportedChatId: text(member.reportedChatId, 'reported chat ID'),
          participantIndex: member.participantIndex as number, participantName: text(member.participantName, 'participant name') };
      }
      requireValue(!seen.has(memberRef(parsed)), 'Each entry belongs to at most one confirmed person.');
      seen.add(memberRef(parsed));
      return parsed;
    });
    requireValue(members.length >= 2, 'A confirmed person joins at least two entries.');
    const chats = members.filter(m => m.source !== 'gmail').map(m => `${m.source}|${(m as { reportedChatId: string }).reportedChatId}`);
    requireValue(new Set(chats).size === chats.length, 'Two entries in one chat are different people and never join.');
    return { displayName: text(row.displayName, 'person display name'), members };
  });
  return { people, originalBytes, inputDigest: hash(originalBytes), confirmedAt: value.confirmedAt as string };
}

function initials(label: string): string {
  const letters = label.split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0] ?? '');
  return letters.join('').toLocaleUpperCase() || '?';
}

// Every sent row's sender is one of the owner's addresses, as are any the owner listed. Only addresses the owner wrote to
// count as correspondents; received-only senders (often automated) stay hidden until the owner writes to them.
// A message is one-to-one only when exactly one non-owner address, hidden ones included, is on it.
function gmailPeople(gmail: GmailSource, ownerAddresses: readonly string[] = []) {
  const sent = gmail.observations.filter(row => row.direction === 'sent');
  const owner = new Set([gmail.account, ...ownerAddresses, ...sent.map(row => row.from)]);
  const correspondents = new Set(sent.flatMap(row => [...row.to, ...row.cc]).filter(a => !owner.has(a)));
  const hidden = new Set(gmail.observations.flatMap(row => [row.from, ...row.to, ...row.cc])
    .filter(a => !owner.has(a) && !correspondents.has(a)));
  const threads = new Map<string, { people: string[]; direct: boolean; latest: string }>();
  for (const row of gmail.observations) {
    const others = [...new Set([row.from, ...row.to, ...row.cc])].filter(a => !owner.has(a)).sort();
    const people = others.filter(a => correspondents.has(a));
    if (!people.length) continue;
    const key = JSON.stringify(others), found = threads.get(key);
    if (!found || row.timestamp > found.latest) threads.set(key, { people, direct: others.length === 1, latest: row.timestamp });
  }
  return { owner, correspondents, hiddenAddresses: hidden.size, threads: [...threads.values()] };
}

function connectionModel(observations: TextObservations | null, muse: MuseSource[], photos: PhotoSet | null = null,
  zone: string | null = null, photoLinks: PhotoLinks | null = null, selfLinks: SelfLinks | null = null,
  gmail: GmailSource | null = null, peopleLinks: PeopleLinks | null = null, contacts: readonly SavedContact[] | null = null,
  googlePhotos: GooglePhotoSet | null = null): ConnectionModel {
  // Calendar days need the owner's zone; without one, recency stays unknown rather than defaulting to UTC.
  const timeZone = observations?.period?.timeZone ?? zone;
  const formatter = timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }) : null;
  const dayOf = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (formatter === null || Number.isNaN(Date.parse(value))) return null;
    const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  type Profile = 'reported' | 'confirmed' | 'address' | 'contact' | 'joined' | 'sameName' | 'sameAs' | null;
  const nodes = new Map<string, GraphNode & { kinds: Set<GraphChat['kind']>; profile: Profile; reported: Set<string>; mail: Set<string>;
    named: boolean }>();
  const usedLinks = new Set<string>(), usedSelf = new Set<string>();
  const chats: GraphChat[] = [];
  const photoByKey = new Map((photos?.photos ?? []).map(photo => [photo.key, photo]));
  const linked = new Map<string, Photo>();
  // Only reported account IDs that resolve and match a participant in every source identify the owner;
  // name-based hiding can miss differently named slots.
  let selfIdentified = muse.length > 0;
  let selfHidden = 0;
  // Entries are collected first so owner-confirmed people can join them before nodes are numbered.
  const entries: { key: string; label: string; platform: Platform; chat: GraphChat; profile: Profile; photo: Photo | null;
    ref: string | null; name: string | null; contactName?: string }[] = [];
  const add = (key: string, label: string, platform: Platform, chat: GraphChat, profile: Profile, photo: Photo | null,
    ref: string | null = null, name: string | null = null, contactName?: string) =>
    entries.push({ key, label, platform, chat, profile, photo, ref, name, ...(contactName ? { contactName } : {}) });
  for (const source of muse) {
    const platform: Platform = source.source;
    const self = new Set((source.selfIds ?? []).map(id => participantKey(platform, id)).filter(Boolean));
    const sourceDay = dayOf(source.retrievedAt);
    let selfMatched = false;
    source.records.forEach((row, index) => {
      const kind = row.chatType === 'group' ? 'group' : row.chatType === 'unknown' ? 'unknown' : 'one-to-one';
      const chat: GraphChat = { id: `c${chats.length + 1}`, platform, kind, latest: row.reportedLatestSentAt, asOf: sourceDay, members: [],
        label: `${PLATFORMS[platform]} ${kind === 'group' ? 'group chat' : kind === 'unknown' ? 'chat' : 'one-to-one chat'} ${index + 1}` };
      chats.push(chat);
      row.participants.forEach((participant, position) => {
        const reported = participantKey(platform, participant.id);
        if (reported && self.has(reported)) { selfMatched = true; return; }
        const at = `${platform}|${row.reportedChatId}|${position}`;
        if (selfLinks?.ownerName && comparableName(participant.name) === selfLinks.ownerName) {
          requireValue(reported !== null || !photoLinks?.has(at), 'The owner name rule conflicts with a confirmed photo link.');
          selfHidden++;
          return;
        }
        if (reported === null && selfLinks?.has(at)) {
          requireValue(selfLinks.get(at) === participant.name && !photoLinks?.has(at),
            'A confirmed self link no longer matches its chat participant, or conflicts with a photo link.');
          usedSelf.add(at); selfHidden++;
          return;
        }
        const link = reported === null ? photoLinks?.get(at) : undefined;
        if (link) {
          requireValue(link.name === participant.name, 'A confirmed photo link no longer matches its chat participant.');
          usedLinks.add(at);
        }
        const key = reported ?? link?.key ?? null;
        const photo = platform === 'messenger' && key ? photoByKey.get(key) ?? null : null;
        add(key ? `${platform}|${key}` : `${platform}|${chat.id}|${position}`,
          participant.name ?? 'Participant (ID only)', platform, chat, reported ? 'reported' : link ? 'confirmed' : null, photo,
          at, participant.name);
      });
    });
    if (!selfMatched) selfIdentified = false;
  }
  requireValue(photoLinks === null || usedLinks.size === photoLinks.size, 'A confirmed photo link has no matching chat participant.');
  requireValue(selfLinks === null || usedSelf.size === selfLinks.size, 'A confirmed self link has no matching chat participant.');
  [...new Set(observations?.messages.map(m => m.threadUiId) ?? [])].forEach((thread, index) => {
    const inside = observations.messages.filter(m => m.threadUiId === thread && m.requestedWindowMembership === 'inferred-inside')
      .map(m => m.inferredLocalDate).sort();
    const chat: GraphChat = { id: `c${chats.length + 1}`, platform: 'messages', kind: 'text', members: [],
      label: `Text conversation ${index + 1}`, latest: inside.at(-1) ?? null,
      asOf: observations.period ? dayOf(new Date(Date.parse(observations.period.end) - 1).toISOString()) : null };
    chats.push(chat);
    add(`messages|${thread}`, `Conversation ${index + 1}`, 'messages', chat, null, null);
  });
  let gmailHidden: number | null = null;
  const contactCards: string[][] = [];
  if (gmail) {
    // A saved contact names an address only when every contact listing that mailbox has the same name; addresses saved under
    // the owner's own name are the owner's.
    const named = new Map<string, Map<string, string>>();
    for (const contact of contacts ?? []) {
      const label = contact.displayName?.trim(), name = comparableName(label);
      if (!name) continue;
      for (const address of contact.addresses) {
        const key = address.type === 'email' ? mailboxKey(address.value) : null;
        if (key) named.set(key, (named.get(key) ?? new Map()).set(name, label));
      }
    }
    const contactOf = (address: string) => {
      const names = named.get(mailboxKey(address) ?? '');
      return names?.size === 1 ? [...names][0] : null;
    };
    const ownContact = [...new Set(gmail.observations.flatMap(row => [row.from, ...row.to, ...row.cc]))]
      .filter(address => selfLinks?.ownerName !== undefined && contactOf(address)?.[0] === selfLinks.ownerName);
    const people = gmailPeople(gmail, [...selfLinks?.ownerAddresses ?? [], ...ownContact]);
    const asOf = dayOf(new Date(Date.parse(gmail.coverage.end) - 1).toISOString());
    gmailHidden = people.hiddenAddresses;
    people.threads.forEach((thread, index) => {
      const kind = thread.direct ? 'one-to-one' : 'group';
      const chat: GraphChat = { id: `c${chats.length + 1}`, platform: 'gmail', kind, latest: thread.latest, asOf, members: [],
        label: `${kind === 'group' ? 'Group email' : 'Email'} ${index + 1}` };
      chats.push(chat);
      for (const address of thread.people) {
        const contact = contactOf(address)?.[1];
        add(`gmail|${address}`, contact ?? address, 'gmail', chat, contact ? 'contact' : 'address', null, `gmail|${address}`, address, contact);
      }
    });
    // Named addresses listed on one saved contact are that one person, so one email to several of them is not namesakes.
    const shown = [...new Set(people.threads.flatMap(thread => thread.people))].filter(address => contactOf(address));
    for (const contact of contacts ?? []) {
      const keys = new Set(contact.addresses.filter(a => a.type === 'email').map(a => mailboxKey(a.value)).filter(Boolean));
      const card = shown.filter(address => keys.has(mailboxKey(address))).map(address => `gmail|${address}`);
      if (card.length > 1) contactCards.push(card);
    }
  }
  // Union only the entries the owner confirmed are one person; a person may never carry two different photos.
  const parent = new Map<string, string>();
  const find = (key: string) => { while (parent.has(key)) key = parent.get(key); return key; };
  const byRef = new Map(entries.filter(e => e.ref !== null).map(e => [e.ref, e]));
  const personOf = new Map<string, string>();
  for (const person of peopleLinks?.people ?? []) {
    const roots = [...new Set(person.members.map(member => {
      const entry = byRef.get(memberRef(member));
      requireValue(entry && (member.source === 'gmail' || entry.name === member.participantName),
        'A confirmed person no longer matches its entries, or includes one of your own entries.');
      return find(entry.key);
    }))];
    requireValue(roots.every(root => !personOf.has(root)), 'Two confirmed people share an entry.');
    roots.slice(1).forEach(root => parent.set(root, roots[0]));
    personOf.set(roots[0], person.displayName);
  }
  for (const card of contactCards) {
    const roots = [...new Set(card.map(find))], named = roots.filter(root => personOf.has(root)).map(root => personOf.get(root));
    if (roots.length < 2 || named.length > 1) continue;
    roots.slice(1).forEach(root => { parent.set(root, roots[0]); personOf.delete(root); });
    if (named.length) personOf.set(roots[0], named[0]);
  }
  // Only people links are owner-confirmed people; rule joins below must not mark their nodes as confirmed.
  const linkedPeople = new Set(personOf.keys());
  // The owner's standing rule: chat entries with exactly the same normalized name are one person unless the owner listed the
  // name as separate. Names the owner said are another person's ("same as") join that person's name group, in chats or Gmail.
  // Namesakes in one chat, different reported IDs on one platform, two confirmed people or two different photos are evidence
  // of different people, so that name stays separate; an explicit same-as that cannot join is counted, not forced.
  const sameNameJoined = new Set<string>(), sameAsJoined = new Set<string>();
  let sameAsUnjoined = 0;
  const aliases = new Map((selfLinks?.sameAs ?? []).map(row => [row.name, row]));
  const aliasTargets = new Set(aliases.size ? [...aliases.values()].map(row => row.as) : []);
  const hiddenNames = new Set(selfLinks?.hiddenNames ?? []);
  if (selfLinks?.sameNamePeople || aliases.size) {
    // Guards check everything a merged root already holds, so chained joins through one entry cannot combine conflicts.
    const facts = new Map<string, { photos: Set<string>; reported: Set<string>; chats: Set<string> }>();
    for (const entry of entries) {
      const root = find(entry.key);
      const fact = facts.get(root) ?? { photos: new Set(), reported: new Set(), chats: new Set() };
      if (entry.photo) fact.photos.add(entry.photo.file);
      if (entry.profile === 'reported') fact.reported.add(entry.key);
      fact.chats.add(entry.chat.id);
      facts.set(root, fact);
    }
    // A Gmail entry's own name is the contact name its address is saved under, if any; chat entries use their chat name.
    const nameOf = (entry: typeof entries[number]) => entry.platform === 'gmail' ? comparableName(entry.contactName) : comparableName(entry.name);
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const raw = entry.platform === 'messages' ? null : comparableName(entry.name);
      if (raw === null) continue;
      const own = nameOf(entry), alias = aliases.has(raw) ? raw : own !== null && aliases.has(own) ? own : null;
      // A same-as row may name a Gmail address itself; that address groups under the address, not its contact name.
      const asTarget = aliasTargets.has(raw) ? raw : own !== null && aliasTargets.has(own) ? own : null;
      const explicit = alias !== null || asTarget !== null;
      const byRule = selfLinks.sameNamePeople && own !== null && !selfLinks.separateNames.includes(own);
      if (!explicit && !byRule) continue;
      const name = alias !== null ? aliases.get(alias).as : asTarget ?? own ?? raw;
      groups.set(name, [...groups.get(name) ?? [], entry]);
    }
    for (const [name, group] of groups) {
      const explicit = group.some(entry => aliases.has(comparableName(entry.name)) || aliases.has(nameOf(entry)));
      if (!explicit && !selfLinks.sameNamePeople) continue;
      const roots = [...new Set(group.map(entry => find(entry.key)))];
      const target = (group.find(entry => nameOf(entry) === name) ?? group.find(entry => comparableName(entry.name) === name))?.label ??
        [...aliases.values()].find(row => row.as === name)?.label ?? group[0].label;
      if (roots.length < 2) {
        // An explicit same-as still gives a lone entry the name the owner said it belongs to.
        if (explicit && !personOf.has(roots[0])) { personOf.set(roots[0], target); sameAsJoined.add(roots[0]); }
        continue;
      }
      const held = roots.map(root => facts.get(root));
      const photos = new Set(held.flatMap(fact => [...fact.photos]));
      const reported = held.flatMap(fact => [...fact.reported]);
      const platforms = reported.map(key => key.slice(0, key.indexOf('|')));
      const chatsSeen = new Set<string>();
      let clash = false;
      held.forEach(fact => fact.chats.forEach(chat => { if (chatsSeen.has(chat)) clash = true; chatsSeen.add(chat); }));
      const named = new Set(roots.map(root => personOf.get(root)).filter(Boolean));
      if (photos.size > 1 || new Set(platforms).size !== platforms.length || clash || named.size > 1) {
        if (explicit) sameAsUnjoined++;
        continue;
      }
      roots.slice(1).forEach(root => { parent.set(root, roots[0]); personOf.delete(root); facts.delete(root); });
      if (roots.some(root => linkedPeople.has(root))) linkedPeople.add(roots[0]);
      facts.set(roots[0], { photos, reported: new Set(reported), chats: chatsSeen });
      personOf.set(roots[0], [...named][0] ?? (explicit ? target : group[0].label));
      (explicit ? sameAsJoined : sameNameJoined).add(roots[0]);
    }
  }
  for (const entry of entries) {
    const key = find(entry.key), person = personOf.get(key);
    let node = nodes.get(key);
    if (!node) {
      const label = person ?? entry.label;
      node = { id: `n${nodes.size + 1}`, label, initials: initials(label), ring: 'unknown', ringLabel: '', kind: 'unknown',
        lastActivity: null, lastNote: '', platforms: [], platformLabels: [], chats: [], photo: null, identityNote: '',
        kinds: new Set(), reported: new Set(), mail: new Set(), named: false, ...(linkedPeople.has(key) ? { confirmed: true } : {}), profile: sameAsJoined.has(key) ? 'sameAs' : sameNameJoined.has(key) ? 'sameName' : person ? 'joined' : entry.profile };
      nodes.set(key, node);
    }
    if (entry.photo) {
      requireValue(node.photo === null || node.photo === entry.photo.file, 'A confirmed person joins entries with different photos.');
      node.photo = entry.photo.file; linked.set(entry.photo.file, entry.photo);
    }
    if (!node.platforms.includes(entry.platform)) node.platforms.push(entry.platform);
    if (entry.profile === 'reported') node.reported.add(entry.key);
    if (entry.platform === 'gmail') node.mail.add(entry.name);
    if (entry.platform !== 'gmail' || entry.contactName) node.named = true;
    if (node.chats.includes(entry.chat.id)) continue;
    node.chats.push(entry.chat.id); node.kinds.add(entry.chat.kind); entry.chat.members.push(node.id);
  }
  const googleAttached = new Set<string>();
  if (googlePhotos) {
    const evidence = [...nodes.values()].map(node => ({ node,
      addresses: [...node.mail].map(value => ({ type: 'email', value })) }));
    const contactEmails = new Map<string, Set<SavedContact>>();
    for (const contact of contacts ?? []) for (const address of contact.addresses) {
      const key = address.type === 'email' ? normalized('email', address.value) : null;
      if (key) contactEmails.set(key, (contactEmails.get(key) ?? new Set()).add(contact));
    }
    // A phone can reach a graph person only through one saved contact's unique exact email.
    // Unresolved contacts remain evidence holders so shared phone/email never becomes unique by omission.
    for (const contact of contacts ?? []) {
      const emails = contact.addresses.filter(address => address.type === 'email').map(address => normalized('email', address.value)).filter(Boolean);
      const matches = evidence.filter(person => person.node && [...person.node.mail].some(mail => emails.includes(normalized('email', mail))));
      if (matches.length === 1 && emails.every(email => contactEmails.get(email).size === 1)) {
        matches[0].addresses.push(...contact.addresses);
      } else evidence.push({ node: null, addresses: [...contact.addresses] });
    }
    for (const [person, photo] of matchGooglePhotos(evidence, googlePhotos)) {
      if (!person.node || person.node.photo !== null) continue;
      person.node.photo = photo.file;
      googleAttached.add(person.node.id);
      linked.set(photo.file, photo);
    }
  }
  // Each chat ages against its own source snapshot day, never the render clock or another source's later snapshot.
  const sourceDays = [...new Set(chats.map(c => c.asOf).filter((d): d is string => d !== null))].sort();
  const asOf = sourceDays.length === 0 ? null : sourceDays.length === 1 ? sourceDays[0] : `${sourceDays[0]} to ${sourceDays.at(-1)}`;
  const direct = (chat: GraphChat) => chat.kind === 'one-to-one' || chat.kind === 'text';
  // Google Contacts is the owner's source of truth: a name or mailbox counts as a business only when every saved contact
  // carrying it is one. The owner's name rule decides next; automated-looking addresses with no saved name are only a guess.
  const contactBusiness = new Map<string, boolean>(), mailBusiness = new Map<string, boolean>();
  for (const contact of contacts ?? []) {
    const name = comparableName(contact.displayName);
    if (name) contactBusiness.set(name, (contactBusiness.get(name) ?? true) && !!contact.business);
    for (const address of contact.addresses) {
      const key = address.type === 'email' ? mailboxKey(address.value) : null;
      if (key) mailBusiness.set(key, (mailBusiness.get(key) ?? true) && !!contact.business);
    }
  }
  const businessNames = new Set(selfLinks?.businessNames ?? []), personNames = new Set(selfLinks?.personNames ?? []);
  const businessOf = (label: string, mail: Set<string>, named: boolean): GraphNode['business'] | null => {
    const names = [comparableName(label), ...[...mail].map(comparableName)];
    if (contactBusiness.get(names[0]) === true || [...mail].some(address => mailBusiness.get(mailboxKey(address) ?? '') === true)) return 'contacts';
    if (names.some(name => personNames.has(name))) return null;
    if (names.some(name => businessNames.has(name))) return 'rule';
    return !named && mail.size > 0 && [...mail].every(automatedAddress) ? 'guess' : null;
  };
  const result = [...nodes.values()].map(({ kinds, profile, reported, mail, named, ...node }) => {
    const business = businessOf(node.label, mail, named);
    // Platforms where this person has a reported profile ID, so the page can refuse combining two different profiles.
    const reportedOn = [...reported].map(key => key.slice(0, key.indexOf('|')) as Platform).sort();
    const kind: Kind = kinds.has('one-to-one') ? 'direct' : kinds.has('text') ? 'text' : kinds.has('group') ? 'group' : 'unknown';
    let last: { day: string; age: number; chat: GraphChat } | null = null;
    for (const id of node.chats) {
      const chat = chats.find(c => c.id === id), day = dayOf(chat.latest);
      if (day === null || chat.asOf === null) continue;
      const age = Math.max(0, (Date.parse(`${chat.asOf}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
      if (last === null || day > last.day || (day === last.day && direct(chat) && !direct(last.chat))) last = { day, age, chat };
    }
    const ring = last === null ? RINGS.at(-1) : RINGS.find(r => last.age <= r.maxAge);
    const age = last?.age;
    return { ...node, ring: ring.id, ringLabel: ring.label, kind, lastActivity: last?.day ?? null,
      lastNote: last === null ? (formatter === null && node.chats.some(id => chats.find(c => c.id === id).latest !== null) ?
        'No time zone supplied, so the activity day is unknown.' : 'No activity date returned for any shared chat.') :
        `${last.day} · ${age === 0 ? 'same day as' : age === 1 ? '1 day before' : `${age} days before`} its ${last.chat.asOf} snapshot · ${
          last.chat.kind === 'group' ? `latest group-${last.chat.platform === 'gmail' ? 'email' : 'chat'} activity, not necessarily with them` :
            last.chat.kind === 'unknown' ? 'latest activity in a chat of unknown type, not necessarily with them' :
              last.chat.kind === 'text' ? 'latest observed message (inferred day)' :
                last.chat.platform === 'gmail' ? 'latest email with only them' : 'latest one-to-one activity'}`,
      platformLabels: node.platforms.map(p => PLATFORMS[p]),
      identityNote: (profile === 'sameAs' ? 'Combined because you said these names are the same person.' :
        profile === 'sameName' ? 'Joined by your rule that the same name is the same person; names you listed as separate, and namesakes in one chat, stay apart.' :
        profile === 'joined' ? 'You confirmed these entries are one person; they are joined only where you confirmed it.' :
        kind === 'text' ? 'Participants were not captured; not linked to any contact.' :
        profile === 'address' ? 'An email address you wrote to; joined with other sources only where you confirmed it.' :
        profile === 'contact' ? 'An email address you wrote to, named by the one contact it is saved under; addresses on that one contact show together, and other entries join only by your same-name rule.' :
        profile === 'confirmed' ? 'You confirmed this person matches a saved friend photo; joined only where you confirmed it.' :
        profile ? `Muse-reported profile ID; unverified.${node.photo && !googleAttached.has(node.id) ? ' Photo attached by exact profile ID match.' : ''}` :
          selfLinks?.sameNamePeople ? 'No profile ID; not joined with any other entry.' :
          'No profile ID; this entry is local to one chat and never merged by name.') +
        (googleAttached.has(node.id) ? ' Google photo attached by unique exact connection email/phone evidence, not by name or image.' : ''),
      ...(reportedOn.length ? { reportedOn } : {}), ...(hiddenNames.has(comparableName(node.label)) ? { hidden: true } : {}),
      ...(business ? { business } : {}) };
  });
  const groups: GraphNode[] = chats.filter(chat => chat.kind === 'group' && chat.members.length).map(chat => {
    const day = dayOf(chat.latest);
    const age = day === null || chat.asOf === null ? null :
      Math.max(0, (Date.parse(`${chat.asOf}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
    const ring = age === null ? RINGS.at(-1) : RINGS.find(r => age <= r.maxAge);
    return { id: `group-${chat.id}`, groupChat: chat.id, label: chat.label, initials: 'GC', kind: 'group',
      ring: ring.id, ringLabel: ring.label, lastActivity: age === null ? null : day,
      lastNote: age === null ? 'Group activity date unknown; no dated interaction with any member is inferred.' :
        `${day} · latest group activity against its ${chat.asOf} snapshot, not a direct interaction with any member.`,
      platforms: [chat.platform], platformLabels: [PLATFORMS[chat.platform]], chats: [chat.id], photo: null,
      identityNote: 'Listed group membership is not evidence of a direct interaction. Members retain their own identity and hide/combine choices.' };
  });
  return { nodes: result, groups, chats, linkedPhotos: [...linked.values()], selfIdentified, selfHidden, asOf, gmailHidden,
    ...(aliases.size ? { sameAsUnjoined } : {}) };
}

const BADGES = `<g id="badge-messenger"><circle r="8" fill="#0a7cff" stroke="#fffdf9" stroke-width="2"/><path d="M-4.6 2.3L-1.2-1.9L1 .4L4.6-2.3L1.2 1.9L-1-.4Z" fill="#fff"/></g>
<g id="badge-instagram"><circle r="8" fill="#d62976" stroke="#fffdf9" stroke-width="2"/><rect x="-3.8" y="-3.8" width="7.6" height="7.6" rx="2.2" fill="none" stroke="#fff" stroke-width="1.3"/><circle r="1.7" fill="none" stroke="#fff" stroke-width="1.3"/></g>
<g id="badge-messages"><circle r="8" fill="#1e8e3e" stroke="#fffdf9" stroke-width="2"/><path d="M-4-3.4h8a1 1 0 0 1 1 1v4.1a1 1 0 0 1-1 1h-4.2l-2.6 2.1v-2.1h-1.2a1 1 0 0 1-1-1v-4.1a1 1 0 0 1 1-1z" fill="#fff"/></g>
<g id="badge-gmail"><circle r="8" fill="#c5221f" stroke="#fffdf9" stroke-width="2"/><rect x="-4.4" y="-3.2" width="8.8" height="6.4" rx="1" fill="#fff"/><path d="M-4.2-2.8L0 .6L4.2-2.8" fill="none" stroke="#c5221f" stroke-width="1.2"/></g>`;

function groupOnly(node: GraphNode, chats: Map<string, GraphChat>): boolean {
  return !node.groupChat && node.chats.length > 0 && node.chats.every(id => chats.get(id)?.kind === 'group');
}

function connectionLayout(nodes: GraphNode[], rings: typeof RINGS) {
  const used = rings.filter(ring => nodes.some(node => node.ring === ring.id));
  let previous = 60;
  const radii = used.map(ring => {
    const count = nodes.filter(node => node.ring === ring.id).length, label = ring.label.length * 6.6 + 50;
    previous = Math.max(ring.base, previous + 100, Math.ceil((count * 58 + label) / (2 * Math.PI)));
    return { ...ring, radius: previous, count, gap: Math.min(Math.PI, label / previous) };
  });
  const positions = new Map<string, { x: number; y: number }>();
  radii.forEach((ring, k) => nodes.filter(node => node.ring === ring.id).forEach((node, index) => {
    const angle = -Math.PI / 2 + ring.gap / 2 + ((index + 0.5 + k * 0.37) % ring.count) * (2 * Math.PI - ring.gap) / ring.count;
    positions.set(node.id, { x: +(ring.radius * Math.cos(angle)).toFixed(1), y: +(ring.radius * Math.sin(angle)).toFixed(1) });
  }));
  return { radii, positions, extent: previous + 80 };
}

function connectionSVG(model: ConnectionModel): string {
  const chats = new Map(model.chats.map(chat => [chat.id, chat]));
  const groups = model.groups.filter(node => chats.get(node.groupChat).members.some(id => groupOnly(model.nodes.find(n => n.id === id), chats)));
  const displayed = [...model.nodes.filter(node => !groupOnly(node, chats)), ...groups];
  const { radii, positions, extent } = connectionLayout(displayed, RINGS);
  const circles = radii.map(ring => `<circle class="ring" r="${ring.radius}"/>
<text class="ring-label" y="${-ring.radius + 4}" text-anchor="middle">${escape(ring.label)}</text>`).join('');
  const spokes: string[] = [], items: string[] = [];
  [...model.nodes, ...model.groups].forEach(node => {
      const { x, y } = positions.get(node.id) ?? { x: 0, y: 0 };
      if (node.kind === 'direct' || node.kind === 'text') spokes.push(`<line class="spoke ${node.kind}" data-spoke="${node.id}" x1="0" y1="0" x2="${x}" y2="${y}"/>`);
      const short = node.groupChat ? node.label.replace(`${node.platformLabels[0]} `, '') :
        Array.from(node.label.split(/\s+/)[0] ?? '').slice(0, 12).join('');
      items.push(`<g class="node kind-${node.kind}${node.groupChat ? ' group-chat bubble' : ''}${positions.has(node.id) ? '' : ' filtered'}" data-node="${node.id}"${node.groupChat ? ` data-bubble="${escape(node.groupChat)}"` : ''} transform="translate(${x} ${y})" tabindex="0" role="button" aria-pressed="false"
aria-label="${escape(`${node.label}: ${node.ringLabel}; ${node.platformLabels.join(', ')}`)}"><title>${escape(node.label)}</title>
${node.groupChat ? '<circle class="bubble-hit" r="38"/>' : ''}
<circle class="halo" r="28"/>${node.photo ? `<image href="photos/${escape(node.photo)}" x="-22" y="-22" width="44" height="44" clip-path="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice"/>`
        : `<circle class="disc" r="22"/><text class="initials" y="5" text-anchor="middle">${escape(node.initials)}</text>`}
<circle class="rim" r="22"/>${node.platforms.map((platform, i) => `<use href="#badge-${platform}" x="${16 - i * 15}" y="16"/>`).join('')}
<text class="node-label" y="40" text-anchor="middle">${escape(short)}</text>${node.groupChat ? '<text class="bubble-count" y="53" text-anchor="middle"></text><g class="bubble-members"></g>' : ''}</g>`);
  });
  return `<svg id="connections-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${-extent} ${-extent} ${extent * 2} ${extent * 2}" role="group" aria-labelledby="connections-title connections-desc">
<title id="connections-title">Your connections in concentric rings</title>
<desc id="connections-desc">You are at the center. Rings show how recently a shared chat was active relative to its source snapshot${model.asOf ? ` (${escape(model.asOf)})` : ''}, closest first. Spokes mark one-to-one or observed text conversations. Group-only contacts appear inside group-chat nodes without spokes; hover or select a group to inspect its members.</desc>
<defs><clipPath id="avatar-clip"><circle r="22"/></clipPath>${BADGES}</defs>
<g class="recency-rings">${circles}</g>${spokes.join('')}<circle class="self" r="34"/><text class="self-label" y="6" text-anchor="middle">You</text>${items.join('')}</svg>`;
}

const CONNECTIONS_SCRIPT = `(()=>{
const svg=document.getElementById('connections-svg');if(!svg)return;
const model=JSON.parse(document.getElementById('connections-data').textContent);
const byId=new Map([...model.nodes,...model.groups].map(n=>[n.id,n])),chats=new Map(model.chats.map(c=>[c.id,c]));
const groupOnly=${groupOnly.toString()},connectionLayout=${connectionLayout.toString()};
const nodes=[...svg.querySelectorAll('[data-node]')],els=new Map(nodes.map(el=>[el.dataset.node,el])),NS='http://www.w3.org/2000/svg';
const detail=document.getElementById('connection-detail'),empty=document.getElementById('connection-empty');
let selected=null,hovered=null,moved=false;
// Hide/combine choices persist in this browser as one-way name tags, never names.
const KEY='heartbeat.chartEdits.v1';
const canon=s=>String(s).normalize('NFKC').trim().replace(/\\s+/g,' ').toLocaleLowerCase('en-US');
function tag(s){let a=0xdeadbeef,b=0x41c6ce57;for(const ch of canon(s)){const c=ch.codePointAt(0);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677);}
a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);
return (b>>>0).toString(36)+'-'+(a>>>0).toString(36);}
let edits={hide:[],show:[],combine:[],business:[],person:[]};
try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&[v.hide,v.show,v.combine].every(Array.isArray))
edits={hide:v.hide,show:v.show,combine:v.combine,business:Array.isArray(v.business)?v.business:[],person:Array.isArray(v.person)?v.person:[]};}catch(e){}
const note=document.getElementById('edits-note');
function save(){try{localStorage.setItem(KEY,JSON.stringify(edits));}catch(e){note.textContent='This browser could not save your changes; they last until you close this page.';}}
const without=(list,t)=>list.filter(x=>x!==t);
const labelOf=new Map(model.nodes.map(n=>[tag(n.label),n.label]));
const platformLabel=new Map(model.nodes.flatMap(n=>n.platforms.map((p,i)=>[p,n.platformLabels[i]])));
const order=['today','week','fortnight','month','older','unknown'];
const newer=(a,b)=>{const x=order.indexOf(a.ring),y=order.indexOf(b.ring);return x<y||(x===y&&(a.lastActivity||'')>(b.lastActivity||''));};
const absorbed=new Map();
const live=()=>[...byId.values()].filter(x=>!x.groupChat&&!absorbed.has(x.id)),named=t=>live().filter(x=>tag(x.label)===t);
// Mirrors the model's guards: evidence of two different people is never overridden by a browser combine.
function differ(n,T){if(n.photo&&T.photo&&n.photo!==T.photo)return 'they have different photos';
if(n.chats.some(c=>T.chats.includes(c)))return 'they are both in one chat';
const r=new Set(n.reportedOn||[]);if((T.reportedOn||[]).some(p=>r.has(p)))return 'they have different profiles on one platform';
if(n.confirmed&&T.confirmed)return 'each is a different person you confirmed';return '';}
let blocked=0;
function redraw(id,n,from){const el=els.get(id);el.querySelector('title').textContent=n.label;
el.querySelector('.node-label').textContent=Array.from(n.label.split(/\\s+/)[0]||'').slice(0,12).join('');
el.setAttribute('aria-label',n.label+': '+n.ringLabel+'; '+n.platformLabels.join(', '));
const img=from.querySelector('image');
if(n.photo&&!el.querySelector('image')&&img){for(const x of el.querySelectorAll('.disc,.initials'))x.remove();el.insertBefore(img.cloneNode(),el.querySelector('.rim'));}
const initials=el.querySelector('.initials');if(initials)initials.textContent=n.initials;
for(const u of el.querySelectorAll('use'))u.remove();
n.platforms.forEach((p,i)=>{const u=document.createElementNS(NS,'use');u.setAttribute('href','#badge-'+p);u.setAttribute('x',String(16-i*15));u.setAttribute('y','16');el.insertBefore(u,el.querySelector('.node-label'));});
el.setAttribute('class',el.getAttribute('class').replace(/kind-\\w+/,'kind-'+n.kind));
if((n.kind==='direct'||n.kind==='text')&&![...svg.querySelectorAll('[data-spoke]')].some(s=>s.dataset.spoke===id)){const m=/translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(el.getAttribute('transform'));
const line=document.createElementNS(NS,'line');line.setAttribute('class','spoke '+n.kind);line.dataset.spoke=id;
for(const [k,v] of [['x1',0],['y1',0],['x2',m[1]],['y2',m[2]]])line.setAttribute(k,String(v));svg.insertBefore(line,svg.querySelector('.self'));}}
// A combined person takes the slot of whichever entry was active more recently. Combines are keyed by name, so a
// name shared by more than one current person never combines.
for(const [a,t] of edits.combine){const ns=named(a),ts=named(t);
if(ns.length!==1||ts.length!==1){if(ns.length&&ts.length)blocked++;continue;}
const n=ns[0],T=ts[0];if(T.id===n.id)continue;if(differ(n,T)){blocked++;continue;}
{const keep=newer(n,T)?n:T,other=keep===n?T:n,platforms=[...new Set([...T.platforms,...n.platforms])];
const kind=[keep.kind,other.kind].includes('direct')?'direct':[keep.kind,other.kind].includes('text')?'text':keep.kind;
const merged={...keep,label:T.label,initials:T.initials,photo:T.photo||n.photo,kind,chats:[...new Set([...keep.chats,...other.chats])],
reportedOn:[...new Set([...(n.reportedOn||[]),...(T.reportedOn||[])])],confirmed:!!(n.confirmed||T.confirmed),
platforms,platformLabels:platforms.map(p=>platformLabel.get(p)),combined:[...(T.combined||[]),...(n.combined||[]),[a,t]],
identityNote:'You combined '+n.label+' into '+T.label+' in this browser. '+T.identityNote};
byId.set(keep.id,merged);absorbed.set(other.id,keep.id);
for(const c of chats.values())c.members=[...new Set(c.members.map(m=>m===other.id?keep.id:m))];
redraw(keep.id,merged,els.get(other.id));}}
const layout=connectionLayout([...live().filter(n=>!groupOnly(n,chats)),...model.groups.filter(g=>chats.get(g.groupChat).members.some(id=>groupOnly(byId.get(id),chats)))],${JSON.stringify(RINGS)});
const ringLayer=svg.querySelector('.recency-rings');ringLayer.replaceChildren();
for(const r of layout.radii){const circle=document.createElementNS(NS,'circle'),label=document.createElementNS(NS,'text');
circle.setAttribute('class','ring');circle.setAttribute('r',r.radius);label.setAttribute('class','ring-label');label.setAttribute('y',-r.radius+4);
label.setAttribute('text-anchor','middle');label.textContent=r.label;ringLayer.append(circle,label);}
svg.setAttribute('viewBox',[-layout.extent,-layout.extent,layout.extent*2,layout.extent*2].join(' '));
for(const [id,p] of layout.positions){els.get(id).setAttribute('transform','translate('+p.x+' '+p.y+')');
const spoke=[...svg.querySelectorAll('[data-spoke]')].find(s=>s.dataset.spoke===id);if(spoke){spoke.setAttribute('x2',p.x);spoke.setAttribute('y2',p.y);}}
const hiddenNow=n=>{const t=tag(n.label);return edits.hide.includes(t)||(!!n.hidden&&!edits.show.includes(t));};
// Google Contacts labels cannot be overridden here; browser marks override the name rule and automatic guesses.
const bizNow=n=>{if(n.business==='contacts')return true;const t=tag(n.label);return edits.business.includes(t)||(!!n.business&&!edits.person.includes(t));};
const BASIS={contacts:'Business: from your Google Contacts (a "Business" label, or saved as a company). Change it there.',
rule:'Business: saved in your name rule.',guess:'Business (guess): every address looks automated, like noreply, orders or a bulk-mail domain. Mark as not a business if wrong.'};
function setBiz(n,on){const t=tag(n.label);edits.business=without(edits.business,t);edits.person=without(edits.person,t);
if(on&&!n.business)edits.business.push(t);if(!on&&n.business)edits.person.push(t);save();filter();paint();}
function related(id){const set=new Set([id]);for(const c of byId.get(id).chats){for(const m of chats.get(c).members)set.add(m);
for(const g of model.groups)if(g.groupChat===c)set.add(g.id);}return set;}
const same=document.getElementById('connection-same'),combine=document.getElementById('connection-combine'),combineNote=document.getElementById('combine-note');
function paint(){const active=hovered||selected,rel=active?related(active):null;
for(const el of nodes){const id=el.dataset.node;el.classList.toggle('selected',id===selected);
el.classList.toggle('related',!!rel&&id!==selected&&rel.has(id));el.classList.toggle('dimmed',!!rel&&!rel.has(id));
el.setAttribute('aria-pressed',String(id===selected));}
for(const g of model.groups){const el=els.get(g.id),open=hovered===g.id||selected===g.id||
(selected&&groupOnly(byId.get(selected),chats)&&homeOf(byId.get(selected))===g.id)||el.classList.contains('search-open');
el.classList.toggle('open',!!open);el.querySelector('.bubble-hit').setAttribute('r',open?90:Number(el.dataset.radius)+8);}
for(const s of svg.querySelectorAll('[data-spoke]'))s.classList.toggle('dimmed',!!rel&&!rel.has(s.dataset.spoke));
if(!active){detail.hidden=true;empty.hidden=false;return;}
const n=byId.get(active);document.getElementById('connection-name').textContent=n.label;
document.getElementById('connection-ring').textContent=n.ringLabel+' · '+n.lastNote;
document.getElementById('connection-platforms').textContent=n.platformLabels.join(' · ');
document.getElementById('connection-identity').textContent=n.identityNote;
const list=document.getElementById('connection-chats');list.replaceChildren();
for(const id of n.chats){const c=chats.get(id);const item=document.createElement('li');
item.textContent=c.label+' · latest sent as returned: '+(c.latest||'unknown')+(c.kind==='group'?' · '+c.members.length+' other listed members':'');list.append(item);}
const members=document.getElementById('connection-members');members.replaceChildren();members.hidden=!n.groupChat;
if(n.groupChat){for(const id of chats.get(n.groupChat).members){const member=byId.get(id);if(!eligible(member))continue;
const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='chip';button.textContent=member.label;
button.addEventListener('click',()=>{hovered=null;selected=id;paint();});item.append(button,' · listed member, not a direct interaction');members.append(item);}}
document.getElementById('connection-person-tools').hidden=!!n.groupChat;
if(n.groupChat){document.getElementById('connection-category').hidden=true;combineNote.hidden=true;detail.hidden=false;empty.hidden=true;return;}
const first=new Option('Choose someone…','');same.replaceChildren(first,...live().filter(x=>x.id!==selected&&!hiddenNow(x)&&named(tag(x.label)).length===1)
.sort((x,y)=>x.label.localeCompare(y.label)).map(x=>new Option(x.label,x.id)));combine.disabled=true;
const many=named(tag(n.label)).length;same.disabled=many>1;combineNote.hidden=many<2;
combineNote.textContent=many>1?many+' people have this name, so combining by name is unavailable for them.':'';
document.getElementById('connection-hide').textContent=many>1?'Hide everyone with this name ('+many+')':'Hide from chart';
document.getElementById('connection-separate').hidden=!n.combined;
const biz=bizNow(n),cat=document.getElementById('connection-category'),mark=document.getElementById('connection-business');
cat.hidden=!biz;cat.textContent=!biz?'':n.business&&!edits.business.includes(tag(n.label))?BASIS[n.business]:'Business: marked in this browser.';
mark.textContent=biz?'Not a business':'Mark as business';mark.disabled=n.business==='contacts';
detail.hidden=false;empty.hidden=true;}
function select(id){hovered=null;selected=selected===id?null:id;paint();}
for(const el of nodes){el.addEventListener('click',e=>{e.stopPropagation();select(el.dataset.node);});
el.addEventListener('pointerenter',()=>{if(byId.get(el.dataset.node).groupChat){hovered=el.dataset.node;paint();}});
el.addEventListener('pointerleave',()=>{if(hovered===el.dataset.node){hovered=null;paint();}});
el.addEventListener('focus',()=>{if(byId.get(el.dataset.node).groupChat){hovered=el.dataset.node;paint();}});
el.addEventListener('blur',()=>{hovered=null;paint();});
el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(el.dataset.node);}});}
const checks=[...document.querySelectorAll('[data-platform-filter]')],search=document.getElementById('connection-search'),showBiz=document.getElementById('business-filter');
function lists(){const hidden=live().filter(hiddenNow).sort((x,y)=>x.label.localeCompare(y.label));
document.getElementById('hidden-count').textContent=String(hidden.length);
document.getElementById('hidden-list').replaceChildren(...hidden.map(n=>{const item=document.createElement('li'),b=document.createElement('button');
b.type='button';b.className='chip';b.textContent='Show';b.addEventListener('click',()=>{const t=tag(n.label);edits.hide=without(edits.hide,t);
if(n.hidden&&!edits.show.includes(t))edits.show.push(t);save();filter();});item.append(n.label+' ',b);return item;}));
const combos=edits.combine.filter(([a,t])=>labelOf.has(a)&&labelOf.has(t));
document.getElementById('combined-heading').hidden=!combos.length;
document.getElementById('combined-list').replaceChildren(...combos.map(([a,t])=>{const item=document.createElement('li'),b=document.createElement('button');
b.type='button';b.className='chip';b.textContent='Separate again';b.addEventListener('click',()=>{edits.combine=edits.combine.filter(x=>x[0]!==a);save();location.reload();});
item.append(labelOf.get(a)+' → '+labelOf.get(t)+' ',b);return item;}));
const stuck=document.getElementById('combine-blocked');stuck.hidden=!blocked;
stuck.textContent=blocked+' saved combine(s) were not applied because more than one person now has that name or the entries show different people.';
const firms=live().filter(bizNow).sort((x,y)=>x.label.localeCompare(y.label));
document.getElementById('business-list-count').textContent=String(firms.length);
document.getElementById('business-list').replaceChildren(...firms.map(n=>{const item=document.createElement('li');
item.append(n.label+(n.business==='guess'&&!edits.business.includes(tag(n.label))?' (guess) ':' '));
if(n.business==='contacts'){item.append('(Google Contacts)');return item;}
const b=document.createElement('button');b.type='button';b.className='chip';b.textContent='Not a business';b.addEventListener('click',()=>setBiz(n,false));
item.append(b);return item;}));}
const eligible=n=>!absorbed.has(n.id)&&!hiddenNow(n)&&(showBiz.checked||!bizNow(n));
const homes=new Map();
for(const n of live()){if(!groupOnly(n,chats))continue;let best=null;
for(const id of n.chats){const g=byId.get('group-'+id);if(g&&(!best||(g.lastActivity||'')>(best.lastActivity||'')))best=g;}
if(best)homes.set(n.id,best.id);}
const homeOf=n=>homes.get(n.id);
function bubbleMembers(group,members,term){const el=els.get(group.id),radius=Math.min(40,24+3*Math.sqrt(members.length));
el.dataset.radius=String(radius);
el.querySelector('.disc').setAttribute('r',radius);el.querySelector('.rim').setAttribute('r',radius);el.querySelector('.halo').setAttribute('r',radius+6);
el.querySelector('.node-label').setAttribute('y',radius+17);const count=el.querySelector('.bubble-count');
count.setAttribute('y',radius+30);count.textContent=members.length+' listed';
const home=members.filter(n=>groupOnly(n,chats)&&homeOf(n)===group.id);
el.classList.toggle('search-open',!!term&&home.some(n=>n.label.toLocaleLowerCase().includes(term)));
const container=el.querySelector('.bubble-members');container.replaceChildren(...home.map((n,i)=>{
const member=els.get(n.id).cloneNode(true),angle=-Math.PI/2+i*2*Math.PI/home.length;
member.removeAttribute('data-node');member.setAttribute('class','member-preview');member.dataset.member=n.id;
member.setAttribute('transform','translate('+((radius+28)*Math.cos(angle))+' '+((radius+28)*Math.sin(angle))+') scale(.6)');
member.addEventListener('click',e=>{e.stopPropagation();hovered=null;selected=n.id;paint();});
member.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();hovered=null;selected=n.id;paint();}});
return member;}));}
function filter(){const on=new Set(checks.filter(c=>c.checked).map(c=>c.value));const term=search.value.trim().toLocaleLowerCase();let shown=0,total=0,hid=0,firms=0;
for(const el of nodes){const id=el.dataset.node,n=byId.get(id),gone=absorbed.has(id),off=!gone&&hiddenNow(n),firm=!gone&&!off&&bizNow(n);
const members=n.groupChat?chats.get(n.groupChat).members.map(id=>byId.get(id)).filter(eligible):[];
if(n.groupChat)bubbleMembers(n,members,term);
const drawable=n.groupChat?members.some(m=>groupOnly(m,chats)):!gone&&!groupOnly(n,chats);
const matches=!term||n.label.toLocaleLowerCase().includes(term)||(n.groupChat&&members.some(m=>m.label.toLocaleLowerCase().includes(term)));
const ok=drawable&&(n.groupChat||eligible(n))&&n.platforms.some(p=>on.has(p))&&matches;
el.classList.toggle('filtered',!ok);if(ok)shown++;if(drawable)total++;if(!n.groupChat&&off)hid++;if(!n.groupChat&&firm)firms++;}
for(const s of svg.querySelectorAll('[data-spoke]'))s.classList.toggle('filtered',svg.querySelector('[data-node="'+s.dataset.spoke+'"]').classList.contains('filtered'));
document.getElementById('business-count').textContent=String(firms);
document.getElementById('connection-count').textContent=shown+' of '+total+' shown'+(hid?' · '+hid+' hidden':'')+(firms&&!showBiz.checked?' · '+firms+' businesses left out':'');
if(selected&&(byId.get(selected).groupChat?els.get(selected).classList.contains('filtered'):!eligible(byId.get(selected))))selected=null;
hovered=null;paint();lists();}
for(const c of [...checks,showBiz])c.addEventListener('change',filter);search.addEventListener('input',filter);
document.getElementById('connection-business').addEventListener('click',()=>{const n=byId.get(selected);setBiz(n,!bizNow(n));});
document.getElementById('connection-hide').addEventListener('click',()=>{const t=tag(byId.get(selected).label);
if(!edits.hide.includes(t))edits.hide.push(t);edits.show=without(edits.show,t);save();filter();});
same.addEventListener('change',()=>{combine.disabled=!same.value;});
combine.addEventListener('click',()=>{const n=byId.get(selected),T=byId.get(same.value),a=tag(n.label),pick=tag(T.label);
const why=named(a).length>1||named(pick).length>1?'more than one person has that name':differ(n,T);
if(why){combineNote.textContent='Not combined: '+why+'.';combineNote.hidden=false;return;}
const t=(edits.combine.find(x=>x[0]===pick)||[pick,pick])[1];if(a===t)return;
edits.combine=[...edits.combine.filter(x=>x[0]!==a).map(x=>x[1]===a?[x[0],t]:x),[a,t]];save();location.reload();});
document.getElementById('connection-separate').addEventListener('click',()=>{const mine=new Set(byId.get(selected).combined.map(x=>x[0]));
edits.combine=edits.combine.filter(x=>!mine.has(x[0]));save();location.reload();});
// Lets the owner's agent copy these browser choices into the saved name rule.
window.heartbeatChartEdits=()=>({hide:edits.hide.map(t=>labelOf.get(t)).filter(Boolean),show:edits.show.map(t=>labelOf.get(t)).filter(Boolean),
business:edits.business.map(t=>labelOf.get(t)).filter(Boolean),person:edits.person.map(t=>labelOf.get(t)).filter(Boolean),
combine:edits.combine.filter(([a,t])=>labelOf.has(a)&&labelOf.has(t)).map(([a,t])=>({name:labelOf.get(a),as:labelOf.get(t)}))});
const base=svg.getAttribute('viewBox').split(' ').map(Number);let box=base.slice(),drag=null;
function view(){svg.setAttribute('viewBox',box.join(' '));}
function zoom(f,cx,cy){const size=Math.max(base[2]*0.2,Math.min(base[2]*1.6,box[2]*f));
if(cx===undefined){cx=box[0]+box[2]/2;cy=box[1]+box[3]/2;}
box=[cx-(cx-box[0])*size/box[2],cy-(cy-box[1])*size/box[3],size,size];view();}
for(const b of document.querySelectorAll('[data-zoom]'))b.addEventListener('click',()=>{const a=b.dataset.zoom;
if(a==='in')zoom(0.8);if(a==='out')zoom(1.25);if(a==='fit'){box=base.slice();view();}});
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();
zoom(e.deltaY<0?0.9:1.1,box[0]+(e.clientX-r.left)/r.width*box[2],box[1]+(e.clientY-r.top)/r.height*box[3]);},{passive:false});
svg.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0||e.target.closest('[data-node]'))return;
drag={id:e.pointerId,x:e.clientX,y:e.clientY};moved=false;svg.setPointerCapture(e.pointerId);});
svg.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const r=svg.getBoundingClientRect();
const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!moved&&Math.hypot(dx,dy)<4)return;moved=true;svg.classList.add('dragging');
box[0]-=dx/r.width*box[2];box[1]-=dy/r.height*box[3];drag.x=e.clientX;drag.y=e.clientY;view();});
const end=e=>{if(drag&&drag.id===e.pointerId){drag=null;svg.classList.remove('dragging');}};
for(const t of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(t,end);
svg.addEventListener('click',()=>{if(!moved&&selected){selected=null;paint();}moved=false;});
document.getElementById('connection-clear').addEventListener('click',()=>{selected=null;paint();});
filter();paint();})();`;

const CONNECTIONS_STYLE = `.graph-panel{margin-bottom:22px}.graph-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px}
.graph-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}.graph-tools input[type=search]{width:220px}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #e3ddd4;border-radius:20px;padding:5px 10px;font-size:12px;background:#fffdf9}.chip input{width:auto;min-height:0}
.zoom button{border:1px solid #ded8ce;background:#fffdf9;border-radius:8px;min-width:34px;min-height:34px}
#connections-svg{width:100%;height:auto;max-height:760px;aspect-ratio:1;background:radial-gradient(circle,#fff6ef 0,#faf7f2 70%);border-radius:14px;touch-action:none;cursor:grab;user-select:none}
#connections-svg.dragging{cursor:grabbing}.ring{fill:none;stroke:#e6ddd1;stroke-width:1.5;stroke-dasharray:3 6}.ring-label{font-size:12px;fill:#958b7e;letter-spacing:.5px}
.spoke{stroke:#e9a08f;stroke-width:1.4;opacity:.7}.spoke.text{stroke-dasharray:5 5}.self{fill:#df6958}.self-label{fill:#fff;font-weight:700;font-size:15px}
.node{cursor:pointer;transition:opacity .15s}.node .halo{fill:transparent;stroke:transparent;stroke-width:3}.node .disc{fill:#f0e6dc}.kind-direct .disc{fill:#f6d8cf}.kind-text .disc{fill:#dcebdc}
.node .rim{fill:none;stroke:#fffdf9;stroke-width:2.5}.initials{font-size:13px;font-weight:700;fill:#735746}.node-label{font-size:11px;fill:#4d5752}
.node:hover .halo,.node:focus-visible .halo{stroke:#cc624f}.node:focus{outline:none}.node.selected .halo{stroke:#df6958;fill:#fde7e1}.node.related .halo{stroke:#e9a08f;stroke-dasharray:3 3}
.node.dimmed,.spoke.dimmed{opacity:.22}.node.filtered,.spoke.filtered{display:none}
.bubble-hit{fill:transparent;pointer-events:all}.bubble-count{font-size:10px;fill:#6c7570}
.bubble-members{display:none}.bubble:hover>.bubble-members,.bubble.open>.bubble-members,.bubble:focus-within>.bubble-members{display:inline}
.member-preview{cursor:pointer}.member-preview:focus{outline:none}.member-preview:focus .halo{stroke:#cc624f}
.source-icon{flex:none;vertical-align:-4px}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#6c7570;margin-top:10px}
#connection-chats{padding-left:18px;font-size:13px}
[hidden]{display:none!important}.edit-tools{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.edit-tools select{max-width:170px}
#hidden-people summary,#business-people summary{cursor:pointer;font-weight:600}#hidden-list,#combined-list,#business-list{padding-left:18px;font-size:13px}#hidden-list li,#combined-list li,#business-list li{margin:4px 0}
@media(max-width:900px){.graph-layout{grid-template-columns:1fr}}`;

function connectionsPanel(model: ConnectionModel): string {
  if (!model.nodes.length) return '';
  const platforms = (['messenger', 'instagram', 'messages', 'gmail'] as Platform[]).filter(p => model.nodes.some(n => n.platforms.includes(p)));
  const badge = (p: Platform) => `<svg class="source-icon" width="18" height="18" viewBox="-10 -10 20 20" aria-hidden="true"><use href="#badge-${p}"/></svg>`;
  return `<section class="panel graph-panel" aria-labelledby="graph-heading"><h2 id="graph-heading">Your connections</h2>
<p class="muted">Rings show how recently a chat you share was active, measured from each source's snapshot day${model.asOf ? ` (${escape(model.asOf)})` : ' (unknown: no time zone or dates)'}: most recent at the center, older further out. Group-only contacts appear in group-chat nodes: hover or click a group to reveal its members, then select a member to inspect or edit them. Group activity is not a direct interaction. Drag to pan, scroll to zoom.</p>
<div class="graph-tools"><input id="connection-search" type="search" placeholder="Find in graph…" autocomplete="off" aria-label="Find in graph">
${platforms.map(p => `<label class="chip"><input type="checkbox" data-platform-filter value="${p}" checked>${badge(p)}${PLATFORMS[p]}</label>`).join('')}
<label class="chip" title="Businesses are left out unless this is on"><input type="checkbox" id="business-filter">Show businesses (<span id="business-count">0</span>)</label>
<span class="zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button> <button type="button" data-zoom="out" aria-label="Zoom out">−</button> <button type="button" data-zoom="fit">Fit</button></span>
<small id="connection-count">${model.nodes.length} of ${model.nodes.length} shown</small></div>
<div class="graph-layout"><div>${connectionSVG(model)}
<div class="legend">${platforms.map(p => `<span>${badge(p)} ${PLATFORMS[p]}</span>`).join('')}<span>Solid spoke: one-to-one · dashed: unlinked text conversation · GC: group chat, no direct-interaction spoke</span></div></div>
<aside><div id="connection-empty" class="notice">Select someone in the graph to inspect their chats.</div>
<div id="connection-detail" hidden><div class="label">Selected</div><h2 id="connection-name"></h2><p id="connection-ring" class="muted"></p>
<p id="connection-platforms"></p><ul id="connection-chats"></ul><ul id="connection-members" aria-label="Listed group members" hidden></ul><p id="connection-identity" class="notice"></p>
<p id="connection-category" class="muted" hidden></p>
<div class="edit-tools" id="connection-person-tools"><button type="button" id="connection-hide" class="chip">Hide from chart</button>
<button type="button" id="connection-business" class="chip">Mark as business</button>
<label class="chip">Same person as <select id="connection-same" aria-label="Same person as"></select></label>
<button type="button" id="connection-combine" class="chip" disabled>Combine</button>
<button type="button" id="connection-separate" class="chip" hidden>Separate again</button></div>
<p id="combine-note" class="muted" hidden></p>
<button type="button" id="connection-clear" class="chip">Clear selection</button></div>
<details id="hidden-people" class="notice"><summary>Hidden from chart (<span id="hidden-count">0</span>)</summary><ul id="hidden-list"></ul>
<p id="combined-heading" hidden>Combined in this browser</p><ul id="combined-list"></ul><p id="combine-blocked" class="muted" hidden></p>
<p id="edits-note" class="muted">Hide, show, combine and business choices are saved in this browser and apply to every rebuilt dashboard opened here. To keep them everywhere, save them to your name rule.</p></details>
<details id="business-people" class="notice"><summary>Businesses (<span id="business-list-count">0</span>)</summary><ul id="business-list"></ul>
<p class="muted">Add a "Business" label to a contact in Google Contacts to mark it everywhere. Guesses come only from automated-looking addresses with no saved contact name.</p></details>
${model.sameAsUnjoined ? `<div class="notice">${model.sameAsUnjoined} of your "same person" names could not be combined because the entries show different people (different profiles, photos, or both in one chat).</div>` : ''}
<div class="notice">Muse-reported, unverified and partial. Facebook photos attach only by exact profile ID or a pairing you confirmed; Google photos require unique exact connection email/phone evidence. All photos attach by those rules, never by automatic name or face matching. Entries from different chats or sources become one person only where you confirmed it.
${typeof model.gmailHidden === 'number' ? `Gmail shows only addresses you wrote to; ${model.gmailHidden} address(es) that only wrote to you are not shown.` : ''}
${model.selfIdentified ? '' : model.selfHidden
    ? `${model.selfHidden} of your own participant entries were hidden by your confirmation; your account was not identified by ID, so other entries for you may still appear.`
    : 'Your own account was not identified in this snapshot, so you may appear as a participant.'}</div></aside></div></section>`;
}

export { profileKey, participantKey, comparableName, memberRef, emailKey, gmailPeople, readProfilePhotos, readPhotoLinks, readSelfLinks, readPeopleLinks,
  connectionModel,
  connectionSVG, connectionsPanel, CONNECTIONS_SCRIPT, CONNECTIONS_STYLE };
export type { PhotoSet, ConnectionModel, PeopleLinks, PersonMember };
