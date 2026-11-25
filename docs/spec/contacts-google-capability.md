# Heartbeat: Google identity access gate (CONTACTS-011)

Status: **Selected API-first route implemented for synthetic pages (CONTACTS-012);
not connected or authorized for private execution**.
This capability decision targets `caltseng/heartbeat` (Phalanx repository ID
`heartbeat`). Bootstrap is checked in at
`6b6299475b0d1dbcf2bd005c87d383ee97537e2b`. This document selects the bounded
route for CONTACTS-012, not permission to read an account.

## Available versus proposed

| Route | Actual capability and boundary |
| --- | --- |
| Available local route | `contacts-google-identities` skill plus `npm run contacts:collect -- --request <private-request>` imports schemaVersion 1 normalized identity handoffs. It does not call Google. Synthetic demo/test inputs work without authorization. |
| Selected route / synthetic implementation | Local CONTACTS-012 adapter `scripts/contacts/google.cjs`, connector `google-people-connections-v1`, constructs `people.connections.list`: `GET https://people.googleapis.com/v1/people/me/connections`. Its transport is mock-only; no network, OAuth client, consent, credential or authorized source account is established. |
| Existing authorized Google tool | None verified in this work item's available tools or repository. Public API documentation is design evidence only, not a successful tool invocation or connected access. MCP is optional, not a required backend; do not install/discover an integration or connect an account to close this gate. |
| Snapshot/export alternative | An already authorized normalized handoff can be imported. Native Google CSV/vCard/Takeout exports have no built-in parser here; format/version, stable-ID evidence and conversion need a separate validated route. They cannot establish sync-token/deletion history or historical completeness. Search results are not a full snapshot. |

No live requests, account/device/private-browser inspection, credential
acquisition, pairing, sending, source writes or recurring jobs were performed or
authorized. All examples below are invented. The product stays a single-user
local JSON store, CLI and future generated private Heartbeat report/graph files,
without hosting, backend or product accounts.

## Read-only request and field contract

Select only OAuth scope `https://www.googleapis.com/auth/contacts.readonly`;
the broader `contacts` write scope is not selected. A field mask minimizes the
response, but does not reduce the authority of the OAuth scope.

The proposed initial GET has an empty body and these parameters:

```text
personFields=metadata,names,emailAddresses,phoneNumbers
sources=READ_SOURCE_TYPE_CONTACT
pageSize=100
requestSyncToken=true
```

`sources` is the REST repeated query parameter (`sources[]` in the reference).
Explicit contact-only filtering avoids the default inclusion of profile sources.
Do not set `sortOrder` for sync: the documented sort order only applies when sync
is not requested. No `people.get`, directory, Other Contacts, Gmail, search or
write endpoint is implicitly selected.

| Provider field | Proposed use / retention boundary |
| --- | --- |
| `resourceName` (`people/{person_id}`) | Preserve exactly as the normalized identity `id`, with `idKind: provider`. It is not a canonical person ID or guaranteed immutable across source linking changes. |
| `metadata.sources[].type/id` | Preserve source-type/source-ID evidence in private adapter state for disambiguation; source `id` is unique within its source type, not globally. |
| `metadata.previousResourceNames`, `linkedPeopleResourceNames` | Private alias/link evidence, not automatic cross-person merges. Former names are supplied on sync responses; unresolved collisions require review. |
| Person/source `etag`, source `updateTime` | Private revision/deduplication evidence only; not interaction or collection timestamps. |
| `metadata.deleted` | Sync tombstone evidence, handled separately below; never a message/deletion activity event. |
| `names[].displayName` | Optional normalized `displayName`; prefer an explicitly primary value, not arbitrary array order. Absence does not invalidate a contact. |
| `emailAddresses[].value`, `phoneNumbers[].value` | Normalized `addresses` of type `email`/`phone`; retain matching evidence, not automatic canonical identity merges. Do not invent country codes or addresses. |

Do not request biographies/notes, photos, birthdays, physical addresses, groups,
relationships, organizations, user-defined fields or message content. `metadata`
can return more than needed; project only the listed revision/link evidence into
private adapter state and discard unneeded payload fields rather than archiving
raw responses. The normalized importer rejects vendor fields: do not append
`metadata`, etags, source IDs, native tokens or tombstones to its schema.

