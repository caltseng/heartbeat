# Heartbeat source revisions and overlap reconciliation

CONTACTS-021 implements additive schema-v1 handoff/store fields in the existing
local collector. These are delegated engineering decisions (2026-11-24), **not
owner-approved privacy policy or permission for source/account access**. Only
synthetic fixtures have been exercised. CONTACTS-010 and separate source/run
authorization still gate real data. There is no network acquisition, source
write, sending, scheduling, canonical person merge, numerical reducer or renderer.
Requests, reviews, handoffs, snapshots and generated outputs remain private.
The [owner-approved CONTACTS-010 policy](../privacy.md) remains authoritative:
private collection is disabled before handoff/output access, and synthetic
display/title fields here do not expand the approved real-data metadata set.

## Revisions and immutable evidence

Identities, threads and events optionally accept
`revision: {"id":"source-version-2","supersedes":"source-version-1"}`.
The first explicit revision uses `supersedes:null`; legacy records without a
revision are named `$initial`. To revise a legacy observation, supersede
`$initial`. Revision IDs are scoped to the namespaced record key, not ordered
lexically or by retrieval time. A predecessor must already exist in the store or
earlier in this page. Replaying a revision is idempotent. Reusing an ID with
different metadata/predecessors fails the page without advancing its checkpoint.
Changed legacy records still fail rather than silently becoming updates.

`records[key].record` always retains the first imported metadata.
`records[key].revisions` contains immutable version metadata and version-specific
provenance; `records[key].provenance` retains all distinct source locators. Each new
locator includes original source ID, allowlisted original `sourceRecord`, connector,
input SHA-256, page cursor and retrieval instant. Event provenance also pins the
observed thread revision/kind, so a current thread rename/reclassification must not
be mistaken for historical thread evidence. Older snapshots are read additively;
their old provenance is retained, not retroactively fabricated.

Use `reconciliation.records`, **not the original `records[key].record`**, to read
the unique current version. Two children of the same predecessor, or separate
roots, are unresolved branches, not last-write-wins. They appear in
`reconciliation.collisions` and are excluded from that current view. An explicit
resolution can supersede both:
`revision: {"id":"reviewed-3","supersedes":["version-2a","version-2b"]}`.
This keeps both conflicting observations and the resolution's evidence.
`manifest.reconciliationRequired` makes the overall manifest partial (exit 2)
while any revision collision or broken mutation target link remains. Consumers
must honor this flag and must not claim reconciled totals from such a store.
Absent historical targets are informational `pendingTargets`, not broken links,
and do not prevent complete collection of an otherwise covered period/source.

Identity and thread tombstones use `deleted:true` on an explicit revision, with
the normal identity/thread required fields. They never erase source history,
memberships, events, or separately curated records. A later explicit revision may
record `deleted:false`; source deletion is not local secure erasure or retention
policy. Curated records are outside this item's implementation.

## Edits and deletions

Edit/deletion events keep their own event ID and require `targetId`, the original
message ID in the same source/account namespace. Their normal timestamp is the
mutation instant, not a replacement of the original message time. Translation
applies to targets as well as event, thread, sender and recipient references.
Targets may arrive later: targets absent from the store appear in
`reconciliation.pendingTargets` without setting `reconciliationRequired`. An
export may legitimately mutate a historical message outside the imported period;
this must not permanently make unrelated sources/periods partial. Pending links
resolve automatically if their target arrives. Present but conflicting,
non-message, wrong-thread/channel or chronologically impossible targets stay in
`reconciliation.unresolvedTargets` and still require reconciliation.
Legacy untargeted edits/deletions are retained but likewise unresolved.

The current message exposes `editedBy` and `deletedBy` key arrays. It remains one
source message; mutation events are never additional messages. An edit does not
overwrite the original event, guess content, or move its timestamp. Corrections
to allowlisted message metadata require an explicit message revision. The later
reducer must define/disclose deleted-message inclusion and count only unique
message keys, not mutation events or revisions.

## Historical membership and per-thread coverage

Memberships optionally include `validFrom` and `validUntil` (offset ISO instants
or null for an open bound), with half-open validity. Distinct intervals are
separate immutable observations. Event-time direct-thread validation uses those
intervals; joining later does not manufacture an earlier direct interaction.
Group membership never creates pairwise messages. Legacy memberships without
bounds remain accepted for compatibility but cannot establish a historical
roster. Conflicting/overlapping roster claims must not be silently interpreted as
a reviewed historical roster; direct validation still requires exactly two
eligible members including exactly one self identity.

Pages optionally provide:

```json
{
  "threadCoverage": [
    {
      "threadId": "thread-1",
      "start": "2026-11-01T00:00:00Z",
      "end": "2026-11-24T20:00:00Z",
      "completeness": "complete",
      "basis": "Synthetic bounded history."
    },
    {
      "threadId": "thread-2",
      "start": null,
      "end": null,
      "completeness": "unknown",
      "basis": "Synthetic unavailable thread history."
    }
  ]
}
```

