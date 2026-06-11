# Guided Workflow Maturation Closeout

Status: CLOSED for current service-side and ECC-side guided workflow maturation.

Purpose: Document the workflow model that is now implemented, committed, and pushed, and lock the boundaries that should prevent future drift.

Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and aligned with:

- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/ECC_Guided_Workflow_Separation_Model_Lock.md`
- `docs/ACTIVE/ECC_Test_Workflow_Maturity_Closeout.md`
- invoice/payment source-of-truth docs where billing separation is defined

Mode: Documentation/model closeout only. This document authorizes no product code, schema, migration, Supabase data, Stripe/payment, portal, handoff, or new workflow implementation changes by itself.

---

## 1. Core Product Principle

Complete what is true today. Keep unresolved workflow visible until handled with intent. Continue through the correct linked next job instead of blurring the original visit.

This principle now governs both service follow-up and ECC retest continuation:

- the original/parent visit records what happened;
- unresolved work remains visible to Ops in plain language;
- the linked child job becomes the active continuation only when the workflow intentionally creates it;
- field My Work should not regain completed parent visits;
- billing/payment/no-charge truth does not clear operational or cert blockers.

---

## 2. What Changed

The guided workflow maturation pass completed two separate lanes.

Service-side maturation:

- Field follow-up reasons are now `Materials Needed`, `Approval Needed`, and `Other`.
- All three require a free-form reason.
- Today's service visit becomes field-complete.
- The original visit becomes historical when a linked continuation exists.
- The unresolved issue remains visible in Ops/follow-up until handled with intent.
- Materials follow-up can progress through `Part Ordered` and `Part Arrived`.
- Approval follow-up can progress through `Approval Received`.
- Ready follow-ups can `Add to Scheduling Queue` or `Schedule Return Visit Now`.
- The linked return child job becomes the active work item.
- Service follow-up avoids same-visit resume or ready-to-continue language.

ECC-side maturation:

- ECC and service follow-up are explicitly separate guided workflows.
- `Permit Needed` is now a guided ECC cert-closeout blocker with a `Permit Available` action.
- Permit Needed blocks cert closeout, not invoice/payment truth.
- ECC failed/correction language is clarified as `Failed / Correction Required`, `Corrections Submitted / Under Review`, and portal-safe `Under Review`.
- `Retest Ready Requested` remains a contractor/event signal only.
- `Retest Ready` exists only after internal confirmation.
- `Move to Needs Scheduling` creates a linked retest child.
- `Schedule Retest Now` creates the linked retest child and schedules it immediately.
- The original failed/correction job becomes historical/passive after the retest child exists.
- The retest child becomes the active scheduling item.
- ECC handoff remains separate from permit, failed/correction, retest, and cert closeout blockers.

---

## 3. Service Workflow Final Model

Service field follow-up uses three field-facing outcomes:

- `Materials Needed`
- `Approval Needed`
- `Other`

All three require a free-form reason. Submitting any of them completes today's visit for field responsibility:

- `status = completed`
- `field_complete = true`
- `field_complete_at = now`
- `ops_status = pending_info`
- `on_hold_reason = null`
- `pending_info_reason = "[Label]: [reason]"`

The original service visit should be treated as historical once continuation exists. The unresolved reason remains visible in Ops and follow-up surfaces until handled with intent.

Materials path:

- original reason remains preserved;
- `Part Ordered` can be recorded;
- `Part Arrived` can be recorded;
- ready state can add a linked return child to scheduling or schedule it immediately.

Approval path:

- original reason remains preserved;
- `Approval Received` can be recorded;
- ready state can add a linked return child to scheduling or schedule it immediately.

Continuation rules:

- linked return child becomes the active work item;
- parent/original visit displays as continued/historical;
- parent/original visit does not remain active `Pending Info` after continuation exists;
- field My Work follows assignment/schedule rules for the child, not the historical parent.

Rejected service wording:

- do not say `resume same visit`;
- do not say `ready to continue` for the historical parent;
- do not hide the unresolved reason before it is handled with intent.

---

## 4. ECC Workflow Final Model

ECC guided workflow uses ECC-specific language and must not borrow service follow-up labels.

Permit path:

- Missing permit surfaces as `Permit Needed`.
- `Permit Available` captures permit details.
- Permit Needed blocks cert closeout.
- Permit Needed does not automatically block invoice send or payment truth.

Failed/correction path:

- `Failed / Correction Required` is driven by ECC test truth only.
- `Corrections Submitted / Under Review` is internal/Ops language for correction evidence under review.
- Contractor portal language is `Under Review`.
- Failed/correction states block cert closeout until resolved, reviewed, or continued into retest.
- Failed/correction states do not automatically block invoice send.

Retest path:

- Contractor `Retest Ready Requested` is event-only and does not mean confirmed Retest Ready.
- Internal confirmation creates the confirmed `Retest Ready` state.
- Confirmed Retest Ready exposes `Move to Needs Scheduling` and `Schedule Retest Now`.
- `Move to Needs Scheduling` creates the linked retest child job.
- `Schedule Retest Now` creates the linked retest child job and schedules it immediately.
- The linked retest child starts as the active `need_to_schedule` work item.
- The original failed/correction job becomes passive/historical once the active child exists.

Handoff path:

- ECC handoff remains separate from permit/failure/retest/cert closeout blockers.
- Handoff completion must not silently clear permit, failed/correction, retest, or cert closeout blockers.
- Any future handoff-to-job or handoff-to-cert transition must be explicit.

---

## 5. Service and ECC Separation Lock

Service follow-up:

- uses Materials Needed / Approval Needed / Other;
- uses linked return visits;
- can progress part/approval readiness;
- creates linked service return child jobs when continuation is intentional.

ECC workflow:

- uses Permit Needed, Failed / Correction Required, Corrections Submitted / Under Review, Retest Ready Requested, Retest Ready, linked retest child jobs, and ECC handoff;
- retest continuation is not a service return visit;
- failed truth comes from ECC test truth;
- cert closeout blockers remain separate from invoice/payment truth.

Do not cross the streams:

- do not show service `Can't finish today?` outcomes on ECC jobs;
- do not label ECC blockers as Materials Needed, Approval Needed, or Other;
- do not use service continuation logic to clear ECC permit/failure/retest/handoff/cert blockers;
- do not use invoice/payment/no-charge actions to clear operational workflow blockers.

