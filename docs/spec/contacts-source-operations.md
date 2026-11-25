# Heartbeat source operations and retention (CONTACTS-032)

## Delivered boundary

`npm run contacts:operate -- --request <operation.synthetic.json>` provides
user-invoked `status`, `refresh`, `resync`, `retain`, `delete` and `recover`.
It operates the existing version-1 **synthetic metadata-handoff route**, including
handoffs from Google 012, Gmail 014 and text XML 016. It neither calls a provider
nor implements the pending Messenger/WhatsApp converters. Unavailable sources
must still be declared, never replaced with empty successful handoffs.

Private operations fail before resolving a store. CONTACTS-010's owner-approved
policy is unchanged: Windows protection verification, account/source and each-run
approvals, real-input inventory/age verification and backup exclusions are still
missing. This implementation is not authority to acquire or process real data,
curated notes or content. Existing curated files are preserved as opaque files in
synthetic tests; no note capture or new content permission is added.

## Request and local layout

Keep the operation request **outside** the store, in ignored synthetic storage or
a synthetic temporary directory. Never commit generated requests, IDs or outputs.

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "action": "status",
  "store": ".private\\contacts\\managed-fixture",
  "now": "2026-11-25T13:00:00Z",
  "maxAgeHours": 168
}
```

Paths resolve relative to the operation request's directory; the example store
is relative to that directory, not implicitly the checkout. Use Windows path
separators when invoking commands. `now` is an explicit synthetic clock, not a
trusted private retention verifier. A managed store's clock cannot move backwards.

```text
<store>\
  collection.json             normalized metadata, provenance, history, cursors
  collection.lock             shared with the importer
  cache\                      inputs, native acquisition directories/checkpoints,
                              config/requests, archive bindings and ledgers
  derived\                    generated private report/graph files
  curated\                    opaque curated records; NEVER purge targets
  curated.json                optional opaque legacy curated file; preserved
