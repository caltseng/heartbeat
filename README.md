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
**It does not fetch live endpoints or parse native vendor archives.**
The [CONTACTS-014 Gmail metadata adapter](docs/spec/contacts-email-adapter.md)
also converts synthetic native pages with an injected transport, separate native
cursors and explicit partial coverage. Its CLI cannot access real accounts.

Canonical identity review, cross-source numerical aggregation, summaries,
reconnection signals and Heartbeat's map are **not implemented**. Missing source
data means unknown, not zero. No private accounts, devices, browser sessions,
credentials or real data are included or authorized by this repository.

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

For a **separately approved**, contract-conforming metadata request:

```powershell
npm run contacts:collect -- --request .private\contacts\run-001\request.json
```

This command does not create that request or authorize acquisition. Follow the
[request/handoff contract](docs/spec/contacts-technical-spec.md) and each source's
access gate first. Exit **0** means all supplied snapshots collected for their
declared scope, **2** means persisted partial/unavailable/failed sources, and
**1** means fatal request/storage/locking failure. Inspect nonzero exits; never
hide them. A successful import does not independently certify upstream history.

## Documentation and delivery

- [Architecture, data flow and local JSON layout](docs/architecture.md)
- [Privacy, local data and source approval gates](docs/privacy.md)
- [Development, CI and adding a collector](docs/development.md)
- [Product specification](docs/spec/contacts-store-spec.md)
- [Technical contracts and source capability matrix](docs/spec/contacts-technical-spec.md)
- [Google identity access gate: proposed read-only route, no live access](docs/spec/contacts-google-capability.md)
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
