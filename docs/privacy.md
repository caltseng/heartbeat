# Heartbeat privacy and local-data policy

## Owner-authorized manual V0 retrieval

The [contacts-retrieve skill](spec/contacts-manual-retrieval.md) is a bounded,
user-invoked exception to older blanket synthetic-only **acquisition** guidance.
It may use an actually available authenticated source tool after the owner
approves the exact source/account, metadata fields, interval/as-of, finite budget,
processing route and private output for EACH run. Client sign-in uses the tool's
normal auth flow; never extract or paste credentials into chat or project files.
Missing capabilities/auth remain explicit;
other approved sources may proceed. No new OAuth connector, backend, bridge,
automatic retention service, background sync or recurring scheduler is required.

**Owner revision, 2026-11-26 (Pacific), manual retrieval only:** the owner
removed mandatory disk encryption, Windows ACL verification, share/backup/
cloud-sync exclusion checks, the fixed 12-month retention ceiling and the
blanket ban on owner-approved Muse processing of metadata. These are policy
decisions, not engineering defaults or proof of a particular account's access.
Do not enable or require data-at-rest encryption for this manual workflow.
Provider TLS and an authenticated client's built-in credential handling are not
disabled or replaced by this decision.

| Manual boundary | Current requirement |
| --- | --- |
| Storage | Choose an ordinary private output directory outside Git worktrees. No encryption, ACL audit or share/sync/backup exclusion audit is required; inability to perform those checks does not block this path. Path validity, fresh output and no-clobber checks still apply. |
| Retention | The owner chooses retention and may delete inputs and outputs. No fixed 12-month ceiling, deletion-date questionnaire or automated retention service is required for manual handoffs. Existing synthetic retention commands are unchanged. |
| Processing | Selective source-API retrieval or specifically owner-approved Muse cloud/AI processing of the allowed metadata may be used. Approval must identify the processor, source/account, fields, interval and finite budget for this run. Sign-in alone is not that approval; unrelated remote processors remain unapproved. |
| Content and secrets | Metadata only. Excluded content must be omitted before retrieval; requesting JSON or stripping bodies afterward is not permission. Never request, display, log or commit passwords, tokens, cookies or credential files. Use normal client sign-in, not credential extraction. |
| Publication and authority | Keep records/configuration out of Git, PRs, CI, Library, logs and ordinary chat. An approved private Muse conversation may process only the run's approved metadata; do not copy its private records into other chats. No public publication, source mutation, sending, schedules, implicit setup or unrelated access. |

Inspect actual tool behavior, including Muse; a name or narrative answer alone
does not establish selectable fields, stable record evidence or completeness.
If the client cannot preserve the approved field/processing/output boundary,
stop that route before source reads. No account or real run is authorized
merely by this policy revision.

**Owner-operated canvas exception:** a separately approved Google Messages Web
trial may allow the web client to fetch/render incidental bodies and previews
while extracting and saving only selected metadata. Explicitly approve that
rendering boundary for each bounded trial; it is not permission for body/snippet
analysis, whole-page snapshots, raw network/app-state dumps or content exports.
Keep private records out of agent/tool logs. The owner controls normal sign-in,
pairing and conversation selection; the agent does not extract cookies/tokens,
pair devices or open unread threads automatically. Opening a thread in the
provider UI may mark it read: leave that action to the owner, not an automated
read-only collector. Only inspect the selected metadata DOM nodes and preserve
unknown IDs, direction, transport, dates and history as explicit gaps.
This exception does not permit content-bearing API/export acquisition or
private imports. A future source/UI needs its own approved boundary.

This exception ends at the private local source handoff. It does NOT lift any
private guard in existing importers, converters, aggregation or rendering.
References below to future enforceable controls before private import remain
true for those commands, not blanket prerequisites to this manual skill.
Development, tests and review remain synthetic/account-free.

## CONTACTS-010: owner-approved policy

The owner approved this policy on 2026-11-24 (Pacific), through an explicit
approval relayed by General Chat. This is owner-approved privacy policy, not a
Captain engineering default. It replaces the earlier unresolved policy
questionnaire. **No particular account, tool, device, credential, export or real
collection run is authorized now.** Policy approval, first-source approval and
approval of each real run are distinct gates; only the owner grants the latter
two. Do not request secrets to satisfy a gate.

