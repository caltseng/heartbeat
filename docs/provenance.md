# Heartbeat bootstrap provenance

Authoritative destination: [caltseng/heartbeat](https://github.com/caltseng/heartbeat),
base `main`, initially empty root commit
`8ec61d77716def2e33d5de1bdf975397b98f62e2`.

The immutable migration source is
[caltseng/churchtree PR #68](https://github.com/caltseng/churchtree/pull/68),
merge **`2b222e03ccbe819764eb3a133c318035945f1eac`**, whose final PR head was
`fb4062c39384dfbeec6764b439886f869ededd45`. Do not substitute moving Churchtree
`main`. Source files can be inspected at the
[exact merge tree](https://github.com/caltseng/churchtree/tree/2b222e03ccbe819764eb3a133c318035945f1eac).

## Migrated inventory

- `docs/spec/contacts-store-spec.md`, `contacts-technical-spec.md` and
  `contacts-work-items.md`: adapted for Heartbeat's authoritative repository,
  actual delivered baseline and bootstrap dependency; stable CONTACTS IDs remain.
- `.github/skills/contacts-collect/SKILL.md` and the five sibling
  `contacts-google-identities`, `contacts-email-activity`,
  `contacts-text-activity`, `contacts-messenger-activity` and
  `contacts-whatsapp-activity` skills: preserved collection instructions.
- `scripts/contacts/collect.cjs`, `demo.cjs`, `collect.test.cjs`: exact source
  implementation, helper/fixture generator and synthetic tests. The importer
  includes its validators; no missing external helper or package is required.

The minimal dependency-free `package.json`, GitHub Actions workflow, repository
rules, README and Heartbeat architecture/privacy/development docs are new.
The source website package/dependencies, assets, public generators, deployment
stack, private data/outputs, account configuration, credentials, devices and
browser sessions were **not** migrated. Source-repository website exclusion
wording in unchanged collector errors/tests describes forbidden output locations,
not a delivered Heartbeat website or build pipeline.

CONTACTS-001 through CONTACTS-004 identify this inherited runnable baseline,
not live acquisition. All 23 remaining CONTACTS-010 through CONTACTS-032 items
remain blocked from execution until this meaningful Heartbeat bootstrap is
verified merged/checked in. Publication/green CI is not merge evidence.
Independent exact-final-head review and an authorized merge under the current
[delivery rules](development.md#delivery-and-active-execution-adoption) are required;
actual PR/head/check and merge evidence must be reported separately when observed. No local or remote
synthetic check establishes access to private endpoints.
