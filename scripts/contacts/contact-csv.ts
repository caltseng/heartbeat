import fs from 'node:fs';
import path from 'node:path';
import type { CanonicalPerson, Address } from './types.ts';
import { normalized } from './identity-review.ts';
import { manualOutputLocation } from './manual-retrieval.ts';
import { readObservations, readMuseRecency, renderDashboard } from './contact-dashboard.ts';
import { readProfilePhotos, readPhotoLinks, readSelfLinks, readPeopleLinks } from './connection-graph.ts';
import { readGmailMetadata } from './gmail-metadata.ts';
import { hash, instant, requireValue, publish, publishText, runCLI, errorCode } from './lib.ts';

interface PreviewContact {
  personId: string;
  sourceKey: string;
  id: string;
  idKind: 'local';
  displayName: string | null;
  addresses: Address[];
  // Set when the owner filed the contact under a "Business" label, or saved it with a company and no person's name.
  business?: 'label' | 'company';
}
interface ContactSnapshot {
  schemaVersion: 1;
  dataClass: 'private' | 'synthetic';
  source: 'google-contacts';
  connector: 'google-contacts-csv-snapshot-v1';
  inputDigest: string;
  namespace: string;
  importedAt: string;
  contacts: PreviewContact[];
  ignoredRows: number;
}
const allowedColumn = (name: string) => /^(Name|Given Name|Additional Name|Family Name|First Name|Middle Name|Last Name|E-mail \d+ - Value|Email \d+ - Value|Phone \d+ - Value|Labels|Group Membership|Organization Name|Organization 1 - Name)$/.test(name);
// Label and company text is read only to decide whether a contact is a business; neither is kept.
const BUSINESS_LABEL = /^(\*\s*)?business(es)?$/i;

function projectGoogleCSV(bytes: Buffer, dataClass: ContactSnapshot['dataClass'],
  importedAt = new Date().toISOString()): ContactSnapshot {
  requireValue(bytes.length <= 10 * 1024 * 1024, 'Contact CSV exceeds the bounded 10 MB import limit.');
  const inputDigest = hash(bytes), namespace = `csv-export:${inputDigest}`;
  const decoded = bytes.toString('utf8');
  requireValue(Buffer.from(decoded, 'utf8').equals(bytes), 'Contact CSV must be valid UTF-8.');
  const content = decoded.replace(/^\uFEFF/, '');
  let headers: string[] = [], selected = new Map<string, string>(), cell = '', column = 0, row = 1;
  let quoted = false, closedQuote = false, started = false, ignoreLF = false, rowStarted = false, ignoredRows = 0;
  const contacts: PreviewContact[] = [];
  const retain = () => row === 1 || allowedColumn(headers[column] ?? '');
  const pushCell = () => {
    if (row === 1) headers.push(cell.trim());
    else if (retain()) selected.set(headers[column], cell.trim());
    column++; cell = ''; closedQuote = false; started = false;
  };
  const pushRow = () => {
    pushCell();
    requireValue(row <= 5001, 'Contact CSV exceeds the bounded 5,000-row import limit.');
    if (row === 1) {
      requireValue(new Set(headers).size === headers.length && headers.some(allowedColumn),
        'CSV needs distinct supported Google Contacts headers.');
    } else if (rowStarted) {
      requireValue(column === headers.length, 'Contact CSV has an inconsistent row width.');
      const personName = selected.get('Name') || [
        selected.get('Given Name') || selected.get('First Name'),
        selected.get('Additional Name') || selected.get('Middle Name'),
        selected.get('Family Name') || selected.get('Last Name')
      ].filter(Boolean).join(' ') || null;
      const company = selected.get('Organization Name') || selected.get('Organization 1 - Name') || null;
      const labelled = (selected.get('Labels') || selected.get('Group Membership') || '').split(/\s+:::\s+/)
        .some(label => BUSINESS_LABEL.test(label.trim()));
      const business = labelled ? 'label' : !personName && company ? 'company' : null;
      const displayName = personName ?? (business ? company : null);
      const addresses: Address[] = [];
      for (const [header, value] of selected) {
        if (!value || !/^(E-mail|Email|Phone) \d+ - Value$/.test(header)) continue;
        for (const address of value.split(/\s+:::\s+/)) {
          if (address.trim()) addresses.push({ type: header.startsWith('Phone') ? 'phone' : 'email', value: address.trim() });
        }
      }
      if (displayName || addresses.length) {
        const id = `csv-row:${row}`, sourceKey = JSON.stringify(['google-contacts', namespace, 'identity', id]);
        contacts.push({ id, idKind: 'local', sourceKey, personId: `person-${hash(sourceKey)}`, displayName,
          addresses: [...new Map(addresses.map(a => [JSON.stringify(a), a])).values()], ...(business ? { business } : {}) });
      } else ignoredRows++;
    }
    row++; column = 0; selected = new Map(); rowStarted = false;
  };
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (ignoreLF) { ignoreLF = false; if (char === '\n') continue; }
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') { if (retain()) cell += '"'; index++; }
        else { quoted = false; closedQuote = true; }
      } else if (retain()) cell += char;
      continue;
    }
    if (char === ',') { pushCell(); rowStarted = true; continue; }
    if (char === '\r' || char === '\n') { pushRow(); ignoreLF = char === '\r'; continue; }
    requireValue(!closedQuote, 'Unexpected characters after a quoted CSV field.');
    if (char === '"') {
      requireValue(!started, 'Unexpected quote in contact CSV.');
      quoted = true;
    } else if (retain()) cell += char;
    started = true; rowStarted = true;
  }
  requireValue(!quoted, 'Unterminated quoted field in contact CSV.');
  if (rowStarted || column > 0 || closedQuote || cell.length) pushRow();
  requireValue(headers.length > 0, 'Contact CSV is empty.');
  return { schemaVersion: 1, dataClass, source: 'google-contacts', connector: 'google-contacts-csv-snapshot-v1',
    inputDigest, namespace, importedAt: instant(importedAt, 'importedAt'), contacts, ignoredRows };
}