Store identities under the existing key
`["google-contacts", reviewedAccount, "identity", resourceName]`. The account
namespace must be a reviewed stable source-account reference, never a token,
display name or changing email alias; no extra profile scope is selected to
discover it. Establish self flags from separately verified owner identity evidence,
not the contact's name or mere presence in the address book. All invented peers
below are explicitly non-self.

## Pagination, sync and safe recovery (CONTACTS-012 requirements)

1. Follow `nextPageToken` as `pageToken` until omitted. Valid `pageSize` is
   1-1000; 100 is this route's proposed default. Keep all other parameters
   identical to the originating request. `totalItems` is informational, not a
   replacement for traversing pages or a history guarantee.
2. With `requestSyncToken=true`, `nextSyncToken` appears only on the last page.
   Persist a new sync checkpoint only after every page is durably staged and
   validated. Keep the prior complete generation during interruption, page-budget
   exhaustion, throttling or errors; report partial/stale coverage, not collected.
3. For an incremental cycle, use the saved `syncToken`; hold that same token
   throughout its pagination and retain the original mask, source filter, page
   size and sync options. Bind private state to reviewed account, connector,
   parameter fingerprint and generation. Do not mix accounts or advance a sync
   token per page. A changed scope/mask requires a new full generation.
4. Google documents sync-token expiry **7 days after the full sync**. Do not
   assume incremental calls renew this lifetime. HTTP 410 / `EXPIRED_SYNC_TOKEN`
   requires a new full sync without page/sync tokens, still requesting a new sync
   token. Stage it separately; do not erase the last good snapshot to recover.
   The first page of a full sync has additional fixed quota; HTTP 429 requires
   bounded backoff and an explicit retryable failure if exhausted, not a retry loop.
5. Sync responses can contain `metadata.deleted:true` with only identifying
   fields. Preserve a private source tombstone and invalidate only that source
   observation in a future revision-aware model. Never delete curated people,
   mappings, households or notes. Missing contacts in partial pages, errors or
   export differences are not confirmed deletions. A complete replacement snapshot
   can establish source absence, not why or when the person disappeared.
6. The current importer is append-only/conflict-detecting: changed metadata for an
   existing key fails, and Google contacts cannot carry events. CONTACTS-012 must
   stage changes/tombstones privately and report unsupported reconciliation
   explicitly until CONTACTS-021 defines revisions/targets. Do not silently drop
   deletions, overwrite records, fabricate identity-deletion events or claim an
   incremental refresh fully applied.
7. Provider page/sync tokens belong to private acquisition state, **not** the
   importer's cursor. Normalized `cursor`/`nextCursor` are stable page locators
   within one immutable handoff; `resume:true` resumes that file/period, not a
   Google HTTP session. Preserve connector/digest/page/retrieval provenance.

Duplicate identical observations of one account/resource ID may deduplicate;
same-name contacts with different IDs remain distinct. A changed resource name
needs reviewed alias evidence before import. Source linking does not authorize
canonical-person merging. A contact, source update or tombstone creates no
interaction.

## Snapshot limits and explicit unavailable outcomes

Coverage is the authenticated account's selected current contact identity
snapshot, not everyone ever contacted, deleted historical contacts, communication
frequency, a 7d/30d activity interval, Other Contacts, domain directory, profile
data, groups or other accounts. Sync is a change feed since a valid checkpoint,
not arbitrary historical backfill. Propagation may take minutes; there is no
read-after-write or cross-page point-in-time consistency guarantee claimed here.

The list method limits email addresses and phone numbers to **100 per person per
field**. Reaching either limit is potentially truncated field coverage; disclose
it as partial. `people.getBatchGet` can retrieve the full sets per the reference,
but is **not selected** and requires a separately reviewed expansion. Optional
absent fields are unknown, not evidence that no other address exists.

Only a completely traversed, validated snapshot with its exact field/source
limits disclosed can claim complete identity-snapshot coverage with null temporal
bounds. A verified empty terminal full snapshot differs from a zero-change
incremental response; the latter does not mean an empty address book.

