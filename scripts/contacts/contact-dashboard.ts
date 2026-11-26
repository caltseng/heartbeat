import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ContactSnapshot } from './contact-csv.ts';
import type { ManualRun } from './manual-retrieval.ts';
import { validateManualRun, manualOutputLocation } from './manual-retrieval.ts';
import { array, object, text, instant, requireValue, hash } from './lib.ts';
import type { ResolvedPeriod } from './period.ts';
import type { PhotoSet } from './connection-graph.ts';
import { connectionModel, connectionsPanel, CONNECTIONS_SCRIPT, CONNECTIONS_STYLE } from './connection-graph.ts';

interface Observation {
  messageUiId: string;
  threadUiId: string;
  coreUiIdMatches: boolean;
  isOutgoing: boolean | null;
  isRcs: boolean | null;
  inferredLocalDate: string | null;
  dateBasis: string | null;
  temporalPrecision: 'day' | 'unknown';
  possibleInstantRange: { startInclusive: string; endExclusive: string } | null;
  yearIndependentlyVerified: boolean;
  requestedWindowMembership: 'inferred-inside' | 'inferred-outside' | 'inferred-overlaps-boundary' | 'unknown';
}
interface Observations {
  period: ResolvedPeriod;
  messages: Observation[];
  gaps: string[];
}
interface MuseRecency {
  source: 'messenger' | 'instagram';
  retrievedAt: string;
  selfIds?: string[];
  records: {
    chatType: 'group' | 'direct' | 'private' | 'one-to-one' | 'one_to_one' | 'unknown';
    reportedChatId: string | null;
    participants: { name: string | null; id: string | null }[];
    reportedLatestSentAt: string | null;
    nativeEvidenceVerified: false;
  }[];
  gaps: string[];
}
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function validateObservations(input: unknown, dataClass: string): Observations {
  object(input, ['schemaVersion', 'dataClass', 'kind', 'manualRun', 'observedUiMetadata'], 'observation envelope');
  requireValue(input.schemaVersion === 1 && input.dataClass === dataClass &&
    input.kind === 'bounded-ui-metadata-observations', 'Invalid observation envelope.');
  const run = input.manualRun as ManualRun;
  requireValue(run?.dataClass === dataClass, 'Observation data class must match its receipt.');
  const period = validateManualRun(run);
  requireValue(run.sources.length === 1 && run.sources[0].source === 'text-messages', 'Expected the approved text-message capture.');
  const meta = input.observedUiMetadata;
  object(meta, ['account', 'messages', 'dateEvidence', 'temporalPrecision', 'windowMembership', 'dateInferenceRule',
    'selectedForRequestedWindow', 'dateEvidenceByThread'], 'observed metadata');
  requireValue(meta.account === run.sources[0].account, 'Observation namespace must match the receipt.');
  for (const evidence of array(meta.dateEvidence, 'date evidence')) {
    object(evidence, ['index', 'kind', 'messageUiId', 'textAsDisplayed'], 'date evidence');
  }
  if (meta.dateEvidenceByThread !== undefined) {
    for (const evidence of array(meta.dateEvidenceByThread, 'conversation date evidence')) {
      object(evidence, ['threadUiId', 'labels'], 'conversation date evidence');
      for (const label of array(evidence.labels, 'date labels')) object(label, ['index', 'textAsDisplayed', 'messageUiId'], 'date label');
    }
  }
  const rows = array(meta.messages, 'message observations') as Observation[];
  requireValue(rows.length <= 200 && new Set(rows.map(r => r.threadUiId)).size <= 3, 'Observation capture exceeds its approved budget.');
  requireValue(run.sources[0].handoff !== null, 'Observed metadata needs its source receipt.');
  const declaredThreads = new Set(run.sources[0].handoff.pages.flatMap(page => page.threads.map(thread => thread.id)));
  const ids = new Set<string>();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: period.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const local = (time: string) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}:${parts.second}` };
  };
  for (const row of rows) {
    object(row, ['messageUiId', 'threadUiId', 'coreUiIdMatches', 'isOutgoing', 'isRcs', 'inferredLocalDate', 'dateBasis',
      'temporalPrecision', 'possibleInstantRange', 'yearIndependentlyVerified', 'requestedWindowMembership'], 'message observation');
    text(row.messageUiId, 'message UI ID'); text(row.threadUiId, 'conversation UI ID');
    requireValue(declaredThreads.has(row.threadUiId), 'Observed conversation is not declared in its source receipt.');
    const key = JSON.stringify([row.threadUiId, row.messageUiId]);
    requireValue(!ids.has(key), 'Duplicate observed message.'); ids.add(key);
    requireValue(typeof row.coreUiIdMatches === 'boolean' && typeof row.yearIndependentlyVerified === 'boolean' &&
      [row.isOutgoing, row.isRcs].every(flag => flag === null || typeof flag === 'boolean'), 'Invalid UI metadata flags.');
    if (row.temporalPrecision === 'unknown') {
      requireValue(row.inferredLocalDate === null && row.possibleInstantRange === null &&
        row.requestedWindowMembership === 'unknown', 'Unknown dates cannot imply known window membership.');
      continue;
    }
    requireValue(row.temporalPrecision === 'day' && /^\d{4}-\d\d-\d\d$/.test(row.inferredLocalDate), 'Invalid inferred calendar day.');
    text(row.dateBasis, 'date inference basis');
    object(row.possibleInstantRange, ['startInclusive', 'endExclusive'], 'possible day range');
    const start = instant(row.possibleInstantRange.startInclusive, 'day start');
    const end = instant(row.possibleInstantRange.endExclusive, 'day end');
    const first = local(start), last = local(end), beforeEnd = local(new Date(Date.parse(end) - 1).toISOString());
    requireValue(Date.parse(start) % 1000 === 0 && Date.parse(end) % 1000 === 0 &&
      start < end && first.date === row.inferredLocalDate && beforeEnd.date === row.inferredLocalDate &&
      first.clock === '00:00:00' && last.clock === '00:00:00' && last.date !== first.date &&
      new Date(`${row.inferredLocalDate}T00:00:00Z`).toISOString().slice(0, 10) === row.inferredLocalDate,
    'Inferred range must cover the stated local calendar day.');
    const membership = end <= period.start || start >= period.end ? 'inferred-outside' :
      start >= period.start && end <= period.end ? 'inferred-inside' : 'inferred-overlaps-boundary';
    requireValue(row.requestedWindowMembership === membership, 'Window membership does not agree with the inferred range.');
  }
  if (meta.selectedForRequestedWindow !== undefined) {
    const selected = array(meta.selectedForRequestedWindow, 'selected observations');
    const expected = rows.filter(row => ['inferred-inside', 'inferred-overlaps-boundary'].includes(row.requestedWindowMembership));
    requireValue(selected.length === expected.length && expected.every(row =>
      selected.filter(candidate => isDeepStrictEqual(candidate, row)).length === 1),
    'Selected observations must exactly match the validated window candidates.');
  }
  return { period, messages: rows, gaps: run.sources[0].gaps };
}

function readMetadata(file: string, dataClass: string) {
  if (dataClass === 'private') {
    manualOutputLocation(path.dirname(path.resolve(file)), 'private');
    requireValue(fs.realpathSync(file) === path.resolve(file), 'Choose a non-redirected private metadata input.');
  }
  requireValue(fs.statSync(file).isFile() && fs.statSync(file).size <= 10 * 1024 * 1024,
    'Choose a bounded saved observation input.');
  const originalBytes = fs.readFileSync(file);
  requireValue(originalBytes.length <= 10 * 1024 * 1024, 'Saved observations exceed the bounded input limit.');
  const decoded = originalBytes.toString('utf8');
  requireValue(Buffer.from(decoded, 'utf8').equals(originalBytes), 'Saved observations must be valid UTF-8.');
  return { value: JSON.parse(decoded), originalBytes, inputDigest: hash(originalBytes) };
}

function readObservations(file: string, dataClass: string): Observations & { originalBytes: Buffer; inputDigest: string } {
  const { value, ...input } = readMetadata(file, dataClass);
  return { ...validateObservations(value, dataClass), ...input };
}

function readMuseRecency(file: string, dataClass: string): MuseRecency & { originalBytes: Buffer; inputDigest: string } {
  const { value, ...input } = readMetadata(file, dataClass);
  object(value, ['schemaVersion', 'dataClass', 'kind', 'source', 'retrievedAt', 'requestedPeriod', 'records', 'coverage', 'gaps', 'request', 'selfIds'], 'Muse recency');
  requireValue(value.schemaVersion === 1 && value.dataClass === dataClass &&
    value.kind === 'muse-reported-chat-recency' && ['messenger', 'instagram'].includes(value.source) &&
    value.coverage === 'partial', 'Invalid bounded Muse recency snapshot.');
  text(value.requestedPeriod, 'requested period');
  if (value.request !== undefined) text(value.request, 'retrieval request');
  const retrievedAt = instant(value.retrievedAt, 'retrievedAt'), rows = array(value.records, 'chat recency records');
  requireValue(rows.length <= 100, 'Muse snapshot exceeds its approved source budget.');
  const ids = new Set<string>();
  for (const row of rows) {
    object(row, ['chatType', 'reportedChatId', 'participants', 'reportedLatestSentAt', 'nativeEvidenceVerified'], 'chat recency record');
    requireValue(['group', 'direct', 'private', 'one-to-one', 'one_to_one', 'unknown'].includes(row.chatType) &&
      row.nativeEvidenceVerified === false, 'Muse results must preserve their unverified native evidence.');
    if (row.reportedChatId !== null) {
      text(row.reportedChatId, 'reported chat ID');
      requireValue(!ids.has(row.reportedChatId), 'Duplicate reported chat ID.'); ids.add(row.reportedChatId);
    }
    if (row.reportedLatestSentAt !== null) instant(row.reportedLatestSentAt, 'reported latest sent timestamp');
    for (const participant of array(row.participants, 'reported participants')) {
      object(participant, ['name', 'id'], 'reported participant');
      if (participant.name !== null) text(participant.name, 'participant name');
      if (participant.id !== null) text(participant.id, 'participant ID');
      requireValue(participant.name !== null || participant.id !== null, 'Participant evidence is missing.');
    }
  }
  const gaps = array(value.gaps, 'Muse gaps');
  requireValue(gaps.length > 0, 'Partial Muse snapshots need explicit gaps.');
  gaps.forEach(gap => text(gap, 'Muse gap'));
  const selfIds = value.selfIds === undefined ? undefined : array(value.selfIds, 'self IDs');
  selfIds?.forEach(id => text(id, 'self ID'));
  return { source: value.source, retrievedAt, ...(selfIds ? { selfIds } : {}), records: rows, gaps, ...input };
}

const DASHBOARD_SCRIPT = `
const data=JSON.parse(document.getElementById('preview-data').textContent);
const search=document.getElementById('contact-search');
const contacts=[...document.querySelectorAll('[data-contact]')];
search.addEventListener('input',()=>{const term=search.value.trim().toLocaleLowerCase();let count=0;
for(const row of contacts){row.hidden=!row.textContent.toLocaleLowerCase().includes(term);if(!row.hidden)count++;}
document.getElementById('contact-count').textContent=count+' contacts shown';});
document.querySelectorAll('.contact-select').forEach(button=>button.addEventListener('click',()=>{
const contact=data.contacts[Number(button.dataset.index)];
document.getElementById('selected-contact').textContent=contact.displayName||'Unnamed contact';
document.getElementById('selected-addresses').textContent=contact.addresses.map(a=>a.type+': '+a.value).join(' · ')||'No phone/email in export';
document.getElementById('selected-person').textContent=contact.personId;
document.getElementById('contact-inspector').hidden=false;}));
const filter=document.getElementById('conversation-filter');
function update(){
const messages=data.observations?data.observations.messages.filter(m=>!filter.value||m.threadUiId===filter.value):[];
const inside=messages.filter(m=>m.requestedWindowMembership==='inferred-inside');
const boundary=messages.filter(m=>m.requestedWindowMembership==='inferred-overlaps-boundary');
document.getElementById('inside-count').textContent=inside.length;
document.getElementById('unknown-count').textContent=messages.filter(m=>m.requestedWindowMembership==='unknown').length;
document.getElementById('boundary-count').textContent=boundary.length;
document.getElementById('outgoing-count').textContent=inside.filter(m=>m.isOutgoing===true).length;
document.getElementById('incoming-count').textContent=inside.filter(m=>m.isOutgoing===false).length;
document.getElementById('direction-unknown').textContent=inside.filter(m=>m.isOutgoing===null).length;
const days=data.days.map(date=>({date,count:inside.filter(m=>m.inferredLocalDate===date).length}));
const maximum=Math.max(1,...days.map(day=>day.count));const plot=document.getElementById('timeline');plot.replaceChildren();
for(const day of days){const cell=document.createElement('div');cell.className='timeline-day';
const value=document.createElement('span');value.textContent=day.count;value.className='bar-value';
const bar=document.createElement('div');bar.className='bar';bar.style.height=(day.count/maximum*140)+'px';bar.setAttribute('aria-label',day.date+': '+day.count+' observed date-inferred messages; total unknown');
const label=document.createElement('span');label.textContent=day.date.slice(5);label.className='day-label';
cell.append(value,bar,label);plot.append(cell);}
document.getElementById('empty-chart').hidden=inside.length>0;
document.getElementById('observation-count').textContent=messages.length+' assessed observations in this selection; history coverage incomplete.';
}
filter.addEventListener('change',update);update();
`;

function renderDashboard(snapshot: ContactSnapshot, observations: Observations | null,
  suggestions: { evidence: string; people: string[] }[], muse: MuseRecency[] = [], photos: PhotoSet | null = null,
  timeZone: string | null = null): string {
  const graph = connectionModel(observations, muse, photos, timeZone);
  const graphHash = crypto.createHash('sha256').update(CONNECTIONS_SCRIPT).digest('base64');
  const threads = [...new Set(observations?.messages.map(m => m.threadUiId) ?? [])];
  const days: string[] = [];
  if (observations) {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: observations.period.timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit' });
    const dayAt = (value: string) => {
      const p = Object.fromEntries(formatter.formatToParts(new Date(value)).map(v => [v.type, v.value]));
      return `${p.year}-${p.month}-${p.day}`;
    };
    const end = dayAt(new Date(Date.parse(observations.period.end) - 1).toISOString());
    for (let day = dayAt(observations.period.start); day <= end;
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
      requireValue(days.length < 366, 'Preview period exceeds its bounded timeline.');
      days.push(day);
    }
  }
  const scriptHash = crypto.createHash('sha256').update(DASHBOARD_SCRIPT).digest('base64');
  const list = snapshot.contacts.map((c, index) => `<li data-contact>
