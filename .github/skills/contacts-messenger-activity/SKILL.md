---
name: contacts-messenger-activity
description: Prepare personal Messenger snapshot metadata with explicit shard, producer-version and overlap limits.
---

# Messenger activity

Required: [shared operating rules and source workflow](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules),
[CONTACTS-017 capability decision](../../../docs/spec/contacts-messenger-capability.md)
and [CONTACTS-018 converter](../../../docs/spec/contacts-messenger-converter.md).

1. Run `npm run contacts:messenger -- --synthetic-request <request.json>` with
   the declared `messenger-json-snapshot-v1` manifest. It writes immutable
   metadata handoff/report files, always partial or unsupported.
2. Normalize `source: messenger`, `channel: messenger`. Name-only exports need
   reviewed local IDs under the converter contract.
3. Distinguish numbered JSON conversation shards from encrypted chat backups.
   Actual producer version and encrypted-backup layout remain unverified;
   disclose encryption/linked-device/history limits.
4. The importer rejects different snapshots/other
   connectors in the same account in either order; never rename the account to
   evade that guard.
