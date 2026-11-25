# Heartbeat privacy and local-data policy

## CONTACTS-010: owner-approved policy

The owner approved this policy on 2026-11-24 (Pacific), through an explicit
approval relayed by General Chat. This is owner-approved privacy policy, not a
Captain engineering default. It replaces the earlier unresolved policy
questionnaire. **No particular account, tool, device, credential, export or real
collection run is authorized now.** Policy approval, first-source approval and
approval of each real run are distinct gates; only the owner grants the latter
two. Do not request secrets to satisfy a gate.

| Boundary | Approved policy |
| --- | --- |
| Account/source scope | The owner's own Google contacts/email, texts, personal Messenger and personal WhatsApp are permitted categories. Select the exact account privately; obtain separate owner approval for each source before its first collection. Category approval does not establish a callable route or permission to inspect an account/device/browser. |
| Metadata permissions | Timestamps, sender/recipient identities, thread membership and counts only. Stable source/account/record IDs, roles and coverage/provenance may support that metadata, not expand it into content. Select the minimum read-only provider permissions for a reviewed source route; broad API scope availability is not permission to read additional fields. |
| Excluded content | No message bodies, snippets, subjects, attachments, thread titles, notes, prayer content or raw vendor payloads. Google contact identities are not permission to read contact notes or other profile fields. Curated notes/content workflows need a separately approved boundary and remain unauthorized here. |
| Processing/storage | On this computer only, outside Git worktrees and cloud-synced folders, restricted to the Windows user. All requests, configuration, exports/handoffs, metadata stores, logs, manifests, cursors/checkpoints, summaries and generated Heartbeat report/graph files share this boundary. |
| ACL/encryption | Verify effective Windows access restrictions and disk encryption before storing real data. Fail closed if protection is unverified. POSIX modes, `.gitignore`, a path name or a request's assertion are not verification. |
| Retention/deletion | Retain metadata for 12 months, then delete it; explicit local deletion must also be available. Apply deletion to inputs, normalized records, provenance, manifests/history, checkpoints/cursors, temporary files and derived report/graph files, not only visible events. No indefinite identifier cache or automatic restoration. |
| Backups | No automatic backups, cloud sync or remote copies. Do not assume backup exclusions from `.gitignore`; verify the chosen location is excluded from backup/sync software before use. |
| Run authority | Explicit owner approval for EACH real collection run, including replay/resume or changed bounds. No scheduled collection, recurring jobs, sending, source writes, credential acquisition, pairing or implicit installation/setup. |
| Remote processing/publication | No cloud or remote-AI processing of real collection data; Muse/remote-AI acquisition must not process it. Authorized retrieval from a source API after approvals is distinct from sending collected data to remote AI. No hosting, public output, CI data upload, or pasting private manifests/configuration into chats, PRs or issues. |

## Current enforcement: synthetic only

The [selected text XML converter](spec/contacts-text-converter.md) accepts
synthetic fixtures only. It rejects private manifests with exit 1 / `private_collection_disabled`
before inspecting the raw archive path; no transient body read is authorized.

`collect.ts` rejects every `dataClass: private` request with
`private_collection_disabled` before resolving output, reading source handoffs,
creating directories/locks, or changing snapshots. The CLI exits 1 and prints no
manifest/account references for this denial. Even an unavailable-only private
request is rejected: its account references and manifest would themselves be
private. There is no approval flag, environment switch or configuration bypass.
The CLI must read the request JSON to identify its class; this is not authority
to prepare or inspect a real request during development.

The baseline cannot verify Windows ACL/encryption, backup exclusions or private
approvals. [CONTACTS-032](spec/contacts-source-operations.md) implements only
synthetic managed-cache retention/deletion and recovery, not real-input age,
protection or machine-wide inventory verification. Therefore
it does not enable private imports even after a verbal approval. Future
source/operations work must implement and validate these controls before lifting
the guard; a source adapter must check them before acquisition, not after fetching
or writing a handoff. Approval alone never makes unverified protection acceptable.

No Windows protection verifier ships, so no private import is enabled.

The earlier future-retention/deletion decisions below are now exercised by that
synthetic CLI; their real-data verification and consent gates remain unchanged.

The [Messenger JSON converter](spec/contacts-messenger-converter.md) also rejects
private conversion before reading native shards. Its synthetic content projection
does not authorize transient handling of real native exports, which may contain
content excluded by the approved metadata-only policy.

Use synthetic data for development, CI, review and examples. Synthetic requests,
demo generation, replay/resume and explicit unavailable/unsupported source reports
still work without private-data approval. Labeling real data `synthetic` is
forbidden; structural validation cannot establish a text field's provenance.
The general handoff schema still accepts some synthetic display/title fields for
compatibility; that broader schema is NOT the approved real-data field set.
Never use an external/remote AI service to inspect or normalize real exports.

Synthetic generated files may use ignored `.private/contacts/` or temporary
folders. **Ignored checkout storage is not approved real-data storage.** Ignore
rules are not access control. Never force-add private paths or copy another
checkout's data. No accounts/devices/browser sessions or credentials are acquired
by this change.

## Engineering decisions (delegated, not additional consent)

