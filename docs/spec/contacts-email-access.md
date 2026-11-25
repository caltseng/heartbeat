# Heartbeat: email access gate (CONTACTS-013)

Implementation follow-up: [CONTACTS-014](contacts-email-adapter.md) now implements
this selected route with an injected synthetic metadata transport, native list
checkpoint and a synthetic-only CLI. It does not add HTTP/OAuth, connected access,
history synchronization or private-run permission. The gate findings below
describe the original selection and continue to constrain future real access.

## Selected route and actual availability

Select **Gmail API v1, read-only `gmail.metadata`**, for the proposed
CONTACTS-014 local acquisition adapter. This is a technical route selection,
not confirmation that the owner's email is Gmail, consent, or a connected tool.
If the authorized account is not Gmail, this route is `unsupported`; select a
different provider in a separately reviewed gate rather than pretending Gmail
can read it. No email acquisition tool is exposed in this writer's tool catalog.
Only the existing normalized metadata importer is callable here. No OAuth
client, tokens, account, native export parser or live adapter was inspected or
created. Public documentation was consulted on 2026-11-25.

Decision for later owner review: Gmail metadata is the smallest defensible first
route because it has stable message/thread IDs, header-level roles and paging
without permission to read bodies. This assumes a future approved Gmail account,
not evidence one exists. Prefer a potentially partial enumeration over broader
scope solely to enable date search. Alternatives deferred: `gmail.readonly`
supports search but unnecessarily permits bodies; Microsoft Graph requires its
own provider/permission gate; generic email search tools need verified structured
IDs, roles, pagination and coverage before reuse; MBOX needs a separate converter
and can contain content outside this metadata boundary. None is a silent fallback.
This technical decision does not wait on ordinary provider preference, but an
account mismatch must remain explicit rather than triggering real access.

The bootstrap prerequisite is satisfied by Heartbeat `main` commit
`6b6299475b0d1dbcf2bd005c87d383ee97537e2b`. This gate enables synthetic adapter
work only. CONTACTS-010's approved location, ACL/encryption, retention/deletion,
backups and bounded source authorization remain required before any real run.
Do not acquire credentials, reuse private browser sessions, install bridges,
send messages or create recurring jobs. All eventual account configuration,
native cursors, handoffs, manifests and Heartbeat report/graph files stay in
ignored `.private/` or an approved external local directory, never PR output.

## Capability map

