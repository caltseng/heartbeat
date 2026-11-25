# Heartbeat local workflow (CONTACTS-031)

Status: collection is runnable; identity review, aggregation, Heartbeat reports
and graphs remain future implementations under CONTACTS-021 through 025/027.
This workflow composes those stages; it does not mark them delivered. The
[technical contract](contacts-technical-spec.md), [product contract](contacts-store-spec.md)
and [register](contacts-work-items.md) remain authoritative.

## One operator, one local store

Use Node.js 20+, Git and the existing dependency-free CLI. No server, host,
backend, product login, cloud processing, account connection or schedule is
needed. Keep collection skill names and schema names unchanged. Heartbeat names
the reports and relationship/interaction graph, not a bulk contacts rename.

All examples below are synthetic. Store operational files under ignored
`.private\contacts\` or an explicitly approved external local directory.
Use separate synthetic and private stores; never relabel real data synthetic.
CONTACTS-010 plus explicit bounded source authorization remain necessary for
**any** real run, including processing an existing export. This document makes
engineering decisions only: it does not approve ACLs, encryption, retention,
backups, private-account/device/browser access, credentials, sending or schedules.
Never upload real records to remote AI processing.

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

## Local configuration and versioned file handoffs

The implemented configuration is the version-1 collection request itself:
period/as-of/time zone, output, source/account/connector references, input paths,
resume and optional page budget. Paths resolve relative to the request file,
not the shell. Do not put real account IDs, local paths, self identities or configuration in
package scripts, tracked fixtures, environment examples or skills. There is no
additional config loader, credential store or product account system.

Example reserved layout; only the collection files are generated today:

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
  reports/<chosen-run>/
    aggregates.json                 # future CONTACTS-023
    report.json                     # future CONTACTS-024
    graph.html / graph.svg          # future CONTACTS-025
```

| Producer -> consumer | Version and handoff | Gate / required evidence |
| --- | --- | --- |
| Acquisition/demo -> collector | Existing `schemaVersion:1` request and source envelopes | Same data class; explicit source/account/connector, self IDs, roles, period, coverage and provenance. All desired unavailable sources are entries, not omissions. |
| Collector -> identity review | Existing `schemaVersion:1` `collection.json` | Read records, checkpoints, manifest and history as one atomic generation; retain source keys and unknown coverage. Do not edit source evidence to resolve a person. |
| Identity review -> reducer | `identity-review.json`; schema defined by 022 | Explicit mapping revision, reviewed namespaces, reversible decisions and unresolved people. Names/group membership cannot imply merges or households. |
| Collection + mapping -> reducer | Reserved `aggregates.json`; schema defined by 023 | Pin exact collection bytes (SHA-256), data class, mapping revision and resolved half-open period/time zone/as-of. Reconcile source IDs, direct/group roles, exclusions and unknown/lower-bound coverage. |
| Reducer -> Heartbeat summary | Reserved `report.json`; schema defined by 024 | Versioned shared dataset with the same input references, filters, source freshness/coverage, exclusions, counts and daily timeline. Narrative must not invent numbers. |
| Shared report -> Heartbeat graph | Reserved private `graph.html` / `graph.svg`; renderer defined by 025 | Same report revision/digest, period and filters in all views; explain group-only/inactive/unknown categories. Offline files, no remote assets, telemetry or hosted service. |

Reserved filenames are **not implemented schemas or CLI commands**. Each future
JSON producer must declare `schemaVersion`, preserve `dataClass` and pin input
revisions/digests; consumers must reject unsupported versions, mismatched data
classes/periods/revisions and missing inputs, never substitute empty/stale data.
CONTACTS-022/023/024 own exact schemas, version migration and validators.
CONTACTS-025 depends on this workflow, not on this item shipping its renderer.
Do not pass the raw collection directly to a graph or derive totals in a renderer.

Source-acquisition artifacts `handoff.json`, `checkpoint.json`, `report.json`
and `.email-staging-*` directories are private too. Each source adapter owns its
format and recovery contract; reserving these names does not authorize acquisition.

Persist derived generations separately from collection. Future producers must
validate first, write atomically inside the same private boundary (reuse the
collector's output-location checks), and leave prior valid output intact on
failure. Explicitly label partial datasets as observed/lower-bound; interrupted
or invalid inputs block downstream work. Until those consumers exist, stop at
collection: there is no report, graph or all-in-one command to invoke.

## Recovery without losing source evidence

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
evidence; do not overwrite records or relabel data. Restore a known-good coherent
snapshot and matching requests/handoffs from an approved local backup, with no
active writer, or replay into a fresh private directory. Temporary
`collection.json.<pid>.tmp` files are not recovery inputs. No automated backup,
retention or secure deletion policy is selected here. Atomicity assumes a local
filesystem, not a network share or certified power-loss recovery.

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
