# Heartbeat: stable CONTACTS work-item register

Migrated from caltseng/churchtree PR #68, exact merge
`2b222e03ccbe819764eb3a133c318035945f1eac`; see
[provenance](../provenance.md). All IDs are preserved and now belong to
`caltseng/heartbeat`, not Churchtree execution.

**Global bootstrap prerequisite:** every remaining CONTACTS-010 through
CONTACTS-032 item is blocked from execution until this Heartbeat bootstrap
(Phalanx item `1fda16d150ab44ae8313bd455c0240ed`) is verified **checked_in**
by an owner merge into `main`. This prerequisite applies to every row below in
addition to its listed dependencies. "Ready" below describes only the original
bounded task's capability state **after** that prerequisite; it does not permit
starting it now. Do not resume old Churchtree CONTACTS execution.

Scope: [product specification](contacts-store-spec.md) and
[initial technical approach](contacts-technical-spec.md). Stable IDs below are
the dispatch units; dependencies are explicit, not inferred from list order.
This is a checked-in backlog, not a request to execute every item in this PR.

**Delivered baseline** means inherited implementation and synthetic tests included
in this bootstrap, not proof this PR has merged or that live access exists.
**Ready** means bounded work can start without reading private accounts.
**Blocked** means a listed selection/decision/prerequisite is needed, not that
someone should request secrets. No source endpoint is currently connected by this
change. Source skills are delivered instructions plus metadata-handoff collection,
not five implemented live connectors.

Confirmed scope is a **single-user local tool and local JSON store** in Heartbeat.
Prove the flow first; defer polished design. All remaining reporting/graph work
targets local CLI output or generated private files, not a hosted website,
dashboard, backend, multi-tenant infrastructure or product account system.

## Smallest end-to-end slices

**Runnable now:** CONTACTS-001 → CONTACTS-002 → CONTACTS-003 → CONTACTS-004.
Run `npm run contacts:collect -- --demo --output .private\contacts\demo-001`
in a fresh folder. Five synthetic source handoffs become one persisted manifest
and normalized record store. Replaying its request deduplicates; missing real
endpoints must instead appear as unavailable. No account authorization is needed
for this synthetic slice.

**First real-data slice (not delivered):** enforce the approved CONTACTS-010 policy
with verified local protection and retention/deletion controls, obtain private
source/account and each-run approvals, complete
the Google/email access gates (011, 013), implement their selected adapters (012,
014), then run an explicitly authorized metadata-only collection. Record text,
Messenger and WhatsApp as unavailable until their own gates pass. This does not
wait for the graph and does not declare every source connected.

**First summary slice:** collection + CONTACTS-022 → 023 → 024, using synthetic
direct/group/coverage fixtures first. CONTACTS-025 adds the map; 026 adds baseline
signals only after covered historical data exists. Neither is part of the initial
collector implementation.

## Inherited CONTACTS-001 through CONTACTS-004 baseline

| ID / title | Bounded deliverable | Prerequisites | Objectively checkable acceptance |
| --- | --- | --- | --- |
| CONTACTS-001 / Collection contract and technical design | Request, interval, handoff, identity/event and capability contracts in the companion technical spec and validator. | None | 7d/30d/custom bounds and time zone resolve; private/synthetic data classes are distinct; unknown/body/credential fields are rejected; source families and setup states are explicit. |
| CONTACTS-002 / Atomic local ingestion | `scripts/contacts/collect.cjs`: normalized snapshot, source reports, record provenance, per-connector cursors, lock and atomic page commits. | CONTACTS-001 | Replay and overlapping reviewed namespaces retain one source event; failed pages do not advance checkpoints; resume works; errors/unknown history survive beside successful sources; website output paths are rejected. |
| CONTACTS-003 / Composable collection skills | `contacts-collect` plus five focused source skills under `.github/skills/`. Each source can be requested independently through the same importer. | CONTACTS-001, CONTACTS-002 | Instructions identify actual acquisition gates, preserve roles/group evidence and metadata-only boundaries, show the invocation, and report unavailable tools without fictional success. Native parsers/live adapters are explicitly not claimed. |
| CONTACTS-004 / Synthetic runnable slice and checks | Demo generator, `contacts:collect` / `test:contacts` scripts, focused Node tests integrated into Heartbeat's minimal `npm test`. | CONTACTS-002, CONTACTS-003 | Demo imports all five synthetic families without credentials/network; CLI returns 0/2/1 for collected/partial/fatal; tests exercise DST, replay, resume, failures, group roles, conflicts and output safety. |

