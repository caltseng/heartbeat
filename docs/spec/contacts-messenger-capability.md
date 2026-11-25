# Heartbeat: personal Messenger access gate (CONTACTS-017)

Status: **local export conversion selected; [018 synthetic-only converter](contacts-messenger-converter.md)
now implemented; no real acquisition authorized**. Destination is `caltseng/heartbeat`, Phalanx repository ID
`heartbeat`. Bootstrap owner merge was verified at
`6b6299475b0d1dbcf2bd005c87d383ee97537e2b`. This gate records a technical
decision for later owner review, not a claim that personal history is accessible.

## Route decision and available capabilities

Select an offline metadata-only converter for an explicitly versioned JSON
snapshot profile, proposed connector `messenger-json-snapshot-v1`, for
CONTACTS-018. It can be developed with invented fixtures without account setup.
The approved CONTACTS-010 metadata-only policy does not authorize real native
content handling or a source/run. Private processing remains disabled pending
verified local controls and separate approvals. Do not fetch an export, install a bridge, inspect a device,
reuse a private browser, acquire credentials, pair, send or create a recurring job.

| Route | Available evidence / metadata | Decision and actual state |
| --- | --- | --- |
| Existing normalized handoff | Local `contacts-messenger-activity` plus `contacts:collect` accepts schemaVersion 1 identities, threads, memberships and timestamped sender events with provenance. | Callable now for synthetic inputs; not acquisition. 018 adds a synthetic-only native JSON projection. |
| Already available structured personal tool | This session's exposed tools and relevant deferred-tool descriptions contain no personal Messenger inbox reader/schema. No account or authentication probe was made. | No verified reader: `requires_setup`. This is a bounded catalog observation, not proof no such tool exists anywhere. |
| Public tool discovery | Agent Finder's five-result `Facebook Messenger` search returned HasData Facebook MCP (public pages/profiles), SendKuy (sending/campaigns), Faxette, MVVM Toolkit Messenger and Chat SDK. | None establishes personal-inbox reads. No candidate installed, connected or invoked. Discovery metadata is not a verified callable contract. |
| Meta Messenger Platform Conversations API | Documented Page conversations/messages expose IDs, timestamps and sender/recipient details; require a Page ID, Page token, Page tasks and permissions. | **Unsupported for this personal-inbox requirement.** Business onboarding/permissions do not grant existing personal friend/group history. Do not create a business app to bypass the gate. |
| Muse/browser UI | Prior reported query success is only UI evidence; it supplies no verified enumeration, IDs, pagination or coverage contract here. No prior session was inspected. | Not a selected acquisition route. Browser-query success cannot close structured access. Real collected data must not be sent to remote AI; UI-as-remote-acquisition is not a workaround. |
| Owner-provided Facebook JSON export | Publicly documented user export; public community schema describes participant labels, thread path/type, sender labels and epoch-millisecond timestamps. | Selected **snapshot** route, implemented in 018 for invented inputs only. Private conversion disabled; real export acquisition remains `requires_setup` pending separate approvals and actual producer-shape validation. |
| Encrypted chat backup / secure storage download | Meta documents a separate computer download of encrypted chat history. Actual account availability, backup reach and archive schema/version are unverified. | Separate format, **not included in v1**. Report unavailable encrypted periods explicitly; do not assume the standard export includes them or request recovery secrets. |

Why export first: it avoids inventing a personal API, separates owner-controlled
acquisition from local processing, needs no hosted service and admits repeatable
synthetic conversion tests. A future authorized structured reader could supersede
it only after documenting exact callable fields, IDs, read authority,
pagination/expiry, failure and history coverage. Search snippets and narrative
counts cannot substitute for event records.

## Selected export profile and version boundary

`messenger-json-snapshot-v1` is a **Heartbeat proposal version**, not a Meta export
version. The [018 converter](contacts-messenger-converter.md) supports this profile
only for synthetic inputs. Meta's public help specifies JSON versus
HTML but supplies no stable versioned Messenger archive schema. Producer/export
version is **unknown**; do not label it "Meta v1" or promise current encrypted
backup compatibility.

