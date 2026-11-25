# Heartbeat: personal WhatsApp access gate (CONTACTS-019)

## Selected route and actual capability

Select **owner-provided WhatsApp Messenger personal-account iOS Export Chat,
Without Media, UTF-8 `_chat.txt`**, restricted to the versioned Heartbeat format
profile **`whatsapp-ios-txt-metadata-v1`** below. This is a delegated engineering
selection for synthetic CONTACTS-020 implementation, not owner-approved privacy
policy, verified device compatibility or permission to export/read an account.
No phone, account, installed WhatsApp/iOS version or private file was inspected.
The owner's platform is unknown; iOS is a narrow design default, not an inference
about their device.

| Route | Callable/verified here | Outcome and boundary |
| --- | --- | --- |
| `contacts:collect` schemaVersion 1 metadata handoff | Implemented local importer; synthetic baseline exercised | Imports synthetic normalized `whatsapp` metadata, not TXT/ZIP or account history. All private requests fail closed before handoff reads/output writes (`private_collection_disabled`, exit 1). |
| Selected native TXT to metadata converter | CONTACTS-020 implemented and synthetically exercised | `contacts:whatsapp` accepts only the reviewed synthetic iOS profile below. Produces a local snapshot with unknown coverage, never live access or producer certification; private conversion fails before native/registry/output access. |
| Personal-account structured API/tool | None available or verified in this session's tool inventory | `requires_setup`; no connector, credentials or account permission is implied. Public web/GitHub research tools are not WhatsApp tools. |
| WhatsApp Business Platform / Cloud API, including Groups API | Public documentation only, not connected | Not the selected personal-account route. Business group creation/messaging does not establish access to existing personal conversations or their history. |
| Linked Web/Desktop/companion device, Beeper or other bridge | Not inspected, installed or authorized | Not selected. No pairing, QR/session acquisition, browser reuse, scraping or history sync. |
| Android/localized variants, backups/databases, HTML/CSV, ZIP/media ingestion | Not supported by this profile | Separate format/access review required; no guessing from filename or fallback to another route. |

Use the existing single-user local JSON store and CLI. Later Heartbeat reports
and graphs remain private local files. No service, hosting, accounts, remote-AI
processing, sending or schedules are part of this gate.

The [owner-approved CONTACTS-010 policy](../privacy.md) is already recorded;
do not reopen its policy questionnaire. It authorizes no account/source or run,
excludes raw vendor payloads/content and does not permit handling real native
exports. This gate and CONTACTS-020 remain synthetic-only. A later real-export
route needs a separately approved content-processing boundary, source/account
and each-run approval, verified local controls and reviewed implementation.
No format or platform choice lifts those gates.

## Exact format profile for CONTACTS-020

V1 is **Heartbeat's input contract**, not an official WhatsApp schema/app version.
WhatsApp does not provide a stable versioned TXT schema in the evidence reviewed.
Privately record producer WhatsApp/iOS versions, locale, export options and source
device role for every future acquisition; absent producer evidence is
`requires_setup`. A producer is not certified just because its output resembles
the examples. Future compatibility review must establish the profile match;
different layouts need a new reviewed profile. No actual producer version is
certified by this design gate.

Accept one manually supplied uncompressed UTF-8 transcript per selected chat:

- Bracketed header `[D/M/YYYY, HH:mm:ss] Sender: payload`, with one or two
  ASCII digits for day/month, four for year, and two for each 24-hour time field.
  Date order is explicitly **day/month/year**, not detected from values.
  Permit LF/CRLF and one optional UTF-8 BOM at file start and U+200E before a
  header. Other direction marks, 12-hour dates, two-digit years, minute-only
  times, Android dash headers and other locales are unsupported in v1.
- Validate real calendar dates and the whole file, not just its first row.
  Non-header lines belong to the preceding record, never separate events.
  Leading orphan text, malformed timestamp-like headers and mixed layouts fail
  visibly. The format is not self-delimiting: a multiline body can mimic a
  header. A private reviewed record-boundary ledger must resolve such ambiguity;
  without it reject the affected acquisition rather than invent extra messages.
