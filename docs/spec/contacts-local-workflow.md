# Heartbeat local workflow (CONTACTS-031)

Status: synthetic collection, source reconciliation and identity review are
runnable, including the landed CONTACTS-021/022 contracts. Synthetic Google/email
acquisition and text conversion have separate commands below. CONTACTS-023 now
adds synthetic cross-source aggregation; CONTACTS-024 adds the shared Heartbeat
period report and summary presentation skill. CONTACTS-025 adds the pinned
synthetic-only private local HTML/SVG graph.
[CONTACTS-027](contacts-curated-records.md) adds separate synthetic note capture,
curated groups, explicit connections and rhythms using reviewed households.
[CONTACTS-028](contacts-reconnection-review.md) composes those saved records with
the shared period summary for a manual household review, explicit follow-ups and
completion, rhythm-preserving deferral and optional saved prayer context:
`npm run contacts:reconnect -- --inspect <synthetic-request-file>`.
Its separate `--request` updates the local review overlay; `--report` publishes
an immutable private `report.json` with inspected exact-input preconditions.
Record meaningful connections through `contacts:curate`, never observed activity.
This workflow composes those stages without claiming future delivery. The
[technical contract](contacts-technical-spec.md), [product contract](contacts-store-spec.md)
and [register](contacts-work-items.md) remain authoritative.

## One operator, one local store

Use Node.js 20+, Git and `npm ci` to restore the TypeScript CLI toolchain. No server, host,
backend, product login, cloud processing, account connection or schedule is
needed. Keep collection skill names and schema names unchanged. Heartbeat names
the reports and relationship/interaction graph, not a bulk contacts rename.

All examples below are synthetic; their operational files may use ignored
`.private\contacts\` or a local temporary directory. Never relabel real data
synthetic. The [approved CONTACTS-010 policy](../privacy.md) requires real storage
on this computer **outside Git worktrees and cloud-synced folders**, verified
Windows-user restrictions/encryption, retention/deletion controls, no automatic
backups, and separate exact-source/account and each-run owner approval.
Existing import/processing CLIs fail closed on private requests; no configuration
bypass is provided. Approval alone cannot enable their unimplemented controls.
The owner-authorized [manual retrieval V0](contacts-manual-retrieval.md) is a
separate handoff-only path: invoke `/contacts-retrieve` in a local Heartbeat
project session, approve a bounded source-tool read and manually verify safe
local output. It does not require a future connector/automation/privacy platform
and does not enable private imports. This document otherwise makes engineering decisions only, not additional consent
for source/device/browser access, credentials, content/notes, remote AI, sending
or schedules. Ignored checkout storage is not approved real-data storage.

## Commands that exist today

From the checkout root, choose a fresh directory:

```powershell
npm run ci
npm run contacts:collect -- --demo --output .private\contacts\demo-031
if ($LASTEXITCODE -ne 0) { throw 'Synthetic collection failed; inspect the local error.' }
npm run contacts:collect -- --request .private\contacts\demo-031\request.synthetic.json
if ($LASTEXITCODE -ne 0) { throw 'Replay failed or is partial; inspect the local manifest.' }
npm run check:private
```

The demo creates five version-1 synthetic handoffs plus its request; replay
retains four distinct message events. Google identity records create no activity.
No install, credentials, source fetch or network is involved. Keep CLI stdout
local: it includes the manifest's account/identity references. Never paste it
into a PR or use a public CI job for private collection.

To exercise unavailable sources, edit a **copy** of the synthetic request
locally. Replace one source with this explicit entry (keep other sources):

```json
{
  "source": "messenger",
  "account": "fixture-messenger",
  "connector": "none",
  "mode": "unavailable",
  "status": "requires_setup",
  "reason": "Synthetic example: no authorized personal-inbox route."
}
```

Run that request with `--request <private-request-path>`. Exit 2 and a persisted
`partial` manifest are expected, not an empty success. Use `unsupported` for a
known unsupported route/format; acquisition/authentication failures must remain
explicit rather than producing an empty handoff. Exit 1 means fatal arguments,
storage or locking failure; exit 0 only describes supplied snapshots' declared
coverage. Inspect every nonzero exit; do not chain later stages as if it were 0.
An exhausted cursor never proves complete upstream history.

### Synthetic identity-review handoff

After that demo/replay, prepare
`.private\contacts\demo-031\review.synthetic.json` (use a fresh `reviewed`
directory for the initial revision):

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "collection.json",
  "output": "..\\reviewed",
  "expectedRevision": 0,
  "reason": "Register each synthetic identity separately; no matches approved.",
  "operations": []
}
```

