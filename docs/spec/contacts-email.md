# Heartbeat email: access and adapter (CONTACTS-013/014)

## Capability and authorization

013 selects Gmail API v1 `gmail.metadata`; 014 implements
`scripts/contacts/email.ts`, connector `gmail-metadata-v1`, through injected
synthetic `list/get/now` transport. The CLI is fixture-only: no HTTP, OAuth,
credentials, profile lookup, history sync, sending or scheduler. A non-Gmail
account is unsupported, not permission to select another provider silently.
No connected account or personal email tool was verified by this gate.

The [shared operating rules](contacts-technical-spec.md#shared-operating-rules)
and [CONTACTS-010 policy](../privacy.md) apply. Private requests are denied with
exit 1 / `private_collection_disabled` before fixture/checkpoint reads or output
resolution, after reading the request manifest; direct adapter and fixture
transport calls also deny them. Future real access needs exact source/account
and EACH-run approval, verified Windows protection, backup exclusions,
retention/deletion and separately reviewed transport. Metadata policy does not
authorize MBOX/content processing, broader scopes or browser reuse. Manual
[V0 retrieval](contacts-manual-retrieval.md) is a separate handoff-only route.

## Native request and normalization

| Contract | Implemented interpretation / limitation |
| --- | --- |
| Permission | Only `https://www.googleapis.com/auth/gmail.metadata` (restricted scope). No readonly/body-capable, modify, send, settings or full-mail scope. OAuth setup/verification remains separately approved. |
| Enumeration | `messages.list`, no `q` (forbidden with metadata scope), no label filter, `includeSpamTrash:true`; exclude drafts, filter half-open sent-time bounds locally. Default page size 100, provider maximum 500. Do not stop at old dates: list order does not guarantee sent-time order. |
| Detail projection | `messages.get(format:metadata)`, headers `From,To,Cc,Bcc,Date,List-Id,Precedence,Auto-Submitted`, fields `id,threadId,labelIds,historyId,internalDate,payload(headers)`. Unexpected fields, subjects/snippets/bodies/MIME/attachments fail the entire page; never log native payloads. |
| IDs | One account/message ID = one event, all recipient roles retained. Thread ID is not a message or complete roster. Synthetic native IDs are labeled `local`; eventual provider-issued IDs must retain their provenance. RFC Message-ID is not a Gmail or cross-account key. |
| Self/addresses | Explicit stable account and `selfAddresses`; preserve local-part case, lowercase domains, no alias/country/name guesses. Future `users.getProfile(me)` could expose primary address/history ID, but is not implemented or authority to infer aliases. Profile totals are not interval counts. |
| Sender parser | Bare dot-atom/angle addresses, quoted display names and named groups supported. Missing/multiple authors, quoted local parts, comments, internationalized or malformed syntax fail the page. Display names are discarded, never identity keys. |
| Time | Valid RFC-style Date with numeric known offset, GMT or UT; validate calendar and reject future-at-retrieval dates. Reject `-0000` and trailing comments such as `+0000 (UTC)`. Never substitute `internalDate`, receipt or import time for sent time. |
| Roles/thread | Preserve actual To/CC/visible BCC; hidden BCC and absent headers remain unknown. Default unreviewed kind is `unknown`. Stable `reviewedThreads` evidence supplies direct/group/broadcast kinds; direct requires exactly one self and peer, complete-roster evidence and no observed outsiders. Two visible addresses alone are insufficient. |
| Classification | Keep all classes. Valid List-Id or Precedence bulk/list gives bulk; Auto-Submitted auto-generated/auto-replied gives automated. Conflicting/invalid/absent evidence stays unclassified; interpersonal requires explicit `interpersonalIds`. Labels/category membership do not prove interpersonal activity. |

Only normalized addresses, IDs, roles, event instants and classifications enter
the v1 handoff. Timestamp/classification diagnostics, native tokens and header
evidence remain private acquisition state, not extra envelope fields.

## Local invocation and files

```powershell
npm run contacts:email -- --synthetic-request .private\contacts\email-request.json
```

Request paths resolve relative to the request file. Synthetic inputs/outputs
may use ignored `.private\contacts` or an external local directory, not tracked
or public paths. This is not approved real-data storage.

```json
{
  "config": {
    "schemaVersion": 1,
    "dataClass": "synthetic",
    "provider": "gmail",
    "account": "fixture-email",
    "selfAddresses": ["self@example.invalid"],
    "period": {"preset": "7d", "timeZone": "UTC", "asOf": "2026-11-24T20:00:00Z"},
    "maxPages": 10,
    "pageSize": 100,
    "reviewedThreads": [],
    "interpersonalIds": []
  },
  "fixture": "email-native.synthetic.json",
  "output": "email-acquisition-001"
}
```

Native fixture: `schemaVersion:1`, `dataClass:"synthetic"`, `retrievedAt`,
`pages:[{pageToken:null,response:{messages:[{id,threadId}],nextPageToken?}}]`,
and `details:{[id]:{id,threadId,payload:{headers:[{name,value}]}}}`.
`{"errorStatus":401}` injects an account-free response/detail failure.
[email-gate.synthetic.json](../../scripts/contacts/fixtures/email-gate.synthetic.json)
is instead a normalized five-event/two-page fixture, not a Gmail response.
Executable native shapes and assertions are in `email.test.ts`.

Fresh immutable output contains `handoff.json`, `checkpoint.json` (native list
token plus normalized accumulator), and sanitized `report.json`. Exclusive,
fsynced same-parent staging followed by directory rename publishes them together.
Never reuse output or treat `.email-staging-*` as committed acquisition. After
verifying its process stopped, remove only the exact stale staging directory.
Filesystem atomicity does not certify Windows protection or power-loss recovery.

Resume with `"previous":"email-acquisition-001\\checkpoint.json"` and a fresh
output. Policy/period/self/review/page-size bindings must match; only `maxPages`
may change. Successful pages accumulate; retries repeat the failed page and
deduplicate IDs. Import the handoff with matching email/account/connector through
`contacts:collect`, never the native checkpoint.

## Cursors, coverage and failures

`nativeCursor.domain` is `gmail.messages.list`; its nextPageToken is neither
`gmail.history.list` nor an importer cursor. Each emitted handoff is one terminal
null-cursor page of the acquired subset. Commit a native page only after every
detail validates; cycles/conflicting duplicates fail. One unsupported header
keeps the whole page pending until input repair or a reviewed parser extension;
do not silently skip it.

All adapter coverage is **partial**, even empty/terminal enumeration. Hidden
recipients, aliases, deleted mail and concurrent changes prevent complete history.
Estimates, budgets and cursor exhaustion are not counts or zero history.
401/403 before observations is `requires_setup`, afterwards partial plus setup
error. Invalid/400 continuation sets `resyncRequired`; start a fresh scan without
`previous`, retaining importer deduplication. Detail 404, 429, 5xx, malformed
metadata and budget exhaustion retain valid pages with sanitized retryability.
No failed-page checkpoint advancement or success-shaped empty result.

Future history sync is distinct: history IDs have gaps and may expire within
hours despite typical week-long retention; history 404 requires explicit
approved-scope full resync. Durable watermark/revision/deletion reconciliation
needs a separately reviewed integration with CONTACTS-021/032. Never count label
changes as messages or erase curated records.

CLI exit **2** persists partial/unavailable outcomes; **1** is fatal input,
private denial or storage failure. This adapter never reports complete/exit 0.
An independently verified empty accessible snapshot could describe only its
reviewed scope, not all-time mailbox history.

Engineering history: [013 route rationale](../decisions.md#contacts-013) and
[014 alternatives, tests and revisit conditions](../decisions.md#contacts-014).
`npm run ci` includes `email.test.ts` and normalized collector cases: exact
requests, roles/classes, interval edges, drafts, replay/resume, expiry/auth,
page rollback, cycles, private denial and immutable output; no real access.

## Public evidence

Consulted 2026-11-25, not account-access evidence:
[scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[list/search limits](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list),
[get/metadataHeaders](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get),
[formats](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format),
[message fields](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages),
[profile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile),
[history](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list),
[sync limits](https://developers.google.com/workspace/gmail/api/guides/sync).
