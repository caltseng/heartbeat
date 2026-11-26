# Heartbeat period summary contract

CONTACTS-024 adds `scripts/contacts/summary.ts`, `contacts:summary` and the
focused `contacts-summary` presentation skill. One immutable private local JSON
dataset drives the summary, people table, per-channel counts and daily timeline.
It calls the [CONTACTS-023 reducer](contacts-aggregation.md) directly; it does not
reimport, mutate collection/mapping data, collect, connect, rank relationships or
render a graph. CONTACTS-025 still owns the offline graph. The product, technical,
identity-review and
[shared operating rules](contacts-technical-spec.md#shared-operating-rules)
remain authoritative.

## Invocation and period

After synthetic collection and explicit identity review, save an untracked
`summary.synthetic.json`:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "collection.json",
  "mapping": "..\\reviewed\\identity-review.json",
  "identityMappingRevision": 1,
  "period": {
    "preset": "7d",
    "timeZone": "America/Los_Angeles",
    "asOf": "2026-11-24T20:00:00Z"
  },
  "output": "..\\reports\\summary-001"
}
```

```powershell
npm run contacts:summary -- --request .private\contacts\demo-001\summary.synthetic.json
```

Paths resolve relative to the request. The request shape matches aggregation:
optional distinct nonempty `channels` selects email/sms/mms/rcs/imessage/messenger/
whatsapp; omitted selects all. Unsupported fields/versions/filters fail. The
explicit saved mapping history revision must bind the SHA-256 of exact collection
bytes; no latest-revision, raw-record or same-name fallback exists. A changed
collection requires explicit review/rebinding, even if identities look unchanged.

`7d`/`30d` include the current local date and preceding 6/29 dates, ending at
the explicit as-of instant; label the current day partial. A `custom` period
requires offset-bearing `start`, `end` and `asOf`, with `start < end <= asOf`.
All periods are start-inclusive/end-exclusive and preserve original instants.
The collector resolves boundaries in the IANA zone; no fixed elapsed-hour
subtraction replaces calendar days. A custom boundary day can also be partial.
At an end exactly at local midnight the new date has no interval and is omitted;
nonexistent civil dates (for example Apia's skipped date) create no fake bucket.

## Version-1 shared dataset

`report.json` has `heading:"Heartbeat period summary"`, `schemaVersion:1`,
`dataClass:"synthetic"`, one `context`, `views` and `evidence`. It is the shared
report, not a second store of source truth. There is no separate AI-number path.
Pure callers use `summary(collection, mapping, options)` with the reducer's
options, including the exact collection byte digest. The CLI hashes actual input
bytes; pure callers are responsible for that binding.

| Field | Contract |
| --- | --- |
| `context.period`, `filters`, `collectionDigest`, `identityMappingRevision` | Exact resolved interval/zone/as-of/bounds/current-day state, effective filters and snapshot/review binding. |
| `context.status`, `exitCode`, `coverage` | Preserve reducer status and 0/2 exit. `complete-declared` describes filtered requested-account numerical evidence, not coverage of unrequested sources, source verification or overall connected access; an unavailable source outside the filter can still make status partial. Unrequested channels retain unknown per-channel totals even if requested accounts have exact totals. |
| `context.sources`, `sourceFreshness` | Original per-source/account/connector coverage, retrieval timestamps, pagination, thread coverage, status, reason and errors; retained `not_requested` sources stay unknown. Freshness repeats retrieval timestamps and labels their relation to as-of (`before`, `at`, `after`, `unknown`), without an arbitrary stale threshold. Identity-only sources never add activity. |
| `context.exclusions`, `audit`, `unresolvedIdentities`, `unresolvedReferences`, `reconciliation`, `limitations` | Unchanged exclusion partitions, unique-event/included/excluded audit, inactive/missing identities, collisions, broken/pending targets and explicit limitations. |
| `views.summary.metrics`, `statements` | Deterministic messages/directions, union active days/latest activity, cohort size, observed direct people, observed group-only people and people with no observations. Statements interpolate these computed metrics only. These people categories partition the reviewed peer cohort, not relationship importance. |
| `views.peopleTable` | Every reducer person, including known inactive/unassigned/zero-observation peers; original canonical references, direct/group/role metrics, date unions, latest observed instant and per-channel direct sent/received/bounded count, actual group-post count and active-date union. No names are guessed or copied from raw source payloads. |
| `views.perChannel` | Unchanged reducer channel metrics: observed sent/received/other, bounded message counts, active dates/day unions and latest observed instant. Unrequested/unavailable history is not fabricated. |
| `views.timeline` | One row per existing local date intersecting the period, clipped start/end, `partialDay`, observed metrics and selected per-channel direction/count buckets. Existing observations retain reducer metrics; absent observations become exact zero only if corresponding reducer coverage is exact, otherwise unknown. Completeness is conservatively period-wide, not promoted for a narrower day. |
| `evidence` | Source-event ledger with dispositions and person attributions, per-source/thread totals, canonical aliases and original membership links; sufficient to trace included/excluded messages without source reads. |

`messages` retains `{observed,total,certainty}`: exact (including known zero),
positive lower bound with `total:null`, or unknown with `total:null`. Direct/group
fields are observed values, never estimates. A no-observation person is not proof
of inactivity; deleted/missing source identity links remain in the cohort.
Group messages are not fanned out into direct exchanges. CC/BCC/addressing and
passive membership remain separate. Original deletion/classification semantics
are unchanged. Summary `activeDays` is a cross-channel date union, not a sum.
Per-person per-channel direct certainty requires both that person's global direct
certainty and the channel's certainty to be exact; it is not promoted by a
channel filter within a row, and an unrequested channel never becomes known zero.

### Reconciliation and presentation

The summary message total, sum of channel observations and sum of timeline
observations equal the included source-event ledger. Each day's channel counts
sum to its observed volume. Person direct/group counts reconcile to that person's
event attributions across channels, **not** to all message volume: self group
posts, role-only messages and unresolved people may have no person attribution.
Do not sum exposures/person rows as a global message partition.

For a standalone output, use `selectView(report, name)` where `name` is `summary`,
`peopleTable`, `perChannel` or `timeline`. It copies the full shared context and
data into an envelope with version/data class/heading and a common `reportDigest`
(SHA-256 of `JSON.stringify(report)`, not the pretty-printed file bytes). This is
a binding reference, not a signature or proof of authenticity. This helper
projects reports produced by `summary`, not arbitrary external report schemas.
Future consumers must validate their input version/binding before projection.

The skill copies saved summary statements and formats saved rows; no narrative-
generated counts, percentages, rankings or estimates. Every table/timeline/summary
retains the full context envelope, including source limits. Excerpts must be
labeled with access to that same private local report, never a public link.
No chart, website, backend, product login, telemetry or remote asset is needed.

## Persistence, failure and privacy

The CLI writes only `report.json` under ignored `.private\contacts\` or an
external local synthetic folder. It reuses the reducer's local output boundary,
sanitized JSON reader and a shared immutable publisher: flush a same-directory
`report.<uuid>.tmp`, hard-link without replacing existing files/symlinks, clean
that temporary link. Unsupported hard-link filesystems fail explicitly.
Choose a fresh output directory for each run. A failed retry leaves the old
report unchanged; a crash-left named temp is not an input report and may be
removed only after verifying the writer stopped. No aggregate intermediate is
written and no collection/mapping file is modified.

Private requests fail before snapshot/output access; private collection
snapshots fail before mapping reads. Mapping class is also checked by the
reducer before reduction. Exit **0** means complete declared filtered data with
no overall reducer limits; **2** means a usable saved partial report; **1** means
fatal input/binding/storage failure, never an empty success.
The private-boundary guard reserves `summary.json`, `summary.synthetic.json`,
`report.json` and temporary report names, including force-added ignored files.
No requests/configuration, personal identifiers, outputs or metadata belong in
Git/PRs/CI. Synthetic tests are generated in local temporary directories and
removed. Ignored checkout storage is not approved real-data storage.
No protection verifier, source authorization, credentials, actual collection,
real notes, remote AI, sending or schedules are implemented or authorized.

Engineering rationale, alternatives and revisit conditions: [CONTACTS-024](../decisions.md#contacts-024).
