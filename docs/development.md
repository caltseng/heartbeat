# Developing Heartbeat

Read [AGENTS.md](../AGENTS.md): topic branches, PRs to `main`, independent
exact-final-head review and authorized retained-writer delivery.

## Checks and CI

Use Node.js 20.11.0+ and run `npm ci` to restore the pinned TypeScript compiler,
Node types and `tsx` runtime. Source and tests are TypeScript; `tsx` runs them
directly without emitting JavaScript into the checkout. No browser, device,
private environment or server is required.
The minimum matches CI and supports the `--import tsx` loader registration.

The migration checks every source and test with TypeScript, using shared
interfaces for handoffs, stored records, review results and acquisition
dependencies. Legacy JSON-heavy paths retain non-strict inference
(`strict: false`); this is not full strict-mode coverage. Existing runtime shape/privacy
validation remains authoritative for parsed input, including deliberately
invalid synthetic fixtures.

Shared contacts infrastructure lives in `scripts/contacts/lib.ts`: JSON parsing
with a single leading BOM removed, exact-byte versus serialized-JSON SHA-256,
output-path guards, exclusive locks, durable atomic replacement, no-clobber
publication and synchronous/asynchronous CLI error handling. It also owns the
shared object/text/identifier/instant validators, source/channel constants and
record-revision fallback. Commands select validator policies and retain their
error messages/codes, lock metadata and result formatting. A single `CollectionError`
type carries status/retryability and an origin domain; adapter catch boundaries
check that domain so shared infrastructure failures are not mistaken for
adapter failures. The collector's reconciliation-aware `persist` and its existing helper
exports remain compatible; `local-json.ts` re-exports the shared persistence API.
Collection snapshots use `collection-store.ts` for compact revision-reference
storage and legacy expansion; use `readCollection` when inspecting record
payloads, and keep digests bound to the exact on-disk bytes. Generic JSON readers
do not expand collection references.
Temporary-file collisions must preserve the other writer's file. Focused
`lib.test.ts` regressions run with `test:contacts` and CI; no private data is used.

```powershell
npm run test:contacts
npm run typecheck
npm run check
npm run ci
```

`test:contacts` discovers every `*.test.ts` under `scripts/contacts`;
`npm test` discovers tests throughout `scripts`, including the private-boundary
tests using temporary Git repositories. `scripts/test.ts` passes the sorted
explicit file list to Node's built-in test runner with the TypeScript loader,
including on Node 20 where directory discovery does not recognize `.ts` files.
Additional Node test options can follow `--` in either npm test command.
`check` runs the compiler over all source and tests and runs `check:private`;
`ci` runs `check` and `test`. New modules and tests in these directories need no
`package.json` edit. Existing module-specific `check:*` aliases now run the
shared compiler check. Shared synthetic test helpers in `scripts/contacts/fixtures.ts`
provide per-test temporary directories with cleanup and identity mapping
inspection/application with current revision and digest preconditions.
Scenario-specific inputs and assertions stay in each test file.
Keep helper filenames outside Node's test naming patterns (including `test-*`)
so helpers are not counted as empty test files.
Tests generate synthetic fixtures in
temporary directories and clean them up; they include actual CLI 0/2/1 exits,
all five families, replay, connector provenance, resume, rollback, record
conflicts, direct/group roles, missing-versus-empty history, DST/custom intervals,
lock conflicts and unsafe output rejection. CONTACTS-010 cases additionally
exercise all-source private denial before handoff reads/output writes,
unavailable-only private denial, snapshot preservation, rejected approval claims and fatal CLI
denial without account/manifest disclosure. No live endpoint is verified.
The [CONTACTS-014 adapter](spec/contacts-email-adapter.md) adds native Gmail
metadata fixtures, separate native/handoff cursors, page rollback, auth/expiry,
classification and a synthetic-only CLI with immutable private output.
The [CONTACTS-018 Messenger converter](spec/contacts-messenger-converter.md)
adds synthetic direct/group JSON shards, stable snapshot-local IDs, conservative
overlap rejection, interrupted conversion/retry and unsupported history/layout
cases. Its CLI also rejects private conversion.
Google tests cover the selected request parameters, duplicates, expiry/resync,
quota/auth failure, conservative
revisions/deletions, checkpoint binding and failed atomic writes. No live endpoint
is called or verified; Google acquisition has only a synthetic transport.
The [text converter](spec/contacts-text-converter.md)
adds synthetic direct/four-person MMS, DST instants, XML failures, role/setup
ambiguity, content exclusion and immutable archive replay checks. No live
endpoint or actual device/producer export is verified.
CONTACTS-021 additionally covers append-only revisions, branch resolution,
mutation targets/tombstones, historical membership, thread-specific coverage,
and reviewed different-ID connector translations with retained source evidence.
Text archive binding tests also reject unbound pre-existing text events after
explicit revisions, without changing their records or reserving an archive.
Text, Messenger and WhatsApp snapshot imports use one profile-driven
`snapshotBinding` function and the shared `snapshot_conflict` error code.
Profile adapters retain their existing handoff fields, account/thread scopes,
namespace checks and persisted archive formats; no store migration is required.
Bindings are reserved only with a validated page. The shared importer tests run
the same replay, overlap, alternate-route, namespace and rollback cases for text
and Messenger; converter-local errors remain separate.
See the [revision contract and decision record](spec/contacts-source-revisions.md).
Identity-review cases additionally exercise conservative reviewed matches,
same-name separation, cross-namespace identity links, split/undo, stable note
references, curated household conflicts, revision/digest preconditions, private
input rejection and transactional rollback. No private notes are read.
CONTACTS-022 reads current reconciled identities, preserves inactive
tombstone/collision/missing links, and requires explicit metadata refresh. Its
integration cases exercise the actual collector's revision/target semantics,
including informational historical pending targets.

