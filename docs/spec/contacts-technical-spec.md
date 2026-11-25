# Heartbeat contacts collection: initial technical approach

Migrated from caltseng/churchtree PR #68, exact merge
`2b222e03ccbe819764eb3a133c318035945f1eac`; see
[provenance](../provenance.md). `caltseng/heartbeat` is now authoritative.
Stable CONTACTS IDs, collection skill names and JSON schema are preserved.
Remaining CONTACTS execution is blocked until this bootstrap is verified checked in.

Status: architecture with a runnable metadata-handoff slice and synthetic-only
Google and Gmail acquisition adapters (CONTACTS-012/014). No accounts are
connected, and no live network transport is implemented.
CONTACTS-016 adds a separate [synthetic-only selected text XML converter](contacts-text-converter.md),
not real archive access. See the [product specification](contacts-store-spec.md) and
[work items](contacts-work-items.md).

Confirmed execution boundary: **one user, local tool, local store in a private
location**. Prove the flow in Heartbeat before polished design. No hosted
website/dashboard, cloud backend, multi-tenancy, deployment, or product account
system is in scope. Authorized source-account reads remain part of eventual
collection; local-only describes this tool's execution/storage/presentation.

## 1. Repository fit and first vertical slice

Heartbeat uses dependency-free Node.js 20+ CommonJS scripts and skills in
`.github/skills/<name>/SKILL.md`. This bootstrap migrates only the existing
CONTACTS-001 through CONTACTS-004 baseline from the immutable source merge.
There is no website, backend, OAuth service or deployment stack. Reuse Node's
standard library and skill format; do not import the source repository's website
pipeline or add a public route. The JSON snapshot below is the implemented local
persistence approach, not a reason to provision a server or database service.
See [architecture](../architecture.md), [privacy](../privacy.md) and
[development/CI](../development.md) for executable commands and local boundaries.

The smallest delivered slice is:

1. Invoke `contacts-collect` with explicitly authorized sources and an interval.
2. Delegate acquisition instructions to the five focused source skills.
3. Use a separately authorized, already available tool to produce the metadata
   handoff below, or explicitly record that source as unavailable. Discovery is
   not authorization to connect an account or install a bridge.
4. Run `scripts/contacts/collect.cjs` to validate and durably import handoff pages.
5. Inspect `collection.json`: one machine-readable snapshot containing both its
   manifest and normalized, namespaced records. Any missing source remains visible.

Steps 3-4 are intentionally separate: the implemented adapter is a **local
metadata-handoff reader**, not a fetcher for five remote APIs. It currently reads
only synthetic contract-conforming input. CONTACTS-010's
[owner-approved policy](../privacy.md) does not authorize an account or run;
private requests fail closed until local controls and approvals can be verified.
Arbitrary vendor exports are not contract-conforming by default. A source skill
describes acquisition/normalization and the setup gate; it
does not manufacture endpoint access. Collection is separate from future identity
review, deterministic aggregation, and rendering.

## 2. Invocation and capability state

Run the account-free demonstration in a **fresh** output folder:

```powershell
npm run contacts:collect -- --demo --output .private\contacts\demo-001
```

This writes five labeled synthetic handoffs, `request.synthetic.json`, and
`collection.json`. It never uses the network, credentials, devices, browser sessions,
or real contacts. Rerun its generated request to exercise idempotency:

```powershell
npm run contacts:collect -- --request .private\contacts\demo-001\request.synthetic.json
npm run test:contacts
```

For prepared synthetic collection, use the same `--request` command. Private
requests are disabled, including unavailable-only manifests, and exit 1 without
writing output. Inputs/output resolve relative to the request
file. Every desired source must have an entry, even if it is unavailable.

