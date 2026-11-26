# Heartbeat contacts: shared technical contracts

[Product](contacts-store-spec.md), [stable register](contacts-work-items.md),
[architecture/storage](../architecture.md), [local workflow](contacts-local-workflow.md),
[provenance](../provenance.md). CONTACTS IDs, contacts-* skills and schema names
remain stable. Bootstrap is integrated into main; subsequent implementation is
not authorization for private source access.

## Shared operating rules

Every contacts-* skill and companion contract incorporates this section.
[AGENTS.md](../../AGENTS.md) governs delivery; [CONTACTS-010](../privacy.md)
governs privacy, not engineering history.

### Privacy and scope

Owner-approved metadata categories do not approve exact source/account or EACH
real run (including replay/resume/changed bounds). Real artifacts require verified
Windows-user ACL/encryption, this-computer storage outside Git/sync, backup
exclusion and 12-month deletion across inputs/provenance/cursors/derived files.
Ignored `.private\contacts` permits synthetic artifacts, not verified real storage.
No importer/converter/downstream approval flag bypasses private guards.
Never relabel real input synthetic or share private manifests/configuration/logs/
IDs/exports/notes/maps in Git, chat, PRs, CI or remote AI.

No implicit account/device/backup/private-browser/other-person access,
credential/cookie/password acquisition, bridges, pairing, sending/source writes
or schedules. Raw exports/Without Media still contain content; transient
projection and private notes/prayer/wording need separately approved boundaries.
Keep development, examples, checks and review synthetic/account-free.
No hosting/backend/multi-tenancy/product-account or deployment stack.

**Manual V0 exception:** [contacts-retrieve](contacts-manual-retrieval.md) may use
an inspected available source-API metadata tool, normal client auth and per-run
owner approval with verified private local output. No new connector/privacy
platform/scheduler is required. It ends at local handoff, **not private import,
aggregation or rendering**. Source-API retrieval differs from remote-AI
processing; Muse/tool name alone proves neither supported fields nor permission.

### Source workflow

Establish stable source/account namespace, interval/IANA zone/as-of, self evidence,
output and checkpoint scope. Tool discovery, names, narrative/search estimates,
browser success or business APIs do not prove a callable personal source.
Preserve original IDs/timestamps/roles/membership/provenance; missing IDs need
reviewed labeled local strategy. One message is one event, never group/recipient
fan-out. Unknown thread kind stays unknown; membership/contact presence is not
activity. Never merge names or infer households/beliefs/neglect from volume.

Every requested source is explicit: unavailable `requires_setup` or unsupported
format with reason, never omission/empty success. Immutable replay differs from
changed/overlapping exports; reviewed connector translations cannot override
stricter native snapshot bindings. Failed checkpoints never advance; file/token
exhaustion proves no upstream completeness or live synchronization.

### Local execution and interpretation

Paths resolve relative to each request unless its source contract explicitly
specifies otherwise. Pin exact collection bytes and mapping revision; no latest/
stale/empty fallback. Reports are immutable, fresh-output generations. Keep
inputs unchanged; inspect errors, status and limits. Confirm recorded process
stopped before removing only exact stale locks/temps, never store/root deletion.

CLI **0** = complete declared workflow evidence, not live access; **2** = usable
partial result/limits; **1** = fatal failure, not usable empty success.
Exact zero requires `certainty:"exact",total:0`; missing buckets remain unknown,
incomplete positive counts lower bounds. Preserve filters/bounds/zone/as-of,
current-day state, digest/revision, exclusions/audit, freshness/coverage/errors
and unresolved/inactive references in every downstream view. Later retrieval
is not historical reconstruction. Observed activity never resets confirmed
meaningful-connection dates or becomes relationship quality.

## Invocation and capability state

Node 20.11.0+ TypeScript with pinned tsx, standard-library local JSON scripts and
independent `.github/skills/<name>/SKILL.md`; [development](../development.md)
defines checks. Fresh synthetic demo/replay:

