# Heartbeat local graph (CONTACTS-025)

Implemented: synthetic-only TypeScript `contacts:graph` reads the exact
CONTACTS-024 `report.json` and emits one private local `graph.html` containing
inline SVG maps, person-to-thread diagrams, accessible tables and evidence.
Open it directly in a browser with `file:`; no server, Muse, Main Branch route,
network assets, JavaScript, telemetry, account or deployment is involved.
This proves behavior, not a polished product interface.

## CLI and frozen input

After the [summary workflow](contacts-local-workflow.md#synthetic-summary-handoff),
prepare an ignored local `graph.synthetic.json` next to that summary:

```json
{
  "schemaVersion": 1,
  "dataClass": "synthetic",
  "report": "report.json",
  "reportDigest": "<lowercase SHA-256 of exact report.json bytes>",
  "output": "..\\graph-001"
}
```

```powershell
(Get-FileHash .private\contacts\reports\summary-001\report.json -Algorithm SHA256).Hash.ToLowerInvariant()
npm run contacts:graph -- --request .private\contacts\reports\summary-001\graph.synthetic.json
```

Paths resolve relative to the request. The supplied digest must match the exact
input bytes; unsupported versions/classes or stale digests fail before writes.
Exit 0 preserves the report's complete status; exit 2 saves a partial report
with explicit source/identity/coverage limitations; exit 1 is fatal. Inspect
nonzero exits. Output reuses the collector's safe-path policy and atomic,
no-replace publication; choose a fresh generation rather than overwriting.
Input collection, identity mapping and report remain unchanged. Graph requests,
HTML and staging files are private operational artifacts guarded by CI.

All views read the same frozen report: summary statements, complete people
cohort, channels, calendar timeline, maps and selection evidence. Period, zone,
as-of, channels, mapping revision, collection digest and exact report digest are
visible together. No independent browser filtering recomputes or mixes totals.
Change 7d/30d/custom bounds or channels in a new summary request, then regenerate
the graph from that report. Missing sources retain their original explicit
status/reason, freshness, coverage and unresolved references. Unknown is not zero.

## Explainable visual rules

The user is at the center. Only observed direct communication creates user
spokes. Person circles use stable report-order labels (P1 etc.); the linked
people table and selection expose exact canonical IDs, not guessed names.
Labels are navigation aids, not an identity authority. Thread rectangles are
distinct from people; solid activity and dashed membership edges have a textual
legend and supporting source-event/membership keys.

The metric is **observed direct active local dates / all local dates intersecting
the selected period**, including partial dates, from the shared report calendar:

| Band, inner to outer | Rule |
| --- | --- |
| Frequent direct | At least 50% of dates |
| Regular direct | At least 20%, under 50% |
| Occasional direct | Positive, under 20% |
| Observed group-only | No observed direct dates, positive observed group posts |
| Unknown | No attributed activity and incomplete/uncertain person coverage |
| Inactive in this period | No attributed activity with declared complete person coverage |

These are observed communication bands, **not emotional closeness, importance,
affection or relationship quality**. The three outer categories are not numeric
frequency rankings. Inactive is not proof of neglect; group-only is not proof
that no direct history exists. Positive observations under incomplete coverage
remain lower bounds. Identity `cohortState` is shown separately: an inactive
identity may still have observed activity within the selected historical period.
CC/BCC exposure and group membership are never direct activity.

Node labels show latest attributed activity's UTC month-day (`?` means unknown);
the accessible label includes its full date. Selection gives exact
latest direct and direct/group instants, elapsed days relative to fixed as-of,
sent/received counts, certainty and active dates. This is not the last confirmed
meaningful connection. No historical decline or reconnection signals are inferred.

Thread evidence uses included event attributions only. Membership edges require
a thread with included activity under the same report filters and an interval
overlapping the period; absent validity bounds remain explicitly unspecified.
Unobserved threads are not fabricated or treated as inactive. Membership-only
edges never become participation or peer-to-peer relationships.

Native links work with Tab/Enter, fragment navigation, Back and visible focus;
all selection sections remain available without scripts. On mobile portrait or
landscape the document fits the viewport and maps/tables have independently
scrollable, keyboard-focusable regions. Full-size linked tables are the text
alternative to panning the map; a native center link brings You into view.
At most six people per band per sheet keep nodes
separate; every sheet repeats the centered user and labels, never silently
truncating the cohort.

## Delegated engineering decisions (not privacy consent)

| Decision / rationale | Alternatives / assumptions | Validation / revisit |
| --- | --- | --- |
| Render the pinned shared report, not collection records or newly calculated totals. Require exact report-byte SHA-256. | Reject independently filtered maps and stale cached graph reuse. Assumes the saved summary is the authoritative generation. | Synthetic pipeline tests pin bytes, preserve inputs and exercise 7d/30d/custom/channel changes. Revisit only with a versioned shared interactive-filter contract. |
| Use direct-date proportion with 50%/20% cutoffs, retaining partial dates. Put group-only/unknown/inactive in explicit categorical rings. | Reject message-volume closeness scores and force-layout distance. Thresholds are delegated tuning defaults, not owner-approved relationship tiers; incomplete coverage is not normalized into invented history. | Exact 50%/20%/positive/zero fixtures plus partial/unknown cases. Revisit based on synthetic usability feedback or a specified metric/coverage change. |
| Static HTML with inline SVG, native fragment selection and six nodes per ring per sheet. | Reject hosted dashboards, browser fetches, remote assets, JS frameworks and clipped/overlapping large cohorts. Assumes a browser with standard SVG and fragment support. | Synthetic link/escaping/pagination tests and viewport inspection; revisit for measured large-store size or demonstrated accessibility limitations, without adding hosting. |
| Use canonical IDs and short report-order labels rather than rereading raw display names. | Reject name-based merges and extra source reads. Labels may change between report generations; canonical IDs remain visible. | Same-name synthetic identities remain separate. Revisit only with a reviewed report-level display-label contract. |
| Reuse atomic no-replace local publishing for text; extend private-artifact guards for graph requests/staging. | Reject overwrites, remote exports and a new persistence subsystem. | CLI replay, private denial, output-path and boundary tests. Revisit only with a specified generation/retention contract. |

The [owner-approved CONTACTS-010 policy](../privacy.md) is unchanged. Synthetic
fixtures only; no actual source/account/device/private-browser access, credentials,
pairing, real collection, remote-AI processing, sending or schedules are authorized.
The CLI rejects private requests before input paths/output access and rejects a
private report before rendering. Ignored checkout output is not approved storage
for real private data; existing local-control and separate source/run gates remain.
