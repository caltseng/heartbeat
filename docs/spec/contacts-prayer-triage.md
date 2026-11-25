# Heartbeat private prayer triage: CONTACTS-029

Implemented: user-invoked, synthetic-only local JSON requests, append-only updates
and editable ordered plans through `contacts:prayer`. This is a separate overlay
over [original curated notes](contacts-curated-records.md), not a collector,
outreach exporter, hosted interface or recurring job.

**No real notes or prayer content are authorized.** CONTACTS-010's approved
[metadata policy](../privacy.md) excludes this content. A separate owner-approved
content boundary, exact source/run authorization and enforceable local protection
and retention/deletion controls are still required. Engineering decisions below
do not grant privacy consent. Do not prepare real requests or relabel real data
as synthetic; validation cannot establish text provenance.

## Synthetic local workflow

Collect synthetic inputs, register canonical people/households with
`contacts:review`, then capture the original synthetic notes with
`contacts:curate`. No source/account/device/browser access is needed or implied.

Keep the following **synthetic** request in ignored `.private\contacts\` or an
external synthetic temporary directory. Replace paths and note IDs with the
actual synthetic fixture values:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "..\\demo\\collection.json",
  "mapping": "..\\mapping",
  "curated": "..\\curated",
  "output": "..\\curated\\prayer",
  "expectedRevision": 0,
  "curatedDigest": "<inspection value>",
  "reason": "Explicit synthetic prayer plan",
  "operations": [
    {
      "type": "request",
      "id": "prayer-a",
      "text": "Synthetic request for help with a decision",
      "noteIds": ["note-a"],
      "recordedOn": null
    },
    {
      "type": "update",
      "id": "update-a",
      "requestId": "prayer-a",
      "text": "Synthetic update; current status is unclear",
      "noteIds": ["note-b"],
      "status": null,
      "statusConfirmed": false
    },
    {
      "type": "plan",
      "id": "plan-a",
      "label": "Synthetic personal prayer plan",
      "requestIds": ["prayer-a"]
    }
  ]
}
```

```powershell
npm run contacts:prayer -- --inspect .private\contacts\prayer\request.json
npm run contacts:prayer -- --request .private\contacts\prayer\request.json
```

Paths resolve relative to the request file. Inspection is read-only, needs no
operations/reason/preconditions and creates no store. Before each mutation copy
`revision` to `expectedRevision` and `curatedDigest` from fresh inspection. The
digest binds the exact in-memory curated revision/records, canonical mapping digest
and collection digest. It prevents editing against evidence that changed before
the read; it is not a cross-file transaction or protection against later changes.
Reinspect after source/identity/curation changes. Missing evidence/references,
malformed JSON, unknown fields, stale preconditions and lock/storage failures
fail explicitly, never as an empty successful result.

## Operations, evidence and status

IDs match `[a-z][a-z0-9-]{0,95}`. Reference arrays must be duplicate-free.

| `type` | Fields and behavior |
| --- | --- |
| `request` | New `id`, nonempty `text`, at least one existing original `noteIds`, explicit `recordedOn` (real `YYYY-MM-DD` or null). Immutable; initial status is always unknown. No text extraction or invented circumstance. |
| `update` | New update `id` within `requestId`, nonempty `text`, at least one existing `noteIds`, `status`, `statusConfirmed`. Append-only, preserving prior updates and the original request. A correction is another update. |
| `plan` | `id`, nonempty `label`, ordered existing `requestIds`. Explicitly creates/replaces the plan, allowing reorder, additions, removals and an empty plan. Removing a request from a plan does not delete or resolve it. |

Statuses are `unknown`, `active`, `paused`, `answered`, `resolved`. Only an update
with an explicit status **and** `statusConfirmed: true` changes status. The
caller must have the user's explicit statement/confirmation; it is not permission
for an assistant to confirm its own inference. Ambiguity is recorded with
`status: null, statusConfirmed: false`, never a guessed status. Missing confirmation,
unsupported statuses and a claimed status with false confirmation are errors.

Inspection returns the last explicitly confirmed status (unknown initially).
`needsStatusReview` and a brief `statusQuestion` ask for explicit confirmation
when no status is confirmed, the confirmed status is unknown, or the latest
update is ambiguous. A later ambiguous update preserves the last confirmed status
but asks again; a later confirmed update clears that question. Neither request age,
past appointment dates, elapsed time, source activity nor plan edits answer or
resolve a request. Capture instants are separate from recorded calendar dates;
an unknown original date remains null rather than today.

Each derived request includes its referenced `originalNotes`, with unchanged
text, capture/encounter dates and original canonical household/person references.
Updates can reference additional notes. Interpretation remains separately
identifiable as request/update text; a note reference proves traceability, not
that a paraphrase is semantically correct. The user must review that grounding.
No person/household association, belief or priority is inferred. Alias/split
resolution uses the returned canonical view without rewriting original references.
Plans select/order existing requests only; cadence and priority are user choices.

