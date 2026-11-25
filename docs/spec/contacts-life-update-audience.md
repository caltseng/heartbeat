# Heartbeat life-update audience review (CONTACTS-030)

Status: implemented, synthetic only. A user-invoked local TypeScript CLI
resolves explicitly selected canonical households to individual email candidates.
It preserves inclusion/exclusion reasons and explicit wording preferences and
produces only a reviewed recipient list. There is no sending, scheduling, campaign
enrollment, donation record, network transport or account access.

This is delegated engineering under the 2026-11-24 decision delegation, **not
owner-approved privacy policy or permission to process real contacts/content**.
The [CONTACTS-010 policy](../privacy.md), exact-source authorization, each-run
approval and enforceable local controls remain separate gates. Real audience
content/wording needs its own approved boundary; private requests are disabled
before resolving collection, mapping, curation or output paths. Never label real
people or preferences synthetic. No credential, device or private browser is used.

## Local workflow and request

Use the existing synthetic collection and [canonical household review](contacts-identity-review.md).
The [curated store](contacts-curated-records.md) is read-only here: only its
canonical mapping, revision and source limitations participate; original notes,
groups, rhythms and connection context never become audience reasons or wording.
Households are not inferred from messaging threads or names.

Keep requests, CLI stdout and the generated `audience.json` outside tracked/public
paths. A synthetic example may live in ignored `.private\contacts\`; that is not
approved real-data storage. Paths resolve relative to the request file. Use a
separate output directory for each update, distinct from the metadata cache,
mapping and curation directories.

Prepare `.private\contacts\audience.synthetic.json`:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "demo-031\\collection.json",
  "mapping": "reviewed",
  "curated": "curated",
  "output": "audiences\\synthetic-update-001"
}
```

```powershell
npm run contacts:audience -- --inspect .private\contacts\audience.synthetic.json
```

Inspection never creates output. Copy the returned `revision` to
`expectedRevision` and its `inputsDigest` unchanged into the request. Add a
nonempty `reason` and an `audience` value with this shape (replace illustrative
IDs/address only with the inspected **synthetic** canonical values):

```json
{
  "purpose": "Share a synthetic move update",
  "households": [
    {
      "householdId": "household-example",
      "included": true,
      "reason": "Explicit synthetic request to keep this household updated",
      "wording": {
        "text": "Use the explicitly requested neutral version",
        "reason": "Synthetic direct wording preference, not inferred beliefs"
      }
    }
  ],
  "recipients": [
    {
      "householdId": "household-example",
      "personId": "person-example",
      "included": true,
      "reason": "Explicit synthetic individual selection",
      "address": "example@example.invalid",
      "wording": null
    }
  ]
}
```

```powershell
npm run contacts:audience -- --request .private\contacts\audience.synthetic.json
npm run contacts:audience -- --inspect .private\contacts\audience.synthetic.json
```

`--request` saves the **whole replacement audience**, not a partial patch. Add or
remove households and edit individual overrides; omitted individual overrides
inherit the household's include/exclude choice and reason. Every selection,
including an exclusion, needs a nonempty explicit reason. A person override must
refer to a current member of one selected household. An explicitly included
individual may override an excluded household. Empty households remain visible.
New members appear as candidates but are never assigned an email automatically.

`wording` is either `null` (unset/inherit) or exact user-recorded `{text, reason}`.
A non-null individual preference overrides the household preference. Included
recipients need an explicit effective preference, even if it is simply neutral.
Christian/non-Christian variants may be requested explicitly; there is no beliefs
field, automatic religious classification, content inference or generated draft.
Preferences and reasons retain their original text.

`address` is `null` or one exact current source-email option, compared
case-insensitively. Even a sole address requires explicit selection. Multiple
options remain visible after choosing one; invalid source addresses are visible
but are never options. Missing addresses require exclusion or a separately
reviewed synthetic source/mapping correction, not an invented mailbox. Each
option retains the namespaced identity keys from which it came.

Inspect the saved candidates, issue codes, reasons, preferences and all source
limitations. Resolve included missing/ambiguous/stale addresses and missing
preferences. Duplicate options across people remain visible even for exclusions;
two included people cannot select the same mailbox. Choose different current
addresses or explicitly exclude a duplicate recipient; never silently merge
people or discard reasons/preferences. No provider-specific plus/dot alias
rewriting or mailbox ownership claim is made.
Duplicate-recipient blocking compares selected mailboxes only, not every possible
address or all identities of two people; shared unselected options remain visible
as non-blocking `duplicate_address_option` issues.