```powershell
npm run contacts:review -- --inspect .private\contacts\demo-031\review.synthetic.json
```

Inspection is read-only. Copy its `revision` into `expectedRevision` and add its
exact `collectionDigest` to the request, then run:

```powershell
npm run contacts:review -- --request .private\contacts\demo-031\review.synthetic.json
if ($LASTEXITCODE -eq 1) { throw 'Identity review failed; inspect before retrying.' }
npm run check:private
```

Exit 2 can accompany a committed review of partial/unavailable/reconciliation-
limited sources; retain that uncertainty, do not treat it as complete acquisition.
The [identity-review contract](contacts-identity-review.md) defines reviewed
matches, explicit refresh, split/undo and optional households. It consumes only
CONTACTS-021's current reconciliation projection, not immutable first-observation
addresses. Tombstone/collision/missing links remain inactive, changed metadata
requires explicit refresh, and original canonical references survive.
Reinspect before each mutation; no command silently matches names or addresses.

### Synthetic aggregation handoff

After that review, prepare `demo-031\aggregate.synthetic.json` with
`schemaVersion:1`, `dataClass:"synthetic"`, `collection:"collection.json"`,
`mapping:"..\\reviewed\\identity-review.json"`, `identityMappingRevision:1`,
the same demo period (`7d`, `America/Los_Angeles`,
`asOf:"2026-11-24T20:00:00Z"`), and `output:"..\\reports\\run-001"`.
The [aggregation contract](contacts-aggregation.md) gives complete JSON,
optional channels, coverage and interpretation rules.

```powershell
npm run contacts:aggregate -- --request .private\contacts\demo-031\aggregate.synthetic.json
if ($LASTEXITCODE -eq 1) { throw 'Aggregation failed; preserve the pinned inputs and inspect the error.' }
npm run check:private
```

Exit 2 saves an explicitly partial dataset, not empty success. The exact mapping
history revision must bind the collection bytes. Inputs remain unchanged; each
new run publishes a separate immutable `aggregates.json` with version, filters,
period/zone/as-of, source coverage, exclusion ledger and observed/lower-bound
metrics. No graph, source access or private run is enabled.

### Synthetic summary handoff

Copy that aggregation request to `demo-031\summary.synthetic.json`, keeping the
same collection, explicit mapping revision, period and optional channels, but
choose a fresh output such as `"..\\reports\\summary-001"`.

```powershell
npm run contacts:summary -- --request .private\contacts\demo-031\summary.synthetic.json
if ($LASTEXITCODE -eq 1) { throw 'Summary failed; preserve the pinned inputs and inspect the error.' }
npm run check:private
```

The [CONTACTS-024 contract](contacts-period-summary.md) defines one immutable
`report.json` built directly through the reducer, with no intermediate aggregate
write. Exit 2 saves explicit partial coverage, not empty success. Use the focused
`contacts-summary` skill to copy computed statements and format the saved people,
channel and timeline rows with their full context. Standalone `selectView`
envelopes preserve the same metadata and report digest. No narrative-generated
numbers, dropped inactive peers, implicit empty-history zeros or source access.

### Synthetic local graph handoff

