# Heartbeat cross-source aggregation

CONTACTS-023 implements the pure `aggregate(collection, mapping, options)`
reducer in `scripts/contacts/aggregate.ts`, a local `contacts:aggregate` CLI,
and the independent `contacts-aggregate` skill. It consumes snapshots; it never
collects, connects, edits source/mapping records, renders UI, sends, or schedules.
The [product](contacts-store-spec.md), [revision](contacts-source-revisions.md),
[identity-review](contacts-identity-review.md), and
[shared operating rules](contacts-technical-spec.md#shared-operating-rules)
remain authoritative.

## Input and local invocation

First collect synthetic handoffs and save an explicit identity review. Prepare
an untracked request next to those snapshots:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "collection.json",
  "mapping": "identity-review.json",
  "identityMappingRevision": 1,
  "period": {
    "preset": "7d",
    "timeZone": "America/Los_Angeles",
    "asOf": "2026-11-24T20:00:00Z"
  },
  "output": "aggregation-001"
}
```

```powershell
npm run contacts:aggregate -- --request .private\contacts\demo-001\aggregate.synthetic.json
```

Paths resolve relative to the request. An optional `channels` array selects
distinct values from `email`, `sms`, `mms`, `rcs`, `imessage`, `messenger`,
`whatsapp`; omission selects all. Empty/unknown/duplicate filters fail.
Period resolution reuses the collector's 7d/30d/custom, IANA-zone, half-open
contract, including partial current days and DST. Source instants are filtered
before date grouping. The mapping revision must be explicitly present in saved
review history and bind the SHA-256 of the **exact collection file bytes**.
The selected history entry's `after` view is used, not the latest mapping.
An old revision works only with its bound snapshot. New snapshots need explicit
review/rebinding, even if identities did not change.

Pure callers supply `collectionDigest` in options, along with
`identityMappingRevision`, `period`, and optional `channels`. They are responsible
for hashing the exact input bytes; the reducer itself performs no I/O, clock,
randomness or mutation. Use the CLI for file binding. Source snapshots must come
from the current collector with CONTACTS-021 reconciliation; there is no
first-observation/raw-record fallback.

Output is one structured `aggregates.json`, headed **Heartbeat cross-source
aggregation**, not a rendered summary or graph. It remains untracked under
`.private/contacts/` or an explicitly chosen external local synthetic directory.
The CLI flushes a same-directory temporary file, publishes through an atomic
no-replace hard link, then removes that temporary link. Existing reports,
including symlinks, fail rather than being overwritten; choose a fresh report
directory for another run. A filesystem without same-directory hard links fails
explicitly. Crash-left `aggregates.<uuid>.tmp` files are not input reports;
after verifying that writer stopped, remove only the named temporary artifact.
This is not Windows ACL/encryption verification or real-data storage approval.

Private requests fail before snapshot/output access; private collection
snapshots fail before mapping reads. Exit **0** means complete declared
coverage for the filtered activity with no unresolved identities/references or
unavailable source statuses. **2** means a usable but explicitly partial report
was saved. **1** means fatal validation/input/storage failure; no successful
report is claimed. A failed immutable retry leaves the earlier report unchanged.

## Shared output and reconciliation

| Field | Contract |
| --- | --- |
| `period`, `filters`, `collectionDigest`, `identityMappingRevision` | Resolved bounds, zone/as-of/current-day state, actual channels/classifications/deletion policy, and exact snapshot/mapping binding. |
| `sources` | Original per-source/account/connector coverage, retrieval time, pagination, status, errors, reason and thread coverage. Retained accounts absent from the current manifest are explicitly `not_requested` with unknown coverage. No family not requested or observed is claimed covered. |
| `totals`, `perSource`, `perChannel`, `perThread`, `daily` | Included interpersonal message volumes; dimension totals reconcile to the included source-event ledger. Global/channel/thread/day stats include observed sent/received/other, distinct active dates, active-day count and latest observed instant. `perSource` is source/account, deduplicated across connectors; individual connector coverage stays in `sources`. |
| `messages` | `{observed, total, certainty}`: exact total (including known zero) only with complete evidence, otherwise `total:null`, `lower_bound` for positive observations and `unknown` for none. A numeric observed zero never claims an unknown source is inactive. |
| `people`, `personAliases` | Stable reviewed canonical IDs, current/inactive source keys, cohort state, observed direct sent/received dates/counts, both-posted dates, actual group-post counts, shared group dates, role exposure and latest observed activity. Alias references are preserved. Known inactive and unassigned people remain in the cohort; no fabricated activity. |
| `membershipLinks` | Source membership with original validity intervals and reviewed person (or null). Membership is not an event or evidence of posting. |
| `events`, `exclusions`, `audit` | One ledger row per unique namespaced source event (including collision placeholders), current revision, disposition and any person attribution. Exclusion partitions cover channel filter, outside period, nonmessage, bulk, automated, unclassified and unresolved revision. Raw duplicate provenance is disclosed as `repeatedEventEvidence`, not added volume or an invented replay count. |
| `unresolvedIdentities`, `unresolvedReferences`, `reconciliation`, `limitations` | Unreviewed current identities, inactive/missing event identities or unavailable historical thread context, source collisions, broken targets and informational historical pending targets remain visible. Missing identities are not guessed by name. |

`audit.uniqueSourceEvents = includedMessages + excludedEvents`; each channel,
thread, date and source/account partitions the same included events. Repeated
imports/provenance, explicit revisions, edit/deletion events and reviewed
connector translations do not multiply messages. Different sources/accounts
remain distinct even when their local IDs match. Group/person attributions and
recipient roles are **not additive message partitions**.

Activity dates are unions of local calendar dates across channels. The two
fall-back instants of the same wall-clock time remain distinct messages on one
date. No fixed 24-hour day arithmetic or sum of per-channel day counts is used.
`daily` and `perThread` emit observed-message buckets only; absent buckets are
not implicit zero. CONTACTS-024 may expand a calendar/cohort using this coverage.

### Direct, group, addressing and message classification

Direct activity requires CONTACTS-021's **event-time** `threadKind: direct`
provenance, reviewed active participants, and a primary (`to`/`recipient`) role
between self and peer. Current thread metadata cannot retrospectively convert
an earlier group message into direct contact or vice versa. Missing/contradictory
event context stays unknown and yields a partial report. CC/BCC-only receipt
never becomes direct activity. Broadcast/multi-To/group addressing remains
role exposure, not separate direct exchanges with every recipient.

Only the actual peer sender contributes `group.observedPosted` and group active
dates. Passive members and recipients do not. `sharedParticipationDates` requires
both self and that peer to post in the **same thread on the same local date**,
then unions those dates across threads. `groupOnly` means observed group posting
without observed direct messages in the selected dataset, not proof no direct
history exists. Group co-participation is not evidence of a direct exchange.
Recipient roles count each canonical peer at most once per event/role, preserving
To/CC/BCC/recipient separately without counting messages again.

Only `message` + `interpersonal` enters volumes. Bulk/automated messages are
excluded and counted; unclassified messages are excluded and disclosed, making
the affected interpersonal totals lower bounds even with complete acquisition.
Reactions, membership/system events, edits and deletions are nonmessage exclusions.
Deleted originals remain **observed historical messages**, flagged and counted
in `deletedMessagesIncluded`; a deletion never adds another message. Snapshot
revisions/classification apply, not a reconstruction of what was known at as-of.
Historical pending targets remain informational, while collisions/broken links
make the affected account's totals uncertain.

### Coverage interpretation

Exact activity totals require all selected account/connector reports to be
`collected`, terminal, error-free, with declared complete interval bounds
covering this requested period and no later than retrieval. In per-thread mode,
every known thread needs covering complete evidence; inherited declarations
retain their original label. A wider/new period cannot reuse narrower coverage
as complete. Partial/failed/unavailable/absent coverage remains unknown or lower
bound, including retained observations from an account not in this run.
This deliberately conservative rule does not upgrade a partial source merely
because a narrower report might have enough evidence.

Google identities never enter activity denominators. Unavailable identity
sources still make the overall report partial and remain disclosed. Per-channel
totals for an entirely unrequested channel are unknown. All source statuses
survive channel filtering; a numerical filtered total can be exact while the
report still exits 2 for an unavailable source outside that filter.
Person direct totals use the global filtered coverage and resolved identity
references conservatively, not an
assumption that a missing channel could not contain that person's interactions.
`activeDates`, `latestObserved` and all direction/role counts are explicitly
observed values, not estimates of complete history or relationship quality.

## Delegated engineering decisions (2026-11-25)

These are engineering defaults for owner review, not privacy/access consent.

| Decision / rationale | Alternatives / assumptions | Validation / revisit |
| --- | --- | --- |
| Separate dependency-free pure reducer and thin immutable JSON CLI; preserve collection storage and behavior. | Rejected reimport, UI/backend, new database or mutable report cache; assumes the existing single-user snapshots suffice. | Synthetic integration uses actual collect/review, proves input byte preservation, deterministic repeat/order independence and CLI 0/2/1 exits. Revisit only for measured snapshot size or CONTACTS-024 output needs. |
| Pin explicit review-history revision and exact collection bytes; use current reconciled source revisions and event-time thread provenance. | Rejected latest-mapping defaults, name matching, raw first observation, or current thread-kind fallback; snapshot-as-of is not historical reconstruction. | Synthetic explicit/historical revision binding, aliases, changed thread metadata, revised events, collisions and inactive/unreviewed links. Revisit time travel only with a specified revision-time model. |
| Count observed deleted originals, exclude mutation/system events; bulk/automated/unclassified are separate exclusions. | Dropping deleted messages would erase evidence of observed activity; counting mutations would inflate frequency. Unknown classification cannot certify complete interpersonal totals. | Ledger partition equality, deleted-original count and explicit classification cases. Revisit only with a documented product metric/deletion/retention change; owner-approved retention still governs future private data. |
| Primary-role direct events only; group sender participation and same-thread/date shared posting; passive membership stays separate. | Rejected CC/broadcast fan-out or pairwise expansion of groups. Assumes source direct-thread validation and explicit self identity. | To/CC, broadcast, group-only/passive members and cross-thread shared-day negative fixtures. Revisit direct-email policy only with an explicit replacement contract. |
| Conservative coverage bounds and no implied empty daily/thread buckets; active days are date unions across channels. | Rejected summed days, page exhaustion as completeness, or zero for missing sources. Narrow reports do not automatically promote partial imports. | Half-open instants, DST repeated hours, cross-channel date unions, known-zero/unavailable/lower-bound, thread coverage and widened-period fixtures. CONTACTS-024 may add coverage-aware calendar buckets without changing these counts. |
| Synthetic-only denial before private input/output access; generated output never tracked. | No approval assertions or arbitrary access to devices/accounts/credentials/remote AI; local output rules are not real-data controls. | Private request/snapshot, unsafe path, immutable retry and unchanged-input fixtures. Revisit only after separately authorized sources/runs and enforceable CONTACTS-010 controls. |
