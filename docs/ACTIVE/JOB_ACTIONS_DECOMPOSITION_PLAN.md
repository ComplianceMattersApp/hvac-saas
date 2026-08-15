# job-actions.ts Decomposition Plan

`lib/actions/job-actions.ts` was 12,985 lines with 69 exported server actions and
83 top-level helpers. It is not tangled — 134 sibling test files cover it and the
type checker is clean — but no one can hold it in their head, and it is the single
largest file in the repo.

This is a filing-cabinet problem, not a disorder problem, so it is being split
along seams that already exist rather than rewritten.

## The constraint that shapes everything

`job-actions.ts` is a `"use server"` module. That means:

- **Every export must be an async function.** Server actions become POST
  endpoints; you cannot export a helper, a constant, or a value from one of these
  files. (`export type` is fine — it is erased before it reaches the runtime.)
- **Shared helpers therefore cannot live in a `"use server"` file** that other
  action modules import from. They need a neutral module.

So the split is two-sided: a neutral `job-actions-shared.ts` holding internals,
and one `"use server"` module per domain holding the actions.

`lib/actions/job-actions-shared.ts` is that neutral module. It deliberately has
no `"use server"` directive. Helpers move there as slices need them, rather than
all at once.

## How slices are numbered

Slice numbers record the order work was **actually completed**, which is not the
order originally planned. The plan opened by ordering the domain clusters and
calling them slices 2–5; when that batch was abandoned, the core extractions that
replaced it took the numbers 2 and 3, and the clusters lost theirs.

To stop that colliding again: completed slices are numbered, and work not yet
done is referred to **by cluster name only**.

Completed so far: equipment + filters (slice 1), the access and navigation
primitives (2), `insertJobEvent` (3), notes + data entry (4), and assignment /
team (5). Still outstanding: retest, service visits, and ECC test entry.

## Choosing slice order

Each candidate cluster was measured by how many helpers it shares with the rest of
the file — shared helpers are the real cost, since each one must be extracted to
the neutral module before the slice can move.

| cluster | lines | exports | shared helpers | own helpers |
|---|---|---|---|---|
| equipment + filters | 456 | 6 | **3** | 3 |
| notes + data entry | 568 | 3 | 3 | 2 |
| retest | 377 | 2 | 4 | 0 |
| service visits | 534 | 2 | 5 | 0 |
| assignment / team | 554 | 5 | 11 | 0 |
| ECC test entry | 3,209 | 30 | 27 | 4 |

Order is by seam cleanliness, not by size. ECC test entry is by far the biggest
prize at 3,209 lines, but it needs 27 helpers extracted first — so it goes last,
once the neutral module has accumulated most of them from the cheaper slices.

## Slice 1 — equipment and system filters (done)

`lib/actions/job-equipment-actions.ts`, 6 actions, 477 lines:

- `addJobEquipmentFromForm`, `updateJobEquipmentFromForm`, `deleteJobEquipmentFromForm`
- `addSystemFilterFromForm`, `updateSystemFilterFromForm`, `archiveSystemFilterFromForm`

Three private helpers moved with it (`readSystemFilterFormText`,
`requireSystemBelongsToJobForFilterAction`, `requireFilterBelongsToJobForFilterAction`).

Three helpers went to the neutral module, along with the `FieldActionTimingRecorder`
type, which `job-actions.ts` now imports back:

- `cleanupOrphanSystem`
- `requireInternalEquipmentMutationAccess`
- `requireOperationalScopedJobMutationAccessOrRedirect`

Call sites were repointed at the new module rather than re-exported through
`job-actions.ts`, so the dependency is explicit: 4 components and 2 test files
for static imports, 2 test files for dynamic `await import(...)`.

**Result:** `job-actions.ts` 12,985 → 12,433 lines, 69 → 63 exports.

## Verification each slice must pass

Unit tests alone are not sufficient here — they do not evaluate the `"use server"`
contract. Every slice must clear all four:

1. `npx tsc --noEmit` — 0 errors
2. `npx vitest run` — full suite green, **with no drop in test count**
3. `npx next build` — compiles; this is what actually validates the server-action
   boundary, and nothing else will catch a violation of it
4. Exports in the new module are all `async function`, and the neutral module has
   no `"use server"` directive

## Why the domain clusters cannot be done the way slice 1 was