- Header parsing distinguishes sender-bearing messages from localized system
  notices using the reviewed ledger, not the presence of a colon alone.
  Sender names can contain colons, collide or change. No automatic split/name
  match may silently assign an identity. Unresolvable boundaries or senders block
  affected records and leave coverage partial/unknown.
- Project only approved metadata. Bodies, multiline continuations, filenames,
  media, subjects and system text never enter the handoff, ID hash, logs or
  reports. Do not fetch/decode attachments. Raw transcript processing still
  reads content transiently, which the approved metadata-only policy does not
  authorize, even Without Media. Real native files must not be opened here.
  Exclude system notices, call notices, deletion placeholders, reactions and
  media-only placeholders from v1 message counts; ambiguous record types are
  unsupported, not counted as ordinary messages. Disclose excluded categories
  and that this profile is not a count of every WhatsApp interaction.

Synthetic header illustrations only, not native exports or executable fixtures:

```text
[24/11/2026, 12:00:00] Fixture Peer A: synthetic direct message
[24/11/2026, 12:01:00] Fixture Peer B: synthetic group message
```

### IDs, replay and overlaps

TXT exposes display labels and wall times, not guaranteed provider account,
message or chat IDs. Do not fabricate provider IDs, conversation links, phone
numbers or cross-export identity equivalence.

1. A private acquisition registry assigns an immutable opaque archive reference
   to SHA-256 of the **original bytes**, account reference and approved scope.
   The digest is private provenance, never published; no content-derived message
   hashes are used. A reviewed record-boundary ledger gives every logical
   record an ordinal before exclusions, retaining original line spans.
   Event IDs are `<archive-ref>:record:<1-based ordinal>`, `idKind: local`.
   Identical-looking records at distinct ordinals remain distinct.
2. Keep the same reviewed account, thread and identity references and immutable
   ledger revision on exact-byte replay. The handoff's digest/provenance remains
   the normalized handoff digest; keep its private link to the original TXT
   digest, producer record and ledger separately. Existing schemaVersion 1
   fields do not gain raw vendor fields.
3. Assign a reviewed opaque local thread ID per actual chat. Neither its title
   nor participant set is an ID. Different chats with the same people remain
   separate; title changes are not new-chat evidence. Identity IDs are reviewed
   opaque local references; display names alone cannot merge people. Self
   identity/direction must be explicitly verified, never inferred from "You".
4. Only one acquisition per reviewed account/thread is importable in v1.
   Exact original-byte replay is allowed. Changed bytes, edited line endings,
   changed ledger assignments or a re-export of that thread require explicit
   overlap/revision reconciliation **before** import (CONTACTS-021).
   Reject them pending that review, even if they look disjoint; do not generate
   a new account/connector to bypass the gate or double-count overlapping files.
   Separate verified threads can be imported under the same account.

CONTACTS-020 enforces this policy before producing a handoff, and the shared
importer retains the binding per account/thread on successful page commit.
A local file cursor
is a conversion checkpoint, never a provider sync token or live refresh claim.

### Time zones and original times

The selected TXT header carries **no UTC offset or zone**. Require a private
per-export or per-record time-evidence ledger naming the export display zone
(IANA), date grammar, original wall-time text and the evidence that this zone
applies to those rows. Reporting zone is separate and never substitutes for
source-zone evidence. Current phone zone, file modification time and export time
alone cannot prove historical offsets; travel or changed display-zone behavior
may invalidate a single-zone assumption.

Resolve each second-resolution wall time to an ISO timestamp with explicit
offset/UTC only when evidence yields one instant. A DST fold needs an explicitly
reviewed offset for that row; nonexistent local times, missing zone evidence,
unverified clock corrections or unresolved folds are unsupported for those
records. Never guess an offset, silently shift a gap, order-resolve a fold or
invent missing seconds. Preserve original text, zone, chosen offset and evidence
privately beside the normalized handoff so conversion is auditable.

For example, `24/11/2026, 12:00:00` with synthetic verified
`America/Los_Angeles` evidence becomes `2026-11-24T20:00:00Z`.
`01/11/2026, 01:30:00` in that zone has two possible instants; without explicit
offset evidence it must not be emitted. Reporting-day boundaries still use the
request's IANA zone and existing half-open interval rules. Reject future events
relative to actual acquisition/retrieval time; conversion time is not event time.