## Persistence, private output and recovery

`prayer.json` stores schema version 1, data class, monotonic revision,
`records.requests`, `records.plans` and append-only transaction history. History
retains the input digest/revision, reason and operations for review. Original
curated/collection/mapping files are never modified. The exclusive `prayer.lock`,
exact revision precondition and shared flushed atomic JSON rename protect one
transaction; failed operations/writes leave the previous snapshot unchanged.
After uncertain completion inspect before retrying. Verify the recorded PID
stopped before removing only that exact stale lock. No automatic recovery
replays an update.

Use a separate prayer directory under `curated` (for example
`<managed-store>\curated\prayer`) or an external sibling; never put it in a managed
source root, `cache` or `derived`. CONTACTS-032 preserves the opaque curated
directory, not unclassified root prayer artifacts. Its source-metadata purge
does not implement prayer-content retention/deletion. No real store is enabled.

Output uses the shared resolved-path boundary (inside this checkout only ignored
`.private\contacts\`; external synthetic folders allowed). Reserved
`prayer.json`, `prayer.lock` and atomic temporary filenames are rejected as Git
delivery candidates. These guards are not ACL/encryption or payload scanning.

The CLI returns JSON headed **Heartbeat private prayer triage**, labeled
`audience: private-local-only`. **All stdout, originals, updates, plans, reasons
and status questions are private local content, not outreach-safe output.**
Do not paste them into PRs, public files, messages or audience drafts. This module
offers no outreach/send/export operation or audience/recipient fields. Curation
inspection does not load the prayer overlay; downstream outreach must likewise
not load it or reuse these fields. A future separately specified outreach workflow
must use an allowlisted projection excluding all prayer/note content by default;
this item grants no sharing consent.

Source statuses, errors, coverage, reconciliation findings and binding digests
travel with inspection. Exit 0/2 preserves complete/partial identity-inspection
semantics; a successful prayer transaction does not claim complete source access.
Exit 1 is fatal; stderr exposes only bounded error codes, not paths/content.
Private requests fail before evidence/path reads or output creation. There is no
approval flag, account access, network transport, sending or schedule creation.

## Delegated engineering decisions (2026-11-25)

Defaults for owner review, not owner-approved privacy policy:

| Decision / rationale | Alternatives / assumptions | Validation / revisit condition |
| --- | --- | --- |
| Separate prayer overlay references immutable curated notes; request/update text is explicit caller-provided interpretation. Return exact originals beside it. | Rewriting notes or automatic language extraction would lose evidence or invent circumstances. Assumes caller-selected synthetic notes and user review of semantic grounding; no classifier can verify that from a reference alone. | Synthetic exact whitespace, original date/target preservation and unchanged collection/mapping/curation bytes. Revisit automatic extraction only with a specified review contract and separate real-content consent. |
| Initial unknown status; only explicit confirmed updates set status. Ambiguous updates ask again while retaining the last confirmation. No elapsed-time inference. | Automatic expiry/completion or requiring a guessed initial status hides uncertainty. Assumes confirmation records an actual user statement, not assistant confidence. | Ancient-note, ambiguous update, active/answered/resolved confirmation, repeated inspection and unconfirmed-status rejection cases. Revisit only with explicit product requirements; time must never imply answered/resolved. |
| Editable ordered request-ID lists, no fixed cadence, generated priority or automatic job. Updates are append-only and plans may be emptied without deleting requests. | A weekly scheduler or recommendation engine expands this bounded local triage slice. Assumes small single-user plans; corrections use updates, not history rewriting. | Synthetic reorder/add/remove/empty-plan persistence and unchanged requests/status. Revisit cadence/priority or retraction/deletion with a separately specified evidence/retention contract. |
| Reuse curated inspection, digest preconditions and atomic JSON persistence in a dedicated directory. | Database/backend and multi-file writes are unnecessary. Assumes a single local user; no claim of cross-file locks, historical canonical reconstruction or network-filesystem safety. | Stale digest/revision, duplicate operations, lock conflict and forced-rename rollback cases. Revisit only for measured scale or a specified coordinated snapshot/migration contract. |
| No outreach projection: prayer outputs are private-local-only and content is not loaded by curation. Deny private runs before dependent reads; sanitize fatal CLI diagnostics. | A permissive content exporter, consent flag or redaction heuristic risks leakage and cannot authorize real notes. Metadata policy does not cover prayer content. | Unknown outreach/recipient fields rejected; independent curated output excludes prayer; private denial, output boundary and fatal diagnostic nondisclosure tested. Revisit only after explicit content/sharing policy plus enforceable protections, never from green synthetic checks alone. |
