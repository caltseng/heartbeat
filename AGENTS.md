# Heartbeat repository instructions

- Work on topic branches, never directly on `main`. Preserve unrelated work.
- Deliver changes through one pull request per task targeting `main`; reuse the
  existing open PR for the branch. Keep changes and dependencies minimal.
- **OWNER MERGE:** only the service owner merges the exact independently reviewed
  HEAD. Agents must not enable auto-merge, schedule a merge, self-merge, or execute
  merge commands, even after approval or green CI. Do not waive protections/checks.
- Run `npm run ci` before publication. Report the exact commit, PR, check results,
  and limitations. CI's stable check name is `Heartbeat synthetic baseline`.
  The owner must configure Phalanx `ready_checks` before merging the bootstrap;
  green CI alone is not independent review or merge authorization.
- Keep the same bootstrap writer through review/rework. Report a stable reviewed
  HEAD and green checks to Captain for independent review and owner exact-head
  merge. Remaining CONTACTS work is blocked until bootstrap is verified checked in.
- Heartbeat is a single-user local relationship/interaction graph product.
  Preserve existing `contacts-*` skill names, CONTACTS IDs and storage/schema names.
  No hosting, deployment, backend, product accounts, multi-tenancy, sending,
  pairing, private-source authorization, or recurring schedule belongs here.
- Never access accounts/devices/browser sessions or install bridges implicitly.
  Use synthetic tests only unless the owner separately authorizes a bounded run.
- Never commit private data, requests, configuration, exports, credentials, or
  generated reports/maps. Use ignored `.private/` or an approved external folder.
  Metadata and CLI manifests are private too; do not paste them into PRs.
- Preserve source IDs, provenance, explicit coverage, unresolved identities and
  nonzero failure exits. Missing data is unknown, not zero. Do not infer direct
  interactions from group membership or merge people by display name.
- Read [development guidance](docs/development.md), the
  [privacy boundary](docs/privacy.md), and the [stable register](docs/spec/contacts-work-items.md)
  before changing collectors or their contracts. Update directly related docs.
