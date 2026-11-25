---
name: contacts-reconnection
description: Run a user-invoked synthetic Heartbeat household reconnection review from saved records, with explainable evidence, existing thread references, explicit follow-up completion and rhythm-preserving deferral. No sending or scheduling.
---

# Heartbeat weekly reconnection review

Read [the contract and decisions](../../../docs/spec/contacts-reconnection-review.md),
[privacy policy](../../../docs/privacy.md) and AGENTS.md first. Only use saved
synthetic evidence. Do not access accounts/devices/browser sessions, acquire
credentials, connect sources, infer consent, send, schedule or process private
content remotely. All private requests remain disabled; never relabel real data.

1. Prepare an untracked `reconnection.synthetic.json` per the contract: collection
   file, mapping and curated directories, optional prayer directory, explicit
   period/zone/as-of, output and optional list limit. Keep operational artifacts
   private/ignored, preferably under the curated directory outside managed source
   cache inventories.
2. Run `npm run contacts:reconnect -- --inspect <request-file>`. This is read-only.
   Present **Heartbeat weekly reconnection review**, retaining context and
   source limitations. Copy structured reasons/evidence, last confirmed date or
   unknown, original notes, open commitments, active/ambiguous prayer context and
   the existing-thread next action. Do not turn observed activity into a confirmed
   connection, low volume into neglect, or group membership into direct contact.
3. Keep deferred and overflow rows visible as such. Explain deterministic
   evidence-category ordering, not relationship importance. Missing prayer context,
   missing existing threads and unavailable source-opening links remain explicit.
   Only use saved links; never invent/open/fetch a URL or claim live access.
4. On explicit user instruction, copy inspected `revision` and `evidenceDigest`
   into the request, add a reason and the specified follow-up, complete, defer or
   thread-link operations; run `--request`. Reinspect after changed evidence.
   Deferral never changes rhythms; completion never records a connection.
5. To record a meaningful connection, use the existing `contacts:curate`
   connection operation with separate inspected preconditions and explicit
   date/households/context, then reinspect the review. Do not automate this step.
6. To retain a point-in-time private report, copy current preconditions, omit
   operations and run `--report`. It writes immutable `report.json`, refuses
   replacement and never rewrites sources/curation.

Exit 0 is declared complete evidence, 2 is a partial usable review with limits,
and 1 is fatal failure, not empty success. Preserve source/coverage errors and
nonzero status. Never weaken validation, force-add ignored artifacts, paste
identifiers/configuration into PRs/issues, or create a recurring review job.
