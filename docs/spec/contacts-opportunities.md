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

## Delegated engineering decisions (owner review)

| Decision and rationale | Alternatives and assumptions | Validation and revisit condition |
| --- | --- | --- |
| Compare one adjacent equal elapsed window against its predecessor using the existing reducer. This is explainable without fitting a model or mixing coverage. | Rejected population ranks, inferred relationship tiers and opaque rolling scores. Assumes declared metadata coverage is accurate, not independently verified. Equal calendar-month windows/DST periods with unequal elapsed duration fail rather than silently comparing them. | Synthetic exact endpoints, insufficient windows and mismatched zones/durations; revisit normalization or multiple historical windows only with explicit semantics and tests. |
| Propose 28-day minimum windows, >=8 baseline direct messages across >=4 local dates, and <=0.5 ratio. Expose all values in report context. | Lower counts/one-day bursts are too unstable for an initial useful baseline; no universal statistical significance or social recommendation is claimed. | Boundary cases exercise each threshold, exact 0.5 and just above it, including group-only/no-history people. Revisit based on owner review of synthetic behavior before any policy-gated real evaluation. |
| Require complete global evidence and represented selected channels in both windows. Conservative suppression is preferable to false decline. | Rejected comparing only surviving channels, silently treating missing as zero and promoting a person's source subset while unrelated unresolved evidence remains. Assumes both windows come from the same exact snapshot and mapping. | Partial/unknown, asymmetric coverage, unavailable/auth-limited and absent selected-channel cases suppress decline; revisit narrower per-person eligibility only with independently verified identity/source coverage. |
| Keep curated due rhythms separate; use civil-date arithmetic in the report zone and explicit occurred/captured bounds. Current saved preferences apply. | Rejected observed-message resets, elapsed-24h rhythm days, fabricated first-contact dates and a combined priority score. Assumes user-entered interval days are civil-day preferences. | Distinct household intervals, exact due date, unknown/unset, DST and future/late-captured connections; revisit month-based rhythms or historical preference reconstruction as separate schema work. |
| Emit one private immutable JSON report with input digests and evidence ledgers, not a new store or UI stack. Read curated data via its existing validated inspection. | Rejected duplicate collectors, hand-parsed curated schemas, public rendering and automatic actions. Digests bind content, not authenticity. | Actual CLI 0/2/1, private denial before reads, unsafe paths, unchanged inputs and retry immutability; revisit visualization only in the local graph contract. |
