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

`test:contacts`/`npm test` run Node's built-in test runner. `check` checks the three
CommonJS files' syntax. `ci` runs both. Tests generate synthetic fixtures in
temporary directories and clean them up; they include actual CLI 0/2/1 exits,
all five families, replay, connector provenance, resume, rollback, record
conflicts, direct/group roles, missing-versus-empty history, DST/custom intervals,
lock conflicts and unsafe output rejection. No live endpoint is verified.

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
rename. Future identity review, reducers and renderers are distinct work items.
