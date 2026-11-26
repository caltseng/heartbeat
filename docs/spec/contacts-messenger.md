# Heartbeat Messenger: access and converter (CONTACTS-017/018)

## Capability and authorization

017 selects offline `messenger-json-snapshot-v1`; 018 implements
`scripts/contacts/messenger.ts` for **synthetic inputs only**. This is a
Heartbeat profile, not a Meta producer version, personal API or encrypted-backup
reader. No actual producer/export, account or personal tool was verified.

No catalog reader was available during the gate. Public Agent Finder results
(HasData Facebook public pages/profiles, SendKuy campaigns, Faxette, MVVM
Messenger, Chat SDK) established no personal inbox capability; nothing was
installed/invoked. Meta Conversations APIs require Page/business authority, not
personal friend/group history. Reported Muse/browser query success proves no
structured IDs, pagination or coverage and is not this acquisition route.
Standard exports and secure-storage downloads are distinct, potentially
overlapping/omitted histories; never concatenate them as complete history.

[Shared rules](contacts-technical-spec.md#shared-operating-rules) and
[CONTACTS-010](../privacy.md) apply. Private CLI/library conversion fails with
`private_collection_disabled`, exit 1 before native paths/output access;
metadata policy does not authorize transient native content. Future real
processing needs a separate content boundary, source/account and EACH-run
approval, verified local controls, retention/deletion and authorized local
producer-shape validation. No account/device/browser reuse, credentials/PINs/
recovery keys, pairing, bridge, sending, source write, remote AI or schedules.
An owner would select the personal profile/category/range/JSON device export
manually only after approvals. Manual [V0](contacts-manual-retrieval.md) does not
lift private converter/importer guards.

## Invocation and manifest

```powershell
npm run contacts:messenger -- --synthetic-request .private\contacts\messenger\request.json
```

Request fields: `manifest`, `inputRoot`, fresh `output`; paths relative to
request. Synthetic files may use ignored `.private\contacts` or external local
output; real storage must instead be outside Git/sync and verified private.
Requests, files, digests, maps and CLI manifests must never be committed/shared.

| Manifest field | Contract |
| --- | --- |
| Version/class/profile | `schemaVersion:1`, `dataClass:"synthetic"`, `profile:"messenger-json-snapshot-v1"`. |
| layout | `messages-inbox` or `activity-messages-inbox`: exactly `messages/inbox/<folder>/message_<n>.json`, optionally under `your_facebook_activity/`. Logical paths use `/`, local access native components. Folder ASCII letters/digits/underscore/hyphen; n positive safe integer. |
| account/retrievedAt | Reviewed stable account ref; UTC ISO retrieval with milliseconds. |
| producerVersion | Known string or explicit null/unknown. Neither synthetic profile nor ZIP filename verifies a producer. |
| exportCreatedAt/exportDownloadedAt | UTC ISO milliseconds <= retrieval or null; not event times. |
| period | Existing 7d/30d/custom contract, requested scope only. Preserve event instants; reports filter downstream. |
| categories/history | Nonempty unique categories; only inbox supported. Other folders remain unverified. `history:{truncated:false,encryptedHistory:"unknown"}`; true/omitted records known gaps, never completeness. |
| shards | Exact nonempty `{path,sha256}` list, lowercase exact-byte digests; all numbered shards, no duplicate/traversal/ZIP extraction/recursive discovery. Reject symlinks/junctions from selected root down, not trusted OS aliases above it. |
| threads | One map per threadPath (e.g. inbox/fixture_direct), boolean directRecipientsReviewed, identities `{slot,name,isSelf}`. Exactly one self, unique reviewed thread-local slots/labels; not canonical/provider IDs. |

Native shard fields: `participants[].name`, matching `thread_path`,
`thread_type:Regular/RegularGroup`, `messages[]` with sender_name,
safe-integer epoch-millisecond timestamp_ms, type and optional is_unsent.
Known content/media/title fields are accepted solely to discard; unknown
wrappers/fields fail the shard. Only Generic without true is_unsent emits
messages; other/unsent types are counted exclusions, reactions without their own
time never become events. Missing is_unsent is permitted synthetically, not
proof unsent history is recoverable. No bodies/URLs/reaction content/raw payload
in handoffs/logs/reports; no media decoding or remote processing.

Labels resolve solely through reviewed slots. Duplicate/self ambiguity fails
before reads; unmapped participants/senders fail the shard. A departed sender
may be mapped without joining today's roster. No name-based cross-thread merge.
Regular requires exactly two current/mapped people, one self and explicit
directRecipientsReviewed; the other is recipient. RegularGroup gives group
evidence with **no inferred historical recipients**. Contradictory rosters/types
across shards fail per shard; one group message remains one event.

## Identity, overlap and recovery

Snapshot SHA-256 hashes JSON tuple `[account, sorted [relativePath,fileSHA256]
tuples]`. IDs are local `messenger-json-snapshot-v1:<snapshot-digest>:<tuple-digest>`.
Tuple includes record kind/thread path, plus identity slot or event shard path
and original zero-based array index before exclusions. Declaration reorder
preserves IDs; equal sender/time rows stay distinct. Never hash body/time/name
as event equivalence or promise source-opening URLs from thread_path.

Exact immutable replay deduplicates. Repackaging/resharding/file-list or byte
changes creates a new namespace. Under the shared lock, the importer rejects
different snapshots AND other connectors in the same Messenger account in
either order (`snapshot_conflict`), even apparently disjoint snapshots.
CONTACTS-021 overlapReview does not lift this gate; route-specific reviewed
translation is separate work. Do not rename accounts to evade it. Changed maps
can produce explicit record conflicts, not destructive rewrites.

Each shard projects atomically in memory; failed shards yield no records, other
good shards survive with sanitized codes. Missing files/digests/numbers, invalid
JSON/time/rosters, excluded categories, truncation and encrypted gaps never become
empty success. Retry the unchanged full manifest after interruption; stable
IDs deduplicate prior events. No native cursor; one terminal null-cursor handoff
page retains ordinary importer page/checkpoint semantics.

Supported conversion atomically publishes the shared immutable `handoff.json`,
`report.json` and `request.synthetic.json`, source/channel messenger,
schemaVersion 1, unknown coverage/null
bounds and upstream limits, **partial/exit 2** even empty. No valid shards or
unsupported profile/layout yields report-only unsupported/2, not importable empty
handoff. Invalid/private/unsafe/occupied-output/storage failures exit **1**.
CLI prints generic status/codes, not account/path/native payload. Import the
handoff using the generated `request.synthetic.json` (matching account, connector,
period and metadata-import mode); collection output stays in the bundle. Keep
unsupported sources as explicit unavailable entries, never pass native JSON to
the importer.

File exhaustion/export-request dates/min/max events do not prove history.
Deleted/unsent/disappearing/lost encrypted history, old devices, unselected
folders and current rosters remain uncertain. Snapshot import is not live sync
or deletion feed.

Engineering history: [017 selection](../decisions.md#contacts-017),
[018 implementation](../decisions.md#contacts-018).
`npm run ci` includes messenger.test.ts: both layouts, direct/four-person groups,
shards/interruption, reordered/equal-time replay, bidirectional overlap,
identity ambiguity/departed senders, content projection, invalid timestamps,
missing/truncated/encrypted/empty/unsupported cases, redirects, immutable output
and CLI 2/1. No real-account validation.

## Public evidence

Consulted 2026-11-24:
[Meta Page Conversations API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations.md/),
[export help](https://www.facebook.com/help/212802592074644),
[encrypted download](https://m.facebook.com/help/messenger-app/677912386869109),
[secure storage/history loss](https://about.fb.com/news/2024/03/end-to-end-encryption-on-messenger-explained/),
[pinned community schema](https://github.com/Aggsel/messenger-sqlite-builder/blob/bb66f3c2983ea4d3c0b7456c759b419aab9210b5/Schema.md),
[secondary export layout](https://www.mosaicchats.com/blog/how-to-export-messenger-chat),
[Agent Finder discovery](https://agentfinder.github.com/api/v1/search).
Community layouts are descriptive, not producer certification or upload advice.
