# Compliance Matters Workflow Modernization B4-B Field Outcome / Exception Reason Audit

## 1. Status / Authority / Scope

Status: B4-B audit complete as docs-only planning.

Authority: This audit is subordinate to `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`, `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`, `docs/ACTIVE/Workflow_Modernization_B1_Current_Queue_Contract_Audit.md`, `docs/ACTIVE/Active Spine V4.0 Current.md`, and `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`.

Scope: Current-state mapping of field completion, outcome, waiting/exception reason, notes/photos/diagnostics, visit scope/work items, job events, return/follow-up, callback-like, and retest seams. This audit determines where a future lightweight "What happened today?" finish flow should attach.

Boundaries honored: no product code changes, no schema changes, no migrations, no Supabase writes, no production data access, no Stripe/QBO/SMS/provider changes, no env or feature flag changes, no runtime behavior changes, no queue membership changes, no job detail redesign, no callback/return implementation, no field payment or Field Billing Enabled implementation, and no unrelated SMS docs edits.

## 2. Executive Summary

The best schema-free attachment point for the first lightweight finish flow is the existing job detail field completion area that posts to `markJobFieldCompleteFromForm`, combined with the existing `updateJobOpsFromForm`, `updateJobOpsDetailsFromForm`, `updateJobServiceContractFromForm`, `createNextServiceVisitFromForm`, and notes/attachments surfaces as follow-on actions. The finish step should remain a router: pick outcome, write the minimum existing fields/events, then send office-owned exceptions to office queues.

The current system already has enough fields for a first pass of common outcomes: `pending_info_reason`, `on_hold_reason`, structured waiting reason prefixes, `follow_up_date`, `next_action_note`, `action_required_by`, `service_visit_type`, `service_visit_reason`, `service_visit_outcome`, `service_case_id`, `parent_job_id`, `visit_scope_summary`, `visit_scope_items`, `job_events`, `attachments`, and ECC test run result fields.

The biggest gap is not storage; it is ergonomics. Current users must know which separate form to use: mark field complete, set waiting/on-hold, update follow-up details, create next service visit, create retest, add notes, upload attachments, or edit visit scope. A lightweight outcome selector can orchestrate those existing actions without new runtime statuses.

Do not create new statuses for B4-B follow-up implementation unless later work proves a field cannot be represented with existing fields/events. In particular, preserve ECC `failed`/`retest_needed` truth, keep `pending_office_review` as office-owned review/exception, keep payment/invoice truth separate, and preserve B3-A My Work cleanup.

## 3. Files Reviewed

- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/tests/page.tsx`
- `app/jobs/[id]/_components/JobAttachmentsInternal.tsx`
- `app/jobs/[id]/_components/DeferredJobAttachmentsInternal.tsx`
- `app/jobs/[id]/_components/DeferredTimelineBody.tsx`
- `app/jobs/[id]/_components/DeferredSharedNotesBody.tsx`
- `app/jobs/[id]/_components/DeferredInternalNotesBody.tsx`
- `app/jobs/[id]/_components/InterruptStateFields.tsx`
- `app/jobs/[id]/_components/ServiceStatusActions.tsx`
- `components/jobs/VisitScopeJobDetailForm.tsx`
- `components/jobs/VisitScopeBuilder.tsx`
- `lib/actions/job-ops-actions.ts`
- `lib/actions/job-actions.ts`
- `lib/actions/attachment-actions.ts`
- `lib/actions/internal-invoice-actions.ts`
- `lib/actions/service-actions.ts`
- `lib/actions/ecc-status.ts`
- `lib/actions/job-evaluator.ts`
- `lib/utils/ops-status.ts`
- `lib/ops/queue-status-contracts.ts`
- `lib/ops/focused-queues.ts`
- `lib/utils/closeout.ts`
- `lib/jobs/visit-scope.ts`
- `lib/jobs/attachment-review-summary.ts`
- `lib/jobs/job-history-summary-read-model.ts`
- `lib/portal/resolveContractorIssues.ts`
- `lib/portal/portal-job-presentation.ts`
- Relevant tests found under `lib/actions/__tests__`, `lib/jobs/__tests__`, `lib/ops/__tests__`, `lib/portal`, `lib/maintenance-agreements/__tests__`, and `lib/estimates/__tests__`.

## 4. Current Field Completion Flow

Job detail exposes a field-completion form in `app/jobs/[id]/page.tsx` that posts to `markJobFieldCompleteFromForm`. The form appears in the job detail action area when the job lifecycle is already `completed` but `field_complete` is not yet true.

`markJobFieldCompleteFromForm` currently:

- Requires internal operational access.
- Reads `jobs.status`, `job_type`, `ops_status`, `field_complete`, `field_complete_at`, schedule fields, `certs_complete`, and `invoice_complete`.
- For ECC jobs, requires at least one completed ECC test run with a real computed or override result before allowing field completion.
- Updates `jobs.status = completed`, `field_complete = true`, and `field_complete_at = now`.
- For non-ECC, locally computes next `ops_status` through `resolveOpsStatus`.
- For ECC, delegates status truth to `evaluateEccOpsStatus`.
- Recomputes/heals closeout status through `recomputeOpsAfterCloseoutMutation`.
- Inserts `job_completed` unless already completed.
- Inserts an `ops_update` event with `source: job_detail_top_action` and changes for `status`, `field_complete`, and `ops_status`.

Current limitation: field completion is binary and not outcome-aware. It does not ask "what happened today?" and does not itself capture parts needed, access issue, unable to complete, return needed, callback, or different issue found.

## 5. Current Outcome / Status / Reason Fields

Current fields that can support outcome and reason routing:

- `jobs.status`: lifecycle values such as `open`, `on_the_way`, `in_process`, `completed`, `cancelled`.
- `jobs.ops_status`: operational state such as `need_to_schedule`, `scheduled`, `pending_info`, `pending_office_review`, `on_hold`, `failed`, `retest_needed`, `paperwork_required`, `invoice_required`, `closed`, plus current queue contract states.
- `jobs.field_complete`, `jobs.field_complete_at`: field lifecycle completion truth.
- `jobs.invoice_complete`, `jobs.certs_complete`, `jobs.data_entry_completed_at`, `jobs.invoice_number`: closeout/billing-adjacent completion truth.
- `jobs.pending_info_reason`, `jobs.on_hold_reason`: current waiting/interruption reason storage.
- `jobs.follow_up_date`, `jobs.next_action_note`, `jobs.action_required_by`: office follow-up ownership and next-step context.
- `jobs.service_visit_type`, `jobs.service_visit_reason`, `jobs.service_visit_outcome`: service visit classification and outcome fields.
- `jobs.service_case_id`, `jobs.parent_job_id`: relationship fields for service continuity and retest/follow-up chains.
- `jobs.visit_scope_summary`, `jobs.visit_scope_items`: structured work-item definition, including companion service items.
- `job_events.event_type`, `job_events.meta`: narrative/status/event history.
- `attachments.caption`, `attachments.entity_type`, `attachments.entity_id`: job evidence/photo/file metadata.
- `ecc_test_runs.is_completed`, `computed_pass`, `override_pass`, `computed`, `data`: ECC diagnostic/test result truth.

Current structured waiting reason types in `lib/utils/ops-status.ts` are:

- `waiting_on_part`
- `waiting_on_customer_approval`
- `estimate_needed`
- `waiting_on_access`
- `waiting_on_information`
- `other`

These are already enough to label many first-version finish outcomes without schema.

## 6. Current Job Event Writes

Field complete:

- `markJobFieldCompleteFromForm` writes `job_completed` and an `ops_update` with field completion changes.

Closeout:

- `markCertsCompleteFromForm` writes `ops_update` for `certs_complete` and `ops_status`.
- `markInvoiceCompleteFromForm` writes `ops_update` after external-billing completion mutation and closeout recompute.
- `completeDataEntryFromForm` writes `ops_update` for invoice/data-entry fields and may write another `ops_update` when service closeout sets `ops_status = closed`.
- Internal invoice actions write invoice-specific events such as draft/issue/void/email/payment events outside the field completion seam.

Waiting/on-hold/pending info:

- `updateJobOpsFromForm` writes `ops_update` with `event_family: ops_blocker`, `blocker_action`, `blocker_type`, `blocker_reason`, `pending_info_reason`/`on_hold_reason`, and before/after `ops_status`.
- `releasePendingInfoAndRecompute` and `releaseAndReevaluate` write `ops_update` clearing pending/on-hold signals and recomputing operational state.
- `updateJobOpsDetailsFromForm` writes `ops_update` for follow-up metadata changes.

Failed/retest:

- ECC status evaluation writes or drives failed/pass status events through existing evaluator paths.
- `createRetestJobFromForm` creates a child retest job and writes `retest_created` events on both parent and child.
- Retest resolution paths write `job_passed`, `job_failed`, `retest_passed`, or `retest_failed` as applicable.
- `resolveFailureByCorrectionReviewFromForm` writes `failure_resolved_by_correction_review` and companion `ops_update`, moving unresolved failed-family ECC jobs to `paperwork_required`.

Contractor retest-ready:

- `requestRetestReadyFromPortal` writes `retest_ready_requested`, creates internal notifications, and does not create a new runtime status.

Next service visit / return-like creation:

- `createNextServiceVisitFromForm` creates an unscheduled service child job with `ops_status = need_to_schedule`, `service_visit_outcome = follow_up_required`, writes `service_next_visit_created` on the source job, `created_from_service_visit` on the child, and optionally writes `ops_update` linking a prior waiting state to the child job.

Callback-like creation:

- No dedicated callback event or action was found in the current inspected paths. Existing service-case/follow-up creation can represent a callback-like child visit only generically, not with first-class callback semantics.

Notes/photos/attachments/diagnostics:

- `addPublicNoteFromForm` writes `public_note`.
- `addInternalNoteFromForm` writes `internal_note` and may create mention notifications.
- Contractor portal paths write `contractor_note`, `contractor_correction_submission`, and `retest_ready_requested`.
- `finalizeInternalJobAttachmentUpload` writes `attachment_added` with source, count, note, caption, evidence context, attachment IDs, and file names.
- ECC test save/complete paths write test-run data and trigger ECC status evaluation; photo attestation is represented in ECC run data/computed status, not as a pass/fail by default.

## 7. Notes / Photos / Diagnostics Capture Map

Notes:

- Internal notes are captured through `addInternalNoteFromForm` and rendered through `DeferredInternalNotesBody`.
- Shared/contractor-visible notes are captured through `addPublicNoteFromForm` and rendered through `DeferredSharedNotesBody`.
- Contractor notes/corrections appear through portal event types and are surfaced in shared/timeline/attachment review surfaces.

Photos/attachments:

- Internal users upload job attachments through `JobAttachmentsInternal`, which calls `createJobAttachmentUploadToken`, uploads to the `attachments` bucket, then calls `finalizeInternalJobAttachmentUpload`.
- Attachments are stored as rows in `attachments` with `entity_type = job` and `entity_id = jobId`.
- Finalization writes an `attachment_added` job event.
- `DeferredJobAttachmentsInternal` reads up to 200 job attachments and up to 300 review-related events, signs scoped attachments, and computes review summary through `buildAttachmentReviewSummary`.

Diagnostics:

- ECC diagnostics are captured in ECC test pages/actions using `ecc_test_runs`.
- Refrigerant charge photo attestation and other ECC tests use structured `data`, `computed`, `computed_pass`, `override_pass`, and `is_completed`.
- Job detail displays the latest ECC run result and links to test pages rather than duplicating test capture in the finish action.

Office visibility:

- Job detail already exposes notes, shared notes, timeline, attachments, ECC latest result, and service chain with deferred/progressive reads.
- Focused Waiting and Exception queues do not load full attachment/test/note detail, which is correct for performance; they link back to job detail for evidence.

## 8. Visit Scope / Work Items Relationship

Visit Scope is stored on `jobs.visit_scope_summary` and `jobs.visit_scope_items`.

`VisitScopeJobDetailForm` posts to `updateJobVisitScopeFromForm`, which:

- Requires internal operational scope.
- Sanitizes summary and structured items through `lib/jobs/visit-scope.ts`.
- Requires Service jobs to keep at least one visit-scope item.
- Updates `jobs.visit_scope_summary` and `jobs.visit_scope_items`.
- Writes `ops_update` with `source: job_detail_visit_scope`.

`VisitScopeBuilder` supports saved pricebook-derived work items and custom items. ECC jobs can carry companion service items separately from ECC test work.

Invoice relationship:

- `addInternalInvoiceLineItemsFromVisitScopeForm` reads `jobs.visit_scope_items`, validates selected item IDs, avoids duplicate source scope items, and inserts `internal_invoice_line_items` with `source_kind = visit_scope` and `source_visit_scope_item_id`.
- This means Visit Scope is already the right bridge between field work definition and later invoice line creation.

Future implication: The finish selector should not ask the technician to recreate Work Items if `visit_scope_items` already describe the performed work. It should optionally point to Visit Scope only when the field user found additional work or a different issue.

## 9. Existing Waiting / Exception Reason Support

Waiting support is strong enough for a schema-free first step:

- `pending_info_reason` and `on_hold_reason` already store structured reason text.
- `formatWaitingStateReason`, `parseWaitingStateReason`, and `getActiveWaitingState` already support reason types and display labels.
- B4-A queue display labels map structured waiting reasons into office-friendly labels.

Suggested first-version mapping:

- Parts Needed -> `ops_status = pending_info` or `on_hold`; reason type `waiting_on_part`.
- Waiting on Customer / Approval Needed -> `ops_status = pending_info`; reason type `waiting_on_customer_approval`.
- Waiting on Access -> `ops_status = pending_info` or `on_hold`; reason type `waiting_on_access`.
- Unable to Complete -> `ops_status = pending_info` or `on_hold`; reason type `other` or `waiting_on_information` with explicit reason text until a future outcome event exists.
- Estimate Needed -> `ops_status = pending_info`; reason type `estimate_needed`.

Exception support:

- B2-A treats `pending_office_review` as office-owned exception/review.
- B4-A displays `pending_office_review` as `Office Review Needed`.
- `failed` remains ECC/test failure.
- `retest_needed` remains ECC/retest.
- `problem` is a generic operational issue label, but its write ownership and exact meaning remain less explicit.

## 10. Return / Callback / Retest Current Support

Return/follow-up support:

- `createNextServiceVisitFromForm` creates an unscheduled child service job in the same service case.
- It stores `service_visit_type` from source or defaults to `return_visit`.
- It stores `service_visit_reason` as the entered next-visit reason.
- It stores `service_visit_outcome = follow_up_required`.
- It writes `service_next_visit_created` and `created_from_service_visit`.
- It can carry prior waiting-state reason metadata into an `ops_update` event.

Retest support:

- `createRetestJobFromForm` creates an unscheduled ECC child job for failed-family parent statuses: `failed`, `retest_needed`, `pending_office_review`.
- It writes `retest_created` events to parent and child and can copy systems/equipment.
- Contractor portal retest-ready is event/notification driven (`retest_ready_requested`) and remains office/rater scheduling work.

Callback support:

- No first-class callback model/action/event was found in the inspected paths.
- A callback can be approximated today as a service child/follow-up job with a service case, but that does not preserve the semantic distinction B0 describes: callback means work was believed complete and later the customer reported a same/related issue.

Different issue support:

- Visit Scope can capture additional/different work items.
- Estimate conversion can create follow-up repair jobs with `service_visit_reason = estimate_conversion` and `service_visit_outcome = follow_up_required`.
- There is no dedicated "different issue found" outcome field or event in the finish path today.

## 11. Gaps Against B0/B1

- Field completion is not outcome-aware. It marks completion and computes ops, but does not route "parts needed", "unable to complete", "access issue", "return needed", or "different issue found" in one lightweight step.
- Outcome capture is split across multiple forms: field complete, waiting/interrupt, follow-up details, service contract, next service visit, notes, attachments, visit scope, and retest creation.
- `service_visit_outcome` exists but is not the field completion routing source of truth.
- `problem` remains a generic operational status without a clearly audited write path in the inspected finish flow.
- Callback is not first-class.
- Return needed is currently representable as a next service visit/follow-up job, but not as a distinct field finish outcome.
- "Unable to complete" can be represented as waiting/on-hold reason text but not as a canonical outcome event.
- The finish flow can still require repeated narrative entry if users add notes, then separately add waiting reason, then separately create a follow-up.
- Focused queues intentionally avoid heavy evidence reads, so office users must open job detail for full notes/photos/diagnostics.

## 12. Recommended Future "What Happened Today?" Outcome Model

Future model should be a lightweight router, not a documentation replacement.

Recommended outcome choices:

- Work completed.
- Parts needed.
- Waiting on customer / approval needed.
- Waiting on access.
- Unable to complete.
- Return needed.
- Different issue found.
- ECC failed / retest needed should be controlled by ECC test results, not a manual generic field outcome.
- Callback reported should be office intake, not technician finish, unless the field user is documenting a customer-reported issue after a previously completed visit.

For each outcome, collect only routing metadata not already captured elsewhere:

- Optional short reason.
- Optional next action owner.
- Optional follow-up date.
- Optional create follow-up/return visit request.
- Optional link to existing Visit Scope or prompt to add/update Work Items.
- Optional note/attachment prompt, but do not require duplicate notes/photos/diagnostics.

Outcome mapping for first schema-free implementation:

- Work completed -> existing `markJobFieldCompleteFromForm`.
- Parts needed -> `updateJobOpsFromForm` with structured waiting reason `waiting_on_part`, plus optional `next_action_note`.
- Waiting on customer / approval needed -> `waiting_on_customer_approval`.
- Waiting on access -> `waiting_on_access`.
- Unable to complete -> `other` or `waiting_on_information` reason, with text such as `Unable to complete: ...`; consider future event later.
- Return needed -> `createNextServiceVisitFromForm` with `service_visit_type = return_visit` and reason text, plus source job event already written.
- Different issue found -> update Visit Scope / create companion service item / optional estimate path; label-only first, schema later if needed.
- Callback reported -> defer as office-owned intake; do not wire into technician finish in first slice.

## 13. Smallest Safe Implementation Path

1. Add a pure outcome mapping helper that maps a small set of UI choices to existing action payloads and labels. Do not add statuses.
2. Add a compact finish panel near the existing field complete action in job detail. It should call existing actions or a small orchestration action.
3. Use existing waiting reason types for office-owned interruption outcomes.
4. Preserve ECC behavior by preventing manual "failed" outcome writes; ECC failed/retest remains driven by ECC test runs and current ECC actions.
5. For return needed, reuse `createNextServiceVisitFromForm` or add a tiny wrapper that creates the same child service job with clearer label/source metadata.
6. For notes/photos, show optional prompts/links to existing notes and attachments sections rather than embedding new heavy capture.
7. Keep focused queues lean; rely on B4-A labels and job detail links for evidence.
8. Add tests around helper mapping and form payload construction before adding runtime behavior.

## 14. Schema-Free First Step Recommendation

Use existing fields/events first:

- Waiting outcomes: `pending_info_reason`, `on_hold_reason`, structured waiting reason prefixes, `ops_update` metadata.
- Follow-up ownership: `follow_up_date`, `next_action_note`, `action_required_by`.
- Return/follow-up: `createNextServiceVisitFromForm`, `service_case_id`, child `jobs`, `service_next_visit_created`, `created_from_service_visit`.
- Work item changes: `visit_scope_items`, `visit_scope_summary`, `ops_update` source `job_detail_visit_scope`.
- Evidence: existing notes and attachments, linked by job events and attachment rows.
- Completion: existing `field_complete`, `field_complete_at`, `job_completed`, `ops_update`.

Do not create new runtime statuses for parts/access/customer/approval/unable/different issue in the first implementation. Treat them as labels/reasons and use existing office queues.

## 15. Future Schema/Event Needs, if any

Likely future additions after schema-free proof:

- A dedicated `field_outcome_selected` job event type with normalized `outcome_code`, `reason`, `next_owner`, optional `created_child_job_id`, and optional evidence references.
- First-class callback entity or event family if callback intake must distinguish "completed, then customer reported issue later" from "return needed because original work remained unresolved."
- More explicit service return/callback relationship metadata if service cases need reporting beyond child jobs and event history.
- A normalized `problem_reason` or `exception_reason` only if `problem` remains in use and cannot be safely represented through waiting reason/event metadata.
- Explicit outcome-to-estimate linkage for "different issue found" if estimate workflow needs a non-ambiguous trigger.

Do not add these before the first schema-free slice proves where operators actually need structure.

## 16. Performance Risks

- Do not add full timeline, attachment, ECC run, or invoice reads to focused Waiting/Exception queues. They should remain projection queues with job detail drill-in.
- Do not add heavy first-paint reads to `app/jobs/[id]/page.tsx`. Current comments indicate large `job_events` summary reads were moved off the blocking path; preserve deferred timeline/notes/attachments.
- `DeferredJobAttachmentsInternal` already reads up to 200 attachments and 300 review events; do not duplicate that read in a finish panel.
- ECC evaluation paths already read systems/equipment/test runs and have timing instrumentation; do not invoke ECC evaluation from non-ECC or label-only outcomes.
- Visit Scope to invoice line creation reads `jobs.visit_scope_items` and invoice line items; keep that billing path separate from field finish.
- Avoid parent Ops dashboard expansion for outcome details; use focused projections and job detail links.

## 17. Explicit Non-Actions

- No code was changed in this slice.
- No schema or migration was added.
- No new runtime status was recommended for the first implementation.
- No Supabase writes or production data reads were performed.
- No Stripe, QBO, SMS, email provider, or payment behavior was changed.
- No env or feature flag behavior was changed.
- No queue membership was changed.
- No My Work behavior was changed; B3-A cleanup remains preserved.
- No callback/return workflow was implemented.
- No field payment or Field Billing Enabled implementation was added.
- No contractor/rater handoff behavior was changed.
- No unrelated SMS docs were edited.