| Source skill | Implemented, callable now (synthetic only) | Setup/access gate and limitations |
| --- | --- | --- |
| `contacts-google-identities` | Validate/import identities; `contacts:google` exercises the selected People route using synthetic pages | [CONTACTS-011/012](contacts-google-capability.md), with `contacts.readonly` and contact-only fields. No authorized Google tool, network transport or OAuth client ships. Private acquisition is disabled before output access (exit 1); revisions/deletions stay private and partial pending 021. Snapshot completeness is not historical completeness. |
| `contacts-email-activity` | Validate/import email metadata handoffs; [014 synthetic native Gmail adapter/CLI](contacts-email-adapter.md) | [CONTACTS-013](contacts-email-access.md) selects Gmail API `gmail.metadata` enumeration (no search `q`), not connected access. 014 implements injected metadata transport, list-token paging and conservative role/class normalization; no HTTP/OAuth transport or private runs. Native cursors stay separate and coverage stays partial. |
| `contacts-text-activity` | Validate/import SMS/MMS/RCS/iMessage handoffs; [synthetic-only selected XML conversion](contacts-text-converter.md) | [CONTACTS-015](contacts-text-format-gate.md) selects Android 14 / SyncTech 10.30.009 full XML v1 for SMS/MMS with explicit protocol evidence. CONTACTS-016 implements that synthetic profile only; no device/actual export is verified. RCS/iMessage/other native backups remain unsupported; private conversion fails closed before XML access. |
| `contacts-messenger-activity` | Validate/import personal Messenger metadata handoffs | [CONTACTS-017 selects proposed local JSON snapshot conversion](contacts-messenger-capability.md) for 018; no native converter or structured personal reader is available. Export producer version and encrypted-backup layout remain unverified. Page/business APIs and Muse queries do not establish personal-inbox history; no private session reuse or real-data remote AI processing. |
| `contacts-whatsapp-activity` | Validate/import WhatsApp metadata handoffs | [CONTACTS-019](contacts-whatsapp-format-gate.md) selects iOS Without Media UTF-8 TXT profile `whatsapp-ios-txt-metadata-v1`, synthetic design only. CONTACTS-020 converter is not implemented; native TXT is unsupported and private imports fail closed. Archive-local IDs, reviewed overlap/identity ledgers and evidenced source zones are required; no producer certified or personal tool connected. Approved metadata policy does not permit raw export/content processing. Business Groups API access does not establish existing personal-group access. |

All five are **synthetic-import-capable**, not live-connected. The selected synthetic text
converter is separate from ingestion; other native conversion and live acquisition
remain distinct work items. Beeper and direct API credentials
are not installed or assumed. Muse UI evidence does not establish structured
personal Messenger access. Muse/remote-AI acquisition must not process real
collection data under the approved policy. Separately approved source API
retrieval is distinct from remote-AI processing; the Heartbeat model and local
visualization remain here.

## 3. Request contract

The [CONTACTS-032 operations contract](contacts-source-operations.md) layers
explicit synthetic refresh/resync, stale-source inspection and managed-cache
retention/deletion/recovery over these same handoffs. It does not change the
source capability matrix or authorize private runs. Managed stores require
`contacts:operate` refresh/resync so their retention clock is checked.

