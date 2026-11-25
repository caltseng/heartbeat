---
name: contacts-collect
description: Coordinate focused contacts source workflows and import metadata into a resumable cross-source snapshot with explicit coverage.
---

# Contacts collection

Required: [shared operating rules](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules),
[request and handoff contract](../../../docs/spec/contacts-technical-spec.md),
[product scope](../../../docs/spec/contacts-store-spec.md) and
[work register](../../../docs/spec/contacts-work-items.md).

1. Establish requested source/account references, period, zone/as-of, output and
   checkpoint/resume choice. Compose [Google](../contacts-google-identities/SKILL.md),
   [email](../contacts-email-activity/SKILL.md), [text](../contacts-text-activity/SKILL.md),
   [Messenger](../contacts-messenger-activity/SKILL.md) and
   [WhatsApp](../contacts-whatsapp-activity/SKILL.md) as requested.
2. For a fresh account-free demo:

```powershell
npm run contacts:collect -- --demo --output .private\contacts\demo-001
```

For prepared input:

```powershell
npm run contacts:collect -- --request .private\contacts\run-001\request.json
```

3. Inspect the atomically saved `collection.json`: manifest, records, provenance
   and checkpoints. Use [reconciled current records](../../../docs/spec/contacts-source-revisions.md),
   not immutable first observations, for current totals. Inspect collisions and
   unresolved targets; informational `pendingTargets` resolve when originals
   arrive without alone making otherwise covered periods partial.
4. Verify replay idempotency without resume, or resume the exact resolved interval
   using the saved next page. Changed bounds require fresh traversal. Never
   hand-edit records/checkpoints.
5. Report output path, requested/resolved interval, per-source freshness/status/
   coverage, unresolved identities and missing access/format capabilities.

For managed stores, use `npm run contacts:operate -- --request <operation.synthetic.json>`
instead of direct collection. Follow [operations](../../../docs/spec/contacts-source-operations.md)
for refresh/resync, stale coverage, inventoried retention/deletion and recovery:
preserve opaque curated files, finish interrupted purges before import and never
restore erased history from old inputs.

Identity review, aggregation and rendering are separate stages.
