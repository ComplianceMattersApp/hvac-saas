# Compliance Matters Software — Pre-Launch Confirmation Checklist

**Status:** ACTIVE PRE-LAUNCH PLANNING SUPPORT DOC  
**Authority:** Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`  
**Purpose:** Keep final launch enablements, hardening items, and rollout confirmations visible so they do not fall off the agenda while core development continues.

---

## 1. What this document is

This is a **launch-readiness checklist**, not the operational source of truth.

If any item here conflicts with the active spine, the spine wins.

---

## 2. Pre-launch enablement items

### 2.1 Supabase Auth leaked password protection
- Enable leaked password protection when the required paid plan / launch readiness is in place.
- Treat as a launch hardening item, not a current development blocker.
- Verify the warning is cleared before launch.

### 2.2 SMS / on-the-way messaging
- Keep SMS/on-the-way messaging wired directionally in product planning.
- Do not fully configure/send live messages until right before launch.
- Final provider/payment-backed setup belongs to the pre-launch window.
- Verify wording does not imply live texting is active until setup is complete.

### 2.3 Payment/live enablement readiness
- Confirm launch posture remains `payment-ready by design, payment-active later` unless explicitly changed.
- Confirm Phase P1 payment-ready foundation is complete, while live processor-backed payment execution remains later/pre-launch enablement work.
- Confirm Stripe Platform Subscription V1 is implemented and live-smoke confirmed for platform account onboarding.
- Confirm this Stripe work is separate from tenant customer invoice payment execution.
- Verify no UI implies live processor-backed payment collection before it truly exists.
- Confirm Stripe-first future direction and QBO-optional boundary remain intact.
- Confirm recent invoice/payment wording polish remains honest:
  - payment entries are tracking-only and do not execute card charges
  - no live Pay Now/Charge Card/checkout/refund/dispute/payout language appears as active behavior

### 2.3.1 Launch-readiness catch-up confirmations (completed)
- Service / Visit Scope clarity pass is complete:
  - Service Details vs Visit Scope purpose wording is clarified on job detail
  - Job Title fallback copy is clarified
  - no model/validation/billing/ECC/RLS behavior changes were introduced
- Invoice job-detail TLC pass is complete:
  - panel scanability and issue/send/payment/void wording are clearer
  - invoice truth anchor is explicit; payment recording remains tracking-only
  - external-billing lightweight wording emphasizes Invoice Sent tracking
- Internal invoice prefill fallback hardening is complete where source fields exist; existing drafts are not overwritten.
- Address state capture/wiring pass is complete for relevant intake/finalization seams and supports billing-state prefill where source data is captured.
- Internal invoice void recovery/replacement pass is complete:
  - voided invoices remain historical
  - voided invoices do not satisfy closeout billed truth
  - replacement draft flow is available for same-job continuity
- Invoice report wording polish is complete:
  - Send Status replaces Comm State
  - Payment Count replaces Payments
  - CSV header wording aligned where applicable

### 2.3.2 Stripe platform onboarding status and live rollout confirmation
- Stripe Platform Subscription V1 is implemented and has now passed live production smoke for platform account onboarding.
- Live Stripe Product/Price is configured for the flat platform account subscription.
- Vercel production env is configured with live Stripe values.
- Live Stripe webhook endpoint is configured for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Production Checkout successfully opened live Stripe Checkout.
- Live subscription completion succeeded on a normal non-owner test account.
- Vercel logs confirmed `/api/stripe/webhook` returned `200`.
- `platform_account_entitlements` synced correctly after live purchase:
  - Billing Customer: Linked
  - Subscription: Active
  - Period End populated
- Manage billing path remains available.
- Local sandbox smoke and hardening also remain confirmed:
  - `/api/stripe/webhook` bypasses session-auth proxy redirect (no Stripe 307 redirect loop)
  - webhook signature verification remains enforced inside `app/api/stripe/webhook/route.ts`
  - unmanaged/fixture `checkout.session.completed` events are safely ignored with 200
  - period-end mapping uses `subscription.items.data[*].current_period_end` with legacy fallback to `subscription.current_period_end`
- This remains platform account subscription billing only.
- Sandbox/test Stripe values must never be committed.
- `.env.local` remains local-only.
- Local Stripe CLI webhook secret is not the same as deployed/live webhook secret.
- Keep this priority separate from tenant customer invoice payment execution.
- Tenant customer invoice payment execution remains deferred unless explicitly pulled forward.
- Live payment execution surfaces (Pay Now/Charge Card/checkout/refunds/disputes/payouts) remain deferred.

### 2.4 First owner onboarding/provisioning readiness
- **V1 implemented and browser-smoked.** Invite-only, platform-admin/operator provisioned. Not public signup.
- Confirmed: provisioning script (`scripts/provision-first-owner.ts`) requires explicit allow flags for apply mode; defaults to dry-run.
- Confirmed: provisioning confirms/creates auth user, profile, owner-anchored `internal_users` row, `internal_business_profiles`, `platform_account_entitlements`.
- Confirmed: internal/comped entitlement support is complete for owner-safe accounts.
- Confirmed: production owner account is protected with `entitlement_status = active`, `seat_limit = null`, `notes = internal_comped_v1`, and no Stripe customer/subscription linkage.
- Confirmed: sandbox owner account is aligned to the same protected comped pattern.
- Confirmed: production owner account and Terry are protected under the production account-owner entitlement.
- Confirmed: owner/internal comped accounts are not pushed into Stripe Checkout.
- Confirmed: first-owner marker is durably written to user metadata before invite send.
- Confirmed: first-owner routing seam (`lib/auth/first-owner-routing.ts`) detects marker and confirms all anchor rows before routing; fails closed if any row is missing.
- Confirmed: first owner acceptance (`/set-password?mode=invite`) routes to `/ops/admin`; Admin Center + Account Setup readiness card renders.
- Confirmed: normal internal user routing (`/ops`) and contractor routing (`/portal`) branches are preserved.
- Confirmed: public self-signup remains intentionally deferred for a later SaaS growth phase.
- **Pre-launch operator runbook item:** before onboarding the first real production account, operator must run dry-run first, verify the intended Supabase project, then run apply with both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true`. Note: the production-flag is also required for any hosted Supabase project (including sandbox) because `.supabase.co` URLs are classified as production-like remote targets.
- Runbook reference: `docs/ACTIVE/First_Owner_Provisioning_Runbook.md`.

