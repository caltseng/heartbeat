---
name: contacts-summary
description: Present a saved period dataset as a grounded summary, people table, channel counts and timeline with exact input context.
---

# Period summary

Required: [shared operating rules](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules)
and [reporting contract](../../../docs/spec/contacts-period-summary.md).

1. Save `summary.synthetic.json` with `schemaVersion:1`,
   `dataClass:"synthetic"`, `collection`, `mapping`, `identityMappingRevision`,
   `period`, optional `channels` and fresh `output`. Follow the shared period/
   binding rules.
2. Run:

```powershell
npm run contacts:summary -- --request .private\contacts\demo-001\summary.synthetic.json
```

3. Read saved `report.json` once; use `views` for every presentation. Lead with
   **Heartbeat period summary** and copy `views.summary.statements`. Additional
   prose may explain limitations, not calculate totals, percentages, ranks,
   trends, scores, recency thresholds or comparisons.
4. Present `views.peopleTable`: canonical `personId`, `cohortState`, observed
   direct/sent/received counts, group posts/group-only label, active days, latest
   activity and `perChannel`. Preserve every cohort row and alias reference.
5. Use `views.perChannel` and `views.timeline`, not reconstructed raw records.
   Keep empty dates, unknown channels and `partialDay` clipped-date markers.
   Plot observed values as observed without smoothing missing history.
6. Preserve full `context` with every view. `selectView(report, name)` supplies
   the envelope/common report digest for standalone tables/timelines.
   Label excerpts and link the same local dataset; never silently hide people/
   sources or publish context-free rows/screenshots/charts.

This workflow presents reports, not graphs or reconnection rankings.
