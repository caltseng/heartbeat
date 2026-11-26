# Heartbeat curated relationships: CONTACTS-027

Implemented: local synthetic-only JSON persistence and `contacts:curate` CLI for
groups, original typed notes, explicitly confirmed connections and per-household
rhythms. Canonical people and households reuse
[CONTACTS-022 identity review](contacts-identity-review.md), not source addresses
or inferred chat membership. A household may have one person or retain an empty
membership after explicit review. Uncurated identities need not have households.

No private content is authorized. The approved CONTACTS-010 metadata boundary
explicitly excludes notes; a separate content boundary, source/run authorization,
verified local protection and retention/deletion controls remain required.
All requests and fixtures here must be synthetic. There is no account access,
network transport, sending, remote-AI processing, scheduler, website or renderer.

[CONTACTS-029 prayer triage](contacts-prayer-triage.md) references these original
notes from a separate synthetic-only overlay. Curation never reads or includes
prayer requests, updates or plans in its output; prayer output is not outreach-safe.

## Local workflow

First collect synthetic handoffs and register people/households using
`contacts:review`. Household creation, labels, membership, conflicting-household
resolution and undo remain in that one canonical overlay. No household copies or
competing membership store are created by note capture.

Save this **synthetic** request outside tracked output, replacing the paths and
symbolic IDs with the actual synthetic identity-review values:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "..\\demo\\collection.json",
  "mapping": "..\\mapping",
  "output": "..\\curated",
  "expectedRevision": 0,
  "mappingDigest": "<inspection value>",
  "reason": "Explicit synthetic note capture",
  "operations": [
    {
      "type": "note",
      "id": "note-synthetic",
      "originalText": "Synthetic original note, saved without rewriting.",
      "encounteredOn": "2026-10-12",
      "households": ["household-synthetic"],
      "people": []
    }
  ]
}
```

```powershell
npm run contacts:curate -- --inspect .private\contacts\curated-request.json
npm run contacts:curate -- --request .private\contacts\curated-request.json
```

Paths resolve relative to the request file. Inspection is read-only and needs no
operations/preconditions/reason. Copy its `revision` into `expectedRevision` and
its `mappingDigest` before a mutation. The digest hashes the exact canonical
`{revision, view}` read by identity inspection; mutation pins that in-memory
snapshot, never an independently reread mapping. Concurrent mapping changes after
the read do not rewrite it: inspect again to see their effects. Missing mapping,
collection, malformed JSON, unknown fields and unresolved references fail visibly.

Output uses the collector's resolved-path boundary: inside this checkout only
ignored `.private/contacts/`; external synthetic temporary folders are allowed.
This is not approval for real data in an ignored checkout. `curated.json` uses
schema version 1, `dataClass`, monotonic `revision`, `records` dictionaries and
append-only `history`. An exclusive `curated.lock`, exact revision precondition
and flushed same-directory atomic rename protect transactions. A failed operation
or write preserves the prior snapshot. After a crash inspect before retrying;
verify the recorded PID stopped before removing only that exact stale lock.

With [CONTACTS-032 managed stores](contacts-source-operations.md), keep this
output in its own directory: `<managed-store>\curated` or a separate sibling,
never the managed-store root and never `cache`/`derived`. Operations preserves
the curated directory without reading its contents; that includes curation locks
and atomic temporary files. Its root inventory deliberately rejects
`curated.lock` and `curated.json.<pid>.tmp` as unclassified artifacts rather
than guessing that they are purge targets. Retention/deletion affects source
metadata, not original notes, confirmed dates, rhythms or canonical mappings;
reinspect/review refreshed collection evidence before downstream use.

## Operations and retrieval

Every reference array is explicit and duplicate-free. `households` has at least
one existing canonical household; `people` may be empty and may reference retained
inactive/unassigned/alias IDs. A group is user-curated, not a provider thread.
Record IDs match `[a-z][a-z0-9-]{0,95}` and are caller-chosen stable retry keys.

| `type` | Other fields / behavior |
| --- | --- |
| `group` | `id`, nonempty `label`, `households`, `people`. Explicitly creates/replaces group metadata/membership; never copies source thread membership or confirms an encounter. |
| `note` | `id`, nonempty `originalText`, `encounteredOn: YYYY-MM-DD or null`, `households`, `people`. Append-only. Text is preserved exactly, including whitespace/newlines. A correction is another note with a new ID, never a rewrite. |
| `connection` | `id`, `occurredOn: YYYY-MM-DD`, `households`, `people`, `groupId: existing group ID or null`, `noteIds: existing note IDs`, nonempty `context`. Append-only, explicit meaningful-connection assertion. Group membership and note capture alone never create one. |
| `rhythm` | `household`, `intervalDays: positive safe integer or null`, nonempty `reason`. Explicitly sets the household's chosen elapsed-calendar-day interval, or unsets it with null. There is no universal tier, due-date engine or automatic job. |

Notes/connections get a server-local capture instant (`capturedAt`, UTC ISO) at
commit, independent of the supplied encounter/connection calendar date. Unknown
note encounter dates stay null, not today. Dates must be real Gregorian
`YYYY-MM-DD`; no zone or time of day is invented for an encounter. A connection
requires a known date. Repeating an existing note/connection ID fails rather than
overwriting or duplicating it. Inspect the revision after uncertain completion.

Inspection and successful writes return the `Heartbeat curated relationships`
heading, records, canonical mapping (including aliases), `mappingRevision`,
`mappingDigest`, collection digest, inactive/unassigned IDs, changed identity keys
and unchanged source statuses/coverage/errors. Source reconciliation collisions,
unresolved and historical pending targets remain explicit. Exit 0/2 retains the
identity inspector's complete/partial semantics; exit 1 is fatal. Curation success
does not claim source access or complete history.

`lastConfirmedConnections` maps each household to the maximum date among its
explicit connections, or null (unknown). Backfilled older connections cannot move
it backwards. Connecting a curated group does **not** confirm every group
household: only the connection's explicitly selected households are confirmed.
There is no observed-activity date in this field. Imported mail, group events,
source revisions, unavailable history, household edits and rhythm edits cannot
reset it. Observation reducers remain separate CONTACTS-023/024 work.

Original person/household/note references never get rewritten on source refresh,
identity merge, split or undo. Consumers may resolve aliases for a current view
using `canonical.people`, but retain the stored original references. A partial
split cannot infer who owns an earlier combined-person note. Missing canonical
IDs are an explicit error, never silently dropped. This command never modifies
collection files, mappings, checkpoints or cursors. Identity review likewise
does not read or modify curated content.

Engineering rationale, alternatives and revisit conditions: [CONTACTS-027](../decisions.md#contacts-027).
