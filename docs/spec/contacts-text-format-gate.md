# Heartbeat: text device and format gate (CONTACTS-015)

## Decision and capability

Select **an owner-operated Android phone, SMS Backup & Restore by SyncTech
v10.30.009, uncompressed full-backup XML**, with Android 14 as the initial
reference platform. This is a bounded format selection for CONTACTS-016, not a
claim that an Android 14 device or that producer version has been tested here.
No actual device, SIM, backup, account or self number has been selected or read.
Different Android/producer versions require a separately reviewed profile.

Rationale: documented local XML exposes direction, epoch timestamps and MMS
recipient roles without a hosted integration or pairing. Android 14 is a
deliberately narrow reference assumption, not an inference about the user's
phone. Apple database/backup readers add separate access/schema gates; CSV/HTML
lose useful structural evidence; live bridges add setup and account exposure.
Those alternatives are deferred, not claimed impossible. The owner can review
or replace this initial decision later; no ordinary device choice blocks the
synthetic design work.

The supported initial **design profile** is `synctech-xml-metadata-v1`: UTF-8 XML
with one `smses` root and ordinary SMS/MMS records as documented below. The profile
version is Heartbeat's contract, not an upstream XML schema version (SyncTech
does not document a versioned schema identifier). Pin the producer version from
the XML creation comment and the owner's private acquisition record; missing or
different version evidence is unsupported until reviewed. Do not silently accept
an arbitrary file because it has an `.xml` extension.

| Route | Callable now | Selected next step / limitation |
| --- | --- | --- |
| Shared `contacts:collect` metadata handoff | Yes, schemaVersion 1 | Import normalized `text-messages` only; no XML input. |
| Local SyncTech XML to metadata | Synthetic only | [CONTACTS-016](contacts-text-converter.md) implements only this selected profile and synthetic fixtures. Real conversion is rejected as `requires_setup`; no device or actual export is verified. |
| Device or Android database reader | No | Owner-created local export only; no ADB, root, database probing, bridge, pairing or default-app switch. |
| RCS, including Google/Samsung messages serialized as SMS/MMS | No | Unsupported in v1; XML container type alone cannot prove transport. Ambiguous protocol must not become SMS/MMS. |
| iMessage/iOS/macOS databases, Apple/iCloud backups | No | Unsupported; this Android route provides no Apple history. |
| Cloud/carrier history, linked devices, CSV/HTML, ZIP/encrypted, incremental/archive/split backups | No | Not selected; no cloud login, password acquisition or archive assembly. |

This decision closes format selection only. CONTACTS-010 approval **and**
source-specific authorization are still required before any real run. No
installation, private-source inspection or acquisition was performed for this
gate. Preserve the existing single-user local JSON importer; no server or new
storage/schema family is needed.

## Lawful owner setup (future, not instructions to execute now)

1. Obtain a bounded authorization naming the owner-controlled phone and source
   account/SIM scope, selected conversations/interval, purpose and self identities.
   The owner must have authority to process the participants' metadata under the
   applicable law; phone possession alone is not blanket permission. Separately
   approve CONTACTS-010 storage, Windows ACL/encryption, retention, deletion and
   backup policy. If either approval is absent, report `requires_setup` without
   opening a device, backup, private browser or account.
2. The owner, not the agent, selects/installs the legitimate SyncTech app if
   separately approved, confirms Android and producer versions, and reviews its
   permissions. Use a manual, local-only full backup for the approved scope.
   Disable cloud/email uploads, recurring backups and automatic cleanup. Do not
   pair, restore, delete, send, change the default SMS app or grant extra access
   to retrieve restricted messages. If required access is unavailable, stop and
   record the gap rather than working around it.
3. Exclude call logs and media where the app allows; omit contact names and
   readable dates where optional. Native backups can still contain bodies,
   subjects, attachment names and other sensitive content. A metadata-only
   destination does **not** make acquisition metadata-only. Approval must cover
   the raw export and its transient local processing or the route stays blocked.
4. The owner manually provides the approved local file in ignored `.private/`
   or an approved external local folder. Keep the immutable original and private
   acquisition manifest together: file digest, producer/OS, device/account/SIM
   scope, backup time, filters, protocol evidence, missing history, requested
   interval, IANA reporting zone, as-of, authorization reference and retention.
   These manifests, digests and mappings are private too; never attach them to a
   PR, CI log, public viewer or external processing service.
5. After CONTACTS-016 exists, convert locally through a strict metadata projection.
   Do not feed XML to the shared importer. Discard bodies/parts/subjects and raw
   vendor fields from normalized output and logs; never execute stylesheets,
   resolve external entities/DTDs or retrieve referenced attachments. Validate
   before importing. Keep nonzero failures and coverage reasons visible. No
   real export is needed to implement or review the converter.