Example with one available synthetic input and one explicitly unavailable source:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "period": {
    "preset": "7d",
    "timeZone": "America/Los_Angeles",
    "asOf": "2026-11-24T20:00:00Z"
  },
  "output": ".",
  "resume": false,
  "maxPages": 10,
  "sources": [
    {
      "source": "email",
      "account": "fixture-account",
      "connector": "synthetic-handoff",
      "mode": "metadata-import",
      "input": "email.synthetic.json"
    },
    {
      "source": "messenger",
      "account": "fixture-messenger",
      "connector": "none",
      "mode": "unavailable",
      "status": "requires_setup",
      "reason": "No verified authorized personal-inbox tool."
    }
  ]
}
```

`dataClass` distinguishes `synthetic` and `private`; mixing classes in a store is
rejected. The schema preserves both labels for compatibility, but the current
importer rejects ALL private requests with `private_collection_disabled` before
handoff reads or output writes. Approval fields/flags are not part of this contract.
Source families are `google-contacts`, `email`, `text-messages`, `messenger`, and
`whatsapp`. Account values are reviewed, stable upstream account references, never
tokens, passwords, or connector-specific aliases. Connector names identify the
acquisition route and are separate from source identity.

`mode` is `metadata-import` or `unavailable`. Unavailable states are
`requires_setup` or `unsupported`, with a clear reason. Runtime import errors use
`failed`; successful but incomplete imports use `partial`. `collected` means the
supplied metadata snapshot covers the requested interval according to its declared
coverage, not that a remote account is connected or independently audited.
For activity, a source-wide complete interval must be covered by every included
thread; differing or unverified thread histories require partial/unknown source
coverage. [CONTACTS-021](contacts-source-revisions.md) adds explicit per-thread
evidence and conservative completeness checks; legacy inherited source-wide
declarations remain labeled as such.

`maxPages` is an optional positive per-source page budget. `resume:true` starts at
the last committed cursor for the same source/account/connector and exact resolved
period. A changed interval or as-of instant requires `resume:false`; existing
records remain and replay deduplicates them. An already finished source replays
from the beginning rather than claiming that an old snapshot is freshly fetched.
The handoff must contain the saved cursor; otherwise collection reports an error.

### Period semantics

`7d` and `30d` include the current calendar day in the selected IANA time zone
and the preceding 6 or 29 days, respectively. Their exclusive end is the required
as-of instant; label the current day partial. Resolve local dates through
`Intl.DateTimeFormat`, not a fixed `N * 24 hours` subtraction across DST.

`custom` instead requires `start` and `end` ISO timestamps with explicit offsets,
plus `timeZone` and `asOf`. All intervals are start-inclusive/end-exclusive and
must be nonempty with `end <= asOf`. The resolved UTC bounds, selected zone,
preset, and as-of instant are persisted. A nonexistent start calendar day is
rejected rather than silently shifted. Collection retains original event instants;
downstream aggregation, not ingestion, applies interval filters.

## 4. Adapter/handoff contract

An acquisition adapter supplies a JSON envelope:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "source": "email",
  "account": "fixture-account",
  "connector": "synthetic-handoff",
  "coverage": {
    "start": "2026-11-01T00:00:00Z",
    "end": "2026-11-24T20:00:00Z",
    "completeness": "complete",
    "basis": "Synthetic fixture only."
  },
  "errors": [],
  "pages": [
    {
      "cursor": null,
      "nextCursor": null,
      "retrievedAt": "2026-11-24T20:00:00Z",
      "identities": [
        {"id": "self", "idKind": "local", "isSelf": true},
        {"id": "peer", "idKind": "local", "isSelf": false}
      ],
      "threads": [
        {"id": "thread-1", "idKind": "local", "kind": "direct"}
      ],
      "memberships": [
        {"threadId": "thread-1", "identityId": "self"},
        {"threadId": "thread-1", "identityId": "peer"}
      ],
      "events": [
        {
          "id": "event-1",
          "idKind": "local",
          "eventType": "message",
          "threadId": "thread-1",
          "senderId": "peer",
          "timestamp": "2026-11-23T12:00:00Z",
          "channel": "email",
          "recipients": [{"identityId": "self", "role": "to"}],
          "classification": "interpersonal"
        }
      ]
    }
  ]
}
```

Use the demo generator for complete executable examples across all five families.
Input objects use allowlisted fields; unknown fields fail rather than being
silently dropped. The helper is deliberately not a general email/message archive
parser. Do not pass full vendor payloads, bodies, snippets, attachments, subjects,
credentials, access cookies, or raw browser transcripts.

The selected synthetic text converter additionally supplies an optional
`textArchive` binding. The importer validates it and pins the original archive
and reviewed mapping digests for that source/account with its first valid page.
Changed or overlapping archives, changed mappings and unbound legacy text events
fail explicitly; there is no automatic overlap reconciliation. Other handoffs
retain their original contract. See the [converter contract](contacts-text-converter.md)
for the exact fields, private registry, unknown coverage and exit behavior.

| Record | Fields and invariants |
| --- | --- |
| Identity | `id`, `idKind: provider/local`, explicit `isSelf`; optional `displayName` and `addresses: [{type: email/phone, value}]`. Self identity must be established, not inferred from a name. |
| Thread | `id`, `idKind`, `kind: direct/group/broadcast/unknown`; optional `title`. A two-person direct thread must include exactly one self identity and one other identity before direct events are accepted. |
| Membership | `threadId`, `identityId`; both records must already exist or be in this page. Optional `validFrom`/`validUntil` preserve historical half-open intervals. Legacy unbounded records do not establish historical rosters. Membership alone creates no activity. |
| Observation | `id`, `idKind`, `eventType: message/reaction/membership/edit/deletion`, thread, sender (nullable for non-message events), timestamp, channel, recipients and classification. Edits/deletions require `targetId`; unresolved targets stay visible. Messages require a known sender; references must resolve. No event can occur after its retrieval timestamp. |
| Recipient | Identity plus `to/cc/bcc/recipient` role; preserve email roles and never turn a multi-recipient event into one direct message per recipient. |
| Classification | `interpersonal/bulk/automated/unclassified`; collection retains all classes. Later summaries explicitly exclude bulk/automated and disclose unclassified records; no classifier is implemented yet. |
| Coverage | `start/end` (nullable when unknown), `completeness: complete/partial/unknown`, and a human-readable basis. Contact coverage is an identity snapshot, not an activity interval; complete identity snapshots may have null bounds. |
| Error | Optional envelope `errors: [{code, retryable}]`; codes must not contain secret payloads. Upstream errors keep the final source status partial even if its cursor is exhausted. |