function contactSuggestions(snapshot: ContactSnapshot): { evidence: string; people: string[] }[] {
  const matches = new Map<string, Set<string>>();
  for (const contact of snapshot.contacts) {
    for (const address of contact.addresses) {
      const value = normalized(address.type, address.value);
      if (!value) continue;
      const key = `${address.type}:${value}`;
      if (!matches.has(key)) matches.set(key, new Set());
      matches.get(key).add(contact.personId);
    }
  }
  return [...matches].filter(([, people]) => people.size > 1)
    .map(([evidence, people]) => ({ evidence, people: [...people].sort() }));
}

function importContactCSV(input: string, output: string, observationsFile?: string, museFiles: string[] = [], photosFile?: string,
  timeZone?: string, photoLinksFile?: string, selfLinksFile?: string, gmailFile?: string, peopleLinksFile?: string) {
  if (timeZone !== undefined) {
    let valid = false;
    try { valid = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone !== undefined; } catch { valid = false; }
    requireValue(valid, 'Choose a valid IANA time zone.');
  }
  const folder = manualOutputLocation(path.resolve(output), 'private');
  requireValue(fs.readdirSync(folder).length === 0, 'Choose a fresh empty preview output directory.', 'existing_output');
  const source = path.resolve(input);
  manualOutputLocation(path.dirname(source), 'private');
  requireValue(fs.realpathSync(source) === source && fs.statSync(source).isFile() &&
    fs.statSync(source).size <= 10 * 1024 * 1024, 'Choose a bounded, non-redirected CSV input.');
  const bytes = fs.readFileSync(source), snapshot = projectGoogleCSV(bytes, 'private');
  const observations = observationsFile === undefined ? null : readObservations(path.resolve(observationsFile), 'private');
  requireValue(museFiles.length <= 2, 'Choose at most one snapshot per Muse source.');
  const muse = museFiles.map(file => readMuseRecency(path.resolve(file), 'private'));
  requireValue(new Set(muse.map(snapshot => snapshot.source)).size === muse.length, 'Duplicate Muse source snapshot.');
  const people: Record<string, CanonicalPerson> = Object.fromEntries(snapshot.contacts.map(c => [c.personId, { mergedInto: null }]));
  const photos = photosFile === undefined ? null : readProfilePhotos(photosFile, 'private');
  requireValue(photoLinksFile === undefined || photos !== null, 'Photo links need the saved photos they were confirmed against.');
  const photoLinks = photoLinksFile === undefined ? null : readPhotoLinks(photoLinksFile, 'private', photos);
  const selfLinks = selfLinksFile === undefined ? null : readSelfLinks(selfLinksFile, 'private');
  requireValue(selfLinks === null || selfLinks.ownerName !== undefined || muse.some(source => source.inputDigest === selfLinks.museInputDigest),
    'Self links were confirmed against a different Muse snapshot.');
  const gmail = gmailFile === undefined ? null : readGmailMetadata(path.resolve(gmailFile), 'private');
  const peopleLinks = peopleLinksFile === undefined ? null : readPeopleLinks(peopleLinksFile, 'private');
  requireValue(timeZone === undefined || observations === null || observations.period.timeZone === timeZone,
    'The time zone must match the saved observations period.');
  const html = renderDashboard(snapshot, observations, contactSuggestions(snapshot), muse, photos, timeZone ?? null, photoLinks, selfLinks,
    gmail, peopleLinks);
  const linkedPhotos = photos ? photos.photos.filter(photo => html.includes(`href="photos/${photo.file}"`)) : [];
  const staging = path.join(folder, '.staging');
  fs.mkdirSync(staging);
  let published = false;
  try {
    fs.writeFileSync(path.join(staging, 'contacts.original.csv'), bytes, { flag: 'wx', mode: 0o600 });
    if (observations) fs.writeFileSync(path.join(staging, 'messages.original.json'), observations.originalBytes, { flag: 'wx', mode: 0o600 });
    for (const source of muse) fs.writeFileSync(path.join(staging, `muse-${source.source}.original.json`), source.originalBytes, { flag: 'wx', mode: 0o600 });
    if (photoLinks) fs.writeFileSync(path.join(staging, 'photo-links.original.json'), photoLinks.originalBytes, { flag: 'wx', mode: 0o600 });
    if (selfLinks) fs.writeFileSync(path.join(staging, 'self-links.original.json'), selfLinks.originalBytes, { flag: 'wx', mode: 0o600 });
    if (gmail) fs.writeFileSync(path.join(staging, 'gmail.original.json'), gmail.originalBytes, { flag: 'wx', mode: 0o600 });
    if (peopleLinks) fs.writeFileSync(path.join(staging, 'people-links.original.json'), peopleLinks.originalBytes, { flag: 'wx', mode: 0o600 });
    if (linkedPhotos.length) {
      fs.mkdirSync(path.join(staging, 'photos'));
      for (const photo of linkedPhotos) fs.writeFileSync(path.join(staging, 'photos', photo.file), photo.bytes, { flag: 'wx', mode: 0o600 });
    }
    publish(path.join(staging, 'contacts.json'), snapshot);
    publish(path.join(staging, 'people.json'), { schemaVersion: 1, dataClass: 'private', people });
    publishText(path.join(staging, 'dashboard.html'), html);
    publish(path.join(staging, 'contact-import.json'), { schemaVersion: 1, dataClass: 'private',
      source: snapshot.source, connector: snapshot.connector, inputDigest: snapshot.inputDigest, importedAt: snapshot.importedAt,
      contactsFile: 'contacts.json', peopleFile: 'people.json', dashboardFile: 'dashboard.html',
      observations: observations ? { file: 'messages.original.json', inputDigest: observations.inputDigest,
        period: observations.period, records: observations.messages.length, coverage: 'partial' } : null,
      museSources: muse.map(source => ({ source: source.source, file: `muse-${source.source}.original.json`,
        inputDigest: source.inputDigest, records: source.records.length, coverage: 'partial' })),
      profilePhotos: photos ? { inputDigest: photos.inputDigest, saved: photos.photos.length, linked: linkedPhotos.length,
        directory: linkedPhotos.length ? 'photos' : null,
        linkRule: photoLinks ? 'exact Facebook profile reference, or owner-confirmed name pairing for listed participant slots'
          : 'exact Facebook profile reference only',
        ownerConfirmedLinks: photoLinks ? { file: 'photo-links.original.json', inputDigest: photoLinks.inputDigest,
          confirmedAt: photoLinks.confirmedAt, links: photoLinks.size } : null } : null,
      ownerConfirmedSelf: selfLinks ? { file: 'self-links.original.json', inputDigest: selfLinks.inputDigest,
        museInputDigest: selfLinks.museInputDigest ?? null, confirmedAt: selfLinks.confirmedAt,
        slots: selfLinks.ownerName === undefined ? selfLinks.size : null,
        rule: selfLinks.ownerName === undefined ? 'listed participant slots are the owner and are omitted from the graph'
          : 'every participant with exactly the owner\'s normalized name is the owner and is omitted from the graph',
        sameNamePeople: selfLinks.sameNamePeople ? { separateNames: selfLinks.separateNames.length,
          rule: 'chat entries with exactly the same normalized name are one person unless listed as separate; namesakes in one chat stay separate' } : null,
        sameAs: selfLinks.sameAs?.length ? { names: selfLinks.sameAs.length,
          rule: 'each listed name is the named person, joined only where entries show no different profiles, photos or shared chat' } : null,
        hiddenNames: selfLinks.hiddenNames?.length ? { names: selfLinks.hiddenNames.length,
          rule: 'people with these names stay in the data but start hidden from the chart' } : null,
        categories: selfLinks.businessNames?.length || selfLinks.personNames?.length ? { businessNames: selfLinks.businessNames?.length ?? 0,
          personNames: selfLinks.personNames?.length ?? 0,
          rule: 'listed names or addresses are businesses or people; a Google Contacts business label still decides first' } : null } : null,
      businessContacts: { label: snapshot.contacts.filter(c => c.business === 'label').length,
        companyOnly: snapshot.contacts.filter(c => c.business === 'company').length,
        rule: 'a contact under a "Business" label, or saved with a company and no person\'s name, is a business; label and company text are not kept, except a company-only contact is named by its company' },
      gmail: gmail ? { file: 'gmail.original.json', inputDigest: gmail.inputDigest, records: gmail.observations.length,
        coverage: 'partial', rule: 'only addresses the owner wrote to are shown; received-only addresses are counted, not shown; an address saved under exactly one contact name takes that name, and one saved under the owner\'s name is the owner' } : null,
      ownerConfirmedPeople: peopleLinks ? { file: 'people-links.original.json', inputDigest: peopleLinks.inputDigest,
        confirmedAt: peopleLinks.confirmedAt, people: peopleLinks.people.length,
        rule: 'listed entries are joined into one person only as the owner confirmed' } : null,
      coverage: 'partial', ignoredRows: snapshot.ignoredRows,
      limitations: ['Provided export snapshot only; export scope/time are not independently verified.',
        'CSV lacks provider IDs; row IDs are bound to these exact bytes, not cross-export sync keys.',
        'Contacts do not establish activity; matching evidence remains unresolved.',
        'Muse sources are supplemental recency snapshots, not native enumeration or canonical interaction events.',
        'Existing private importer and graph guards unchanged.'] });
    fs.renameSync(staging, path.join(folder, 'preview'));
    published = true;
    return { file: path.join(folder, 'preview', 'dashboard.html'), contacts: snapshot.contacts.length, exitCode: 2 };
  } finally {
    if (!published && fs.existsSync(staging)) {
      const photoDir = path.join(staging, 'photos');
      if (fs.existsSync(photoDir)) {
        for (const photo of linkedPhotos) {
          const file = path.join(photoDir, photo.file);
          if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        fs.rmdirSync(photoDir);
      }
      for (const name of ['contacts.original.csv', 'messages.original.json', 'muse-messenger.original.json', 'muse-instagram.original.json',
              'photo-links.original.json', 'self-links.original.json', 'gmail.original.json', 'people-links.original.json',
              'contacts.json', 'people.json', 'dashboard.html', 'contact-import.json']) {
        const file = path.join(staging, name);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      fs.rmdirSync(staging);
    }
  }
}

if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2), flags = new Map<string, string>(), museFiles: string[] = [];
    requireValue(args.length % 2 === 0, 'Expected input/output argument pairs.');
    for (let i = 0; i < args.length; i += 2) {
      requireValue(['--input', '--output', '--observations', '--muse', '--photos', '--photo-links', '--self-links', '--gmail', '--people-links',
        '--time-zone'].includes(args[i]) && !flags.has(args[i]), 'Invalid preview arguments.');
      if (args[i] === '--muse') museFiles.push(args[i + 1]);
      else flags.set(args[i], args[i + 1]);
    }
    requireValue(flags.has('--input') && flags.has('--output'),
      'Usage: contacts:csv --input <owner-provided.csv> --output <fresh-local-directory> [--observations <saved-metadata.json>] [--muse <saved-recency.json>] [--photos <profile-photos.json> [--photo-links <owner-confirmed-links.json>]] [--self-links <owner-confirmed-self.json>] [--gmail <saved-gmail-metadata.json>] [--people-links <owner-confirmed-people.json>] [--time-zone <IANA zone>]');
    const result = importContactCSV(flags.get('--input'), flags.get('--output'), flags.get('--observations'), museFiles, flags.get('--photos'),
            flags.get('--time-zone'), flags.get('--photo-links'), flags.get('--self-links'), flags.get('--gmail'), flags.get('--people-links'));
    process.stdout.write('Private contact snapshot and offline dashboard saved locally; source coverage remains partial.\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Contact preview not saved (${errorCode(error) ?? 'contact_preview_failed'}); inspect local inputs/output. No contact details printed.\n`);
    return 1;
  });
}

export { projectGoogleCSV, contactSuggestions, importContactCSV };
export type { ContactSnapshot, PreviewContact };
