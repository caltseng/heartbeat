import fs from 'node:fs';
import path from 'node:path';
import { manualOutputLocation } from './manual-retrieval.ts';
import { readMuseRecency } from './contact-dashboard.ts';
import { comparableName, emailKey, readSelfLinks } from './connection-graph.ts';
import { array, object, text, requireValue, publish, publishText, runCLI, errorCode, hash } from './lib.ts';

// The owner's name only proposes slots for review, unless the owner saves a standing exact-name rule with --owner-name.
const comparable = comparableName;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function selfLinkCandidates(museFile: string, ownerName: string, output: string, dataClass = 'private') {
  const folder = manualOutputLocation(path.resolve(output), dataClass);
  requireValue(fs.readdirSync(folder).length === 0, 'Choose a fresh empty review directory.', 'existing_output');
  const target = comparable(ownerName);
  requireValue(target !== null, 'Supply your own display name.');
  const muse = readMuseRecency(path.resolve(museFile), dataClass);
  const candidates: Record<string, unknown>[] = [];
  let withoutChatId = 0;
  muse.records.forEach((record, chatIndex) => record.participants.forEach((participant, participantIndex) => {
    if (participant.id !== null || comparable(participant.name) !== target) return;
    if (record.reportedChatId === null) { withoutChatId++; return; }
    const kind = record.chatType === 'group' ? 'group chat' : record.chatType === 'unknown' ? 'chat' : 'one-to-one chat';
    candidates.push({ number: candidates.length + 1, source: muse.source, reportedChatId: record.reportedChatId,
      chatLabel: `${muse.source === 'messenger' ? 'Messenger' : 'Instagram'} ${kind} ${chatIndex + 1}`, participantIndex,
      participantName: participant.name, otherParticipants: record.participants.filter((_, i) => i !== participantIndex)
        .map(other => other.name ?? 'Participant (ID only)').slice(0, 8), otherCount: record.participants.length - 1 });
  }));
  publish(path.join(folder, 'self-link-candidates.json'), { schemaVersion: 1, dataClass, kind: 'self-link-candidates',
    museInputDigest: muse.inputDigest, candidates, excludedWithoutChatId: withoutChatId });
  publishText(path.join(folder, 'review.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Confirm which participants are you</title><style>body{font:14px system-ui;margin:24px;background:#fffdf9}table{border-collapse:collapse}td,th{padding:8px 12px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}b{font-size:18px}</style></head>
<body><h1>Confirm which participants are you</h1><p>Each row is one chat participant with exactly your name. Approve the numbers that are you; they will be hidden from the graph. Anyone you leave out stays as a separate person. ${withoutChatId} participant(s) in chats without a reported chat ID are not offered.</p>
<table><tr><th>#</th><th>Chat</th><th>Others in this chat</th></tr>${candidates.map(c => `<tr><td><b>${c.number}</b></td><td>${escape(c.chatLabel)}</td><td>${
  escape((c.otherParticipants as string[]).join(', '))}${(c.otherCount as number) > 8 ? ` and ${(c.otherCount as number) - 8} more` : ''}</td></tr>`).join('')}</table></body></html>\n`);
  return { candidates: candidates.length, withoutChatId };
}

function confirmSelfLinks(candidatesFile: string, approve: string, output: string, dataClass = 'private', now = new Date().toISOString()) {
  const file = path.resolve(candidatesFile), target = path.resolve(output);
  manualOutputLocation(path.dirname(file), dataClass);
  manualOutputLocation(path.dirname(target), dataClass);
  requireValue(!fs.existsSync(target), 'Choose a new self links file.', 'existing_output');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  object(value, ['schemaVersion', 'dataClass', 'kind', 'museInputDigest', 'candidates', 'excludedWithoutChatId'], 'self link candidates');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass && value.kind === 'self-link-candidates', 'Invalid self link candidates.');
  const candidates = array(value.candidates, 'candidates');
  const numbers = approve === 'none' ? [] : approve === 'all' ? candidates.map(c => c.number) : approve.split(',').map(n => Number(n.trim()));
  requireValue(new Set(numbers).size === numbers.length && numbers.every(n => candidates.some(c => c.number === n)),
    'Approve distinct candidate numbers from this review, all, or none.');
  const slots = candidates.filter(c => numbers.includes(c.number)).map(c => ({ source: c.source,
    reportedChatId: text(c.reportedChatId, 'reported chat ID'), participantIndex: c.participantIndex, participantName: c.participantName }));
  publish(target, { schemaVersion: 1, dataClass, kind: 'owner-confirmed-self-slots', museInputDigest: value.museInputDigest, confirmedAt: now, slots });
  return { approved: numbers.length, digest: hash(fs.readFileSync(target)) };
}

