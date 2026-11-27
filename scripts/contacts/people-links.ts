import fs from 'node:fs';
import path from 'node:path';
import { manualOutputLocation } from './manual-retrieval.ts';
import { readMuseRecency } from './contact-dashboard.ts';
import { comparableName, emailKey, gmailPeople, participantKey, readSelfLinks } from './connection-graph.ts';
import type { PersonMember } from './connection-graph.ts';
import { readGmailMetadata } from './gmail-metadata.ts';
import { projectGoogleCSV } from './contact-csv.ts';
import { array, object, text, requireValue, publish, publishText, runCLI, errorCode, hash } from './lib.ts';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Same-name chat participants and contact-bridged email addresses are only proposals; nothing joins until the owner approves.
function peopleLinkCandidates(options: { muse: string[]; gmail?: string; contacts?: string; selfLinks?: string; output: string },
  dataClass = 'private') {
  const folder = manualOutputLocation(path.resolve(options.output), dataClass);
  requireValue(fs.readdirSync(folder).length === 0, 'Choose a fresh empty review directory.', 'existing_output');
  requireValue(options.muse.length >= 1 && options.muse.length <= 2, 'Choose one or two Muse snapshots.');
  const muse = options.muse.map(file => readMuseRecency(path.resolve(file), dataClass));
  requireValue(new Set(muse.map(source => source.source)).size === muse.length, 'Duplicate Muse source snapshot.');
  const selfLinks = options.selfLinks === undefined ? null : readSelfLinks(options.selfLinks, dataClass);
  const gmail = options.gmail === undefined ? null : readGmailMetadata(path.resolve(options.gmail), dataClass);
  let contacts = null;
  if (options.contacts !== undefined) {
    const source = path.resolve(options.contacts);
    manualOutputLocation(path.dirname(source), dataClass);
    requireValue(fs.realpathSync(source) === source && fs.statSync(source).isFile(), 'Choose a non-redirected contacts CSV.');
    contacts = projectGoogleCSV(fs.readFileSync(source), dataClass as 'private');
  }
  const byName = new Map<string, { displayName: string; members: PersonMember[]; chats: Set<string>; bridge: string | null }>();
  // Two same-name entries in one chat are visibly different people, so that name is never proposed.
  const sameChat = new Set<string>();
  for (const source of muse) {
    const self = new Set((source.selfIds ?? []).map(id => participantKey(source.source, id)).filter(Boolean));
    source.records.forEach(record => record.participants.forEach((participant, participantIndex) => {
      const name = comparableName(participant.name), at = `${source.source}|${record.reportedChatId}|${participantIndex}`;
      if (name === null || participant.id !== null || record.reportedChatId === null || self.has(participantKey(source.source, participant.id)) ||
        name === selfLinks?.ownerName || selfLinks?.has(at)) return;
      const entry = byName.get(name) ?? { displayName: participant.name, members: [], chats: new Set(), bridge: null };
      const chat = `${source.source}|${record.reportedChatId}`;
      if (entry.chats.has(chat)) sameChat.add(name);
      entry.members.push({ source: source.source, reportedChatId: record.reportedChatId, participantIndex, participantName: participant.name });
      entry.chats.add(chat);
      byName.set(name, entry);
    }));
  }
  sameChat.forEach(name => byName.delete(name));
  let ambiguousNames = 0, bridged = 0;
  if (gmail && contacts) {
    const names = new Map<string, number>(), owners = new Map<string, Set<string>>();
    for (const contact of contacts.contacts) {
      const name = comparableName(contact.displayName);
      if (name !== null) names.set(name, (names.get(name) ?? 0) + 1);
      for (const address of contact.addresses.filter(a => a.type === 'email').flatMap(a => a.value.split(':::'))) {
        const key = emailKey(address.trim());
        if (key) owners.set(key, new Set([...owners.get(key) ?? [], contact.personId]));
      }
    }
    ambiguousNames = [...names.values()].filter(count => count > 1).length;
    const people = gmailPeople(gmail, selfLinks?.ownerAddresses);
    for (const address of people.correspondents) {
      const owner = owners.get(address);
      if (owner?.size !== 1) continue;
      const contact = contacts.contacts.find(c => c.personId === [...owner][0]), name = comparableName(contact.displayName);
      if (name === null || names.get(name) !== 1 || sameChat.has(name) || name === selfLinks?.ownerName) continue;
      const entry = byName.get(name) ?? { displayName: contact.displayName, members: [], chats: new Set(), bridge: null };
      entry.members.push({ source: 'gmail', address });
      entry.bridge = contact.displayName;
      byName.set(name, entry);
      bridged++;
    }
  }
  const numbered = [...byName.values()].filter(entry => entry.members.length >= 2).map((entry, index) => ({
    number: index + 1, displayName: entry.displayName, members: entry.members,
    evidence: { chats: entry.chats.size, emailAddresses: entry.members.filter(m => m.source === 'gmail').length,
      contactBridge: entry.bridge !== null } }));
  publish(path.join(folder, 'people-link-candidates.json'), { schemaVersion: 1, dataClass, kind: 'people-link-candidates',
    inputs: { muse: muse.map(source => source.inputDigest), gmailInputDigest: gmail?.inputDigest ?? null,
      contactsInputDigest: contacts?.inputDigest ?? null }, candidates: numbered, ambiguousContactNames: ambiguousNames });
  publishText(path.join(folder, 'review.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Confirm people</title><style>body{font:14px system-ui;margin:24px;background:#fffdf9}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
section{padding:12px;border:1px solid #ddd;border-radius:12px;background:#fff}b{font-size:20px}</style></head>
<body><h1>Confirm people</h1><p>Each card proposes that entries with exactly the same name, or an email address saved on exactly one of your contacts with that name, are one person. Approve only the numbers that really are one person. ${ambiguousNames} contact name(s) shared by several contacts are never used as a bridge.</p>
<main>${numbered.map(c => `<section><b>#${c.number}</b><h2>${escape(c.displayName)}</h2><p>${c.evidence.chats} chat(s)${
  c.evidence.emailAddresses ? ` · ${c.evidence.emailAddresses} email address(es) via your contact` : ''}</p></section>`).join('')}</main></body></html>\n`);
  return { candidates: numbered.length, entries: numbered.reduce((sum, c) => sum + c.members.length, 0), bridged };
}

function confirmPeopleLinks(candidatesFile: string, approve: string, output: string, dataClass = 'private', now = new Date().toISOString()) {
  const file = path.resolve(candidatesFile), target = path.resolve(output);
  manualOutputLocation(path.dirname(file), dataClass);
  manualOutputLocation(path.dirname(target), dataClass);
  requireValue(!fs.existsSync(target), 'Choose a new people links file.', 'existing_output');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  object(value, ['schemaVersion', 'dataClass', 'kind', 'inputs', 'candidates', 'ambiguousContactNames'], 'people link candidates');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && value.kind === 'people-link-candidates', 'Invalid people link candidates.');
  const candidates = array(value.candidates, 'candidates');
  const numbers = approve === 'none' ? [] : approve === 'all' ? candidates.map(c => c.number) : approve.split(',').map(n => Number(n.trim()));
  requireValue(new Set(numbers).size === numbers.length && numbers.every(n => candidates.some(c => c.number === n)),
    'Approve distinct candidate numbers from this review, all, or none.');
  const people = candidates.filter(c => numbers.includes(c.number)).map(c =>
    ({ displayName: text(c.displayName, 'display name'), members: array(c.members, 'members') }));
  publish(target, { schemaVersion: 1, dataClass, kind: 'owner-confirmed-people-links', confirmedAt: now, inputs: value.inputs, people });
  return { approved: numbers.length, entries: people.reduce((sum, p) => sum + p.members.length, 0), digest: hash(fs.readFileSync(target)) };
}

if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2), flags = new Map<string, string>(), muse: string[] = [];
    requireValue(args.length % 2 === 0, 'Expected flag/value pairs.');
    for (let i = 0; i < args.length; i += 2) {
      requireValue(['--muse', '--gmail', '--contacts', '--self-links', '--output', '--candidates', '--approve'].includes(args[i]) &&
        !flags.has(args[i]), 'Invalid people link arguments.');
      if (args[i] === '--muse') muse.push(args[i + 1]);
      else flags.set(args[i], args[i + 1]);
    }
    if (flags.has('--approve')) {
      requireValue(flags.has('--candidates') && flags.has('--output') && flags.size === 3 && !muse.length,
        'Usage: contacts:people-links --candidates <people-link-candidates.json> --approve <1,2,…|all|none> --output <new links.json>');
      const result = confirmPeopleLinks(flags.get('--candidates'), flags.get('--approve'), flags.get('--output'));
      process.stdout.write(`Saved ${result.approved} owner-confirmed person/people joining ${result.entries} entries.\n`);
    } else {
      requireValue(muse.length > 0 && flags.has('--output') && !flags.has('--candidates'),
        'Usage: contacts:people-links --muse <recency.json> [--muse <…>] [--gmail <gmail.json> --contacts <contacts.csv>] [--self-links <self.json>] --output <fresh review directory>');
      const result = peopleLinkCandidates({ muse, gmail: flags.get('--gmail'), contacts: flags.get('--contacts'),
        selfLinks: flags.get('--self-links'), output: flags.get('--output') });
      process.stdout.write(`Review page saved: ${result.candidates} candidate(s) covering ${result.entries} entries; ${result.bridged} email bridge(s).\n`);
    }
    return 0;
  }, error => {
    process.stderr.write(`People links not saved (${errorCode(error) ?? 'people_links_failed'}); inspect local inputs/output. No names printed.\n`);
    return 1;
  });
}

export { peopleLinkCandidates, confirmPeopleLinks };
