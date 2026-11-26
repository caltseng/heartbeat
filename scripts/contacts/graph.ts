import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { publishText, runCLI, readJSON, requireValue, object, outputLocation } from './lib.ts';
import { selectView } from './summary.ts';
import { GRAPH_SCRIPT } from './graph-interaction.ts';

const BANDS = [
  { id: 'frequent', radius: 105, label: 'Direct: at least 50% of local dates' },
  { id: 'regular', radius: 180, label: 'Direct: 20% to under 50%' },
  { id: 'occasional', radius: 255, label: 'Direct: over 0% to under 20%' },
  { id: 'group', radius: 330, label: 'Observed group-only activity' },
  { id: 'unknown', radius: 405, label: 'Unknown: no attributed activity' },
  { id: 'inactive', radius: 480, label: 'Inactive: covered, no attributed activity' }
];
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => escape(JSON.stringify(value, null, 2));
const count = metric => `${metric.observed} observed; ${metric.certainty}; total ${metric.total ?? 'unknown'}`;
const latest = value => value === null ? 'unknown' : `${value} (UTC)`;
function table(headers, rows, caption) {
  return `<div class="scroll" tabindex="0" role="region" aria-label="${escape(caption)}"><table>
<caption>${escape(caption)}</caption><thead><tr>${headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function graphModel(report) {
  requireValue(report?.dataClass === 'synthetic', 'Private graphs are disabled.', 'private_collection_disabled');
  for (const name of ['summary', 'peopleTable', 'perChannel', 'timeline']) selectView(report, name);
  const { context, views, evidence } = report;
  requireValue(Array.isArray(views.peopleTable) && Array.isArray(views.timeline) && views.timeline.length > 0 &&
    Array.isArray(views.perChannel) && Array.isArray(evidence?.events) && Array.isArray(evidence.membershipLinks) &&
    Array.isArray(evidence.perThread) && Array.isArray(context.sources) && Array.isArray(context.filters?.channels) &&
    [0, 2].includes(context.exitCode) && context.period?.start < context.period?.end,
  'Invalid Heartbeat report dataset.');
  const dayCount = views.timeline.length;
  const included = evidence.events.filter(event => event.disposition === 'included');
  const threadKeys = new Set(evidence.perThread.map(thread => thread.threadKey));
  const ids = new Set();
  const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
  const bounded = metric => metric && nonnegative(metric.observed) &&
    ['exact', 'lower_bound', 'unknown'].includes(metric.certainty) &&
    (metric.certainty === 'exact' ? metric.total === metric.observed : metric.total === null);
  requireValue(views.perChannel.concat(views.timeline).every(row => bounded(row.messages) &&
    [row.sent, row.received, row.other].every(nonnegative)) &&
    Number.isFinite(Date.parse(context.period.asOf)), 'Invalid report metrics.');
  const people = views.peopleTable.map((person, index) => {
    requireValue(typeof person.personId === 'string' && !ids.has(person.personId) &&
      Array.isArray(person.direct?.activeDates) && Array.isArray(person.group?.activeDates) &&
      bounded(person.observedDirectMessages) &&
      [person.direct.sent, person.direct.received, person.group.observedPosted].every(nonnegative) &&
      person.direct.activeDates.length <= dayCount, 'Invalid graph person.');
    ids.add(person.personId);
    const days = person.direct.activeDates.length;
    const band = days * 2 >= dayCount ? 'frequent' : days * 5 >= dayCount ? 'regular' :
      days > 0 ? 'occasional' : person.group.observedPosted > 0 ? 'group' :
        person.observedDirectMessages.certainty === 'exact' ? 'inactive' : 'unknown';
    const activities = included.flatMap(event => event.personAttributions
      .filter(row => row.personId === person.personId).map(row => ({ ...row, event })));
    const memberships = evidence.membershipLinks.filter(row => row.personId === person.personId &&
      threadKeys.has(row.threadKey) &&
      (!row.validFrom || Date.parse(row.validFrom) < Date.parse(context.period.end)) &&
      (!row.validUntil || Date.parse(row.validUntil) > Date.parse(context.period.start)));
    const keys = [...new Set([...activities.map(row => row.event.threadKey),
      ...memberships.map(row => row.threadKey)])].sort();
    const threads = keys.map(threadKey => ({
      threadKey, activities: activities.filter(row => row.event.threadKey === threadKey),
      memberships: memberships.filter(row => row.threadKey === threadKey)
    }));
    return { ...person, anchor: `person-${index + 1}`, label: `P${index + 1}`,
      band, directDays: days, periodDays: dayCount, threads };
  });
  const sheets = Math.max(1, ...BANDS.map(band => Math.ceil(people.filter(p => p.band === band.id).length / 6)));
  return { people, sheets };
}
function mapSVG(model, sheet) {
  const center = 540;
  const spokes = [];
  const circles = BANDS.map(band => `<circle class="band" cx="${center}" cy="${center}" r="${band.radius}"/>
<text class="band-label" x="${center}" y="${center - band.radius - 8}" text-anchor="middle">${escape(band.label)}</text>`).join('');
  const nodes = BANDS.flatMap(band => {
    const peers = model.people.filter(person => person.band === band.id).slice(sheet * 6, sheet * 6 + 6);
    return peers.map((person, index) => {
      const angle = (-55 + index * 300 / Math.max(1, peers.length - 1)) * Math.PI / 180;
      const x = +(center + band.radius * Math.cos(angle)).toFixed(2);
      const y = +(center + band.radius * Math.sin(angle)).toFixed(2);
      const direct = person.directDays > 0;
      const recency = person.latestObserved ? person.latestObserved.slice(0, 10) : 'unknown';
      if (direct) spokes.push(`<line class="activity" x1="${center}" y1="${center}" x2="${x}" y2="${y}"/>`);
      return `<a href="#${person.anchor}" data-person="${person.anchor}" aria-label="${escape(`${person.label}: ${person.band}; latest observed ${recency}; inspect evidence`)}">
<circle class="person ${person.band}" cx="${x}" cy="${y}" r="23"/><text x="${x}" y="${y + 5}" text-anchor="middle">${person.label}</text>
<title>${escape(`${person.label}: latest observed ${recency}`)}</title>
<text class="recency" x="${x}" y="${y + 42}" text-anchor="middle">${person.latestObserved ? escape(recency.slice(5)) : '?'}</text></a>`;
    });
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" tabindex="0" role="group" aria-labelledby="map-title-${sheet} map-desc-${sheet}">
<title id="map-title-${sheet}">Heartbeat user-centered map, sheet ${sheet + 1} of ${model.sheets}</title>
<desc id="map-desc-${sheet}">You are at the center. Only observed direct activity creates spokes.
Outer categories are not frequency rankings. Tab to a person and press Enter for evidence.</desc>
${circles}${spokes.join('')}${nodes}<circle class="self" id="map-self-${sheet}" cx="${center}" cy="${center}" r="36"/>
<text x="${center}" y="${center + 5}" text-anchor="middle">You</text></svg>`;
}
function threadSVG(person) {
  if (!person.threads.length) return '<p>No attributed events or eligible membership evidence in the selected threads.</p>';
  return `<div class="scroll" tabindex="0" role="region" aria-label="${person.label} scrollable thread graph">
<svg xmlns="http://www.w3.org/2000/svg" class="threads" viewBox="0 0 640 ${person.threads.length * 74 + 20}"
role="img" aria-label="${person.label}: person circle to thread rectangles; solid activity and dashed membership edges">
${person.threads.map((thread, index) => {
    const y = index * 74 + 35;
    return `<circle class="person" cx="45" cy="${y}" r="22"/><text x="45" y="${y + 5}" text-anchor="middle">${person.label}</text>
${thread.activities.length ? `<line class="activity" x1="67" y1="${y - 5}" x2="320" y2="${y - 5}"/>` : ''}
${thread.memberships.length ? `<line class="membership" x1="67" y1="${y + 7}" x2="320" y2="${y + 7}"/>` : ''}
<rect class="thread" x="320" y="${y - 25}" width="280" height="50" rx="3"/>
<text x="330" y="${y - 4}">T${index + 1}: ${thread.activities.length} attributed events</text>
<text x="330" y="${y + 16}">${thread.memberships.length ? 'Membership evidence (not activity)' : 'No membership claim'}</text>`;
  }).join('')}</svg></div>`;
}
function render(report, reportDigest) {
  requireValue(typeof reportDigest === 'string' && /^[a-f0-9]{64}$/.test(reportDigest), 'Exact report byte digest required.');
  const model = graphModel(report);
  const { context, views } = report;
  const scriptHash = crypto.createHash('sha256').update(GRAPH_SCRIPT).digest('base64');
  const rows = model.people.map(person => [
    `<a href="#${person.anchor}" data-person="${person.anchor}">${person.label}</a>`, escape(person.personId), escape(person.band),
    `${person.directDays}/${person.periodDays}`, escape(count(person.observedDirectMessages)),
    String(person.group.observedPosted), escape(latest(person.latestObserved))
  ]);
  const details = model.people.map(person => `<section class="selection" id="${person.anchor}" tabindex="-1">
<h3>${person.label}: ${escape(person.personId)}</h3>
<p>Band: ${escape(BANDS.find(band => band.id === person.band).label)}.
Direct active dates: ${person.directDays}/${person.periodDays} (${(100 * person.directDays / person.periodDays).toFixed(1)}%).
Sent ${person.direct.sent}; received ${person.direct.received}; ${escape(count(person.observedDirectMessages))}.
Observed group posts: ${person.group.observedPosted}. Cohort identity state: ${escape(person.cohortState)}.</p>
<p>Latest observed direct: ${escape(latest(person.direct.latestObserved))}.
Latest attributed activity (direct or group): ${escape(latest(person.latestObserved))}.
Elapsed days since latest attributed activity: ${person.latestObserved === null ? 'unknown' :
    Math.floor((Date.parse(context.period.asOf) - Date.parse(person.latestObserved)) / 86400000)}.</p>
${threadSVG(person)}
${table(['Thread', 'Observed attribution evidence', 'Membership evidence (not activity)'], person.threads.map((thread, index) => [
    `T${index + 1}<pre>${escape(thread.threadKey)}</pre>`,
    thread.activities.length ? `<ul>${thread.activities.map(row => `<li>${escape(row.kind)}; ${escape(row.event.channel)};
${escape(row.event.timestamp)}<pre>${escape(row.event.key)}</pre></li>`).join('')}</ul>` : 'None observed; not proof of no history.',
    `<pre>${json(thread.memberships)}</pre>`
  ]), `${person.label} person-to-thread evidence`)}
<details><summary>Identity, channel and recipient-role evidence</summary><pre>${json({
    identityKeys: person.identityKeys, inactiveIdentityKeys: person.inactiveIdentityKeys,
    perChannel: person.perChannel, recipientRoles: person.recipientRoles,
    directActiveDates: person.direct.activeDates, groupActiveDates: person.group.activeDates
  })}</pre></details><p><a href="#people">Back to people</a> | <a href="#map">Back to map</a></p></section>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Heartbeat local interaction graph</title>
<style>
*{box-sizing:border-box}body{margin:0 auto;padding:1rem;max-width:76rem;font:16px/1.5 system-ui,sans-serif;color:#17212b;background:#fff}
h1,h2,h3,p,pre{overflow-wrap:anywhere}nav{display:flex;flex-wrap:wrap;gap:1rem}a{color:#064b9b}
a:focus-visible,summary:focus-visible,.scroll:focus-visible,button:focus-visible,select:focus-visible,svg:focus-visible,#inspector:focus-visible{outline:3px solid #8a3600;outline-offset:3px}
.scroll{overflow:auto;max-width:100%;margin:1rem 0}.map svg{width:100%;min-width:48rem;display:block}
svg text{font:16px system-ui,sans-serif;fill:#17212b}svg .band-label{font-size:15px;paint-order:stroke;stroke:white;stroke-width:5px;stroke-linejoin:round}
.band{fill:none;stroke:#8c959f;stroke-dasharray:3 5}.activity{stroke:#305c84;stroke-width:2}.membership{stroke:#59636e;stroke-dasharray:7 5;stroke-width:2}
.person,.thread{fill:#fff;stroke:#305c84;stroke-width:2}.group{fill:#f4edff}.unknown{fill:#fff3cc;stroke-dasharray:4 3}
.inactive{fill:#edf0f3}.self{fill:#d7e9fc;stroke:#17212b;stroke-width:2}svg a:focus .person,svg a:hover .person{stroke:#9b3800;stroke-width:5}
svg .recency{font-size:14px}.threads{width:100%;min-width:34rem;display:block}
table{border-collapse:collapse;min-width:100%;text-align:left}caption{text-align:left;font-weight:bold}
th,td{border:1px solid #8c959f;padding:.6rem;vertical-align:top}td pre{min-width:12rem}
pre{white-space:pre-wrap;font-size:.85rem}li{margin-bottom:.5rem}.selection{border-top:2px solid #8c959f;padding:1rem 0;scroll-margin-top:1rem}
.selection:target{border:3px solid #9b3800;padding:1rem;background:#fffaf0}.thread-wrap{overflow:auto}
.enhancement{display:none}.graph-ready .enhancement{display:block}[hidden]{display:none!important}
.workspace{margin:1rem 0}.workspace>*{min-width:0}.map-sheet{min-width:0}
.toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.75rem 0}
button,select{font:inherit;min-height:44px;max-width:100%;padding:.4rem .7rem;border:1px solid #59636e;border-radius:.4rem;background:#fff;color:#17212b}
button{cursor:pointer}button:hover{background:#e8f1fa}label{font-weight:600}
.interactive{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:1rem;align-items:start}
.interactive .map svg{width:100%;min-width:0;height:auto;aspect-ratio:1;touch-action:pinch-zoom;user-select:none;background:#f8fafc;border:1px solid #8c959f;border-radius:.5rem}
.interactive .map{margin:0;overflow:hidden}.interactive .band-label{display:none}.interactive .map svg text{font-size:23px}
.inspector{border:1px solid #8c959f;border-radius:.5rem;padding:1rem;max-height:48rem;overflow:auto;background:#f8fafc}
.inspector .selection{border:0;padding:0}.inspector h3{margin-top:0}.inspector .threads{min-width:30rem}
.legend{display:flex;flex-wrap:wrap;gap:.4rem 1rem;padding:0;list-style:none}.legend li{border-left:4px solid #305c84;padding-left:.5rem}
svg a[aria-current] .person{fill:#ffd9ad;stroke:#9b3800;stroke-width:5}
.graph-ready .fallback-hint{display:none}.sheet-heading{margin:.5rem 0}
@media(max-width:900px){.interactive{grid-template-columns:minmax(0,1fr)}.inspector{max-height:32rem}}
@media(max-width:600px){body{padding:.75rem}h1{font-size:1.6rem}h2{font-size:1.3rem}th,td{padding:.45rem}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
@media print{.scroll{overflow:visible}.map svg{min-width:0}.enhancement{display:none!important}.interactive{display:block}.map-sheet[hidden]{display:block!important}a{color:inherit}}
</style></head><body>
<a href="#people">Skip map to accessible people table</a>
<header><h1>Heartbeat local interaction graph</h1>
<p><strong>Synthetic only. Private local file; do not publish or share.</strong>
Communication frequency is not emotional closeness, affection, importance or relationship quality.</p></header>
<nav aria-label="Report views"><a href="#context">Filters and coverage</a><a href="#map">Map</a><a href="#people">People</a>
<a href="#channels">Channels</a><a href="#timeline">Timeline</a><a href="#evidence">Selection evidence</a></nav>
<section id="context"><h2>One frozen dataset: filters and coverage</h2>
<p>Every view uses this saved report's exact filters. To change channels or 7d/30d/custom bounds,
generate a new summary and graph. No independent browser filters or live refresh.</p>
<p>Period: [${escape(context.period.start)}, ${escape(context.period.end)}).
Zone: ${escape(context.period.timeZone)}. As-of: ${escape(context.period.asOf)}.
Status: ${escape(context.status)}. Coverage: ${escape(context.coverage)}.
Current date partial: ${escape(context.period.currentDayPartial)}.
Channels: ${escape(context.filters.channels.join(', '))}.</p>
<p>Report SHA-256: <code>${reportDigest}</code>. Collection SHA-256: <code>${escape(context.collectionDigest)}</code>.
Mapping revision: ${escape(context.identityMappingRevision)}.</p>
${views.summary.statements.map(statement => `<p>${escape(statement)}</p>`).join('')}
<details><summary>Source status, retrieval freshness and coverage</summary>
<pre>${json({ sources: context.sources, sourceFreshness: context.sourceFreshness })}</pre></details>
<details><summary>Exclusions, unresolved evidence and limitations</summary><pre>${json({
    filters: context.filters, exclusions: context.exclusions, audit: context.audit,
    unresolvedIdentities: context.unresolvedIdentities, unresolvedReferences: context.unresolvedReferences,
    reconciliation: context.reconciliation, limitations: context.limitations
  })}</pre></details></section>
<section id="map"><h2>User-centered map</h2>
<p>Radius uses observed direct active local dates divided by all ${views.timeline.length} local dates intersecting the period,
including partial dates. Positive counts under incomplete coverage are lower bounds, never complete frequency.
The three outer categories are not comparable numeric frequency ranks.
Inactive means no attributed direct/group posts with declared complete coverage, not neglected relationships.</p>
<p>Circles are people, rectangles are threads; solid lines are observed activity and dashed lines are membership only.
Only direct activity makes a user spoke. Node labels show latest observed attributed activity (UTC month-day; ? means unknown), not confirmed meaningful contact.
Group-only means only group activity was observed, not proof of no direct history.</p>
<p class="fallback-hint">Tab then Enter selects a person; browser Back returns. On small screens, swipe/scroll the map horizontally
or use the full-size linked people table. Each sheet repeats the same centered user and bands; no peers are omitted.</p>
<ul class="legend" aria-label="Map bands">${BANDS.map(band => `<li>${escape(band.label)}: ${model.people.filter(p => p.band === band.id).length} people</li>`).join('')}</ul>
<div class="enhancement">
<p>Choose a node or person to inspect evidence here. Drag empty map space to pan (mouse or one finger);
use + / − and Fit for zoom, or focus the map and use arrow keys, + / − and Home. Browser pinch zoom remains available.
Sheet and person controls navigate the entire cohort; they do not filter or regenerate report totals.</p>
<div class="toolbar"><label for="person-picker">Inspect person</label><select id="person-picker">
<option value="">Select a person</option>${model.people.map(person => `<option value="${person.anchor}">${person.label} · ${escape(person.band)} · ${escape(person.personId)}</option>`).join('')}</select></div>
<div class="toolbar"><button id="previous-sheet" type="button">Previous sheet</button>
<label for="sheet-picker">Map sheet</label><select id="sheet-picker">${Array.from({ length: model.sheets }, (_, sheet) => `<option value="${sheet}">${sheet + 1} of ${model.sheets}</option>`).join('')}</select>
<button id="next-sheet" type="button">Next sheet</button></div></div>
<div class="workspace"><div>
${Array.from({ length: model.sheets }, (_, sheet) => `<section class="map-sheet"><h3 class="sheet-heading">Map sheet ${sheet + 1} of ${model.sheets}</h3>
<div class="enhancement"><div class="toolbar" aria-label="Map camera controls">
${[['in', 'Zoom in'], ['out', 'Zoom out'], ['fit', 'Fit'], ['left', 'Pan left'], ['right', 'Pan right'], ['up', 'Pan up'], ['down', 'Pan down']].map(([action, label]) => `<button type="button" data-camera="${action}">${label}</button>`).join('')}
<output aria-label="Map zoom">100%</output></div></div>
<p class="fallback-hint"><a href="#map-self-${sheet}">Center this map on You</a></p>
<div class="scroll map" tabindex="0" role="region" aria-label="Scrollable map sheet ${sheet + 1}">${mapSVG(model, sheet)}</div></section>`).join('')}
</div><aside class="inspector enhancement" aria-label="Selected person evidence">
<h3>Person evidence</h3><p id="selection-status" role="status">Select a person to inspect their saved evidence.</p>
<div class="toolbar"><button type="button" id="return-person">Return to selection</button>
<button type="button" id="clear-selection">Clear selection</button></div>
<div id="inspector" tabindex="-1" aria-label="Selected person details"></div></aside></div>
</section><section id="people"><h2>People</h2>
${table(['Select', 'Canonical person', 'Band', 'Direct dates / period dates', 'Direct messages', 'Observed group posts', 'Latest observed'],
    rows, 'All reviewed peers, including inactive and unknown')}
${model.people.length ? '' : '<p>No reviewed peers; inspect unresolved identities and source coverage above.</p>'}
</section><section id="channels"><h2>Channels</h2>
${table(['Channel', 'Messages', 'Sent', 'Received', 'Other'], views.perChannel.map(row =>
    [escape(row.channel), escape(count(row.messages)), row.sent, row.received, row.other]), 'Channels in this same filtered report')}
</section><section id="timeline"><h2>Daily timeline</h2>
${table(['Local date', 'Partial date', 'Messages', 'Sent', 'Received', 'Other'], views.timeline.map(row =>
    [escape(row.date), escape(row.partialDay), escape(count(row.messages)), row.sent, row.received, row.other]),
  'All local dates in the same interval; unknown is not zero')}
</section><section id="evidence"><h2>Explainable selection and person-to-thread evidence</h2>
<p>Membership edges appear only for threads with included messages in this filtered report and overlapping
membership intervals. Missing validity bounds remain unknown. Membership does not imply participation,
direct activity, household membership or relationships between peers.</p>${details}</section>
<script>${GRAPH_SCRIPT}</script></body></html>\n`;
}
function run(request, folder = process.cwd()) {
  object(request, ['schemaVersion', 'dataClass', 'report', 'reportDigest', 'output'], 'request');
  requireValue(request.schemaVersion === 1 && request.dataClass === 'synthetic',
    'Private graphs are disabled; only schemaVersion 1 synthetic requests are supported.', 'private_collection_disabled');
  requireValue(['report', 'output'].every(field => typeof request[field] === 'string' && request[field].trim()),
    'Explicit report and output paths required.');
  const report = readJSON(path.resolve(folder, request.report));
  requireValue(report.value.dataClass === 'synthetic', 'Private graphs are disabled.', 'private_collection_disabled');
  requireValue(request.reportDigest === report.digest, 'Report byte digest mismatch.', 'report_conflict');
  const html = render(report.value, report.digest);
  const output = outputLocation(path.resolve(folder, request.output));
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const file = path.join(output, 'graph.html');
  publishText(file, html);
  return { heading: 'Heartbeat local interaction graph', file, reportDigest: report.digest,
    status: report.value.context.status, exitCode: report.value.context.exitCode };
}
if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--request',
      'Usage: node --import tsx scripts\\contacts\\graph.ts --request <request.json>', 'invalid_arguments');
    const file = path.resolve(args[1]);
    const result = run(readJSON(file).value, path.dirname(file));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Graph failed [${error.code || 'unexpected_error'}]: ${error.message}\n`);
    return 1;
  });
}

export { graphModel, render, run };
