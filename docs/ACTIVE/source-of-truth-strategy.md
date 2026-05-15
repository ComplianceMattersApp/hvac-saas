# Source-of-Truth Strategy (LOCKED) — Phase 2 Closeout

**Project:** Compliance Matters Software (Next.js App Router + Supabase)  
**Status:** LOCKED (Strategy B)  
**Effective Date:** 2026-02-24 (Phase 2 Closeout)

## Purpose

This document defines the authoritative data sources for customer/location/job display fields and for ECC/HERS operational status resolution.

This is locked to prevent drift, regressions, and “snapshot vs normalized” confusion.

---

## Strategy B: Hybrid Snapshots + Normalized Sources (LOCKED)

### Canonical Sources
- **Customers:** `customers` table is the canonical source of customer identity + contact details.
- **Locations:** `locations` table is the canonical source of job site address details.

### Snapshot Fields (Operational Convenience)
Some screens still read snapshot fields from `jobs` (e.g., `customer_phone`, `job_address`, `city`).  
These snapshot columns are allowed as a *performance/operational convenience layer* (fast Ops display, minimal joins), but are **NOT** canonical.

**Rule:** If snapshot fields exist, they must be kept in sync at defined sync points.

---

## ECC/HERS Outcome Source of Truth (Operational Resolution)

### Canonical Test Outcomes
ECC test outcomes are canonical in:

- `ecc_test_runs`
  - `computed_pass` (derived from saved readings and rules)
  - `override_pass` (manual decision; used for smoke tests, exemptions, etc.)
  - `is_completed` (controls whether a run counts toward job resolution)
  - `data` and `computed` (audit + CHEERS reporting support)

### Job-Level Operational Projection
Job operational state is a projection derived via:

- `evaluateEccOpsStatus(jobId)`  
  - derives `jobs.ops_status` transitions for ECC jobs based on completed runs

**Rule:** UI must not “guess” job ECC resolution. It should rely on `jobs.ops_status` (projection) which is derived from `ecc_test_runs` (canonical).

---

## Required Sync Points (Snapshots)

Snapshot sync exists to support legacy reads and keep the Ops UI stable until normalization is complete.

### Sync Points (Must Trigger Snapshot Sync + Revalidate)
1) **Customer Edit**
   - Updates `customers` and optionally related snapshot fields on `jobs` for existing jobs.
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]` (where relevant)

2) **Location Edit**
   - Updates `locations`
   - Updates snapshot address fields on `jobs` where relevant
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]`

3) **Job Intake / Job Creation**
   - When a job is created and linked to customer + location:
     - Populate job snapshot fields from canonical tables (or directly from form if canonical records are created in the same flow)
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]`

4) **Job Relink / Customer or Location reassignment (Future)**
   - If job’s customer_id/location_id changes:
     - Re-stamp snapshot fields to match new canonical references
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]`

5) **Schedule-only update preservation rule (implemented)**
   - Schedule updates submitted through `updateJobScheduleFromForm` must preserve existing permit fields when permit values are omitted from the schedule form payload.
   - Omitted schedule-form submits must not clear `permit_number`, `jurisdiction`, or `permit_date`.
   - This is a data-preservation rule for partial updates and does not alter lifecycle ownership, queue semantics, or scheduling source-of-truth boundaries.

---

## ECC-Specific Sync / Events (Operational Log Rules)

### Timeline Source
- `job_events` is the canonical event log for:
  - status changes
  - scheduling events
  - retest chain events
  - customer attempt call logs
  - test resolution markers (job_passed/job_failed, retest_passed/retest_failed)

**Rule:** Do not add a new timeline table. Continue using `job_events`.

### Retest Resolution Loop
- Jobs may have `parent_job_id` to represent retests.
- When retest is completed:
  - child run completion can generate events
  - parent can receive `retest_passed` / `retest_failed` and ops status may resolve accordingly

**Rule:** Parent job state should be resolved via events + ops status projection, without breaking existing flows.

---

## UI Read Rules (Phase 2 Stable State)

We acknowledge the current UI is hybrid:
- Some pages read canonical (`customers`, `locations`) directly.
- Some pages still read job snapshots (`jobs.customer_phone`, `jobs.job_address`, etc.)

This is acceptable under Strategy B **only if the sync points above remain intact**.

**Phase 2 policy:** No major refactors to normalize reads across the app right now.  
Future work may normalize pages gradually, but must not break the snapshot sync safety net until complete.

---

## Guardrails (Do Not Break)

1) **Never rely on jobs snapshot fields as canonical.**
2) **If a screen reads snapshots, snapshots must be synced at the defined sync points.**
3) **ECC resolution must come from completed `ecc_test_runs` via `evaluateEccOpsStatus(jobId)`.**
4) **Do not introduce a new timeline/events table. Use `job_events`.**
5) **All redirects from tests pages must preserve `t=` and never emit blank `s=`.**
6) **Phase 2 logic is “stable.” Future changes should be additive or cleanup-only unless explicitly planned.**

---

## Notes for Future Normalization (Phase 3+)

If/when we move from Strategy B → Strategy A (fully normalized reads):
- Replace snapshot reads in `/ops`, job cards, and job overview with canonical joins
- Keep snapshot sync temporarily until all legacy reads are removed
- Remove snapshots only after:
  - all reads are normalized
  - test coverage or field validation confirms no regressions

---

## SMS Communication Authority Guardrail

Job snapshot fields (`jobs.customer_phone`, `jobs.customer_email`, `jobs.job_address`, etc.) must **never** be used as the authoritative source for provider-powered SMS recipient selection.

- Snapshots are Ops display convenience fields only.
- Canonical customer phone (`customers.phone`) is the identity reference for Ops context, but it is not role-tagged, not consent-scoped, and not suppression-aware.
- A first-class recipient/contact role model is required before live SMS. See: `docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md`.
- Future On-The-Way workflow and control-gate contract is documented in `docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md` (background/event-driven evaluation, no job-detail preview card, admin-only future template governance, fail-closed blocked-send posture).
- Future settings ownership and IA contract is documented in `docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md` (Settings -> Communications ownership; Company Profile boundary separation; activation-control posture).
- Future intent/delivery audit semantics are documented in `docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md` (job_events remains non-authoritative for provider truth; provider callback updates must be trusted/server-side and account-scoped).
- Slice E2 implementation closeout is complete in commit `b90c9ea` with migration `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql` adding `sms_message_intents` and `sms_provider_deliveries` as account-scoped audit foundations.
- Authority boundary remains locked after E2: `sms_message_intents` is send-request/decision audit context only, `sms_provider_deliveries` is provider submission/callback truth only, `job_events` remains non-authoritative for provider truth, and manual contact logs remain separate.
- E2 did not add live SMS, send endpoint, webhook, provider integration, or provider delivery write path; real SMS remains deferred pending activation gates.