Slice 1 was safe because its three shared helpers were identified by regex and
then **read individually** before being moved. Attempting the notes, retest,
service visit, and assignment clusters in one pass, trusting the same regex to
find helpers unread, failed in two distinct ways. Both
are recorded here because either one would have shipped silently broken code.

**1. The helper-detection regex has false positives.** Matching
`^const (\w+) = (?:async )?\(` treats any declaration whose value starts with a
parenthesis as an arrow function. In this file that includes

```ts
const parentJobId = (childBefore?.parent_job_id ?? null) as string | null;
```

which is a **local variable inside a function body**, not a top-level helper.
The extraction dutifully relocated that single line into the shared module,
cutting it out of the middle of the function that owns it. Type checking caught
it only indirectly, via `Cannot find name 'childBefore'` — the symptom, not the
cause. Any future extraction must resolve declarations structurally (an AST or
the TypeScript compiler API), or hand-verify every helper it intends to move.

**2. These four clusters are not independent of each other.** They share an
event-writing and assignment core — `insertJobEvent`, the assignment primitives,
the service-case primitives, and several types and const arrays
(`JobAssignment`, `SERVICE_CASE_KINDS`, `SERVICE_VISIT_TYPES`). `insertJobEvent`
is itself an exported server action that eight other modules import, so it cannot
simply be relocated into the neutral module without deciding what it is: a shared
internal, an action, or both.

Slice 1 gave a misleading impression of how mechanical this work is. Equipment
and filters is a genuine leaf; the remaining clusters sit on a shared trunk that
has to be named and extracted deliberately, as its own slice, before any of them
move.

**Revised order:** extract the shared core first, in cohesive pieces, then do
notes, retest, service visits, and assignment — each a separate reviewed change,
not a batch.

## Declarations are resolved with the compiler, not regex

`scripts/dev/list-top-level-decls.js` walks the file with the TypeScript compiler
API and reports every top-level declaration — functions, consts, types,
interfaces, classes — with its exact line range, export status, and the set of
other top-level names it references.

This exists because regex got it wrong in a way that type checking only caught
three steps downstream. Anything that decides what to move should use this, not
pattern matching. Its output also gives the reference graph the fan-in analysis
below depends on.

## Slice 2 — shared access and navigation primitives (done)

Rather than guessing at the core, fan-in was measured: for each of the 63
exported actions, the transitive set of internals it reaches, counted per
internal. The clear winners were small, high-traffic primitives:

| fan-in | lines | name |
|---|---|---|
| 23 | 44 | `requireInternalEccTestsAccess` |
| 22 | 27 | `requireInternalScopedJobAccessOrRedirect` |
| 22 | 22 | `redirectToTests` |
| 19 | 8 | `revalidateEccProjectionConsumers` |
| 18 | 21 | `resolveSystemIdForRun` |
| 15 | 5 | `normalizeJobTab` |
| 14 | 23 | `redirectToJobWithBanner` |
| 6 | 24 | `getSafeErrorDetails` |

Their transitive closure is exactly those eight — no cascade, and nothing
exported, so the action surface is unchanged. 174 lines moved to the neutral
module, which more than half the file's actions now reach through a real import
rather than file-local scope.

This deliberately does **not** touch `insertJobEvent`. It is an exported server
action that eight other modules import, so relocating it changes a public
surface, and that decision deserves its own change rather than riding along with
a helper move.

## Remaining core: service case and assignment

The next cohesive group is the service case / visit family — `ensureServiceCaseForJob`,
`createServiceCaseForRootJob`, `resolveServiceCaseIdForNewJob`,
`normalizeServiceVisitType`, `normalizeServiceVisitOutcome`,
`normalizeServiceCaseKind`, `deriveInitialServiceVisitReason`,
`buildInitialProblemSummary`, and the `SERVICE_*` const sets — at fan-in 9, plus
the assignment primitives (`addJobAssignment`, `JobAssignment`) at 6.

Both are entangled with `insertJobEvent`, which is now resolved — see below.

## Slice 3 — `insertJobEvent` is a helper, not an endpoint (done)

The plan was to move `insertJobEvent` to the neutral module and re-export it from
`job-actions.ts` so the existing server action endpoint kept working. Checking who
actually calls it showed the re-export was unnecessary and actively undesirable:

- Its callers are five server-side modules — `field-charge-proposal-actions`,
  `internal-invoice-actions`, `internal-invoice-payment-actions`,
  `tenant-invoice-stripe-webhooks`, and `job-actions` itself.
