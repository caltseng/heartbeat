# Heartbeat text messages: format and converter (CONTACTS-015/016)

## Capability and authorization

015 selects Android 14 / SyncTech SMS Backup & Restore 10.30.009 uncompressed
full UTF-8 XML, profile `synctech-xml-metadata-v1`. 016 implements
`scripts/contacts/text-xml.ts` for synthetic fixtures only. The coordinator
relayed owner confirmation of Android and SyncTech XML on 2026-11-25; that
resolves platform/format selection, not Android/producer-version verification,
device access or private processing. No actual device, SIM or export was read.

The [shared rules](contacts-technical-spec.md#shared-operating-rules) and
[CONTACTS-010](../privacy.md) govern. Private CLI/programmatic conversion fails
with exit 1 / `private_collection_disabled` **before raw XML stat/read or output**.
No approval override or synthetic relabeling. Real native processing needs a
separate raw-content boundary, exact source/account and EACH-run authorization,
verified local controls, retention/deletion and reviewed implementation.

This is not ADB/root/database inspection, an install/pairing/default-app switch,
restore, cloud/carrier fetch or bridge. RCS (even serialized as SMS/MMS),
iMessage/Apple backups, other Android/producer versions, split/incremental,
ZIP/encrypted, CSV/HTML and restricted history need separate reviewed profiles.
Normalized v1 text handoffs remain independently importable synthetically.

Future approved setup is owner-controlled: review lawful authority,
device/SIM/self scope, versions, selected conversations, interval and protocol
evidence; disable upload/scheduled backups; omit call logs/media/names/readable
dates where possible. A backup can still contain bodies/subjects/parts.
Metadata projection does not authorize acquiring or transiently reading them.
Real files/manifests stay outside Git/sync on the verified private computer;
never upload them or request secrets. Manual [V0](contacts-manual-retrieval.md)
does not enable this converter.

## Input and projection

One `smses` root; require the pinned `File Created By SMS Backup & Restore
v10.30.009 ...` creation comment AND acquisition manifest. These are synthetic
assertions, not upstream schema certification. Unknown fields/profile/version
and unsupported layouts fail explicitly.

| Native evidence | Required handling |
| --- | --- |
| Root count/backup_set/backup_date | Validate record count; retain provenance privately. Neither set nor time is a global message/thread ID or coverage proof. |
| SMS/MMS date | Both XML types use epoch **milliseconds**, not Android database MMS seconds or localized readable dates. Validate range/retrieval; `date_sent` is validated but never substituted or counted twice. Reporting IANA zone affects period boundaries, not instants. Device-clock/travel/original-zone limits remain explicit. |
| Direction | SMS type 1/2 and MMS msg_box 1/2 with agreeing retrieve-confirmation 132/send-request 128. Disclose excluded draft/outbox/failed/queued and notification/delivery/read records. Unknown/contradictory direction fails. |
| Self/SIM | Explicit selfBySubId mapping, not inferred from sub_id or peer address. Missing evidence omits affected rows with ordinal-only setup errors. |
| MMS addresses | 137 sender, 151 To, 130 CC, 129 BCC. One sender/event; outgoing insert-address-token uses only verified SIM mapping. Tilde addresses and contact names are hints, never positional identities or historical roster/thread keys. |
| Protocol | Explicit row-level sms/mms transport evidence including excluded rows. RCS/restricted indicators are unsupported even false/zero; marker absence alone cannot prove SMS/MMS. |
| Content | Omit body, subject, parts/text/data, names/readable dates from records, IDs and diagnostics. No attachment decoding, URLs, stylesheets, DTDs/external entities or namespace guessing. |

The dependency-free parser is fail-closed: valid UTF-8 and predefined/numeric
XML references only; max **32 MiB, 100,000 elements, depth 16**, reject rather
than truncate. Malformed/count-mismatched XML, invalid references, digest,
sender/role/time contradictions fail before any bundle writes.

## Local invocation and manifest

```powershell
npm run contacts:text-xml -- --xml .private\contacts\fixture.xml --manifest .private\contacts\fixture.json --output .private\contacts\converted-001
npm run contacts:collect -- --request .private\contacts\converted-001\request.synthetic.json
```

Fresh synthetic output contains `text.synthetic.json` and
`request.synthetic.json`; collection produces `collection.json`. Neither step
modifies XML or acquires data. Ignored output is not approved real storage.

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "profile": "synctech-xml-metadata-v1",
  "producerVersion": "10.30.009",
  "androidVersion": "14",
  "backupKind": "full",
  "account": "fixture-account",
  "archive": {"ref": "fixture-archive", "sha256": "<64 lowercase hex characters>"},
  "period": {"preset": "7d", "timeZone": "America/Los_Angeles", "asOf": "2026-11-24T20:00:00Z"},
  "retrievedAt": "2026-11-24T20:00:00.000Z",
  "identities": [
    {"id": "self", "address": "+12025550100", "isSelf": true},
    {"id": "peer", "address": "+12025550101", "isSelf": false}
  ],
  "selfBySubId": {"1": "self"},
  "threads": [{"id": "direct", "kind": "direct", "members": ["self", "peer"]}],
  "rows": [{"ordinal": 1, "transport": "sms", "threadId": "direct"}]
}
```

Replace the digest placeholder with exact invented bytes and a matching
producer-commented XML fixture; this illustration is not executable as written.
IDs/account/archive refs: 1-80 ASCII letters/digits/dot/underscore/hyphen,
alphanumeric first. Observed addresses and IDs map uniquely; no country or
canonical-person inference. All XML ordinals require a row assertion.

## Identity, replay and coverage

Events use local `<archive-ref>:record:<1-based SMS/MMS document ordinal>`,
assigned before exclusions; same-looking different rows remain distinct.
Optional m_id/tr_id, body/time tuples and backup_set are not provider IDs.
Reviewed threads use `<archive-ref>:thread:<ledger-id>`; missing thread evidence
uses isolated `<archive-ref>:unknown:<ordinal>`, kind unknown plus error, never
direct. Direct requires exactly self and peer; a reviewed four-member MMS
produces one message with actual sender/recipient roles, not three direct
interactions. Ledger memberships are unversioned evidence, not historical
roster reconstruction. Classification is unclassified absent independent evidence.

`textArchive` pins profile, archive ref, original SHA-256 and reviewed-ledger
SHA-256 in `collection.json.textArchives` at first valid page commit under the
shared lock. Exact replay deduplicates; changed/reformatted bytes, archive alias,
SIM/identity/thread/row ledger or another connector fails `snapshot_conflict`.
Zone changes do not alter binding; ledger JSON projection ordering does.
Failed first pages reserve nothing; pre-existing unbound events, including
explicit revisions, block initial binding. Shared CONTACTS-021 translations do
not lift this native gate; no new account alias or parallel store to evade it.

History is always unknown/null-bounded: EOF, counts, min/max times and backup
dates prove neither deleted/cloud/earlier-device coverage nor zero activity.
Good rows may survive missing SIM/address/thread evidence with sanitized
ordinal-only errors; unsupported layouts/transport return requires_setup or
unsupported. Valid bundles exit **2/partial**, even empty; malformed/private/
unsafe/nonempty-output/I/O/arguments fail **1**. Unexpected input/I/O is
`conversion_input_or_io_error`, never empty success; stderr has no raw input or
private paths. Imported bundles remain partial under the collector's 0/2/1 rules.

Engineering history: [015 selection](../decisions.md#contacts-015) and
[016 parser/binding choices](../decisions.md#contacts-016).
`npm run ci` exercises direct/four-person groups, roles, milliseconds/DST,
missing IDs/self/threads, RCS ambiguity, equal-looking rows, replay/overlap,
XML/count/content failures, limits and pre-native-read private denial.

## Public evidence

Consulted 2026-11-25, not device certification:
[XML fields](https://www.synctech.com.au/sms-backup-restore/fields-in-xml-backup-files/),
[changelog](https://www.synctech.com.au/sms-backup-restore/changelog/),
[FAQs](https://www.synctech.com.au/sms-backup-restore/sms-faqs/),
[overview](https://www.synctech.com.au/sms-backup-restore/).
Vendor RCS/ZIP/cloud features are not supported Heartbeat capabilities.
