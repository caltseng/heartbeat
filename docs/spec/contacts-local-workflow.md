# Heartbeat local workflow (CONTACTS-031)

Current command map, not another schema or source-access grant.
[Shared operating rules](contacts-technical-spec.md#shared-operating-rules),
[privacy](../privacy.md), [development/checks](../development.md) and
[register](contacts-work-items.md) govern. One local operator, synthetic
processing, pinned versioned JSON inputs and separate immutable report
generations; no server/backend/account system/orchestrator/schedules.

Manual real-source [V0 retrieval](contacts-manual-retrieval.md) is separately
per-run-approved, user-invoked source-API metadata to verified private local
handoff. It needs no future automation/privacy platform and enables **no private
import or aggregation**. Ignored checkout output is only for synthetic examples.

## Commands that exist today

```powershell
npm run ci
npm run contacts:collect -- --demo --output .private\contacts\demo-031
npm run contacts:collect -- --request .private\contacts\demo-031\request.synthetic.json
npm run check:private
```

Demo creates five handoffs and four distinct message events; Google identities
create none. Replay deduplicates, not upstream refresh. Inspect every exit:
0 complete declared workflow, 2 saved partial/unsupported/setup, 1 fatal. Never
chain a failed stage as success; cursors/EOF do not prove complete history.

| Command / owning contract | Inputs, output and pin |
| --- | --- |
| [collect](contacts-technical-spec.md#request-contract) | Version-1 request/handoffs -> atomic collection.json; source/account/connector/self/roles/period/coverage explicit. Unavailable sources remain entries. |
| [review](contacts-identity-review.md) | contacts:review --inspect / --request. Version-1 collection/output/expectedRevision/reason/operations request; inspect then add exact collectionDigest/current revision. identity-review.json retains reviewed canonical IDs/history/inactive links; changed metadata requires refresh, no automatic match. |
| [aggregate](contacts-aggregation.md) | contacts:aggregate --request. collection, mapping, explicit identityMappingRevision, period/channels, fresh output -> aggregates.json. Exact review-history revision binds collection bytes; source-event ledger/direct-group/day unions retain uncertainty. |
| [summary](contacts-period-summary.md) | contacts:summary --request, same pins/period/channels as aggregate -> fresh report.json, built directly through reducer (no intermediate aggregate write). All people/channel/timeline/summary views retain context/digest. |
| [graph](contacts-local-graph.md) | contacts:graph --request: schemaVersion/dataClass/report/reportDigest/output -> fresh graph.html. Pin exact report bytes, same filters/context; progressive hash-pinned inline script and script-disabled native SVG fallback. No remote assets/telemetry/service. |
| [interactive demo](contacts-local-graph.md) | contacts:demo --output .private\contacts\interactive-001 -> index.html and real generated graphs. 37 synthetic peers; deliberate partial WhatsApp returns 2. Email-only view illustrates channel-covered inactivity, not global silence. |
| [Google](contacts-google-capability.md#contacts-012-operation) | contacts:google --config: fixture -> acquisition state plus immutable named handoff; native token is not collector cursor. |
| [email](contacts-email.md) | contacts:email --synthetic-request -> fresh handoff/checkpoint/report bundle; native list-token recovery owned by adapter. |
| [texts](contacts-text-messages.md) | contacts:text-xml --xml --manifest --output -> selected synthetic XML handoff/request, strict archive binding. |
| [Messenger](contacts-messenger.md) | contacts:messenger --synthetic-request -> synthetic declared-shard handoff/report, account-level snapshot guard. |
| [WhatsApp](contacts-whatsapp-format-gate.md#contacts-020-operation) | contacts:whatsapp --txt --manifest --output -> registry/acquisition handoff/request, account/thread binding. |
| [curation](contacts-curated-records.md) | contacts:curate --inspect / --request -> separate curated.json, canonical-view digest/curation revision; original notes, explicit connections/groups/rhythms. |
| [prayer](contacts-prayer-triage.md) | contacts:prayer -> note-grounded synthetic overlay, confirmed/unknown status and editable plans; no outreach export. |
| [audience](contacts-life-update-audience.md) | contacts:audience --inspect / --request / --finalize -> editable audience.json plus exact-input final review; explicit reasons/wording/address choice, no sending. |
| [reconnection](contacts-reconnection-review.md) | contacts:reconnect --inspect / --request / --report -> follow-up/deferral/link overlay and fresh immutable report; summary+curated pins, optional saved prayer, no meaningful-date reset. |
| [opportunities](contacts-opportunities.md) | contacts:opportunities -> same-snapshot/mapping covered own-baseline decline and separate curated civil-date rhythms, immutable report. |
| [operations](contacts-source-operations.md) | contacts:operate --request -> explicit synthetic refresh/resync/inspection/inventoried deletion/recovery. Managed stores use this, not direct import. |

Detailed request shapes belong to the linked owning contracts, not duplicated
here. Configuration remains private and local to each command, not package
scripts/skills/global config. Existing schemaVersion 1/dataClass/input pins
remain required. Unsupported/mismatched version/class/period/revision/digest or
missing inputs fail, never substitute stale/empty evidence.

## Local configuration and versioned file handoffs

Collection stores source records/checkpoints/manifest/history as one generation.
Use `readCollection` to expand compact revision references, but bind review to
exact original bytes. Review overlay is the canonical membership authority;
curation never maintains a competing person/household model. Reducer consumes
collection+explicit reviewed revision; summary uses that reducer; graph consumes
only the saved report. Rendering never re-filters/recalculates its own totals.
Standalone graph.svg remains reserved, not emitted.

Suggested separate directories: demo/collection, reviewed, curated,
reports/<fresh-generation>, graphs/<fresh-generation>. Keep curated.json,
curated.lock and curated.json.<pid>.tmp in a curated subdirectory or sibling,
**never managed-store root/purge inventory**. Original curated records are not
disposable derived cache.

Actual and reserved requests/configs, handoffs/checkpoints/reports, lock/temp
aliases, Google generations, email staging, WhatsApp registry/acquisition bundles,
review histories and generated graphs are private operational artifacts.
Names do not authorize acquisition or change upstream persistence.

## Recovery without losing source evidence

For unmanaged/unpurged collection preserve coherent original snapshot/request/
handoffs; inspect checkpoint/PID, verify dead writer, remove only exact stale
collection.lock and resume:true with unchanged period/as-of and saved cursor.
Missing cursor needs matching handoff, not invention; changed period uses
resume:false. Conflicts/class/version mismatch stop without overwrite/relabeling.
Temporary JSON is not a snapshot/overlay.

For review, inspect actual revision/digest after uncertain write; remove only
verified stale identity-review.lock, reinspect and explicitly refresh/rebind.
Never hand-edit history or reuse stale preconditions. Regenerate new derived
outputs from pinned inputs; an older report is not fresh after upstream changes.
Source converters own their exact-replay recovery. Managed pending purge must
finish through operations before import; do not restore erased handoffs/history.
No automatic backup, lock breaking or recurring retention job. Local atomic
rename does not certify network/power-loss safety or private OS protection.

## Automated publication boundary

check:private in npm run ci rejects content/files/redirects at public, dist,
build, out, _site and .output, including renamed docs/tooling/data/graphs.
It inspects Git tracked/nonignored candidates (including force-added ignored
files) for .private, environment/key files, email staging and reserved private
operational filenames. Additional destinations:

```powershell
npm run check:private -- --output <repo-relative-or-absolute-directory>
```

This is audit, not generation/upload/deletion or payload scanning/access control.
Tracked docs/skills are source, not website output. New artifact/output names
must extend guard/tests; synthetic labels cannot be machine-certified.
CI exercises demo/replay/review/reducer/report composition and private negative
cases. Engineering history: [CONTACTS-031](../decisions.md#contacts-031).
