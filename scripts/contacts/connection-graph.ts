import fs from 'node:fs';
import path from 'node:path';
import { array, object, text, requireValue, hash } from './lib.ts';
import { manualOutputLocation } from './manual-retrieval.ts';

type Platform = 'messenger' | 'instagram' | 'messages';
type Ring = 'today' | 'week' | 'fortnight' | 'month' | 'older' | 'unknown';
type Kind = 'direct' | 'text' | 'group' | 'unknown';
interface Photo { key: string; file: string; bytes: Buffer; digest: string }
interface PhotoSet { inputDigest: string; photos: Photo[] }
interface MuseSource {
  source: 'messenger' | 'instagram';
  retrievedAt?: string;
  selfIds?: string[];
  records: { chatType: string; participants: { name: string | null; id: string | null }[]; reportedLatestSentAt: string | null }[];
}
interface TextObservations { period?: { end: string; timeZone: string }; messages: { threadUiId: string; inferredLocalDate: string | null; requestedWindowMembership: string }[] }
interface GraphNode {
  id: string; label: string; initials: string; ring: Ring; ringLabel: string; kind: Kind; lastActivity: string | null;
  lastNote: string; platforms: Platform[]; platformLabels: string[]; chats: string[]; photo: string | null; identityNote: string;
}
interface GraphChat { id: string; platform: Platform; kind: 'one-to-one' | 'group' | 'unknown' | 'text'; label: string; latest: string | null; asOf: string | null; members: string[] }
interface ConnectionModel { nodes: GraphNode[]; chats: GraphChat[]; linkedPhotos: Photo[]; selfIdentified: boolean; asOf: string | null }

const PLATFORMS: Record<Platform, string> = { messenger: 'Messenger', instagram: 'Instagram', messages: 'Google Messages' };
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

function initials(label: string): string {
  const letters = label.split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0] ?? '');
  return letters.join('').toLocaleUpperCase() || '?';
}

