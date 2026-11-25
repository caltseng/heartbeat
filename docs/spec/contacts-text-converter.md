# Heartbeat: first text metadata converter (CONTACTS-016)

## Delivered boundary

`scripts/contacts/text-xml.cjs` converts **synthetic fixtures only** for the
[CONTACTS-015 selected profile](contacts-text-format-gate.md):
`synctech-xml-metadata-v1`, Android 14, SyncTech SMS Backup & Restore 10.30.009,
UTF-8 uncompressed full XML. It is not a device reader, account connector,
general XML parser or an authorization to process real exports. No live source,
actual producer/device output or real archive has been verified. Other versions,
RCS/iMessage, split/incremental archives, ZIP, CSV, Apple databases and cloud
history remain unsupported. The existing normalized handoff importer is unchanged
for other sources.

The converter requires both the pinned `File Created By SMS Backup & Restore
v10.30.009 ...` XML comment and a separate acquisition manifest. These are
assertions supplied by the fixture author, not proof of actual transport,
ownership or authorization. Real conversion is deliberately rejected with
exit **1**, `failed` / `private_collection_disabled`, before the CLI stats or
reads the raw XML path. The programmatic converter rejects private class with
the same error. CONTACTS-010 policy is approved, but verified local controls,
exact source/account and each-run approval, a separate raw-content processing
boundary and a separately reviewed real-run path are still required. Changing a
real manifest to `synthetic` does not authorize it.
The coordinator subsequently relayed owner confirmation of Android and SyncTech
XML as the selected platform/format; see the [gate's evidence note](contacts-text-format-gate.md).
That closes no source-access, OS/version-verification or real-processing gate.

## Local invocation and manifest

Keep synthetic inputs and outputs in ignored `.private/contacts/` or an approved
external local directory. Ignored checkout storage is not approved real-data
storage under CONTACTS-010. For an invented XML fixture and matching synthetic manifest:

```powershell
npm run contacts:text-xml -- --xml .private\contacts\fixture.xml --manifest .private\contacts\fixture.json --output .private\contacts\converted-001
npm run contacts:collect -- --request .private\contacts\converted-001\request.synthetic.json
```

Choose a fresh output directory. Conversion writes `text.synthetic.json` and
`request.synthetic.json`; collection writes the normal `collection.json`.
Neither step modifies the source XML or acquires data. The acquisition manifest,
archive hash/reference and reviewed ledgers are private metadata too.

The following manifest accompanies the **two invented records in CONTACTS-015**.
Use the required creation comment above in that fixture (the gate's illustrative
comment is not producer evidence). Replace `sha256` with the lowercase SHA-256
of those exact UTF-8 bytes; the placeholder is intentionally not executable.

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
    {"id": "peer-a", "address": "+12025550101", "isSelf": false},
    {"id": "peer-b", "address": "+12025550102", "isSelf": false},
    {"id": "peer-c", "address": "+12025550103", "isSelf": false}
  ],
  "selfBySubId": {"1": "self"},
  "threads": [
    {"id": "direct", "kind": "direct", "members": ["self", "peer-a"]},
    {"id": "group", "kind": "group", "members": ["self", "peer-a", "peer-b", "peer-c"]}
  ],
  "rows": [
    {"ordinal": 1, "transport": "sms", "threadId": "direct"},
    {"ordinal": 2, "transport": "mms", "threadId": "group"}
  ]
}
```

Unknown manifest fields are rejected. Local IDs/account/archive references use
1-80 ASCII letters, digits, dot, underscore or hyphen, starting alphanumeric.
Addresses are exact observations, not guessed country codes or canonical people;
one address and local ID each must map uniquely. `selfBySubId` explicitly maps
each observed SIM reference to an `isSelf` identity. Each XML ordinal needs an
explicit `sms`/`mms` transport assertion, including excluded rows. Missing or
unsupported transport prevents conversion rather than silently relabeling RCS.

`threadId` may be omitted: that event uses isolated
`<archive-ref>:unknown:<ordinal>` with `kind: unknown` and an upstream error,
never a direct thread. Reviewed threads become
`<archive-ref>:thread:<ledger-id>`. Direct threads require exactly self plus one
peer; group members come from the reviewed ledger, not the tilde address hint.
Memberships are unversioned evidence, not a reconstruction of historical rosters.

## Projection, failures and replay

Each accepted record creates exactly one local event
`<archive-ref>:record:<1-based-document-ordinal>`, including ordinals occupied by
excluded records. Optional vendor IDs are not required. Duplicate-looking rows
at different ordinals remain distinct. SMS direction and MMS sender/To/CC/BCC
roles are retained; outgoing `insert-address-token` uses only the SIM mapping.
`date` is interpreted strictly as epoch milliseconds, never localized readable
time or guessed seconds. `date_sent` is validated but not substituted. The
original XML, not the handoff, retains this additional native timestamp evidence.
Epoch instants do not establish original display zones or fix device clock error.
The reporting IANA zone affects the collection period, not event instants/IDs.

Draft/outbox/failed/queued SMS/MMS and MMS notification/delivery/read reports
are excluded with an explicit error code. Unknown/contradictory directions,
sender counts, roles, malformed XML/counts, invalid/future timestamps and digest
mismatches fail conversion before any bundle is written. Missing SIM/address
evidence omits the affected rows and emits ordinal-only error codes; good rows
may still be imported as partial. RCS/restricted markers are conservatively
unsupported even when their attribute value is false/zero. No rows, or exhaustion
of the file, never means complete history. Coverage is always unknown with null
bounds and an explicit lower-bound limitation.

Bodies, subjects, attachment data/text, display names and readable dates are
never copied into the handoff, IDs, logs or collection snapshot. The bounded
parser transiently reads XML attributes but does not execute stylesheets,
resolve DTDs/entities, decode attachments, retrieve URLs or emit raw input on
failure. Only XML predefined/numeric character references are decoded; invalid
references, invalid UTF-8 and namespaces fail. Content values never classify a
message's transport. Retain the immutable original and manifest outside git;
the converter does not make copies of raw content.

Conversion exits **1** with `failed` / `private_collection_disabled` for a
nonsynthetic manifest, before any raw archive inspection or output creation.
Conversion exits **2** with `status: partial` on a valid bundle (history is
unknown), or **2** with `requires_setup`/`unsupported` and a static reason code.
Malformed input, wrong digest, nonempty/unsafe output, invalid arguments and
I/O failures exit **1**. Errors use stderr and include no input excerpts or
private paths. Other unexpected I/O/input errors are explicitly
`conversion_input_or_io_error`, not success. The importer retains its existing
0/2/1 contract, and imported converter bundles always remain partial.

The optional handoff `textArchive` carries profile, archive reference, original
SHA-256 and reviewed-ledger SHA-256. The importer atomically binds these to
`[source, account]` in private `collection.json.textArchives` with the first valid
page, using its existing store lock and snapshot transaction. Exact replay
deduplicates. A changed/reformatted export, archive alias or changed identity/
SIM/thread/row ledger is rejected as `text_archive_conflict`, even under another
connector. Reporting-zone changes do not change that binding. A failed first
page does not reserve it. Existing unbound text events also prevent adding an
archive: there is no invented overlap reconciliation or automatic second export
import. Do not bypass this guard with a new account alias or a fresh parallel
store; CONTACTS-021 must explicitly review overlaps. Preserve manifest ordering
on replay because the ledger hash is over its JSON projection, not canonical JSON.

## Delegated engineering decisions (2026-11-25)

These are engineering defaults for owner review, **not owner-approved privacy
policy**. No decision grants real-source access, external processing or sending.

| Decision / rationale | Alternative and assumption | Validation / revisit condition |
| --- | --- | --- |
| Keep executable conversion synthetic-only and reject private manifests before raw-file inspection. This avoids encoding an unapproved real-run boundary or transiently processing content. | A private-mode approval flag would imply an authorization workflow that does not exist. Synthetic fixtures suffice for this item; approved CONTACTS-010 policy is not source or run authorization. | Private CLI manifest with a nonexistent XML path produces exit 1 / `private_collection_disabled` and no output; programmatic rejection and sanitized errors tested. Revisit only after verified CONTACTS-010 controls, exact source/account and each-run approval, a separate raw-content boundary and a reviewed bounded real-run design. |
| Use a small dependency-free, fail-closed XML subset; require the producer comment plus acquisition pin. | General XML libraries add dependencies; permissive parsing broadens the selected profile. No actual producer output is assumed tested. | Malformed XML/counts, entities/DTD/instructions, unsupported producer/layout tested. Revisit if separately reviewed synthetic examples require additional XML syntax. |
| Cap input at 32 MiB, 100,000 elements and nesting depth 16; reject rather than truncate. | Streaming large archives is a separate complexity. Small synthetic full backups are sufficient. | Parser enforces all three limits before output; size-limit fixture tested. Revisit for an explicitly authorized larger full archive, not silent partial parsing. |
| Bind exact archive bytes and reviewed mappings in the existing store transaction. | Separate mutable registry or time/body hashes risk races, overlap or message collapse. Same bytes and mappings define replay. | Replay, duplicate-looking rows, changed bytes/ledger/connector and failed-page rollback tested. Revisit with CONTACTS-021 reconciliation. |
| Preserve good metadata alongside ordinal-only setup errors; otherwise fail the bundle before writing. Unknown thread fallback stays unknown; history always unknown. | Dropping gaps silently or asserting complete export history would misrepresent evidence. Local XML is not source-wide history. | Direct/four-person group, outgoing roles, absent self/addresses/thread, exclusions, DST instants and unknown empty archive tested. Revisit when supported source evidence establishes stronger coverage, never from row count alone. |

`npm run ci` runs the existing collection baseline plus synthetic converter tests;
it requires no dependencies, accounts, browser, device or network.