Migrated specs and Heartbeat documentation accompany this baseline; no source-access gate, native
parser, canonical identity review, numerical reducer, visualization or private
application is marked delivered.

## Access gates and per-source acquisition

Each gate is a distinct investigation/selection task. Read public provider
documentation and inspect available tool schemas without accessing accounts.
Record callable capabilities, snapshot/export alternatives, unsupported formats,
account/device/authorization requirements and history limits. A viable design
with mocks is not proof of authorized live access. Only separately approved
account/device setup can lift a real-data execution block.

| ID / title / state | Bounded scope and deliverable | Explicit prerequisites | Acceptance |
| --- | --- | --- | --- |
| CONTACTS-010 / Private data boundary / Policy documented; synthetic-only guard implemented | [Owner-approved policy and engineering decisions](../privacy.md): own source categories, metadata only, this computer outside Git/sync, Windows-user restriction and verified encryption, 12-month deletion, no automatic backups/remote AI, owner approval per source/account and per run. No credential acquisition or real-run authorization. | CONTACTS-001 | Shared importer fails closed on every private request before handoff reads/output writes, including unavailable-only requests; synthetic CLI tests prove exit 1 without manifest disclosure and unchanged stores. Content/notes remain outside this policy. Local protection verification and operational retention/deletion must exist before enabling real data; synthetic work on other items is not gated by 010 unless explicitly listed. |
| CONTACTS-011 / Google identity access gate / Capability documented; no live access | [Capability record](contacts-google-capability.md) selects read-only `people.connections.list`; documents fields, source IDs, pagination, deletion/sync-token behavior and setup requirements. | CONTACTS-001, CONTACTS-003 | Exact import-only versus selected API routes, snapshot/field limits, approval gaps and synthetic page shapes are documented. The separately implemented 012 synthetic adapter grants no connected access; real-run CONTACTS-010/source authorization remain separate. |
| CONTACTS-012 / Google identity acquisition adapter / Synthetic implementation; live access gated | `scripts/contacts/google.cjs` and `contacts:google` implement only 011's selected route with injected mock transport, private configuration/checkpoints and identity-only handoffs. [Decisions and operation](contacts-google-capability.md#contacts-012-local-adapter-and-delegated-decisions). | CONTACTS-002, CONTACTS-011; CONTACTS-010 additionally for real runs | Mocked pagination, token expiry/resync, duplicate IDs, auth/quota failures and deletions are tested without erasing curated records or generating activity. No network/credential loader ships; private acquisition fails closed before output access (exit 1, no artifacts). Revisions/deletions/aliases remain staged and partial pending 021. |
| CONTACTS-013 / Email access gate / Documented, synthetic only | [Capability map and synthetic payload](contacts-email-access.md) select proposed Gmail API v1 `gmail.metadata`; no connected account/tool is claimed; the synthetic adapter is CONTACTS-014. | CONTACTS-001, CONTACTS-003 | Message/thread IDs, metadata allowlist, To/CC/hidden-BCC limits, unavailable search `q`, pagination versus history, classifications and explicit failure outcomes are documented. Exact source/account and each-run approval plus verified local controls remain required under the approved CONTACTS-010 policy. |
| CONTACTS-014 / Email acquisition adapter / Implemented: synthetic transport only | [Gmail metadata adapter/decision record](contacts-email-adapter.md) produces metadata handoffs and a separate native list-token checkpoint; synthetic-only CLI, no HTTP/OAuth/account access. | CONTACTS-002, CONTACTS-013; CONTACTS-010 additionally for real runs | Synthetic direct/To/CC/BCC/broadcast/bulk cases preserve one source message per event; pagination, page rollback, auth failure, expired list cursors, replay and private output are tested. Terminal/empty enumeration stays partial. History sync/reconciliation is not implemented. |
| CONTACTS-015 / Text device and format gate / Specified: design only | [Selected profile and evidence](contacts-text-format-gate.md): owner-operated Android 14, SyncTech 10.30.009 full XML, `synctech-xml-metadata-v1`. No device verified or converter delivered. | CONTACTS-001, CONTACTS-003 | SMS/MMS protocol evidence, lawful future setup, synthetic fields, millisecond timestamps, archive-local IDs, reviewed thread ledger and unknown cloud/RCS/group coverage are explicit. Real acquisition remains unauthorized. |
| CONTACTS-016 / First text metadata converter / Synthetic implementation | [Converter contract and delegated decisions](contacts-text-converter.md): implements only the XML profile chosen by 015; later formats are separate tasks. Real conversion remains rejected pending separate approval/design. | CONTACTS-002, CONTACTS-015; CONTACTS-010 additionally for real runs | Synthetic four-person group, direct SMS, time-zone ambiguity, missing stable IDs and reimport fixtures preserve original roles and timestamps; ambiguous formats fail visibly; no message-body storage. Implementation is not proof of merge or source access. |
| CONTACTS-017 / Personal Messenger access gate / Capability documented; no live access | [Capability decision](contacts-messenger-capability.md) selects proposed local `messenger-json-snapshot-v1` conversion; distinguishes installed-tool evidence, discovery, Muse UI, business APIs and personal exports. | CONTACTS-001, CONTACTS-003 | Available metadata import versus proposed conversion, layout/profile version, unknown producer version, encrypted-history/identity/overlap limits and setup approvals are explicit. No personal acquisition is claimed; 018 remains separate and browser success cannot close structured access. |
| CONTACTS-018 / First Messenger acquisition route / Blocked: selected personal route | Implement one viable route from 017, either a verified adapter or a versioned metadata-only export converter; never a fictional personal API. | CONTACTS-002, CONTACTS-017; CONTACTS-010 additionally for real runs | Synthetic direct and four-member group fixtures preserve one sender/event; local IDs are labeled and stable; truncated/encrypted export history and unsupported layouts yield partial/unsupported results; no private browser-session reuse. |
| CONTACTS-019 / Personal WhatsApp access gate / Specified: design only | [Selected profile and decisions](contacts-whatsapp-format-gate.md): owner-provided iOS Without Media UTF-8 TXT, `whatsapp-ios-txt-metadata-v1`. No producer certified, personal tool connected or converter delivered. | CONTACTS-001, CONTACTS-003 | Actual synthetic importer vs proposed converter/business routes, archive-local IDs, strict overlap gate, reviewed source-zone offsets, group/linked-device/history limits and unverified public evidence are explicit. Approved metadata policy does not permit real raw exports; private imports remain disabled. |
| CONTACTS-020 / First WhatsApp acquisition route / Ready for synthetic work after 019 check-in | Implement only the TXT profile selected by 019, with explicit snapshot/live capability status; alternate formats need separate review. | CONTACTS-002, CONTACTS-019; CONTACTS-010 additionally for real runs | Synthetic exact replay, changed/overlapping export rejection, direct/four-person group, ambiguous local times/boundaries/senders, missing IDs and history limits are tested; imports follow the private local-ID/ledger strategy. Deny private runs before native input/registry/output access. A real export needs a separately approved content boundary, exact source/account and each-run authorization plus verified local controls; no pairing or sending is automated. |

