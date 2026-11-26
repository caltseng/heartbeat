# Heartbeat source retrieval plan

Public-documentation and credential-free client investigation: 2026-11-26. This is a plan for
`contacts-retrieve`, not connected access, source setup, private-run approval or
an amendment to the [privacy policy](../privacy.md). Separately authorized canvas
trials have saved partial UI metadata, not verified message-history coverage or
successful live source-API retrieval. The [manual handoff
contract](contacts-manual-retrieval.md) remains authoritative.

## Approach and iteration order

Investigate each source independently; one unavailable source must not stop
another supported, approved source. Distinguish a documented API, an available
client, verified operation/field support and an authorized real run. None implies
the next. Research and synthetic validation need no private folder or sign-in;
ask for those only when a concrete route is ready for acquisition.

| Source | Public evidence | First investigation / fallback |
| --- | --- | --- |
| Android texts | Local SMS/MMS Telephony API; unofficial Google Messages Web protocol includes RCS | Owner-operated canvas trial first; retain native API and libgm as separately reviewed alternatives. |
| Google contacts | Selective People API | First cloud-source API candidate; an identity snapshot, not 30-day activity. |
| Gmail | Metadata-only Gmail API | First email candidate; bounded enumeration may be partial. |
| Personal Messenger | Public Conversations API is Page/professional-account scoped | Investigate Muse capabilities without private reads; otherwise local export alternatives. |
| Personal WhatsApp | Documented Cloud API is the Business Platform | Investigate metadata-only local export alternatives, not business migration or pairing. |
| GroupMe | Public group-history API | Resolve content exclusion and source-contract support before reads. |
| Personal Instagram DMs | Public messaging API is Business/Creator scoped | Investigate the Muse-reported connector; personal access and selective metadata remain unproved. |

Start with Android route feasibility while Google tool availability can be
investigated independently. Prefer existing inspected tools, not a new backend,
bridge or OAuth implementation. Choose reasonable engineering defaults and
present one bounded approval proposal when a route is viable; do not turn
ordinary missing preferences into repeated questionnaires.

Update this plan whenever new evidence changes a source's feasibility, preferred
route or blocker. Distinguish provider documentation, Muse-reported capabilities,
executed schema/dry-run checks and separately approved successful live retrieval;
never promote one evidence level to another. Keep the active skill and owner
walkthrough consistent with approach changes. Cite public evidence here, but keep
account bindings, approvals, records and operational files private. A feasibility
finding does not itself amend privacy policy or approve a run.

## Local contacts store and dashboard: selected design