| Capability | Selected provider contract | Normalization / explicit limitation |
| --- | --- | --- |
| Permission | `https://www.googleapis.com/auth/gmail.metadata` reads labels/headers, not bodies; Google categorizes it as restricted. | No `gmail.readonly` (body-capable), modify, send, settings or full-mail scope. Do not silently broaden permission if search is unavailable. Owner must separately approve setup and applicable OAuth requirements. |
| Account/self | Proposed `users.getProfile(me)` exposes `emailAddress` and `historyId`. | Bind the returned address to an owner-reviewed stable account namespace. Other aliases require explicit reviewed self mappings; do not infer them from names or a `SENT` label. Profile totals are not interval counts. |
| Message/thread IDs | `messages.list` returns `id`, `threadId`; `messages.get` returns immutable message `id` and associated `threadId`. | Preserve opaque strings as provider IDs within `email` + reviewed account namespace. One message is one event, even with many recipients; a thread is not an event. RFC `Message-ID` is not a substitute Gmail ID or a cross-account merge key. |
| Metadata read | `messages.get(format=metadata, metadataHeaders=[...])`; use a partial-response field mask. | Allow only `id,threadId,labelIds,historyId,internalDate,payload(headers)` and header names `From,To,Cc,Bcc,Date,List-Id,Precedence,Auto-Submitted`. Never request `full`, `raw`, subject, snippet, body, MIME parts or attachments. Fail closed if unexpected content is returned; never log raw responses. |
| Time | `Date` is the claimed sent time; `internalDate` is Gmail's epoch-ms creation/acceptance time (potentially chosen on migration). | Use a valid unambiguous offset-bearing `Date` as event timestamp; missing/invalid/future-at-retrieval dates prevent that event's normalization and make coverage partial. Do not silently substitute receipt/import time for sent time. Keep timestamp-basis diagnostics privately outside the v1 envelope. |
| Sender | `From` header, not `Sender` or a display name. | Parse mailbox syntax, including quoted names and address groups, before assigning local address identity IDs. Missing/ambiguous multiple authors or unparseable addresses leave a visible error/partial source; do not invent a sender or merge by display name. Parser implementation belongs to 014. |
| To/CC | Available `To` and `Cc` headers retain actual roles. | Preserve recipients as `to` and `cc`, not separate messages. Absent headers do not establish an empty recipient roster. Missing required recipient evidence means `unknown` thread kind/partial coverage, not assumed direct contact. |
| BCC | Only a Bcc header actually exposed to this account can be used. | Incoming hidden BCC recipients are unavailable; never reconstruct them or infer all BCC from delivery to self. Visible BCC is `bcc`. Even two visible people do not prove a complete direct roster; default `unknown` unless independently justified. |
| Thread kind | Provider `threadId` groups messages, not a historically complete roster or evidence of pairwise contact. | Multi-party evidence permits `group`; known list distribution permits `broadcast`; otherwise `unknown` is safe. `direct` requires exactly one verified self and one peer plus evidence the roster is complete. Membership creates no events. |
| Pagination | `messages.list`: default 100, maximum 500 per page; follow `nextPageToken`. `resultSizeEstimate` is an estimate. | Persist adapter progress separately from handoff cursors. No estimate, first page, budget limit or empty search answer establishes zero history. |
| Search | The `q` parameter is **not allowed with `gmail.metadata`**. | Initial route enumerates without `q` and filters sent-time bounds locally. No inbox-only label filter; exclude drafts explicitly, declare spam/trash inclusion policy. Enumeration may be expensive; a bounded scan is partial, not permission to read bodies or widen scope. |
| History | `history.list(startHistoryId)` lists mailbox changes, not all past messages. | Follow its own page tokens; history IDs have gaps and expire. HTTP 404 requires explicit resync, never empty success. See coverage below. |
| Bulk/automation | Header evidence may suggest lists/automation; Gmail categories and Workspace classification labels are not interpersonal proof. | Keep all events with explicit `interpersonal/bulk/automated/unclassified`; no classifier ships in this gate. No body read is required to count observed message events. |
| Native export / other tools | No native MBOX parser or alternative email provider selected. | Normalized handoff import is supported; raw archives, narrative search summaries and aggregate-only tools are `unsupported` inputs, not fabricated message records. |

Header values and address IDs are private metadata too. The native response is
not the importer schema: strip headers/labels/history tokens after normalization.
The v1 allowlist accepts addresses, roles, IDs, event instants and classification,
not raw vendor objects or arbitrary classification-evidence fields.

## Search limits, account history and cursor safety

The future adapter must list the approved mailbox scope, explicitly choosing
`includeSpamTrash` and recording draft/spam/trash exclusions. It must fetch
metadata for each listed message, deduplicate by account/message ID and apply
the requested half-open sent-time interval locally. Do not stop at an apparently
old message: the list contract does not promise ordering by the `Date` header.
With metadata scope there is no server-side date `q`, so a small authorized
budget may legitimately be insufficient for a historical interval.

Tool page sizes, search caps, authorization filters, missing headers, skipped
messages, rate limits and permission failures describe **acquisition coverage**,
not the beginning/end of the account's history. A tool exposing only its latest
N results is at best partial, even if its own cursor is exhausted. A complete
scan can describe currently accessible mailbox contents within the declared
scope, not previously deleted mail or every historical exchange. The initial
Gmail route should emit `partial` or `unknown` coverage until snapshot consistency,
all included threads and the requested bounds are evidenced; never claim an
all-time history guarantee from terminal pagination. Counts are lower bounds.

Keep three cursor domains distinct:

1. Gmail list `nextPageToken`: enumeration continuation, not a durable history
   watermark. An invalid token requires a visible restart/rescan with ID dedup.
2. Gmail `historyId` / history-list `nextPageToken`: change tracking. History is
   typically retained at least a week but may last only hours; a 404 means
   `history_expired` and a full resync of the approved scope. Changes/deletions
   require CONTACTS-021 reconciliation; do not erase curated records or count
   label changes as new messages. Advance native watermarks only after durable
   normalized output and its associated page are committed.
