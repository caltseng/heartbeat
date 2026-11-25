---
name: contacts-summary
description: Present a saved synthetic Heartbeat 7d, 30d or custom period dataset as a grounded summary, people table, channel counts and daily timeline with its exact coverage and input binding. Does not collect, connect or infer relationship quality.
---

# Heartbeat period summary

Read [the reporting contract and decisions](../../../docs/spec/contacts-period-summary.md),
[privacy policy](../../../docs/privacy.md), and AGENTS.md. Use only already saved
synthetic snapshots and explicitly reviewed mappings. No account/device/browser
access, credentials, pairing, installation, sending, remote processing of private
data or schedule creation. Policy approval is not exact-source or run approval;
all private requests remain disabled. Never relabel real data synthetic.

## Prepare one dataset

1. Select the local synthetic `collection.json`, `identity-review.json` and an
   explicit saved mapping revision bound to those exact collection bytes.
   Resolve identities through `contacts-identity-review`, not name guessing.
2. Save an untracked `summary.synthetic.json` request with `schemaVersion:1`,
   `dataClass:"synthetic"`, `collection`, `mapping`, `identityMappingRevision`,
   `period`, optional `channels` and a fresh `output` directory. Paths are relative
   to the request. The [contract](../../../docs/spec/contacts-period-summary.md)
   gives the complete shape and 7d/30d/custom semantics.
3. Run:

```powershell
npm run contacts:summary -- --request .private\contacts\demo-001\summary.synthetic.json
```

Exit 0 means declared complete filtered coverage; 2 means a saved partial report
whose limits must remain visible; 1 means fatal failure, not a usable empty report.
Keep the nonzero status. Do not retry by weakening validation. Changed snapshots
need explicit mapping review/rebinding. Never edit a report or overwrite an old
run; choose a fresh directory. Collection and review inputs remain unchanged.

## Present without inventing numbers

Read the saved `report.json` once and use its `views` for every view. Lead with
**Heartbeat period summary** and copy `views.summary.statements`; these sentences
are deterministic reducer-backed output, not assistant calculations. Additional
prose may explain limitations, but must not generate totals, percentages, ranks,
trends, scores, recency thresholds or comparisons.

Present `views.peopleTable` with canonical `personId`, `cohortState`,
`observedDirectMessages`, direct sent/received, group posts, group-only label,
active days and latest observed activity. Preserve every cohort row, including
inactive/unassigned people and known people with no observed activity. Preserve
aliases as references; never merge same-name people. Person-channel counts are
already in each row's `perChannel`. Recipient roles and passive membership are
not direct exchanges; group-only is an observation category, not full history.

Use `views.perChannel` for channel counts and `views.timeline` for daily data.
Do not rebuild dates, filters or counts from raw records, omit empty dates,
drop unknown channels, sum person attributions as total volume, or sum active
days across channels. The timeline's `partialDay` marks clipped local dates,
including custom boundary days. Plot observed values as **observed**; do not
plot null totals as zero or smooth across missing history. Exact zero requires
`certainty:"exact"` and `total:0`; otherwise zero observations mean unknown.
Positive incomplete counts are lower bounds.

Every presentation must retain the full `context`: resolved bounds, time zone,
as-of/current-day state, filters, collection digest, mapping revision, exclusions,
audit, source freshness/coverage/status/errors, unresolved references and limits.
The pure `selectView(report, name)` helper attaches this same context and a common
report digest to any standalone view. If showing only one table/timeline, keep
that envelope; do not publish bare rows or a context-free screenshot/chart.
An excerpt must be explicitly labeled and link to the same private local dataset,
not silently hide other people or sources. Never paste identifiers/manifests into
PRs, issues or remote tools. Keep synthetic operational files under ignored
`.private\contacts\` or an external local synthetic folder; ignored checkout
storage is not approved real-data storage.

Unsupported, auth-limited, failed and unavailable sources stay explicit, never
empty success. Retrieval after as-of is not historical reconstruction. Message
volume is not relationship importance, neglect, belief or a confirmed meaningful
connection. This skill adds no graph renderer, reconnection ranking or hosted UI.
