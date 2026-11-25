# Heartbeat repository instructions

- Work on topic branches, never directly on `main`. Preserve unrelated work.
- Deliver changes through one pull request per task targeting `main`; reuse the
  existing open PR for the branch. Keep changes and dependencies minimal.
- **AUTHORIZED DELIVERY:** for explicitly authorized `checked_in` work, keep the
  same retained writer through review, rework and merge into `main`. That writer
  may enable GitHub auto-merge or execute a normal merge only after a qualified
  independent reviewer approves the exact final HEAD, required CI passes and
  GitHub protections permit it. Self-review is not independent review; no named
  reviewer session or routine service-owner/manual merge hop is required.
  Never bypass rules/checks or use admin overrides. Explicit ready-only, report
  and draft instructions remain ceilings, not authorization to promote or merge.
- Run `npm run ci` before publication. Report the exact commit, PR, check results,
  and limitations. CI's stable check name is `Heartbeat synthetic baseline`.
  The owner must configure Phalanx `ready_checks` before merging the bootstrap;
  green CI alone is not independent review or merge authorization.
- Serialize delivery mutations, reuse the branch's open PR and reconcile uncertain
  outcomes before retrying. Integrate actual target-branch changes when PRs
  conflict, then rerun checks and obtain independent review of the new final HEAD.
  Report exact PR/head/check/review evidence and verify the primary PR merged into
  `main` before claiming `checked_in` or lifting a merge prerequisite.
- Follow [delivery and active-execution adoption](docs/development.md#delivery-and-active-execution-adoption).
  Repository edits do not amend immutable item acceptance or authorize private runs.
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
