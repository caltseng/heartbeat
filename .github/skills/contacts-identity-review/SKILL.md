---
name: contacts-identity-review
description: Persist explicit canonical-person matches, reversible splits and curated households in an independent local overlay.
---

# Identity review

Required: [shared operating rules](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules)
and [review operations and decisions](../../../docs/spec/contacts-identity-review.md).

1. Select a current collector snapshot. Prepare a request:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "collection.json",
  "output": ".",
  "expectedRevision": 0,
  "reason": "Register identities separately; no matches approved.",
  "operations": []
}
```

2. Inspect, then copy `revision` into `expectedRevision` and `collectionDigest`
   into the request before applying:

```powershell
npm run contacts:review -- --inspect .private\contacts\demo-001\review.synthetic.json
npm run contacts:review -- --request .private\contacts\demo-001\review.synthetic.json
```

3. Reinspect before each mutation and use exact returned keys/IDs. Empty
   operations register identities separately. Review `changedIdentityKeys` and
   explicitly `refresh` current metadata; refresh is not match approval.
4. Merge only with reviewed email/international-phone/provider evidence
   connecting every selected person. Shared addresses still require judgment;
   self/non-self cannot merge. Keep inactive tombstone/collision/missing links.
5. Split explicit subsets or reactivate an original alias, retaining at least one
   original identity. Do not copy households or redistribute notes. Resolve
   conflicting households explicitly; only `household` operations set membership.
6. Undo only the current revision with a sole `undo`; older mistakes need splits.
   Reinspect uncertain writes before retrying; never hand-edit `identity-review.json`.

Report mapping path/revision/digest, explicit changes and ambiguous note attribution.
Original note references remain stable aliases; partial splits leave combined-person
notes untouched for explicit curation. Collection's `identityMappingRevision`
remains null because review never rewrites its manifest.
