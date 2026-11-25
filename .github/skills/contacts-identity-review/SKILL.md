---
name: contacts-identity-review
description: Independently inspect a local contacts snapshot and persist explicit canonical-person merges, reversible splits and optional curated households without altering source observations or notes. Synthetic-only until a separately approved private-run boundary is implemented.
---

# Heartbeat identity review

Use this skill independently after metadata collection; no collection rerun or
source access is needed. Read [the review contract and decisions](../../../docs/spec/contacts-identity-review.md),
[privacy policy](../../../docs/privacy.md), and AGENTS.md. This is a local JSON
overlay, not a connector, numerical reducer, report renderer or hosted service.

## Boundary

Use synthetic snapshots only. The CLI rejects `private` requests and snapshots.
CONTACTS-010, explicit source authorization and implementation of an approved
private-run boundary are separate requirements, not granted by this skill or the
delegated engineering decisions. Do not acquire credentials, access accounts,
devices or browser sessions, pair, send, schedule, or process private records
through remote AI. Sensitive note capture remains CONTACTS-027/010.

Keep requests, inspection output, mapping history and future notes untracked in
`.private/contacts/` or an explicitly approved external local directory. Do not
paste identifiers or CLI manifests into public artifacts.

## Inspect before deciding

For an account-free starting point, run collection's demo in a fresh directory:

```powershell
npm run contacts:collect -- --demo --output .private\contacts\identity-demo
```

In that directory, prepare `review.synthetic.json`:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "collection.json",
  "output": ".",
  "expectedRevision": 0,
  "reason": "Register each synthetic identity separately; no matches approved.",
  "operations": []
}
```

Run:

```powershell
npm run contacts:review -- --inspect .private\contacts\identity-demo\review.synthetic.json
```

Inspection writes nothing. It returns the current revision, exact collection
digest, namespaced identity keys, current/suggested canonical person IDs,
unassigned person IDs, and the original source statuses. Copy `revision` into
`expectedRevision` and `collectionDigest` into the request. Applying an empty
operations array registers new identities individually, never merges them.

```powershell
npm run contacts:review -- --request .private\contacts\identity-demo\review.synthetic.json
```

## Review matches and households

Reinspect before each mutation and use the exact returned keys/IDs. The companion
contract specifies complete operation shapes. Record a meaningful `reason` and:

- Merge only with explicit reviewed email, international phone or provider
  evidence connecting every selected person. Shared addresses can belong to
  different people; matching evidence is not automatic approval. Names, surnames
  and shared chats are never match evidence. Keep ambiguous people separate.
- Preserve explicit self status. Do not combine a self identity with a non-self
  identity or invent provider equivalence from similar names.
- Split an explicit subset of identities into a new person ID or reactivate an
  original merged alias. A split leaves at least one identity with the original
  person. Do not copy household membership or redistribute notes automatically.
- Set households only through an explicit `household` operation. One person may
  remain uncurated or have one curated household. A four-person chat is not a
  household. Clear conflicting membership explicitly before merging.
- Undo only the current revision with a sole `undo` operation; undo appends a new
  audited revision. Use an explicit split for older mistaken merges.

`identity-review.json` records assignments, stable people/aliases, households,
collection digest, explicit revision, reasons, evidence and before/after history.
Do not hand-edit it. Collection records/checkpoints are never changed. Notes keep
their original person IDs and text; merged IDs remain resolvable aliases. Partial
splits cannot determine the owner of notes captured against a combined person:
leave those references untouched for later explicit curation.

## Failure and handoff

Exit 0 means the supplied snapshot's sources were collected, not that any live
endpoint is connected. Exit 2 preserves partial/unavailable/failed source status;
it can accompany a successfully saved mapping. Exit 1 means no review transaction
committed. Do not turn unavailable sources into empty success.

Stale revision/digest, changed or missing reviewed source identities, unknown
fields, invalid evidence, unsafe output and lock conflicts fail visibly. Reinspect
and re-review, rather than rewriting the revision or bypassing the lock. After an
interruption, verify the recorded PID stopped before removing only that exact
`identity-review.lock`. Retry an uncertain write only after inspecting its revision.

Report the private mapping path, revision, digest, explicit changes, ambiguous
identities/note attribution and source coverage limits. Downstream consumers must
pin this exact revision/digest; collection's own `identityMappingRevision` stays
null because this independent stage never rewrites the collection manifest.
