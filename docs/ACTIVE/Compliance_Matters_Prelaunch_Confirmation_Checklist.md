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
- Verify no UI implies live processor-backed payment collection before it truly exists.
- Confirm Stripe-first future direction and QBO-optional boundary remain intact.

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