```

Create the initial synthetic store using `contacts:collect`. For managed purges,
place every cached input/config/export/adapter artifact inside `cache`, and
derived outputs inside `derived`. Existing demo inputs at the store root must be
relocated and their synthetic request paths updated before a purge; unclassified
root entries fail preflight. There is no recursive removal, arbitrary external
path deletion, automatic backup or trash copy. External original inputs are
**not** erased or certified by this command; do not describe a managed-store
purge as machine-wide deletion.

## Refresh, stale coverage and resync

Add `collectionRequest` containing the existing collection request object to
`refresh`/`resync`; its synthetic output must resolve to the same store. Refresh
uses `resume:true`, preserving the exact period signature and durable page
checkpoint. Resync uses `resume:false`, traversing from the null handoff cursor
without deleting source records or inventing source deletions. Stable source IDs
and explicit revisions preserve replay deduplication and curated independence.
After a managed mutation, direct `contacts:collect` is refused; use operations
refresh/resync to advance and check the retention clock.

An expired/missing handoff cursor returns partial with `recovery: resync`.
Refresh cannot resurrect an expired provider token: explicitly rerun the
synthetic adapter and supply its new immutable handoff. Google retains its
existing bounded 410/full-sync recovery; for Gmail list expiry start a fresh
synthetic scan without `previous`. Native checkpoints never become importer
cursors. A changed text archive still needs explicit reconciliation; resync does
not bypass its binding or revision/overlap gates.

The operations result contains per-source `stale`, `observedOnly`, coverage and
recovery guidance. Default freshness is seven days; partial, failed, unavailable,
missing or future retrieval evidence is always stale, even inside that window.
Previously requested source namespaces omitted from the latest request remain
visible as `not_refreshed`, with null current coverage and separately labeled
`lastKnownCoverage`; an unrelated source refresh cannot hide stale cached history.
Gmail's terminal partial history remains partial. Disconnection is an explicit
`requires_setup` source in the collection request, not deletion of its records
or evidence of zero activity. Reconnect only with separate authorization; no
account/browser/credential route is installed here.

Exit 0 means the requested local operation completed (or sources are current
within their declared scope), 2 means stale/partial/failed source coverage, and 1
means fatal input/storage/lock/privacy/inventory failure. A successful purge or
recovery does **not** mean sources are collected; subsequent status is stale
until an explicit fresh bounded import. `status` never renews retrieval age or
creates work. Freshness fields are a computed operations view, not a rewrite
of historical source coverage; consumers must not treat a bare old manifest as
a current freshness certificate.

## Retention and explicit deletion

`status` marks `retentionRequired` when stored evidence is expired or unaged.
Refresh/resync refuses such metadata until explicit maintenance. The ceiling is
12 UTC calendar months, clamped at leap-day/month-end, with expiry **at** the
cutoff. Event timestamps anchor activity age; original retrieval evidence anchors
identity/thread/member snapshots. Reimport does not renew old evidence.

For either `retain` or `delete`, add:

```json
{
  "confirm": "purge-cached-metadata",
  "artifacts": ["cache\\input.synthetic.json", "cache\\native\\checkpoint.json", "derived\\graph.html"]
}
```

These are fields on the full operation request, not a separate request. Inventory
**every exact file** in cache/derived; omitted existing files fail before mutation.
Only contained, regular files are accepted; no directory, traversal, redirected
path, curated file or arbitrary external path can be an approved artifact.
Known exact `collection.json.<pid>.tmp` remnants are inventoried automatically.
Keep the store local and quiescent; the shared lock coordinates these tools, not
uncooperative external processes changing paths concurrently.

Both commands deliberately purge the **whole metadata cache**, including recent
records, all revisions/source payload evidence, reconciliation copies, orphan
identifiers, source statuses/history, overlap reviews, archive bindings and all
checkpoints. They invalidate/remove every inventoried input and derived file.
`retain` always performs the approved purge, even if not due: this also removes
unaged native cache files whose event age cannot be proved from file mtime.
No curated bytes are read, rewritten or deleted. This is conservative cache
eviction, not selective person/source deletion or secure SSD erasure.

Only a non-identifying maintenance clock/cutoff remains. Retention fences reject
old handoffs/events. Explicit `delete` additionally records `deletedThrough`:
subsequent acquisition retrieval **and** event timestamps must be later than
the deletion instant. A fresh retrieval of an old event cannot restore erased
history; prepare an explicitly bounded fresh synthetic handoff. No ID tombstone
cache is retained indefinitely. This deliberately sacrifices automatic historical
refill, rather than maintaining an indefinite deletion-ID list.

## Interrupted operation recovery

Purge first atomically commits the empty metadata snapshot plus a pending
exact-file inventory, then deletes those files, then atomically clears the
inventory. Import/refresh is blocked while pending. A hard interruption can leave
old artifacts awaiting removal; **do not claim deletion complete**. Run `recover`
to idempotently finish, then inspect `status`. A failed unlink remains visible and
retryable, never success-shaped. No pre-purge snapshot is restored.

After an interrupted collector, `recover` removes only its exact lock after
verifying that its recorded PID no longer exists. A live, malformed or
unverifiable lock fails closed. PID reuse may conservatively require manual
operator investigation. Recovery otherwise preserves committed pages; use the
same refresh request to resume, or explicitly resync if its cursor expired.
Atomic rename/fsync is local-file recovery, not a power-loss/network filesystem
guarantee. No cron/task/job, recurrent timer, sending or source write is created.

## Delegated engineering decisions (not additional owner consent)

| Decision and rationale | Alternatives / assumptions | Validation and revisit |
| --- | --- | --- |
| Operate the shared synthetic handoff route, not a new account integration. Reuse importer IDs, revisions, locks and atomic persistence. | Rejected live connections, credentials, private browser reuse and inferred API availability. Pending converters remain unavailable. | Synthetic refresh, interrupted pagination, cursor expiry, disconnection and replay; existing adapter tests cover native expiry. Revisit only when the corresponding route and real-run controls are independently authorized. |
| Seven-day freshness is a configurable display threshold; incomplete coverage is stale regardless. UTC calendar retention is independent of reporting timezone. | Rejected terminal-cursor freshness, zero-history claims and 365-day approximations. Assumes caller supplies a truthful synthetic clock. | Exact-threshold, leap-day, month-end and original-age cases. Revisit freshness with an authorized source SLA; real clock verification is a separate gate. |
| Evict all cached metadata on approved maintenance, preserving opaque curated files, instead of selective graph surgery. | Conservative loss of recent cache avoids dangling revision/member/provenance IDs, caches of old identifiers and accidentally retained derived copies. External files are outside the managed contract. | Full-copy/cache/temp/history/checkpoint purge, inventory/path failures and unchanged curated bytes. Revisit selective eviction only with complete reference and artifact/age inventories. |
| Retain only time fences, with post-delete activity restricted to newer events and retrievals. | Rejected indefinite identifier tombstones, restoring erased snapshots and a fresh retrieval renewing old events. Assumes explicit local delete means erase all cached history through now. | Old replay and newly retrieved old event rejection, fresh bounded recovery and deduplication. Revisit narrower deletion semantics through owner review, not a privacy-policy inference. |
| Durable pending purge and explicit dead-PID lock recovery, without automatic recurring maintenance. | Rejected rollback that restores erased data, recursive directory removal and silent scheduled cleanup. Local single-user files; no hostile concurrent path mutation guarantee. | Interrupted purge, active lock denial and repeat recovery. Revisit Windows protection/backup enforcement before any private path is enabled. |