```powershell
npm run contacts:collect -- --demo --output .private\contacts\demo-001
npm run contacts:collect -- --request .private\contacts\demo-001\request.synthetic.json
```

Demo writes five handoffs/request/collection. Collection validates normalized
metadata; native acquisition/conversion is separate.

| Source skill | One source contract / current synthetic route |
| --- | --- |
| contacts-google-identities | [011/012 Google](contacts-google-capability.md): contact-only People mock transport, sync generations and staged revisions, no HTTP/OAuth. |
| contacts-email-activity | [013/014 email](contacts-email.md): gmail.metadata fixture transport, no search q; native list cursor and partial coverage, no HTTP/history sync. |
| contacts-text-activity | [015/016 texts](contacts-text-messages.md): selected Android/SyncTech XML SMS/MMS with explicit transport/SIM/thread evidence; no RCS/iMessage/native alternatives or real device validation. |
| contacts-messenger-activity | [017/018 Messenger](contacts-messenger.md): declared JSON snapshot shards/local IDs, strict account-level overlap gate; no personal reader/encrypted-backup certification. |
| contacts-whatsapp-activity | [019/020 WhatsApp](contacts-whatsapp-format-gate.md): selected synthetic iOS TXT, reviewed boundary/sender/zone ledger and account/thread binding; no certified producer/live route. |

All five support synthetic normalized import; no existing CLI supplies live
transport. Manual V0 availability is separately inspected each run.

## Request contract

