# CONTACTS-028: Heartbeat weekly reconnection review

Implemented **synthetic only** through `contacts:reconnect` and the
`contacts-reconnection` skill. This is a user-invoked local JSON workflow, not a
weekly job, live connector, hosted dashboard or importance score. It reuses the
current CONTACTS-027 curated overlay and the CONTACTS-024 summary/reducer over
the exact reviewed collection. Optional CONTACTS-029 prayer context stays
original-note grounded. Collection, mapping, notes, connections and rhythms are
never rewritten here.

The [owner-approved metadata policy](../privacy.md) does not authorize real
notes, source access or a run. Every private request fails before resolving input
or output paths, including inspection and report publication. No credentials,
accounts, devices, browser sessions, acquisition, sending, remote processing or
schedules are used. Synthetic output and requests belong in ignored
`.private\contacts\` or an external local synthetic directory, never Git/public
output. Ignored checkout storage is not approved real-data storage.

## Input and commands

Save an untracked `reconnection.synthetic.json` with this shape (paths resolve
relative to the request file):

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "store\\collection.json",
  "mapping": "mapping",
  "curated": "curated",
  "output": "curated\\reconnection",
  "period": {
    "preset": "7d",
    "timeZone": "America/Los_Angeles",
    "asOf": "2026-11-24T20:00:00Z"
  },
  "limit": 5
}
```

`mapping` and `curated` are directories containing the existing
`identity-review.json` and `curated.json`. Optional `prayer` is a directory
containing the saved prayer overlay. Omission explicitly reports
`prayer.status: not_provided`, never an empty/resolved prayer list. Passing an
empty prayer store inspects its revision-zero state; it does not collect content.
The current mapping must bind the exact collection bytes. Changed evidence
requires explicit identity review/rebinding, not bypassing digest validation.
`period` retains the summary's 7d/30d/custom semantics, time zone and as-of.
`limit` defaults to five; any positive safe integer is permitted.

```powershell
npm run contacts:reconnect -- --inspect .private\contacts\reconnection.synthetic.json
npm run contacts:reconnect -- --request .private\contacts\reconnection.synthetic.json
npm run contacts:reconnect -- --report .private\contacts\reconnection.synthetic.json
```

Inspection reads saved records, returns the full review as JSON, and creates no
directory, lock or snapshot. For a mutation, copy inspection's `revision` into
`expectedRevision`, copy `evidenceDigest`, and add nonempty `reason` plus
`operations`. Both exact-input preconditions are mandatory for mutations and
report publication; inspect again after changes. The digest includes curated,
collection, mapping, reporting period/coverage, optional prayer evidence and
limit. State revision independently protects follow-ups, deferrals and links.

`--request` updates only `reconnection.json`, atomically under an exclusive
`reconnection.lock`, with an append-only transaction history. Failed validation
or writes leave existing bytes unchanged. Remove only the exact stale lock
after verifying its writer stopped. Do not copy snapshots between identities.
Keep this overlay under `curated` or outside a source-operation managed cache;
do not place extra files in that cache's root or extend its purge inventory.

`--report` requires no `operations` and publishes an immutable `report.json`
containing the same complete review dataset. It never mutates the overlay.
Choose a fresh `output` directory for a fresh independent report, or archive an
existing report explicitly outside Git; publication never overwrites a report
or symlink. To snapshot an existing overlay, use that overlay's output directory
for its first report. Reports remain point-in-time evidence, not live truth.

Exit **0** means complete declared source/identity evidence, **2** retains a usable
partial review and its explicit unavailable/auth-limited/unsupported sources,
and **1** means fatal failure with sanitized diagnostics, not empty success.
Missing optional prayer context and a missing source-opening link are separately
labeled availability limits, not claims about complete personal context.

## Explicit operations

| Type | Fields besides `type` | Behavior |
| --- | --- | --- |
| `followup` | `id`, `householdId`, `text`, `noteIds`, `dueOn` | Capture an explicit commitment once. Require at least one original note belonging to that household. `dueOn` is a real YYYY-MM-DD or null; no commitment is inferred from prose/activity. |
| `complete` | `id`, `completedOn` | Explicitly complete an existing open follow-up once. Date cannot be later than the review's local as-of date. History retains the reason/evidence; completion never records a meaningful connection. |
| `defer` | `householdId`, `until`, `reason` | Snooze until a future local calendar date. Retain the row and reasons in `deferred`; it returns on that date. A later explicit deferral replaces the current snooze but remains in history. Rhythms/connections are unchanged. |
| `thread-link` | `threadKey`, `url` | Save an explicit credential-free HTTPS link for an existing nondeleted source thread. No URL is guessed from IDs, opened, fetched or verified. Links are only exposed alongside that household's attributed event evidence; passive membership is insufficient. Unsupported app/deep-link schemes stay unavailable. |

