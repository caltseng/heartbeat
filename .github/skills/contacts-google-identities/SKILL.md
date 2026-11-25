---
name: contacts-google-identities
description: Prepare Google contact identity snapshots, preserving identity-only coverage and acquisition checkpoint semantics.
---

# Google contact identities

Required: [shared operating rules and source workflow](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules)
and [CONTACTS-011/012 capability and adapter contract](../../../docs/spec/contacts-google-capability.md).

1. Use `npm run contacts:google -- --config <synthetic-config.json>` for selected
   `people.connections.list` fixture pages. Follow its contact-only fields,
   snapshot limits, native pagination and sync/deletion requirements.
2. Normalize `source: google-contacts`, explicit provider/local `idKind` and self
   flags; threads/memberships/events remain empty. Contact presence is not activity.
3. Declare identity-snapshot coverage separately from historical activity:
   today's contacts do not establish who existed in past months. `retrievedAt`
   is acquisition time; cross-page point-in-time consistency is not claimed.
4. Inspect `google-acquisition.json` before importing its immutable handoff.
   Failure deliberately preserves the last-good stale pointer. Never import
   that checkpoint bundle itself or treat importer cursors as Google tokens.

Changes, aliases and tombstones require reconciliation without erasing curated
records; native Google exports have no built-in parser.
