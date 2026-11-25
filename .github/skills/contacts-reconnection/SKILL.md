---
name: contacts-reconnection
description: Review saved household evidence, existing threads and explicit follow-ups with rhythm-preserving deferral.
---

# Weekly reconnection review

Required: [shared operating rules](../../../docs/spec/contacts-technical-spec.md#shared-operating-rules)
and [reconnection contract](../../../docs/spec/contacts-reconnection-review.md).

1. Prepare `reconnection.synthetic.json` with collection file, mapping/curated
   directories, optional prayer directory, period/zone/as-of, output and optional
   limit. Keep the overlay under curated storage outside managed source caches.
2. Run `npm run contacts:reconnect -- --inspect <request-file>`. Present
   **Heartbeat weekly reconnection review** with structured reasons, last
   confirmed date or unknown, original notes, commitments, active/ambiguous
   prayer context and existing-thread action.
3. Keep deferred/overflow rows and missing prayer/thread/link limitations visible.
   Explain evidence-category ordering. Use saved links only; never invent,
   open or fetch a URL or claim live access.
4. On explicit user instruction, copy inspected `revision` and `evidenceDigest`,
   add reason and follow-up/complete/defer/thread-link operations, then run
   `--request`. Reinspect changed evidence. Deferral preserves rhythms;
   completion does not record a connection.
5. Record a meaningful connection separately with `contacts:curate`, inspected
   preconditions and explicit date/households/context, then reinspect. Never
   automate this step.
6. For an immutable point-in-time `report.json`, copy current preconditions,
   omit operations and run `--report`.