Without an authorized network transport, collection requests must use
`mode: unavailable`, `status: requires_setup`, a reviewed account placeholder and
an explicit reason naming the missing transport/authorization. The acquisition
CLI writes an explicit `requires_setup` report for missing synthetic transport.
Private acquisition is disabled before output access (exit 1, no artifacts). No synthetic data
may masquerade as real output. Unapproved scopes/auth gaps remain `requires_setup`;
unsupported native formats remain `unsupported`; runtime adapter HTTP 401/403,
429/5xx, invalid pages or expired checkpoints must report sanitized failures or
partial/stale results, never a success-shaped empty snapshot. Do not log response
bodies or tokens. The existing importer returns nonzero exit 2 for unavailable,
failed or partial sources (fatal request/storage errors use 1).

## Synthetic page shapes (not API execution evidence)

Invented provider response, first page of a full sync:

```json
{
  "connections": [
    {
      "resourceName": "people/fixture-001",
      "etag": "fixture-etag-001",
      "metadata": {
        "sources": [{"type": "CONTACT", "id": "fixture-source-001"}]
      },
      "names": [{"displayName": "Fixture Peer", "metadata": {"primary": true}}],
      "emailAddresses": [{"value": "peer@example.invalid"}]
    }
  ],
  "nextPageToken": "fixture-provider-page-2",
  "totalItems": 1
}
```

An invented terminal response can be
`{"connections":[],"nextSyncToken":"fixture-provider-sync-1","totalItems":1}`.
A later sync tombstone can be
`{"resourceName":"people/fixture-001","metadata":{"deleted":true}}`.
These native shapes are **not importer input**; tokens and tombstones stay out
of the following executable synthetic normalized handoff:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "source": "google-contacts",
  "account": "fixture-google-account",
  "connector": "google-people-connections-v1",
  "coverage": {
    "start": null,
    "end": null,
    "completeness": "complete",
    "basis": "Synthetic contact-only identity snapshot; no activity history or live access."
  },
  "errors": [],
  "pages": [
    {
      "cursor": null,
      "nextCursor": "fixture-handoff-page-2",
      "retrievedAt": "2026-11-24T20:00:00Z",
      "identities": [
        {
          "id": "people/fixture-001",
          "idKind": "provider",
          "isSelf": false,
          "displayName": "Fixture Peer",
          "addresses": [{"type": "email", "value": "peer@example.invalid"}]
        }
      ],
      "threads": [],
      "memberships": [],
      "events": []
    },
    {
      "cursor": "fixture-handoff-page-2",
      "nextCursor": null,
      "retrievedAt": "2026-11-24T20:00:01Z",
      "identities": [],
      "threads": [],
      "memberships": [],
      "events": []
    }
  ]
}
```

For CONTACTS-012, mocked HTTP tests must additionally cover duplicate IDs,
page interruption/replay, auth/quota failures, expired-token full resync, field
limits, changed profiles/resource aliases and tombstones without curated deletion.
The example proves the normalized import shape. The CONTACTS-012 synthetic
adapter and tests now exercise acquisition/recovery, not live API access or
revision-aware reconciliation.

## CONTACTS-012 local adapter and delegated decisions

Implemented on 2026-11-24 under the owner's delegation of ordinary engineering
choices. These are **engineering decisions, not owner-approved privacy policy**.
The [CONTACTS-010 policy](../privacy.md) is owner-approved; exact source/account
and each-run authorization remain ungranted, and local protection and
retention/deletion controls remain unverified/unimplemented. No credentials,
account, device, browser, remote AI, sending, source writes or schedules are used.

### Private configuration and executable synthetic route

```powershell
npm run contacts:google -- --config .private\contacts\google-fixture\config.json
```

Create that configuration and an invented fixture privately, never in tracked
output. Configuration/fixture/output references resolve relative to the config.
The CLI validates every location using the importer's existing private-output
boundary: inside this checkout only `.private\contacts`, or an explicitly chosen
external local directory. These locations permit synthetic artifacts only, not
verified real-data storage. Reject unknown config fields, including credentials.

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "account": "fixture-google-account",
  "output": "acquisition",
  "fixture": "pages.synthetic.json",
  "selfIds": [],
  "maxPages": 100
}
```

The fixture file is `{"dataClass":"synthetic","responses":[...]}`; each response
is `{"status":200,"body":{...}}` using the invented native shapes above. Include a
terminal `nextSyncToken` even for a verified empty full snapshot. Responses are
consumed in order, including retry/410 responses; exhaustion fails explicitly.
Do not label a real export synthetic. The test module demonstrates all cases
without checked-in exports. `selfIds` contains only separately verified provider
resource IDs; default `[]` makes every invented contact explicitly non-self.