<button class="contact-select" data-index="${index}"><span class="avatar">${escape((c.displayName ?? '?').slice(0, 1))}</span>
<span><strong>${escape(c.displayName ?? 'Unnamed contact')}</strong><small>${escape(c.addresses.map(a => a.value).join(' · ') || 'No phone/email in export')}</small></span><span class="chevron" aria-hidden="true">›</span></button></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}' 'sha256-${graphHash}'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Heartbeat — local contacts preview</title><style>
*{box-sizing:border-box}body{margin:0;background:#faf7f2;color:#263332;font:15px/1.5 system-ui,sans-serif}
header,main{max-width:1300px;margin:auto;padding:24px 32px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e3ddd4}
.wordmark{font-size:25px;font-weight:750;letter-spacing:-1px}.dot{color:#df6958}.badge{padding:7px 12px;border-radius:20px;background:#e9eee7;color:#3c614a;font-size:12px;font-weight:650}
h1{font-size:32px;letter-spacing:-1px;margin:0}h2{font-size:18px;margin:0 0 6px}h3{font-size:15px;margin:0}p{margin:6px 0 18px}.muted,small{color:#6c7570}.intro{margin-bottom:24px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px}
.card,.panel{background:#fffdf9;border:1px solid #e5dfd6;border-radius:16px}.card{padding:20px}.metric{font-size:34px;font-weight:750;letter-spacing:-1px}.label{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#737970}.workspace{display:grid;grid-template-columns:360px minmax(0,1fr);gap:22px}.panel{padding:22px;min-width:0}.panel+.panel{margin-top:20px}
input,select,button{font:inherit}input,select{width:100%;min-height:44px;border:1px solid #ded8ce;border-radius:9px;padding:10px;background:#fffdf9;color:#263332}
button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #cc624f;outline-offset:3px}.contact-list{padding:0;list-style:none;margin:16px -8px 0;max-height:590px;overflow:auto}
.contact-select{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;border-radius:10px;background:transparent;padding:12px 8px;color:inherit}.contact-select:hover{background:#f4f0e9}.contact-select span:nth-child(2){min-width:0;flex:1}.contact-select small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.avatar{display:grid;place-items:center;background:#f0e6dc;color:#735746;width:38px;height:38px;border-radius:50%;flex-shrink:0;font-weight:bold}.chevron{color:#a09b91}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px}.toolbar select{width:auto;max-width:250px}.timeline{display:flex;align-items:end;gap:8px;min-height:190px;padding:20px 0 6px;overflow:auto}.timeline-day{min-width:32px;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:end;gap:5px;align-self:stretch}.bar{width:100%;max-width:40px;min-height:2px;background:#df806a;border-radius:5px 5px 0 0}.bar-value,.day-label{font-size:10px;color:#777b73}.directions{display:flex;gap:28px;padding-top:15px;border-top:1px solid #ede7dd;margin-top:12px}.directions strong{font-size:22px;display:block}.notice{padding:14px 16px;background:#f4eee3;border-radius:10px;font-size:12px;color:#6a5a40}.source-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid #eee8de}.source-state{font-size:12px;border-radius:20px;background:#f1eee7;padding:5px 9px}.footer{font-size:12px;margin:24px 0;color:#6c7570}
details{margin:14px 0;font-size:12px}summary{cursor:pointer;font-weight:600}.source-id{font-size:11px;overflow-wrap:anywhere}small{display:block}[hidden]{display:none!important}
${CONNECTIONS_STYLE}
@media(max-width:900px){.workspace{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,1fr)}header,main{padding:18px}.contact-list{max-height:330px}.toolbar{flex-wrap:wrap}}
</style></head><body><header><div class="wordmark"><span class="dot">●</span> Heartbeat</div><span class="badge">Private · offline · read-only</span></header>
<main><section class="intro"><div class="label">Your local relationship workspace</div><h1>A first look at your connections</h1>
<p class="muted">Contacts alongside observed message activity. Frequency is not relationship quality.</p></section>
<section class="cards" aria-label="Capture overview">
<div class="card"><div class="label">Imported contacts</div><div class="metric">${snapshot.contacts.length}</div><small>Provided Google CSV snapshot</small></div>
<div class="card"><div class="label">Date-inferred messages</div><div id="inside-count" class="metric">—</div><small>Whole inferred day inside the window</small></div>
<div class="card"><div class="label">Unresolved dates</div><div id="unknown-count" class="metric">—</div><small>Unknown window membership</small></div>
<div class="card"><div class="label">Boundary candidates</div><div id="boundary-count" class="metric">—</div><small>Day overlaps the window; not confirmed inside</small></div></section>
${connectionsPanel(graph)}
<div class="workspace"><aside><section class="panel"><h2>Contacts</h2><p class="muted" id="contact-count">${snapshot.contacts.length} contacts shown</p>
<label for="contact-search" class="label">Find a contact</label><input id="contact-search" type="search" placeholder="Name, email or phone…" autocomplete="off">
<ul class="contact-list">${list}</ul></section></aside><div>
<section class="panel"><div class="toolbar"><div><h2>Observed message activity</h2><small>${observations ? `${escape(observations.period.start.slice(0, 10))} to ${escape(observations.period.end.slice(0, 10))} · ${escape(observations.period.timeZone)}` : 'No saved message observations provided'}</small></div>
<label><span class="label">Conversation</span><select id="conversation-filter"><option value="">All captured conversations</option>${threads.map((id, index) => `<option value="${escape(id)}">Conversation ${index + 1} · unlinked</option>`).join('')}</select></label></div>
<div id="timeline" class="timeline" aria-label="Daily date-inferred observed message counts"></div>
<p id="empty-chart" class="notice">No whole-day in-window observations in this selection. This is not proof of zero activity.</p>
<div class="directions"><div><strong id="outgoing-count">—</strong><small>Outgoing UI flags</small></div><div><strong id="incoming-count">—</strong><small>Incoming UI flags</small></div><div><strong id="direction-unknown">—</strong><small>Direction unknown</small></div></div>
<p id="observation-count" class="muted"></p><div class="notice">Dates are inferred calendar days, not exact native timestamps. Outgoing flags do not prove successful sending or direct contact. Zero bars mean none observed, not a known total.</div></section>
<section id="contact-inspector" class="panel" hidden><div class="label">Selected contact</div><h2 id="selected-contact"></h2><p id="selected-addresses"></p>
<div class="notice">No verified participant-number link was captured for these conversations. Selecting a contact does not attribute any messages to them.</div><details><summary>Local person reference</summary><p id="selected-person" class="source-id"></p></details></section>
<section class="panel"><h2>Sources &amp; confidence</h2>
<div class="source-row"><div>Google Contacts<small>Exact-export-local identities; no incremental sync</small></div><span class="source-state">CSV snapshot</span></div>
<div class="source-row"><div>Google Messages<small>${threads.length} captured conversations; incomplete history</small></div><span class="source-state">${observations ? 'Partial metadata' : 'Not provided'}</span></div>
${(['messenger', 'instagram'] as const).map(source => {
  const found = muse.find(snapshot => snapshot.source === source);
  return `<div class="source-row"><div>${source === 'messenger' ? 'Facebook Messenger' : 'Instagram DMs'}<small>Via the existing Muse canvas; incomplete coverage</small></div><span class="source-state">${found?.records.length ? `${found.records.length} chat recency results` : found ? 'No records returned; coverage unknown' : 'Not included in this preview'}</span></div>`;
}).join('')}
<details><summary>${suggestions.length} shared-address match candidates — not merged</summary>${suggestions.map(s => `<p>${escape(s.evidence)}<small>${s.people.length} separate contact identities share this evidence. Review before linking.</small></p>`).join('') || '<p>No shared normalized address found in this export. This does not establish complete identity coverage.</p>'}</details>
<details><summary>Capture limitations</summary><ul><li>Contacts do not establish past membership or activity; export scope/time are not independently verified.</li>
<li>Another CSV export needs reviewed identity reconciliation. Existing notes and relationships are not modified.</li>
${[...(observations?.gaps ?? []), ...muse.flatMap(source => source.gaps)].map(g => `<li>${escape(g)}</li>`).join('')}</ul></details></section>
${muse.some(source => source.records.length) ? `<section class="panel"><h2>Muse-reported chat recency</h2>
<p class="muted">Latest sent-message times, not message totals. Participants remain unlinked to imported contacts.</p>
${muse.flatMap(source => source.records.map((row, index) => `<div class="source-row"><div><strong>${source.source === 'messenger' ? 'Messenger' : 'Instagram'} · ${row.chatType === 'group' ? 'Group chat' : row.chatType === 'unknown' ? 'Unknown chat type' : 'One-to-one chat'} ${index + 1}</strong>
<small>${escape(row.participants.map(p => p.name ?? p.id).join(' · '))}</small>
<small>Latest sent as returned: ${escape(row.reportedLatestSentAt ?? 'Unknown')}</small></div></div>`)).join('')}
<div class="notice">Muse-reported metadata; native IDs, timestamps and enumeration are not independently verified. Group membership does not establish individual interaction or historical recipients.</div></section>` : ''}
</div></div>
<p class="footer">Saved locally. No network calls, source writes, scheduling or private pipeline bypass. Imported ${escape(snapshot.importedAt)}.</p></main>
<script id="preview-data" type="application/json">${json({ contacts: snapshot.contacts,
  observations: observations ? { period: observations.period, messages: observations.messages, gaps: observations.gaps } : null,
  days })}</script><script>${DASHBOARD_SCRIPT}</script>
${graph.nodes.length ? `<script id="connections-data" type="application/json">${json({ nodes: graph.nodes, chats: graph.chats })}</script><script>${CONNECTIONS_SCRIPT}</script>` : ''}</body></html>`;
}

export { validateObservations, readObservations, readMuseRecency, renderDashboard, DASHBOARD_SCRIPT };
export type { Observations, Observation, MuseRecency };