// Optional owner email addresses are hidden from Gmail people, in addition to the account and addresses you sent from.
// The optional same-name rule records the owner's standing decision that chat entries with the same name are one person,
// except the names listed as separate people.
function saveOwnerNameRule(ownerName: string, output: string, dataClass = 'private', now = new Date().toISOString(),
  ownerAddresses: string[] = [], sameName: { separateNames: string[] } | null = null) {
  const target = path.resolve(output);
  manualOutputLocation(path.dirname(target), dataClass);
  requireValue(!fs.existsSync(target), 'Choose a new self links file.', 'existing_output');
  requireValue(comparable(ownerName) !== null, 'Supply your own display name.');
  const addresses = ownerAddresses.map(address => emailKey(address.trim()));
  requireValue(addresses.every(address => address !== null) && new Set(addresses).size === addresses.length,
    'Supply distinct plain email addresses of your own.');
  const separate = (sameName?.separateNames ?? []).map(name => name.trim());
  requireValue(separate.every(name => comparable(name) !== null) && new Set(separate.map(comparable)).size === separate.length,
    'Supply distinct names to keep separate.');
  publish(target, { schemaVersion: 1, dataClass, kind: 'owner-name-rule', ownerName: ownerName.trim(), confirmedAt: now,
    ...(addresses.length ? { ownerAddresses: addresses } : {}),
    ...(sameName ? { sameNamePeople: true, separateNames: separate } : {}) });
  return { digest: hash(fs.readFileSync(target)) };
}

// Owner edits to people in the chart: hide names, show them again, or say one name is another person ("same as").
// Each update writes a new rule file from an existing owner name rule, keeping every earlier decision.
function updateNameRule(from: string, output: string, changes: { hide?: string[]; show?: string[]; sameAs?: string[]; notSame?: string[];
  business?: string[]; person?: string[] }, dataClass = 'private', now = new Date().toISOString()) {
  const source = path.resolve(from), target = path.resolve(output);
  const rule = readSelfLinks(source, dataClass);
  requireValue(rule.ownerName !== undefined, 'Update an owner name rule saved with --owner-name.');
  manualOutputLocation(path.dirname(target), dataClass);
  requireValue(!fs.existsSync(target), 'Choose a new self links file.', 'existing_output');
  const value = JSON.parse(fs.readFileSync(source, 'utf8'));
  const clean = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const names = (list: string[] | undefined) => (list ?? []).map(clean).filter(Boolean);
  let hidden: string[] = value.hiddenNames ?? [];
  const hide = names(changes.hide), show = new Set(names(changes.show).map(comparable));
  requireValue(hide.every(name => !show.has(comparable(name))), 'A name cannot be both hidden and shown.');
  hidden = [...hidden.filter(name => !show.has(comparable(name))), ...hide.filter(name =>
    !hidden.some(old => comparable(old) === comparable(name)))];
  const notSame = new Set(names(changes.notSame).map(comparable));
  let sameAs: { name: string; as: string }[] = (value.sameAs ?? []).filter((row: { name: string }) => !notSame.has(comparable(row.name)));
  for (const pair of names(changes.sameAs)) {
    const at = pair.indexOf('=');
    requireValue(at > 0 && at < pair.length - 1, 'Write each same-as pair as "Other name=Person name".');
    const row = { name: clean(pair.slice(0, at)), as: clean(pair.slice(at + 1)) };
    sameAs = [...sameAs.filter(old => comparable(old.name) !== comparable(row.name)), row];
  }
  // Business and person are exclusive: marking a name as one removes it from the other.
  const toBusiness = names(changes.business), toPerson = names(changes.person);
  const marked = new Set([...toBusiness, ...toPerson].map(comparable));
  requireValue(marked.size === new Set(toBusiness.map(comparable)).size + new Set(toPerson.map(comparable)).size,
    'A name cannot be both a business and a person.');
  const keep = (old: string[] | undefined, added: string[]) => [...(old ?? []).filter(name => !marked.has(comparable(name))),
    ...added.filter((name, i) => added.findIndex(other => comparable(other) === comparable(name)) === i)];
  const businessNames = keep(value.businessNames, toBusiness), personNames = keep(value.personNames, toPerson);
  const next = { ...value, confirmedAt: now };
  delete next.hiddenNames; delete next.sameAs; delete next.businessNames; delete next.personNames;
  if (hidden.length) next.hiddenNames = hidden;
  if (sameAs.length) next.sameAs = sameAs;
  if (businessNames.length) next.businessNames = businessNames;
  if (personNames.length) next.personNames = personNames;
  const counts = { hidden: hidden.length, sameAs: sameAs.length, business: businessNames.length, person: personNames.length };
  publish(target, next);
  try { readSelfLinks(target, dataClass); } catch (error) { fs.rmSync(target); throw error; }
  return { ...counts, digest: hash(fs.readFileSync(target)) };
}

