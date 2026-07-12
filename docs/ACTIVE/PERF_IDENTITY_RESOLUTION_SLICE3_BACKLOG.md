# Performance — Slice 3+ Backlog (identity-resolution lane)

Recorded after Slice 2 completed. Nothing here is started. Open only after Slices 1 & 2 are merged and prod-smoked. Same discipline and guardrails as prior slices (behavior-preserving dedup; audit → slice → benchmark → commit → docs; no revalidation/billing/truth changes without a dedicated audit).

---

## A. Finish the `getRequestUser()` migration (remaining read-path pages)

Slice 2 covered the priority surfaces (ops, jobs/v2, root, calendar, reports pages, 2 owner-console customers pages). Remaining Server-Component pages still calling `supabase.auth.getUser()` directly, grouped for future per-cluster commits:

- **Customers/Contractors:** `customers/[id]/page.tsx`, `customers/[id]/edit/page.tsx`, `customers/page.tsx` (confirm which owner-console ones already migrated), `contractors/[id]/edit/page.tsx`, `contractors/new/page.tsx`
- **Estimates:** `estimates/page.tsx`, `estimates/new/page.tsx`, `estimates/[id]/page.tsx`, `estimates/[id]/print/page.tsx`
- **Portal:** `portal/page.tsx`, `portal/jobs/page.tsx`, `portal/permit-request/page.tsx`, `portal/intake-submissions/[id]/page.tsx`
- **Job-detail children:** `jobs/[id]/info/page.tsx`, `jobs/[id]/attachments/page.tsx`, `jobs/[id]/invoice/page.tsx`, `jobs/[id]/invoice/print/page.tsx`, `jobs/[id]/tests/page.tsx`, `jobs/new/page.tsx`
- **Misc pages:** `service-plans/page.tsx`, `service-plans/templates/page.tsx`, `time-clock/page.tsx`, `notes/page.tsx`, `locations/[id]/page.tsx`, `account/page.tsx`, `account/edit/page.tsx`

**DO NOT migrate (leave direct `getUser`):**
- Pre-auth / session-establishment pages: `auth/callback/page.tsx`, `login/page.tsx`, `set-password/page.tsx` (these establish/validate the session itself — request cache must not front-run them).
- All Server Actions in `lib/actions/*` and any form action (must re-validate fresh post-mutation).
- `route.ts` export/API handlers that call `getUser` once each (own request per call, ~zero dedup value): `customers/export`, `api/customers/suggestions`, `ops/contractor-intake/export`, and all `reports/*/export` routes. Only touch a handler if it resolves the user more than once per invocation.

Value note: this cluster is lower-traffic than Slice 2's surfaces, so expect smaller wins. Benchmark per cluster; drop any that don't move the needle.

---

## B. Retire the dead v1 job-detail route (cleanup lane)

`/jobs/[id]/v2` is the permanent job-detail route; v1 `app/jobs/[id]/page.tsx` is retired but still carries the original `JOB_DETAIL_TIMING_DEBUG` instrumentation (now duplicated onto v2 in Slice 2, Step 0).

- Confirm no live traffic/links resolve to the v1 parent `page.tsx`, then remove it and its instrumentation.
- Audit whether the job-detail child routes (`info`, `attachments`, `invoice`, `invoice/print`, `tests`) are still reachable under the v2 shell or are also superseded; migrate or retire accordingly.
- This is a correctness/cleanup lane, not perf — keep it separate from the getUser migration commits.

---

## C. Separate lanes (each needs its own audit; not part of this lane)

- **`revalidatePath` breadth audit** — 1099 call sites; some likely over-broad, forcing full-tree (incl. root layout) re-renders after actions, which directly taxes action-button settle. Trim ONLY with dependency mapping. Highest remaining upside for the "delayed buttons" symptom after the identity work.
- **`getUser` → `getClaims`** — replace some network-validating `getUser` with local JWT verification where a fresh network check isn't required. Security-sensitive; dedicated audit.
- **Build tooling** — `next dev/build --webpack` forces webpack over Next 16 Turbopack. Dev/build speed only (the 7–10s dev per-route times are webpack compile, not runtime). Try dropping `--webpack` after confirming no custom webpack config is relied on.

---

## D. Quality (not perf, but flagged)

- **Test baseline:** ~37 pre-existing suite failures across 17 files on main (stale fixtures, e.g. the actor-context fixture fixed in Slice 1). Worth a fixture-cleanup lane so "green" means green and future regressions aren't masked by known-red noise.

---

## Sequencing suggestion

`revalidatePath` audit (C) likely beats finishing the low-traffic getUser migration (A) for real-world felt speed on actions — consider it the next *perf* slice, with A and B as fill-in cleanup. Confirm with fresh timings after Slices 1 & 2 are live before committing to order.
