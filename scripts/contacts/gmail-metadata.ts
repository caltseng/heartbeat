import { emailKey } from './connection-graph.ts';
import { readMetadata } from './contact-dashboard.ts';
import { array, object, text, instant, requireValue } from './lib.ts';

interface GmailRow { timestamp: string; direction: 'sent' | 'received'; from: string; to: string[]; cc: string[] }
interface GmailSource {
  account: string;
  coverage: { start: string; end: string; completeness: string; basis: string };
  observations: GmailRow[];
  originalBytes?: Buffer;
  inputDigest?: string;
}

// Saved Gmail header metadata (addresses, direction, time) only; subjects, bodies, snippets and attachments are rejected.
function readGmailMetadata(file: string, dataClass: string): GmailSource {
  const { value, originalBytes, inputDigest } = readMetadata(file, dataClass);
  object(value, ['dataClass', 'source', 'account', 'connector', 'fields', 'excluded', 'providerIds', 'rawRows', 'uniqueRows',
    'coverage', 'observations'], 'Gmail metadata');
  requireValue(value.dataClass === dataClass && value.source === 'email', 'Invalid saved Gmail metadata.');
  const account = emailKey(text(value.account, 'Gmail account'));
  requireValue(account !== null, 'The Gmail account must be an email address.');
  object(value.coverage, ['start', 'end', 'completeness', 'basis'], 'Gmail coverage');
  const coverage = { start: instant(value.coverage.start, 'coverage start'), end: instant(value.coverage.end, 'coverage end'),
    completeness: text(value.coverage.completeness, 'coverage completeness'), basis: text(value.coverage.basis, 'coverage basis') };
  requireValue(coverage.completeness !== 'complete', 'Gmail metadata must keep its partial or unknown completeness.');
  const rows = array(value.observations, 'Gmail observations');
  requireValue(rows.length <= 1000, 'Gmail metadata exceeds its bounded run.');
  const address = (item: unknown) => {
    const key = emailKey(text(item, 'email address'));
    requireValue(key !== null, 'Gmail metadata holds only plain email addresses.');
    return key;
  };
  const observations = rows.map(row => {
    object(row, ['timestamp', 'direction', 'from', 'to', 'cc', 'batch'], 'Gmail observation');
    requireValue(row.direction === 'sent' || row.direction === 'received', 'Gmail direction must be sent or received.');
    return { timestamp: instant(row.timestamp, 'Gmail timestamp'), direction: row.direction, from: address(row.from),
      to: array(row.to, 'Gmail recipients').map(address), cc: array(row.cc, 'Gmail copy recipients').map(address) } as GmailRow;
  });
  return { account, coverage, observations, originalBytes, inputDigest };
}

export { readGmailMetadata };
export type { GmailSource, GmailRow };
