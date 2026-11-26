import fs from 'node:fs';
import path from 'node:path';
import type { Handoff, CollectionRequest } from './types.ts';
import type { PeriodRequest } from './collect.ts';

const period: PeriodRequest = { preset: '7d', timeZone: 'America/Los_Angeles', asOf: '2026-11-24T20:00:00Z' };
function handoff(source: string, channel: string | null): Handoff {
  const contact = source === 'google-contacts';
  return {
    schemaVersion: 1, dataClass: 'synthetic', source, account: 'fixture-account', connector: 'synthetic-handoff',
    coverage: { start: contact ? null : '2026-11-01T00:00:00Z', end: contact ? null : period.asOf,
      completeness: 'complete', basis: 'Synthetic fixture only; not endpoint access or real history.' },
    pages: [{
      cursor: null, nextCursor: null, retrievedAt: period.asOf,
      identities: [
        { id: 'self', idKind: 'local', displayName: 'Synthetic self', isSelf: true },
        { id: 'person-a', idKind: 'local', displayName: 'Synthetic person A', isSelf: false }
      ],
      threads: contact ? [] : [{ id: 'thread-1', idKind: 'local', kind: 'direct' }],
      memberships: contact ? [] : [{ threadId: 'thread-1', identityId: 'self' }, { threadId: 'thread-1', identityId: 'person-a' }],
      events: contact ? [] : [{ id: 'message-1', idKind: 'local', eventType: 'message',
        threadId: 'thread-1', senderId: 'person-a', timestamp: '2026-11-23T12:00:00Z',
        channel, recipients: [{ identityId: 'self', role: channel === 'email' ? 'to' : 'recipient' }], classification: 'interpersonal' }]
    }]
  };
}
function cohortHandoff(source: string, channel: string | null): Handoff {
  const input = handoff(source, channel);
  if (channel === null) return input;
  const page = input.pages[0];
  const peers = ['daily', 'weekly', 'occasional', 'group', 'member', 'idle-1', 'idle-2', 'idle-3', 'idle-4'];
  page.identities = ['self', ...peers].map(id => ({
    id, idKind: 'local', displayName: `Synthetic ${id === 'idle-2' ? 'idle-1' : id}`, isSelf: id === 'self'
  }));
  page.threads = ['daily', 'weekly', 'occasional', 'group'].map(id =>
    ({ id, idKind: 'local', kind: id === 'group' ? 'group' : 'direct' }));
  page.memberships = ['daily', 'weekly', 'occasional'].flatMap(threadId =>
    ['self', threadId].map(identityId => ({ threadId, identityId })))
    .concat(['self', 'group', 'member'].map(identityId => ({ threadId: 'group', identityId })));
  page.events = ['daily', 'weekly', 'occasional', 'group'].flatMap((peer, index) =>
    Array.from({ length: [6, 3, 1, 2][index] }, (_, day) => ({
      id: `${peer}-${day}`, idKind: 'local', eventType: 'message', threadId: peer,
      senderId: day % 2 === 0 || peer === 'group' ? peer : 'self',
      timestamp: `2026-11-${18 + day}T18:00:00Z`, channel,
      recipients: [{ identityId: day % 2 === 0 || peer === 'group' ? 'self' : peer,
        role: channel === 'email' ? 'to' : 'recipient' }], classification: 'interpersonal'
    })));
  return input;
}
function writeDemo(folder, { partial = false } = {}) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (fs.readdirSync(folder).length > 0) throw new Error('Demo requires an empty output directory; choose a fresh directory.');
  const sources = [];
  for (const [source, channel] of [['google-contacts', null], ['email', 'email'], ['text-messages', 'sms'], ['messenger', 'messenger'], ['whatsapp', 'whatsapp']]) {
    const input = `${source}.synthetic.json`;
    const file = path.join(folder, input);
    if (fs.existsSync(file)) throw new Error('Demo refuses to overwrite an existing input; choose a fresh directory.');
    const data = cohortHandoff(source, channel);
    if (partial && source === 'whatsapp') {
      data.coverage.completeness = 'partial';
      data.coverage.basis = 'Synthetic incomplete WhatsApp history; missing history is unknown, not zero.';
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    sources.push({ source, account: 'fixture-account', connector: 'synthetic-handoff', mode: 'metadata-import', input });
  }
  const request: CollectionRequest = { schemaVersion: 1, dataClass: 'synthetic', period, output: '.', resume: false, sources };
  const requestFile = path.join(folder, 'request.synthetic.json');
  fs.writeFileSync(requestFile, JSON.stringify(request, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { request, folder };
}

export { handoff, writeDemo, period };
