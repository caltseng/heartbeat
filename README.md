# Heartbeat

![Heartbeat wordmark with a custom ping-and-reply H, coral upper-left packet and ink lower-right packet](docs/assets/heartbeat-wordmark.png)

Heartbeat is a user-centered relationship and interaction graph, with a planned
local visualization of observed communication frequency and recency. It is a
**single-user local tool with a private JSON store**, not a hosted application.
Households and explicit meaningful connections belong to the longer-term curated
relationship model; message activity must never silently become relationship
quality or a confirmed meaningful connection.

## What runs today

The CONTACTS-001 through CONTACTS-004 baseline provides six composable collection
skills, a strict metadata-handoff importer, atomic JSON persistence, provenance,
coverage, replay/resume, synthetic fixtures and tests. It imports normalized
Google identity, email, text-message, personal Messenger and WhatsApp metadata.
**It does not fetch live endpoints or authorize private archive processing.**
The [CONTACTS-014 Gmail metadata adapter](docs/spec/contacts-email-adapter.md)
also converts synthetic native pages with an injected transport, separate native
cursors and explicit partial coverage. Its CLI cannot access real accounts.
The [CONTACTS-018 Messenger converter](docs/spec/contacts-messenger-converter.md)
projects declared synthetic JSON snapshot shards into metadata-only handoffs,
with stable local IDs, overlap rejection and explicit unknown history. It rejects
private runs and does not support encrypted backups or arbitrary archive layouts.
It also provides a [synthetic-only text XML converter](docs/spec/contacts-text-converter.md)
for the one profile selected by CONTACTS-015. **It does not fetch live endpoints
or authorize processing real vendor archives.**
The [CONTACTS-020 WhatsApp converter](docs/spec/contacts-whatsapp-format-gate.md#contacts-020-operation-and-delegated-decisions)
adds only synthetic iOS Without Media TXT snapshots with reviewed ledgers and
strict replay/overlap protection (`contacts:whatsapp`), not live WhatsApp access.

CONTACTS-010 records the [owner-approved metadata policy](docs/privacy.md).
The importer currently accepts **synthetic requests only**: private imports fail
closed until source/account and each-run approvals plus local protection and
retention/deletion controls can be verified.

CONTACTS-012 adds a synthetic-only Google People acquisition adapter with mocked
pagination, sync/resync, private checkpoints and identity-only importable handoffs:
`npm run contacts:google -- --config <private-config.json>`. See the
[configuration, recovery and decision record](docs/spec/contacts-google-capability.md#contacts-012-local-adapter-and-delegated-decisions).
It ships no network transport, credential loader or OAuth flow. Private runs
fail closed with exit 1 (`private_collection_disabled`) before output access,
without creating directories, locks, reports or manifests.

CONTACTS-022 adds the independent `contacts-identity-review` skill and
`contacts:review` CLI: explicit canonical-person mapping revisions, reviewed
matches, reversible splits/undo and optional curated household links. It is
synthetic-only and never rewrites source records or notes. Follow the
[review workflow and contract](docs/spec/contacts-identity-review.md).

CONTACTS-027 adds `contacts:curate` for synthetic original notes, explicit
meaningful connections, curated groups and household-specific rhythms. It reuses
canonical reviewed households and never infers connections from message activity.
See the [local workflow and decision record](docs/spec/contacts-curated-records.md).
Real note content remains unauthorized under the metadata-only privacy policy.

CONTACTS-029 adds `contacts:prayer` for user-invoked synthetic prayer requests,
explicit confirmed status updates and editable ordered plans grounded in unchanged
original notes. Ambiguous status asks for confirmation; age never implies an
answered/resolved request. All output is private-local-only, with no outreach
export. See the [workflow and decisions](docs/spec/contacts-prayer-triage.md).

CONTACTS-030 adds `contacts:audience` for editable synthetic household/member
selections, explicit reasons and wording preferences, visible address issues and
a separately reviewed recipient list. It never sends or records donations.
See the [audience workflow and decisions](docs/spec/contacts-life-update-audience.md).

CONTACTS-023 adds the independent `contacts-aggregate` skill and
`contacts:aggregate` CLI: deterministic synthetic snapshot reduction with
explicit mapping revision, per-person/thread/channel/day counts, coverage and
an auditable source-event ledger. Follow the
[aggregation contract and decisions](docs/spec/contacts-aggregation.md).

CONTACTS-024 adds `contacts:summary` and the focused `contacts-summary` skill:
one immutable synthetic `report.json` supplies deterministic summary statements,
the complete reviewed people cohort, channel counts and coverage-aware daily
timeline. All views share period/zone/as-of, mapping binding, source freshness,
coverage and exclusions. See the [reporting contract and decisions](docs/spec/contacts-period-summary.md).

CONTACTS-028 adds `contacts:reconnect` and `contacts-reconnection` for a
user-invoked synthetic household review: evidence-backed due rhythms and
commitments, confirmed dates or unknown, original context, existing thread
references, explicit follow-up completion and rhythm-preserving deferral.
Optional saved prayer context retains ambiguous status. Reviews can be saved as
immutable private local reports; nothing sends or schedules. See the
[workflow and delegated decisions](docs/spec/contacts-reconnection-review.md).

Historical-baseline outlier signals and Heartbeat's map are **not implemented**. Missing source
data means unknown, not zero. No private accounts, devices, browser sessions,
credentials or real data are included or authorized by this repository.

[CONTACTS-032 source operations](docs/spec/contacts-source-operations.md) adds
`contacts:operate` for explicit synthetic refresh/resync, stale-source inspection,
inventoried cache retention/deletion and interrupted-purge recovery. Curated files
are preserved; no private access or recurring job is enabled.

## Install and run

Install Node.js 20+ (CI uses 20.11.0, npm 10.2.4) and Git. There are no external
runtime or test dependencies and no package installation step:

```powershell
git clone https://github.com/caltseng/heartbeat.git
Set-Location heartbeat
node --version
npm --version
npm run ci
npm run contacts:collect -- --demo --output .private\contacts\demo-001
npm run contacts:collect -- --request .private\contacts\demo-001\request.synthetic.json
```

Choose a fresh demo directory; `--demo` refuses to overwrite an existing one.
The first run generates five synthetic handoffs and their request, then persists
`collection.json`; replay keeps four distinct synthetic message events rather than
duplicating them. Google contacts add identities, not activity. No network is used
by the demo, importer or tests.

For a prepared **synthetic**, contract-conforming metadata request:

```powershell
npm run contacts:collect -- --request .private\contacts\run-001\request.json
```

This command does not create that request or authorize acquisition. Private
requests exit 1 with `private_collection_disabled`, without writing a store or
printing a manifest. Policy approval is not permission to run collection. Follow the
[request/handoff contract](docs/spec/contacts-technical-spec.md) and each source's
access gate first. Exit **0** means all supplied snapshots collected for their
declared scope, **2** means persisted partial/unavailable/failed sources, and
**1** means fatal request/storage/locking failure. Inspect nonzero exits; never
hide them. A successful import does not independently certify upstream history.

## Documentation and delivery

- [Architecture, data flow and local JSON layout](docs/architecture.md)
- [Local workflow, versioned handoffs and recovery](docs/spec/contacts-local-workflow.md)
- [Privacy, local data and source approval gates](docs/privacy.md)
- [Development, CI and adding a collector](docs/development.md)
- [Product specification](docs/spec/contacts-store-spec.md)
- [Technical contracts and source capability matrix](docs/spec/contacts-technical-spec.md)
- [Personal Messenger access gate and proposed export profile](docs/spec/contacts-messenger-capability.md)
- [Messenger synthetic snapshot converter and engineering decisions](docs/spec/contacts-messenger-converter.md)
- [Google identity route and synthetic acquisition adapter; no live access](docs/spec/contacts-google-capability.md)
- [Selected text export format and device/access limits](docs/spec/contacts-text-format-gate.md)
- [Email access gate: proposed Gmail metadata route and synthetic payload](docs/spec/contacts-email-access.md)
- [Stable CONTACTS work-item register](docs/spec/contacts-work-items.md)
- [Exact migration provenance](docs/provenance.md)
- [Approved branding assets and crop decision](docs/spec/heartbeat-branding.md)
- [Repository rules: topic branches, PRs to main, OWNER MERGE](AGENTS.md)

The bootstrap must be independently reviewed at its exact HEAD, pass the
`Heartbeat synthetic baseline` GitHub Actions check, and be merged by the owner.
The owner configures Heartbeat's Phalanx `ready_checks` before merging. An open
green PR is not checked in; remaining CONTACTS execution stays blocked until the
bootstrap's merge into `main` is verified. There is no deployment step.
