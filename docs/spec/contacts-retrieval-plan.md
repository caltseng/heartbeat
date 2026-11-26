# Heartbeat source retrieval plan

Public-documentation and credential-free client investigation: 2026-11-26. This is a plan for
`contacts-retrieve`, not connected access, source setup, private-run approval or
an amendment to the [privacy policy](../privacy.md). No personal source records or
real exports have been retrieved. The [manual handoff
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

## Google client and authentication evidence

Keep these two clients distinct:

| Client | Verified evidence | Remaining work |
| --- | --- | --- |
| Community `gws` (`googleworkspace/cli`), locally installed 0.22.5 | Public schemas and offline GET serialization support People/Gmail field masks. A credential-free login preflight stops with `No OAuth client configured`, exit 2, before browser sign-in. | Configure or reuse a Desktop OAuth client privately, inspect auth scopes/processing and obtain separate bounded-run approval. No live API acceptance or account read has been proved. |
| Official Google `gwscli` | Google's documentation offers Personal mode for a single-user OAuth client, automatically enables core services and skips consent-screen setup/app verification. No application needs to be built or published. | Select/create a personal-mode Cloud project, create/download the client JSON, register it locally and sign in. This client is not installed or authenticated here; command schemas/metadata field exclusion still need verification. |

The official [Personal mode setup](https://developers.google.com/workspace/guides/workspace-cli#personal-mode)
is a simpler authentication candidate than manually configuring a consent screen.
It still registers an OAuth client; it is not a bundled-client, setup-free login.
Use normal owner-operated setup/sign-in and minimum command/service scopes, not
all-service authorization. Registration, API enablement and sign-in are separate
owner actions, not authorized by this research.
People commands are documented as Developer Preview. Official `gwscli` uses
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
The owner controls sign-in/pairing and chooses/opens conversations. Do not
extract cookies, inspect raw app/network state, or automate opening unread
threads, which can trigger provider read markers.

An owner-authorized structural probe reached the conversation-list DOM.
`mws-conversation-list-item` exposes conversation links and test attributes;
`mws-relative-timestamp` exposes display-time markup. This demonstrates a usable
authenticated UI, not a saved message-level handoff. The current list does not
itself establish exact message timestamps, outgoing direction, sender IDs,
SMS/MMS/RCS transport or complete history. Do not treat its latest activity as
the owner's last sent message. Inspect only selected metadata nodes, never
snippets/bodies or a whole-page snapshot.

Use the browser's configured IANA zone without asking a preference question.
Partial dates/times, virtualized/off-screen records and absent native IDs remain
gaps. A browser-local save must use owner-selected storage outside Git and must
not pass records through chat, tool logs or Library. UI-local IDs need a reviewed
immutable snapshot namespace; they are not provider IDs or cross-run sync keys.
No source records have yet been published through the manual saver by this
structural probe.

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