Channels are `email`, `sms`, `mms`, `rcs`, `imessage`, `messenger`, and `whatsapp`.
Google contacts must not contain threads, memberships, or observations.
Each page includes all four arrays, even when empty. An explicit empty terminal
page with complete coverage can establish an empty snapshot; a missing file cannot.

### Identity, overlap, and mutation

Stored keys are JSON-encoded tuples `[source, account, recordType, originalId]`;
membership keys include the thread/identity tuple. Provider IDs are never replaced
by display names. If only local IDs exist, label them `local`, preserve them across
reimports of the same acquisition, and retain unresolved matches. Native export
converters must define a stable local-ID strategy before use; matching text or
participant names is not a deduplication strategy.

Overlapping connectors use the same reviewed source/account namespace. Matching
IDs deduplicate with both provenances; different IDs require an explicit private
`overlapReview` before import. Translations are connector-specific and persisted,
not inferred from names, text or timestamps. Separate messages on different
channels remain separate. Unreviewed different IDs do not certify distinct
messages or reconciled cross-connector totals.

Conflicting metadata under the same ID/revision fails the page without replacing
the old record. Optional explicit identity/thread/event revisions preserve an
append-only ancestry and expose branches instead of last-write-wins. Read the
unique current versions through `reconciliation.records`, retaining original
`records` as evidence. Tombstones, mutation targets, historical membership,
per-thread coverage, translation examples and delegated decisions are defined in
the [CONTACTS-021 contract](contacts-source-revisions.md). Edit/deletion/membership
events and revisions are never additional messages. Honor
`manifest.reconciliationRequired` before claiming reconciled output.

Every stored record has provenance containing connector, SHA-256 input digest,
page cursor and retrieval instant; its key supplies source/account/original ID.
Keep the authorized handoff privately if exact digest-to-file reproduction is needed.
Source-opening URLs and provider-native payload archives are intentionally deferred.

No automatic person merge or household inference runs during collection.
`identityMappingRevision:null` and all non-self `unresolvedIdentityKeys` are explicit.
CONTACTS-022 now persists user-reviewed links in a separate synthetic-only
[identity-review overlay](contacts-identity-review.md), with an exact collection
digest, explicit mapping revision, reversible splits/undo and optional curated
households. It never rewrites source evidence or source availability. Real runs
remain blocked pending the separate privacy/source approvals and implementation
of an approved private-run boundary.

## 5. Storage, atomicity, and recovery

Use a private local JSON store for this single-user tool, not a database/server
dependency. Prove acquisition, normalization, summaries and local graph files
before choosing polished UI design; there is no hosted dashboard to deploy.
Default synthetic location is a chosen subdirectory of ignored
`.private/contacts/`; an explicitly selected folder outside this checkout is also
allowed for synthetic runs. Real storage must instead be outside Git worktrees
and cloud-synced folders and pass the approved policy's verification gates.
Outputs within any other checkout path, including `docs/`, `assets/`,
`data/`, and `dist/`, are rejected after resolving existing directory links.
Inputs and manifests remain private even when they contain metadata only.

The collector stores **normalized metadata only**. Native raw exports stay in
their separately authorized private location; do not copy them into the repo.
The synthetic demo inputs are generated at runtime, never acquired from accounts.
Do not force-add private outputs to git or share them in a PR.

`collection.json` contains `records`, per-connector `checkpoints`, `manifest`, and
prior manifests' period/source coverage in `history`, in one generation. Historical
coverage is retained for later comparable-period checks, not reused as current
freshness. An exclusive `collection.lock` prevents concurrent writers.
Each valid page is staged in memory, then written with its checkpoint to a new
same-directory file, flushed, and atomically renamed over the snapshot. A failed
page does not advance its checkpoint. Already committed pages survive later source
failures, and unrelated sources continue. I/O failures abort rather than returning
a success-shaped empty collection.

