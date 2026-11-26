# Heartbeat reconnection opportunities

CONTACTS-026 implements `contacts:opportunities`, a user-invoked synthetic-only
local report. It reuses the same CONTACTS-023 reducer as CONTACTS-024 and reads
CONTACTS-027's curated records through its existing read-only inspection. No
collection, identity, household, notes or connection dates are changed.
This implements signals, not CONTACTS-025's graph or CONTACTS-028's weekly plan.

## Invocation

Prepare an untracked `opportunities.synthetic.json`, after synthetic collection,
identity review and optional curation:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "collection": "collection.json",
  "mapping": "..\\reviewed",
  "curated": "..\\curated",
  "identityMappingRevision": 2,
  "baselinePeriod": {
    "preset": "custom",
    "timeZone": "UTC",
    "start": "2027-01-01T00:00:00Z",
    "end": "2027-01-29T00:00:00Z",
    "asOf": "2027-02-26T00:00:00Z"
  },
  "currentPeriod": {
    "preset": "custom",
    "timeZone": "UTC",
    "start": "2027-01-29T00:00:00Z",
    "end": "2027-02-26T00:00:00Z",
    "asOf": "2027-02-26T00:00:00Z"
  },
  "channels": ["email"],
  "output": "..\\reports\\opportunities-001"
}
```

```powershell
npm run contacts:opportunities -- --request .private\contacts\demo-001\opportunities.synthetic.json
```

Paths resolve relative to the request. Unlike summary's file path, `mapping`
is the **directory** containing `identity-review.json`, matching curation.
The explicit revision must be the current saved mapping revision and bind the
exact collection byte digest. `curated` names its directory; a missing store
uses the existing curation inspection's explicit revision-0 empty state, without
creating it. No rhythm or connection date is invented. Existing malformed,
private or incompatible stores fail, rather than silently becoming empty.
Omitted channels selects the reducer's entire channel set; unrepresented selected
channels are unknown, not zero. Select only the intended comparison scope and
declare desired unavailable sources in collection; do not filter to disguise gaps.

## Report and interpretation

The immutable `report.json` heading is **Heartbeat reconnection opportunities**.
Its context binds exact collection bytes, current mapping revision, curated
revision/digest, both resolved half-open periods, zone/as-of, filters, source
statuses/reasons/freshness/coverage, per-source/channel bounds, reconciliation,
unresolved identities/references, limitations and the actual tuning proposal.
`evidence.baseline/current` preserve the reducer's event ledger, exclusions and
audit for tracing counts to original source keys.

`people` retains every reviewed non-self person, including inactive, group-only
and no-observation people. Each row has baseline/current direct-message bounded
counts, active days, last observed direct contact, last observed direct-or-group
activity, ratio, coverage/suppression reasons and a textual explanation.
Last-observed timestamps use retained history **before current end**, including
events older than the baseline, not a fictional complete-history claim.
Identity-only presence, group membership, group posts and CC/BCC/addressing alone
cannot generate direct contact or a decline baseline.

A `covered_direct_decline` requires adjacent, equal **elapsed-duration** windows
with the same zone and as-of; at least 28 elapsed days in each window; at least
8 baseline direct messages on at least 4 local dates; and current/baseline direct
message ratio <= 0.5. These are explicit engineering **tuning proposals**, not
validated social norms or relationship quality. Invalid/mismatched periods fail;
short windows and insufficient personal baselines produce explained suppression.
Zero current observations may signal decline only with all these gates met.
Every requested source must be complete and every selected channel represented
with exact coverage in both windows. Unknown, unavailable, auth-limited, partial,
unclassified, conflicted or unresolved evidence suppresses decline rather than
turning a disconnected channel into a drop. Both periods use one snapshot,
mapping and channel scope; we never compare independent unmatched reports.

`rhythms` is a separate household list: selected interval and preference reason,
explicit member IDs, last confirmed connection, supporting connection IDs,
elapsed civil days, due date/state, last observed direct activity and explanation.
Only explicitly saved connections with occurred date no later than the local
as-of date and capture instant no later than as-of are eligible. Observed
email/messages/group attendance never reset this clock. Due includes the exact
due date; no known connection means `unknown`, null interval means `unset`.
Current saved household membership/preferences are not a historical as-of
reconstruction. No notes/content are copied into the report.

Rows retain stable canonical/household ordering, not priority/frequency ordering.
No importance score, guilt/neglect ranking, population comparison, automatic
sending, meaningful-date reset, source access or recurring job is implemented.

## Persistence, errors and privacy

Use fresh ignored `.private\contacts\` output or an external local synthetic
folder. The existing output guard, immutable flush/hard-link publication and
temporary-file cleanup are reused; an existing report/symlink is never replaced.
`report.json`, its temporary files and named opportunities requests are reserved
by the private Git boundary. No tracked output, accounts, credentials, device/
private-browser access, external service, hosting or backend is needed.

Exit **0** means complete declared evidence, **2** a usable report with uncertain
coverage/source/identity evidence, and **1** fatal input/binding/storage failure.
An insufficient baseline is explained in the report, not a source failure.
Private requests fail before input/output access; private snapshots fail before
mapping reads. All private processing remains disabled under CONTACTS-010.
Delegated engineering decisions below do not change owner-approved privacy policy
or authorize a real source/account/run, notes, remote AI, sending or schedules.

Engineering rationale, alternatives and revisit conditions: [CONTACTS-026](../decisions.md#contacts-026).
