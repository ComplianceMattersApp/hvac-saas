# Performance Handoff — Identity Resolution Fast-Path

**Lane:** Speed / launch-readiness. **Status at handoff:** Slice 1 implemented (uncommitted), not yet type-checked/tested/smoked in a working environment.

---

## Root cause (what prior passes missed)

Prior performance work slimmed renders on `/ops` and `/jobs/[id]`, then attributed the residual spikes to "shared Supabase variance." The real structural cost is **upstream of any single page**:

- `resolveDualContextAccess` (a serial chain: `auth.getUser` → `internal_users` → portal membership → active-seat count → `platform_account_entitlements`) runs **once in the root layout** (`app/layout.tsx`) **and again in the page** via `getRequestActorContext` (e.g. `app/ops/page.tsx`, `/today`, `/calendar`, `/jobs/new`).
- The root layout then adds three more **serial** reads: `profiles`, `getInternalUnreadNotificationBadgeCount`, `resolveProductModeForAccountOwnerId`.
- Net: ~10 serial Supabase round-trips, paid ~2× per hard load, before the page's own data loads.
- The root layout **re-runs after every Server Action / `revalidatePath`** (1099 call sites), so this same chain is on the critical path of **action-button settle** — the "delayed buttons" symptom.
- Only one helper in the codebase used React `cache()`, so none of this was deduped.

---

## Slice 1 — implemented (uncommitted). REVIEW + VERIFY THIS FIRST.

All changes are **behavior-preserving** (pure dedup + parallelization). No schema/migration, no Supabase RLS/policy, no auth/entitlement *semantics*, no revalidation/lifecycle, no invoice/billing/payment behavior changed.

**Files:**

1. `lib/auth/request-identity.ts` **(new)** — `getRequestDualContextAccess = cache(async () => resolveDualContextAccess({ supabase: await createClient(), getPortalAdmin: createAdminClient }))`. React `cache()` memoizes per server request, so identity resolves once per request and is shared by the layout + every page. Server Actions run in their own request context, so they still resolve fresh identity after a mutation (correct).

2. `lib/auth/dual-context-access.ts` — `internal_users` lookup and portal membership now run in a single `Promise.all` (they are independent; −1 serial round-trip). Entitlement still runs after (it depends on `internalUser`). Also added a trailing `// perf:` comment.

3. `lib/auth/request-actor-context.ts` — now calls `getRequestDualContextAccess()` and derives `user` from `access.user`, dropping its own separate `auth.getUser()`. Unauthenticated path preserved (`!access.user` → `buildUnauthenticatedActorContext`). Removed now-unused imports (`resolveDualContextAccess`, `isSessionInvalidError`).

4. `app/layout.tsx` — uses `getRequestDualContextAccess()`; `profiles` read kicked off as `profileFullNamePromise` and awaited just before first use; notification badge + product mode run in `Promise.all`. Removed now-unused imports (`resolveDualContextAccess`, `createAdminClient`).

**Verify Slice 1:**

1. `npx tsc --noEmit` → clean.
2. Full test suite (`vitest run`) → all passing. Pay attention to `lib/auth/__tests__/dual-context-access.test.ts` and the actor-context / dual-context routing wiring tests — the pure `resolveDualContextAccess` signature is unchanged, so these should pass untouched.
3. Confirm no behavior change: identity/entitlement/portal outcomes identical; only duplicate work removed and independent reads parallelized.
4. Smoke with `OPS_TIMING_DEBUG=true` and `JOB_DETAIL_TIMING_DEBUG=true`: load `/ops` and `/jobs/[id]`, then run a contact action. Expect fewer/faster `requestActorContext:getUser` + `assembly` phases and faster post-action settle. Capture before/after numbers.
5. Merge per standard discipline (no-ff, prod smoke) only after the above.

---

## Slice 2 — next (do only after Slice 1 is merged/verified)

**Goal:** dedupe the remaining `auth.getUser()` fan-out. There are ~123 `auth.getUser()` call sites; many resolve the same user multiple times within a single request.

**Approach (measured slice, not a broad refactor):**

- Add a `cache()`-wrapped `getRequestUser()` to `lib/auth/request-identity.ts` (create client, `auth.getUser()`, return `user | null`), and have `getRequestDualContextAccess` consume it so the two share one getUser per request.
- Migrate the **highest-traffic authenticated read paths first** (root layout already done; then `/ops`, `/today`, `/jobs/[id]`, `/calendar`) to the shared `getRequestUser()` / `getRequestActorContext()` instead of ad-hoc `supabase.auth.getUser()`.
- Do **not** touch Server Actions' own `getUser` calls (they must re-validate post-mutation) or any security-gate `getUser` where a fresh network validation is intentional — flag those, don't migrate them.
- Benchmark each surface before/after with the existing timing flags; commit per surface.

---

## Deferred (separate lanes — NOT part of Slice 1/2)

- **`revalidatePath` audit:** 1099 call sites; some are likely over-broad and force full-tree (incl. root layout) re-renders after actions. Per guardrail, trim **only** with dependency mapping — this is its own audited lane.
- **`getUser` → `getClaims`:** could replace some network-validating `getUser` calls with local JWT verification, but it's security-sensitive; separate audit.
- **Build tooling:** `package.json` uses `next dev --webpack` / `next build --webpack`, forcing webpack instead of Next 16's Turbopack. This affects **your dev/build speed, not end-user runtime.** Consider dropping `--webpack` (or moving to `--turbopack`) after confirming no custom webpack config is relied on.

---

## Locked guardrails (from Active Spine V4.0)

- Do not chase speed by weakening truth; no optimistic final status/action state without explicit approval.
- Do not trim revalidation without dependency mapping.
- Do not touch invoice/billing/payment performance paths casually — require a separate billing-safe audit.
- Workflow: audit → small slice → benchmark → commit → docs update. Real-screen smoke is mandatory (tests alone have missed prod bugs three times).
- Truth-boundary model is a hard constraint: Work Items = operational truth, Invoice Charges = billed truth, Pricebook = catalog truth, Payments = collected truth.

---

## One cleanup note

A temporary `.perf-canary.txt` was created and removed during this session; it should not be present. If your working tree shows it, delete it.
