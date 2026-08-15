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

## Remaining slices

In intended order: notes + data entry, retest, service visits, assignment / team,
then ECC test entry. Job creation (`createJobFromForm`, 1,822 lines) and
`advanceJobStatusFromForm` (902 lines) are single oversized functions rather than
clusters, and want internal decomposition rather than relocation — a separate
exercise from this one.