- **No reference to it exists anywhere under `app/`.** No route, no page, no
  component.
- No client component imports it, and it is never passed as a form `action`.

So nothing invoked it over the network. Because it was exported from a
`"use server"` file, Next.js was still publishing a callable POST endpoint for
it — a public entry point that writes job events, reachable by anyone who could
guess the action id, existing purely as an artifact of where the function
happened to live.

Re-exporting would have faithfully preserved that endpoint. Instead the function
moved to the neutral module and all five callers import it directly, so the
endpoint stops being generated. This is a small reduction in attack surface, not
just a tidy-up.

Ten test files mocked `@/lib/actions/job-actions` solely to stub
`insertJobEvent`; each now mocks the neutral module. Every one stubbed that
single export, so no mock had to be split.

**Rule this establishes:** before preserving a server action's public surface,
check whether anything actually calls it over the wire. In a `"use server"`
module, a helper-shaped export is an endpoint whether or not anyone wanted one.

With this settled, the service-case and assignment groups are unblocked; both
depended on it.

## Slice 4 — notes and data entry (done)

`lib/actions/job-note-actions.ts`, 3 actions, 587 lines: `addPublicNoteFromForm`,
`addInternalNoteFromForm`, `completeDataEntryFromForm`, with
`buildPublicNoteRedirectPath` and `buildInternalNoteRedirectPath` carried along
as private helpers — unexported, since exporting them from a `"use server"` file
would publish two more endpoints.

Re-measuring first paid off. The cluster table above, written before the core
extractions, put this cluster at **3 shared helpers**. Measured against the
current file it needs **none**: everything it used —`getSafeErrorDetails`,
`requireInternalScopedJobAccessOrRedirect`,
`requireOperationalScopedJobMutationAccessOrRedirect`, `insertJobEvent` — already
lives in the neutral module, and its only remaining internals are exclusive to it.
It extracted as a pure leaf.

Two call-site shapes worth noting for the remaining clusters:

- `job-detail-relink-notes-entitlement-hardening` dispatches dynamically over a
  union of four action names, two of which moved and two of which did not. It now
  imports both modules and merges the namespaces. Any test that dispatches by name
  rather than by import will need the same treatment.
- Two source-scraping tests read `job-actions.ts` for note code and now read both
  files. This is the same pattern the job detail retirement hit: tests that assert
  on file contents need their source list widened whenever code moves.

**Result:** `job-actions.ts` 12,238 → 11,675 lines, 62 → 59 exports.

## Slice 5 — assignment and team (done)

`lib/actions/job-assignment-actions.ts`, 5 actions, 694 lines. Nine internals
went to the neutral module and four private helpers plus a result type moved with
the cluster.

Re-measuring changed which cluster went next. The stale table ordered assignment
last of the cheap three at 11 shared helpers; measured against the current file
it needed **7**, while retest and service visits had risen to **18 each**:

| cluster | table said | actually |
|---|---|---|
| assignment / team | 11 | **7** |
| retest | 4 | 18 |
| service visits | 5 | 18 |

So the earlier note that remaining clusters were "likely cheaper than listed" was
wrong — it held for notes + data entry and inverted for the other two. Measure
each one; do not extrapolate from the last.

Two findings from this slice:

- **`ensureActiveAssignmentAndNotify` was a second unwanted endpoint.** Exported
  from `job-actions.ts`, imported only by `contractor-intake-actions.ts` and test
  files, never referenced under `app/`, never a form action. Same shape as
  `insertJobEvent`; it moved to the neutral module as a plain function and the
  endpoint is no longer generated. That is now two found in one file, which is
  why the wider audit is worth doing.
- **Cluster exclusivity must account for external importers.** The first pass
  called this function "exclusive to the cluster" because nothing else *inside*
  `job-actions.ts` referenced it. Five files outside did. Exclusivity means
  nothing else in the repo uses it, not nothing else in the file.

A circularity check also caught `ensureActiveAssignmentForUser` (neutral side)
referencing the `JobAssignmentCreatedCallback` type (cluster side); the type
moved to the neutral module. Run that check on every slice — neutral must never
import from a cluster module.

**Result:** `job-actions.ts` 11,675 → 10,666 lines, 59 → 53 exports.