Identifiers follow existing lowercase letter/digit/hyphen conventions. Dates
are validated real calendar dates. Unsupported fields, repeated follow-up IDs,
foreign/missing notes, unknown households/threads and no-op transactions fail.
To **record a meaningful connection**, use the existing `contacts:curate`
`connection` operation with its own inspected revision/mapping digest and
explicit households/date/context; then inspect this review again. Do not infer a
connection from a follow-up completion, deferral, email, group post or attendance.

## Recommendation evidence and presentation

The review date is the reporting as-of instant's date in the selected time zone,
not the machine clock. Last confirmed connection is the latest explicit curated
connection on/before that date; future-dated entries cannot reset it. Civil-day
differences use date ordinals, not 24-hour durations across DST. No confirmed
connection is `null`/unknown, not zero days or neglect. Rhythms remain individually
chosen day intervals; no default relationship tier or population comparison.

Households surface for due explicit commitments, due curated rhythms, unknown
connection history, outstanding commitments or active/status-uncertain prayer
context. The short list prioritizes due commitments, then due rhythms, then
context/unknowns; ties use stable household ID, not message count or worth.
Five is only the default list size. `remaining` keeps every nondeferred overflow
row; `deferred` keeps snoozed rows; `candidateCount` accounts for all three lists.
Unsurfaced households are not claimed unimportant or fully known.

Each row retains structured reason codes and record IDs, last confirmed date or
unknown, rhythm/reason, exact original household notes, open follow-ups,
note-grounded active/ambiguous prayer requests, observed person activity and
source/account/thread/event references. Notes may hold explicit upcoming-event
or life-update context, but no semantic extraction/inference is performed.
Confirmed answered/resolved/paused prayer requests are not active concerns;
ambiguous updates retain their explicit status-review question.

Observed activity is separately labeled and comes only from the summary's
included interpersonal event attributions in the selected period. Prefer the
most recent existing direct thread, otherwise a labeled group-post thread;
membership alone, bulk mail, unresolved attributions and deleted messages do
not produce an action. Tombstoned/missing threads never become actionable.
If there is no evidenced thread in this period, say so and suggest reviewing
saved context/confirming a connection rather than inventing a conversation.
Saved thread references do not establish current source access. A missing link
offers manual source/account/thread lookup, never a fabricated URL.

Retain `context` with its exact period/zone/as-of, digest, mapping revision,
source coverage/status/errors/freshness, reconciliation, exclusions, certainty
and limitations in every presentation. Positive partial counts are lower bounds;
missing history is unknown, never proof of silence/neglect. Current snapshots
and curated/prayer context are not historical as-of reconstruction. Historical
reports are immutable snapshots; changing `asOf` does not rewind overlay history.

## Delegated engineering decisions, not owner privacy approval

| Decision / rationale | Alternatives / assumptions | Validation / revisit |
| --- | --- | --- |
| Reuse current curated inspection and deterministic summary directly; keep follow-ups/deferrals/links in a separate locked atomic JSON overlay. | Reject changing collection schemas, duplicating aggregation, a backend or prose-driven extraction. Assumes small single-user synthetic saved datasets. | Tests verify unchanged upstream bytes, exact evidence/revision rejection and failed-write rollback. Revisit only for a specified migration or coordinated multi-store transaction contract. |
| Manual review, five default rows, explicit evidence-category order with stable ID ties and visible overflow. | Reject scheduled weekly jobs, relationship/guilt scores and frequency-driven priority. No claim this is owner-approved ranking policy. | Exact threshold/ordering/overflow tests. Revisit list size/order when the owner reviews synthetic usability evidence. |
| Use selected-zone calendar dates; due at `elapsedDays >= intervalDays`; deferral suppresses only before `until`. | Reject source-observed clock resets, UTC-local date confusion and rhythm changes on snooze. Assumes existing curated day-interval semantics. | Exact due boundary, local date, DST civil days, expiry, future-connection exclusion and unchanged rhythm tests. Revisit only for explicit month-based rhythms or different snooze semantics. |
| Follow-ups require explicit household-note evidence; prayer context is optional and status ambiguity remains visible. Existing curated command records connections. | Reject inferring commitments, meaningful connections, events or answered prayer from activity/content age. No new real-content consent is implied. | Grounding, completion, original-note preservation, unknown/active/resolved status and missing-context cases. Revisit richer event/life-update inputs with a separately specified evidence contract. |
| Existing attributed thread IDs plus explicitly saved HTTPS links; do not extend collector schemas or guess provider URLs. | Reject account-dependent URL templates and live-link verification. Source handoffs have no opening-link field; manual references remain actionable when no link exists. | Direct/group/passive-membership, deleted-thread, unsafe/missing link and auth-limited CLI cases. Revisit additional schemes/provider fields only with a reviewed source-link contract, never implicit account access. |
| Immutable local report, fail-closed synthetic guard, reserved artifact names and sanitized fatal exits. | Reject public export, silent missing-source success and user-asserted approval bypasses. Existing real-data policy/control gaps remain. | Actual CLI 0/2/1, private-before-path denial, report replay refusal, unsafe output and Git boundary tests in `npm run ci`. Revisit private operation only after independently approved content/source/run boundaries and enforceable local controls. |