function connectionModel(observations: TextObservations | null, muse: MuseSource[], photos: PhotoSet | null = null,
  zone: string | null = null): ConnectionModel {
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
  const nodes = new Map<string, GraphNode & { kinds: Set<GraphChat['kind']>; profile: boolean }>();
  const chats: GraphChat[] = [];
  const photoByKey = new Map((photos?.photos ?? []).map(photo => [photo.key, photo]));
  const linked = new Map<string, Photo>();
  let selfIdentified = false;
  const add = (key: string, label: string, platform: Platform, chat: GraphChat, profile: boolean, photo: Photo | null) => {
    let node = nodes.get(key);
    if (!node) {
      node = { id: `n${nodes.size + 1}`, label, initials: initials(label), ring: 'unknown', ringLabel: '', kind: 'unknown',
        lastActivity: null, lastNote: '', platforms: [],
        platformLabels: [], chats: [], photo: photo?.file ?? null, identityNote: '', kinds: new Set(), profile };
      nodes.set(key, node);
      if (photo) linked.set(photo.file, photo);
    }
    if (!node.platforms.includes(platform)) node.platforms.push(platform);
    node.chats.push(chat.id); node.kinds.add(chat.kind); chat.members.push(node.id);
  };
  for (const source of muse) {
    const platform: Platform = source.source;
    const self = new Set((source.selfIds ?? []).map(id => participantKey(platform, id)).filter(Boolean));
    if (self.size) selfIdentified = true;
    const sourceDay = dayOf(source.retrievedAt);
    source.records.forEach((row, index) => {
      const kind = row.chatType === 'group' ? 'group' : row.chatType === 'unknown' ? 'unknown' : 'one-to-one';
      const chat: GraphChat = { id: `c${chats.length + 1}`, platform, kind, latest: row.reportedLatestSentAt, asOf: sourceDay, members: [],
        label: `${PLATFORMS[platform]} ${kind === 'group' ? 'group chat' : kind === 'unknown' ? 'chat' : 'one-to-one chat'} ${index + 1}` };
      chats.push(chat);
      row.participants.forEach((participant, position) => {
        const key = participantKey(platform, participant.id);
        if (key && self.has(key)) return;
        const photo = platform === 'messenger' && key ? photoByKey.get(key) ?? null : null;
        add(key ? `${platform}|${key}` : `${platform}|${chat.id}|${position}`,
          participant.name ?? 'Participant (ID only)', platform, chat, key !== null, photo);
      });
    });
  }
  [...new Set(observations?.messages.map(m => m.threadUiId) ?? [])].forEach((thread, index) => {
    const inside = observations.messages.filter(m => m.threadUiId === thread && m.requestedWindowMembership === 'inferred-inside')
      .map(m => m.inferredLocalDate).sort();
    const chat: GraphChat = { id: `c${chats.length + 1}`, platform: 'messages', kind: 'text', members: [],
      label: `Text conversation ${index + 1}`, latest: inside.at(-1) ?? null,
      asOf: observations.period ? dayOf(new Date(Date.parse(observations.period.end) - 1).toISOString()) : null };
    chats.push(chat);
    add(`messages|${thread}`, `Conversation ${index + 1}`, 'messages', chat, false, null);
  });
  // Each chat ages against its own source snapshot day, never the render clock or another source's later snapshot.
  const sourceDays = [...new Set(chats.map(c => c.asOf).filter((d): d is string => d !== null))].sort();
  const asOf = sourceDays.length === 0 ? null : sourceDays.length === 1 ? sourceDays[0] : `${sourceDays[0]} to ${sourceDays.at(-1)}`;
  const direct = (chat: GraphChat) => chat.kind === 'one-to-one' || chat.kind === 'text';
  const result = [...nodes.values()].map(({ kinds, profile, ...node }) => {
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
          last.chat.kind === 'group' ? 'latest group-chat activity, not necessarily with them' :
            last.chat.kind === 'unknown' ? 'latest activity in a chat of unknown type, not necessarily with them' :
              last.chat.kind === 'text' ? 'latest observed message (inferred day)' : 'latest one-to-one activity'}`,
      platformLabels: node.platforms.map(p => PLATFORMS[p]),
      identityNote: kind === 'text' ? 'Participants were not captured; not linked to any contact.' :
        profile ? `Muse-reported profile ID; unverified.${node.photo ? ' Photo attached by exact profile ID match.' : ''}` :
          'No profile ID; this entry is local to one chat and never merged by name.' };
  });
  return { nodes: result, chats, linkedPhotos: [...linked.values()], selfIdentified, asOf };
}

const BADGES = `<g id="badge-messenger"><circle r="8" fill="#0a7cff" stroke="#fffdf9" stroke-width="2"/><path d="M-4.6 2.3L-1.2-1.9L1 .4L4.6-2.3L1.2 1.9L-1-.4Z" fill="#fff"/></g>
<g id="badge-instagram"><circle r="8" fill="#d62976" stroke="#fffdf9" stroke-width="2"/><rect x="-3.8" y="-3.8" width="7.6" height="7.6" rx="2.2" fill="none" stroke="#fff" stroke-width="1.3"/><circle r="1.7" fill="none" stroke="#fff" stroke-width="1.3"/></g>
<g id="badge-messages"><circle r="8" fill="#1e8e3e" stroke="#fffdf9" stroke-width="2"/><path d="M-4-3.4h8a1 1 0 0 1 1 1v4.1a1 1 0 0 1-1 1h-4.2l-2.6 2.1v-2.1h-1.2a1 1 0 0 1-1-1v-4.1a1 1 0 0 1 1-1z" fill="#fff"/></g>`;

function connectionSVG(model: ConnectionModel): string {
  const used = RINGS.filter(ring => model.nodes.some(node => node.ring === ring.id));
  let previous = 60;
  const radii = used.map(ring => {
    const count = model.nodes.filter(node => node.ring === ring.id).length, label = ring.label.length * 6.6 + 50;
    previous = Math.max(ring.base, previous + 100, Math.ceil((count * 58 + label) / (2 * Math.PI)));
    return { ...ring, radius: previous, count, gap: Math.min(Math.PI, label / previous) };
  });
  const extent = previous + 80;
  const circles = radii.map(ring => `<circle class="ring" r="${ring.radius}"/>
<text class="ring-label" y="${-ring.radius + 4}" text-anchor="middle">${escape(ring.label)}</text>`).join('');
  const spokes: string[] = [], items: string[] = [];
  radii.forEach((ring, k) => {
    model.nodes.filter(node => node.ring === ring.id).forEach((node, index) => {
      const angle = -Math.PI / 2 + ring.gap / 2 + ((index + 0.5 + k * 0.37) % ring.count) * (2 * Math.PI - ring.gap) / ring.count;
      const x = +(ring.radius * Math.cos(angle)).toFixed(1), y = +(ring.radius * Math.sin(angle)).toFixed(1);
      if (node.kind === 'direct' || node.kind === 'text') spokes.push(`<line class="spoke ${node.kind}" data-spoke="${node.id}" x1="0" y1="0" x2="${x}" y2="${y}"/>`);
      const short = Array.from(node.label.split(/\s+/)[0] ?? '').slice(0, 12).join('');
      items.push(`<g class="node kind-${node.kind}" data-node="${node.id}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-pressed="false"
aria-label="${escape(`${node.label}: ${node.ringLabel}; ${node.platformLabels.join(', ')}`)}"><title>${escape(node.label)}</title>
<circle class="halo" r="28"/>${node.photo ? `<image href="photos/${escape(node.photo)}" x="-22" y="-22" width="44" height="44" clip-path="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice"/>`
        : `<circle class="disc" r="22"/><text class="initials" y="5" text-anchor="middle">${escape(node.initials)}</text>`}
<circle class="rim" r="22"/>${node.platforms.map((platform, i) => `<use href="#badge-${platform}" x="${16 - i * 15}" y="16"/>`).join('')}
<text class="node-label" y="40" text-anchor="middle">${escape(short)}</text></g>`);
    });
  });
  return `<svg id="connections-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${-extent} ${-extent} ${extent * 2} ${extent * 2}" role="group" aria-labelledby="connections-title connections-desc">
<title id="connections-title">Your connections in concentric rings</title>
<desc id="connections-desc">You are at the center. Rings show how recently a shared chat was active relative to its source snapshot${model.asOf ? ` (${escape(model.asOf)})` : ''}, closest first. Spokes mark one-to-one or observed text conversations; group-only members have no spoke.</desc>
<defs><clipPath id="avatar-clip"><circle r="22"/></clipPath>${BADGES}</defs>
${circles}${spokes.join('')}<circle class="self" r="34"/><text class="self-label" y="6" text-anchor="middle">You</text>${items.join('')}</svg>`;
}

const CONNECTIONS_SCRIPT = `(()=>{
const svg=document.getElementById('connections-svg');if(!svg)return;
const model=JSON.parse(document.getElementById('connections-data').textContent);
const byId=new Map(model.nodes.map(n=>[n.id,n])),chats=new Map(model.chats.map(c=>[c.id,c]));
const nodes=[...svg.querySelectorAll('[data-node]')];
const detail=document.getElementById('connection-detail'),empty=document.getElementById('connection-empty');
let selected=null,moved=false;
function related(id){const set=new Set();for(const c of byId.get(id).chats)for(const m of chats.get(c).members)set.add(m);return set;}
function paint(){const rel=selected?related(selected):null;
for(const el of nodes){const id=el.dataset.node;el.classList.toggle('selected',id===selected);
el.classList.toggle('related',!!rel&&id!==selected&&rel.has(id));el.classList.toggle('dimmed',!!rel&&!rel.has(id));
el.setAttribute('aria-pressed',String(id===selected));}
for(const s of svg.querySelectorAll('[data-spoke]'))s.classList.toggle('dimmed',!!rel&&!rel.has(s.dataset.spoke));
if(!selected){detail.hidden=true;empty.hidden=false;return;}
const n=byId.get(selected);document.getElementById('connection-name').textContent=n.label;
document.getElementById('connection-ring').textContent=n.ringLabel+' · '+n.lastNote;
document.getElementById('connection-platforms').textContent=n.platformLabels.join(' · ');
document.getElementById('connection-identity').textContent=n.identityNote;
const list=document.getElementById('connection-chats');list.replaceChildren();
for(const id of n.chats){const c=chats.get(id);const item=document.createElement('li');
item.textContent=c.label+' · latest sent as returned: '+(c.latest||'unknown')+(c.kind==='group'?' · '+c.members.length+' other listed members':'');list.append(item);}
detail.hidden=false;empty.hidden=true;}
function select(id){selected=selected===id?null:id;paint();}
for(const el of nodes){el.addEventListener('click',e=>{e.stopPropagation();select(el.dataset.node);});
el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(el.dataset.node);}});}
const checks=[...document.querySelectorAll('[data-platform-filter]')],search=document.getElementById('connection-search');
function filter(){const on=new Set(checks.filter(c=>c.checked).map(c=>c.value));const term=search.value.trim().toLocaleLowerCase();let shown=0;
for(const el of nodes){const n=byId.get(el.dataset.node);const ok=n.platforms.some(p=>on.has(p))&&(!term||n.label.toLocaleLowerCase().includes(term));
el.classList.toggle('filtered',!ok);if(ok)shown++;}
for(const s of svg.querySelectorAll('[data-spoke]'))s.classList.toggle('filtered',svg.querySelector('[data-node="'+s.dataset.spoke+'"]').classList.contains('filtered'));
document.getElementById('connection-count').textContent=shown+' of '+nodes.length+' shown';}
for(const c of checks)c.addEventListener('change',filter);search.addEventListener('input',filter);
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
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#6c7570;margin-top:10px}.legend svg{width:18px;height:18px;vertical-align:-4px}
#connection-chats{padding-left:18px;font-size:13px}
@media(max-width:900px){.graph-layout{grid-template-columns:1fr}}`;

function connectionsPanel(model: ConnectionModel): string {
  if (!model.nodes.length) return '';
  const platforms = (['messenger', 'instagram', 'messages'] as Platform[]).filter(p => model.nodes.some(n => n.platforms.includes(p)));
  const badge = (p: Platform) => `<svg viewBox="-10 -10 20 20" aria-hidden="true"><use href="#badge-${p}"/></svg>`;
  return `<section class="panel graph-panel" aria-labelledby="graph-heading"><h2 id="graph-heading">Your connections</h2>
<p class="muted">Rings show how recently a chat you share was active, measured from each source's snapshot day${model.asOf ? ` (${escape(model.asOf)})` : ' (unknown: no time zone or dates)'}: most recent at the center, older further out. Click a person to see where you talked and who shares those chats. Drag to pan, scroll to zoom.</p>
<div class="graph-tools"><input id="connection-search" type="search" placeholder="Find in graph…" autocomplete="off" aria-label="Find in graph">
${platforms.map(p => `<label class="chip"><input type="checkbox" data-platform-filter value="${p}" checked>${badge(p)}${PLATFORMS[p]}</label>`).join('')}
<span class="zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button> <button type="button" data-zoom="out" aria-label="Zoom out">−</button> <button type="button" data-zoom="fit">Fit</button></span>
<small id="connection-count">${model.nodes.length} of ${model.nodes.length} shown</small></div>
<div class="graph-layout"><div>${connectionSVG(model)}
<div class="legend">${platforms.map(p => `<span>${badge(p)} ${PLATFORMS[p]}</span>`).join('')}<span>Solid spoke: one-to-one · dashed: unlinked text conversation · no spoke: group chat only, so the ring reflects group activity</span></div></div>
<aside><div id="connection-empty" class="notice">Select someone in the graph to inspect their chats.</div>
<div id="connection-detail" hidden><div class="label">Selected</div><h2 id="connection-name"></h2><p id="connection-ring" class="muted"></p>
<p id="connection-platforms"></p><ul id="connection-chats"></ul><p id="connection-identity" class="notice"></p>
<button type="button" id="connection-clear" class="chip">Clear selection</button></div>
<div class="notice">Muse-reported, unverified and partial. Photos attach only by exact Facebook profile ID, never by name or face.
${model.selfIdentified ? '' : 'Your own account was not identified in this snapshot, so you may appear as a participant.'}</div></aside></div></section>`;
}

export { profileKey, readProfilePhotos, connectionModel, connectionSVG, connectionsPanel, CONNECTIONS_SCRIPT, CONNECTIONS_STYLE };
export type { PhotoSet, ConnectionModel };
