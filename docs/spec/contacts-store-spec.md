# Heartbeat: relationship and contacts store

Product contract. [Technical contracts](contacts-technical-spec.md),
[stable CONTACTS register](contacts-work-items.md),
[migration provenance](../provenance.md). The register tracks delivered synthetic
slices and prerequisites; this document describes the product, not live access.

## Purpose and scope

Heartbeat is one user's local household-centered relationship companion:
observed cross-source communication, intentional reconnection, unchanged notes,
prayer triage, follow-through and life-update audiences. Personal/community/
professional relationships belong in the model. Donation records/payments/tax
receipts remain elsewhere; do not treat every contact as a fundraising prospect.

Use local JSON and private generated files, not hosting, dashboard backend,
multi-tenancy or product accounts. Prove collection-to-summary/map before
polished design. No sending, source writes, group creation, pairing or recurring
schedules. The [approved privacy policy](../privacy.md) supersedes historical
deferred-policy language: metadata policy is not real-note/content consent.
[Manual retrieval V0](contacts-manual-retrieval.md) supports per-run-approved
source-API metadata handoffs; existing private import/aggregation/rendering
guards remain closed. Development/review/examples are synthetic.

## Relationship model

| Record | Required meaning |
| --- | --- |
| Household/person | Household is curated primary relationship unit, possibly one person; reviewed people retain addresses/provider identities and individual context. Never infer households from surnames/chats. |
| Group/thread | User-curated community group is distinct from a source conversation. Many threads/households can associate; keep thread identity separate from title and current participants. |
| Note/connection | Save original typed text immediately without rewrite approval; multiple households may share a note. Capture and encounter dates differ. Only explicitly recorded meaningful connections set confirmed dates; activity/attendance never resets them. Dictation is future scope. |
| Prayer/follow-up | Ground in saved originals and explicit statements; status changes require confirmation, not elapsed time. Preserve unknowns, due dates, completion/deferment and person-specific context. |
| Audience | Purpose, candidate households/individual addresses, inclusion/exclusion reasons, explicitly recorded wording preferences and reviewed recipient selection. No inferred beliefs or automatic sending. |

A couple-to-couple group preserves all four people and the other couple's
household association; it creates neither a four-person household nor three
direct exchanges per message. Incorrect reviewed identity links can split/undo
without losing source observations, original canonical references or notes.
Assistant suggestions stay distinguishable and source-traceable.

## Gradual population and curated workflows

Seed households through the current life-update audience: user selects known
households, resolves contact/thread evidence where authorized, reviews uncertain
matches/membership, then gradually adds context, notes and rhythms. Uncurated
source correspondents can appear in the map before household review; contact
presence or message volume does not make someone important.

Reconnection review explains why each household surfaced, confirmed date or
unknown, recent saved context, active prayer/follow-ups, suggested next action
and existing thread/link where supported. Explicit commitments, chosen rhythms,
known events and update intent may contribute. Deferment never changes long-term
rhythm; missing history is not neglect. List size/order are inspectable tuning,
not household-worth or guilt scores. Reviews are user-invoked, not scheduled.

Prayer plans remain editable, note-grounded and cadence-independent; old requests
may be reviewed but never inferred answered/resolved. Audience suggestions
expand reviewed households into people, expose missing/ambiguous addresses,
prevent duplicates, permit additions/exclusions and require final review.
Christian/non-Christian wording is explicit preference, never inferred from
names/group/email history. Draft wording is secondary; manual outreach remains
outside the system. Private content needs its own approved boundary.

## Source integration

Google supplies identities; email/text/Messenger/WhatsApp supply supported
metadata. Distinguish conversation linking, activity metadata and content-history
access: manual thread links remain useful without automated history. Show saved
channel/thread/participants and missing opening-link limitation rather than
inventing URLs. Several threads with the same people remain separate.

Source-specific [access/implementation contracts](contacts-technical-spec.md#invocation-and-capability-state)
govern formats and actual availability. Snapshots/manual links are not live
sync; membership grants no access to another person's account. Preserve original
IDs/times/roles/provenance, explicit unavailable/stale/partial sources and
uncertain matches. Imported evidence never silently overwrites curated context.
Unavailable integration must not prevent access to independently saved records.
No body/context retrieval is implied by metadata frequency views.

## Communication map acceptance

All views consume the same reproducible dataset and filters: 7d/30d/custom
half-open periods, selected IANA zone/as-of, source freshness/coverage and mapping
revision. [Period semantics](contacts-technical-spec.md#period-semantics) includes
the current partial day, DST and intraday bounds. Structured counts, not
assistant narratives, drive presentation.

| Requirement | Observable result |
| --- | --- |
| Unified evidence | Reviewed cross-source identities combine while per-source provenance remains recoverable; reimports deduplicate source IDs, different-channel messages remain distinct. |
| Frequency | Sent/received counts, local active-day unions and latest activity; To/CC/BCC/broadcast and groups never fan out into direct exchanges. Same-thread/date shared posting is participation, not addressed communication. |
| Consistent views | People table, per-channel frequency, daily timeline, primary user-centered hub-and-spoke and supporting person-to-thread map use identical period/channel/direction/thread filters. Household rollups deduplicate event IDs. |
| Explainable graph | Direct active-day frequency determines labeled radial bands; recency visible, exact evidence on selection. Group-only, passive membership, inactive known people and uncertain coverage have distinct treatments, not invented weighted spokes. |
| Honest uncertainty | Missing/auth-limited/unsupported history stays unknown; partial totals lower bounds. Unresolved/inactive identities remain visible; absent buckets are not zero. Every count traces to source-event ledger. |
| Opportunities | Own covered baseline decline and separately curated due rhythm, with prior/current/last-contact/reason. Insufficient or mismatched history suppresses decline; no relationship-quality/importance score or meaningful-date reset. |
| Local composability | Independent stable contacts-* source/review/reducer/presentation skills, synthetic multi-source demonstration and offline Heartbeat visualization, not Muse/remote-AI processing or live-access claims. |

This contract requires household-linked conversations, original notes, explicit
connections, individual rhythms, explainable review/prayer/audience workflows
and visible connector limits. It does not promise all historical messages or
private execution merely because synthetic implementations now exist.
