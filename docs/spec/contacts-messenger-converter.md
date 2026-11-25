# Heartbeat: Messenger snapshot converter (CONTACTS-018)

Status: **implemented for synthetic inputs only**. This implements the local
`messenger-json-snapshot-v1` route chosen by [017](contacts-messenger-capability.md),
not a personal API, live connector, current Meta producer certification or
encrypted-backup reader. Real conversion is disabled, including library calls.
CONTACTS-010's policy is approved, but its enforceable local controls, separate
source/account and each-run approvals remain unmet; no accounts,
credentials, devices, browser sessions, acquisition, sending or schedules were used.

## Local invocation and contract

```powershell
npm run contacts:messenger -- --synthetic-request .private\contacts\messenger\request.json
```

The private request contains `manifest`, `inputRoot` and a fresh `output`
directory, with paths relative to the request file. Use ignored `.private\contacts`
or an approved external local directory. Do not commit native files, requests,
maps, digests, output, or CLI manifests. The native input may contain content;
only the projected metadata is emitted. A synthetic declaration does not
authorize processing real files. No real data may be sent to remote AI.

`manifest` has the following required fields:

| Field | Contract |
| --- | --- |
| `schemaVersion`, `dataClass`, `profile` | `1`, `synthetic`, `messenger-json-snapshot-v1`. This is a Heartbeat profile, not a Meta producer version. |
| `layout` | `messages-inbox` or `activity-messages-inbox`: exactly `messages/inbox/<folder>/message_<n>.json` or `your_facebook_activity/messages/inbox/<folder>/message_<n>.json`. Logical manifest paths use `/`; filesystem access uses native path components. Folder names are limited to ASCII letters/digits/underscore/hyphen; `n` is a positive safe integer. |
| `account`, `retrievedAt` | Reviewed stable synthetic account reference and UTC ISO instant with milliseconds. No credentials. |
| `producerVersion` | Known version string or explicit `null` for unknown; synthetic testing does not verify a producer. |
| `exportCreatedAt`, `exportDownloadedAt` | UTC ISO instants with milliseconds no later than retrieval, or `null` for unknown. Not event times. |
| `period` | Existing custom/7d/30d request-period contract. It describes the requested export/report scope, **not** certified coverage. Conversion retains event instants; downstream reports filter intervals. |
| `categories` | Nonempty unique declared category names. Only `inbox` is supported; other requested categories produce an explicit limitation, never implied coverage. Other folders remain unverified even if not requested. |
| `history` | `{ "truncated": false, "encryptedHistory": "unknown" }`; use `truncated: true` and/or `encryptedHistory: "omitted"` for known gaps. Neither alternative can certify completeness. |
| `shards` | Nonempty list of `{ "path": "<exact logical relative path>", "sha256": "<lowercase digest of exact bytes>" }`. No duplicates, traversal, ZIP extraction or recursive discovery. Reject symlinks/junctions at the selected input root and every descendant component; trusted OS aliases above that root are permitted. Declare every numbered shard. |
| `threads` | One reviewed mapping per declared thread: `threadPath` (for example `inbox/fixture_direct`), boolean `directRecipientsReviewed`, and `identities: [{ "slot": "self", "name": "Fixture Self", "isSelf": true }, ...]`. Exactly one explicit self; unique slots and labels within the thread. Slots are reviewed local references, not provider IDs or canonical people. |

Each native shard must match the selected profile: `participants[].name`,
`thread_path`, `thread_type` (`Regular` or `RegularGroup`), and `messages[]`.
Known content/media/title fields are accepted only to discard them; unknown
wrappers/fields fail the shard rather than guess another format. Content is never
copied into a handoff, report or error. Real native content handling is not
authorized by the approved metadata-only policy. `Generic` messages without a true
`is_unsent` flag become message events; an absent flag is permitted by this
synthetic profile, not evidence that unsent history is recoverable. Other types
and explicit unsent entries are excluded and counted. Reactions are not
manufactured into timestamped events.

Sender labels resolve only through the thread's explicit reviewed mapping.
Duplicate labels or missing/ambiguous self mappings fail before shard reads;
unmapped native participants/senders fail the entire shard. A departed group
sender can be mapped without becoming a current roster member. No cross-thread
or cross-account name match is inferred.

`Regular` requires exactly two mapped/current participants, one self, plus
`directRecipientsReviewed: true`; its reviewed other participant is the recipient.
`RegularGroup` remains group evidence, with **no inferred historical recipients**.
One group message creates one event, not an event for each peer. Contradictory
rosters or thread types across shards are explicitly rejected per shard.

## Identity, retry, overlap and results

The snapshot digest hashes the JSON tuple of the account and sorted
`[relativePath, fileSHA256]` tuples. Every identity/thread/event ID is
`messenger-json-snapshot-v1:<snapshot-digest>:<tuple-digest>`, with `idKind: local`.
The tuple uses record kind and thread path; identity tuples add reviewed slot;
event tuples add shard path and the original zero-based array index **before**
exclusions. Equal sender/time messages therefore stay distinct. No body hashing,
provider-ID invention or content/time deduplication occurs.

