---
name: contacts-email-activity
description: Prepare email metadata with Gmail-specific recipient roles, classification evidence and pagination limits.
---

# Email activity

Required: [shared operating rules and source workflow](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules),
[CONTACTS-013 access map](../../../docs/spec/contacts-email-access.md) and
[CONTACTS-014 adapter](../../../docs/spec/contacts-email-adapter.md).

1. Run `npm run contacts:email -- --synthetic-request <request.json>` for the
   Gmail fixture transport. The selected `gmail.metadata` route excludes search
   `q`; do not widen to body-capable scopes.
2. Emit `source: email`, `channel: email` with actual To/CC/BCC roles. Hidden
   BCC/unverified aliases stay unknown; two visible participants do not prove a
   direct roster. Missing sent time cannot become receipt/import time.
3. Preserve interpersonal/bulk/automated/unclassified classifications.
   Interpersonal classification requires explicit reviewed evidence; disclose
   uncertain mail rather than silently excluding it.
4. Keep multi-recipient/broadcast/group/unknown threads distinct. The handoff
   cursor is not a Gmail history token; bounded enumeration remains partial.

Native mailbox exports require a separate converter.