3. Importer `pages[].cursor/nextCursor`: locations in a supplied immutable
   metadata handoff. Never pass a Gmail history ID as this cursor or overwrite
   an unfinished handoff to simulate a live sync.

Without a separately verified race-safe reconciliation strategy, concurrent
mailbox changes also keep a scan partial. CONTACTS-014 owns that implementation;
this gate does not implement retries, history acquisition or a converter.

## Classification and failure outcomes

Proposed conservative classification policy for 014: a non-`no`
`Auto-Submitted` value is automation evidence; valid `List-Id` or reviewed
`Precedence: bulk/list` is bulk evidence. Conflicting/invalid evidence remains
`unclassified` with private diagnostics. Absence of these headers or a Gmail
personal/category label does not establish interpersonal mail. `interpersonal`
requires explicit reviewed evidence. Collection keeps every class; future
summaries disclose bulk/automated exclusions and unclassified counts. Neither
bulk mail nor hidden recipients become direct relationship evidence.

| Condition | Required outcome using current contracts |
| --- | --- |
| No adapter, missing approval, no authorized Gmail route, HTTP 401 or insufficient scope/403 | `mode: unavailable`, `status: requires_setup`, reason identifying the gap; exit 2. If failure follows persisted pages, retain them with a sanitized upstream error and partial coverage. Never request secrets or expand scopes automatically. |
| Non-Gmail account, body-only tool, unsupported export or no stable message/thread IDs | `unsupported` with a reason before collection; no empty successful snapshot. |
| Required sender/time cannot normalize, detail 404 after listing, malformed metadata, rate limit/5xx or exhausted budget | Keep valid pages, surface sanitized error codes (`metadata_incomplete`, `message_unavailable`, `rate_limited`, etc.) with retryability and partial/unknown coverage; no forged events or advanced failed-page checkpoint. |
| Hidden BCC, unknown aliases/roster or absent optional classifier headers | Explicit limitation in private acquisition report and coverage basis; preserve known roles, use `unknown` kind / `unclassified` as appropriate. Never treat missing values as proven absence. |
| History 404 / invalid page token | Explicit resync-required error and partial/unknown coverage. No zero-count or deleted-history conclusion. |
| Verified empty snapshot | Only terminal enumeration with verified scope/coverage and no unresolved errors may describe an empty accessible snapshot; not empty all-time account history. |

`requires_setup` and `unsupported` are unavailable request statuses, not event
fields. Runtime handoff `errors: [{code, retryable}]` keep source status partial
even when pagination finishes. An invalid supplied handoff fails visibly under
the existing importer. All diagnostics are sanitized and private.

## Synthetic payload and proof boundary

[email-gate.synthetic.json](../../scripts/contacts/fixtures/email-gate.synthetic.json)
is an executable **normalized** v1 payload, not a captured Gmail response. All
IDs and `.invalid` addresses are invented. Its connector name labels a proposed
route fixture, not a live implementation. Two handoff pages contain five events:
a proven synthetic direct exchange, multi-recipient To/CC mail, list broadcast,
automation and unclassified mail with an unknown roster. All IDs are local
because none were issued by a provider. Exhausted pagination deliberately
coexists with partial history. The fixture's proven direct case must not be
generalized to real Gmail headers.

Focused cases in `scripts/contacts/collect.test.cjs` import that payload, check
one event per message and preserved roles/classes, replay it without duplicates,
and verify that incomplete/unsupported access stays nonzero. No network, body
read, account access, credential acquisition or package installation is needed.
Only synthetic examples belong in tracked output. Actual acquisition remains
CONTACTS-014; the source and privacy approval gaps above are not closed.

## Public references

- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [List messages: fields, search restriction and pagination](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Get message: metadataHeaders](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Response formats: metadata versus full/raw](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format)
- [Message resource: IDs, headers and internalDate](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Profile: primary address and history ID](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)
- [History list: expiry and paging](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Synchronization limitations](https://developers.google.com/workspace/gmail/api/guides/sync)