Owner-selected direction, 2026-11-26. This is an approved design, not a delivered
refresh command, connected Google account or permission for an unlimited run.
The [policy record](../privacy.md#approved-local-contacts-and-dashboard-design)
records the narrow local-only extension; existing private importer, adapter,
identity-review and graph guards remain unchanged.

| Decision | Intended mechanism / current limit |
| --- | --- |
| Local contacts store, not Google as the canonical store | Reuse local JSON and Heartbeat's stable person IDs. Keep Google provider IDs and source snapshots separate from curated records. Google changes/deletions must not overwrite notes, relationship history or canonical-person decisions. No database server or hosting. |
| One user-initiated refresh pipeline | The initial CSV command saves locally and generates an offline dashboard in one invocation. Full People API refresh, native pagination/sync and a dashboard refresh action remain future integration. No recurring schedule or source writes. |
| Official Google `gwscli` Personal mode | The owner selected this client first. Its installed Windows contact-search schema does not support the requested full contacts store. After that limitation was verified, the owner explicitly approved community `gws` as the future full read-only People API transport. Do not conflate the clients or treat either offline discovery as live retrieval. CSV is the current input; no contact API has been authenticated or called. |
| Normal Personal mode setup is acceptable | The owner clarified that creating/downloading/registering the official OAuth client is fine; the goal is local data retrieval without building or publishing an application. An earlier interpretation that the client-file step was a blocker was incorrect. Use normal owner-operated client setup/sign-in, keep credentials private and outside Git, and save retrieved metadata automatically rather than requiring repeated browser downloads. |
| Contact fields and source coverage | Proposed fields are Google contact IDs, names, phone numbers, email addresses and minimal revision/deletion evidence. No notes, photos, birthdays, content or unrelated Google services. Verify an actual complete-list operation and pre-read selection; contact search is not a complete snapshot. Contact presence is not communication activity. |
| Initial full snapshot, then incremental refresh where supported | Advance the native sync token/checkpoint only after all approved pages validate and persist. Preserve last-good data on failures. Native sync/deletion support in the selected official client must be inspected before implementing this promise; the existing synthetic adapter is not live proof. |
| Conservative identity linking | Use phone/email evidence to suggest matches; keep ambiguous/shared/stale identities unresolved and never merge by display name. The current Messages capture has opaque conversation IDs, not verified participant-number evidence, so importing contacts alone cannot attribute those messages. No extra participant read is implicitly authorized. |
| Offline dashboard using approved saved metadata | Clearly distinguish inferred calendar days, boundary candidates, unknown dates and incomplete source coverage. Do not relabel observations as canonical events, claim successfully sent direct messages, infer relationship quality or reset confirmed meaningful connections. Keep generated files outside Git, Library and tool logs. |

Build and validate with synthetic fixtures, then obtain independent review of
the exact implementation before any separately approved bounded live invocation.
Design approval and source sign-in are not permission to run private imports,
read more source fields, install/connect another route or enable a schedule.

### Build with available captures first

The owner supplied a Google Contacts CSV and selected it as the initial contacts
input. Build the local dashboard with that export and the saved Google Messages
metadata now; future source integration and API refresh must not delay the
first proof of the flow. Retain selected contact name/email/phone columns only.
Other export columns may contain excluded information: do not display, analyze
or put their values in normalized output. Keep the owner-provided original and
all generated files private and outside Git.

CSV does not establish stable Google provider IDs or incremental sync. Bind
local row IDs to the exact export bytes and retain provenance; repeated imports
of identical bytes may reuse those IDs, but another export needs explicit
reconciliation. Never merge people by names or shared addresses automatically.
The first preview must preserve anonymous/unlinked conversations, inferred-day
precision and incomplete coverage rather than inventing person attribution.

Muse is already accessible through the owner-selected browser canvas, and
requests have been posted there. Calling Muse unavailable because its dataset
has not yet been retrieved was an incorrect description of access. Reuse the
existing canvas and settled source scope; do not restart integration discovery.
The owner clarified the exact source mapping: **Muse retrieves personal
Facebook Messenger and Instagram DMs; Google Messages uses its separate canvas
capture; contacts currently use the owner-provided Google CSV.** A duplicate
Google Messages request through Muse was incorrect and was stopped.
Do not reinterpret Muse as another Android/Google Messages route or ask the owner
to repeat this already-settled selection. Future OAuth/API refresh is separate
from building with the available snapshots now. Instagram remains a distinct
supplemental source; do not relabel its records as Messenger to fit an existing
source enum or bypass private importer contracts.
Track canvas access, request submission, delivery confirmation, a returned
dataset and verified private persistence as separate states.
The inspected request showed **Delivery not confirmed** and disappeared on a
normal reload. That is client-delivery evidence, not an authentication failure,
an absent canvas or proof that native source access is unsupported.
Reconcile the existing request before any bounded retry. Until source records
are verified, the dashboard must say **Muse data not yet retrieved**, not imply
zero messages or that the service itself is unavailable.
The corrected Messenger/Instagram metadata request has been posted in the
existing canvas. Submission is not evidence of returned source records or
verified private persistence.
Keep the Muse query source-specific: Facebook Messenger and Instagram, requested
period, metadata fields, bounded retrieval and structured output. Unrelated
Google Messages status and agent correction history are local coordination
notes, not necessary query content. Do not resend unchanged requests just to
clean up wording.

The owner demonstrated that a short Muse request for latest sent-message times
and group participants returns useful information. Use that incremental approach
instead of demanding a complete collector contract in the first prompt: obtain a
small result, request JSON, inspect its fields and provenance, then expand within
the approved scope. Both one-to-one and group chats are required for Facebook
Messenger and Instagram; the successful group example is not a group-only limit.
The owner prefers inline JSON followed by agent-managed local transfer, not
manual Download clicks per batch. Automate that transfer using an approved local
write capability without copying record values into ordinary replies. The
owner's explicit inline JSON/copy-and-save instruction covers necessary selected
metadata transfer through agent tool history; do not add a redundant approval.
Normal client permissions are distinct from per-batch download work. Confirm
actual local persistence, and use an already downloaded file rather than making
the owner retrieve the same result again.
Latest sent-message timestamps establish chat-level recency, not total message
counts or individual interaction with every group member. A small Messenger JSON
example returned structured metadata, and a subsequent small Messenger batch
returned both one-to-one and group chat kinds, participant lists, reported chat
IDs and timestamp values. This verifies the conversational JSON route, not native
enumeration completeness or independent ID/timestamp corroboration. Instagram
reported not connected in its associated response. No Instagram records were
saved; this does not block Messenger. Private output preserves those limits.

### Current profile pictures

The owner separately requested a one-round profile-picture pass, explicitly
using Facebook browser control rather than Muse. The
[dedicated skill](../../.github/skills/contacts-profile-photos/SKILL.md) selects
native profile/friend-card references, verifies native friendship and excludes
non-friends. Name search is candidate discovery only. Expand the current profile
picture in its native full-screen viewer and retain its photo reference and
displayed full-size image URL, with a 25-image attempt budget.
`contacts:photos` saves only observed Facebook-CDN
raster assets to a fresh private external bundle and offline gallery. Missing
photos, source failures, partial enumeration and unresolved canonical contact
links remain explicit. No image-based or display-name identity matching,
historical media, profile content, source writes or recurring refresh.

### CSV preview operation

After synthetic validation and independent review, the owner-approved local
operation accepts the supplied Google CSV and optional saved UI observation file:

```powershell
npm run contacts:csv -- --input "<owner-provided-contacts.csv>" --observations "<saved-ui-metadata.json>" --output "<fresh-existing-external-directory>"
```

It writes an atomic `preview` subdirectory with original input bytes,
`contacts.json`, independent `people.json`, `contact-import.json` and
`dashboard.html`. Inputs are bounded to 10 MB; CSV is limited to 5,000 logical
data rows, and Messages observations to 200 records across three conversations.
Original Messages bytes and their digest remain bound to the validated projection.
Malformed inputs fail before publication. Existing output is never overwritten.
Exit **2** means a persisted partial preview, not a failed save; exit **1** means
no preview was published. There is no complete-coverage success claim.

Open `preview\dashboard.html` locally. Search/select contacts independently of
anonymous conversations; inspect inferred-day activity and explicit uncertainty.
Shared normalized addresses are suggestions, never automatic merges. The source
cards do not claim Muse records are in this bundle until they are integrated.
No network calls, source writes, hosting, scheduling, API refresh or existing
private importer/aggregation/graph bypass occurs.

Add `--muse "<saved-recency.private.json>"` for an approved local Muse projection;
repeat it for a second source. Each file uses `kind: muse-reported-chat-recency`,
`dataClass: private`, source `messenger` or `instagram`, reported chat IDs/types,
participants, latest sent timestamps, `nativeEvidenceVerified: false`, partial
coverage and explicit gaps. Limit each source to 100 chat records and reject
duplicate source snapshots, duplicate reported chat IDs, unsupported/content
fields or invented native corroboration. Original bytes and digests are preserved.
The preview presents one-to-one and group recency separately from observed
message-frequency metrics; it does not link participants by name or force
Instagram into the Messenger enum. Missing files/results remain unknown.

## Google client and authentication evidence

Keep these two clients distinct:

| Client | Verified evidence | Remaining work |
| --- | --- | --- |
| Community `gws` (`googleworkspace/cli`), locally installed 0.22.5 | Public schemas and offline GET serialization support People/Gmail field masks. A credential-free login preflight stops with `No OAuth client configured`, exit 2, before browser sign-in. | Owner-approved future full People API transport after official search limitations were verified. Refresh is deferred; no live API acceptance or account read has been proved. |
| Official Google `gwscli` | Installed Windows client reports `1.0.6.1026726559`. Offline help and contact-search output schema were inspected. Personal mode client registration/sign-in is acceptable normal setup; no application needs to be built or published. | Actual People commands provide profile, contact search and directory search, not a full contact list/sync operation. Contact search exposes names/emails only, capped at 30 results, without provider IDs, phone numbers or pagination/sync evidence. Authentication and live retrieval remain unverified. |

The official [Personal mode setup](https://developers.google.com/workspace/guides/workspace-cli#personal-mode)
is a simpler authentication candidate than manually configuring a consent screen.
It still registers an OAuth client; it is not a bundled-client, setup-free login.
The documentation rechecked on 2026-11-26 explicitly says to click **Create
Client**, download the client secret JSON and register it with `gwscli auth
setup`. The official user guide likewise describes bring-your-own-client or
bring-your-own-token authentication; it does not establish an automatic
client-file-free login. Do not request pasted credentials/tokens as a workaround.
Any viable route must use normal client setup/sign-in and minimum service scopes, not
all-service authorization. Registration, API enablement and sign-in are separate
owner actions, not authorized by this research.
People commands are documented as Developer Preview requiring an enrolled Cloud
project. A complete contact snapshot with native pagination/sync has not been
verified merely from documented contact search. Official `gwscli` uses
Google's Workspace MCP-backed commands (People uses the People API directly);
do not assume its commands accept community `gws` masks or have identical
processing/output behavior. Gmail, Calendar and Drive access for a general
coding agent is not evidence of a metadata-only Heartbeat operation or permission
to retrieve additional services.

**Executed offline proof for community `gws`:** `people.people.connections.list`
serialized a contact-only request with `pageSize=10` and
`fields=connections(resourceName,emailAddresses(value),phoneNumbers(value)),nextPageToken`.
Gmail list serialized IDs/thread IDs plus continuation; a synthetic-ID get
serialized `format=metadata`, headers `From,To,Cc,Bcc,Date` and
`fields=id,threadId,labelIds,internalDate,payload(headers)`.
All three returned `dry_run:true`, GET, no body, exit 0. This proves request
forwarding, not live retrieval or completeness. The installed release resolves
OAuth client credentials before login and also adds identity scopes even with
custom source scopes; inspect that behavior before approving sign-in.
No credential or actual account binding belongs in this plan.

**Executed offline proof for official `gwscli`:** `version`, `people --help`,
`people search_contacts --help` and `people search_contacts --schema` ran without
source reads. Available People commands are `get_user_profile`,
`search_contacts` and `search_directory_people`. `search_contacts` accepts a
query and `maxResults` (default 10, maximum 30); its response is
`results:[{name,email}]`. No phone number, stable provider contact ID, page
continuation or sync token is exposed, and no field-mask flag is listed.
This verified command cannot supply the proposed complete phone-linked contacts
snapshot. Do not sweep search queries and call the union a complete sync.
Native People `people.connections.list` remains the full-snapshot API candidate;
using another client/transport requires an explicit route decision, not silent
substitution or token extraction. No contact, profile or directory query ran.
Subsequent inspection commands disable optional usage telemetry with
`GWSCLI_TELEMETRY_ENABLED=0`.

Sources: [pinned community README](https://github.com/googleworkspace/cli/blob/v0.22.5/README.md),
[pinned auth implementation](https://github.com/googleworkspace/cli/blob/v0.22.5/crates/google-workspace-cli/src/auth_commands.rs),
[official CLI guide](https://developers.google.com/workspace/guides/workspace-cli),
[official CLI user guide](https://dl.google.com/workspace-cli/README.md).

## Android texts: SMS/MMS first

### Google Messages Web: current canvas path

The owner selected the first-party Google Messages Web canvas as the near-term
trial, ahead of building a bridge. A separately bounded UI approval may allow
incidental client rendering of bodies/previews while saving metadata only; see
the [manual policy exception](../privacy.md#owner-authorized-manual-v0-retrieval).
The owner controls sign-in/pairing and may delegate bounded conversation
navigation. The owner explicitly accepted incidental read-marker effects for
the trial; do not treat unread state as a blocker after that approval. This does
not permit sending, deletion or other source/API mutations. Do not extract
cookies or inspect raw app/network state.

An owner-authorized structural probe reached the conversation-list DOM.
`mws-conversation-list-item` exposes conversation links and test attributes;
`mws-relative-timestamp` exposes display-time markup. An opened thread also
exposes `msg-id` matching `data-e2e-message-id`, `is-outgoing` and
`data-e2e-message-rcs` markers. These are verified DOM metadata capabilities,
not a complete provider schema or certified cross-session native ID mapping.
This demonstrates a usable authenticated UI, not a saved message-level handoff. The current list does not
itself establish exact message timestamps, outgoing direction, sender IDs,
SMS/MMS/RCS transport or complete history. Do not treat its latest activity as
the owner's last sent message. Inspect only selected metadata nodes, never
snippets/bodies or a whole-page snapshot.

Use the browser's configured IANA zone without asking a preference question.
Partial dates/times, virtualized/off-screen records and absent native IDs remain
gaps. A browser-local save must use owner-selected storage outside Git and must
not pass records through chat, tool logs or Library. UI-local IDs need a reviewed
immutable snapshot namespace; they are not provider IDs or cross-run sync keys.
The bounded extractor can prepare a private v1 partial thread-reference
projection in page memory. Exact dated message timestamps and sender/direct-
recipient evidence remain unverified, so no message events or "Last messaged"
date are fabricated. The observed bubble timestamp markup supplies a clock
label without a full date; attempts to expose metadata controls did not establish
a reliable details operation. Keep this as a concrete UI gap, not an assumed
impossibility or a successful message-history retrieval.

**Executed scrolling finding:** moving the actual message-list scroll container
to its upper boundary loaded older messages. The client enlarged the scrollable
history and restored the viewport anchor afterward. The initially rendered set
was not a provider history limit; stopping there before testing pagination was
an incomplete retrieval attempt, not evidence of a fourteen-day restriction.
Find the actual scroll container among the list's ancestors and descendants by
its layout/overflow metrics rather than assuming the document scrolls. Retain
that element while connected and rediscover it if the client replaces it.
Cache selected metadata before and after each bounded
scroll and deduplicate by snapshot-scoped UI IDs. Stop at the approved budget,
a supported date boundary, or a verified no-progress result; record remaining
history as unknown rather than silently claiming completion.

Date-divider labels may omit the year; display clocks and divider text are
separate evidence. Preserve their original metadata labels locally rather than
silently inventing a year, exact instant or a shared timestamp for every message
in a group. A bounded metadata-only observation file can retain UI message IDs,
outgoing/RCS flags and selected date nodes beside the canonical projection.
Mark unresolved window membership explicitly; those observations are not
validated in-period events.

**Owner-approved date inference:** calendar-day assessments are useful even when
native exact timestamps are unavailable. A browser-local trial inferred days
from selected date dividers, the fixed browser-zone as-of and reverse
chronological traversal. Preserve raw labels per conversation and bind them to
snapshot-local rows; a truncated viewport before its first usable divider stays
unknown. Labels captured after navigation only support their observed viewport,
not unavailable earlier dividers. Never reconstruct original labels from inferred
dates.

For yearless month/day labels, choose the latest past year compatible with the
displayed calendar date/weekday and the next newer divider. Record that heuristic
as an assumption, not independent year verification. Respect explicit years and
reject impossible dates or weekday mismatches. Today/yesterday and weekday-only
labels use the same fixed date context; do not silently rebase an immutable run
to a later capture day. Synthetic checks exercised current-year labels, year
rollover, explicit years, weekday mismatches and impossible calendar dates.
These are parser checks, not native timestamp or complete-history proof.

Retain inferred local date, basis, temporal precision, year-verification status
and the day's `[local midnight,next local midnight)` instant range. Compare that
range with the requested window: wholly inside, disjoint, overlapping a boundary
or unknown. Boundary overlap is not proof that the message itself is in-period.
Preserve these labels in a separate metadata subset; do not fabricate midnight
events or promote inferred records to complete coverage. Outgoing UI flags still
do not establish successful sending, direct recipients or a verified
per-person "Last messaged" date.

A fourteen-calendar-day request uses the existing `custom` period: browser-zone
midnight thirteen days before today through the fixed as-of. Use a fresh capture
and output; never relabel an earlier thirty-day snapshot. Declaring this window
does not establish that undated UI observations belong inside it.

A synthetic download-routing probe reached Downloads without adding a Library
file. Subsequent owner-local file verification established an automatic download
and publication path in this client; a file-picker hop is not inherently required.
Verify routing with synthetic data before private exports on another client.
Process only the exact named download into the fresh external private input
folder, preserve original bytes, and reference that saved evidence from the
separate canonical projection. A native picker remains a fallback, not another
privacy questionnaire. Never route records through tool responses or Library.
Validate/publish with `contacts:retrieve-save` and verify the local file/bundle
before claiming persistence. A partial handoff proves selective metadata
retrieval, not complete interactions, per-person attribution or the last
successfully sent direct message.

### Unofficial protocol: aspirational libgm path

`mautrix/gmessages` is a Matrix puppeting bridge; `pkg/libgm` implements the
underlying Google Messages Web protocol. Its roadmap includes SMS/message
content and RCS replies/reactions/read receipts. This is stronger evidence of a
personal/RCS route than a Business messaging API, but not a verified local trial.
No root or new Google Cloud OAuth client is part of the documented bridge login.

Important current qualifications:

- The project's authentication documentation says QR login appears to have been
  killed. Its current Google-account path extracts browser cookies and pairs by
  phone emoji confirmation; that credential-extraction route is not permitted
  by this manual skill. Do not install the Matrix bridge or disable browser
  credential protections as a workaround.
- `ListMessagesRequest` accepts a conversation ID, count and cursor; list
  conversations accepts count/folder/cursor. No metadata field mask is present
  in the inspected request schema. Responses contain message content, media,
  subjects and conversation previews. The canvas rendering exception does not
  authorize these content-bearing RPC reads.
- The protocol separates list operations from sending, message-read, typing and
  update operations. A future local client must avoid mutation/presence paths,
  not assume the full bridge is read-only. Phone connectivity is required;
  returned cursors/counts do not establish complete device/history coverage.
- Several reverse-engineered timestamp/type fields are explicitly uncertain.
  Verify actual units, successful-sent status, sender/recipient IDs, protocol
  mapping and historical behavior before deriving activity.

Keep this as a separately reviewed local-client possibility, not a hosted
service, Matrix deployment or TypeScript backend. Normal first-party canvas
sign-in is currently preferable to copying account cookies into a bridge.

Sources: [project](https://github.com/mautrix/gmessages),
[current authentication](https://docs.mau.fi/bridges/go/gmessages/authentication.html),
[request schemas](https://github.com/mautrix/gmessages/blob/main/pkg/libgm/gmproto/client.proto),
[record schemas](https://github.com/mautrix/gmessages/blob/main/pkg/libgm/gmproto/conversations.proto),
[separate RPC actions](https://github.com/mautrix/gmessages/blob/main/pkg/libgm/gmproto/rpc.proto).

### Selective native Android API alternative

**API route:** an owner-operated Android tool can call `ContentResolver.query`
against `Telephony.Sms` and `Telephony.Mms`. This is a phone-local API, not a
Windows or cloud message-history endpoint. SMS projection can select `_id`,
`thread_id`, `address`, `date`, `date_sent`, `type` and approved SIM evidence
without selecting `body`. MMS needs selected message columns and address-role
rows, never subject or message parts.

**Next investigation:** inspect public documentation/source for existing
export tools, including SMS Backup & Restore, for pre-read field selection,
date/conversation bounds, permissions and local transfer behavior. An export
toggle that merely omits content from the output is not proof the tool avoided
reading content. Verify the actual producer/Android version separately; do not
assume the repository's reference version matches a real installation.

**Proof before a trial:** synthetic query fixtures must show explicit column
projection, `[start,end)` selection, deterministic bounded traversal, sent/
received filtering and no body/subject/part reads. Verify SMS milliseconds
versus native MMS seconds, device-scoped message/thread ID stability, self/SIM
mapping and MMS recipient roles. Ambiguous transport stays unknown/unsupported.

**Fallback:** the selected [SyncTech XML converter](contacts-text-messages.md)
is synthetic-only. Real XML can contain bodies/subjects/media and lacks a
generally stable exported message/thread identity. Prefer a verified
metadata-only exporter; otherwise separately review a raw-content processing
boundary and implementation. A new phone app, ADB/root/database probing, bridge,
pairing, default-app switch or phone-side private staging is not authorized by
this plan. Device acquisition/transfer needs its own reviewed boundary before
the Windows handoff. Deleted, previous-device, restricted and RCS history remain
explicit gaps. No supported general personal RCS-history API was found.

Sources: [SMS columns](https://developer.android.com/reference/android/provider/Telephony.TextBasedSmsColumns),
[MMS](https://developer.android.com/reference/android/provider/Telephony.Mms),
[provider queries](https://developer.android.com/guide/topics/providers/content-provider-basics),
[SMS permission policy](https://support.google.com/googleplay/android-developer/answer/10208820),
[SyncTech fields](https://www.synctech.com.au/sms-backup-restore/fields-in-xml-backup-files/).

## Google contacts

**API route:** `people.connections.list`,
`GET https://people.googleapis.com/v1/people/me/connections`, with
`contacts.readonly`, `sources=READ_SOURCE_TYPE_CONTACT` and
`personFields=metadata,emailAddresses,phoneNumbers`. Restrict the nested response
to needed resource/source IDs, addresses and pagination; exclude names, notes,
photos and unrelated profile fields. The broader synthetic adapter mask is not
permission to retrieve real names.

**Plan:** inspect an existing local client's schema and processing route; use
normal client sign-in only after approval. The first proposed live trial is one
page with at most 10 contacts; further enumeration needs separately approved
bounds. Preserve `nextPageToken`, provider resource names and reviewed account/
self evidence. This is a current identity snapshot as of retrieval: update times
do not establish contact or membership during the last 30 days.

**Proof/fallback:** synthetic requests must exclude unapproved fields and retain
page continuation, budget stops and auth/quota failures. Snapshot pagination
does not prove historical completeness. If no selective client exists, record
the precise setup gap; separately scope client setup rather than building OAuth
inside this skill. CSV/vCard/Takeout needs its own format/content/ID review.

Sources: [People API](https://developers.google.com/people/api/rest/v1/people.connections/list),
[existing Google contract](contacts-google-capability.md).

## Gmail

**API route:** `users.messages.list`, then
`users.messages.get(format=METADATA, metadataHeaders=...)`, using
`gmail.metadata`. Use `fields` to request only IDs, thread IDs, timestamp
evidence and approved headers. Minimum role/time headers are `From,To,Cc,Bcc,Date`;
classification headers are optional, separately approved fields. Exclude
subject, snippet, body, MIME parts and attachments. Address headers can contain
display-name text; parse address/role evidence locally without retaining names.

**Plan:** enumerate IDs, retrieve selective metadata and filter the approved
interval locally. Follow the [existing email timestamp/parser
contract](contacts-email.md), disclose draft/spam/trash treatment, unknown aliases
and hidden BCC, and preserve one event per Gmail message ID.

**Important limitation:** `q` is forbidden with `gmail.metadata`, so finding the
last 30 days may require scanning older messages. Do not broaden OAuth scope
for convenience or stop at an old-looking page: ordering by sent-time `Date`
is not guaranteed. Concurrent changes, missing headers, budget stops and
unavailable history leave coverage partial.

**Proof/fallback:** synthetic list/get requests must demonstrate the exact
header/response allowlist, page tokens, half-open filtering and nonzero partial
outcomes. Without a suitable client, scope separate setup. Muse Gmail access
is a different processing route, evaluated below; MBOX is content-bearing,
not an implicitly authorized fallback.

Sources: [list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list),
[get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get),
[partial responses](https://developers.google.com/workspace/gmail/api/guides/performance#partial-response).

## Personal Messenger

**Finding:** Meta's public Conversations API requires Facebook Page or Instagram
Professional-account access; it does not establish personal Messenger inbox
access. No supported public personal-history API was found. This does not prove
that a first-party Muse connector lacks personal access.

**Plan:** investigate Muse's actual connector descriptions/schema without account
reads. Require stable message/thread/sender IDs, timestamps, pre-read field
selection, date bounds, pagination, historical limits and explicit errors. A
structured-looking JSON answer or count is not provider record evidence.
In a capability-only inquiry, Muse reported a first-party `messenger_read`
connector with bounded reads and retained snapshots, but fixed outputs containing
bodies/attachments and no demonstrated field mask. This is a documentation lead,
not executed schema or source-record proof. Content exclusion is still unresolved.

**Fallback:** investigate an owner-created export that excludes content before
acquisition. If none exists, identify the separate raw-content processing
decision and producer/identity/overlap review needed for a local route. The
[existing Messenger converter](contacts-messenger.md) remains synthetic-only.

Source: [Meta Conversations API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations.md/).

## Personal WhatsApp

**Finding:** the documented Cloud API is the WhatsApp Business Platform, not an
established route to a personal account's history. No supported public
personal-history API was found; business history/analytics is not a substitute.

**Plan/fallback:** investigate metadata-only local export tooling first. Native
Without Media chat exports still contain message text. If selective acquisition
is unavailable, separately review local raw-content processing and an actual
producer/parser contract; do not use business registration, account migration,
linked-device pairing or unofficial session extraction. The [synthetic TXT
profile](contacts-whatsapp-format-gate.md) does not certify a real producer or
another platform. Require timestamp/sender evidence, stable archive bindings,
overlap tests and explicit missing/deleted/linked-device history limits.

Source: [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform.md/).

Muse reported that its WhatsApp connection covers the owner's conversation with
Muse, not the owner's other chats/groups. That is not personal-history coverage.

## Personal Instagram DMs

**Finding:** the public Instagram messaging API is Business/Creator scoped,
not a demonstrated personal-account DM-history route. Muse reported a separate
`instagram_messages` connector with inbox/thread/date searches and cursors.
Personal-account eligibility, a complete structured record schema, metadata-only
field selection and historical coverage have not been verified. Its reported
bulk-export restriction also needs precise operation-level limits.

**Plan/fallback:** inspect the real read-operation schema without source reads;
require stable message/thread/sender IDs, timestamps, selected fields, bounded
pagination and explicit gaps. Owner-approved Muse metadata processing removes the
former cloud-policy incompatibility, not the content-selection/evidence gaps.
If selective personal retrieval is unavailable, investigate export alternatives
and separately review any raw-content processing boundary. The existing v1
source/channel enums do not include Instagram; do not relabel its records as
Messenger or fabricate saver receipts. This plan does not extend those enums.

Source: [Instagram messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/).

## GroupMe

**API route:** official documentation covers `GET /groups`, `GET /chats` and
`GET /groups/:group_id/messages`. Group messages expose provider IDs and epoch
timestamps; use `before_id` to page backward, up to 100 messages per page.
For forward traversal, `after_id` avoids `since_id`'s documented skipping of
intervening messages.

**Plan:** first verify whether a supported endpoint/client excludes names,
descriptions, previews, text and attachments before fetching. The inspected
reference documents content-bearing responses and no general field mask;
`omit=memberships` does not remove previews. Post-read stripping is insufficient.
Community documentation describes direct-message retrieval, but that endpoint
was absent from the current official reference inspected; verify it separately.

**Proof/fallback:** if selective retrieval is supported, test bounded traversal,
actual IDs/times, direct/group distinctions and unknown historical membership.
Otherwise request provider support or identify a separate local content-processing
decision. GroupMe is outside the approved source-category list and current v1
source/channel enums: source approval and reviewed contract support are separate
prerequisites. Keep a plan-level unsupported entry, not a fabricated v1 receipt
or a Messenger/SMS relabel. This change does not add GroupMe to the saver.

Sources: [official API](https://dev.groupme.com/docs/v3),
[community direct-message documentation](https://groupme-js.github.io/GroupMeCommunityDocs/api/dms/).

## Muse in a canvas or on a device

Muse deserves capability investigation: first-party connectors may expose
access unavailable through public APIs. Official architecture documentation
describes connectors and Gmail read access. Official Mac documentation confirms
read-only local-app access, including Messages; it does not establish Android
SMS/MMS/RCS support. Third-party reports of an Android SMS connector are leads,
not verified operation/field/history evidence.

**Processing finding:** Muse's documented core runs in a cloud VM. Its privacy
policy includes connected-device data in interactions, and its architecture
describes inference/telemetry outside the VM and an email classifier model.
A local app, browser canvas, read-only permission, JSON output or training
opt-out does not establish local-only processing. No supported on-device-only
mode was verified. The owner's revised manual policy permits specifically
approved Muse cloud/AI processing of metadata for a bounded run. Cloud processing
is therefore not itself an unsupported capability for that approved route.
This does not establish metadata-only access, stable records or complete history.
Muse-reported capabilities are leads, distinct from executed client schemas.

**Safe next inquiry:** use only public documentation or connector schemas:

> Do not access connected accounts, devices, personal records or existing
> private conversations. Describe documented Messenger, Gmail and Android text
> read operations, field selection, IDs, date filters, pagination, history
> limits and processing/storage locations. Include only synthetic example data
> and identify unverified capabilities.

Actual schemas, deterministic source evidence and processing support must pass
before a live trial. Asking Muse to retrieve real records is not authorized by
this inquiry or the policy change alone. Approve the exact processor, source,
fields and finite bounds separately; authentication alone is insufficient.
The content-exclusion rule and private-import guards are unchanged.
An open Muse page, a filled composer or a clicked send button is not retrieval
evidence. Verify submission, delivery/failure status and the response associated
with the exact new inquiry without reading unrelated private history. A schema
question is still only investigation; distinguish it from a source call and a
verified private export.
The client displayed an optimistic sending state for a schema inquiry that was
not present after refresh. This is a concrete delivery problem, not evidence
that an Android connector exists or lacks metadata projection. Reconcile an
uncertain submission before retrying; never report Muse data collected from a
pending bubble, an interface check or an unpersisted request.

Sources: [Muse architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse),
[privacy](https://muse.ai/privacy),
[Mac device access](https://www.meta.com/help/superintelligence/1126304576638594/),
[connector guidelines](https://platform.muse.ai/docs).

## Bounded trial and completion criteria

**V0 recency proposal:** derive "Last messaged" from the last observed
successfully sent direct message, not a received-only update, group/broadcast
activity, draft, failed send or scheduled-but-unsent message. Message text is
not needed. Require outgoing/sent and direct-recipient evidence; unknown
classification/identity/history remains visible. This is activity recency, not
an inferred meaningful interaction or relationship-quality score. Keep the
manually confirmed meaningful-connection date separate; retrieval does not
automatically reset it. This proposal does not change reducers or their policy.

For a later approval proposal, use the existing `PeriodRequest` preset `30d`,
an explicit IANA zone and as-of fixed at run start; retain its resolved
`[start,end)` semantics. Suggested per-source ceilings: 50 enumeration pages,
5,000 scanned records and 6,000 API calls. These are proposals, not implemented
saver controls or current approval. The acquisition route must enforce every
approved ceiling, counting scans outside the requested interval, detail calls
and retries. Stop on the first exhausted ceiling and preserve partial evidence.

Choose fresh private external local output outside Git. Do not enable or require
data-at-rest encryption, ACL/share/sync/backup audits or a fixed retention/deletion
date for manual retrieval. Preserve provider TLS and built-in credential handling.
Keep exact account/device references, approvals, address/header evidence and
operational files only in the approved private output/processing route. Never put
them in this plan, Git, Library, ordinary chat or logs. Muse processing must be
specifically approved; no source setup, sending or scheduling is implied.

For supported v1 sources, publish projected `ManualRun` metadata through
`contacts:retrieve-save`, with actual operation/response references, IDs,
timestamps, roles, coverage, gaps and cursors. Test the route synthetically
before separately approving real acquisition. Preserve saver exits 0/2/1;
an unavailable source is unknown, not zero. The plan is complete when each source
has a verified selective route or a precise alternative/decision, not when all
accounts are connected. Live retrieval ends at the immutable local handoff;
private converters, imports, aggregation and rendering remain disabled.