### Direct messages, groups and history

Require a private reviewed chat-kind/self/sender ledger. A direct thread needs
exactly verified self and one peer. A group can have four or more reviewed
identities, but exporting a group does not prove a full historical roster or
per-message delivery recipients. Preserve each actual sender and one event;
leave `recipients: []` when absent rather than treating every member as a
recipient. Memberships describe only evidenced associations, not temporal
membership, delivery/read receipts or pairwise conversations. Never derive
direct interactions from group membership.

For a synthetic four-person group (`self`, `peer-a`, `peer-b`, `peer-c`), create
the reviewed identities, `kind: group` thread and evidenced memberships, then a
single `eventType: message`, `channel: whatsapp` observation from `peer-b` with
local event/thread IDs, resolved timestamp, empty recipients and
`classification: unclassified`. A group title alone is insufficient to identify
the group or its participants. Missing roster evidence stays explicit; do not
silently claim all group members have been collected.

The selected future source would be a **primary-phone local snapshot**, not
linked-device history or a server archive. Linked devices may receive only recent
history; Web/Desktop sync/search/export capability is not primary-phone coverage.
No attempt to pair or fill gaps from another device is authorized.

Exports can omit deleted/disappeared/view-once/restricted records, unavailable
older-phone/backed-up history and unselected chats. Encryption or possession of
an export grants no extra authority or recovery capability. If export is disabled
by chat privacy, record the limitation; do not change privacy settings or use a
bridge to bypass it. Historical 10,000-with-media / 40,000-without-media figures
are **not a validated current guarantee**; secondary reports disagree and the
official help page could not be fetched here. Do not hard-code a cap or claim
unlimited history. Record actual observed bounds and known truncation separately.
Oldest/newest rows, a small file and exhausted input prove no account completeness.

Default handoff coverage is `completeness: unknown`, null bounds and a specific
basis naming snapshot/selection/time/identity/history gaps. `partial` bounds
require evidence, not min/max timestamps alone. V1 must not claim source-wide
`complete` merely because every supplied file parsed. Desired missing chats and
unavailable sources stay visible; counts are lower bounds, never inactivity.

## Authorization and explicit outcomes

The approved CONTACTS-010 policy permits metadata categories only, not native
exports, bodies, snippets, attachments, thread titles, notes or raw vendor
payloads. It requires this computer only, Windows-user restriction and verified
disk encryption, storage outside Git worktrees and cloud-synced folders,
12-month retention with explicit local deletion, and no automatic backups or
remote-AI processing. These requirements apply to all inputs, configuration,
ledgers, IDs, manifests, logs, cursors, temporary files and derived reports/maps.
Ignored `.private/` checkout storage is for synthetic runs only, never real data.

Do not open a real transcript under the metadata-only policy. A later real-export
route needs a separately approved content boundary for transient processing and
any original-file retention, exact first-source/account and EACH-run owner
approval (including replay/resume), verified local controls and implemented
retention/deletion. This delegated format choice grants none of them. The
current shared importer rejects every private request, even unavailable-only
manifests, before handoff reads or output access; no approval assertion bypasses
that guard. CONTACTS-020 must enforce private denial before native-file reads,
registry/output access or artifacts, not merely pass the result to that guard.

For any separately authorized future route the owner would manually provide a
local export; agents must not acquire credentials, access devices/accounts/private
browsers, pair, install bridges, send or create jobs. Do not email/upload a
transcript as setup or process real data with Muse/remote AI.

| Condition | Required result |
| --- | --- |
| Any current `dataClass: private` request, including an unavailable-only manifest | Fatal `private_collection_disabled`, exit 1 before handoff/output access; no account/manifest disclosure. Future converter must deny it before native input access as well. |
| No approvals, verified self, producer or required acquisition evidence | `requires_setup` with the missing prerequisite; no source access. |
| Synthetic selected TXT with reviewed acquisition ledger | `contacts:whatsapp` converts to a metadata handoff; unknown history remains partial, exit 2. Never pass TXT directly to the shared importer. |
| Real native TXT or unverified producer | Private conversion denied, exit 1; synthetic producer/setup gaps are `requires_setup`, exit 2. No actual producer is certified. |
| Wrong profile/version/layout or unresolved sender/time/overlap | Explicit `unsupported` gap; reject the affected acquisition/records before import and disclose omissions. |
| Malformed/truncated input, I/O or registry conflict | `failed`; no checkpoint advancement for a failed page and no silent empty result. |
| Valid metadata with snapshot/history/exclusion gaps | `partial`/unknown coverage, including when zero messages were accepted; not an empty complete page. |

