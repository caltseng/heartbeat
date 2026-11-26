# Manual metadata retrieval V0

Owner-authorized scope: a user invokes each bounded retrieval in a **local
Heartbeat project session**, using an already available source tool and its
normal client authentication. No new OAuth connector, backend, bridge, background
sync, scheduler or future privacy-control platform is required. Demo/UI work is
parallel, not a prerequisite. Implementation and review use mocks only; no real
account was accessed or connected by this change.

For source feasibility and iteration, use the [retrieval
plan](contacts-retrieval-plan.md): Android SMS/MMS, Google contacts, Gmail,
personal Messenger/WhatsApp, GroupMe and Muse device/cloud distinctions. It
records public API evidence and alternatives, not installed-tool or live-access
proof. Research-only planning does not require private storage or authentication;
the gates below apply before actual acquisition/storage.

## Owner walkthrough

1. Open a local Heartbeat project session containing this checkout. Invoke
   `/contacts-retrieve` (the `.github/skills/contacts-retrieve/SKILL.md` skill).
   If the client has not refreshed repository skills, reopen the project session;
   the equivalent explicit instruction is: "Use the contacts-retrieve skill in
   this Heartbeat checkout for a manual metadata retrieval." The skill is not a
   shell command or a hosted automation.
2. Privately specify the exact source/account, allowed metadata fields,
   start/end/time-zone/as-of, finite page/record budget and fresh output location.
   Approve this run after the skill inspects actual tool schemas. Auth in the
   source tool's client Sign in UI, never by pasting secrets into the session.
   Missing auth produces `requires_setup`; no structured metadata operation,
   selective-field access, stable IDs or safe processing route produces
   `unsupported` with the missing capability named. Other approved sources may
   proceed; neither outcome is an empty source.
3. Verify effective Windows-user access, disk encryption and exclusion from
   ordinary shares/sync/backups for the external local directory before retrieval.
   Arrange deletion of inputs/outputs within 12 months. These are manual safety
   checks, not a requirement to build an automated verifier/retention platform.
   Unverified safety or unclear processing stops the affected run before reads.
4. Inspect the saved `manual-handoff.json` **locally**, including each account's
   tool provenance, actual record IDs/timestamps, requested bounds, coverage,
   unknowns and unfinished cursors. Do not upload it, add it to Library, put it
   under Git or paste it into chat. Exit 2 is a usable partial bundle, not success
   for unavailable sources. To resume, approve a new bounded invocation and use a
   new directory; the saver never fetches, resumes or overwrites automatically.

**Owner live trial still required:** actual client skill discovery, normal source
sign-in, inspected authenticated tool operation/field support, local processing
and filesystem protections, and inspection of one owner-approved bounded real
handoff. Synthetic tests cannot establish any of these live facts. A Muse name
or a previously successful narrative query is not structured metadata evidence.

## Exact local handoff boundary

`npm run contacts:retrieve-save -- --input <projected-run.json> --output <existing-directory>`
validates a locally projected `ManualRun` and atomically publishes
`manual-handoff.json` without clobbering. It uses shared period resolution,
metadata types, output guarding and no-clobber publication helpers. It does not
authenticate, fetch, inspect a tool, grant consent, verify OS encryption/ACLs,
certify provider completeness, purge data or import anything. Its provenance
references are evidence locators, not cryptographic proof of a tool response.
Its input is already private: projection and safe placement precede this command.
Keep that input under the same retention/deletion boundary as the output.

`ManualRun` (exported by `scripts/contacts/manual-retrieval.ts`) has:

| Field | Contract |
| --- | --- |
| `schemaVersion`, `dataClass` | `1`, and `private` for actual retrieval or `synthetic` for fixtures only. |
| `period` | Existing `PeriodRequest`: `preset`, IANA `timeZone`, offset-bearing `asOf`, and custom `start`/`end` where applicable. Saved as resolved `[start,end)` bounds. |
| `sources` | Every requested source, including unavailable ones. Each has the existing `source`, stable `account` and `connector` namespace, plus the receipt fields below. |
| `fields` | Explicit requested record paths, e.g. `identities.id`, `identities.idKind`, `identities.isSelf`, `threads.id`, `threads.idKind`, `threads.kind`, `events.id`, `events.idKind`, `events.threadId`, `events.senderId`, `events.timestamp`, `events.channel`, `events.eventType`. Only the saver allowlist is accepted; unrequested record fields fail. |
| `status`, `gaps` | `collected`, `partial`, `requires_setup`, `unsupported` or `failed`; gaps are explicit non-secret descriptions. Complete status requires complete declared coverage, no gaps and exhausted pagination. Exhaustion alone does not establish complete provider history. |
| `operation`, `responseRefs` | Actual qualified read-only operation and local/tool response locators, not raw payloads, secrets, queries or fabricated citations. Operation may be null for unavailable sources; responseRefs may be empty only without a retrieved handoff. |
| `retrievedAt` | Actual offset-bearing retrieval instant, or null when unavailable. Not an event timestamp or invented time of last contact. |
| `handoff` | Existing schema-v1 `Handoff` metadata envelope, matching receipt source/account/connector and data class; null without retrieval. Its coverage and pages retain actual cursors, IDs and source timestamps. |

Supported metadata projection: identity IDs/self flags/email or phone addresses;
thread IDs/kinds; membership identities, thread and validity instants; event
IDs, channel/type, thread/sender, timestamp, recipient identities/roles,
classification and mutation target IDs. No display names/titles, arbitrary
provider fields, subjects, snippets, bodies, notes or credentials. All requested
paths must also be approved for that source/run. The helper is an envelope/field
boundary check, **not** the importer's referential/revision reconciliation.
Do not invent missing fields to satisfy it. A count-only tool cannot populate
record-level events; report that missing capability instead. Google identity
snapshots do not establish past membership or activity.

The bundle nests existing source `Handoff`s beside receipts instead of changing
their schema or introducing a collection store. Real handoffs are **not currently
importable**: `collect.ts` and private adapters/reducers still fail closed with
`private_collection_disabled` or their existing private denial. No flag changes
that and real input must never be relabeled synthetic. This V0 stops before
identity reconciliation, aggregation, reports or UI. Future private import work
must separately satisfy its own controls; it is not a prerequisite to this
manual retrieval skill.

## Processing and failure semantics

Source-API reads through an approved authenticated tool differ from sending
collected metadata to remote AI. The latter remains prohibited. Inspect the
tool's processing behavior before a read; if the available client/route cannot
honor this boundary, mark it unsupported. A tool exposing a remote-AI prompt is
not interchangeable with a selective structured source read. Normal client
sign-in grants tool access, not broader field/content or per-run consent.

On auth failure stop that source and request its normal client sign-in; never
extract credentials or use another account. On a budget, paging, field or history
limit save observed supported metadata as partial with specific gaps. Never
convert failure to zero history. Storage/validation failure exits 1 with a
sanitized diagnostic and no published bundle; fix locally and choose a fresh
output after approval when retrieval must be repeated. No source writes,
sending, device access, source setup installation or schedules are part of V0.

Synthetic tests exercise this saver with mocked structured tool responses,
mixed supported/unavailable sources, bounds/field/provenance failures, immutable
output and the unchanged private importer guard. No real account data belongs in
tests, CI, review evidence or examples.
