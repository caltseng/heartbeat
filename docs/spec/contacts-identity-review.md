# Heartbeat identity review: CONTACTS-022

Implemented local synthetic-only overlay and independent
[`contacts-identity-review` skill](../../.github/skills/contacts-identity-review/SKILL.md).
The collector, schema version 1, source keys, skills and observations retain their
existing contracts. There is no live acquisition, note editor, aggregation or
graph renderer in this overlay. [CONTACTS-027](contacts-curated-records.md) separately
adds synthetic note capture and consumes these canonical household/person IDs.
Bootstrap prerequisite was satisfied by owner-merged
PR #1, commit `6b6299475b0d1dbcf2bd005c87d383ee97537e2b`.

## Request and workflow

`npm run contacts:review -- --inspect <request.json>` is read-only.
`npm run contacts:review -- --request <request.json>` commits one transaction.
Paths resolve relative to the request file. See the skill for a complete
demo-to-registration invocation. Request fields:

| Field | Contract |
| --- | --- |
| `schemaVersion`, `dataClass` | `1`, `synthetic`; private inputs fail closed, including inspection. |
| `collection`, `output` | Collector snapshot file and mapping directory. Inside this checkout output must be under `.private/contacts/`; the collector's resolved-path guard is reused. |
| `expectedRevision` | Exact integer returned by inspection; `0` for a new mapping. Required on mutation. |
| `collectionDigest` | SHA-256 of the exact snapshot bytes returned by inspection; required on mutation. |
| `reason` | Nonempty explanation of the explicit review, not an inferred identity match. Required on mutation. |
| `operations` | Ordered array below; `[]` registers newly observed identities separately or explicitly reaffirms existing links for a new snapshot digest. Repeated no-change transactions against the same snapshot fail. Required on mutation. |

