export interface Revision {
  id: string;
  supersedes: string | string[] | null;
}

export interface Address {
  type: string;
  value: string;
}

export interface SourceRecord {
  type: string;
  idKind?: string;
  isSelf?: boolean;
  deleted?: boolean;
  displayName?: string;
  addresses?: Address[];
  kind?: string;
  title?: string;
  threadKey?: string;
  identityKey?: string;
  validFrom?: string;
  validUntil?: string;
  senderKey?: string;
  timestamp?: string;
  channel?: string;
  eventType?: string;
  recipients?: { identityKey: string; role: string }[];
  classification?: string;
  targetKey?: string;
  start?: string;
  end?: string;
  completeness?: string;
  basis?: string;
}

export interface Provenance {
  connector: string;
  inputDigest: string;
  originalId?: string;
  sourceRecord?: Record<string, unknown>;
  pageCursor?: string;
  retrievedAt?: string;
  overlapReview?: string;
  context?: { threadRevision: string; threadKind: string };
}

export interface RecordEntry {
  record: SourceRecord;
  provenance?: Provenance[];
  revisions?: (Revision & { record: SourceRecord; provenance: Provenance[] })[];
  revision?: string;
  editedBy?: string[];
  deletedBy?: string[];
}

export interface CanonicalPerson {
  label?: string;
  mergedInto: string | null;
  noteRefs?: string[];
}

export interface Household {
  label: string;
  people: string[];
}

export interface Group {
  label: string;
  households: string[];
}

export interface CuratedNote {
  originalText: string;
  capturedAt: string;
  encounteredOn: string | null;
  households: string[];
  groupId?: string;
}

export interface Connection {
  occurredOn: string;
  capturedAt: string;
  households: string[];
  groupId: string | null;
  noteIds: string[];
  context: string;
}

export interface Rhythm {
  intervalDays: number;
  reason: string;
}

export interface PrayerRequest {
  text: string;
  noteIds: string[];
  capturedAt: string;
  recordedOn: string;
  updates: {
    id: string;
    text: string;
    noteIds: string[];
    status: string | null;
    statusConfirmed: boolean;
    capturedAt: string;
  }[];
  originalNotes?: Record<string, CuratedNote>;
  status?: string;
  needsStatusReview?: boolean;
}

export interface FollowUp {
  text: string;
  noteIds: string[];
  dueOn: string | null;
  completedOn: string | null;
  householdId: string;
}

export interface Deferral {
  until: string;
  reason: string;
}

export interface Checkpoint {
  periodSignature: string;
  nextCursor: string | null;
  finished: boolean;
}

export interface SourceReport {
  source: string;
  account: string;
  connector: string;
  status: string;
  retrievedAt: string | null;
  observedOnly?: boolean;
  error?: { code: string; message?: string };
  upstreamErrors?: { code: string; retryable: boolean }[];
  reason?: string;
  coverage?: Coverage;
  lastKnownCoverage?: Coverage;
}

export interface ReviewRequest {
  schemaVersion: number;
  dataClass: string;
  collection: string;
  output: string;
  expectedRevision?: number;
  collectionDigest?: string;
  reason?: string;
  operations?: Record<string, unknown>[];
}

export interface MappingView {
  people: Record<string, CanonicalPerson>;
  assignments: Record<string, string>;
  households: Record<string, Household>;
}

export interface ReviewResult {
  heading: string;
  file?: string;
  revision: number;
  collectionDigest: string;
  view?: MappingView;
  identities?: (SourceRecord & { key: string; personId: string; suggestedPersonId: string })[];
  changedIdentityKeys?: string[];
  unassignedPersonIds?: string[];
  inactiveIdentityKeys: string[];
  sources: SourceReport[];
  reconciliationRequired: boolean;
  excludedIdentityKeys: string[];
  collisions: { key: string; revisions?: string[] }[];
  unresolvedTargets: string[];
  pendingTargets: string[];
  exitCode: number;
}

export interface HandoffRecord {
  id?: string;
  idKind?: string;
  revision?: Revision;
  isSelf?: boolean;
  deleted?: boolean;
  displayName?: string;
  addresses?: Address[];
  kind?: string;
  title?: string;
  threadId?: string;
  identityId?: string;
  validFrom?: string;
  validUntil?: string;
  senderId?: string;
  timestamp?: string;
  channel?: string;
  eventType?: string;
  recipients?: { identityId: string; role: string }[];
  classification?: string;
  targetId?: string;
}

export interface Coverage {
  start: string | null;
  end: string | null;
  completeness: string;
  basis: string;
}

export interface HandoffPage {
  cursor: string | null;
  nextCursor: string | null;
  retrievedAt: string;
  identities: HandoffRecord[];
  threads: HandoffRecord[];
  memberships: HandoffRecord[];
  events: HandoffRecord[];
  threadCoverage?: (Coverage & { threadId: string })[];
}

export interface Handoff {
  schemaVersion: number;
  dataClass: string;
  source: string;
  account: string;
  connector: string;
  coverage: Coverage;
  pages: HandoffPage[];
  errors?: { code: string; retryable: boolean }[];
  textArchive?: { profile: string; archiveRef: string; sha256: string; ledgerDigest: string };
  whatsappArchive?: { profile: string; threadId: string; archiveRef: string; sha256: string; ledgerDigest: string; metadataDigest: string };
}

export interface RequestedSource {
  source: string;
  account: string;
  connector: string;
  mode: string;
  input?: string;
  status?: string;
  reason?: string;
}

export interface CollectionRequest {
  schemaVersion: number;
  dataClass: string;
  period: import('./collect.ts').PeriodRequest;
  output: string;
  sources: RequestedSource[];
  resume?: boolean;
  maxPages?: number;
  overlapReview?: {
    revision: string;
    reviewedAt: string;
    basis: string;
    mappings: { source: string; account: string; connector: string; type: string; id: string; targetId: string }[];
  };
}
