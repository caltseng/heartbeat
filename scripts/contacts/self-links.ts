import fs from 'node:fs';
import path from 'node:path';
import { manualOutputLocation } from './manual-retrieval.ts';
import { readMuseRecency } from './contact-dashboard.ts';
import { comparableName } from './connection-graph.ts';
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

function saveOwnerNameRule(ownerName: string, output: string, dataClass = 'private', now = new Date().toISOString()) {
  const target = path.resolve(output);
  manualOutputLocation(path.dirname(target), dataClass);
  requireValue(!fs.existsSync(target), 'Choose a new self links file.', 'existing_output');
  requireValue(comparable(ownerName) !== null, 'Supply your own display name.');
  publish(target, { schemaVersion: 1, dataClass, kind: 'owner-name-rule', ownerName: ownerName.trim(), confirmedAt: now });
  return { digest: hash(fs.readFileSync(target)) };
}

if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2), flags = new Map<string, string>();
    requireValue(args.length % 2 === 0, 'Expected flag/value pairs.');
    for (let i = 0; i < args.length; i += 2) {
      requireValue(['--muse', '--name', '--output', '--candidates', '--approve', '--owner-name'].includes(args[i]) && !flags.has(args[i]),
        'Invalid self link arguments.');
      flags.set(args[i], args[i + 1]);
    }
    if (flags.has('--owner-name')) {
      requireValue(flags.has('--output') && flags.size === 2,
        'Usage: contacts:self-links --owner-name <your exact display name> --output <new self.json>');
      saveOwnerNameRule(flags.get('--owner-name'), flags.get('--output'));
      process.stdout.write('Saved owner name rule: everyone with exactly your name is treated as you.\n');
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

export { selfLinkCandidates, confirmSelfLinks, saveOwnerNameRule };
