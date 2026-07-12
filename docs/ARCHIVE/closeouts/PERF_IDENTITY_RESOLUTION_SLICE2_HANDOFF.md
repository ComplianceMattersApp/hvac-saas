# Performance Handoff — Slice 2: Shared `getRequestUser()` + job-detail v2 instrumentation

**Prereq:** Slice 1 (`perf/identity-resolution-slice-1`, commit `0840010a`) is merged to main. Do not start Slice 2 until it is.

**Lane:** Speed / launch-readiness. **Discipline:** audit → small slice → benchmark → commit → docs. Real-screen smoke required. One concern per commit; commit per surface.

---

## Why this slice

Slice 1 removed the duplicate *dual-context* resolution (layout ↔ page). But there are still ~123 `auth.getUser()` call sites, and `getUser` is a **network round-trip to Supabase Auth** every time. Within a single request, the same user is often resolved several times across nested Server Components. This slice funnels per-request user resolution through one memoized call.

Current `auth.getUser()` clustering (read paths worth targeting first):

- `app/ops` — 23
- `app/reports` — 21 (spine backlog flags reports as slow)
- `app/jobs` — 8 (incl. the v2 job-detail route)
- `app/customers` — 4, `app/estimates` — 4, `app/portal` — 4, `app/calendar` — 1, `app/today`/`app/page.tsx` — 1 each

**Do NOT migrate** (leave exactly as-is):
- `lib/actions/*` and any Server Action / form action `getUser` — actions must re-validate identity fresh after a mutation; the request-scoped cache must not mask that.
- Security-gate `getUser` calls where a fresh network validation is the point.
- `route.ts` Route Handlers that call `getUser` once (each handler is its own request; near-zero dedup value). Only touch a handler if it resolves the user more than once in the same invocation.

---

## Guardrails (locked, from Active Spine V4.0)

- Do not chase speed by weakening truth; no optimistic final status/action state without approval.
- Do not trim revalidation without dependency mapping (out of scope for this slice).
- Do not touch invoice/billing/payment performance paths casually.
- Truth-boundary model is a hard constraint (Work Items / Invoice Charges / Pricebook / Payments).
- Behavior-preserving only: identity/entitlement/portal *outcomes* must be identical — this is dedup + instrumentation, nothing else.

---

## Step 0 (prerequisite) — Port job-detail timing to the v2 route

**Problem:** `/jobs/[id]/v2` is now the permanent job-detail route; v1 (`app/jobs/[id]/page.tsx`) is retired. But `JOB_DETAIL_TIMING_DEBUG` only instruments the retired v1 `page.tsx` (see its `timedPhase("authGetUser", …)` harness around line ~1468/1594). So on real traffic, job-detail timing produces nothing. You cannot benchmark this slice on the surface where delayed buttons hurt most until this is fixed.

**Do:**
1. In `app/jobs/[id]/v2/page.tsx` (currently raw `createClient()` + `supabase.auth.getUser()` around line ~357–360, no instrumentation), add the same `JOB_DETAIL_TIMING_DEBUG`-gated `timedPhase(...)` pattern used by v1: at minimum an `authGetUser`/identity phase, the main job read, and total-before-render.
2. Keep the flag name `JOB_DETAIL_TIMING_DEBUG` and the `[job-detail-timing]`-style label/duration-only log shape (no sensitive data) so it matches existing tooling.
3. Leave the v1 `page.tsx` instrumentation in place for now (dead route; remove in a later cleanup lane, not here).

**Verify:** with `JOB_DETAIL_TIMING_DEBUG=true`, loading `/jobs/<id>/v2` now emits phase timings.

---

## Step 1 — Shared, memoized `getRequestUser()`

In `lib/auth/request-identity.ts` (created in Slice 1), add:

```ts
import { cache } from "react";
// ...existing imports (createClient, createAdminClient, resolveDualContextAccess)...

export const getRequestUser = cache(async (): Promise<any | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
});
```

Then have `getRequestDualContextAccess` consume `getRequestUser()` so the getUser and the dual-context chain share **one** getUser per request:

```ts
export const getRequestDualContextAccess = cache(async (): Promise<DualContextAccess> => {
  const supabase = await createClient();
  const user = await getRequestUser();
  return resolveDualContextAccess({ supabase, user, getPortalAdmin: createAdminClient });
});
```

(`resolveDualContextAccess` already accepts an optional `user` and only calls `getUser` itself when `user` is not passed — so passing it dedupes cleanly. Confirm the session-invalid path still yields `user: null`.)

**Verify Step 1 in isolation:** `npx tsc --noEmit` clean; `vitest run` — existing dual-context / actor-context tests still green (signature unchanged; behavior identical). Add a focused test asserting `getRequestUser` returns the same user object within one request and that `getRequestDualContextAccess` no longer triggers a second `getUser`.

---

## Step 2 — Migrate high-traffic read paths (one surface per commit)

For each **Server Component / page** below, replace its ad-hoc `const { data: { user } } = await supabase.auth.getUser();` with the shared resolution — either `getRequestUser()` (when it only needs the user) or `getRequestActorContext()` (when it needs role/account context; already `cache()`-wrapped and now sharing the same getUser). Keep the page's own `createClient()` for its data reads; only the identity resolution changes.

Order by traffic/impact, benchmark before/after each with the timing flags, commit per surface:

1. `app/ops/**` (`OPS_TIMING_DEBUG`) — 23 sites; most already use `getRequestActorContext`, sweep the stragglers.
2. `app/jobs/[id]/v2/**` (`JOB_DETAIL_TIMING_DEBUG`, now live from Step 0) — the delayed-button surface.
3. `app/today/page.tsx`, `app/page.tsx`, `app/calendar/page.tsx`.
4. `app/reports/**` page-level reads (`dashboard/page.tsx`, `closeout/page.tsx`, etc.) — skip the `export/route.ts` handlers.

For each surface capture: getUser phase count (target: 1 per request, ideally shared to 0 additional beyond the layout), identity-phase ms, total-before-render ms. Directional wall-clock is fine to note; the **getUser count reduction is the reliable proof** (as in Slice 1).

---

## Explicitly out of scope (separate future lanes)

- `revalidatePath` breadth audit (1099 sites) — needs dependency mapping; own lane.
- `getUser` → `getClaims` (local JWT verification) — security-sensitive; own audit.
- Removing dead v1 `app/jobs/[id]/page.tsx` + its instrumentation — cleanup lane.
- `next dev/build --webpack` → Turbopack — dev/build speed only; own change after confirming no custom webpack config.

---

## Commit / merge discipline

- Branch: `perf/identity-resolution-slice-2` off updated main.
- Stage only this slice's files per commit; leave unrelated android/package/TodayFieldConditions changes alone.
- Type-check + full suite green (37 pre-existing suite failures are the known main baseline; confirm no *new* failures via stash-and-rerun if in doubt).
- Real-screen smoke: `/ops`, `/jobs/<id>/v2`, a reports page, and one contact action — auth holds, no regressions.
- Hold the `--no-ff` merge to main for Eddie's go-ahead after prod smoke.