The CLI has **no HTTP or credential loader**. `acquire` accepts an injected
synthetic transport receiving the fixed URL and parameters; `run` only supplies a
local synthetic fixture transport. A synthetic config with no fixture/transport
returns `requires_setup/authorized_transport_unavailable`; `dataClass: private`
fails closed with exit 1 / `private_collection_disabled` before resolving output,
creating directories/locks, reading checkpoints/fixtures or writing any report.
The pure acquisition entry point rejects private data with the same code.
Missing/invalid local files are fatal failures, not empty results.
OAuth acquisition and real execution are deliberately unavailable even if a
caller happens to possess credentials.

### Checkpoints, handoff and recovery

One exclusive `google-acquisition.lock` prevents concurrent adapter writers in
an output directory. Owner-only POSIX file/directory modes are requested; this
does not certify Windows ACLs/encryption. `google-acquisition.json` atomically
persists the report, bound state and `handoffFile` reference. All identifiers,
revision evidence, baselines, tokens, reports and generations remain private.
Stdout includes only the Heartbeat title, status and fixed error codes.

A successful traversal produces an immutable `google-handoff-<uuid>.json` first,
then atomically records its reference and checkpoint. Supply **that handoff** as
the existing importer's `source.input`; never supply the acquisition bundle.
No collection store or curated file is opened by the adapter. A crash before
checkpoint replacement leaves the prior generation authoritative; an orphaned
handoff can be ignored (no automatic deletion). An ordinary failed/auth-limited
synthetic cycle writes a failure report while preserving both the last-good
state and its `handoffFile` reference (null only if none ever succeeded).
Inspect the report: a retained handoff is explicitly stale, not current success.
Rerun the same
config after correcting the synthetic input; traversal restarts from the last
complete sync generation, not a partially fetched page.

After a hard kill, a stale lock may remain. Confirm no adapter is running before
removing only the exact `google-acquisition.lock` in the selected private output
directory, then rerun; never delete the directory or a live writer's lock.
Immutable handoffs accumulate intentionally. CONTACTS-032 retention/deletion
must inventory these files as well as checkpoints and reports; no automatic
private-data deletion policy is invented here.

State binds account, data class, connector, exact parameters and verified self
IDs. Mismatch fails before acquisition; select a fresh private output directory
for an intentional binding change, preserving the old one for review. Full-sync
age is not renewed by incremental calls. Seven-day age or HTTP 410 triggers a
new full sync; 410 recovery discards only in-memory staged pages, never the prior
generation. The page budget includes responses discarded during resync.
429/5xx has at most three attempts per page, with 50/100 ms mock backoff.
401/403 is explicit `requires_setup`; other HTTP, malformed response, cycle,
conflicting duplicate or budget failures preserve the prior state. Tokens and
upstream bodies never appear in error messages or normalized handoffs.

Full snapshots replace only the adapter's source view; incremental pages update
that view and a zero-change incremental handoff still includes its retained
identities. Same-ID identical observations deduplicate; same-name/different-ID
contacts stay separate. Conflicting same-cycle observations fail atomically.
Primary names are preferred; multiple names without a primary remain unknown
rather than picking by array order. Address values are preserved without country
inference; exact duplicates sort/deduplicate. Unneeded native fields are discarded.

Until CONTACTS-021, the first safely emitted identity per provider ID reserves an
append-only baseline. Changed identities, aliases/links, tombstones and complete
full-snapshot absences are privately staged with explicit reconciliation reasons.
Projected disputed observations and reasons remain in a private pending ledger
across resyncs and later payloads that omit earlier alias/tombstone evidence.
There is deliberately no automatic clearing operation before 021 review.
They never overwrite normalized or curated records. Only unchanged/new safe
identities enter handoffs; **pending reconciliation remains partial on later
zero-change syncs**. Address limits also force partial coverage. A successful
acquisition checkpoint means staged source evidence is durable, not that changes
were applied to the collection model. A baseline reservation does not prove an
import occurred. Other connectors' conflicting observations still fail visibly
in the shared importer rather than being reconciled by this adapter.

Exit 0 means a synthetic selected-scope identity snapshot is available, not live
access or historical completeness. Exit 2 means persisted partial, failed or
requires-setup reporting for synthetic runs; exit 1 includes disabled private
collection (no artifacts), or fatal arguments/config/storage/locking
failure. Handoffs have null temporal bounds, no provider tokens/vendor fields,
and empty threads/memberships/events. Source updates/deletions never create activity.