---

## 6. Parent / Child Job Truth

Parent/original visit truth:

- records what happened on the original visit;
- preserves the original unresolved reason or ECC failure/correction history;
- becomes historical/passive after a linked continuation child exists;
- should not continue to present itself as the active work item.

Child job truth:

- represents the next active visit/work item;
- becomes actionable only through normal scheduling/assignment rules;
- appears in scheduling/dispatch/field surfaces according to its own state;
- carries the relevant service case/history continuity.

This applies to both:

- service linked return visits;
- ECC linked retest visits.

---

## 7. Ops / Card Display Truth

Ops and queue cards must explain the human workflow state, not expose raw routing keys.

Required display posture:

- no raw `pending_info` in normal user-facing labels;
- no raw `pending_office_review` in normal user-facing labels;
- show front-facing service reasons such as `Materials Needed: [reason]`, `Approval Needed: [reason]`, and `Other: [reason]`;
- show ECC labels such as `Permit Needed`, `Failed / Correction Required`, `Corrections Submitted / Under Review`, `Retest Ready Requested`, `Retest Ready`, and `Linked Retest Created`;
- collapse duplicate category/reason text where the category already says the same thing;
- preserve real details when the user typed a meaningful reason.

The reason is not decoration. It is operational truth for deciding the next action.

---

## 8. My Work Truth

Completed parent visits should not return to ordinary field My Work.

Rules:

- Service parent visits with field-complete follow-up become historical once continuation exists.
- ECC failed/correction parents with linked retest child become historical/passive once the child exists.
- Child jobs become field-actionable only when their own schedule/assignment/state makes them actionable.
- Unscheduled retest or return children belong to scheduling/Ops, not field My Work.

---

## 9. Billing Truth

Invoice/payment/no-charge truth is separate from workflow and cert closeout truth.

Locked rules:

- invoice send does not clear service follow-up blockers;
- invoice send does not clear ECC permit/failure/correction/retest/cert blockers;
- payment collection does not clear operational workflow blockers;
- no-charge or externally-billed outcomes do not complete workflow blockers;
- ECC invoice can remain allowed while cert closeout is blocked;
- billing closeout and cert closeout remain separate responsibilities.

Billing truth remains governed by invoice/payment source-of-truth docs and webhook/manual payment truth. This workflow closeout does not change Stripe, payment links, invoice status, send status, no-charge handling, or payment rows.

---

## 10. Deferred Items

Deferred items remain outside this current closeout:

- `Schedule Retest Now`
- ECC handoff cleanup
- Install with Permit guided workflow
- close follow-up / no return needed
- broader metadata consolidation for permit/schedule/contractor inline editing
- portal copy/follow-up refinements if not already fully covered
- dedicated ECC exception truth model only if future field use proves reporting/audit needs
- broader queue/read-model consolidation after the current labels stabilize

---

## 11. Explicit Non-Actions

This closeout records what is true today. It does not authorize or perform:

- no product code changes
- no schema changes
- no migrations
- no Supabase writes
- no Stripe/payment behavior changes
- no invoice/payment truth changes
- no portal authority changes
- no handoff behavior changes
- no callback workflow changes
- no new generic status taxonomy
- no service/ECC workflow blending

---

## 12. Current Lane Status

The guided workflow maturation lane is closed for the current pass.

Future work should begin from this model lock rather than reopening service/ECC separation, parent/child truth, My Work truth, or billing separation from scratch.
