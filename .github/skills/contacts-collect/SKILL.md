---
name: contacts-collect
description: Collect authorized contacts and communication metadata through focused source skills into a private, resumable cross-source snapshot with explicit coverage and unavailable-source reporting.
---

# Contacts collection

Read [the product specification](../../../docs/spec/contacts-store-spec.md),
[technical contracts and examples](../../../docs/spec/contacts-technical-spec.md),
and [work-item status](../../../docs/spec/contacts-work-items.md). Follow AGENTS.md.
This skill coordinates acquisition instructions and a runnable local metadata
importer; it does not provide API access, connect accounts, or render the map.
The product is a single-user local tool with a local file store. Do not create a
hosted website/dashboard, server, cloud backend, multi-tenant or product account
system. Prove the flow before polished design; future reports/graphs are local
CLI output or private generated files. Authorized endpoint reads are a separate
source-access capability, not prohibited by the local-only execution boundary.

## Inputs and authorization

Read the [owner-approved CONTACTS-010 policy](../../../docs/privacy.md).
Only synthetic requests run today; `dataClass: private` fails closed before
handoff reads/output writes because local protections and retention/deletion
cannot yet be verified. No policy approval enables that path. Future real runs
require exact private account selection, separate first-source approval and
explicit owner approval for EACH run, plus verified Windows-user ACLs, disk
encryption, non-synced storage outside Git, 12-month deletion and no backups.
Only timestamps, sender/recipient identities, membership and counts are approved;
no bodies, subjects, attachments, thread titles, notes or prayer content.
No Muse/remote-AI processing or acquisition of real collection data is allowed.
Authorized source API retrieval is not remote-AI processing.

Establish requested source/account references, 7-day/30-day/custom period, IANA
time zone, explicit as-of instant, private output directory, and checkpoint/resume
choice. For a real run, confirm authorization for the selected accounts,
metadata fields, local storage/processing boundary, and retention. A request to
create this skill or run its demo is not permission to read communications.
Never acquire credentials, pair a device, reuse a private browser session, install
a bridge, schedule jobs, or send messages under this skill's implicit authority.

Do not put credentials, private records, request files, or account examples in
tracked files. Use `.private/contacts/<chosen-folder>` only for synthetic runs.
Future real files require verified approved local storage outside Git and
cloud-synced folders, never website folders or `data/sets/`.

## Compose the source skills

For each requested source, follow its focused workflow:

- [Google identities](../contacts-google-identities/SKILL.md)
- [Email activity](../contacts-email-activity/SKILL.md)
- [Text activity](../contacts-text-activity/SKILL.md)
- [Personal Messenger activity](../contacts-messenger-activity/SKILL.md)
- [Personal WhatsApp activity](../contacts-whatsapp-activity/SKILL.md)

Inspect the current tool catalog/capabilities before claiming a source is callable.
Use only already available, separately authorized access. Do not infer access from
a provider name, previous narrative answer, successful browser query, business API,
or this skill's presence. If no suitable tool or contract-conforming handoff exists,
include an explicit unavailable source entry, with `requires_setup` or `unsupported`
and its reason. Do not drop that source or generate an empty successful page.

The delivered runnable route is `metadata-import`: focused skills normalize
metadata from verified tools or an explicitly supplied normalized handoff into the
versioned contract. **Native provider export parsers and live HTTP adapters are
not implemented.** If normalization cannot preserve stable IDs, actual sender
roles, timestamps or coverage, stop that source and report the gap rather than
turning a prose summary or estimated count into observations.

## Run and inspect

For an account-free demonstration only, choose a fresh folder and run:

```powershell
npm run contacts:collect -- --demo --output .private\contacts\demo-001
```

For a prepared synthetic request (private requests exit 1):

```powershell
npm run contacts:collect -- --request .private\contacts\run-001\request.json
```

Do not swallow a nonzero exit. Exit 2 means the persisted manifest is partial;
inspect each requested source's status/error. Exit 1 is fatal. All sources can
still yield useful partial records without being presented as complete coverage.
Also inspect `manifest.reconciliationRequired`, `reconciliation.collisions` and
`reconciliation.unresolvedTargets` in the private snapshot. Use the
[revision/overlap contract](../../../docs/spec/contacts-source-revisions.md) for
changing metadata, targeted edits/deletions, historical membership and per-thread
coverage. Different connector IDs require a private reviewed translation before
import; never deduplicate by name/text. Saved translations remain active on replay.
The reconciled current view is `reconciliation.records`; original `records`
remain evidence, not current-version totals.
`reconciliation.pendingTargets` separately lists mutations whose original
messages have not been imported; these informational historical links do not
make otherwise covered sources/periods partial and resolve on target arrival.

The single `collection.json` snapshot atomically stores manifest, normalized
records, provenance and checkpoints. Never hand-edit its records or checkpoints.
Rerun the same input without resume to verify idempotency, or use `resume:true`
with the exact same resolved interval/as-of and the next saved input page.
Changing the interval requires a fresh traversal (`resume:false`), not reuse of
an unrelated cursor. A lock conflict requires confirming the previous process has
stopped before removing only the exact stale lock file.

Report the private output path, requested/resolved interval and time zone,
per-source status/freshness/coverage, unresolved identities, and concrete missing
access/format capabilities. Do not paste private account IDs or records into
public artifacts. A successful synthetic demo proves local ingestion only.

## Handoff boundary

No name-only person merges, inferred couples, group-membership-to-direct exchanges,
relationship-quality scores, meaningful-connection resets, source writes,
automations, or visualization implementation belong in collection. Canonical
identity review, deterministic aggregation and rendering are separate work items.
