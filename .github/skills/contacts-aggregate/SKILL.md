---
name: contacts-aggregate
description: Independently reduce synthetic local collection snapshots and an explicit reviewed mapping revision into deterministic cross-source person, thread, channel and daily activity with coverage and exclusion evidence. Does not collect or render UI.
---

# Heartbeat cross-source aggregation

Read [the aggregation contract and decisions](../../../docs/spec/contacts-aggregation.md),
[privacy policy](../../../docs/privacy.md), and AGENTS.md. This skill consumes
already saved synthetic CONTACTS-021 collection and CONTACTS-022 identity-review
snapshots. No account/device/browser access, credentials, pairing, installation,
source writes, sending, remote-AI processing of private data, or schedules.
CONTACTS-010 policy approval is not exact source or run authorization. Private
requests/snapshots remain disabled; do not relabel real records synthetic.

## Run independently

1. Select the local synthetic `collection.json` and `identity-review.json`.
   Save/review explicit identity mappings first using `contacts-identity-review`.
   Do not infer identity equivalence from names, addresses or group membership.
2. Prepare an untracked request with `schemaVersion:1`, `dataClass:"synthetic"`,
   `collection`, `mapping`, explicit positive `identityMappingRevision`, `period`,
   and `output`. Paths are relative to the request. See the contract for a
   complete example and optional `channels` filter. Use 7d/30d with IANA zone and
   as-of, or custom offset-bearing start/end with start-inclusive/end-exclusive
   bounds. Do not fetch anything to generate a report.
3. Run:

```powershell
npm run contacts:aggregate -- --request .private\contacts\demo-001\aggregate.synthetic.json
```

The explicit mapping revision must bind the exact collection byte digest; a
stale binding fails rather than silently using latest identities. Re-review a
changed snapshot, or select its original mapping and collection together.
The CLI never modifies either input. It writes one immutable `aggregates.json`
in the chosen output directory; choose a new directory for changed bounds,
filters or revision. Never commit generated requests, configuration, reports,
metadata, identifiers, cursors or histories. `.private/contacts/` is permitted
only for synthetic runs, not approved real-data storage.

## Interpret and hand off

Exit 0 means declared complete filtered coverage; 2 means a saved partial report
with explicit source/identity limits; 1 means fatal failure. Preserve nonzero
exits. Unsupported, auth-limited, failed or unavailable sources are not empty
success. The CLI prints the private report location/status only; inspect the
local structured report without publishing identifiers or manifests.

Use its `events` ledger, `audit` and `exclusions` to reconcile totals. Every
source event has one disposition. Per-source/account, channel, thread and date
volumes partition included interpersonal messages. Person/recipient-role
attributions do not: do not sum them as total volume.

`messages.observed` can be zero while `total` remains null/unknown. Positive
partial observations are lower bounds. Bulk/automated/unclassified and
nonmessage exclusions remain disclosed; unknown classification prevents exact
interpersonal totals. Deleted original messages are retained as observed,
with deletion flags; mutation records never count again.

Direct activity requires event-time direct thread evidence and primary roles.
CC/BCC, multi-recipient broadcast and passive group membership never become
direct exchanges. Group posting counts only actual peer senders. Shared group
dates require self and peer posting in the same thread/date, not merely sharing
a group. Active days union local dates across channels and DST, not channel-day
sums. Do not infer neglect, importance, beliefs or meaningful connections.

Keep coverage, zone, bounds/as-of, filters, collection digest and mapping
revision attached to any downstream output. Preserve unresolved and inactive
identities and original membership validity. Daily/thread rows represent
observed activity only; absent buckets are not known-zero history.
Presentation/graphs remain CONTACTS-024/025; do not build UI here.
