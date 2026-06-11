# ECC Guided Workflow Separation Model Lock

Status: ACTIVE MODEL LOCK - current ECC guided workflow slices implemented for Permit Needed, failed/correction display, confirmed Retest Ready, and Move to Needs Scheduling.

Purpose: Freeze the ECC guided workflow model and record the current implemented state. This document separates ECC blocker, failure, retest, handoff, and cert-closeout behavior from the service follow-up workflow.

Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and aligned with `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`, `docs/ACTIVE/ECC_Test_Workflow_Maturity_Closeout.md`, and current invoice/payment source-of-truth specs.

Mode: Docs/model lock only. This document authorizes no new product code, schema, migration, Supabase, portal, invoice, payment, service workflow, or runtime behavior changes by itself.

---

## 1. Core Separation

Service follow-up and ECC guided workflow are separate models.

Service follow-up:

- Uses `Materials Needed`, `Approval Needed`, and `Other`.
- Continues through linked return visits.
- Turns the parent service job historical/continued after child continuation exists.

ECC guided workflow:

- Uses ECC-specific blocker and test/cert language.
- Does not reuse service follow-up labels.
- Preserves ECC test truth, cert closeout truth, invoice truth, handoff truth, and service-case history as separate concerns.

Rejected cross-over:

- Do not label ECC blockers as `Materials Needed`, `Approval Needed`, or `Other`.
- Do not treat ECC retests as service return visits.
- Do not let service continuation rules hide unresolved ECC permit, failed, correction, retest, handoff, or cert blockers.

---

## 2. Approved ECC Guided States

The approved user-facing ECC workflow language is:

- `Permit Needed`
- `Failed / Correction Required`
- `Corrections Submitted` / `Under Review`
- `Retest Ready`
- `Linked Retest Job`
- `ECC Handoff`
- `Cert Closeout Blocked`

Internal storage may continue to use existing routing/projection fields where safe. User-facing UI should show plain ECC language rather than raw internal keys such as `pending_info`, `pending_office_review`, or `retest_needed`.

---

## 3. Permit Needed

If ECC closeout/cert completion is attempted or evaluated and `permit_number` is blank, the system should surface:

`Pending Info: Permit Needed`

First posture:

- Use existing storage/pathing where safe.
- Preferred initial storage is likely `ops_status = pending_info` and `pending_info_reason = "Permit Needed"`.
- No free-form reason is required for this automatic blocker.

Primary action:

- `Permit Available`
- User enters permit number.
- Saving permit releases/recomputes the ECC closeout blocker through existing safe behavior.

Boundaries:

- Missing permit blocks cert closeout.
- Missing permit should not automatically block invoice send.
- Invoice UI may show: `Invoice allowed - cert closeout still blocked`.
- Contractor/portal visibility may show Permit Needed if current portal model safely supports it.

---

## 4. Failed / Correction Required

ECC `Failed` comes only from ECC test truth.

Canonical failed sources:

- completed required ECC test runs
- computed pass/fail result
- approved override result where existing ECC test logic supports it

Failed does not mean generic service trouble.

User-facing behavior:

- Cards should show `Failed / Correction Required`.
- Front-facing card copy should include the failure/correction reason clearly without forcing the user to open the job.
- Internal users may add clarification notes where current behavior supports it.
- Contractor-facing copy should be contractor-safe.

Closeout behavior:

- Failed blocks cert closeout until corrected, reviewed, or retested as appropriate.
- Failed should not automatically block invoice send.
- Invoice/payment/no-charge state must not clear the failed blocker.

---

## 5. Corrections Submitted / Under Review

Contractor correction submission should display internally as:

- `Corrections Submitted`
- or `Under Review`

Raw `pending_office_review` should not appear in normal user-facing copy.

Internal review decisions:

- Accept correction and continue cert closeout where valid.
- Request more correction.
- Mark `Retest Ready`.

Truth boundaries:

- Contractor submission is evidence/review truth.
- Internal review decision is operational disposition truth.
- Neither submission nor review should mutate invoice/payment truth.

---

## 6. Retest Ready

Contractor `retest_ready_requested` remains a portal/event signal until an internal user confirms it.

Internal confirmed `Retest Ready` means:

> The correction/review state is ready for another ECC test visit.

Actions:

- `Move to Needs Scheduling`
- `Schedule Retest Now` remains deferred.

Linked retest behavior:

- The linked retest job continues the same service case/history.
- The original failed job remains the historical failed/correction record.
- `Move to Needs Scheduling` creates the linked retest child as `need_to_schedule`.
- The retest child becomes the active scheduling item immediately after creation.
- The retest child becomes field-actionable only when its own scheduling/assignment rules make it actionable.

Rejected behavior:

- Do not treat Retest Ready as a service return visit.
- Do not put unscheduled retest backlog into rater/technician My Work.
- Do not erase the original failed/correction history.

---

## 7. ECC Handoff

ECC handoff is separate from permit, failed, correction, and retest workflows.

Approved handoff language:

- `Handoff Sent`
- `Handoff Accepted`
- `Handoff Completed`
- `Handoff Rejected`
- `Handoff Returned / Needs Review`, where supported

Boundaries:

- Handoff completion should not silently clear permit, failed, correction, retest, or cert closeout blockers.
- Any future handoff-to-job or handoff-to-cert transition must be explicit.
- Handoff request state remains durable handoff truth, not a substitute for ECC test truth or cert closeout truth.

---

## 8. Invoice vs Cert Closeout

Invoice/payment/no-charge truth is separate from ECC cert closeout truth.

ECC invoice can be sent while cert closeout is blocked by:

- `Permit Needed`
- `Failed / Correction Required`
- `Corrections Submitted / Under Review`
- `Retest Ready`

Invoice send, payment collection, manual payment, no-charge handling, or external billing must not auto-clear ECC blockers.

Useful UI language:

- `Invoice allowed - cert closeout still blocked`
- `Cert closeout blocked - invoice/payment state unchanged`

Payment truth remains webhook/manual payment truth only.

---

## 9. Portal Visibility

Contractor portal should show contractor-actionable ECC blockers in plain language:

- `Permit Needed`
- `Failed / Correction Required`
- `Corrections Submitted`
- `Retest Ready Requested`

Portal should not expose raw internal statuses such as:

- `pending_info`
- `pending_office_review`
- `retest_needed`

Portal copy must remain contractor-safe and should not expose internal-only notes, billing authority, financial reports, or tenant operations data.

---

## 10. Owner Decisions Recorded

Recorded decisions:

- First posture for permit blocker may use existing `ops_status = pending_info` and `pending_info_reason = "Permit Needed"` where safe.
- Permit Needed requires no free-form reason.
- Saving a permit should release/recompute the ECC closeout blocker through existing safe behavior.
- ECC Failed comes only from ECC test truth.
- Failed blocks cert closeout but does not automatically block invoice send.
- Contractor correction submission should be displayed as Corrections Submitted / Under Review, not raw `pending_office_review`.
- Contractor `retest_ready_requested` remains an event/portal signal until internal confirmation.
- Internal confirmed Retest Ready is stored as `ops_status = retest_needed` plus a `retest_ready_confirmed` history event.
- Internal confirmed Retest Ready offers `Move to Needs Scheduling`.
- `Schedule Retest Now` remains deferred.
- Move to Needs Scheduling creates the linked retest child job.
- Linked retest jobs continue the same service case/history.
- Original failed jobs remain historical failed/correction records.
- ECC handoff is separate from permit, failed, correction, and retest workflows.
- Handoff completion must not silently clear job/cert blockers.
- Invoice/payment/no-charge truth is separate from ECC cert closeout truth.
- Invoice can be sent while cert closeout remains blocked.
- Invoice/payment/no-charge actions must not clear ECC blockers.
- Portal must use plain ECC language and avoid raw internal statuses.

Owner decisions still deferred:

- What exact internal action name should represent "request more correction" after review.
- Whether handoff returned/needs-review should use existing `rejected` handoff status plus copy, or needs a future explicit returned status.
- Schedule Retest Now interaction details.
- Install with Permit guided workflow details.

---

## 11. Implementation Slice Lock

Implemented current slices after this docs lock:

- `ECC-B: Permit Needed automatic blocker + Permit Available action`
- `ECC-C: Failed / Corrections Submitted / Retest Ready display cleanup`
- `ECC-D: Confirm Retest Ready + Move to Needs Scheduling linked retest bridge`

Current implemented behavior:

- Permit Needed blocks cert closeout, not invoice truth.
- Pending office review is shown as Corrections Submitted / Under Review internally and Under Review in portal context.
- Retest Ready Requested remains contractor/event signal only.
- Confirm Retest Ready creates the confirmed internal state.
- Move to Needs Scheduling creates the linked retest child as the active scheduling item.
- Original failed/correction parent becomes historical/passive after child creation.

Still not implemented in the current pass:

- Schedule Retest Now.
- Handoff state changes.
- Portal redesign.
- Invoice/payment behavior changes.
- Service follow-up changes.
- Schema/migration unless an implementation blocker is proven and separately approved.

---

## 12. Explicit Non-Actions

This model lock does not implement:

- no product code changes
- no schema changes
- no migrations
- no Supabase commands or data writes
- no portal implementation
- no invoice implementation
- no payment, Stripe, QBO, SMS, or provider behavior changes
- no service follow-up workflow changes
- no role/permission changes
- no queue membership changes
- no status taxonomy expansion