An interrupted snapshot retains `manifest.status: in_progress`, the processed
source's partial status, and pending entries for all remaining requested sources.
On recovery, first confirm the collector process is no longer running, then remove
only that store's exact stale `collection.lock` and run the matching request with
`resume:true`. Never delete the store to clear a lock. Atomic rename is a
single-host/local-filesystem assumption; network filesystems and full power-loss
durability are not certified. Stale temporary files are not input snapshots.

Node requests owner-only POSIX file/directory modes, not verified Windows ACLs
or encryption. CONTACTS-010 records owner-approved policy for those protections,
retention/deletion and backup behavior; it does not implement their verification
or authorize a real account/run. The private-request guard stays closed until
these controls are implemented and verified. Git ignore and build exclusion are
not access control. See the policy's engineering decisions and revisit conditions.

CONTACTS-032's synthetic `operations` snapshot member holds only maintenance
time/cutoff, an optional deletion time fence and, during interrupted purge, the
pending exact-file inventory. An approved whole-cache purge erases normalized
records, provenance/revisions, history, reviews, archives and cursors together,
then removes inventoried cache/derived files. Curated files are outside purge
targets. Direct import is refused while purge recovery is pending; explicit
operations recovery finishes without restoring erased metadata. The
[managed layout and decision record](contacts-source-operations.md) define this
bounded local lifecycle, not real protection or machine-wide deletion.

## 6. Manifest and downstream handoff

See the [CONTACTS-031 local workflow](contacts-local-workflow.md) for executable
synthetic commands, request-as-configuration, recovery and reserved versioned
handoffs to later identity/reducer/report/graph implementations. Its publication
guard runs in CI without introducing a public build or changing collection v1.

The manifest records data class, collection time, exact period, each requested
source/account/connector, status, coverage/basis, retrieval time, pagination state,
next cursor, duplicate-record count, persisted-page count, upstream errors or
validation failure, unresolved identity keys, and implementation limitations.
The CLI prints the manifest and output path, not message content or full records;
the manifest can still contain private account/identity references.

Exit codes: **0** = every supplied snapshot collected for its declared scope,
**2** = persisted partial collection (including failed/unavailable sources),
**1** = invalid request, storage/locking failure, or unexpected fatal error.
Exit 2 is not success and should not be hidden with a shell success fallback.
No stale previous source status is reused as current evidence.

A terminal cursor proves only completion of supplied pages, not complete upstream
history. Declared coverage must contain the requested activity interval and must
not extend beyond retrieval to get `collected`; contact snapshots are separate.
No numerical person-level interaction summaries are computed yet. Downstream
consumers must treat unobserved values as unknown, source-limited counts as lower
bounds, and interrupted manifests as incomplete.

## 7. Next stages and acceptance

1. **Collection first:** run synthetic five-source imports, replay and resume
   safely; disclose missing tools/formats. Add each real acquisition route only
   after its separate access gate and privacy approval.
2. **Identity and aggregation:** review canonical people mappings; build a pure,
   deterministic reducer over message events and manifest coverage. Preserve
   To/CC roles, group-only participation, direct activity, channel breakdowns,
   active-day unions, exclusions and unresolved records. Reconcile all totals
   before generating narrative or charts.
3. **Future Heartbeat summary and map:** produce shared 7/30/custom datasets as local CLI/file output,
   then a locally generated user-centered
   hub-and-spoke map with labeled frequency bands, visible recency, known people
   without recent observations, and a supporting person-to-thread view. The
   initial proposed radius metric is distinct direct-communication days, not
   emotional closeness. Household rollups deduplicate events. Keep generated
   HTML/SVG/JSON files private and local; no website route, server or hosting.
4. **Opportunities/outliers:** compare a person's own covered baseline or curated
   reconnection rhythm, not population rankings. Never turn absent history or a
   newly disconnected channel into an apparent decline.

`npm run test:contacts` covers synthetic all-source import, cross-connector
deduplication and provenance, replay, page-budget/resume, changed-interval rejection,
failed-page rollback and recovery, body rejection, explicit missing-source states,
empty-versus-unknown history, group/broadcast evidence, event conflicts, DST/custom
periods, lock/output safety and actual CLI exit semantics. No live endpoint
validation is implied. The [work-item register](contacts-work-items.md) makes the
remaining gates, dependencies and objectively checkable deliverables explicit.