| Decision / rationale | Alternatives and assumptions | Validation / revisit condition |
| --- | --- | --- |
| Deny all private imports at the shared importer entry, before writes; reuse the repository's typed fatal error and CLI exit 1. This closes the existing private-class path without pretending OS protection or approval is verified. | Rejected boolean consent flags and user-supplied encryption claims; they cannot prove effective controls. Assumes no authorized private run or real store needs migration. Preserves schema version 1 and synthetic collection behavior. | Synthetic tests cover all five source families, unavailable-only requests, unchanged existing snapshot/no lock, unrecognized approval claims and actual CLI denial without manifest/account output. Revisit only with independently reviewed source authorization and enforceable local controls. |
| Future retention uses a rolling 12-calendar-month ceiling at time of use; source event time anchors activity expiry, retrieval time anchors identity-only snapshots. Unknown age must not be imported indefinitely. Replaying/retrieving an old event must not extend its lifetime. | A fixed 365-day window can differ from 12 months; expiry based only on reimport would keep old metadata forever. This is a conservative implementation proposal, not owner approval to store a particular identifier. | No retention code or scheduler ships here. CONTACTS-032 must test month-end/leap-year boundaries and purge dependent/derived files and orphan identifiers; obtain owner clarification for any proposed retention beyond the approved ceiling. |
| Future explicit deletion is local, user-invoked, scoped to a verified private store and its inventoried artifacts; expire/rebuild affected derived files and reset affected cursors rather than restoring erased metadata. | Do not recursively delete a checkout/root or assume deleting one event removes copies. Ordinary deletion is not guaranteed secure erase on SSDs; verified disk encryption remains mandatory. | No real data is present or deleted by this item. Before enabling real storage, validate expiry and explicit-delete paths, safe path containment, interruption recovery and backup exclusions using synthetic copies. |

Future first-run review must name the exact private account/source and selected
read-only route/fields, approved machine/location, ACL/encryption and backup
verification evidence, interval and owner run approval. Keep evidence and account
identifiers in approved private local storage, never in tracked policy examples.
If any evidence expires, is missing or cannot be verified, stop before acquisition.
This checklist is a run gate, not a renewed questionnaire about the approved policy.

## Source setup/access gates (not granted)

| Source | Current capability | Separate selection / authorization still required |
| --- | --- | --- |
| Google contacts | Synthetic normalized identity import plus CONTACTS-012 acquisition | [CONTACTS-011/012](spec/contacts-google-capability.md) selects read-only `people.connections.list`, not connected access. No network transport, OAuth or credential loader ships. Private acquisition fails closed before output access (`private_collection_disabled`, exit 1), with no artifacts. Exact source/account and each-run approval plus verified local controls remain required under approved CONTACTS-010 policy. Revisions/deletions stay staged and partial pending 021. |
| Email | Synthetic normalized handoff import plus [014 synthetic Gmail metadata adapter](spec/contacts-email-adapter.md), following [013's selected route](spec/contacts-email-access.md) | Exact Gmail account/source and each-run approval plus verified local controls remain required; no HTTP transport, connected tool or credentials. The adapter rejects private runs. `gmail.metadata` excludes bodies and search `q`; self/aliases, hidden BCC, partial history and classifications remain explicit. |
| SMS/MMS/RCS/iMessage | Synthetic normalized text metadata import plus [synthetic SMS/MMS XML conversion](spec/contacts-text-converter.md) | [CONTACTS-015](spec/contacts-text-format-gate.md) selects Android 14/SyncTech 10.30.009 full XML; 016 implements only that synthetic profile. Exact source/account and each-run approval, local controls, actual device/SIM/self/protocol evidence and history limits remain required. Raw-export/content processing is not authorized by this metadata-only policy. Real conversion is rejected; no device or backup inspection is authorized. |
| Personal Messenger | Synthetic normalized handoff import plus [018 JSON snapshot converter](spec/contacts-messenger-converter.md) | [CONTACTS-017](spec/contacts-messenger-capability.md) selects local versioned conversion, not a personal API. Private conversion is disabled; exact source/account and each-run approval, verified local controls and actual producer-shape validation remain required. Raw-export/content processing is not authorized by the metadata-only policy. Producer version, encrypted-backup layout and history coverage are unverified. Business APIs/Muse queries do not establish personal access; real-data remote-AI processing is prohibited. |
| Personal WhatsApp | Synthetic normalized metadata import and selected synthetic TXT converter | [CONTACTS-019/020](spec/contacts-whatsapp-format-gate.md) implement iOS Without Media TXT profile v1, immutable archive-local registry/binding and reviewed boundary/sender/source-zone evidence. Private conversion fails before native/registry/output access. No real producer/device certified or live access. Approved CONTACTS-010 policy does not permit real raw-content export processing; that needs a separate content boundary, exact source/account and each-run approval plus verified local controls. Linked-device history is not full history; no pairing or business-API equivalence. |

## Missing data is not zero

Every desired source must be explicit, including unavailable sources with
`requires_setup` or `unsupported` and a reason. Missing files, authentication
gaps, partial exports and exhausted local cursors are not evidence of empty
upstream history. A verified empty page with declared complete coverage is
different from unknown coverage. Report observed counts only as lower bounds
when coverage is incomplete; never infer neglect, beliefs, household membership
or meaningful connections from message volume or group membership.