## Slice 6 — service case and operational email core (done)

Retest and service visits were each measured at 18 shared helpers. Comparing
their dependency closures showed something stronger than "overlapping": the two
sets are **identical**. All 27 internals, and neither cluster has a single
exclusive dependency. So one extraction unblocks both entirely.

870 lines moved to the neutral module in two families:

- **Service case / visit** — `ensureServiceCaseForJob`,
  `createServiceCaseForRootJob`, `resolveServiceCaseIdForNewJob`,
  `deriveInitialServiceVisitReason`, `buildInitialProblemSummary`, the
  `normalize*` trio, and the `SERVICE_*` const sets.
- **Operational email** — `sendCustomerScheduledEmailForJob`,
  `sendContractorScheduledEmailForJob`, the delivery-notification helpers, and
  the `OperationalEmail*` types.

Two of the 27 were exported actions, and they resolved differently:

- **`createJob` was a third unwanted endpoint.** No `app/` references, never a
  form action — the new-job form uses `createJobFromForm`, a different function.
  Its only importers are `contractor-intake-actions` and
  `receiver-job-from-workshare`, both server modules. Moved to the neutral module
  as a plain function; the endpoint stops being generated.
- **`updateJobScheduleFromForm` is a genuine form action.** It appears in
  `<form action={...}>` in the mobile detail preview, the mobile schedule panel,
  and the V2 desktop page. It stays in `job-actions.ts` as an action; the cluster
  modules will import it across module boundaries, which is ordinary.

That distinction is the whole point of checking rather than assuming: two exports
of identical shape, one safe to demote and one that must not be.

**Three unwanted endpoints found in this file so far** — `insertJobEvent`,
`ensureActiveAssignmentAndNotify`, `createJob`. That is a pattern, not a
coincidence, and the wider audit of other `"use server"` modules is overdue.

**Result:** `job-actions.ts` 10,666 → 9,822 lines, 53 → 52 exports. Below 10,000
for the first time.

## Slice 7 — retest and service visits (done)

Taken together because slice 6 had already reduced both to leaves. Measured
before starting: their combined remaining internal dependency was a single
declaration, `updateJobScheduleFromForm`, which stays an action in
`job-actions.ts` and is imported across module boundaries.

Two modules rather than one, since they are distinct domains:

- `lib/actions/job-retest-actions.ts` — `createRetestJobFromForm`,
  `scheduleRetestNowFromForm`
- `lib/actions/job-service-visit-actions.ts` — `createNextServiceVisitFromForm`,
  `createCallbackVisitFromForm`

Batching was safe here in a way the earlier four-cluster attempt was not: these
two had *identical* dependency sets, both were leaves, and each was verified
independently. The earlier failure came from batching clusters whose
dependencies had never been measured.

**Source-scraping tests that slice by boundary need care when a cluster splits.**
Three tests bounded a slice with `indexOf("export async function <next>")`, where
the next declaration stayed in `job-actions.ts` while the sliced action moved.
`indexOf` returned -1 and the tests threw rather than silently passing, which is
the good failure mode — but any such boundary must be re-pointed at a declaration
in the same file, or at end-of-file when the action closes the module.

**Result:** `job-actions.ts` 9,822 → 8,919 lines, 52 → 48 exports.

Note on a pre-existing oddity carried along by these moves: 23 of the actions
carry a redundant function-level `"use server"` inside the file-level
`"use server"` module. It is legal and the build accepts it; it is simply
belt-and-braces from the original authors, and moving the functions preserved it.

## Remaining work

Still in `job-actions.ts`: **ECC test entry** — the last and largest cluster, 30
actions and roughly 3,200 lines, about a third of what remains. Its original
count was 27 shared helpers; measure it again before starting, since six slices
have moved internals to the neutral module in the meantime.

After that, what is left of `job-actions.ts` is job creation
(`createJobFromForm`, 1,822 lines) and `advanceJobStatusFromForm` (902 lines) —
single oversized functions rather than clusters, wanting internal decomposition
rather than relocation.

Re-measure with `scripts/dev/list-top-level-decls.js` before starting any of
them. Every count in the original table has since proved wrong in one direction
or the other.

Job creation (`createJobFromForm`, 1,822 lines) and
`advanceJobStatusFromForm` (902 lines) are single oversized functions rather than
clusters, and want internal decomposition rather than relocation — a separate
exercise from this one.