## Field and normalization contract for CONTACTS-016

Public vendor documentation is descriptive, not device-level verification.
All examples below are invented; the XML is a minimal field illustration, not
a restorable backup or a currently executable converter fixture.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Synthetic illustration; selected producer 10.30.009 -->
<smses count="2" backup_set="fixture-set" backup_date="1795564800000">
  <sms address="+12025550101" date="1795478400000" date_sent="0"
       type="1" read="1" body="" sub_id="1" />
  <mms date="1795478460000" date_sent="0" msg_box="1" m_type="132"
       address="+12025550100~+12025550101~+12025550102~+12025550103"
       sub_id="1">
    <parts />
    <addrs>
      <addr address="+12025550101" type="137" charset="106" />
      <addr address="+12025550100" type="151" charset="106" />
      <addr address="+12025550102" type="151" charset="106" />
      <addr address="+12025550103" type="151" charset="106" />
    </addrs>
  </mms>
</smses>
```

| Evidence | Required interpretation |
| --- | --- |
| Root `count`, `backup_set`, `backup_date` | Check parsed count and retain acquisition provenance privately. Set/time is not a globally unique message/thread ID or proof of coverage. Reject truncated XML/count mismatch; no empty success. |
| SMS `date`; MMS `date` | Vendor documents epoch **milliseconds** for both XML record types, unlike some native Android MMS databases. `1795478400000` is `2026-11-24T00:00:00.000Z`. Use this sent/received record instant, not `readable_date`; do not guess units from magnitude. Reject invalid/out-of-range/future instants. |
| `date_sent` | May differ from receipt `date` or be zero/missing. Do not substitute it silently or emit a second interaction. Original XML preserves this evidence outside the handoff; normalized `timestamp` uses `date`. |
| SMS `type`; MMS `msg_box` / `m_type` | Only received (1) and sent (2) message records; MMS must also agree with retrieve confirmation (132) / send request (128). Exclude drafts/outbox/failed/queued and delivery receipts, disclose exclusions; unknown or contradictory values fail visibly. |
| SMS `address`, `sub_id` | Address is peer, not self; direction plus separately verified self/SIM mapping establishes sender/recipient. No reliable self identity from `sub_id` alone. Multi-SIM ambiguity blocks affected rows. |
| MMS `addrs/addr` | 137 = sender, 151 = To, 130 = CC, 129 = BCC. Preserve roles and one sender/event. Resolve `insert-address-token` only from approved self mapping; unresolved sender/recipient evidence blocks that row and leaves partial coverage. |
| MMS `address`, `contact_name` | Tilde-joined addresses are hints, not a stable group ID or historical roster. Names can be incomplete and must not be position-matched or used as identity keys. Message recipients do not prove all group members. |
| `s_chat`, `restricted`, RCS address suffixes | RCS/restricted indicators require an explicit unsupported outcome. Absence of these markers is not proof of SMS/MMS: require owner-supplied scoped transport evidence; mixed or unverified records remain unsupported, not relabeled. |
| `body`, `subject`, `parts/part` including `text`/`data` | Content is not allowed in the handoff. Do not decode attachments, retain snippets, derive IDs from content or emit raw XML in errors. |

Use the requested IANA reporting zone only for period/day boundaries downstream.
Epoch instants carry no original display zone. Record the owner's zone separately;
travel, device clock error and missing historical zone remain explicit limitations.
Do not derive UTC from localized readable dates or silently repair DST ambiguity.

### Stable local identifiers and group limitations

SMS lacks guaranteed exported provider message/thread IDs; MMS `m_id` and `tr_id`
are optional and are not assumed unique across records or protocols. V1 therefore
uses **local**, not provider, IDs:

- The private acquisition registry assigns one immutable archive reference to
  the SHA-256 of the original bytes. Event IDs are
  `<archive-ref>:record:<1-based SMS/MMS document ordinal>`. All records count
  toward ordinals before exclusions. Exact-byte replay preserves IDs; a second
  identical-looking message at another ordinal remains distinct.
- A changed/re-exported file is a different acquisition, not an incremental
  update. Reject import of another archive into the same source/account store
  unless separately reviewed overlap reconciliation exists (CONTACTS-021).
  Never double-count overlapping exports or deduplicate by body/time/peer tuple.
  XML reformatting changes the digest; this limitation must be reported.
- Require a private reviewed row-to-thread ledger assigning opaque local thread
  IDs within that archive. Do not create a conversation ID from participant sets,
  display names, `backup_set`, or MMS transaction IDs. Rows with unverified thread
  identity can have isolated per-record `kind: unknown` threads, explicitly losing
  conversation continuity; never claim direct interaction from that fallback.
- Identity IDs are private opaque local references to exact observed addresses
  and approved self mappings, not canonical people. Keep raw address evidence;
  no country-code guessing, name matching or automatic cross-account merging.
  Reviewed identities/threads retain the same IDs on replay of the same archive.

For the synthetic example, the owner-supplied fixture ledger identifies self
`self`, peer `peer-a` and two other recipients `peer-b`/`peer-c`. It assigns the
SMS to `fixture-direct` and the MMS to `fixture-group`, with group evidence kept
in the private ledger. The handoff creates all referenced identities, threads
and memberships first, then includes observations such as:

```json
{
  "id": "fixture-archive:record:2",
  "idKind": "local",
  "eventType": "message",
  "threadId": "fixture-group",
  "senderId": "peer-a",
  "timestamp": "2026-11-24T00:01:00.000Z",
  "channel": "mms",
  "recipients": [
    {"identityId": "self", "role": "to"},
    {"identityId": "peer-b", "role": "to"},
    {"identityId": "peer-c", "role": "to"}
  ],
  "classification": "unclassified"
}
```

This is one group observation, not three direct interactions. Without the ledger's
group evidence use `kind: unknown`; do not fabricate a stable group ID or
historical membership from this example. The direct SMS maps to sender `peer-a`,
recipient `self`, channel `sms`, and ordinal 1 only when the reviewed direct
thread contains exactly self and peer. Classification stays `unclassified`
unless independently established; do not infer interpersonal status from a phone
number. The complete envelope still follows the existing schemaVersion 1 contract.

## Coverage, errors and exit behavior

The route captures only approved records present in that phone's local export.
Deleted, cloud-only, encrypted/restricted, other-device, earlier-phone, filtered,
RCS and iMessage history may be absent. Backup timestamp, parsed counts, min/max
message dates and an exhausted file do not establish complete account history.
Default coverage is `unknown` with null bounds and a specific basis. Use `partial`
with justified bounds only where source evidence supports them. Do not claim
source-wide `complete` while desired protocols/threads/history are unverified;
observed totals are lower bounds, never evidence of inactivity.

The acquisition/converter must distinguish missing approvals or verified self/
protocol/thread setup (`requires_setup`), unsupported layouts/versions/protocols
(`unsupported`), malformed/count-mismatched input or I/O errors (`failed`), and
valid but incomplete metadata (`partial`). No accepted messages is not proof of
an empty source. Until the converter exists, use a request source with
`mode: unavailable`, `status: unsupported` and the missing-parser reason, not
an empty metadata envelope. The existing importer returns 2 for persisted
unavailable/partial/failed sources and 1 for fatal request/storage errors.

CONTACTS-016 must exercise synthetic direct SMS, four-person MMS, role/direction
ambiguity, millisecond/DST boundaries, absent IDs/self/thread evidence, RCS
ambiguity, duplicate-looking rows, exact replay, changed/overlapping archives,
invalid XML/counts, content exclusion and unavailable outcomes. This gate itself adds no parser, real-data fixture or new test tooling.
The [CONTACTS-016 converter contract](contacts-text-converter.md) records the
bounded synthetic implementation, manifest, conservative failures and engineering
decisions; it does not lift the real-run boundary.

## Public evidence and remaining uncertainty

Consulted 2026-11-25 (UTC), without account/device access:

- [SyncTech XML fields](https://www.synctech.com.au/sms-backup-restore/fields-in-xml-backup-files/):
  root/SMS/MMS/address fields, milliseconds, optional fields and RCS markers.
- [SyncTech changelog](https://www.synctech.com.au/sms-backup-restore/changelog/):
  v10.30.009 is the selected pin; records changes in RCS/group behavior and
  restricted-message/default-app behavior across Android versions.
- [SyncTech FAQs](https://www.synctech.com.au/sms-backup-restore/sms-faqs/):
  Android-only route, device-dependent RCS serialized as SMS/MMS, local history
  and backup filters. Vendor RCS backup support is not Heartbeat RCS support.
- [SyncTech product overview](https://www.synctech.com.au/sms-backup-restore/):
  local XML, optional cloud/scheduling/media, selected-model RCS and ZIP options.

Public pages can evolve and are not certification of the pinned device/export.
Actual availability, permissions, protocol evidence and bounded authorization
remain unverified. A source limitation must stay visible rather than being
resolved by private inspection under this task.
