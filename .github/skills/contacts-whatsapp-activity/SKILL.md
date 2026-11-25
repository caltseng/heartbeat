---
name: contacts-whatsapp-activity
description: Prepare authorized personal WhatsApp metadata with explicit group, linked-device and history coverage limits for private contacts collection.
---

# Personal WhatsApp activity collection

Use independently or under [contacts-collect](../contacts-collect/SKILL.md).
Follow its authorization boundary and the
[shared contract](../../../docs/spec/contacts-technical-spec.md).
The [CONTACTS-019 format gate](../../../docs/spec/contacts-whatsapp-format-gate.md)
selects owner-provided iOS Without Media UTF-8 TXT, design profile
`whatsapp-ios-txt-metadata-v1`. This is a synthetic engineering selection, not
producer certification or real-source authorization. CONTACTS-020's converter
is not implemented; native TXT remains unsupported.

Read the [approved CONTACTS-010 policy](../../../docs/privacy.md).
Only synthetic requests run today; `dataClass: private` fails closed before
handoff reads/output writes, including unavailable-only manifests. No account or
run is authorized by the policy. Real native TXT contains excluded raw content;
do not open it without a separate approved content-processing boundary. A future
converter must deny private runs before native-file reads or registry/output
access. No claimed approval bypasses the current guard.

1. Establish the authorized personal account, interval, time zone and as-of instant.
   Inspect actual installed tools/capabilities. A business API is not evidence of
   access to personal inboxes or existing personal groups.
2. No live WhatsApp connector or native archive parser ships here. Today use
   only synthetic normalized handoffs; any future verified structured tool
   needs separate first-source/account and EACH-run owner approval and verified
   local controls under the approved policy;
   do not pair a device, install Beeper/a bridge, or request credentials.
   Business group APIs do exist, but do not establish personal-group access.
3. Normalize to `source: whatsapp`, `channel: whatsapp`, preserving thread IDs,
   actual sender identities, original timestamps, participant membership, group
   identity and explicit self identities. A native text export may lack stable IDs
   or time-zone information; without a reviewed converter/identity strategy,
   report unsupported instead of fabricating those fields.
   The selected future converter uses private archive-local ordinal IDs and a
   reviewed self/sender/thread/boundary ledger. Exact-byte replay is allowed;
   changed or overlapping exports of the same thread require reconciliation
   before import. Require evidenced source zones/offsets; unresolved DST folds,
   gaps and missing seconds are unsupported, never guessed.
4. Keep existing group conversations separate and preserve one observation per
   actual message. Group membership must not imply pairwise communication.
   Exported senders do not prove historical rosters or delivery recipients;
   retain empty recipients when absent rather than inventing group fan-out.
5. Report linked-device, export, pagination and available-history limits with
   retrieval time. Do not present snapshots as ongoing sync or cursor exhaustion
   as proof of full upstream history. Never use a narrative answer as raw counts.
6. Import a contract-conforming synthetic metadata envelope through `contacts:collect` for
   this source only, or return it to the coordinating skill.

If access is absent, return `mode: unavailable`, `status: requires_setup` and the
specific missing capability. Use `unsupported` for an unimplemented supplied
format (`whatsapp_txt_converter_not_implemented` for the selected TXT).
The approved metadata-only policy does not permit transient raw-content
processing: Without Media is not metadata-only acquisition. Synthetic files may
use ignored `.private/`; future real files require verified storage on this
computer outside Git/cloud sync, Windows-user ACLs and disk encryption, 12-month
deletion and no automatic backups. Never use Muse/remote AI on real collected
data or publish its configuration/manifests. Default native-export
history to unknown; no current numeric export cap or full history is verified.
Collect metadata only; no message bodies, media or private examples in git.
Run `npm run test:contacts` to validate the synthetic collection path.