These are append-only `threadCoverage` evidence records with connector/digest/page
provenance, not message events. Source reports expose the current handoff's
`threadCoverage` and `threadCoverageMode`. Once explicit per-thread evidence
exists for a connector, all its known threads need complete current-handoff
coverage containing the requested period, ending no later than retrieval.
Missing, partial, unknown or contradictory current thread claims keep the source
partial even if source-wide coverage says complete. Old evidence remains stored;
it cannot fill a current handoff's missing thread history. Source-wide unknown
coverage, unfinished pagination and upstream errors still prevent completeness.
Legacy handoffs that never supplied thread evidence explicitly report
`inherited-source-declaration`; this preserves the original source-wide contract,
not independent proof of thread enumeration or upstream completeness.

## Reviewed connector translations

Before importing a connector with different IDs for the same underlying records,
put an explicit review in the private request:

```json
{
  "overlapReview": {
    "revision": "synthetic-overlap-1",
    "reviewedAt": "2026-11-24T20:00:00Z",
    "basis": "Synthetic exact upstream identifiers reviewed locally.",
    "mappings": [
      {
        "source": "email",
        "account": "fixture-account",
        "connector": "second-export",
        "type": "event",
        "id": "export-message-9",
        "targetId": "message-1"
      }
    ]
  }
}
```

Supply separate `identity`, `thread` and `event` mappings as necessary.
Mappings stay within one source/account/type and apply only to the named
connector. No name, address similarity, text, timestamp or household inference
creates a mapping. The mapped records must still agree on metadata/revision or
fail visibly. Import canonical target evidence first (or earlier in the same
page); a missing target fails explicitly. Reviewed local/provider ID-kind
differences normalize to the existing canonical target's kind, while both
original kinds remain in source evidence. Both connectors' original IDs and metadata survive in provenance;
membership and target references use the translated keys, avoiding duplicate
messages or duplicated roster members.

`overlapReviews` is an immutable audit log. Saved translations continue to apply
on later requests even when the request omits the review. Review IDs cannot be
rewritten; mappings cannot be retargeted, chained or cycled. If an alias was
already imported as a separate record, the importer refuses retroactive
translation rather than silently collapsing history. Keep that store and replay
authorized handoffs into a fresh private store with the corrected review.
Different unreviewed IDs remain distinct observations, not proof of distinct
messages; see the manifest limitation. No cross-connector total is certified
until the relevant overlap review is complete.

The [synthetic text converter's archive binding](contacts-text-converter.md)
remains an independent gate. A review does not permit a changed/overlapping
archive, ledger replacement, or connector switch on a bound text account.
Pre-existing unbound text event keys still prevent initial archive binding,
including events with explicit revisions. Binding is persisted only after a
valid page commits; rejected pages cannot reserve an archive. This integration
preserves the Google/Gmail adapters, source-specific Messenger/WhatsApp gates,
and synthetic-only acquisition policy; it does not automatically connect their
staged revision/deletion formats to this shared revision contract.

## Delegated decision record

| Decision / rationale | Alternatives and assumptions | Synthetic validation | Revisit condition |
| --- | --- | --- | --- |
| Additive schema-v1 revision DAG and separate current projection preserve old consumers' raw evidence without destructive replacement. | Rejected last-retrieved-wins and in-place updates; assumes stable source revision IDs or deliberately assigned local revision IDs. | Changing profile/thread/message, replay, fork and explicit multi-head resolution; original records unchanged. | An adapter cannot supply stable revision ancestry or a versioned downstream consumer needs stricter schema migration. |
| Target links and tombstone flags retain evidence; absent historical targets are informational pending links, while broken present targets block reconciled output. | Rejected replacing/deleting originals, counting mutations as messages, or making every later period partial until out-of-window history is imported; assumes metadata-only events. | Targeted edit/deletion, pending target/later arrival, unrelated-source and later-period success, broken links, profile tombstone, rejected untargeted mutation. | CONTACTS-023 defines deleted-message metrics or CONTACTS-032 implements owner-approved retention. |
| Explicit thread evidence is conservative and current-handoff scoped; legacy coverage is labeled inherited. | Rejected upgrading partial threads using a source-wide complete claim; assumes the adapter declares its actual history bounds. | Different/missing/empty thread coverage and later full coverage. | A real adapter needs interval unions, thread enumeration certificates, or source-native resync generations. |
| Membership intervals are append-only observations and never inferred interactions. | Rejected replacing a current roster and applying it backward; assumes explicit validity evidence when historical membership is claimed. | Earlier/later direct members and retained group roster evidence without new activity. | An adapter needs reviewed correction/retraction of conflicting membership intervals. |
| Private reviewed translations are immutable, connector-specific and applied before import. | Rejected heuristic fuzzy deduplication and retroactive destructive merging; assumes review establishes exact same upstream records/account. | Two different-ID connectors yield one message with both originals; replay cannot forget saved translations; changed review rejected. | A reversible in-store translation review UI or already-imported alias migration is separately specified. |

These defaults are available for owner review, not claims of owner-approved
privacy/access policy. Run `npm run ci` through the configured checks environment;
the tests use temporary synthetic files only.
