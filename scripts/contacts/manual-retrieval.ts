import fs from 'node:fs';
import path from 'node:path';
import type { Handoff, HandoffPage } from './types.ts';
import type { PeriodRequest, SourceReference } from './collect.ts';
import { resolvePeriod } from './collect.ts';
import { array, errorCode, instant, object, outputLocation, publish, readJSON, requireValue, runCLI, text, within,
  SOURCES as sourceNames } from './lib.ts';

interface ManualSource extends SourceReference {
  fields: string[];
  status: 'collected' | 'partial' | 'requires_setup' | 'unsupported' | 'failed';
  operation: string | null;
  responseRefs: string[];
  retrievedAt: string | null;
  gaps: string[];
  handoff: Handoff | null;
}
interface ManualRun {
  schemaVersion: number;
  dataClass: 'private' | 'synthetic';
  period: PeriodRequest;
  sources: ManualSource[];
}

const recordFields = {
  identities: ['id', 'idKind', 'isSelf', 'addresses'],
  threads: ['id', 'idKind', 'kind'],
  memberships: ['threadId', 'identityId', 'validFrom', 'validUntil'],
  events: ['id', 'idKind', 'threadId', 'senderId', 'timestamp', 'channel', 'eventType', 'recipients', 'targetId', 'classification']
};
const allowedFields = Object.entries(recordFields).flatMap(([kind, fields]) => fields.map(field => `${kind}.${field}`));

function validateHandoff(source: ManualSource, dataClass: string, period: ReturnType<typeof resolvePeriod>): void {
  const handoff = source.handoff;
  object(handoff, ['schemaVersion', 'dataClass', 'source', 'account', 'connector', 'coverage', 'pages'], 'handoff');
  requireValue(handoff.schemaVersion === 1 && handoff.dataClass === dataClass, 'Handoff version/data class must match the run.');
  for (const field of ['source', 'account', 'connector']) {
    requireValue(handoff[field] === source[field], 'Handoff source/account/connector must match its receipt.');
  }
  const coverage = handoff.coverage;
  object(coverage, ['start', 'end', 'completeness', 'basis'], 'coverage');
  text(coverage.basis, 'coverage.basis');
  requireValue(['complete', 'partial', 'unknown'].includes(coverage.completeness), 'Invalid coverage.');
  const start = coverage.start === null ? null : instant(coverage.start, 'coverage.start');
  const end = coverage.end === null ? null : instant(coverage.end, 'coverage.end');
  requireValue((start === null || end === null || start < end) &&
    (end === null || end <= source.retrievedAt), 'Invalid coverage bounds.');
  if (source.status === 'collected') {
    requireValue(coverage.completeness === 'complete' && source.gaps.length === 0 &&
      (source.source === 'google-contacts' || (start !== null && end !== null && start <= period.start && end >= period.end)),
    'Collected requires complete evidence covering the requested interval without gaps.');
  }
  const pages = array(handoff.pages, 'handoff.pages') as HandoffPage[];
  requireValue(pages.length > 0, 'A successful retrieval needs structured pages, including verified empty results.');
  const cursors = new Set<string | null>();
  pages.forEach((page, index) => {
    object(page, ['cursor', 'nextCursor', 'retrievedAt', ...Object.keys(recordFields)], 'page');
    for (const field of ['cursor', 'nextCursor']) {
      requireValue(page[field] === null || (typeof page[field] === 'string' && page[field].length > 0), 'Invalid page cursor.');
    }
    requireValue(page.cursor === (index === 0 ? null : pages[index - 1].nextCursor) &&
      !cursors.has(page.cursor), 'Pages must preserve a non-repeating traversal from the first cursor.');
    cursors.add(page.cursor);
    requireValue(page.nextCursor === null || !cursors.has(page.nextCursor), 'A page cannot continue to an already visited cursor.');
    const retrievedAt = instant(page.retrievedAt, 'page.retrievedAt');
    requireValue(retrievedAt <= source.retrievedAt, 'Page retrieval cannot follow receipt retrieval.');
    for (const [kind, fields] of Object.entries(recordFields)) {
      for (const record of array(page[kind], kind)) {
        object(record, fields, kind);
        requireValue(Object.keys(record).every(field => source.fields.includes(`${kind}.${field}`)), 'Record contains an unrequested metadata field.');
        if (kind !== 'memberships') {
          text(record.id, 'record.id');
          requireValue(['provider', 'local'].includes(record.idKind), 'Record IDs must declare provider or reviewed local origin.');
        }
        for (const field of ['threadId', 'identityId', 'targetId']) {
          if (record[field] !== undefined) text(record[field], field);
        }
        if (record.isSelf !== undefined) requireValue(typeof record.isSelf === 'boolean', 'isSelf must be boolean.');
        if (kind === 'threads') requireValue(['direct', 'group', 'broadcast', 'unknown'].includes(record.kind), 'Invalid thread kind.');
        if (kind === 'memberships') {
          text(record.threadId, 'membership.threadId');
          text(record.identityId, 'membership.identityId');
          const from = record.validFrom == null ? null : instant(record.validFrom, 'validFrom');
          const until = record.validUntil == null ? null : instant(record.validUntil, 'validUntil');
          requireValue(from === null || until === null || from < until, 'Invalid membership interval.');
        }
        if (kind === 'identities' && record.addresses !== undefined) {
          for (const address of array(record.addresses, 'addresses')) {
            object(address, ['type', 'value'], 'address');
            requireValue(['email', 'phone'].includes(address.type), 'Only email/phone identity addresses are supported.');
            text(address.value, 'address.value');
          }
        }
        if (kind === 'events') {
          const timestamp = instant(record.timestamp, 'event.timestamp');
          requireValue(timestamp >= period.start && timestamp < period.end && timestamp <= retrievedAt,
            'Events must be inside the approved half-open interval and no later than retrieval.');
          text(record.threadId, 'event.threadId');
          requireValue(['message', 'reaction', 'membership', 'edit', 'deletion'].includes(record.eventType), 'Invalid event type.');
          const channels = { email: ['email'], 'text-messages': ['sms', 'mms', 'rcs', 'imessage'],
            messenger: ['messenger'], whatsapp: ['whatsapp'], 'google-contacts': [] };
          requireValue(channels[source.source].includes(record.channel), 'Event channel must match the source.');
          requireValue(['interpersonal', 'bulk', 'automated', 'unclassified'].includes(record.classification), 'Invalid classification.');
          if (record.senderId !== null) text(record.senderId, 'event.senderId');
          requireValue(record.eventType !== 'message' || record.senderId !== null, 'A message needs a known sender.');
          requireValue(!['edit', 'deletion'].includes(record.eventType) || typeof record.targetId === 'string', 'Mutations need target IDs.');
          if (record.recipients !== undefined) {
            for (const recipient of array(record.recipients, 'recipients')) {
              object(recipient, ['identityId', 'role'], 'recipient');
              text(recipient.identityId, 'recipient.identityId');
              requireValue(['to', 'cc', 'bcc', 'recipient'].includes(recipient.role), 'Invalid recipient role.');
            }
          }
        }
        requireValue(source.source !== 'google-contacts' ||
          (page.threads.length === 0 && page.memberships.length === 0 && page.events.length === 0),
        'Identity snapshots cannot create activity.');
      }
    }
  });
  requireValue(source.status !== 'collected' || pages[pages.length - 1].nextCursor === null,
    'Unfinished pagination must remain partial.');
}