For synthetic requests the current CLI persists unavailable/partial/failed
sources with exit **2**; private denial and fatal request/storage errors exit
**1**. CONTACTS-020 must preserve those outcomes.
Rejected rows are not silently dropped: an otherwise emitted handoff must retain
sanitized error codes and a coverage basis; record-specific private evidence
stays outside CLI logs. No parser or runtime behavior changes in CONTACTS-019.

## Delegated decision record and validation

| Decision / rationale | Alternatives and assumptions | Validation / revisit condition |
| --- | --- | --- |
| Manual iOS TXT profile v1: narrow local snapshot without pairing/backend | Android/locales or a verified personal tool remain alternatives. No assumption the owner owns iOS; seconds-bearing bracket format is a design subset, not producer certification. | Public descriptive format evidence only, no native files. Revisit when the owner's authorized platform/export cannot meet this subset. |
| Archive-local ordinals plus reviewed ledger; strict same-thread re-export block | Content/time/name dedup can collapse distinct messages; provider IDs are absent. Assume a private registry is maintained by 020. | Synthetic exact replay, identical-looking distinct rows and overlapping/changed export rejection required. Revisit with reviewed CONTACTS-021 translation/revisions or genuine provider IDs. |
| Evidence-based zone/offset conversion; ambiguous rows unsupported | Assuming current/reporting zone risks wrong days/instants. Minute-only and other grammars are deferred, not repaired. | Synthetic UTC example, DST fold/gap, missing zone and travel ambiguity required. Revisit with trustworthy offset-bearing source evidence or a separately designed precision contract. |
| Unknown coverage; no inferred group recipients or blanket cap | Complete-account claims and roster-based direct counts are unjustified. Explicit exclusions reduce apparent counts. | Synthetic direct/four-person group, system/multiline/header ambiguity, exclusions, unknown vs empty and unavailable cases required. Revisit only with independently evidenced history/role guarantees. |
| Integrate the approved CONTACTS-010 policy without expanding consent; keep 020 synthetic-only and require private denial before native reads/output. | Rejected treating a metadata projection, Without Media or owner-supplied file as permission to process raw content, or treating ignored checkout storage as approved private storage. | Current integrated synthetic CI includes shared private-denial checks. 020 must add pre-native-read denial tests; revisit only with a separate content boundary, exact source/run approvals and enforceable controls. |

CONTACTS-020 implements executable synthetic converter fixtures for these cases,
strict content projection and nonzero error paths in the existing minimal Node
tests. CONTACTS-019 selected the design; 020 implements only that design.
No new dependency, private fixture, collection schema rename or real-source
validation is delivered.

## CONTACTS-020 operation and delegated decisions

The dependency-free `scripts/contacts/whatsapp.cjs` module and CLI are
**synthetic-only local snapshot conversion**, not an API, linked-device reader
or ongoing refresh. There is no account, network, credential, pairing, sending,
browser or scheduler implementation. Real imports remain disabled even if a
manifest claims approval.

Prepare synthetic bytes and a reviewed synthetic JSON manifest outside tracked
output, then run:

```powershell
npm run contacts:whatsapp -- --txt .private\contacts\fixture\_chat.txt --manifest .private\contacts\fixture\manifest.json --output .private\contacts\whatsapp-store
```

Inputs resolve from the current directory. Output inside this checkout is allowed
only under `.private\contacts`; an external temporary directory also works for
synthetic use. The CLI writes `whatsapp-registry.synthetic.json` and one
`acquisition-<SHA256-of-account/archive-reference-tuple>` directory containing
`whatsapp.synthetic.json` and `request.synthetic.json`. Compute that directory
from the reviewed local references or inspect the synthetic output locally.
Run `contacts:collect -- --request <that-directory>\request.synthetic.json`.
Its output is the parent store's existing `collection.json`. No auto-import runs.
Exact CLI replay reuses immutable files. A new reporting interval can use a
separate synthetic request referencing the same handoff; do not overwrite the
acquisition's original request.

