# Estimates AI V1 — Current State

Status: SHIPPED — describes what is in the code, not a plan
Date: 2026-08-09 (documenting work recorded in the Estimates runbook changelog v1.9, 2026-07-20)
Authority: `lib/ai/`, `lib/estimates/estimate-coach.ts`, and `app/estimates/[id]/actions.ts` are the authority.

Until now this feature was documented by a single changelog line, despite calling a paid third-party provider against a spending cap. This document records what it actually does, what leaves the building, and — the question that prompted it — **what happens when the cap is reached**.

## The two AI surfaces

Both live on the estimate detail page and are **operator-triggered only**. Neither runs on page load, on save, or on any schedule.

1. **Estimate Coach** (`lib/ai/estimate-coach-provider.ts`) — "Review whole estimate". Returns suggestions about the estimate as a whole.
2. **Line description rewrite** (`lib/ai/estimate-line-rewrite-provider.ts`) — turns a rough internal note into field-friendly customer-facing wording.

Neither can modify the estimate. There is **no apply action** — the panel states "Nothing was changed", and a wiring test asserts the panel contains no "Apply suggestion" affordance. A human retypes or copies anything they want to keep.

## Provider boundary

| Property | Value |
|---|---|
| Provider | OpenAI |
| Model | `gpt-5.6-luna` (`ESTIMATE_COACH_MODEL`, shared by both surfaces) |
| Max output tokens | `1_200` |
| Reasoning effort | `none` |
| `store` | `false` — the provider is instructed not to retain the request |
| Tools | none; a wiring test asserts the provider file contains no `tools:` |

`store: false` and the absence of tools are both deliberate and test-enforced. The model receives estimate context and returns text; it cannot call back into the application.

## Feature flags, and failing closed

Three flags gate the lane: `ENABLE_ESTIMATES`, `ENABLE_ESTIMATE_COACH`, `ENABLE_ESTIMATE_COACH_AI`.

The AI action checks `!isEstimatesEnabled() || !isEstimateCoachAiEnabled()` **before** `requireInternalUser` and before any provider work — a wiring test asserts that ordering. The estimate is then reloaded server-side and account-scoped via `getEstimateById({ estimateId, internalUser, supabase })`; the client cannot hand the provider an estimate the actor is not entitled to.

## The spending control

Two tables: `ai_global_budget_settings` (a singleton row) and `ai_usage_events`.

The cap is **global to the platform owner, not per account** — one budget across every tenant, with usage attributed `byFeature` and `byAccount` for visibility. Default is `DEFAULT_AI_MONTHLY_LIMIT_MICROUSD = 25_000_000` micro-USD, i.e. **$25/month**, owner-configurable between $1 and $1000 (`dollarsToMicrousd`). The window is the calendar month in **UTC**.

Every request follows **reserve → call → settle**:

1. `reserveAiUsage` calls the `reserve_ai_usage_budget` RPC with an estimated cost. The reservation is atomic and happens *before* the provider is contacted.
2. The provider call runs.
3. `settleAiUsage` records the measured actual cost and token counts, replacing the estimate.
4. If the provider fails *before completing*, `releaseAiUsage` returns the reservation so a failed call does not consume budget.

Remaining budget is `limit − completed − reserved`, so in-flight requests cannot collectively overspend the cap.

## What happens when the cap is reached

This was an open question; it is answered here from the code.

**It fails closed, safely, and cheaply.** When the reservation is refused with reason `monthly_cap_reached`:

- **No provider request is made.** The refusal happens before the OpenAI call, so nothing is spent.
- **The estimate is untouched.**
- The operator gets a plain message — for the coach, *"The monthly AI budget has been reached. Deterministic guidance remains available."*; for line rewrite, *"The monthly AI budget has been reached."*

The coach message is accurate, not a euphemism: `buildEstimateCoachReport` in `lib/estimates/estimate-coach.ts` is a **deterministic, non-AI coach** that keeps working with the cap exhausted. Losing AI degrades the feature; it does not remove it.

Two adjacent behaviors, both also fail-closed:

- **Owner pause** — if the budget is disabled rather than exhausted, the message is *"AI suggestions are paused by the Platform Owner."*
- **Budget controls unavailable** — if the RPC itself errors, the action returns *"AI budget controls are unavailable. No provider request was made."* It does **not** proceed unmetered. An outage in the accounting for spending stops the spending.

There is no queueing, no automatic retry, and no overage. The next calendar month resets the window.

## Operating it

Usage and remaining budget surface in the owner console (`lib/ai/__tests__/owner-console-ai-budget-wiring.test.ts` covers the wiring). `loadAiBudgetSnapshot` returns completed cost, reserved cost, remaining, completed/rejected request counts, and the `byFeature` / `byAccount` breakdowns.

`rejectedRequests` is the number worth watching: a rising count means operators are hitting the cap and silently losing the AI path.

## Not done

- No per-account or per-user budget; the cap is global, so one busy tenant can exhaust it for everyone.
- No alerting when the budget nears exhaustion — it is a pull-based console number, and `rejectedRequests` is the only signal that anyone was turned away.
- No apply-suggestion path, deliberately.
- No evaluation harness for suggestion quality; correctness of the advice is unmeasured.
- The trainer AI (`lib/help-assistant/trainer-provider.ts`, feature key `trainer`) shares the same budget but is documented separately in `Trainer_AI_Model_Optimization_Plan.md`, which is a plan rather than a record of what shipped.