### 2.5 Admin readiness checklist confirmation
- Confirm Admin Readiness / Setup Checklist V1 is present and working on `/ops/admin` and contextually visible on `/ops/admin/company-profile`.
- Confirm readiness packaging remains read-only derived state from existing tenant/account sources (no new readiness truth table).
- Confirm required criteria and optional criteria render separately with clear setup guidance.
- Confirmed: setup-progress timestamps were added at `internal_business_profiles.profile_reviewed_at` and `internal_business_profiles.team_reviewed_at`, and applied in sandbox and production.
- Confirmed: readiness now separates provisioning-created foundation rows from user-completed onboarding actions.
- Confirmed: a newly provisioned standard account first login shows `0 of 5 complete`, not a misleading `5 of 5 complete`.
- Confirmed: saving company profile marks the profile-related readiness steps complete.
- Confirmed: confirming team setup marks the team step complete.
- Confirmed: production browser verification showed the newest account at `0 of 5` on first login.
- Confirmed: `/ops/admin/internal-users` launch cleanup removed/hid the `Link existing auth user` panel from the normal admin page while preserving Invite teammate, team setup confirmation, and the team member list.
- Closeout clarification: this roadmap area is closed at the current baseline, but readiness and first-owner provisioning remain required pre-launch verification/runbook checks.

### 2.6 Launch billing decision (confirmed)
- V1/live launch uses a flat platform account subscription with unlimited users.
- Active user count remains visible.
- Per-seat billing remains a desired later track, but is not enforced in V1/live launch.
- Future per-seat work should include seat-limit enforcement, Stripe quantity sync, proration handling, and customer portal quantity rules.

### 2.7 Pricebook invoice-line sourcing promotion confirmation (C1B/C1C)
- Completed: Pricebook C1B/C1C invoice-line sourcing promotion is production-promoted and production-smoke confirmed.
- Completed verification on promoted behavior:
  - active nonnegative items are selectable
  - inactive items are not selectable
  - negative/default-credit items are blocked/deferred
- Completed verification of frozen invoice-line snapshot/provenance fields for Pricebook-backed adds:
  - `source_kind`
  - `source_pricebook_item_id`
  - `category_snapshot`
  - `unit_label_snapshot`
- Completed verification that manual invoice line add/edit/remove flow remains intact after Pricebook-backed adds.
- Completed verification that issued/void invoices remain non-editable for Pricebook add controls.
- Completed verification that wording remains honest and does not imply live payment execution.
- Deferred policy remains unchanged: negative/default-credit adjustments remain blocked/deferred pending a separate adjustment/credit policy track.
- Payment execution remains deferred; tenant customer card/checkout charging is not part of this closeout.

### 2.8 Pricebook starter seeding promotion confirmation (D2C-3/D2C-4)
- Completed: D2C-3/D2C-4 are production-promoted.
  - D2C-3: starter seed helper foundation
  - D2C-4: first-owner provisioning integration + structured operator output
- Completed: production dry-run smoke confirmed `pricebookSeeding` output shape.
  - top-level mode was `dry_run`
  - `pricebookSeeding` preview returned the V1 starter set (`inserted_count = 12`, `skipped_count = 0`)
  - errors were empty and invite send was false
- Confirmed: no apply/write/invite action occurred during smoke.
- Before onboarding first real production accounts, operators must:
  - run dry-run first
  - verify production project ref before each run
  - confirm `pricebookSeeding` preview output is present and sane
  - run apply only when intentionally provisioning a real account

---

## 3. Support / customer-operations readiness

### 3.1 Remote support access model
- Define a safe way for internal support staff to assist customer accounts remotely.
- Do not rely on informal tenant-boundary bypass or raw database access as the product answer.
- Support access must preserve:
  - tenant isolation
  - auditability
  - least privilege
  - explicit support-session or scoped-access behavior

### 3.2 Internal support operations
- Confirm support contact/business identity surfaces are ready enough for customer-facing use.
- Confirm support workflow expectations are documented for launch.

---

## 4. Deferred but pinned hardening items

### 4.1 `pg_trgm` in `public`
- Current advisor warning is acknowledged and intentionally deferred.
- `pg_trgm` is actively backing live trigram indexes for customer/location search.
- Any move out of `public` must be handled as a dedicated search/index maintenance pass with regression testing.
- Preferred timing: deliberate pre-launch hardening window or immediate post-launch maintenance, depending on stability risk.

---

## 5. Final launch confirmation sweep

Before launch, confirm:
- core operational workflows still pass live smoke testing
- contractor intake / portal flows still behave correctly
- internal/admin critical paths still behave correctly
- notifications and awareness surfaces are honest and current
- billing/payment wording remains truthful
- tenant customer invoice payment execution is still not live
- pre-launch enablements above are either completed or intentionally deferred with explicit decision
- no deferred hardening item has been silently forgotten

---

## 6. One-line definition

This checklist exists to keep the final launch-critical enablements, support requirements, and deferred hardening tasks visible so launch readiness is deliberate rather than accidental.