Strict schemaVersion 1: dataClass synthetic/private (private disabled), period,
output, sources, optional resume/maxPages/overlapReview. Mixing store classes or
unknown/body/credential/approval fields fails. Desired sources:
google-contacts/email/text-messages/messenger/whatsapp; stable account is upstream
namespace, connector acquisition route. Modes metadata-import (input path) or
unavailable (requires_setup/unsupported + reason).

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "period": {"preset": "7d", "timeZone": "America/Los_Angeles", "asOf": "2026-11-24T20:00:00Z"},
  "output": ".",
  "resume": false,
  "maxPages": 10,
  "sources": [
    {"source": "email", "account": "fixture-account", "connector": "synthetic-handoff", "mode": "metadata-import", "input": "email.synthetic.json"},
    {"source": "messenger", "account": "fixture-messenger", "connector": "none", "mode": "unavailable", "status": "requires_setup", "reason": "No verified authorized personal reader."}
  ]
}
```

Private denial occurs before handoff/output access, even unavailable-only
requests. Runtime failed/partial sources remain in manifest. collected describes
declared snapshot coverage, not independent upstream audit.
maxPages is positive per-source budget. Resume requires same source/account/
connector/resolved period/as-of and supplied saved cursor. Changed period needs
resume:false; finished-source replay starts again, deduplicates, not fresh fetch.
Managed CONTACTS-032 stores use operations refresh/resync for retention checks.

### Period semantics

7d/30d = current selected-zone calendar day plus preceding 6/29, ending at
required asOf, current day partial. Use local calendar boundaries through Intl,
not fixed N*24 hours across DST. custom requires offset-bearing start/end,
timeZone/asOf; nonempty start-inclusive/end-exclusive, end <= asOf.
Reject nonexistent start dates, never shift them. Persist resolved UTC bounds/
zone/preset/as-of; collection retains instants, downstream applies filters.

## Adapter/handoff contract

Envelope: schemaVersion, dataClass, source/account/connector, coverage,
optional sanitized errors `[{code,retryable}]`, pages. Each page has cursor/
nextCursor (null at boundaries), retrievedAt and all four arrays, even empty:

| Record | Fields / invariants |
| --- | --- |
| Identity | id, idKind provider/local, explicit isSelf; optional displayName/addresses `{type:email/phone,value}`. No inferred self/canonical match. |
| Thread | id/idKind, kind direct/group/broadcast/unknown; optional synthetic title, not permission for real content. Direct requires exactly self and peer at event time. |
| Membership | threadId/identityId resolve already or in page; optional half-open validFrom/validUntil. Unbounded legacy membership is not historical roster certification. |
| Event | id/idKind, eventType message/reaction/membership/edit/deletion, threadId, senderId (nullable only non-message), timestamp <= retrieval, channel, recipients, classification. Messages need known sender; edits/deletions need targetId. |
| Recipient/class | Identity + to/cc/bcc/recipient; interpersonal/bulk/automated/unclassified retained. Reducer discloses exclusions; native email classification is separately evidenced. |
| Coverage | Nullable start/end, completeness complete/partial/unknown, explicit basis. Complete identity snapshots may have null temporal bounds; activity completeness needs requested interval and current included-thread evidence. |

Channels email/sms/mms/rcs/imessage/messenger/whatsapp. Google has no threads,
memberships/events. Strict normalized allowlist rejects vendor/content/credential
fields. Verified complete empty terminal handoff differs from missing file.
Upstream errors retain partial status even with terminal cursor.

### Identity, overlap, and mutation

Keys JSON tuples `[source,account,recordType,originalId]`; membership keys include
thread/identity. Provider IDs remain original; stable local IDs carry acquisition
evidence. Same-ID replay deduplicates and accumulates provenance. Different
connectors exposing same source need reviewed upstream namespace/ID translations,
not text/time/name heuristics; separate cross-channel messages stay separate.

[CONTACTS-021](contacts-source-revisions.md) owns append-only revision DAG,
tombstones, mutation targets, historical membership, per-thread evidence and
immutable connector-specific overlapReview. Same ID/revision conflict fails page;
branches/broken present targets set reconciliationRequired. Absent historical
targets are informational pending links. Revisions/mutations are not extra
messages and never overwrite curated files. Text/Messenger/WhatsApp native
bindings remain independent hard gates even with shared translations.

Use `readCollection` from collection-store.ts to expand compact
revision-references-v1 or legacy snapshots; read current reconciliation projection,
not first raw observation. Digests bind exact disk bytes, not expanded JSON.
Provenance includes connector/input SHA-256/page/retrieval and observed event-time
thread version. IdentityMappingRevision remains null in collection; separate
[022 overlay](contacts-identity-review.md) pins exact bytes/revision and preserves
unresolved/inactive identities, explicit review/refresh and split/undo.

## Storage, atomicity, and recovery

collection.json atomically combines records/revisions/reconciliation/checkpoints/
manifest/history and optional archive/operations state. Exclusive collection.lock;
validate page in memory, flush same-directory temp, atomically replace page and
cursor together. Failed pages retain checkpoints; committed prior/other-source
pages survive. Fatal I/O aborts. Interrupted manifest is in_progress, processed
source partial, unprocessed sources pending.

Output inside checkout only ignored .private/contacts after link resolution;
tracked/docs/assets/data/dist paths fail. External synthetic output is not real
protection certification. No native raw-data copy or force-add. Confirm dead
writer, remove exact stale lock, resume original coherent request/handoff.
Temps are not snapshots; local rename/POSIX modes certify neither network
filesystems, full power-loss durability nor Windows controls.

[032 operations](contacts-source-operations.md) retains maintenance/cutoff/
deletion time fences and exact pending purge inventory. Whole-cache purge
removes metadata/provenance/reviews/archives/history/cursors/derived copies,
preserves separately located curated files and resumes explicitly without
restoring erased data. Pending purge blocks import; no schedule/private enabling.

## Manifest and downstream handoff

Manifest preserves data class/time/period, all requested source/account/connector
statuses/coverage/basis/retrieval/cursor/terminal/errors, page/duplicate counts,
unresolved identities and limitations; CLI manifest/paths are private too.
Terminal pagination alone is not collected history. [Workflow](contacts-local-workflow.md)
maps current review/reducer/summary/graph/curated commands and input pins;
renderers use saved shared report, never independent narrative counts.
`npm run ci` exercises schema, synthetic multi-source replay/resume/rollback,
coverage/unknowns, DST/custom periods, privacy/output/locks and CLI 0/2/1.
