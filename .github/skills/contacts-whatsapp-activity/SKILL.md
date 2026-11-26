---
name: contacts-whatsapp-activity
description: Prepare personal WhatsApp TXT snapshot metadata with reviewed sender/time ledgers and immutable replay bindings.
---

# WhatsApp activity

Required: [shared operating rules and source workflow](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules)
and [CONTACTS-019/020 format and operation contract](../../../docs/spec/contacts-whatsapp-format-gate.md#contacts-020-operation).

1. Use the iOS Without Media UTF-8 `whatsapp-ios-txt-metadata-v1` profile:

```powershell
npm run contacts:whatsapp -- --txt <synthetic.txt> --manifest <synthetic-ledger.json> --output <synthetic-store>
```

2. Inspect archive-local ordinal IDs and reviewed self/sender/thread/boundary
   ledgers. Require evidenced zones/offsets; unresolved DST folds, gaps and missing
   seconds are unsupported. No real producer is certified.
3. Normalize `source: whatsapp`, `channel: whatsapp`. Exported senders do not
   prove historical rosters/delivery recipients; retain empty recipients when absent.
4. Preserve registry/immutable acquisition bindings for exact-byte replay.
   Never reset bindings or rename account/thread references to bypass checks.
5. Import the generated request using the shared source workflow. TXT snapshots
   always have unknown coverage and exit 2, even empty inputs. No current numeric
   export cap or full history is verified.