Reordered declarations preserve IDs. Identical immutable snapshot reimports
deduplicate through the existing importer. Repackaging, resharding, adding/removing
declared files or changing bytes changes the namespace. The importer, under its
existing store lock and before record/cursor mutation, rejects a different
snapshot or another connector in that same Messenger account in either import
order (`snapshot_overlap`). This deliberately rejects even apparently disjoint
snapshots until CONTACTS-021 translation exists. Do not change the account to
evade overlap. Changed mappings in one snapshot can yield explicit record
conflicts, not destructive identity rewrites.

Each shard is validated/projected atomically in memory; failed shards contribute
no records. Other valid shards survive with sanitized error codes. Missing files,
digest changes, invalid JSON, missing shard numbers, excluded types, truncation,
encrypted-history gaps and unknown source history never become empty success.
Retry the unchanged full manifest after an interrupted read; recovered shard IDs
are stable and prior events deduplicate. There is no native acquisition cursor:
the single normalized terminal page uses null handoff cursors. The shared
importer's page commit/checkpoint rules remain unchanged.

A supported conversion atomically publishes a new immutable directory containing
`handoff.json` and `report.json`. The handoff has schemaVersion 1, source/channel
`messenger`, explicit provenance through the existing importer, unknown coverage
with null bounds and upstream limitation codes. The report status is `partial`,
even for an empty valid snapshot. Exit is **2**, never 0. No valid shards or an
unsupported profile/layout produces `unsupported`, report only, no importable
empty handoff, exit 2. Invalid requests, disabled private inputs, unsafe/occupied
output and storage failures exit **1** with sanitized codes. The CLI prints only
a generic Heartbeat result, not private account IDs/paths or native payloads.

Import a generated handoff through an ordinary private synthetic collection
request using `source: messenger`, `connector: messenger-json-snapshot-v1`,
the same account, and `mode: metadata-import`. The collector records the
handoff's limitation errors and returns partial/exit 2. For unsupported native
input, keep an explicit unavailable source with `status: unsupported` and a
sanitized reason instead; never feed native shards to `contacts:collect`.

## Delegated engineering decisions for owner review

These are engineering defaults under the 2026-11-24 delegation, **not additions to
owner-approved privacy policy**. No decision lifts the [private boundary](../privacy.md)
or its synthetic-only enforcement. A future real native-file route needs explicit
approval for transient content handling as well as local controls/source/run gates.

| Decision / rationale | Alternatives and assumptions | Validation / revisit condition |
| --- | --- | --- |
| Implement the selected offline, synthetic-only JSON profile with standard-library Node; no API/browser route or dependencies. | A verified authorized structured reader was unavailable in 017. Assumes declared invented shapes, not a current producer. | Two root variants, unsupported layouts/wrappers and private-run rejection. Revisit only with separately authorized local producer-shape validation or a verified reader contract. |
| Exact manifest files/digests, local reviewed identity slots, strict field/layout gate and no recursive discovery. Check redirection from the selected root down, not above it: OS aliases such as macOS `/var` are not export-controlled components. | Heuristic parsing/name matching risks identity collisions and accidental private input. Rejecting every filesystem ancestor breaks legitimate OS/profile aliases. Current format has no guaranteed provider IDs. | Multi-shard, duplicate-name/self/departed-sender, digest, allowed-ancestor-alias and rejected-root/descendant-redirection cases. A new producer/layout or duplicate-label identity evidence needs a reviewed profile revision. |
| One immutable snapshot namespace, conservative bidirectional overlap rejection in the shared importer. | Timestamp/content matching loses legitimate duplicate events; additive changed snapshots double-count. All snapshots may overlap until proven otherwise. | Replay, interruption recovery, equal timestamps and unchanged store records after rejected overlap. Revisit with CONTACTS-021 reviewed translations, not account aliases. |
| Retain unknown coverage/null bounds, report missing/unsupported history; no complete success. | Requested dates, first/last events and file exhaustion cannot establish full upstream history. No encrypted backup is verified. | Truncated/encrypted/missing/empty/unsupported cases stay partial or unsupported with nonzero exits. Revisit only with source-specific coverage evidence. |
| Per-shard rollback, all-or-nothing immutable output publication, rerun instead of a native cursor. | Incremental native checkpoints add state without a remote paging API; shards are local immutable units. Assumes bounded local fixture size; entire export is held in memory. | Failed JSON/timestamps/rosters do not leak shard records; retry deduplicates. Revisit for an explicitly bounded large-export streaming requirement or CONTACTS-032 operations. |

## Synthetic validation

`npm run ci` includes `scripts/contacts/messenger.test.cjs` alongside the existing
baseline. Fixtures are invented in memory/temporary folders and cleaned up.
Cases cover direct/four-member group events, multiple shards, millisecond time,
same-time duplicate events, stable/reordered replay, overlap and connector-order
rejection, interrupted reads/retry, digest/number gaps, encrypted/truncated
history, unsupported schemas, sender/self ambiguity, departed senders, exclusions,
native content removal, invalid timestamps, empty snapshots, redirected paths,
immutable output and actual CLI 2/1 exits. No real source format/account was read.