For final review, **remove `audience` from the request**, refresh
`expectedRevision` and `inputsDigest` from the saved inspection, and provide a
reason recording the explicit review:

```powershell
npm run contacts:audience -- --finalize .private\contacts\audience.synthetic.json
```

Only this separate action exposes `finalRecipients`. It accepts no simultaneous
edits. The local JSON snapshot preserves the reviewed audience, revision, review
time/reason, input digest and revision history; subsequent `--inspect` reproduces
the list while inputs remain unchanged. The result is a local review report/list,
not an email payload. All sending is manual and outside this tool.

## Binding, issues and recovery

The input digest pins collection bytes, canonical mapping digest/revision and
curated-store revision. Every mutation requires that digest and the current
audience revision. Any edit clears the review; any input change withholds the
old final list (`reviewStale: true`) until another explicit final review.
Changed or inactive identities, removed/merged household members, missing
households and reconciliation gaps cannot be finalized. Old selections remain
visible instead of being silently retargeted to a merged person or new mailbox.
Edit stale overrides explicitly after canonical identity review.

Source states, collision/unresolved/pending links and source coverage/errors
travel with the report. An unavailable/auth-limited source is never treated as
an empty success. Independent source incompleteness does not prevent reviewing
known, explicitly selected recipients, but the result retains exit 2 and its
limitations. Reconciliation gaps block final review. No completeness or
deliverability of an email address is claimed.

Exit **0** means an explicitly reviewed list with no reported source limitation;
**2** means draft/unreviewed/stale or partial sources (possibly a reviewed list,
so inspect both `reviewed` and `sources`); **1** means fatal validation, unresolved
finalization, private denial, stale precondition, lock or storage error.
Failed finalization/edits preserve the prior snapshot. Atomic writes reuse the
shared JSON persistence helper and a separate `audience.lock`; after interruption,
verify the writer stopped before removing only that exact lock/temp file.
Never put this curated audience directory in an operations purge inventory;
managed-cache deletion will invalidate its collection binding, not authorize
deleting original audience choices.

## Delegated decision record

| Decision and rationale | Alternatives and assumptions | Validation and revisit condition |
| --- | --- | --- |
| One versioned local JSON audience per update, whole-document editing plus separate finalization. This is the smallest inspectable household-to-person CLI without another UI/backend. | Rejected a hosted editor and campaign system. Assumes one local operator; history records each explicit edit/review. No note-derived suggestions are needed for this slice. | Synthetic household expansion, individual additions/exclusions, rollback, CLI and restart inspection. Revisit only if incremental editing becomes necessary, without adding sending. |
| Inclusion defaults come only from an explicitly selected household; individual overrides and every reason are explicit. Wording is recorded text plus rationale, inherited only from that explicit household preference. | Rejected frequency/group/belief-based audience scoring and inferred religious labels. `null` remains unknown, not neutral. Notes remain read-only and unexposed. | Synthetic unset/household/individual wording, unchanged notes/source files, unsupported fields and edit invalidation. Revisit inheritance only for an explicitly specified conflict policy. |
| Require an explicit current address choice; lowercase the entire mailbox conservatively for duplicate prevention, with no plus/dot folding. Block duplicate selected mailboxes rather than choosing an owner or wording. | Retaining case-sensitive local parts risks common duplicate recipients; unusual case-distinct mailboxes may need separate handling. Excluded/multiple/invalid options remain inspectable. No arbitrary manual mailbox or email validation service is added. | Synthetic missing/invalid/multiple/case-variant duplicate addresses, exclusions, stale address/source changes and header-injection rejection. Revisit only with a reviewed mailbox-identity contract. |
| Bind every mutation and final review to exact inputs and audience revision; source partiality stays explicit with exit 2. Identity uncertainty blocks finalization, unrelated unavailable sources do not fabricate empty history. | Rejected implicit re-finalization after collection/mapping changes and denying all known-recipient review solely because another source is unavailable. Assumes reported source limitations are reviewed alongside recipients. | Synthetic stale revisions/inputs, changed/inactive/self identities, household changes, reconciliation gaps and unavailable sources. Revisit only for a stricter owner-approved audience gate. |
| Keep private content disabled with no authorization switch. The metadata-only CONTACTS-010 policy is not permission to process real wording/preferences. | Rejected claimed consent booleans and implicit private account access. This item grants no additional policy approval. | Private denial precedes path reads/writes; unsafe output and private artifact guard cases. Revisit only after explicit content/source/run authorization and verified local controls. |