## Shared model, summaries and product views

| ID / title / state | Bounded scope and deliverable | Explicit prerequisites | Acceptance |
| --- | --- | --- | --- |
| CONTACTS-021 / Source revisions and overlap reconciliation / Synthetic implementation | [Revision/overlap contract and delegated decisions](contacts-source-revisions.md): explicit identity/thread/event revisions, per-thread coverage, edit/deletion targets and reviewed connector-ID translation; retain immutable source evidence and review audit. | CONTACTS-002 | Synthetic changing profiles, edits, deletion tombstones, differing thread coverage, historical membership and different-ID connectors are covered without duplicate messages or destructive replacement; revision branches and broken target links keep the manifest partial. Absent historical targets remain informational pending links. No real access or reducer is delivered. |
| CONTACTS-022 / Identity review skill / Implemented: synthetic only | Independent `contacts-identity-review` skill and `contacts:review` CLI persist a [versioned overlay](contacts-identity-review.md) from namespaced identities to stable canonical people, with reviewed evidence, reversible split/undo and optional curated households. | CONTACTS-001, CONTACTS-002 | Same-name identities stay distinct; explicitly reviewed email/phone/provider matches combine; source observations and original note references survive; household membership is never inferred; exact collection digest and mapping revision are required. No note editor or private-run authorization. |
| CONTACTS-023 / Cross-source aggregation skill and reducer / Blocked: identity contract | Add pure deterministic per-person/thread/channel/day aggregation over snapshots and a focused skill to run it. Do not render UI. | CONTACTS-021, CONTACTS-022 | Synthetic fixtures prove half-open boundaries, DST date unions, one event per source ID, direct versus group-only activity, To/CC handling, bulk/unclassified disclosure, unknown versus zero and lower-bound totals. All totals reconcile to source events and coverage. |
| CONTACTS-024 / Period summary contract and presentation skill / Blocked: aggregates | Persist one shared 7d/30d/custom reporting dataset and a focused summary/presentation skill, with people table, per-channel counts and daily timeline data. | CONTACTS-023 | Fixed-fixture totals match across table/timeline/summary; period, time zone, as-of, mapping revision, exclusions, source freshness and coverage travel with every output; no narrative-generated numbers; known inactive people remain in the cohort. |
| CONTACTS-025 / Local user-centered graph / Blocked: report dataset | Generate a private local Heartbeat hub-and-spoke HTML/SVG view with supporting person-to-thread evidence, not a Muse screen or hosted dashboard. Prove behavior before polished design. | CONTACTS-024, CONTACTS-031 | Synthetic fixtures show user at center, intentional labeled frequency bands, visible recency, group-only and unknown coverage categories, an outer inactive band, explainable selection details, keyboard access and usable mobile portrait/landscape. All views use the same filters; files work locally without a hosted service and do not imply emotional closeness. |
| CONTACTS-026 / Reconnection opportunity and outlier signals / Blocked: covered history | Compute explainable deviations from each person's own baseline and due curated rhythms, separate from frequency ranking. | CONTACTS-024, CONTACTS-027 | Covered synthetic decline and due-rhythm cases surface with baseline/current/last-contact/reason; insufficient or mismatched coverage cannot become decline; no importance score, guilt ranking, auto-send or meaningful-date reset. Thresholds are explicit proposals/tuning values. |
| CONTACTS-027 / Curated relationship records and note capture / Blocked: identity review | Define locally persisted canonical households, groups, unchanged original notes, explicit meaningful connections and curated rhythms, independent from observations. | CONTACTS-022 | One household can have one person; one note can involve several households; capture and encounter dates remain separate; observed mail/group activity never resets confirmed connection dates; source changes cannot overwrite curated notes. |
| CONTACTS-028 / Weekly reconnection review / Blocked: curated records and aggregates | Add a user-invoked explainable household recommendation workflow with follow-up completion/deferment, using saved records and source links where available. | CONTACTS-024, CONTACTS-027 | Recommendations show evidence, last confirmed connection or unknown, outstanding context and an actionable existing thread; deferral does not alter long-term rhythm; no automatic sending or schedule creation. |
| CONTACTS-029 / Prayer triage / Blocked: private note workflow | Add user-invoked editable prayer plans and explicit request/status updates grounded in original notes. | CONTACTS-027, CONTACTS-010 | Synthetic request/update examples preserve originals, ask for ambiguous status, and never infer answered/resolved from elapsed time; no sensitive context leaks into outreach outputs. |
| CONTACTS-030 / Life-update audience review / Blocked: canonical records | Add editable household-to-individual recipient selection with inclusion reasons and explicitly recorded wording preferences. | CONTACTS-027, CONTACTS-010 | Synthetic missing/ambiguous/duplicate addresses are visible; exclusions are editable; beliefs are not inferred; final output is a reviewed list/draft only, with no sending or donation records. |
| CONTACTS-031 / Local workflow integration / Ready | Extend the minimal single-user local CLI/file workflow from collection through later Heartbeat reports/graphs, reusing the local JSON store and private output boundary. Add no host, server, cloud backend or product account system. | CONTACTS-001, CONTACTS-004 | Extend bootstrap commands/layout/recovery to later implemented stages with synthetic versioned handoffs, local configuration outside git, and checks keeping private datasets/checkpoints/graph files uncommitted. There is no public-output pipeline to build or deploy. Real source data still requires CONTACTS-010. |
| CONTACTS-032 / Source operations and retention / Blocked: real adapter contracts | Add explicit refresh/resync, stale-source reporting, retention/deletion and recovery UX for chosen acquisition routes. Scheduling requires separate authorization. | CONTACTS-010, CONTACTS-021, and each adapter among 012/014/016/018/020 that it operates | Synthetic interruption, expired cursor, source disconnection and deletion cases preserve curated notes, expose stale coverage, purge approved cached metadata and recover without duplicate events; no recurring job is silently created. |

## Dispatch boundary

Only the service owner merges the independently reviewed exact HEAD. Agents must
not enable auto-merge, schedule a merge, self-merge or execute merge commands.
The stable GitHub Actions check is `Heartbeat synthetic baseline`; the owner must
configure Heartbeat Phalanx `ready_checks` before merging. Captain coordinates
independent review and must receive the exact PR/head/green-check evidence.
An open green PR does not lift the global bootstrap execution dependency.

After the prerequisite PR is merged, hand this register and its merged commit to
Phalanx Captain. Dispatch remaining IDs with the dependencies and blocked conditions
above; do not redispatch CONTACTS-001 through 004 as unimplemented connectors.
Access-gate investigations and synthetic implementation do not grant account access.
Captain should retain blocked items explicitly rather than treating missing
credentials/devices or nonexistent APIs as completed work.
