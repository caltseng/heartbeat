# Developing Heartbeat

Read [AGENTS.md](../AGENTS.md): topic branches, PRs to `main`, independent
exact-head review and **OWNER MERGE**. Do not enable auto-merge or execute merges.

## Checks and CI

Node.js 20+ and npm are sufficient; the baseline has no package dependencies.
No install, build, browser, device, private environment or server is required.

```powershell
npm run test:contacts
npm run check
npm run ci
```

`test:contacts` runs Node's built-in test runner for the collector, email/Google
adapters, text/Messenger/WhatsApp converters and identity review. `npm test` also runs the
private-boundary tests using temporary Git repositories. `check` checks all
collection/demo, adapter, converter, review and test CommonJS files' syntax and
runs `check:private`; `ci` runs checks and tests. Tests generate synthetic fixtures in
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
See the [revision contract and decision record](spec/contacts-source-revisions.md).
Identity-review cases additionally exercise conservative reviewed matches,
same-name separation, cross-namespace identity links, split/undo, stable note
references, curated household conflicts, revision/digest preconditions, private
input rejection and transactional rollback. No private notes are read.
CONTACTS-022 reads current reconciled identities, preserves inactive
tombstone/collision/missing links, and requires explicit metadata refresh. Its
integration cases exercise the actual collector's revision/target semantics,
including informational historical pending targets.

CONTACTS-032 adds `operations.test.cjs` and `check:operations` to `npm run ci`.
The [source operations contract](spec/contacts-source-operations.md) covers
synthetic refresh/resync, stale/disconnected sources, calendar retention,
inventoried cache deletion, replay fences and interrupted-purge recovery.
All checks remain dependency-free, synthetic and account-free.

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
no secrets, dependencies or deployment permissions. The service owner must
configure that exact check in Phalanx `ready_checks` before merging the bootstrap;
repository required-check/ruleset configuration remains owner-controlled and must
not be bypassed. Green checks are not independent review or permission to merge.

## Adding a collector

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
4. Add focused synthetic cases to `scripts/contacts/collect.test.cjs` (or an
   adapter-specific test with an explicit npm test entry when needed). Exercise
   pagination/expiry/failure, unknown coverage, replay and format ambiguity.
   Never commit native real-account exports or copy another checkout's data.
5. Update the relevant source skill, capability matrix and affected docs. Adding
   a skill alone does not deliver a live connector; unavailable routes must
   remain visibly unavailable. Run `npm run ci`, self-review, commit and publish
   the exact head for independent review and owner merge.

Preserve `contacts-*` skill names, `scripts/contacts/`, schema version and store
names unless a separately specified compatibility change requires otherwise.
Heartbeat names the product and future local reports/maps, not a bulk schema
rename. Identity review is a separate synthetic-only overlay; see its
[contract and engineering decisions](spec/contacts-identity-review.md).
The [CONTACTS-027 curated store](spec/contacts-curated-records.md) adds
`contacts:curate` and `curated.test.cjs`: exact original notes, explicit connections,
groups, per-household rhythms, reference preservation, atomic rollback and CLI
0/2/1 exits. It reuses canonical reviewed households; no real notes are authorized.
The independent [CONTACTS-023 reducer](spec/contacts-aggregation.md) is also
synthetic-only. Its fixtures cover exact mapping/snapshot binding, half-open
boundaries, DST date unions, source-ID deduplication, historical thread context,
direct/group/To/CC/BCC semantics, coverage bounds and immutable CLI output.
Renderers remain distinct work items.

The [CONTACTS-024 period report](spec/contacts-period-summary.md) adds
`contacts:summary`, a focused presentation skill, `summary.test.cjs` and
`check:summary` in CI. Synthetic cases reconcile summary/table/channel/timeline
counts, preserve inactive peers, exact zeros versus unknown/lower bounds,
cross-channel reviewed identities, DST/skipped-date calendars, 7d/30d/custom
bounds, standalone view context, immutable CLI output and private-run denial.
The workflow guard also exercises collection-to-summary without changed inputs.
