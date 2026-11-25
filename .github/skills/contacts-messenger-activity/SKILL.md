---
name: contacts-messenger-activity
description: Prepare authorized personal Messenger metadata for contacts collection without mistaking business APIs, browser queries or export snapshots for verified live history access.
---

# Personal Messenger activity collection

Use independently or under [contacts-collect](../contacts-collect/SKILL.md).
Follow its authorization boundary and the
[shared contract](../../../docs/spec/contacts-technical-spec.md). Read the
[CONTACTS-017 capability decision](../../../docs/spec/contacts-messenger-capability.md):
the initial route is local `messenger-json-snapshot-v1` conversion in
[CONTACTS-018](../../../docs/spec/contacts-messenger-converter.md).
The converter is synthetic-only, not a verified Meta producer version.

1. Establish the explicitly authorized personal account and requested period.
   Inspect actual installed tools/capabilities. A Page/business conversation API
   is not evidence that personal inboxes or existing friend groups are accessible.
2. No live personal Messenger adapter or private native export processing ships here.
   For invented fixtures only, run `npm run contacts:messenger -- --synthetic-request`
   with a private request path and the declared profile/manifest described in 018.
   It writes an immutable metadata handoff/report, always partial or unsupported.
   An earlier successful Muse browser query does not install a personal-agent API
   or establish full-history access. Do not inherit its private authenticated browser.
   Any new browser/export acquisition needs separate authorization and verification.
   Muse/UI-as-remote-acquisition is not a selected real-data route; never process
   real collected data through remote AI.
3. If an already authorized tool exposes structured metadata, preserve stable
   thread/message/sender IDs, actual event instants, participant membership,
   explicit self identities and direct/group distinctions in `source: messenger`,
   `channel: messenger` handoffs. Name-only exports need reviewed local IDs;
   never silently merge participants by display name.
4. Document source pagination, encryption/linked-device/history limits, actual
   retrieval time and partial/unavailable periods. Narratives, inferred totals
   and search snippets are not timestamped observations.
   Standard JSON exports and encrypted chat backups are distinct formats. The
   synthetic profile covers only declared numbered JSON conversation shards;
   producer version and encrypted-backup layout remain unverified. Reimports of
   one immutable snapshot are stable, but overlapping changed exports need
   reviewed reconciliation, not name/time deduplication or additive import.
   The importer rejects different snapshots/other connectors in the same account
   in either order; do not rename the account to evade that guard.
5. Keep bodies and attachments out of the handoff. Import a valid normalized
   envelope with `contacts:collect`, independently or with the coordinator.

Otherwise return `mode: unavailable`, `requires_setup` for missing authorized access,
or `unsupported` for an unimplemented native format. Do not request session cookies,
credentials or an account connection. Keep group activity separate from direct
exchanges; do not give every group member credit for a sender's one message.
Validate with `npm run test:contacts`, not the user's inbox.