CONTACTS-032 adds `operations.test.ts` and `check:operations` to `npm run ci`.
The [source operations contract](spec/contacts-source-operations.md) covers
synthetic refresh/resync, stale/disconnected sources, calendar retention,
inventoried cache deletion, replay fences and interrupted-purge recovery.
All checks remain synthetic and account-free; development dependencies are
installed reproducibly from `package-lock.json`.

Collector page preparation indexes pending records/revisions, reviewed translations
and memberships by thread; email acquisition indexes reviewed threads, classifications
and message IDs. These indexes are transient: array ordering, stored evidence,
duplicate/conflict checks and page-atomic rollback retain the v1 contract.
The synthetic scale regression acquires and persists single-page 2,000/4,000-event
imports (40 messages per reviewed direct thread) and prints elapsed milliseconds.
Run it alone for timing rather than comparing wall time under parallel CI load:

```powershell
node --import tsx --test --test-name-pattern="single-page synthetic imports" scripts\contacts\email.test.ts
```

The local performance target is under 2 seconds at 2,000 events and approximately
linear scaling to 4,000. CI verifies the ordered records and roles at both sizes,
not a machine-dependent time limit. JSON snapshot serialization and durable writes
remain part of the measured import; no real source or account is exercised.

CONTACTS-029 adds `prayer.test.ts` and `check:prayer` to CI. The
[prayer triage contract](spec/contacts-prayer-triage.md) covers original-note
grounding, explicit confirmed/ambiguous status, editable ordered plans, atomic
rollback, stale evidence/revision rejection, private denial and CLI 0/2/1 exits.
Prayer artifacts extend the private Git boundary; no outreach exporter is added.

The [local workflow](spec/contacts-local-workflow.md) defines current commands,
future versioned handoffs and recovery. `npm run check:private` rejects nonempty
public output roots and private operational Git candidates, including force-added
ignored files. Synthetic negative tests seed contacts docs/tooling, renamed data,
checkpoints and graphs into every guarded output root. No public build/deployment
pipeline is added. Audit any additional public export path explicitly with
`npm run check:private -- --output <directory>`; new output locations/artifact
names must extend the guard. This check is not payload scanning or access control.
A synthetic demo/replay/inspect/review CLI integration case additionally verifies
the versioned overlay pins an unchanged collection and remains ignored locally;
force-adding its generated mapping fails the Git delivery guard.

