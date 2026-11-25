# Heartbeat: Gmail metadata adapter (CONTACTS-014)

## Delivered boundary

`scripts/contacts/email.cjs` implements the Gmail metadata enumeration/normalization
route selected by [CONTACTS-013](contacts-email-access.md), through an injected
`list/get/now` transport. The callable CLI supplies **only a local synthetic
fixture transport**. There is no HTTP transport, OAuth setup, credential loading,
profile/account lookup, history sync, sending or schedule. `dataClass: private`
is rejected before transport calls. This implements the selected adapter with
synthetic native payloads, not an authorized or connected Gmail account.
CONTACTS-010 and separate source authorization remain mandatory for future real
access; adding an HTTP transport requires a separately reviewed boundary.

The adapter requests `messages.list` without `q` or label filters, with
`includeSpamTrash: true`, and gets each message with `format: metadata`,
`metadataHeaders: [From,To,Cc,Bcc,Date,List-Id,Precedence,Auto-Submitted]` and
`fields: id,threadId,labelIds,historyId,internalDate,payload(headers)`. Unexpected
fields, including subjects/snippets/bodies, fail the source page without
persisting raw responses. Drafts are excluded. The requested half-open sent-time
interval is filtered locally after normalization; old messages never stop paging.

One Gmail message ID produces one event, with all visible recipient roles. IDs
in these synthetic native fixtures are invented and labeled `local`; no
provider-issued IDs or real addresses have been acquired. Account namespaces and
self addresses are explicit. Address domains are lowercased, but local parts are
preserved; aliases are never inferred. Only normalized addresses, roles, IDs,
sent timestamps and classes survive conversion. No header/display-name/label
payload is retained.

## Synthetic CLI and private files

Prepare a synthetic request and native fixture in `.private/contacts/` (or an
approved external local folder), then run:

```powershell
npm run contacts:email -- --synthetic-request .private\contacts\email-request.json
```

Request shape (all values below are invented):

```json
{
  "config": {
    "schemaVersion": 1,
    "dataClass": "synthetic",
    "provider": "gmail",
    "account": "fixture-email",
    "selfAddresses": ["self@example.invalid"],
    "period": {
      "preset": "custom",
      "timeZone": "UTC",
      "asOf": "2026-11-24T20:00:00Z",
      "start": "2026-11-01T00:00:00Z",
      "end": "2026-11-24T20:00:00Z"
    },
    "maxPages": 10,
    "pageSize": 100,
    "reviewedThreads": [],
    "interpersonalIds": []
  },
  "fixture": "email-native.synthetic.json",
  "output": "email-acquisition-001"
}
```

Minimal matching native fixture:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "retrievedAt": "2026-11-24T20:00:00Z",
  "pages": [{
    "pageToken": null,
    "response": {"messages": [{"id": "message-1", "threadId": "thread-1"}]}
  }],
  "details": {
    "message-1": {
      "id": "message-1",
      "threadId": "thread-1",
      "payload": {"headers": [
        {"name": "From", "value": "peer@example.invalid"},
        {"name": "To", "value": "self@example.invalid"},
        {"name": "Date", "value": "23 Nov 2026 12:00:00 +0000"}
      ]}
    }
  }
}
```

Fixture pages map native `pageToken` to `response`; responses can contain
`nextPageToken`. A response/detail of `{"errorStatus": 401}` injects an auth
failure, without an account. Synthetic cases and transport assertions live in
`scripts/contacts/email.test.cjs`.

A successful filesystem publication creates a **fresh, immutable directory**:

```text
email-acquisition-001/
  handoff.json       # ordinary v1 email metadata handoff for contacts:collect
  checkpoint.json    # native messages.list cursor + normalized scan accumulator
  report.json        # sanitized acquisition errors/status/resync requirement
