---
name: contacts-google-identities
description: Prepare authorized Google contact identity metadata for the contacts collection contract, distinguishing usable snapshots from missing account access.
---

# Google contact identity collection

Use independently for an identity refresh, or under
[contacts-collect](../contacts-collect/SKILL.md). Follow its authorization/private
storage boundary and the [handoff contract](../../../docs/spec/contacts-technical-spec.md).
This is a callable skill and normalized-input workflow with a synthetic-only
People adapter, not an authorized Google connection or OAuth connector.

The [CONTACTS-011 capability record](../../../docs/spec/contacts-google-capability.md)
selects read-only `people.connections.list`, implemented for mocked pages by
CONTACTS-012. Run `npm run contacts:google -- --config <private-config.json>`
only with synthetic fixtures as documented there. No network transport or
credential loader ships; private acquisition is disabled with exit 1
(`private_collection_disabled`) before any output access or artifact writes.
Follow the contact-only fields, source IDs,
snapshot/field limits, pagination and sync/deletion requirements; do not treat
importer cursors as Google tokens. Real runs still require CONTACTS-010 and
separate source authorization. Do not request credentials to close this gate.

1. Establish the data class, reviewed upstream account namespace, private output
   location and snapshot scope. For synthetic work use invented pages; do not
   discover/connect an account, acquire credentials or run login flows.
2. If available, read only needed identity metadata: stable contact/source IDs,
   names, email addresses, phone numbers and source retrieval information.
   Never interpret contact presence as an interaction.
3. Normalize to `source: google-contacts`, with explicit provider/local `idKind`,
   explicit self identity flags, and empty threads/memberships/events arrays.
   Preserve matching evidence as addresses, not an automatic canonical-person merge.
4. Follow all available pages and retain private acquisition cursors. Declare identity-snapshot coverage
   separately from historical activity; a current contact list is not a history of
   which people existed in past months. Never invent upstream completeness.
5. Supply the envelope to `contacts:collect` via a request containing only this
   source for an independent refresh, or return it to the coordinating skill.
   Its `retrievedAt` is the acquisition time, not the import time; no cross-page
   point-in-time consistency is claimed. Use the immutable handoff referenced by
   `google-acquisition.json` only after inspecting its report: on failure that
   pointer deliberately retains the last-good, stale handoff, not a fresh result.
   Never import that checkpoint bundle itself.

If no suitable authorized tool exists, return `mode: unavailable`,
`status: requires_setup`, and the missing capability. An existing normalized
handoff can be imported now; native Google exports and live API fetches do not
have a built-in parser/network transport. Changes, aliases and tombstones remain
private pending reconciliation; inspect partial reports, never erase curated
records or synthesize activity. Do not fabricate contacts, tokens or access.
Conflicting IDs/metadata require review; names alone cannot reconcile people.
Use `npm run test:contacts` for synthetic checks, not a real-account trial.
