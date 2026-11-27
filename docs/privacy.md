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
| Publication and authority | Keep records/configuration out of Git, PRs, CI, Library, ordinary replies and public logs. Explicitly requested inline JSON/copy-and-save includes the necessary selected metadata transfer through agent tool history; do not request redundant transfer approval. An approved private Muse conversation may process only the run's approved metadata. No public publication, source mutation, sending, schedules, implicit setup or unrelated access. |

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
Avoid private record dumps; necessary selected metadata transfer is covered by
an explicit inline/copy-and-save request. The owner controls normal sign-in
and pairing and may delegate bounded conversation selection/navigation. Opening
a thread may change read markers; if the owner explicitly accepts that effect,
do not block on unread state. Otherwise do not open unread threads automatically.
This narrow UI effect does not authorize sending, deletion or other source/API
mutations. Never extract cookies/tokens or pair devices as the agent.
Only inspect the selected metadata DOM nodes and preserve
unknown IDs, direction, transport, dates and history as explicit gaps.
This exception does not permit content-bearing API/export acquisition or
private imports. A future source/UI needs its own approved boundary.

This exception ends at the private local source handoff. It does NOT lift any
private guard in existing importers, converters, aggregation or rendering.
References below to future enforceable controls before private import remain
true for those commands, not blanket prerequisites to this manual skill.
Development, tests and review remain synthetic/account-free.

### Approved local contacts and dashboard design

On 2026-11-26 the owner approved designing a narrow extension for a
user-initiated, read-only Google contacts store and offline dashboard using
approved real metadata. This approves the design direction, not a delivered
private-data path or a particular source/account invocation.
Implementation must be independently reviewed and validated with synthetic
fixtures before a separately bounded live run. Existing importer, adapter,
identity-review, aggregation and graph private guards remain unchanged.

Keep source contact IDs, names, phone/email matching evidence and minimal
revision/deletion provenance separate from Heartbeat's canonical-person and
curated records. Exclude message content, contact notes, photos, birthdays,
credentials and unrelated source fields. Preserve ambiguity, incomplete
coverage and inferred-day precision rather than fabricating activity.
Use local files outside Git, Library and logs under the manual storage/retention
policy above. No hosting, source writes, recurring schedules, implicit account
setup or broader processing is approved by this design.
The owner subsequently supplied a Google Contacts CSV and explicitly selected it
and the saved Google Messages observations and Muse metadata for the first preview. The narrow
`contacts:csv` operation handles these supplied local files, not new account reads:
it projects names/email/phone, keeps original input bytes private, writes a fresh
external bundle and produces offline HTML. Excluded CSV columns are not displayed,
analyzed or retained in the normalized store; the owner-provided original remains
an original private file. The operation does not merge identities, attribute
anonymous conversations or change existing private guards. Optional Muse recency
JSON stays supplemental and source-specific, with native evidence unverified;
participants are not automatically matched to contacts or treated as historical
recipients. Synthetic validation
and independent implementation review remain required before the private preview.
See the [selected design and CSV operation](spec/contacts-retrieval-plan.md#csv-preview-operation).

### Owner-requested one-round Facebook profile pictures

The owner's direct request on 2026-11-26 separately authorizes one bounded
current-profile-picture pass through their Facebook browser, not Muse. Use only
selected native profile/friend-card references, names and associated current profile-picture
URLs, with at most 25 image attempts. Name search may locate candidates; verify
native friendship and exclude all non-friends before saving. Expand the current
profile picture through its native viewer to obtain the displayed full-size
image rather than guessing a URL. This is a narrow image-content exception,
not permission for posts, bios, captions, message content, historical media,
whole-page snapshots, credentials, strangers or other accounts.
Normal browser rendering may incidentally show content; do not extract it.

The [contacts-profile-photos skill](../.github/skills/contacts-profile-photos/SKILL.md)
and dedicated `contacts:photos` saver keep metadata, raster assets and a
source-bound gallery outside Git and Library. Necessary selected metadata
transfer through tools is part of this invoked capture; keep image bytes out
of tool history and ordinary replies. Fetch only observed HTTPS Facebook image
CDN URLs without credentials; stop rather than bypass authentication, challenges
or rate limits. Preserve failed/missing/unresolved evidence and partial coverage.
No face recognition, biometric inference, embeddings or matching by image or
display name. Photos do not establish interaction or canonical contact identity.
No contact attachment, private generic import, schedule, sending or publication
is enabled. Synthetic validation and independent implementation review precede
the dedicated live asset-saving command.

The owner's direct request on 2026-11-26 ("I also want a little icon next to
faces for the platform that we interacted on") separately authorizes showing
these saved friend photos on nodes of the private offline dashboard graph. A
photo may attach only by exact equality between its observed Facebook profile
reference and a source-reported participant profile ID. Names, images and faces
are never used to match. The attachment is display-only: it does not establish
interaction, contact identity or a canonical-person merge, and photos stay in the
private external preview bundle, never Git, PRs, CI or Library.

Muse returns Messenger participant names without profile IDs. The owner then
directed "Names should be sufficient" and chose to confirm each pairing once.
`contacts:photo-links` may therefore propose a saved friend photo for ID-less
participants with exactly the same normalized name, on a private local review
page. Only candidate numbers the owner approves become links; ambiguous names
are excluded. Approved links join those exact chat slots into one graph person
and show the photo. They do not create contact identities, canonical merges or
interaction claims elsewhere. Unapproved names are never joined. The candidates,
review page and links file are private and stay outside Git, PRs, CI and Library;
approve by number so names never enter chat.

The owner also directed that the many same-name entries that are "just me ...
shouldn't be shown". `contacts:self-links` proposes ID-less slots with exactly the
owner's supplied name on the same kind of private review page; only approved
numbers are omitted from the graph as the owner. Unapproved same-name people stay
visible, and nothing is merged or deleted from source data. The owner later
directed "just assume that anyone with my exact name is me"; a saved
`contacts:self-links --owner-name` rule therefore omits every exact normalized
name match in any snapshot. The rule file stays private like the review files.

The owner directed that the view be people-centric, without duplicate nodes for
one person reached in several places. `contacts:people-links` only proposes
same-name chat slots and contact-bridged Gmail addresses on a private review page;
nothing joins until the owner approves numbers. Two entries in one chat are
different people and never join. The owner later set a standing rule, "Just
assume that same name = same person. Unless explicitly stated otherwise", saved as
`sameNamePeople` with the owner's `separateNames` exceptions in the private owner
name rule file; it never joins namesakes in one chat, different reported profiles
or different photos. The owner also asked to "exclude people easily" and to
"combine entries": the chart's hide and combine choices stay in the browser's local
storage as hashed name tags, never names, and `contacts:self-links --update`
saves `hiddenNames` and `sameAs` decisions to a new private rule file under the
same guards. Gmail correspondents are only the recipients of
messages the owner sent, minus the owner's own addresses; addresses that only
wrote to the owner are counted, not shown, and a message is one-to-one only when
it has exactly one non-owner address. The candidates, review page, links file and Gmail copy in the
preview stay private, outside Git, PRs, CI and Library.

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