Unknown request, identity, operation and evidence fields fail. No raw payload,
message body or note field is accepted. An existing complete or partial collection
is required; missing input and malformed JSON fail rather than imply no people.
The collection must expose CONTACTS-021's version-1 `reconciliation` projection.
Legacy synthetic snapshots must be replayed through the current collector; review
never substitutes immutable first observations for current identity metadata.
Private requests fail with `private_collection_disabled` before reading any
collection path, including inspection. Apply the
[shared operating rules](contacts-technical-spec.md#shared-operating-rules).

All keys below are synthetic symbolic placeholders: replace them with exact
inspection values. Person IDs are `person-<full SHA-256 of namespaced key>` at
registration. Source keys remain JSON tuples
`[source, account, "identity", originalId]`. No display name is an identifier.

### Merge

```json
{
  "type": "merge",
  "people": ["person-a", "person-b"],
  "into": "person-a",
  "evidence": [
    { "kind": "email", "identityKeys": ["<source-key-a>", "<source-key-b>"] }
  ]
}
```

`people` contains distinct active people, including the explicit survivor `into`.
Every evidence entry names at least two distinct assigned identity keys belonging
to the selected people. Reviewed evidence must connect all selected people, not
justify only one pair in a larger merge. A merge of self and non-self fails.

Email evidence requires a shared value with whitespace trimmed and only the
domain case-folded. Local-part case, plus tags and dots are not rewritten.
Phone evidence (`kind: "phone"`) removes spaces/parentheses/dots/hyphens, then
requires an explicit international `+` and 7-15 digits. No region is guessed.
Source addresses are never rewritten. Shared household addresses, recycled
numbers and stale profiles still require human judgment; the tool never auto-merges.

Provider evidence uses `kind: "provider"` plus a nonempty `reference` describing
the explicitly reviewed provider profile equivalence. All referenced identities
must have `idKind: provider`. It is a recorded reviewer assertion, not a provider
API lookup or independent verification. Local IDs cannot substitute for provider
proof. Names and group membership are rejected as evidence kinds.

Assignments move to the survivor; all original people remain as direct aliases
via `people[id].mergedInto`. Earlier aliases follow subsequent merges. A
single curated household retains the survivor's membership. Different existing
households block the merge until curation explicitly resolves the conflict.

### Current metadata review

```json
{ "type": "refresh", "identityKeys": ["<source-key-a>"] }
```

Inspection lists `changedIdentityKeys` when a current identity's metadata differs
from its last reviewed fingerprint. Every changed key needs an explicit `refresh`
in the transaction before the new snapshot can be accepted. Refresh acknowledges
the current evidence, not identity equivalence; it leaves assignments and notes
unchanged. Split a mistaken person link explicitly instead of treating a source
profile edit as automatic match approval. Deleted or colliding identities cannot
be refreshed or used as merge evidence.

### Split

```json
{
  "type": "split",
  "from": "person-a",
  "into": "person-b",
  "identityKeys": ["<source-key-b>"]
}
```

Move an explicit nonempty proper subset of the source person's assigned identities
to a new canonical ID or reactivate one of that person's aliases. New IDs must
match `[a-z][a-z0-9-]{0,95}`. Splits cannot target an unrelated active person,
empty the original person, erase evidence, or copy household membership.

Notes are deliberately outside this overlay: it never reads, rewrites, deletes,
copies or repartitions them. A note keeps its original person ID and text.
Consumers resolve an alias for the current unified view but retain the original
reference. Reactivating that alias reconnects its original notes. Notes captured
against the surviving combined person remain there after a partial split;
their ownership is **not known** without explicit future note curation.
CONTACTS-027 must honor this invariant, including notes that refer to inactive
or unassigned canonical IDs. No real sensitive notes are authorized here.

### Household

```json
{
  "type": "household",
  "id": "household-synthetic",
  "label": "Explicit synthetic household",
  "people": ["person-a"]
}
```

This explicitly replaces that household's membership. People must be active;
membership is optional, at most one household per person, and may be empty.
Use `people: []` to clear membership without deleting its identifier. Move people
between households by clearing the old link first in the same transaction.
No surname, observed address, thread, spouse status or chat membership produces
a household. A one-person household is supported.

### Undo

```json
{ "type": "undo", "revision": 3 }
```

Undo must be the sole operation and name the current revision. It restores that
revision's prior assignments/curation in a **new** monotonic revision; undoing the
undo redoes it. Older errors use explicit splits/merges, not history rewriting.
Canonical IDs are never deleted: IDs first created by the undone change remain
unassigned or alias the sole restored destination, and newly created household
IDs remain with empty membership. This preserves any subsequent note references.
Inspection exposes `unassignedPersonIds`; consumers must not silently drop them.

## Persistence and downstream contract

`identity-review.json` (schema version 1) contains `dataClass`, monotonic
`revision`, exact `collectionDigest`, `identityDigests`, `inactiveIdentityKeys`, current `view` and
append-only `history`. `view` comprises:

- `people`: canonical ID to `{mergedInto: null | activePersonId}`.
- `assignments`: namespaced identity key to active canonical person ID.
- `households`: curated ID to `{label, people}`.

Each history entry has its revision, review timestamp, reason, collection digest,
explicit operations/evidence, and full `before`/`after` views. Undo never discards
history. Fingerprints detect changes in current projected identities; changes
require explicit refresh rather than silently accepting first-observed or newer
addresses. Source revision reconciliation remains CONTACTS-021.
New identities can be registered on later reviews without altering prior links.
When only observations/freshness change, an explicit empty-operations review can
pin the unchanged mappings to the new snapshot digest in a new revision.
Tombstoned, colliding and missing identities are excluded from matching and new
registration. Previously reviewed assignments, fingerprints, canonical people,
households and note references survive as explicitly inactive links. This also
supports corrected fresh-store overlap replays without permanently blocking the
mapping. Returning identities reuse their links; changed metadata still needs
refresh. Each saved revision records its inactive keys; downstream consumers must
not present inactive mappings as observed current people or silently discard them.
Inspection additionally exposes `excludedIdentityKeys` for current source
tombstones/collisions, including ones never assigned a canonical person.

An exclusive `identity-review.lock`, revision precondition and same-directory
flush/atomic rename prevent overlapping or partial transactions. One bad operation
rolls back the entire request, including new registrations. The collection is
read as one atomic snapshot and never modified. The overlay binds that read's
digest, even if a collector later publishes a newer snapshot.
Local filesystem/Windows ACL and retention limitations in the privacy policy
still apply; this is not encryption, network-filesystem certification or secure
deletion. After a crash, inspect revision before retrying and verify the recorded
PID has stopped before removing only the exact stale lock.

Downstream CONTACTS-023/024 must load an explicit mapping revision together with
its collection digest, resolve aliases without destroying original note/source
references, show unassigned or unreviewed identities, and carry the revision in
every output. Do not silently use the latest mapping for an old report. The
collector manifest's `identityMappingRevision` intentionally stays null; no
post-collection command mutates collection history, checkpoints or provenance.
No report/graph files are generated by this item.

CLI output has the heading `Heartbeat identity review`. It retains the collection's
per-source statuses, freshness, coverage and errors unchanged. Exit 0 means the
supplied collection was complete, 2 means partial/unavailable source coverage
(the mapping can still commit), and 1 is a fatal review/storage failure.
`reconciliationRequired`, collisions and broken `unresolvedTargets` remain
explicit and produce exit 2 even when individual source statuses are collected.
Absent historical mutation targets remain informational `pendingTargets`,
following the merged CONTACTS-021 contract; they do not alone force exit 2.
Successful identity review is not successful source acquisition.

## Delegated engineering decisions (2026-11-24)

These are engineering defaults under owner delegation, **not owner-approved
privacy policy**. No decision grants real collection, account access, credentials,
remote-AI processing, sending or schedules.

| Decision and rationale | Alternatives / assumptions | Validation and revisit condition |
| --- | --- | --- |
| Separate versioned overlay and exact-snapshot digest; keep collector behavior unchanged. | Embed canonical fields in source records or provision a database; a small single-user local JSON store suffices. | Synthetic byte-equality checks prove source snapshots unchanged; stale digest/revision and locking fail. Revisit only when measured scale or CONTACTS-021 revisions require it. |
| Register each identity separately, even matching names/addresses; accept only explicit connected reviewed evidence. Conservative email/phone normalization avoids regional and alias guesses. | Automatic address merging or fuzzy/name matching; shared identifiers and recycled numbers can be ambiguous. | Synthetic same-name, email/phone/provider, cross-namespace, disconnected evidence and mixed-self cases. Revisit normalization with a separately specified provider/region policy, not private-data trial access. |
| Preserve original canonical IDs/aliases and audit snapshots; explicit split or latest-revision undo rather than destructive reassignment of notes. | Move/copy notes to split people, delete merged IDs, or rewrite history; source evidence and original references must survive. | Synthetic merge/split/undo tests compare source and independent note bytes and retain IDs created by undone splits. Revisit note attribution only in CONTACTS-027's explicit curation workflow. |
| Household links optional, explicit, at most one per person; conflicts block merges and splits do not inherit membership. | Automatic one-person households, surname/address/chat grouping, or multiple households; unreviewed identity ingestion precedes household curation. | Synthetic one-person, empty, conflicting and post-split cases. Revisit multiple-household semantics only with a specified product requirement. |
| CLI rejects private data until required controls under the approved CONTACTS-010 policy are implemented and verified. Full JSON history is retained locally for this synthetic slice. | Treat existing local storage as blanket consent or add an unreviewed approval flag; neither establishes source/account or each-run approval or verifies controls. | Synthetic-only tests reject private requests/snapshots and unsafe output. Revisit only with exact source and run authorization plus retention/ACL implementation under the approved policy; do not copy private notes into this history. |
| Integration (2026-11-25): consume only the landed CONTACTS-021 current projection; keep inactive links and require explicit refresh of changed current metadata. | Rejected raw-record fallback, erasing tombstoned/missing canonical references and automatic approval of changed addresses. Assumes the approved CONTACTS-010 policy remains authoritative while actual source/run access and local controls are still gated. | Actual collector regressions cover revised addresses, branch collisions, tombstones, informational historical targets and corrected-store replay; source/notes remain unchanged. Revisit inactive-link expiry only with approved retention/deletion implementation; revisit refresh only with an explicit replacement review contract. |
