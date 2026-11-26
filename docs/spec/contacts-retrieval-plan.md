# Heartbeat source retrieval plan

Public-documentation investigation: 2026-11-26. This is a plan for
`contacts-retrieve`, not connected access, source setup, private-run approval or
an amendment to the [privacy policy](../privacy.md). No account, device, private
browser session or real export was inspected. The [manual handoff
contract](contacts-manual-retrieval.md) remains authoritative.

## Approach and iteration order

Investigate each source independently; one unavailable source must not stop
another supported, approved source. Distinguish a documented API, an available
client, verified operation/field support and an authorized real run. None implies
the next. Research and synthetic validation need no private folder or sign-in;
ask for those only when a concrete route is ready for acquisition.

| Source | Public evidence | First investigation / fallback |
| --- | --- | --- |
| Android texts | Local SMS/MMS Telephony API with column projection | First device-route investigation: existing metadata-only tooling, then export alternatives. RCS remains separate. |
| Google contacts | Selective People API | First cloud-source API candidate; an identity snapshot, not 30-day activity. |
| Gmail | Metadata-only Gmail API | First email candidate; bounded enumeration may be partial. |
| Personal Messenger | Public Conversations API is Page/professional-account scoped | Investigate Muse capabilities without private reads; otherwise local export alternatives. |
| Personal WhatsApp | Documented Cloud API is the Business Platform | Investigate metadata-only local export alternatives, not business migration or pairing. |
| GroupMe | Public group-history API | Resolve content exclusion and source-contract support before reads. |

Start with Android route feasibility while Google tool availability can be
investigated independently. Prefer existing inspected tools, not a new backend,
bridge or OAuth implementation. Choose reasonable engineering defaults and
present one bounded approval proposal when a route is viable; do not turn
ordinary missing preferences into repeated questionnaires.

## Android texts: SMS/MMS first

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
normal client sign-in only after approval. Enumerate with `nextPageToken`, starting
at 100 records per page. Preserve provider resource names and reviewed account/
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
The authenticated personal Messenger connector has not been inspected.

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
mode was verified. Under the current policy, that cloud/AI route is
`unsupported`; this is a processing incompatibility, not proof of absent access.

**Safe next inquiry:** use only public documentation or connector schemas:

> Do not access connected accounts, devices, personal records or existing
> private conversations. Describe documented Messenger, Gmail and Android text
> read operations, field selection, IDs, date filters, pagination, history
> limits and processing/storage locations. Include only synthetic example data
> and identify unverified capabilities.

Actual schemas, deterministic source evidence and processing support must pass
before a live trial. Asking Muse to retrieve real records is not authorized by
this inquiry. A cloud/content policy change needs an explicit separate owner
decision; authentication alone does not amend policy.

Sources: [Muse architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse),
[privacy](https://muse.ai/privacy),
[Mac device access](https://www.meta.com/help/superintelligence/1126304576638594/),
[connector guidelines](https://platform.muse.ai/docs).

## Bounded trial and completion criteria

For a later approval proposal, use the existing `PeriodRequest` preset `30d`,
an explicit IANA zone and as-of fixed at run start; retain its resolved
`[start,end)` semantics. Suggested per-source ceilings: 50 enumeration pages,
5,000 scanned records and 6,000 API calls. These are proposals, not implemented
saver controls or current approval. The acquisition route must enforce every
approved ceiling, counting scans outside the requested interval, detail calls
and retries. Stop on the first exhausted ceiling and preserve partial evidence.

Verify private external Windows storage, encryption, access, backup/sync/share
exclusions and deletion within 12 months once for the bounded run. Keep exact
account/device references, approvals, raw address/header evidence and operational
files only in the approved private location. Never put them in this plan, Git,
Library, ordinary chat or logs. No source setup, sending or scheduling is implied.

For supported v1 sources, publish projected `ManualRun` metadata through
`contacts:retrieve-save`, with actual operation/response references, IDs,
timestamps, roles, coverage, gaps and cursors. Test the route synthetically
before separately approving real acquisition. Preserve saver exits 0/2/1;
an unavailable source is unknown, not zero. The plan is complete when each source
has a verified selective route or a precise alternative/decision, not when all
accounts are connected. Live retrieval ends at the immutable local handoff;
private converters, imports, aggregation and rendering remain disabled.