```

All paths resolve relative to the request file. The same private-output guard as
the importer rejects tracked/public checkout locations. Output directories cannot
be reused. Files are written exclusively and fsynced in a same-parent staging
directory, then published together by directory rename; a failed write cannot
advance the durable checkpoint without its associated handoff. An interruption
may leave a staging directory; it is not an acquisition/checkpoint. After verifying
no process is using it, remove only that exact stale directory. Local filesystem
atomicity is not a guarantee of full power-loss recovery or Windows ACL policy.

To resume, add `"previous": "email-acquisition-001\\checkpoint.json"` to the
request and choose a new output directory. (Use the platform's path separators
when constructing local paths.) Configuration/period/self/review policy and page
size must match; only `maxPages` can change. Resume accumulates already committed
normalized events, retries the failed native page and deduplicates message IDs.
Import the new `handoff.json` through the unchanged metadata-import request
contract (`source: email`, `connector: gmail-metadata-v1`, matching account).
Reimporting unchanged events does not duplicate activity.

## Cursor, coverage and error contract

The checkpoint's `nativeCursor.domain` is `gmail.messages.list`;
`nextPageToken` is **never** an importer cursor. Each acquisition emits a single
terminal handoff page (`cursor: null`, `nextCursor: null`). It is a complete
immutable local handoff of the acquired subset, not a complete mailbox/history.
The checkpoint does not advance until every listed detail in that native page
validates. A failing page is retried in full; prior successful pages remain.
Cycles and conflicting duplicate IDs fail explicitly.

All acquired coverage is `partial`, including terminal or empty enumeration.
Hidden BCC, unknown aliases/rosters, deleted history and concurrent mailbox changes
remain unverified. Estimates are never counts. The CLI exits **2** after
persisting partial/unavailable outcomes and **1** for fatal input/storage errors;
it never reports collected/complete history. A 401/403 before any observed event
reports `requires_setup`; after observations it retains partial results and the
setup error. 400/invalid continuation requires explicit rescan (`resyncRequired`),
not empty success or a silent restart. 404 details, 429 and 5xx are explicit
sanitized errors. Start a fresh scan without `previous` after cursor expiry;
importer ID dedup preserves already collected events.

`gmail.history.list` and its watermarks are deliberately not accepted as this
checkpoint domain. There is no incremental-history claim, deletion reconciliation
or history-404 fallback in this adapter. Those need CONTACTS-021/032 and their
separate tests; list-token expiry is covered here.

## Delegated engineering decisions for owner review

These are engineering defaults under the 2026-11-24 delegation, **not approved
privacy policy**. None grants actual source/account access.

| Decision / rationale | Alternatives and assumptions | Validation / revisit condition |
| --- | --- | --- |
| Injected Gmail metadata transport; executable CLI is synthetic-only. Proves the selected native request/conversion path without credentials or network. | Live HTTP/OAuth deferred; normalized-handoff-only would not exercise native paging/conversion. Assumes 013's selected route, not that any real account is Gmail. | Tests inspect exact metadata requests and reject private input/non-Gmail provider. Revisit only with CONTACTS-010 plus bounded source authorization and reviewed transport. |
| Include spam/trash; exclude drafts; scan all accessible pages, locally filter sent time. Avoid label bias and forbidden metadata-scope `q`. | Inbox-only or date-order early exit would silently miss history. Assumes bounded synthetic workloads; memory retains the current scan. | Tests include draft and both interval edges, overlapping pages and page budgets. Revisit memory/budget policy before a large approved real scan. |
| Conservative dependency-free mailbox/date profile. Supports bare dot-atom addresses, angle addresses, quoted display names and named address groups; rejects quoted local parts, comments, internationalized syntax and ambiguous senders. RFC-style Date needs a numeric offset (not unknown `-0000`), GMT or UT, valid calendar/time and no future instant. Never substitutes `internalDate`. | General MIME/parser dependencies deferred under the repository's no-install constraint; permissive parsing risks invented identities/times. Unsupported syntax fails the page, not an empty success. | Tests cover quoted commas/groups, ambiguous authors, malformed addresses/dates, unknown offsets and future dates. Revisit a reviewed parser/profile extension when synthetic evidence requires more syntax. |
| Default every unreviewed thread to `unknown`. A stable `reviewedThreads` list supplies direct/group/broadcast evidence; direct requires exactly one self and one peer and rejects observed outsiders. | Inferring direct from two visible addresses ignores hidden BCC. Deriving mutable thread kinds on each page conflicts with v1 immutable records. Review is synthetic evidence here, not an identity-review product. | Direct/To/CC/BCC/broadcast and unknown-roster tests preserve one event/message. Revisit kinds/rosters with CONTACTS-021 historical thread revisions. |
| Keep bulk/automated/unclassified events. Valid List-Id or Precedence bulk/list gives bulk; Auto-Submitted auto-generated/auto-replied gives automated; conflicts/invalid evidence remain unclassified. Interpersonal needs explicit `interpersonalIds` evidence. | Absence of bulk headers or Gmail category labels cannot establish interpersonal mail; body classification is outside scope. | Tests cover classes, conflicting signals and absent evidence. Revisit classifiers only with explicit evidence contracts, never implicit remote-AI processing. |
| Immutable acquisition directory commits handoff plus native checkpoint together; resume binds policy/period, retains normalized events, and never promotes coverage above partial. | Independent mutable cursor files could outrun durable output; native history cursors require reconciliation not implemented here. | CLI/import/replay/resume, auth, expiry, malformed-page rollback, cycles, unsafe paths and empty enumeration tests. Revisit with race-safe history reconciliation and source operations, not just terminal pagination. |
