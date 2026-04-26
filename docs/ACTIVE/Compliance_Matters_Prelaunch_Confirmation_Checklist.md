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
- Verify no UI implies live processor-backed payment collection before it truly exists.
- Confirm Stripe-first future direction and QBO-optional boundary remain intact.

### 2.4 First owner onboarding/provisioning readiness
- **V1 implemented and browser-smoked.** Invite-only, platform-admin/operator provisioned. Not public signup.
- Confirmed: provisioning script (`scripts/provision-first-owner.ts`) requires explicit allow flags for apply mode; defaults to dry-run.
- Confirmed: provisioning confirms/creates auth user, profile, owner-anchored `internal_users` row, `internal_business_profiles`, `platform_account_entitlements`.
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
- Closeout clarification: this roadmap area is closed at the current baseline, but readiness and first-owner provisioning remain required pre-launch verification/runbook checks.

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
- pre-launch enablements above are either completed or intentionally deferred with explicit decision
- no deferred hardening item has been silently forgotten

---

## 6. One-line definition

This checklist exists to keep the final launch-critical enablements, support requirements, and deferred hardening tasks visible so launch readiness is deliberate rather than accidental.
