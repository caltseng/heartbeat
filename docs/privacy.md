# Heartbeat privacy and local-data policy

## Boundary

Use synthetic data for development, CI, review and examples. A checked-in skill,
import-capable source, successful demo or public API description is **not**
permission to access private data. No real account/device/browser session or
credential was migrated. The repository does not authorize sending, pairing,
source writes, bridge installation, recurring collection or account setup.

Keep all real data, normalized handoffs, requests, account configuration,
credentials, exports, logs/manifests, checkpoints, summaries and future maps
uncommitted. Store them in ignored `.private/` or an explicitly approved external
local folder. `.gitignore` also excludes environment files and common private-key
containers, but ignore rules are not access control and cannot protect arbitrary
files placed elsewhere. Never force-add private paths or paste private CLI output
into issues, PRs, chats or CI logs. The manifest itself exposes account/identity
references even though the CLI does not print message bodies.

Only allowlisted metadata is accepted. Bodies, snippets, attachments, subjects,
credentials and raw vendor payload fields are rejected, but allowlisting cannot
detect secrets placed in an otherwise valid text field. Inspect and minimize
authorized inputs before import. Native archives remain in their approved private
location; there is no native archive parser. Do not upload private records to
external processing systems under this baseline.

Node requests owner-only POSIX permissions. Windows ACLs, encryption, backups,
retention, deletion, processing consent and location must be explicitly reviewed
before real data is stored. Local-only does not imply encryption or secure erase.
Use a local filesystem; network shares are not certified for snapshot atomicity.

## Source setup/access gates (not granted)

| Source | Current capability | Pending owner selection / authorization |
| --- | --- | --- |
| Google contacts | Normalized identity handoff import only | [CONTACTS-011](spec/contacts-google-capability.md) selects proposed read-only `people.connections.list`, not connected access. CONTACTS-010 boundary/source authorization and adapter 012 remain required; snapshot/field limits and sync/deletion gaps stay explicit. |
| Email | Normalized activity handoff import only | CONTACTS-010/013: select provider/tool, read-only metadata permissions, verified self identity, message/thread IDs, To/CC roles, history bounds and bulk classification; adapter 014 remains future work. |
| SMS/MMS/RCS/iMessage | Normalized text metadata handoff import only | [CONTACTS-015](spec/contacts-text-format-gate.md) selects a synthetic-only Android/SyncTech XML design profile; converter 016 remains future work. CONTACTS-010 and source authorization, raw-export/content processing approval, actual device/SIM/self/protocol evidence and history limits remain open. No device or backup inspection. |
| Personal Messenger | Normalized metadata handoff import only | CONTACTS-010/017: select verified personal route or export format and establish encryption/history constraints; route 018 remains future work. Business APIs or prior Muse browser queries do not establish personal-inbox access. |
| Personal WhatsApp | Normalized metadata handoff import only | CONTACTS-010/019: select personal route or export format, linked-device/history limits and ID/time-zone strategy; route 020 remains future work. No pairing or business-API equivalence. |

CONTACTS-010 additionally requires approved processing/storage location,
ACL/encryption, retention/deletion, backup behavior and the authority for each
bounded real run. Never request secrets to close a planning gate. Inspect public
documentation/tool schemas without reading accounts, then obtain separate
authorization if a selected route requires real access. Curated sensitive notes
require their own approved boundary; none are implemented by this importer.

## Missing data is not zero

Every desired source must be explicit, including unavailable sources with
`requires_setup` or `unsupported` and a reason. Missing files, authentication
gaps, partial exports and exhausted local cursors are not evidence of empty
upstream history. A verified empty page with declared complete coverage is
different from unknown coverage. Report observed counts only as lower bounds
when coverage is incomplete; never infer neglect, beliefs, household membership
or meaningful connections from message volume or group membership.
