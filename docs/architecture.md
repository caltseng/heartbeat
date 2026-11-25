# Heartbeat architecture and local data flow

## Delivered and planned stages

```text
Separately authorized acquisition / real native conversion [NOT IMPLEMENTED]
Synthetic SyncTech XML -> metadata handoff [IMPLEMENTED: CONTACTS-016]
                         |
Normalized handoff JSON, or synthetic demo [IMPLEMENTED]
                         |
Six collection skills -> collect.cjs validation/import [IMPLEMENTED]
                         |
Private collection.json: records + checkpoints + manifest + history [IMPLEMENTED]
                         |
Reviewed canonical people/optional household links [IMPLEMENTED: CONTACTS-022, SYNTHETIC ONLY]
                         |
Deterministic cross-source aggregation [PLANNED: CONTACTS-023]
                         |
Heartbeat period summaries [PLANNED: CONTACTS-024]
                         |
Heartbeat local map / baseline signals [PLANNED: CONTACTS-025/026]
```

Skills are instructions, not installed provider connectors. `collect.cjs` uses
only Node's standard library; `demo.cjs` generates synthetic normalized input.
The shared importer rejects private requests before reading handoffs or creating
output; [CONTACTS-010](privacy.md) records approved policy, not source/run consent.
No Windows protection verifier or operational retention/deletion route ships yet,
so no private import is enabled.
Acquisition and ingestion are separate. No stage requires a hosted service,
server, dashboard, product login, multi-tenancy or deployment. Future generated
HTML/SVG/JSON must remain private local files; no renderer exists yet.

[CONTACTS-014](spec/contacts-email-adapter.md) adds `email.cjs`: injected native
Gmail metadata enumeration/conversion with a synthetic-only fixture CLI. A fresh
private acquisition directory atomically publishes `handoff.json`,
`checkpoint.json` (native list token and normalized accumulator) and `report.json`.
Its handoff feeds the unchanged importer. Native tokens are never handoff cursors;
terminal enumeration remains partial. No HTTP/OAuth or real-source access is added.

## Current local layout

```text
.private/contacts/<chosen-run>/
  request.synthetic.json          # demo only; real requests are separately prepared
  google-contacts.synthetic.json  # identity handoff
  email.synthetic.json
  text-messages.synthetic.json
  messenger.synthetic.json
  whatsapp.synthetic.json
  collection.json                # durable snapshot
  collection.lock                # only during an active write (or interrupted run)
  review.synthetic.json          # explicit identity-review request, when prepared
  identity-review.json           # separate canonical mapping + revision history
  identity-review.lock           # only during an active identity-review write
```

All of `.private/` is ignored and is for synthetic runs only. Future real requests,
exports and configuration require verified private local storage outside Git and
cloud-synced folders under the approved policy, never tracked docs or fixtures.
`output` and input paths resolve relative to the
request file. The collector permits output inside this checkout only under
`.private/contacts/`; it checks resolved directories to reject redirects into
tracked paths. External locations still require privacy approval.

`collection.json` schema version 1 includes:

| Key | Implemented meaning |
| --- | --- |
| `schemaVersion`, `dataClass` | Version and `synthetic`/`private` isolation; mixing classes in a store fails. |
| `records` | Normalized identities, threads, memberships and events keyed by JSON tuples of source/account/type/original ID. Each value carries the record and connector/input SHA-256/page/retrieval provenance. |
| `checkpoints` | Source/account/connector cursor, terminal state and exact resolved-period signature. |
| `textArchives` (optional) | Synthetic text converter's immutable source/account archive and reviewed-ledger binding; changed/overlapping archives fail pending CONTACTS-021. See the [converter contract](spec/contacts-text-converter.md). |
| `manifest` | Current collection time/period, per-source status/coverage/freshness/errors, unresolved identities and explicit implementation limits. |
| `history` | Prior manifests' period/status/source coverage; not a claim that old data is fresh. |

Canonical-person mappings now live in a separate
[identity-review overlay](spec/contacts-identity-review.md) with an exact
collection digest and explicit revision. The collector's
`identityMappingRevision` stays null because review never mutates its manifest.
Record conflicts fail visibly rather than overwriting evidence. Group membership
does not manufacture direct interactions; Google contact presence creates none.

## Failure and recovery

An exclusive lock prevents concurrent writes. Valid pages and their checkpoints
are written together to a same-directory temporary file, flushed and atomically
renamed. Invalid pages do not advance cursors; previous committed pages remain.
An interrupted manifest remains incomplete. Source failures do not erase other
sources and result in exit 2; fatal storage failures result in exit 1.

On interruption, verify the recorded collector PID is no longer active, preserve
the snapshot and inputs, remove **only that store's exact stale `collection.lock`**,
and set `resume:true` in the matching private request. Keep the same resolved
period/as-of and provide the saved next cursor. To change periods use
`resume:false`; do not hand-edit records/checkpoints or delete the store.
Stale temporary files are not input snapshots. Local-filesystem atomicity is not
a certification of network-filesystem or full power-loss recovery.

## Future Heartbeat summaries and map

The [local workflow contract](spec/contacts-local-workflow.md) connects existing
commands/configuration/recovery to reserved versioned handoffs for later stages.
It also specifies the automated no-public-output guard; no renderer or reporting
command is implemented by that integration.

Later reducers must reconcile source IDs and reviewed identity mappings before
counting. They must preserve half-open time intervals, time-zone-aware active-day
unions, direct/group distinctions, exclusions, uncertainty and provenance.
Every summary and map must use the same structured aggregate dataset.
Unknown/unavailable coverage cannot become zero or a reconnection decline.
No numerical person-level summary or map command exists in this baseline.