The [CONTACTS-025 graph contract](contacts-local-graph.md) consumes that exact
saved `report.json`, not raw collection data. Prepare a local
`graph.synthetic.json` with `schemaVersion:1`, `dataClass:"synthetic"`,
`report:"report.json"`, its exact lowercase SHA-256 `reportDigest`, and a fresh
`output:"..\\graph-001"`.

```powershell
npm run contacts:graph -- --request .private\contacts\reports\summary-001\graph.synthetic.json
if ($LASTEXITCODE -eq 1) { throw 'Graph failed; inspect the pinned report before retrying.' }
npm run check:private
```

Open the generated `graph.html` directly in a browser. It contains inline SVG
maps, shared summary/people/channel/timeline views and keyboard-linked evidence,
with no service, remote assets or JavaScript. Exit 2 retains explicit partial
coverage. To change filters, regenerate the summary and graph together.

### Other implemented synthetic entry points

These are separate local producers, not live connectors or an all-in-one job.
Keep configuration and outputs private; follow each linked contract's fixture
shape and prerequisites rather than constructing requests from real accounts.

| Command | Synthetic input and local handoff |
| --- | --- |
| `npm run contacts:google -- --config <local-config.json>` | [Google fixture transport](contacts-google-capability.md#contacts-012-local-adapter-and-delegated-decisions); private `google-acquisition.json` plus named `google-handoff-<uuid>.json`. |
| `npm run contacts:email -- --synthetic-request <request.json>` | [Email fixture transport](contacts-email-adapter.md); fresh-directory `handoff.json`, native `checkpoint.json` and acquisition `report.json`. |
| `npm run contacts:text-xml -- --xml <fixture.xml> --manifest <manifest.json> --output <fresh-directory>` | [Selected synthetic XML profile](contacts-text-converter.md); `text.synthetic.json` and a collection request. |
| `npm run contacts:messenger -- --synthetic-request <request.json>` | [Selected synthetic JSON snapshot profile](contacts-messenger-converter.md); local IDs, overlap guard and unknown history, not a personal API. |
| `npm run contacts:whatsapp -- --txt <fixture.txt> --manifest <manifest.json> --output <synthetic-store>` | [Selected synthetic iOS TXT profile](contacts-whatsapp-format-gate.md#contacts-020-operation-and-delegated-decisions); immutable registry, acquisition handoff/request and unknown snapshot history. |
| `npm run contacts:curate -- --inspect <request.json>` / `--request <request.json>` | [Curated records](contacts-curated-records.md); synthetic `curated.json`, canonical household/person references, original notes and explicit connections. Real note content is unauthorized. |
| `npm run contacts:audience -- --inspect <request.json>` / `--request <request.json>` / `--finalize <request.json>` | [Life-update audience review](contacts-life-update-audience.md); editable synthetic household/member selections, explicit reasons/preferences and exact-input reviewed lists in private `audience.json`. No sending. |

Feed successful/explicitly partial normalized handoffs into `contacts:collect`
with their exact source/account/connector and coverage. Native acquisition
checkpoints are not collector cursors; use each producer's recovery contract.
Neither Messenger nor WhatsApp snapshot conversion implies live-source access.

`npm run contacts:operate -- --request <operation.synthetic.json>` adds explicit
synthetic refresh/resync, stale-source reporting, inventoried whole-cache
retention/deletion and interrupted-purge recovery. Follow its separate
[CONTACTS-032 managed-store layout and contract](contacts-source-operations.md);
managed stores use operations refresh/resync rather than direct collection.
Keep curated overlays separate from cache/derived targets. Operation requests
are private operational artifacts guarded by `check:private`, too.
Keep `contacts:curate` output in its own directory (the `curated` subdirectory
or a separate sibling), never directly in the managed-store root: curation's
`curated.lock` and `curated.json.<pid>.tmp` are not metadata purge inventory.
No private source access or recurring schedule is enabled.

## Local configuration and versioned file handoffs

Collection configuration is its existing version-1 request:
period/as-of/time zone, output, source/account/connector references, input paths,
resume and optional page budget. Paths resolve relative to the request file,
not the shell. Do not put real account IDs, local paths, self identities or configuration in
package scripts, tracked fixtures, environment examples or skills. There is no
additional config loader, credential store or product account system.

Identity review uses its own version-1 request, with the exact collection digest,
expected mapping revision, reason and explicit operations. There is no shared
global configuration; source adapters own their documented local requests.

Example layout; use separate fresh report/graph generations:

```text
.private/contacts/
  demo-031/
    request.synthetic.json
    <source>.synthetic.json
    collection.json
    collection.lock                 # during collection only
  reviewed/
    identity-review.json            # CONTACTS-022 handoff
    identity-review.lock            # only during an identity-review write
    identity-review.json.<pid>.tmp   # transient atomic-write staging file
  curated/
    curated.json                    # CONTACTS-027 synthetic curated records
    curated.lock                    # only during curation
    curated.json.<pid>.tmp           # transient atomic-write staging file
  reports/<chosen-run>/
    aggregates.json                 # implemented CONTACTS-023
    aggregates.<uuid>.tmp           # transient atomic no-replace publication
    report.json                     # implemented CONTACTS-024; choose its own fresh run
    report.<uuid>.tmp               # transient atomic no-replace publication
    graph.html                     # CONTACTS-025 inline SVG, own fresh generation
    graph.html.<uuid>.tmp           # transient atomic no-replace publication
```

| Producer -> consumer | Version and handoff | Gate / required evidence |
| --- | --- | --- |
| Acquisition/demo -> collector | Existing `schemaVersion:1` request and source envelopes | Same data class; explicit source/account/connector, self IDs, roles, period, coverage and provenance. All desired unavailable sources are entries, not omissions. |
| Collector -> identity review | Existing `schemaVersion:1` `collection.json` | Read records, checkpoints, manifest and history as one atomic generation; retain source keys and unknown coverage. Do not edit source evidence to resolve a person. |
| Identity review -> reducer | Implemented `schemaVersion:1` `identity-review.json`, defined by 022 | Monotonic `revision`, exact `collectionDigest`, current `view`, `identityDigests`, inactive links and append-only history. Read an explicitly pinned revision/digest; preserve aliases and unresolved/inactive people. Names/group membership cannot imply merges or households. |
| Identity review -> curated records | Implemented `schemaVersion:1` `curated.json`, defined by 027 | Pin canonical view digest plus curation revision; preserve original IDs/text and separate capture/encounter dates. Only explicit connections affect confirmed dates; source changes never overwrite notes. |
| Collection + mapping -> reducer | Implemented `schemaVersion:1` `aggregates.json`; [contract defined by 023](contacts-aggregation.md) | Pin exact collection bytes (SHA-256), data class, explicit saved mapping revision and resolved half-open period/time zone/as-of. Reconcile source IDs, direct/group roles, exclusions and unknown/lower-bound coverage. |
| Reducer -> Heartbeat summary | Implemented `schemaVersion:1` `report.json`; [contract defined by 024](contacts-period-summary.md) | Shared dataset with exact collection digest/mapping revision, filters, period/zone/as-of, source freshness/coverage, exclusions, deterministic statements, full people cohort and coverage-aware daily timeline. Standalone views retain shared context/digest. |
| Shared report -> Heartbeat graph | Implemented private `graph.html` with inline SVG; [025 contract](contacts-local-graph.md) | Pin exact report-byte digest; same period/filters across summary/people/channel/timeline/map/evidence. Explain group-only/inactive/unknown categories. Offline, no remote assets, telemetry or service. |

Standalone `graph.svg` remains reserved, not emitted. Each future
JSON producer must declare `schemaVersion`, preserve `dataClass` and pin input
revisions/digests; consumers must reject unsupported versions, mismatched data
classes/periods/revisions and missing inputs, never substitute empty/stale data.
CONTACTS-023 owns the implemented aggregate schema; CONTACTS-024 owns its
implemented version-1 shared report and presentation contract;
CONTACTS-022's implemented overlay contract remains unchanged.
CONTACTS-025's renderer consumes the saved report, preserving this workflow.
Do not pass the raw collection directly to a graph or derive totals in a renderer.

Source-acquisition artifacts `handoff.json`, `checkpoint.json`, `report.json`
and `.email-staging-*` directories, plus Google's acquisition snapshot/lock/temp
and named handoff/temp files, are private too. Each source adapter owns its
format and recovery contract; reserving names does not authorize acquisition.
The guard also reserves `identity-review.json.lock` and
`identity-review.json.tmp` as private aliases, in addition to the actual landed
writer's `identity-review.lock` and `identity-review.json.<pid>.tmp`; this does
not rename upstream persistence.
WhatsApp's `whatsapp-registry.synthetic.json`, `whatsapp-conversion.lock`,
`whatsapp.synthetic.json`, UUID-suffixed atomic temporary JSON files and
`acquisition-<64-hex-digest>` bundles are private operational output too. The
delivery guard rejects these filenames/bundles outside ignored storage, including
force-added files. Preserve the registry and exact reviewed account/thread
references across replay; never reset them or create fresh references to bypass
overlap rejection. Interrupted writes use the converter's recovery contract.

Persist derived generations separately from collection. Future producers must
validate first, write atomically inside the same private boundary (reuse the
collector's output-location checks), and leave prior valid output intact on
failure. Explicitly label partial datasets as observed/lower-bound; interrupted
or invalid inputs block downstream work. Use the reviewed overlay, explicit
synthetic curation and structured aggregates:
the graph now renders shared report views, but no all-in-one command is added.

## Recovery without losing source evidence

These replay instructions apply to unpurged, unmanaged stores. In a managed
CONTACTS-032 store, use its explicit recovery/refresh/resync commands; a pending
purge must finish before imports, and erased history must not be restored from
old handoffs or checkpoints.

For replay use the original request and retained handoffs. For interrupted or
page-budgeted collection, inspect the local manifest and checkpoint; confirm
the lock's recorded PID is no longer the active collector before removing only
that store's exact stale `collection.lock`. Preserve the snapshot and inputs.
Set `resume:true` in the matching private request, keep the same resolved
period/as-of and supply the saved next cursor. Failed pages never advance it.
If the cursor is missing, recover the matching handoff; do not fabricate one.
For a changed period/as-of use `resume:false`; do not clear checkpoints manually.
Finished-source replay deduplicates but is not a new upstream refresh.

On conflicts, unsupported versions or data-class mismatch, stop and retain the
evidence; do not overwrite records or relabel data. For synthetic recovery, replay
retained handoffs into a fresh local directory or use a retained coherent
synthetic snapshot/request set with no active writer. Temporary
`collection.json.<pid>.tmp` files are not recovery inputs. The approved policy
prohibits automatic backups of real data; this workflow adds no backup or
retention automation and does not change that policy. Atomicity assumes a local
filesystem, not a network share or certified power-loss recovery.

For identity review, inspect the saved revision/digest after an uncertain write;
only remove its exact stale `identity-review.lock` after verifying that writer
stopped. Reinspect and explicitly review a new collection digest; refresh changed
current identities, retaining inactive links. Never hand-edit history, reuse
stale revision/digest preconditions, or use transient `.tmp` files as overlays.

Future derived outputs are reproducible from pinned inputs: retain reviewed
mappings, regenerate a new output generation after recovery, and never describe
an older report/graph as fresh after collection or mapping changes. Recovery
must preserve curated notes/households independently; those are not disposable
derived caches.

## Automated publication boundary

There is deliberately **no public build or deployment output**.
`npm run ci` includes `check:private` and synthetic negative tests. The guard:

- Rejects any content in `public`, `dist`, `build`, `out`, `_site` and `.output`;
  redirects and files at those roots fail too. This excludes contacts docs,
  skills/tooling, datasets, checkpoints and graph files, even when renamed.
- Checks Git's tracked and non-ignored untracked candidates, including force-added
  ignored paths, for `.private`, `.email-staging-*`, environment/key files and the
  reserved operational filenames above (plus `request.json`, `config.local.json`
  and snapshot temp files).
- Can audit an additional export destination with
  `npm run check:private -- --output <public-output-directory>`. This is a check,
  never a generator, uploader or deletion command.

For this npm command, `--output` accepts an absolute or repo-relative path
(npm runs the script from the package root). It does not resolve relative to a
collection request.

The repository's docs/tooling remain intentionally tracked source; they are not
a website. Ignored `.private` files remain local and are permitted. Checks do
not inspect private payloads, certify arbitrary names elsewhere, prevent
manual uploads, or replace access control/CONTACTS-010. New output locations or
artifact names require extending the guard and tests before use. Checked-in
fixtures must be synthetic; no automated content scanner can prove that label.

## Delegated engineering decisions for owner review

These are reversible defaults within CONTACTS-031, **not owner-approved privacy
policy**. Assumption throughout: one operator on a local filesystem, synthetic
inputs only, existing collection v1 remains compatible.

| Decision / rationale | Alternative deferred | Validation / revisit condition |
| --- | --- | --- |
| Reuse `contacts:collect` and request v1 as local configuration; no orchestrator or new config loader. Avoid a second source of truth. | All-in-one workflow CLI or global config. | Existing CLI/replay/resume tests remain unchanged. Revisit when at least the reducer/report contracts are implemented and orchestration removes real duplication. |
| Reserve separate reviewed/derived files and require version/data-class/input pins; future owning items define exact schemas. Avoid fake report commands or coupling rendering to collection internals. | Invent full schemas/renderers now or mutate the collection store. | Contract table follows 021-025 dependencies; no numerical output is claimed. Revisit with those implementations and their synthetic cross-view tests. |
| With no public product, require empty/absent public output instead of building a sanitizer or website. Inspect Git candidates for reserved private artifacts too. | Public asset packaging/redaction pipeline. | CI negative tests seed docs, tooling, renamed data, locks and graphs in every guarded root and force-add ignored private files. Revisit only after an explicitly changed product/publication boundary; never silently permit private files. |
| Manual replay/resume and regeneration, no backup/scheduling automation. Preserve explicit nonzero errors. | Managed refresh, automatic lock breaking or retention jobs. | Existing rollback, cursor, lock and CLI-exit tests; source operations belong to 032. Revisit after its real-adapter and separately approved privacy/operations contracts. |
| Integration (2026-11-25): compose actual owner-merged main `68fe4157360abf2d9e50f7ca642ad74649ac974a`, preserving collector reconciliation, identity matching/refresh and all source/test entry points. Cover actual private producer filenames plus reserved review lock/temp aliases, without changing upstream writers. | Rejected reimplementing matching or replacing landed scripts; no blanket private-store approval is inferred from integration. The approved CONTACTS-010 policy remains authoritative. | Full configured CI plus a synthetic demo/replay/inspect/review handoff proves the overlay pins the unchanged collection and stays outside public/Git delivery. Revisit when another producer adds operational filenames or a downstream schema becomes runnable. |
| CONTACTS-023 integration: use the reserved `aggregates.json`, add its UUID staging/request names to the private guard, and keep every existing producer/check entry point. | Rejected a competing report name, source/mapping rewrites or bypassing the landed publication guard. Assumes dependency-free local snapshots remain sufficient. | Synthetic demo/replay/review/aggregate CLI composition pins unchanged inputs and private output; negative tests cover actual aggregate staging/request names. Revisit when CONTACTS-024 defines its own versioned summary. |