if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2), flags = new Map<string, string>();
    requireValue(args.length % 2 === 0, 'Expected flag/value pairs.');
    for (let i = 0; i < args.length; i += 2) {
      requireValue(['--muse', '--name', '--output', '--candidates', '--approve', '--owner-name', '--owner-emails', '--same-name-people',
        '--separate-names', '--update', '--hide', '--show', '--same-as', '--not-same', '--business', '--person'].includes(args[i]) && !flags.has(args[i]),
      'Invalid self link arguments.');
      flags.set(args[i], args[i + 1]);
    }
    const edits = ['--hide', '--show', '--same-as', '--not-same', '--business', '--person'];
    requireValue(flags.has('--update') || edits.every(flag => !flags.has(flag)), 'Use --hide, --show, --same-as, --not-same, --business or --person with --update.');
    if (flags.has('--update')) {
      const used = edits.filter(flag => flags.has(flag));
      requireValue(flags.has('--output') && used.length > 0 && flags.size === 2 + used.length,
        'Usage: contacts:self-links --update <owner name rule.json> [--hide <Name A;Name B>] [--show <Name>] [--same-as <Other name=Person name;…>] [--not-same <Other name>] [--business <Name;address>] [--person <Name>] --output <new self.json>');
      const list = (flag: string) => flags.get(flag)?.split(';');
      const result = updateNameRule(flags.get('--update'), flags.get('--output'),
        { hide: list('--hide'), show: list('--show'), sameAs: list('--same-as'), notSame: list('--not-same'), business: list('--business'),
          person: list('--person') });
      process.stdout.write(`Saved name rule: ${result.hidden} name(s) hidden from the chart, ${result.sameAs} same-person name(s), ${result.business} business name(s), ${result.person} marked not a business.\n`);
    } else if (flags.has('--owner-name')) {
      const sameName = flags.get('--same-name-people');
      requireValue(flags.has('--output') && (sameName === undefined || sameName === 'on') &&
        (!flags.has('--separate-names') || sameName === 'on') &&
        flags.size === 2 + ['--owner-emails', '--same-name-people', '--separate-names'].filter(flag => flags.has(flag)).length,
        'Usage: contacts:self-links --owner-name <your exact display name> [--owner-emails <a@x,b@y>] [--same-name-people on [--separate-names <Name A;Name B>]] --output <new self.json>');
      saveOwnerNameRule(flags.get('--owner-name'), flags.get('--output'), 'private', undefined,
        flags.has('--owner-emails') ? flags.get('--owner-emails').split(',') : [],
        sameName === 'on' ? { separateNames: flags.has('--separate-names') ? flags.get('--separate-names').split(';') : [] } : null);
      process.stdout.write(`Saved owner name rule: everyone with exactly your name is treated as you${
        sameName === 'on' ? '; chat entries with the same name are one person unless listed as separate' : ''}.\n`);
    } else if (flags.has('--approve')) {
      requireValue(flags.has('--candidates') && flags.has('--output') && flags.size === 3,
        'Usage: contacts:self-links --candidates <self-link-candidates.json> --approve <1,2,…|all|none> --output <new self.json>');
      const result = confirmSelfLinks(flags.get('--candidates'), flags.get('--approve'), flags.get('--output'));
      process.stdout.write(`Saved ${result.approved} owner-confirmed self slot(s).\n`);
    } else {
      requireValue(flags.has('--muse') && flags.has('--name') && flags.has('--output') && flags.size === 3,
        'Usage: contacts:self-links --muse <messenger-recency.json> --name <your display name> --output <fresh review directory>');
      const result = selfLinkCandidates(flags.get('--muse'), flags.get('--name'), flags.get('--output'));
      process.stdout.write(`Review page saved: ${result.candidates} candidate slot(s); ${result.withoutChatId} without chat ID excluded.\n`);
    }
    return 0;
  }, error => {
    process.stderr.write(`Self links not saved (${errorCode(error) ?? 'self_links_failed'}); inspect local inputs/output. No names printed.\n`);
    return 1;
  });
}

export { selfLinkCandidates, confirmSelfLinks, saveOwnerNameRule, updateNameRule };
