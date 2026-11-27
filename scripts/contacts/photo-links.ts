import fs from 'node:fs';
import path from 'node:path';
import { manualOutputLocation } from './manual-retrieval.ts';
import { readMuseRecency } from './contact-dashboard.ts';
import { readProfilePhotos, profileKey } from './connection-graph.ts';
import { array, object, text, requireValue, publish, publishText, runCLI, errorCode, hash } from './lib.ts';

// Name equality only proposes a pairing for the owner to review; links take effect only after explicit approval.
const comparable = (name: string | null) =>
  name === null ? null : name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') || null;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function photoLinkCandidates(museFile: string, photosFile: string, output: string, dataClass = 'private') {
  const folder = manualOutputLocation(path.resolve(output), dataClass);
  requireValue(fs.readdirSync(folder).length === 0, 'Choose a fresh empty review directory.', 'existing_output');
  const muse = readMuseRecency(path.resolve(museFile), dataClass), photos = readProfilePhotos(photosFile, dataClass);
  requireValue(muse.source === 'messenger', 'Photo links apply to Messenger participants only.');
  const manifest = JSON.parse(fs.readFileSync(path.resolve(photosFile), 'utf8'));
  const saved = new Map(photos.photos.map(photo => [photo.key, photo]));
  const friends = new Map<string, { key: string; profileReference: string; displayName: string }[]>();
  for (const row of manifest.profiles) {
    const key = profileKey(row.profileReference), name = comparable(typeof row.displayName === 'string' ? row.displayName : null);
    if (row.status !== 'saved' || !key || !saved.has(key) || name === null) continue;
    friends.set(name, [...friends.get(name) ?? [], { key, profileReference: row.profileReference, displayName: row.displayName }]);
  }
  const candidates = new Map<string, { profileReference: string; displayName: string; photoFile: string; slots: unknown[] }>();
  let ambiguous = 0;
  muse.records.forEach(record => record.participants.forEach((participant, participantIndex) => {
    const matches = participant.id === null ? friends.get(comparable(participant.name)) ?? [] : [];
    if (matches.length > 1) ambiguous++;
    if (matches.length !== 1 || record.reportedChatId === null) return;
    const [friend] = matches;
    const entry = candidates.get(friend.key) ?? { profileReference: friend.profileReference, displayName: friend.displayName,
      photoFile: saved.get(friend.key).file, slots: [] };
    entry.slots.push({ source: 'messenger', reportedChatId: record.reportedChatId, participantIndex, participantName: participant.name });
    candidates.set(friend.key, entry);
  }));
  const numbered = [...candidates.values()].map((candidate, index) => ({ number: index + 1, ...candidate }));
  publish(path.join(folder, 'photo-link-candidates.json'), { schemaVersion: 1, dataClass, kind: 'photo-link-candidates',
    photosInputDigest: photos.inputDigest, museInputDigest: muse.inputDigest, candidates: numbered, ambiguousParticipants: ambiguous });
  fs.mkdirSync(path.join(folder, 'photos'));
  for (const candidate of numbered) {
    fs.writeFileSync(path.join(folder, 'photos', candidate.photoFile), saved.get(profileKey(candidate.profileReference)).bytes, { flag: 'wx', mode: 0o600 });
  }
  publishText(path.join(folder, 'review.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'">
<title>Confirm photo matches</title><style>body{font:14px system-ui;margin:24px;background:#fffdf9}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
figure{margin:0;padding:12px;border:1px solid #ddd;border-radius:12px;background:#fff}img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:50%}b{font-size:20px}</style></head>
<body><h1>Confirm photo matches</h1><p>Each card pairs a saved friend photo with Messenger participants that have exactly the same name. Approve only the numbers that are really this person. ${ambiguous} participant(s) matched more than one friend and are not offered.</p>
<main>${numbered.map(c => `<figure><b>#${c.number}</b><img src="photos/${escape(c.photoFile)}" alt=""><figcaption>${escape(c.displayName)}<br>${c.slots.length} chat participant(s) with this name</figcaption></figure>`).join('')}</main></body></html>\n`);
  return { candidates: numbered.length, participants: numbered.reduce((sum, c) => sum + c.slots.length, 0), ambiguous };
}

function confirmPhotoLinks(candidatesFile: string, approve: string, output: string, dataClass = 'private', now = new Date().toISOString()) {
  const file = path.resolve(candidatesFile), target = path.resolve(output);
  manualOutputLocation(path.dirname(file), dataClass);
  manualOutputLocation(path.dirname(target), dataClass);
  requireValue(!fs.existsSync(target), 'Choose a new photo links file.', 'existing_output');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  object(value, ['schemaVersion', 'dataClass', 'kind', 'photosInputDigest', 'museInputDigest', 'candidates', 'ambiguousParticipants'], 'photo link candidates');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && value.kind === 'photo-link-candidates', 'Invalid photo link candidates.');
  const candidates = array(value.candidates, 'candidates');
  const numbers = approve === 'none' ? [] : approve.split(',').map(n => Number(n.trim()));
  requireValue(new Set(numbers).size === numbers.length && numbers.every(n => candidates.some(c => c.number === n)),
    'Approve distinct candidate numbers from this review, or none.');
  const links = candidates.filter(c => numbers.includes(c.number)).flatMap(c =>
    array(c.slots, 'slots').map(slot => ({ ...slot, profileReference: text(c.profileReference, 'profile reference') })));
  publish(target, { schemaVersion: 1, dataClass, kind: 'owner-confirmed-photo-links', photosInputDigest: value.photosInputDigest,
    confirmedAt: now, links });
  return { approved: numbers.length, links: links.length, digest: hash(fs.readFileSync(target)) };
}

if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2), flags = new Map<string, string>();
    requireValue(args.length % 2 === 0, 'Expected flag/value pairs.');
    for (let i = 0; i < args.length; i += 2) {
      requireValue(['--muse', '--photos', '--output', '--candidates', '--approve'].includes(args[i]) && !flags.has(args[i]), 'Invalid photo link arguments.');
      flags.set(args[i], args[i + 1]);
    }
    if (flags.has('--approve')) {
      requireValue(flags.has('--candidates') && flags.has('--output') && flags.size === 3,
        'Usage: contacts:photo-links --candidates <photo-link-candidates.json> --approve <1,2,…|none> --output <new links.json>');
      const result = confirmPhotoLinks(flags.get('--candidates'), flags.get('--approve'), flags.get('--output'));
      process.stdout.write(`Saved ${result.links} owner-confirmed photo link(s) from ${result.approved} approved candidate(s).\n`);
    } else {
      requireValue(flags.has('--muse') && flags.has('--photos') && flags.has('--output') && flags.size === 3,
        'Usage: contacts:photo-links --muse <messenger-recency.json> --photos <profile-photos.json> --output <fresh review directory>');
      const result = photoLinkCandidates(flags.get('--muse'), flags.get('--photos'), flags.get('--output'));
      process.stdout.write(`Review page saved: ${result.candidates} candidate(s) covering ${result.participants} participant(s); ${result.ambiguous} ambiguous excluded.\n`);
    }
    return 0;
  }, error => {
    process.stderr.write(`Photo links not saved (${errorCode(error) ?? 'photo_links_failed'}); inspect local inputs/output. No names printed.\n`);
    return 1;
  });
}

export { photoLinkCandidates, confirmPhotoLinks };