### Material decisions for owner review

| Decision / rationale | Alternatives and assumptions | Synthetic validation / revisit condition |
| --- | --- | --- |
| Keep transport injection and CLI fixtures only; reject private collection before output access, including reports/manifests. | Shipping HTTP/OAuth loading or a private setup report now could imply access/protection authority. Protection is unverified; missing synthetic transport still gets an explicit setup report. | Parameter/auth/private-run no-artifact tests; revisit only after enforcing approved CONTACTS-010 policy, exact source/account and each-run authorization, verified protection and reviewed credential/network design. |
| Atomic complete generations with immutable handoff-before-checkpoint; restart interrupted pagination instead of persisting provider page tokens. | Per-page crash resume adds mutable staging complexity. Small single-user contact snapshots and a 100-page default are assumed; maxPages is bounded to 1-10000. | Pagination/budget/replay and injected checkpoint-write failure; revisit if separately approved snapshot size requires durable page staging. |
| Preserve original full-sync age; expire at seven days or recover once from incremental 410; bounded mock retries. | Renewing token age from incremental activity conflicts with 011; unlimited retries hide failure. Mock retry timing is not a production quota policy. | Fixed-token multi-page sync, staged-page expiry, seven-day resync and quota tests; revisit timing/Retry-After with an authorized production transport. |
| Reserve conservative immutable identity baselines and stage revisions/deletions/aliases/absence privately, keeping coverage partial. | Destructive replacement or vendor tombstone events violate append-only ingestion/curated independence; 021 is not delivered. | Changed profile, alias, tombstone, full-resync absence and zero-change replay tests plus untouched curated bytes; revisit with explicit 021 revision/target reconciliation. |
| Retain only projected source evidence; primary-only disambiguation, no inferred self/person matches, partial at field limits. | Native payload retention, display-name merging or extra lookup endpoints exceed 011. Self evidence is external to this route. | Projection, same-name IDs, self binding, field limits and identity-only importer tests; revisit field/scope expansion only through a separately reviewed gate. |

## Setup and approval gaps (no setup performed)

Before any future real run, enforce the [approved CONTACTS-010 policy](../privacy.md):
obtain owner approval for the exact source/account and each bounded run, verify
Windows-user restrictions, disk encryption and backup/sync exclusions, and
implement operational 12-month retention and explicit deletion. All configuration
references, OAuth material, source IDs, page/sync tokens, checkpoints, requests,
normalized records, manifests and generated reports/graphs share that boundary:
on this computer, outside Git worktrees and cloud-synced folders, never tracked
output, CI logs or PR descriptions. Ignored `.private/` is for synthetic work,
not approved real-data storage. The private guard remains enabled; policy
approval alone neither verifies these controls nor authorizes acquisition.

A future owner-controlled setup would need a Google Cloud project with People
API enabled, a suitable local/installed-app OAuth client and consent configuration,
any required testing/verification or Workspace administrator approval, and explicit
account consent to `contacts.readonly`. No service-account/domain-wide delegation,
broader identity scope or hosted OAuth backend is selected. Revoked consent,
missing grants or policy restrictions remain explicit setup blockers. Do not
request secrets, create clients, run login flows, acquire tokens or inspect an
account as part of this gate. Implement and review CONTACTS-012 against synthetic
responses first; live source authorization is an additional gate, not implied by
adapter delivery.

## Public design evidence

Consulted 2026-11-24; these are public contracts, not authorized-access evidence:

- [people.connections.list](https://developers.google.com/people/api/rest/v1/people.connections/list):
  method, read-only scope, fields, sources, pagination, quota, sync expiry/deletions.
- [Person / PersonMetadata / Source](https://developers.google.com/people/api/rest/v1/people):
  identifiers, source revisions, aliases and per-person field limits.
- [Read and manage contacts](https://developers.google.com/people/v1/contacts):
  full/incremental traversal, HTTP 410 recovery and propagation limitations.
- [Get ready to use People API](https://developers.google.com/people/v1/getting-started):
  API project/enablement and separate authorization prerequisites.

The [technical contract](contacts-technical-spec.md),
[privacy boundary](../privacy.md) and [stable register](contacts-work-items.md)
remain authoritative for local storage, schema and the distinct follow-on items.
