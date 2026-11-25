---
name: contacts-email-activity
description: Prepare authorized email activity metadata with stable source IDs, recipient roles, pagination and coverage for private contacts collection.
---

# Email activity collection

Use independently or under [contacts-collect](../contacts-collect/SKILL.md).
Follow its authorization boundary and the
[shared contract](../../../docs/spec/contacts-technical-spec.md). No Gmail
HTTP/OAuth adapter or raw mailbox parser ships with this skill.
The [CONTACTS-014 adapter](../../../docs/spec/contacts-email-adapter.md) implements
native Gmail metadata conversion/paging through a synthetic fixture transport.
Run `npm run contacts:email -- --synthetic-request <private-synthetic-request.json>`
for that account-free route; it rejects private runs and does not connect Gmail.
The [CONTACTS-013 capability map](../../../docs/spec/contacts-email-access.md)
selects a proposed Gmail API `gmail.metadata` route for CONTACTS-014, not a
connected account. Its scope disallows search `q`; bounded enumeration is
partial, not complete account history. Do not widen to body-capable scopes.

1. Resolve account, period/time zone/as-of, canonical account namespace and optional
   source checkpoint. Inspect available, already authorized email tools before
   claiming access. Do not acquire credentials or broaden permissions.
2. Retrieve available message/thread metadata, not bodies/snippets/attachments.
   Preserve stable message/thread IDs, actual sender, valid sent timestamp, available
   To/CC/BCC roles and verified self identities. Unknown roles/identities must not
   become assumed direct exchanges; stop normalization if required evidence is absent.
   Hidden BCC and unverified aliases remain unknown; two visible participants
   alone do not prove a direct roster. Missing/invalid sent time is not silently
   replaced by Gmail's receipt/import timestamp.
3. Emit the versioned handoff with `source: email`, `channel: email`.
   Keep multi-recipient/broadcast/group/unknown threads distinct from two-person
   direct threads. One email remains one event, not one event per recipient.
4. Preserve explicit interpersonal/bulk/automated/unclassified classifications.
   The synthetic adapter conservatively classifies metadata evidence; interpersonal
   requires explicit reviewed evidence. Do not silently exclude uncertain mail or
   invent classification evidence. A future reducer will disclose exclusions.
5. Preserve source retrieval times, page cursors and upstream history bounds.
   Cursor exhaustion is not proof of complete history. Record source errors or
   partial coverage, including search/result limits.
6. Import through `contacts:collect` with this source only for an independent refresh,
   or return the handoff to the coordinator. Source checkpoints advance only with
   persisted pages; the helper's handoff cursor is not a Gmail history token.

Without a verified authorized tool or supplied normalized metadata, report
`requires_setup`. Native mailbox exports require a separately implemented converter.
Do not turn a narrative query answer or aggregate estimate into source events.
Reusing a second connector requires reviewed shared upstream IDs/account namespace.
Validate behavior with synthetic fixtures via `npm run test:contacts`.