The [CONTACTS-020 WhatsApp converter](spec/contacts-whatsapp-format-gate.md#contacts-020-operation-and-delegated-decisions)
adds synthetic selected iOS TXT parsing, immutable registry/import bindings,
reviewed multiline/sender/time-zone ledgers, DST folds/gaps, overlap/replay,
group/exclusion/history limits, sanitized CLI exits and private denial before
native/registry/output access. No real producer/export or live source is verified.

GitHub Actions runs `.github/workflows/ci.yml` for PRs targeting `main` and pushes
to `main`, on Node 20.11.0. Its stable job/check name is
**`Heartbeat synthetic baseline`**. The workflow needs only `contents: read` and
no secrets or deployment permissions. It restores the lockfile with `npm ci`
before running the compiler and synthetic suite. The service owner must
configure that exact check in Phalanx `ready_checks` before merging the bootstrap;
repository required-check/ruleset configuration remains owner-controlled and must
not be bypassed. Green checks are not independent review or permission to merge.

## Delivery and active-execution adoption

For explicitly authorized `checked_in` work, the same retained writer owns delivery
through independent review, required CI, rework and verified primary-PR merge into
`main`. Any qualified reviewer independent of the writer may review; no particular
named session is required. Self-review does not satisfy this gate. Record the
reviewer's identity, exact final commit and approval evidence alongside the PR
and check results. Only after that review and required CI pass may the writer
enable GitHub auto-merge or execute a normal permitted merge. Repository GitHub
reviews, checks and protections still apply; never waive them, use admin overrides
or require a routine service-owner/manual merge hop instead of authorized delivery.

Keep mutation ownership serialized with the retained writer. Reuse the branch's
one open PR, inspect live state before changing it and reconcile uncertain
push/merge outcomes before retrying so delivery remains idempotent. Conflicting
PRs require integrating actual current `main` changes, not merely retrying merges
or discarding another item's work. Any new head, including integration or review
fixes, requires fresh checks and independent exact-final-head review before merge.
Observe GitHub's primary PR merge and target base before reporting `checked_in`;
an open green PR, approval, auto-merge request or another PR's merge is not delivery.

Explicit `ready_for_check_in`/ready-only targets stop without merge; report-only
work stays a report and explicit draft publication stays draft. Do not enable
auto-merge under those ceilings, and disable pending auto-merge if an authorized
target change removes merge authority. Do not infer promotion from green checks.
Delivery authorization changes no synthetic-only validation, private-data/source/
device access, no-sending or no-scheduling/privacy boundary.

**Active-execution adoption (2026-11-25):** this policy-change item
`21da9c92b1c2457eba2028386c0d471f`, execution
`0b39cde1d76a49e58853dac6ca5270f1`, explicitly requests authorized retained-writer
delivery. Other active executions may still carry immutable acceptance requiring
owner-only/manual merge or a named reviewer. Captain must inspect and record each
affected item/execution, its conflicting acceptance and the explicit authorized
adoption decision through the execution's supported owner/Captain decision path.
This repository edit alone does not rewrite those criteria, change targets or
raise draft/report ceilings. Until that reconciliation is recorded, surface the
specific conflict rather than silently overriding it or leaving it waiting for
an unexplained owner hop.

Captain's owner-inspected adoption inventory at this change's preparation:

| Work | Item / execution | Observed state / required adoption |
| --- | --- | --- |
| CONTACTS-026 | `a551e858d4a84ddabe81b3d8246fa7a1` / `1ef8cda632e84914a21eccbbbcd6871e` | Reserved/running, version 3; native writer creation underway. |
| CONTACTS-028 | `174cdee7dd144f07b13dd9bcd0b0986c` / `cc67c244e4044e66af7d41829324eb55` | Queued, version 2. |
| CONTACTS-025 | `997e4411757445fcac46e42f37444e61` / `8c92f1b316cc47d69a84c16b44bc2b92` | Queued, version 2. |

All three carry acceptance beginning `Unconditional Heartbeat delivery override:
comply with AGENTS.md OWNER MERGE`. Captain/operator must reconcile that immutable
owner-only restriction through supported versioned queued/delivery adoption and
record the decision before retained-writer merging; this writer changes only its
own policy worktree, not those executions. CONTACTS-020/024/030 are already verified
merged/completed; do not revive their ended writer credentials. This is a dated
snapshot, not a claim that adoption has occurred; refresh live execution state
and versions before acting.

## Adding a collector

For the focused user-invoked retrieval path, follow
[manual V0](spec/contacts-manual-retrieval.md) instead of building another
connector. Its `contacts:retrieve-save` helper publishes projected metadata only;
`manual-retrieval.test.ts` exercises mocked tool results and the unchanged private
import guard. No real account access is authorized during implementation.

1. Read the [stable register](spec/contacts-work-items.md) and
   [technical contract](spec/contacts-technical-spec.md). Do not start remaining
   CONTACTS work until the bootstrap is verified checked in. Preserve stable IDs.
2. Complete the source-specific route/format gate and distinguish a proposed
   adapter from a callable authorized tool. Keep private-run approval separate
   from synthetic implementation. Do not access accounts to build a fixture.
3. Keep acquisition/conversion separate from the shared importer. Reuse its
   versioned envelope, namespaced source/account IDs, explicit self identities,
   sender/recipient roles, timestamps, cursors, coverage and provenance. Do not
   duplicate collection/storage logic or add unneeded dependencies.
4. Add focused synthetic cases to `scripts/contacts/collect.test.ts` (or an
   adapter-specific `*.test.ts` file discovered automatically). Exercise
   pagination/expiry/failure, unknown coverage, replay and format ambiguity.
   Never commit native real-account exports or copy another checkout's data.
5. Update the relevant source skill, capability matrix and affected docs. Adding
   a skill alone does not deliver a live connector; unavailable routes must
   remain visibly unavailable. Run `npm run ci`, self-review, commit and publish
   the exact head for independent review and delivery under the item's authorized
   target and publication ceiling.

Preserve `contacts-*` skill names, `scripts/contacts/`, schema version and store
names unless a separately specified compatibility change requires otherwise.
Heartbeat names the product and future local reports/maps, not a bulk schema
rename. Identity review is a separate synthetic-only overlay; see its
[contract and engineering decisions](spec/contacts-identity-review.md).
The [CONTACTS-027 curated store](spec/contacts-curated-records.md) adds
`contacts:curate` and `curated.test.ts`: exact original notes, explicit connections,
groups, per-household rhythms, reference preservation, atomic rollback and CLI
0/2/1 exits. It reuses canonical reviewed households; no real notes are authorized.
The independent [CONTACTS-023 reducer](spec/contacts-aggregation.md) is also
synthetic-only. Its fixtures cover exact mapping/snapshot binding, half-open
boundaries, DST date unions, source-ID deduplication, historical thread context,
direct/group/To/CC/BCC semantics, coverage bounds and immutable CLI output.
Renderers remain distinct work items.

The [CONTACTS-030 audience CLI](spec/contacts-life-update-audience.md) adds
`check:audience` and synthetic `audience.test.ts` to `npm run ci`. Cases cover
household-to-person editing, inclusion/exclusion reasons, explicit wording,
missing/invalid/ambiguous/duplicate email addresses, stale exact-input review,
unavailable sources, unchanged notes, atomic rollback and actual CLI 0/2/1 exits.
No real contacts, beliefs inference, sending or donation records are introduced.

The [CONTACTS-024 period report](spec/contacts-period-summary.md) adds
`contacts:summary`, a focused presentation skill, `summary.test.ts` and
`check:summary` in CI. Synthetic cases reconcile summary/table/channel/timeline
counts, preserve inactive peers, exact zeros versus unknown/lower bounds,
cross-channel reviewed identities, DST/skipped-date calendars, 7d/30d/custom
bounds, standalone view context, immutable CLI output and private-run denial.
The workflow guard also exercises collection-to-summary without changed inputs.

The [CONTACTS-025 graph](spec/contacts-local-graph.md) adds `contacts:graph` and
`check:graph` to CI. Synthetic cases exercise exact frequency thresholds,
recency, direct/group/membership separation, interval membership bounds, unknown
coverage, identical report filters across views, cohort pagination, native
keyboard links, responsive scrolling, HTML escaping, private denial, immutable
publication and CLI 0/2/1. No browser dependency or service is required at runtime.

The [CONTACTS-026 opportunity report](spec/contacts-opportunities.md) adds
`contacts:opportunities`, `opportunities.test.ts` and `check:opportunities` to CI.
Synthetic cases cover threshold boundaries, matched complete versus uncertain/
asymmetric/absent channel coverage, group-only/no-history suppression, separate
civil-date rhythms, unchanged inputs, immutable output and CLI 0/2/1.

The [CONTACTS-028 reconnection review](spec/contacts-reconnection-review.md) adds
`contacts:reconnect`, `check:reconnection` and `reconnection.test.ts` to CI.
Synthetic cases cover evidence-category ordering/overflow, due civil-day
boundaries, unknown/confirmed/observed separation, original notes and prayer
status, direct/group/passive membership, saved links, thread tombstones,
follow-up completion, deferral expiry without rhythm changes, stale input/revision,
atomic rollback, immutable report publication and sanitized CLI 0/2/1 exits.
No real content, source access, sending or schedules are authorized.
