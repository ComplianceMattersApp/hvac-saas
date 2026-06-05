# Compliance Matters Workflow Modernization B5 Return / Callback / Revisit Closeout

## 1. Status / Authority / Scope

Status: CLOSED (implementation complete and validated)

Authority: Subordinate to:
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5B_Return_Callback_Model_Audit.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Workflow_Modernization_B1_Current_Queue_Contract_Audit.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Scope: B5 closeout for return/callback/revisit workflow only. This closeout documents delivered behavior and boundaries for Return Visit, Callback Visit, and Different Issue Found callback/revisit outcome handling.

## 2. Executive Summary

B5 is complete for the return/callback/revisit lane. The job detail Next Service Action surface is intentionally simplified to two primary actions:
- Create Return Visit
- Create Callback Visit

These actions are intentionally separate workflows with different intent:
- Return Visit: unresolved original work needs another visit.
- Callback Visit: customer calls back after work was believed complete.

Callback/reporting truth is preserved through append-only events, including an explicit `callback_reported` event before callback child job creation.

Different Issue Found is implemented as a callback/revisit-only field outcome and remains out of the normal first-visit finish flow.

## 3. Completed B5 Slices

Completed slices:
- B5-A: office waiting visibility polish for B4 outcomes.
- B5-B: return/callback model audit and model lock.
- B5-C: office-only Return Visit V1 behavior.
- B5-D/B5-E: callback workflow implementation, simplified to one primary Create Callback Visit action.
- B5-F: Different Issue Found callback/revisit-only outcome.
- B5 UX cleanup: Next Service Action reduced to two clear primary actions for return and callback.

## 4. Return Visit V1 Behavior

Return Visit V1 behavior:
- Used when original work is not finished and another visit is needed.
- Creates unscheduled office/dispatch-owned work first.
- Uses existing linked job and service case continuity model.
- Created job uses `service_visit_type = return_visit`.
- Created job uses `status = open`.
- Created job uses `ops_status = need_to_schedule`.
- Created job is not normal technician My Work until scheduled/assigned.
- Same `service_case_id` is preserved or ensured.
- Source and child `job_events` are written.

## 5. Callback Visit V1 Behavior

Callback Visit V1 behavior:
- One primary visible callback action only.
- Used when customer reports a problem after prior work was believed complete.
- Form captures: "What did the customer report?"
- Submit path writes `callback_reported` event first.
- Then creates callback child job.
- Created job uses `service_visit_type = callback`.
- Created job uses `status = open`.
- Created job uses `ops_status = need_to_schedule`.
- Created job uses `scheduled_date = null`.
- Same `service_case_id` is preserved or ensured.
- Source and child callback relationship events are written.
- Redirect lands on created callback job with banner clarifying unscheduled office/dispatch ownership until scheduled/assigned.

## 6. Different Issue Found Callback/Revisit Outcome

Different Issue Found behavior:
- Available only for callback/revisit applicable jobs.
- Allowed contexts include `callback` and `return_visit`.
- Not shown for normal first-visit service jobs.
- Requires note/reason.
- Marks current callback/revisit field responsibility complete.
- Routes to `pending_office_review`.
- Writes append-only event truth.
- Does not rewrite original anchor job history.
- Does not create return/callback jobs.
- Does not add invoice/payment/estimate behavior.
- Does not alter ECC failed/retest source-of-truth behavior.

## 7. Office / Dispatch Ownership Rules

Ownership rules preserved in B5:
- Unscheduled return/callback jobs are office/dispatch-owned backlog.
- Office/dispatch owns scheduling and assignment decisions.
- Queue and ops posture remains compatible with B0/B1 ownership direction.
- Field users receive return/callback work only after scheduling and assignment.

## 8. Field My Work Impact

Field My Work impact:
- Normal technician My Work remains scheduled/actionable assigned work.
- Newly created unscheduled return/callback jobs are intentionally excluded until scheduling/assignment.
- Different Issue Found completion routes work to office review rather than creating immediate field backlog.

## 9. Service Case / Job / Event Truth Boundaries

Truth boundaries preserved:
- `service_cases` remain continuity container.
- `jobs` remain visit/work execution units.
- `job_events` remain narrative/timeline truth.
- Callback report + callback child creation are append-only event-driven writes.
- Original anchor job history is not rewritten.
- `jobs.ops_status` remains operational projection, not lifecycle source-of-truth.

## 10. UI/UX Decisions

UI/UX decisions locked in B5:
- Next Service Action exposes two clear primary actions only: Return and Callback.
- Record Report Only was removed from the primary visible workflow area.
- Callback action copy distinguishes callback from unresolved-work return.
- Return action copy emphasizes unfinished original work.
- Callback form explicitly asks what the customer reported.
- Callback success banner explicitly states unscheduled office/dispatch ownership posture.

## 11. What Was Intentionally Not Added

Intentionally not added in B5:
- No schema changes.
- No migrations.
- No new runtime status families.
- No payment, invoice, or estimate side-effect workflow additions.
- No Stripe/QBO/provider/SMS behavior changes.
- No `FieldOutcomePanel` default expansion beyond B5 lane intent.
- No queue membership redesign.
- No rewrite of ECC failed/retest truth model.

## 12. Deferred Items

Deferred items:
- Visual polish pass for Next Service Action and field finish panels.
- Office/waiting/exception queue polish if field testing reveals confusion.
- Callback/return reporting and history polish.
- Collect Payment / field billing lane.
- Field line-item / charge UX redesign.
- Office payment verification for check/cash/other.
- Job detail performance triage if timeout/57014 issues reproduce outside sandbox/dev-server conditions.
- Customer communication/SMS later under SMS governance.

## 13. Future Recommended Next Lanes

Recommended next lanes:
1. Focused visual polish of field finish and Next Service Action hierarchy.
2. Office queue comprehension polish after field and dispatch feedback.
3. Callback/return timeline and reporting readability hardening.
4. Separate financial lane for field billing and office verification controls.
5. Performance triage lane if reproduction confirms non-sandbox query pressure.
6. SMS/customer communications under the separate SMS governance lane only.

## 14. Validation / Commit References

Validation run for this closeout lane:
- `npx.cmd vitest run lib/actions/__tests__/callback-visit-action-wiring.test.ts lib/actions/__tests__/callback-intake-action.test.ts lib/actions/__tests__/return-visit-action-wiring.test.ts lib/actions/__tests__/job-detail-operational-entitlement-hardening.test.ts`
- `npx.cmd vitest run lib/jobs/__tests__/job-detail-field-outcome-panel-wiring.test.ts lib/actions/__tests__/job-ops-parts-needed.test.ts`
- `npx.cmd vitest run lib/ops/__tests__/focused-queues.test.ts`
- `npx.cmd tsc --noEmit`
- `git diff --check`

Implementation commit references already present on `main`:
- `998fc37` feat(jobs): add office return visit action
- `b658776` feat(jobs): record callback intake event
- `f83821d` feat(jobs): create callback visit from intake
- `1ef486a` feat(jobs): route different issue callback outcome
- `255129d` feat(jobs): add callback revisit workflow"
- `e796fc9` docs(workflows): audit return and callback model

## 15. Explicit Non-Actions

This closeout doc performs no runtime mutation.

Explicit non-actions:
- no product code edits
- no schema changes
- no migrations
- no Supabase writes
- no Stripe/payment/provider behavior changes
- no SMS/provider behavior changes
- no QBO behavior changes
- no environment or feature-flag changes
- no queue architecture redesign
- no FieldOutcomePanel default-flow redesign outside B5 lane
- no payment/invoice/estimate behavior expansion
