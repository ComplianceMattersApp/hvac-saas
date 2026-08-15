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

## Why slices 2–5 cannot be done the way slice 1 was

Slice 1 was safe because its three shared helpers were identified by regex and
then **read individually** before being moved. Attempting slices 2–5 in one pass,
trusting the same regex to find helpers unread, failed in two distinct ways. Both
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

## Remaining slices

In intended order: notes + data entry, retest, service visits, assignment / team,
then ECC test entry. Job creation (`createJobFromForm`, 1,822 lines) and
`advanceJobStatusFromForm` (902 lines) are single oversized functions rather than
clusters, and want internal decomposition rather than relocation — a separate
exercise from this one.