The manifest is a strict, version-1 object; unknown fields fail:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "profile": "whatsapp-ios-txt-metadata-v1",
  "producer": {
    "platform": "ios", "appVersion": "synthetic", "osVersion": "synthetic",
    "locale": "day-first-24h-seconds", "exportOption": "without-media",
    "deviceRole": "primary-phone"
  },
  "account": "fixture-account",
  "archive": { "ref": "archive-one", "sha256": "<SHA-256 of exact synthetic bytes>" },
  "ledgerRevision": "review-one",
  "period": { "preset": "7d", "timeZone": "America/Los_Angeles", "asOf": "2026-11-24T21:00:00Z" },
  "retrievedAt": "2026-11-24T21:00:00.000Z",
  "identities": [{ "id": "self", "isSelf": true }, { "id": "peer-a", "isSelf": false }],
  "thread": {
    "id": "chat-one", "kind": "direct", "members": ["self", "peer-a"],
    "membershipEvidenceRef": "roster-review"
  },
  "timeEvidence": {
    "zone": "America/Los_Angeles", "evidenceRef": "zone-review", "clockVerified": true
  },
  "rows": [{
    "startLine": 1, "endLine": 1, "kind": "message",
    "senderId": "peer-a", "senderLabel": "Fixture Peer A",
    "wallTime": "24/11/2026, 12:00:00"
  }]
}
```

That row matches the first synthetic header illustration above. No native file
or real producer was used to prepare this example. References use 1-80 ASCII
letters/digits/underscore/hyphen, starting alphanumeric. They are reviewed opaque
local IDs, not names/phones or fabricated provider IDs. Producer versions must
literally be `synthetic`; actual-version compatibility is not certified.

The complete `rows` ledger covers all logical records and every original line,
including exclusions and continuations, with contiguous 1-based inclusive spans.
One final line terminator is not an extra line. A header-looking continuation is
not counted separately when the reviewed span includes it. Every timestamp-like
header anywhere must still have the supported grammar and a valid date. A row's
exact `wallTime` must match its first header; its explicitly reviewed
`senderLabel` must match the full chosen prefix including colons. Labels are
matched, not split, merged or treated as identity IDs. `kind` is one of
`message`, `system`, `call`, `deletion`, `reaction`, `media`; only `message`
emits an event. Content cannot automatically certify that classification.

Each row may override `timeEvidence` with the same strict shape and supply
`offset: "-07:00"` for a reviewed DST-fold choice. There must be exactly one
matching zone instant; gaps and inconsistent offsets fail. Source times before
1970, invalid/future instants and unverified clocks are rejected. Retrieval time
cannot be in the future, and reporting as-of cannot exceed retrieval. Source
zone evidence is independent from reporting zone. The private synthetic registry
keeps original line spans/wall times, source zones, chosen offset seconds,
evidence references and resolved instants; bodies/system text are not retained.
The SHA-256 of original bytes is private archive provenance, not a message ID.

Direct chats require exactly self plus one peer; groups require at least two
evidenced members including self. Four-person groups are tested. Each sender
must be in the reviewed identities, exactly one identity is self, and roster
evidence is mandatory. Membership describes observed association only, not a
complete temporal roster or a per-message recipient list. All events retain
empty recipients and unclassified message type.

Conversion first denies non-synthetic manifests before native-file stat/read or
output/registry resolution. For valid synthetic requests it checks the registry
before artifacts, then takes an exclusive conversion lock and rechecks under the
lock. Atomic registry replacement reserves the immutable acquisition before
writing its immutable handoff/request. An interrupted artifact write can leave
a reservation; replay the exact manifest/bytes to finish, never clear the
registry to admit a different export. Corrupt registries, existing locks, I/O
failures and conflicting output are visible failures. A 16 MiB / 100,000-line
parser safety limit is **not** a provider history cap.

`whatsappArchive` is the narrow synthetic handoff extension: profile, local
thread/archive references, original byte SHA-256, reviewed-ledger digest and
normalized metadata digest. No raw fields enter existing records. The importer
validates the metadata digest/single-thread scope, commits this binding with
the first validated page and rejects changed/overlapping acquisitions,
archive rebinding and unbound alternate connectors for that thread. Existing
unbound events block first native binding. Distinct verified chats can share
an account but cannot reuse an archive reference/digest. Do not change
account/thread references or reset registries/stores to bypass reconciliation.
The registry is local evidence, not tamper-proof authorization; manually
prepared generic handoffs still require the shared contract and review.

Exit 2 means partial snapshot (including empty/excluded-only snapshots), or a
sanitized `unsupported`/`requires_setup` code on stderr; those latter outcomes
produce no new handoff. Exit 1 means private denial, malformed input, registry,
locking, storage or other fatal failure. No exit 0 or complete-history claim is
available for this route. CLI logs contain status/codes only, no account, path,
sender or payload. Shared import keeps its existing 0/2/1 convention.

| Delegated engineering decision / rationale | Alternatives and assumptions | Validation / revisit |
| --- | --- | --- |
| Fail the entire acquisition for unresolved sender, time or boundary evidence rather than emitting a potentially misleading subset. | Per-row quarantine is possible but adds persistent partial-ledger repair semantics. Reviewed synthetic manifests are feasible; they are not owner privacy approval. | Cases cover missing self/senders, colon-bearing names, header-like continuations, fold/gap/travel and future times. Revisit only with a reviewed repair/quarantine contract. |
| Persist a conversion registry plus importer account/thread binding; reserve before artifact publication and recover by exact replay. | A file-only converter or ordinal IDs without a registry could duplicate overlapping re-exports. No automatic CONTACTS-021 translation is inferred from TXT. | Exact replay, changed bytes/line endings/ledger/ref, alternate connectors, unbound history and separate-chat cases. Revisit with explicit reviewed native-overlap reconciliation, not merely the existence of shared revision support. |
| Keep metadata-only handoffs separate from private synthetic audit evidence; always unknown history and no group fan-out. | Min/max rows, EOF, old numeric caps or a complete supplied roster cannot prove source-wide history. Reporting filters remain the shared half-open interval contract. | Import replay, four-person groups, identical-looking distinct records, exclusions, empty snapshots and no-body output; `npm run ci` is the integrated check. Revisit when separately authorized coverage/producer evidence warrants a new profile. |
| Bound parser input and reject non-profile producers; no dependency or compatibility guessing. | Broader locales, Android, linked-device histories and real versions need their own evidence. These are engineering defaults, not consent to inspect a device/export. | Whole-file calendar/UTF-8/layout and private pre-read CLI denial tests. Revisit only with separately reviewed compatibility and the unchanged privacy/source/run gates. |

## Public evidence and uncertainty

Reviewed 2026-11-25 UTC using public pages/search only:

- [WhatsApp export help](https://faq.whatsapp.com/1180414079177245):
  direct fetch failed DNS resolution in this environment. No official stable TXT
  schema, exact current cap or producer-version compatibility was verified.
- [WhatsApp linked-device history help](https://faq.whatsapp.com/653480766448040):
  indexed secondary reproduction reports recent-history transfer and incomplete
  linked-device sync; direct official content not verified here. This uncertainty
  supports excluding linked-device routes, not assuming full phone history.
- [Neverfar format reference](https://neverfar.app/whatsapp-export-format):
  fetched secondary parser documentation describing bracketed iOS/seconds,
  locale variation, UTF-8, direction marks and multiline/system records.
  Descriptive evidence, not an official schema or endorsement of its service.
- [Chatview export limits](https://chatview.ai/guides/whatsapp-export-limits):
  fetched secondary account of platform/time-zone/omission differences and changed
  help-page cap wording. Do not treat its current-platform claims as verified
  device capability or upload private files to it.
- [Meta Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups.md/):
  directly fetched official documentation describes Official Business Account
  eligibility and invite-based group creation/messaging. It does not establish a
  personal-inbox/history acquisition route. Do not claim business group APIs
  categorically do not exist; reject their equivalence to personal-group access.

The gate closes engineering route/profile selection only. Format compatibility,
lawful real-data access and exact history availability remain explicit future
checks; lack of access is never converted into empty success.