The table below retains the original requirements for existing adapters,
converters, importers and downstream workflows. The manual exception above
supersedes its storage/retention/Muse restrictions only for `contacts-retrieve`.
It does not lift private guards or authorize raw-content processing.

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
| Remote processing/publication | No cloud or remote-AI processing of real collection data. Authorized selective retrieval from a source API through an inspected tool after approvals is distinct from sending collected data to remote AI; a tool's product name does not establish that distinction. No hosting, public output, CI data upload, or pasting private manifests/configuration into chats, PRs or issues. |

## Existing importer enforcement: synthetic only

The [selected text XML converter](spec/contacts-text-messages.md) accepts
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

The earlier [retention/deletion rationale](decisions.md#contacts-010) is now
exercised by that synthetic CLI; real-data verification and consent gates remain
unchanged.

The [Messenger JSON converter](spec/contacts-messenger.md) also rejects
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

Engineering rationale, alternatives and revisit conditions: [CONTACTS-010](decisions.md#contacts-010).

Future private-import first-run review must name the exact private account/source
and selected read-only route/fields, approved machine/location, ACL/encryption and backup
verification evidence, interval and owner run approval. Keep evidence and account
identifiers in approved private local storage, never in tracked policy examples.
If any evidence expires, is missing or cannot be verified, stop before acquisition.
This checklist is a run gate, not a renewed questionnaire about the approved policy.

## Source setup/access gates (not granted)

These rows describe the existing synthetic adapters/converters, not additional
storage or remote-processing restrictions on the manual exception above.

| Source | Current capability | Separate selection / authorization still required |
| --- | --- | --- |
| Google contacts | Synthetic normalized identity import plus CONTACTS-012 acquisition | [CONTACTS-011/012](spec/contacts-google-capability.md) selects read-only `people.connections.list`, not connected access. No network transport, OAuth or credential loader ships. Private acquisition fails closed before output access (`private_collection_disabled`, exit 1), with no artifacts. Exact source/account and each-run approval plus verified local controls remain required under approved CONTACTS-010 policy. Revisions/deletions stay staged and partial pending 021. |
| Email | Synthetic normalized handoff import plus [014 synthetic Gmail metadata adapter](spec/contacts-email.md), following [013's selected route](spec/contacts-email.md) | Exact Gmail account/source and each-run approval plus verified local controls remain required; no HTTP transport, connected tool or credentials. The adapter rejects private runs. `gmail.metadata` excludes bodies and search `q`; self/aliases, hidden BCC, partial history and classifications remain explicit. |
| SMS/MMS/RCS/iMessage | Synthetic normalized text metadata import plus [synthetic SMS/MMS XML conversion](spec/contacts-text-messages.md) | [CONTACTS-015](spec/contacts-text-messages.md) selects Android 14/SyncTech 10.30.009 full XML; 016 implements only that synthetic profile. Exact source/account and each-run approval, local controls, actual device/SIM/self/protocol evidence and history limits remain required. Raw-export/content processing is not authorized by this metadata-only policy. Real conversion is rejected; no device or backup inspection is authorized. |
| Personal Messenger | Synthetic normalized handoff import plus [018 JSON snapshot converter](spec/contacts-messenger.md) | [CONTACTS-017](spec/contacts-messenger.md) selects local versioned conversion, not a personal API. Private conversion is disabled; exact source/account and each-run approval, verified local controls and actual producer-shape validation remain required. Raw-export/content processing is not authorized by the metadata-only policy. Producer version, encrypted-backup layout and history coverage are unverified. Business APIs/Muse queries do not establish personal access; real-data remote-AI processing is prohibited. |
| Personal WhatsApp | Synthetic normalized metadata import and selected synthetic TXT converter | [CONTACTS-019/020](spec/contacts-whatsapp-format-gate.md) implement iOS Without Media TXT profile v1, immutable archive-local registry/binding and reviewed boundary/sender/source-zone evidence. Private conversion fails before native/registry/output access. No real producer/device certified or live access. Approved CONTACTS-010 policy does not permit real raw-content export processing; that needs a separate content boundary, exact source/account and each-run approval plus verified local controls. Linked-device history is not full history; no pairing or business-API equivalence. |

## Missing data is not zero

Every desired source must be explicit, including unavailable sources with
`requires_setup` or `unsupported` and a reason. Missing files, authentication
gaps, partial exports and exhausted local cursors are not evidence of empty
upstream history. A verified empty page with declared complete coverage is
different from unknown coverage. Report observed counts only as lower bounds
when coverage is incomplete; never infer neglect, beliefs, household membership
or meaningful connections from message volume or group membership.
