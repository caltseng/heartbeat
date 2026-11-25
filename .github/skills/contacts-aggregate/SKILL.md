---
name: contacts-aggregate
description: Reduce saved collection and reviewed identity snapshots into deterministic person, thread, channel and daily activity with audit evidence.
---

# Cross-source aggregation

Required: [shared operating rules](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules)
and [aggregation input/output contract](../../../docs/spec/contacts-aggregation.md).

1. Prepare `aggregate.synthetic.json` with `schemaVersion:1`,
   `dataClass:"synthetic"`, `collection`, `mapping`, explicit positive
   `identityMappingRevision`, `period`, optional `channels` and fresh `output`.
   Use the shared [period and exact-input binding rules](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules).
2. Run:

```powershell
npm run contacts:aggregate -- --request .private\contacts\demo-001\aggregate.synthetic.json
```

3. Inspect immutable `aggregates.json`. Reconcile `events`, `audit` and
   `exclusions`: each source event has one disposition. Per-source/account,
   channel, thread and date volumes partition included messages; person/recipient
   attributions do not partition volume.
4. Disclose bulk/automated/unclassified/nonmessage exclusions. Unknown
   classification prevents exact interpersonal totals. Deleted originals remain
   observed with deletion flags; mutations never count again.
5. Direct activity needs event-time direct thread evidence and primary roles;
   CC/BCC and broadcasts are not direct. Shared group dates require self and
   peer posting in the same thread/date. Active days union local dates across
   channels/DST, not channel-day sums.

Hand off the structured dataset, including inactive/unresolved identities and
membership validity, under the shared coverage/context rules. Rendering is separate.
