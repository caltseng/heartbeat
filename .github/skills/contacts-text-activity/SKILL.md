---
name: contacts-text-activity
description: Prepare SMS/MMS/RCS/iMessage metadata with explicit protocol, archive identity and device-history limits.
---

# Text activity

Required: [shared operating rules and source workflow](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules),
[CONTACTS-015/016 format and converter contract](../../../docs/spec/contacts-text-messages.md).

1. Select device/account/protocol scope. The XML profile is Android 14 /
   SyncTech SMS Backup & Restore 10.30.009 full XML,
   `synctech-xml-metadata-v1`; RCS/iMessage are unsupported by this profile.
   SMS/MMS need transport evidence because RCS can share XML containers.
2. Follow the converter's `contacts:text-xml` command and explicit manifest,
   transport/SIM/thread ledger. Inspect its generated bundle and collection request.
3. Normalize `source: text-messages` and actual `sms/mms/rcs/imessage` channels.
   XML uses archive-scoped row IDs and reviewed thread ledgers, not provider IDs.
   Preserve distinct threads even when participants match.
4. Disclose device/export range, missing participants and unavailable cloud
   history. Reactions, system events, edits and deletions are not direct messages.
