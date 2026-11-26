# Heartbeat

![Heartbeat wordmark with a custom ping-and-reply H, coral upper-left packet and ink lower-right packet](docs/assets/heartbeat-wordmark.png)

Heartbeat is a **single-user local relationship and interaction graph tool with
a private JSON store**. It visualizes communication frequency and recency alongside
curated households, notes and meaningful connections. Activity never establishes
relationship quality. Missing data means unknown, not zero.

## What runs today

**Manual metadata retrieval V0:** invoke `/contacts-retrieve` in a local
Heartbeat project session. It inspects source-tool capabilities, uses normal
client sign-in and obtains source/account, field and per-run approval before
saving a bounded metadata-only handoff. Follow the
[owner walkthrough](docs/spec/contacts-manual-retrieval.md) for local protection,
retention/deletion, unavailable sources and the still-required owner live trial.
Approved source-API retrieval is not permission for remote-AI processing.
**This path does not enable private import or aggregation.**

Other commands use synthetic inputs only; private importer and adapter guards
remain unchanged. Demo/tests access no accounts, devices or real archives.
Keep inputs, metadata, configuration and outputs out of Git and public shares:
use ignored `.private/` for synthetic runs and an approved external directory
for manual retrieval. Nothing sends, hosts or schedules.
See the [privacy boundary](docs/privacy.md).

## Command reference

Run `npm run <script> -- <arguments>`. Linked contracts document flags, outputs,
recovery and decisions; this table does not authorize private data use.

| Script | Purpose and contract |
| --- | --- |
| `contacts:retrieve-save` | [Save approved projected metadata as a local handoff; does not fetch or import](docs/spec/contacts-manual-retrieval.md). |
| `contacts:collect` | [Import normalized metadata with provenance, coverage and replay/resume](docs/spec/contacts-technical-spec.md). |
| `contacts:email` | [Convert synthetic native Gmail pages with explicit pagination and coverage](docs/spec/contacts-email.md). |
| `contacts:google` | [Acquire synthetic Google People identities with mocked sync/resync](docs/spec/contacts-google-capability.md). |
| `contacts:messenger` | [Convert declared synthetic personal Messenger JSON shards](docs/spec/contacts-messenger.md). |
| `contacts:text-xml` | [Convert the selected synthetic text-message XML profile](docs/spec/contacts-text-messages.md). |
| `contacts:operate` | [Refresh/resync, inspect stale sources and recover inventoried cache purges](docs/spec/contacts-source-operations.md). |
| `contacts:review` | [Review canonical identities, reversible matches/splits and household links](docs/spec/contacts-identity-review.md). |
| `contacts:whatsapp` | [Convert selected synthetic iOS Without Media TXT snapshots](docs/spec/contacts-whatsapp-format-gate.md#contacts-020-operation). |
| `contacts:curate` | [Maintain original notes, meaningful connections, groups and household rhythms](docs/spec/contacts-curated-records.md). |
| `contacts:audience` | [Review household/member selections, wording preferences and recipient lists](docs/spec/contacts-life-update-audience.md). |
| `contacts:prayer` | [Triage confirmed prayer status and editable plans grounded in original notes](docs/spec/contacts-prayer-triage.md). |
| `contacts:aggregate` | [Reduce snapshots into mapping-bound counts and an auditable event ledger](docs/spec/contacts-aggregation.md). |
| `contacts:summary` | [Produce immutable period summaries with shared coverage and exclusions](docs/spec/contacts-period-summary.md). |
| `contacts:graph` | [Render pinned summaries as standalone local HTML/SVG maps](docs/spec/contacts-local-graph.md). |
| `contacts:demo` | [Generate interactive synthetic graphs with 37 peers and partial WhatsApp history](docs/spec/contacts-local-graph.md). |
| `contacts:reconnect` | [Review household rhythms, commitments, context and explicit follow-up](docs/spec/contacts-reconnection-review.md). |
| `contacts:opportunities` | [Explain matched-coverage activity declines and curated rhythm reminders](docs/spec/contacts-opportunities.md). |

## Install and run

Install Node.js 20.11.0+ (CI uses 20.11.0, npm 10.2.4) and Git. TypeScript,
Node types and the `tsx` source runtime are pinned in the lockfile:

```powershell
git clone https://github.com/caltseng/heartbeat.git
Set-Location heartbeat
node --version
npm --version
npm ci
npm run ci
npm run contacts:collect -- --demo --output .private\contacts\demo-001
npm run contacts:collect -- --request .private\contacts\demo-001\request.synthetic.json
```

Choose a fresh directory; the demo refuses overwrites. It generates five handoffs,
their request and `collection.json`; replay preserves events without duplication.
Google adds identities, not activity. For interactive graphs, run the demo script with
`--output .private\contacts\interactive-001`, then open that folder's `index.html`.
Its intentional partial WhatsApp history exits 2.

For a prepared **synthetic**, contract-conforming metadata request:

```powershell
npm run contacts:collect -- --request .private\contacts\run-001\request.json
```

This does not create the request or authorize acquisition. Private requests exit
1 (`private_collection_disabled`) without writing a store or printing a manifest.
Exit **0** means collection for the declared scope, **2** means persisted
partial/unavailable/failed sources, and **1** means fatal request/storage/locking
failure. Inspect nonzero exits; imports do not certify upstream history.

## Documentation and delivery

Start with [architecture](docs/architecture.md), the
[local workflow](docs/spec/contacts-local-workflow.md),
[product specification](docs/spec/contacts-store-spec.md) and
[technical contracts](docs/spec/contacts-technical-spec.md).
See [central decisions](docs/decisions.md), the
[stable CONTACTS register](docs/spec/contacts-work-items.md),
[migration provenance](docs/provenance.md) and
[branding decisions](docs/spec/heartbeat-branding.md).

Follow [repository rules](AGENTS.md) and
[development and delivery guidance](docs/development.md#delivery-and-active-execution-adoption):
topic branches, one PR to `main`, independent exact-final-head review and required
CI (`Heartbeat synthetic baseline`) before an authorized merge. An open green
PR is not checked in. Ready-only/report targets and draft ceilings remain
unchanged; there is no deployment step.