The initial synthetic profile selects extracted UTF-8 JSON conversation shards
at `messages\inbox\<thread-folder>\message_<positive-integer>.json`, optionally
under `your_facebook_activity\`. Public examples show this layout, but not every
producer/date is guaranteed to use it. Treat the two roots as explicit layout
variants of the proposed profile, not recursive discovery of arbitrary files.
Do not implement ZIP extraction or follow symlinks/path traversal. Require a
private manifest listing the exact immutable files, their SHA-256 digests, the
chosen layout/profile, export request range/categories, export creation/download
instants if known, and reviewed account/self mapping. Missing producer/version
evidence must be labeled unknown, never guessed from a ZIP filename.

Before any real input is accepted, CONTACTS-018 must validate a separately
authorized, locally inspected shape against the synthetic profile and record
which producer/layout was actually observed. Shape mismatch, HTML, an encrypted
backup, or an unrecognized wrapper needs a separately reviewed profile/version,
not heuristic parsing or silently dropping fields. Native unsupported inputs must
not be passed directly to the shared importer.

| Native field/evidence | Proposed metadata projection and limits |
| --- | --- |
| `participants[].name` | Display labels only; not provider IDs, addresses, canonical people or proof of historical membership. The owner supplies explicit self mapping; same names never establish identity equivalence. |
| `thread_path` | Preserve privately as source evidence; validate against the chosen relative folder. It is not a documented immutable provider thread ID. No source-opening URL is promised. |
| `thread_type` | Recognize `RegularGroup` as group evidence. Treat `Regular` as a direct candidate only with exactly one verified self and one unambiguous other identity. Missing/contradictory evidence stays unknown or fails validation, not inferred direct from today's roster. |
| `messages[].sender_name` | Resolve within the reviewed thread-local identity map. A departed participant may be absent from `participants`; require reviewed mapping rather than inventing the sender or erasing their event. Duplicate/ambiguous labels cannot be automatically resolved. |
| `messages[].timestamp_ms` | Validate a finite safe integer epoch millisecond instant and convert to UTC ISO, preserving milliseconds. Do not use the filename, export time, local wall-clock parsing or media creation timestamps as the event time. The reporting IANA time zone is separate. |
| `messages[].type`, `is_unsent` | Classify explicitly. V1 synthetic scope is unambiguous `Generic`, not-unsent message records. Calls, subscriptions, removals, unsent entries and unrecognized types need explicit excluded/unsupported accounting; do not turn every entry into a message. Reactions without their own timestamp cannot become timestamped events. |
| Message/provider IDs | Not guaranteed by this profile. Use labeled snapshot-local IDs below, never fabricated provider IDs. |
| Content/media/title/extra payload | Do not retain bodies, snippets, reactions' content, attachments/URLs, credentials or raw payloads in the handoff, logs or reports. Native exports may contain them; conversion must project allowlisted metadata locally and not echo rejected payloads. Optional thread titles are omitted by this proposal. |

The archive is not metadata-only even when the converter's output is. Approval
must cover local transient handling of the native file, not just storage of the
projection. Keep native input and its private manifest outside tracked output;
no real export or collected metadata may be processed by remote AI.

## Identity, replay, pagination and coverage

The proposed local ID scheme binds an immutable snapshot to the reviewed account:
compute a snapshot digest from a canonically sorted list of relative shard paths
and their file digests, with an unambiguous tuple encoding. Thread IDs encode the
snapshot digest and validated thread path; event IDs add the shard path and
original zero-based message-array index. Label all of them `idKind: local`.
Do not sort/filter messages before assigning IDs or collapse equal sender/time
tuples: two real messages may share a millisecond.

Identity IDs encode snapshot, thread and a stable reviewed local slot; display
names are attributes, never cross-thread keys. The private reviewed map resolves
each sender and explicit self flag. Preserve ambiguous matches for review; do not
merge by name, infer household membership or count a group message once per peer.
Represent one sender/event and only evidenced recipients. A current group roster
does not establish who received an old event; leave recipients empty if unknown.

Identical snapshot reimports must retain IDs and deduplicate through the shared
importer. A changed, repackaged, overlapping or differently sharded export gets a
different snapshot namespace; it is **not safely additive**. CONTACTS-018 must
reject an overlapping import into the same source/account until reviewed event
translation/reconciliation is integrated for this route (using CONTACTS-021), rather than count it twice or
deduplicate by message content. Do not change the account namespace to hide
overlap. A new snapshot is not live sync or a deletion feed.

Enumerate every declared numbered shard, not only `message_1.json`. Missing
shards, missing categories (requests/archived/other folders), excluded types,
interrupted downloads/conversion or ambiguous identities must be surfaced with
sanitized reasons. Exhausting local files proves only that the supplied snapshot
was read, not that upstream history ended. Import cursors locate normalized pages
within that immutable handoff; they are not Meta pagination tokens. Failed pages
must not advance committed cursors.

Set coverage `unknown` with null bounds when not established, or `partial` for
known bounds with gaps. Export request dates describe requested scope, not actual
coverage. First/last observed events alone cannot certify complete coverage.
Encrypted chat history may depend on secure storage, backup availability,
restoration and device history; missing/lost/deleted/unsent/disappearing material
cannot be reconstructed by this design. A successful current UI view, "all time"
export or restored device is not proof every thread's historical interval is
present. The ordinary export and encrypted backup may overlap or omit periods;
do not concatenate them and claim complete history.

## Synthetic shape and CONTACTS-018 handoff

Invented metadata projection of one native-profile shard (not importer input,
not evidence of a current Meta producer version):

```json
{
  "participants": [{"name": "Fixture Self"}, {"name": "Fixture Peer"}],
  "thread_type": "Regular",
  "thread_path": "inbox/fixture_direct",
  "messages": [
    {
      "sender_name": "Fixture Peer",
      "timestamp_ms": 1735689600123,
      "type": "Generic",
      "is_unsent": false
    }
  ]
}
```

The event instant is `2025-01-01T00:00:00.123Z`. After explicit synthetic self
mapping, a converter would produce one `source: messenger`, `channel: messenger`
event, local IDs, one sender and an evidenced self recipient. A four-member
fixture changes `thread_type` to `RegularGroup` with four distinct fixture
participants including self: it still yields **one** sender/event, not three
direct exchanges. Its roster alone does not establish historical recipients.
Use the existing schemaVersion 1 envelope, `dataClass: synthetic`, explicit
coverage and retrieval time; do not add native fields to the shared schema.

CONTACTS-018 must exercise these cases with local invented fixtures before
claiming a converter: direct/four-member group; multiple shards and interruption;
identical replay; duplicate timestamps; changed/overlapping export rejection;
duplicate-name/departed-sender/self ambiguity; invalid timestamps; content
projection; excluded event types; truncated/encrypted history; and unsupported
layout/version. The gate itself did not implement conversion; those behaviors are now exercised
by the separate [018 implementation and decision record](contacts-messenger-converter.md).

A desired real Messenger source remains explicit, for example:

```json
{
  "source": "messenger",
  "account": "fixture-messenger",
  "connector": "none",
  "mode": "unavailable",
  "status": "requires_setup",
  "reason": "No authorized personal reader; private converter processing disabled and source authorization not established."
}
```

That is a synthetic request entry, not an account identifier to use for a real
run. Use `unsupported` for a supplied native format with no supported converter.
Runtime failures must be `failed` or partial with sanitized reasons, never
empty success. Existing CLI exits remain 2 for unavailable/partial/failed sources
and 1 for fatal request/storage errors; a verified empty complete handoff is a
different case.

## Setup and evidence for later review

No setup was performed. After separate approvals, the owner (not this agent)
would select the personal profile, Messages category, bounded range and JSON
download-to-device option in Meta's export flow. Menu labels may vary during
Meta Account/Accounts Center migration. Encrypted chat backup is a separate
owner-controlled computer workflow; its availability and format must be recorded,
not assumed or enabled by the converter. Do not ask for passwords, PINs, recovery
keys, cookies, tokens, private browser access or a sample in chat/PR.

CONTACTS-010 now has an [approved metadata-only policy](../privacy.md), not
permission for native content handling or any particular account/run. Before
lifting private guards, verify local ACL/encryption, retention/deletion, backup
exclusions and each source/account/run approval. Real storage must remain outside
Git worktrees/cloud sync; ignored `.private/contacts/` is for synthetic generated
files only. Local-only is not encryption or permission.

Public evidence consulted 2026-11-24 (no personal account accessed):

- [Meta Conversations API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations.md/):
  Page/business scope, permissions and message fields; documented request-folder
  and older-message-detail limits are not guarantees for personal accounts.
- [Meta export help](https://www.facebook.com/help/212802592074644):
  profile/category/range selection, JSON/HTML, device export and account
  verification. This is format/access documentation, not a versioned schema.
- [Meta encrypted-chat download help](https://m.facebook.com/help/messenger-app/677912386869109):
  computer-only chat-backup download, separately from standard export.
- [Meta secure-storage explanation](https://about.fb.com/news/2024/03/end-to-end-encryption-on-messenger-explained/):
  backup/restoration and potential history loss without secure storage.
- [Community schema, pinned revision](https://github.com/Aggsel/messenger-sqlite-builder/blob/bb66f3c2983ea4d3c0b7456c759b419aab9210b5/Schema.md):
  field/type and current-roster evidence only, not Meta's schema guarantee.
- [Public export-layout example](https://www.mosaicchats.com/blog/how-to-export-messenger-chat):
  `your_facebook_activity\messages\inbox\...\message_1.json`; secondary evidence,
  not validation of an owner's export or a recommendation to upload it.
- [Agent Finder](https://agentfinder.github.com/api/v1/search):
  discovery-only five-result query recorded above; ranking is relevance, not
  safety/trust or authorization. No discovery result verified personal access.

The [technical contract](contacts-technical-spec.md), [privacy boundary](../privacy.md)
and [stable register](contacts-work-items.md) remain authoritative. This decision
does not grant CONTACTS-010 approval or authorize owner merge. CONTACTS-018 is
documented separately and remains synthetic-only.
