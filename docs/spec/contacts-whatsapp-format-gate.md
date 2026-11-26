# Heartbeat WhatsApp: format and converter (CONTACTS-019/020)

## Capability and authorization

019 selects personal iOS Export Chat / Without Media UTF-8 TXT;
020 implements `scripts/contacts/whatsapp.ts` **synthetically only**, profile
`whatsapp-ios-txt-metadata-v1`. V1 is Heartbeat's grammar, not an official
app/schema version. Owner platform unknown; no iOS/WhatsApp/device/export
compatibility certified. No verified personal tool, live sync or network route.
Business Cloud/Groups APIs exist but do not supply existing personal-inbox/
group history. Web/Desktop/companion/Beeper/bridges are not selected; no pairing,
QR/session/browser reuse, installation, device access, sending or scheduler.
Android/locales/ZIP/media/databases/backups/HTML/CSV need separate profile review.

[Shared rules](contacts-technical-spec.md#shared-operating-rules) and
[CONTACTS-010](../privacy.md) govern. The converter denies non-synthetic manifests
with `private_collection_disabled`/exit 1 **before native stat/read or registry/
output resolution**. No consent flag/relabeling. Without Media still contains
content; real transient processing/original retention needs a separately
approved content boundary, exact source/account and EACH-run approval (including
replay), verified Windows-user ACL/encryption, outside-Git/sync storage, backup
exclusions and 12-month retention/deletion across all artifacts. No remote AI or
transcript upload. An owner-controlled future export must respect disabled chat
export/privacy settings, not bypass them. [Manual V0](contacts-manual-retrieval.md)
does not lift these guards.

## Grammar and evidence

One uncompressed UTF-8 transcript/chat, exact day-first header
`[D/M/YYYY, HH:mm:ss] Sender: payload`: one/two ASCII day/month digits, four-year,
24-hour two-digit time with seconds. LF/CRLF, optional initial BOM and U+200E
before header permitted. No other direction marks, 12-hour/minute-only/short-year
or Android dash grammar. Validate whole-file calendar/UTF-8, not just first row.
Parser limit **16 MiB / 100,000 lines**, not a provider-history cap.

Reviewed contiguous 1-based inclusive `rows` line spans cover every logical
record/continuation before exclusions. One final terminator adds no line.
Header-looking body lines stay inside their reviewed span, but all timestamp-like
headers must have valid grammar/calendar. Leading orphan/mixed/malformed headers
fail. Exact first-header wallTime and full reviewed senderLabel (including colons)
must match; no colon heuristic/name matching. Kind is message/system/call/
deletion/reaction/media; only message emits activity. Body text does not certify
kind. Content/filenames/continuations/system text never enters normalized records,
IDs or logs; no decoding/fetching attachments.

## CONTACTS-020 operation

```powershell
npm run contacts:whatsapp -- --txt .private\contacts\fixture\_chat.txt --manifest .private\contacts\fixture\manifest.json --output .private\contacts\whatsapp-store
```

Paths resolve from current directory. Output only ignored `.private\contacts`
inside checkout or external synthetic directory; not approved real storage.
Strict manifest example, not executable until exact invented bytes match digest:

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
  "archive": {"ref": "archive-one", "sha256": "<exact-byte SHA-256>"},
  "ledgerRevision": "review-one",
  "period": {"preset": "7d", "timeZone": "America/Los_Angeles", "asOf": "2026-11-24T21:00:00Z"},
  "retrievedAt": "2026-11-24T21:00:00.000Z",
  "identities": [{"id": "self", "isSelf": true}, {"id": "peer", "isSelf": false}],
  "thread": {"id": "chat-one", "kind": "direct", "members": ["self", "peer"], "membershipEvidenceRef": "roster-review"},
  "timeEvidence": {"zone": "America/Los_Angeles", "evidenceRef": "zone-review", "clockVerified": true},
  "rows": [{"startLine": 1, "endLine": 1, "kind": "message", "senderId": "peer", "senderLabel": "Fixture Peer", "wallTime": "24/11/2026, 12:00:00"}]
}
```

Refs: 1-80 ASCII letters/digits/underscore/hyphen, alphanumeric first;
producer versions literally synthetic. No provider ID/phone/link invention.
Exactly one self, unique reviewed opaque identities, known sender and mandatory
roster evidence. Direct exactly self/peer; group at least two including self.
One four-person group event preserves sender, empty recipients, unclassified;
memberships do not certify historical delivery/rosters or direct exchanges.

## Time, identity and immutable replay

TXT has no offset. Require per-export or per-row IANA source-zone/evidence/
verified-clock ledger; reporting/current-phone zone or file/export time is not
historical evidence. Each row may override timeEvidence and supply explicit
offset (e.g. -07:00) for a DST fold. Exactly one matching instant required;
gaps/inconsistent offsets/missing evidence/unverified clock corrections fail
the entire acquisition, not silent row quarantine. Reject pre-1970, invalid/
future instants; retrieval <= now, as-of <= retrieval. Never order-resolve folds,
shift gaps or invent seconds. Registry retains original line/wall-time, zone,
selected offset seconds, evidence refs and resolved instant, no body.

Original-byte SHA-256 + reviewed account/archive/scope reserves immutable
acquisition. Local event ID `<archive-ref>:record:<ordinal>` before exclusions;
identical-looking rows at distinct ordinals remain distinct. Reviewed thread
and identity refs are not titles/participant-set/name hashes. Exact bytes/
ledger/account/thread replay preserves IDs; changed bytes/line endings/ledger/
alias/re-export requires explicit route-specific reconciliation before import.
Do not reset registry/store or invent account/thread/connector refs to evade it.

CLI writes `whatsapp-registry.synthetic.json` and
`acquisition-<SHA256-of-account/archive-reference-tuple>` containing immutable
`whatsapp.synthetic.json` + `request.synthetic.json`. Run collect separately on
that request; parent store receives collection.json. Exact replay reuses files;
new reporting period uses a separate request referencing unchanged handoff.

Check registry, take exclusive conversion lock, recheck; atomic reservation
precedes same-directory immutable artifact publication. Interrupted output may
leave reservation: replay exact manifest/bytes to finish, never clear it to admit
another export. Corrupt registry/locks/I/O/conflicting output fail visibly.
Confirm process dead before removing only exact stale lock; temps are not output.

`whatsappArchive` handoff extension pins profile/thread/archive, original digest,
ledger digest and normalized metadata digest. Importer validates digest and
single-thread scope, commits binding at first valid page, rejects changed/
overlapping/rebound/alternate-connector or pre-existing unbound events
(`snapshot_conflict`). Distinct verified chats can share account but not archive
ref/digest. Shared CONTACTS-021 support does not automatically reconcile TXT.
Registry is evidence, not tamper-proof consent; generic handoffs still need review.

## History and outcomes

Primary-phone snapshot is not linked-device/server history. Deleted/disappearing/
view-once/restricted/old-device/backed-up/unselected chats may be missing.
Historical 10,000/40,000 caps are unverified, not current limits; EOF/min/max/small
files/export request ranges certify no complete history. Coverage always
unknown/null-bounded, observed counts lower bounds; missing chats remain visible.

Valid bundles (including empty/excluded-only) exit **2/partial**, never 0.
Unsupported profile/sender/time/overlap or requires_setup produces sanitized
code, exit 2, no new handoff. Private/malformed/registry/locking/storage/fatal
failures exit **1**. No failed-page checkpoint advance or empty-success fallback.
Status/codes only in CLI output, no account/path/sender/payload.

Engineering history: [019](../decisions.md#contacts-019),
[020](../decisions.md#contacts-020).
Synthetic CI covers exact replay/changed bytes/ledger/refs, alternate connectors/
unbound history/distinct chats, direct/four-person groups, equal-looking rows,
multiline/header/colon evidence, DST fold/gap/travel/future time, exclusions/
unknown emptiness, limits, immutable recovery and private pre-read denial.

## Public evidence and uncertainty

Reviewed 2026-11-25:
[export help](https://faq.whatsapp.com/1180414079177245) direct DNS fetch failed;
[linked history](https://faq.whatsapp.com/653480766448040) direct official content
unverified, secondary reproduction only;
[Neverfar grammar](https://neverfar.app/whatsapp-export-format) and
[Chatview limits](https://chatview.ai/guides/whatsapp-export-limits) are secondary
descriptions, not device certification/upload recommendations;
[official Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups.md/)
documents Business eligibility/invite-based creation, not personal history.