function saveManualRun(input: ManualRun, output: string) {
  object(input, ['schemaVersion', 'dataClass', 'period', 'sources'], 'run');
  requireValue(input.schemaVersion === 1 && ['private', 'synthetic'].includes(input.dataClass), 'Invalid run version/data class.');
  const period = resolvePeriod(input.period);
  const sources = array(input.sources, 'sources') as ManualSource[];
  requireValue(sources.length > 0, 'Include every requested source, even unavailable sources.');
  const namespaces = new Set<string>();
  for (const source of sources) {
    object(source, ['source', 'account', 'connector', 'fields', 'status', 'operation', 'responseRefs', 'retrievedAt', 'gaps', 'handoff'], 'source');
    requireValue(sourceNames.includes(source.source), 'Unknown source.');
    text(source.account, 'account'); text(source.connector, 'connector');
    const namespace = JSON.stringify([source.source, source.account, source.connector]);
    requireValue(!namespaces.has(namespace), 'Duplicate source namespace.'); namespaces.add(namespace);
    requireValue(array(source.fields, 'fields').length > 0 &&
      source.fields.every(field => allowedFields.includes(field)), 'Request explicit supported metadata fields only.');
    array(source.gaps, 'gaps').forEach(gap => text(gap, 'gap'));
    array(source.responseRefs, 'responseRefs').forEach(ref => text(ref, 'responseRef'));
    requireValue(['collected', 'partial', 'requires_setup', 'unsupported', 'failed'].includes(source.status), 'Invalid source status.');
    requireValue(source.status !== 'partial' || source.gaps.length > 0, 'Partial retrieval needs explicit gaps.');
    if (source.operation !== null) text(source.operation, 'operation');
    if (source.retrievedAt !== null) source.retrievedAt = instant(source.retrievedAt, 'retrievedAt');
    if (['collected', 'partial'].includes(source.status)) {
      requireValue(source.operation !== null && source.responseRefs.length > 0 && source.retrievedAt !== null,
        'Retrieved metadata needs the actual operation, response references and retrieval time.');
      validateHandoff(source, input.dataClass, period);
    } else {
      requireValue(source.handoff === null && source.gaps.length > 0, 'Unavailable/failed sources need explicit gaps, not fabricated pages.');
    }
  }
  const folder = outputLocation(output);
  requireValue(fs.statSync(folder).isDirectory() && fs.realpathSync(folder) === folder, 'Choose an existing, non-redirected output directory.', 'unsafe_output');
  if (input.dataClass === 'private') {
    requireValue(!folder.startsWith('\\\\'), 'Private output must be on this computer.', 'unsafe_output');
    for (let ancestor = folder; ; ancestor = path.dirname(ancestor)) {
      requireValue(!fs.existsSync(path.join(ancestor, '.git')), 'Private output must be outside every Git worktree.', 'unsafe_output');
      if (path.dirname(ancestor) === ancestor) break;
    }
    requireValue(!within(path.resolve(__dirname, '..', '..'), folder), 'Private output must be outside the checkout.', 'unsafe_output');
  }
  const file = path.join(folder, 'manual-handoff.json');
  publish(file, { ...input, period });
  return { file, exitCode: sources.every(source => source.status === 'collected') ? 0 : 2 };
}

if (require.main === module) {
  runCLI(() => {
    const args = process.argv.slice(2);
    requireValue(args.length === 4 && args[0] === '--input' && args[2] === '--output',
      'Usage: contacts:retrieve-save --input <projected-local-run.json> --output <existing-private-directory>');
    const result = saveManualRun(readJSON(args[1]).value, args[3]);
    process.stdout.write('Manual handoff saved locally; downstream private import remains disabled.\n');
    return result.exitCode;
  }, error => {
    process.stderr.write(`Manual handoff not saved (${errorCode(error) || 'manual_handoff_failed'}): invalid metadata, unavailable input or unsafe/existing output. Inspect locally; no private details are printed.\n`);
    return 1;
  });
}

export { saveManualRun };
export type { ManualRun, ManualSource };
