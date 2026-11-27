# Heartbeat Google identities: access and adapter (CONTACTS-011/012)

## Capability and authorization

011 selects People `people.connections.list`; 012 implements
`scripts/contacts/google.ts`, connector `google-people-connections-v1`, with
injected **synthetic transport only**. No HTTP/OAuth/credential loader,
connected Google tool, source write, device/browser access or scheduler.
The separate [owner-provided CSV preview](contacts-retrieval-plan.md#csv-preview-operation)
does not enable this adapter or native sync. vCard/Takeout remain unsupported;
search is not a snapshot.
MCP is optional, not authority to install/connect an account.

[Shared rules](contacts-technical-spec.md#shared-operating-rules) and
[CONTACTS-010](../privacy.md) apply. Private CLI/acquire calls fail
`private_collection_disabled`/exit 1 before output, lock, fixture/checkpoint
or report access. Future real acquisition requires exact source/account and
EACH-run approval, verified Windows-user protection/encryption, backup/sync
exclusions, retention/deletion and reviewed transport. Owner-controlled API
enablement, installed-app OAuth consent/testing/verification or administrator
approval are future setup, not actions to perform now. No service-account/
domain-wide delegation, extra scopes or hosted OAuth backend selected.
Manual [V0 retrieval](contacts-manual-retrieval.md) is separate from this guard.

## Request and identity contract

GET `https://people.googleapis.com/v1/people/me/connections`, empty body:

```text
personFields=metadata,names,emailAddresses,phoneNumbers
sources=READ_SOURCE_TYPE_CONTACT
pageSize=100
requestSyncToken=true
```

Only `https://www.googleapis.com/auth/contacts.readonly`; no contacts write
scope, people.get/directory/Other Contacts/Gmail/search/getBatchGet expansion.
Repeated REST sources parameter explicitly excludes profile sources.
No sortOrder with sync. Field mask minimizes payload, not OAuth authority.

| Evidence | Projection / limitation |
| --- | --- |
| resourceName | Exact provider identity ID, namespaced google-contacts/account. Not canonical person or guaranteed immutable through linking. Stable account is externally reviewed, not name/token/alias. |
| metadata source type/id, previous/linked resource names, etags/updateTime/deleted | Project privately for revisions/aliases/tombstones, never automatic merges, activity or raw response archive. Source ID unique only within its type. |
| names | Primary displayName preferred; multiple names without primary stay unknown. Missing name is valid. |
| emails/phones | Preserve exact matching evidence with deterministic duplicate sorting; no country/self/name inference. Explicit selfIds supplies verified resource IDs, default empty. |
| Excluded fields | No notes/biographies/photos/birthdays/physical addresses/groups/relationships/organizations/user fields or content. Native metadata/tokens/tombstones never enter the normalized envelope. |

Email/phone list fields cap at **100 values per person per field**; hitting
either forces partial coverage. Optional absence is unknown. Contact presence,
updates and tombstones never generate events; handoff threads/memberships/events
remain empty.

## CONTACTS-012 operation

```powershell
npm run contacts:google -- --config .private\contacts\google-fixture\config.json
```

Strict config: `schemaVersion:1`, `dataClass:"synthetic"`, stable `account`,
`output`, optional `fixture`, `selfIds:[]`, `maxPages:100` (range 1-10000).
Paths relative to config; reject credentials/unknown fields. Fixture:
`{dataClass:"synthetic",responses:[{status:200,body:{connections:[],nextSyncToken:"fixture-token"}}]}`.
Responses consumed in order, including errors/retries; exhaustion fails.
Missing synthetic fixture/transport reports
`requires_setup/authorized_transport_unavailable`, not empty success.
Ignored `.private\contacts` or external output permits synthetic artifacts only.

Exclusive `google-acquisition.lock`; immutable `google-handoff-<uuid>.json`
written first, then atomic `google-acquisition.json` report/state/handoffFile.
Import only the named handoff, not acquisition bundle. Failed cycles preserve
last-good generation and stale handoff reference; crashes before replacement
leave prior checkpoint authoritative. Orphan handoffs are not automatically
deleted. Confirm process stopped before removing only the exact stale lock.
POSIX modes/local rename do not verify Windows protection or power-loss safety.

State binds account/class/connector/parameters/selfIds. Mismatch fails; intentional
binding changes need a fresh reviewed output. Restart interrupted traversal from
last **complete** generation, not staged pages. Follow nextPageToken with identical
parameters (provider pageSize 1-1000); persist final nextSyncToken only after all
pages validate/durably publish. Native page/sync tokens are not handoff cursors.
Incremental pagination holds one syncToken and original full-sync age.

Seven-day full-sync age or HTTP **410/EXPIRED_SYNC_TOKEN** requires new full sync,
without page/sync tokens; recover once from incremental 410, discarding only
in-memory staging. Incrementals do not renew age. Resync responses count against
budget. First full page has separate quota; 429/5xx at most three attempts/page
with 50/100ms mock backoff (not production quota policy). 401/403 requires_setup;
malformed/cycles/conflicting duplicates/budget/other HTTP failures preserve prior
state with sanitized codes, no token/body logs.

## Reconciliation and coverage

Full cycles replace only adapter source view; incrementals update it, and
zero-change handoffs retain identities. Immutable normalized baselines reserve
first safe identity per ID. Changed profiles, aliases/links, tombstones and
complete-snapshot absences are projected into a persistent private pending
ledger, **not automatically applied to CONTACTS-021**. Later omission/resync
never clears pending evidence; it remains partial on zero-change cycles.
No curated deletion, identity event or destructive source-record replacement.
Successful acquisition checkpoint means staged evidence, not applied/imported
revision. Other-connector conflicts still fail in importer.

Coverage is current contact-only identity snapshot, not activity history,
historical deleted contacts, all correspondents or other accounts. Sync is
checkpoint-relative changes, not backfill; propagation/cross-page consistency
remain limited. Complete validated traversal may report complete identity
snapshot with null temporal bounds and disclosed field limits. Empty full sync
is not zero-change incremental, and totalItems is not coverage proof.

Exit **0**: available synthetic selected-scope identity snapshot; **2**: persisted
partial/failed/setup outcome; **1**: private denial (no artifacts), fatal config/
input/storage/locking. Missing files fail, never empty result. Retained handoffs
are stale on failure. Unknown bounds/errors cannot become complete history.

Engineering history: [011 selection](../decisions.md#contacts-011),
[012 generations/reconciliation](../decisions.md#contacts-012).
Synthetic CI covers exact parameters, paging/token binding, duplicates,
interruption/replay/write rollback, quota/auth/expiry, profile/alias/deletion/
absence persistence, self/field limits, private no-artifact denial and unchanged
curated bytes; no live validation.

## Separate saved Google photo display contract

`contacts:csv --google-photos <google-photos.json>` validates an **already saved**
projected People API connections photo round. It does not retrieve connections
or images, enable CONTACTS-012 private acquisition, load credentials, or change
its field mask. Building and testing this feature uses synthetic fixtures only.
A separate owner-run retrieval needs its own exact account, fields, finite
budget and external output approval. For that run only, request connection
`resourceName,emailAddresses,phoneNumbers,photos` (photo URL, explicit `default`
and source type); never notes or unrelated fields. Do not treat this documentation
as approval to call People API or inspect an owner's saved export.

The local UTF-8 manifest (at most 1 MB) is a strict projection:

```json
{
  "schemaVersion": 1,
  "dataClass": "private",
  "kind": "google-connections-photo-assets",
  "observedAt": "2026-11-27T12:00:00Z",
  "coverage": "partial",
  "connections": [{
    "resourceName": "people/synthetic-example",
    "emailAddresses": [{"value": "fixture@example.invalid"}],
    "phoneNumbers": [{"value": "+12025550100"}],
    "photos": [{
      "url": "https://lh3.googleusercontent.com/synthetic-example",
      "default": true,
      "sourceType": "CONTACT",
      "redirectUrls": [],
      "file": null,
      "sha256": null
    }]
  }]
}
```

Each non-default photo instead names a sibling
`google-photo-<sha256>.png`, `.jpg` or `.webp` and its exact-byte `sha256`.
The validator checks containment/no filesystem redirects, digest, bounded size
and raster signature; it is not a full image decoder or proof of provider
authenticity. Defaults have null file/hash and never attach. At most 100 distinct
connections, 100 photo records in total, 100 values per address field, 5 MB per
image and 50 MB total are accepted. Missing/failed photos use an empty photo list;
missing coverage is never complete. More than one non-default preferred-source
photo is ambiguous: do not fall back to another source to guess.

The separate saver must use only observed HTTPS `*.googleusercontent.com` URLs,
omit cookies/credentials, bound retrieval time and stream size, and follow at
most three redirects with the same allowlist at every hop. This offline validator
performs **zero HTTP requests** and validates the declared original/redirect
URLs (no credential parameters/userinfo) plus every saved file; it cannot attest
to the historical fetch headers or undeclared hops. No saver/HTTP transport is
provided by this change.

Photos bind only to their containing connection resourceName. Display attachment
requires unique exact normalized email/phone evidence from that **same**
connection; no name, image, face, country-code or Gmail dot/+ alias inference.
CONTACT beats PROFILE; existing Facebook attachment beats Google. Shared
addresses, conflicting connections and ambiguous target people stay unattached,
including conflicts involving connections with no usable photo. The graph's
Gmail address evidence can bind a CSV contact's phone only through its unique
exact email; anonymous text threads have no verified phone identity and cannot
receive photos. These display links neither merge canonical identities nor
establish activity.

Only attached assets are copied under external `preview\photos`; the existing
CSP is unchanged. `contact-import.json` records the manifest digest, observation
time, connection/saved/default/eligible/linked counts and copied file hashes.
All bundle manifests, matching metadata and images remain private, outside
Git, PRs, CI and Library. No actual account data or images are used in tests.

## Public evidence

Consulted 2026-11-24:
[list](https://developers.google.com/people/api/rest/v1/people.connections/list),
[Person metadata](https://developers.google.com/people/api/rest/v1/people),
[sync](https://developers.google.com/people/v1/contacts),
[setup](https://developers.google.com/people/v1/getting-started).
