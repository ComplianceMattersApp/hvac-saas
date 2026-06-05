# Compliance Matters Workflow Modernization B5-B Return Callback Model Audit

## 1. Status / Authority / Scope

Status: AUDIT COMPLETE / MODEL-LOCK RECOMMENDATION

Authority: This audit is subordinate to:
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Workflow_Modernization_B1_Current_Queue_Contract_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B4B_Field_Outcome_Exception_Reason_Audit.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Scope: Docs/audit/model-lock only for Return Visit versus Callback workflow before implementation.

Boundaries honored:
- no product code changes
- no schema or migration changes
- no Supabase writes
- no queue membership changes
- no callback implementation
- no return visit creation implementation
- no payment, field billing, provider, QBO, Stripe, or SMS behavior changes
- no `FieldOutcomePanel` behavior changes
- no unrelated SMS documentation changes

Files reviewed:
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/_components/DeferredServiceChainPanelBody.tsx`
- `components/jobs/VisitScopeJobDetailForm.tsx`
- `components/jobs/VisitScopeBuilder.tsx`
- `lib/actions/job-actions.ts`
- `lib/actions/job-ops-actions.ts`
- `lib/jobs/field-outcome-routing.ts`
- `lib/jobs/visit-scope.ts`
- `lib/ops/focused-queues.ts`
- `lib/ops/queue-status-contracts.ts`
- `lib/reports/service-case-continuity.ts`
- related tests found by search for service cases, callback labels, next service visit, visit type routing, and field outcome routing

## 2. Executive Summary

The current application already has a usable related-work foundation for Return Visit behavior:
- `service_cases` preserve the continuity container.
- `jobs` represent individual visit/work execution units.
- `jobs.service_case_id` links visits into the same case.
- `jobs.parent_job_id` is used for child lineage, especially retest jobs, and can carry parent service case inheritance through `createJob`.
- `job_events` record narrative truth for source and child relationships.
- `service_visit_type`, `service_visit_reason`, and `service_visit_outcome` provide existing visit classification.

The strongest existing return-like path is `createNextServiceVisitFromForm`. It creates an unscheduled linked service job in the same service case, sets `ops_status = need_to_schedule`, sets `service_visit_outcome = follow_up_required`, and records source/child job events. That fits Return Visit better than Callback because it continues unresolved original work.

Callback-like vocabulary exists, but callback workflow does not. `callback` is an allowed `service_cases.case_kind` and `jobs.service_visit_type`, appears in new-job/service-contract UI choices and service case reporting filters, but there is no dedicated callback intake action, callback report event, callback queue, or callback-specific child-visit creation path.

Model-lock decision:
- Return Visit: use the existing service-case plus linked job model first.
- Callback: preserve as a separate office/customer-intake workflow. Do not collapse it into generic next service visit creation without callback-specific intake evidence.
- Different Issue Found: keep reserved for callback/revisit context only, not default technician closeout.

## 3. Existing Related-Work Model

Current related-work primitives:

| Model piece | Current role | Audit finding |
|---|---|---|
| `service_cases` | Continuity container across related service visits | Suitable parent container for return visits and callback/revisit chains. |
| `service_cases.case_kind` | Case category: `reactive`, `callback`, `warranty`, `maintenance` | Callback vocabulary exists at case level. It is editable on job detail service contract controls and filterable in service case reporting. |
| `jobs` | Individual visit/work unit | Correct unit for each return visit or callback/revisit appointment. |
| `jobs.service_case_id` | Links a job to a service case | Primary existing chain link for service continuity. |
| `jobs.parent_job_id` | Child job lineage | Used strongly for retests. `createJob` inherits service case from parent when needed. Current next-service-visit path does not set `parent_job_id`. |
| `jobs.service_visit_type` | Visit category: `diagnostic`, `repair`, `install`, `return_visit`, `callback`, `maintenance` | Return and callback vocabulary both exist, but current next-service-visit creation inherits source type or defaults to `return_visit`. |
| `jobs.service_visit_reason` | Human reason/title layer for service visit | Existing field can carry return reason or callback complaint summary. |
| `jobs.service_visit_outcome` | Visit outcome: `resolved`, `follow_up_required`, `no_issue_found` | `follow_up_required` supports unresolved return-style continuation. |
| `job_events` | Narrative/audit truth | Current linked-visit creation writes source and child events. Best schema-free place to capture callback report/intake evidence. |
| `origin_job_id` | Estimate origin linkage | Found in estimate flow, not current job-to-job return/callback workflow. |

## 4. Current Return-Like Behavior

`createNextServiceVisitFromForm` is the current return-like behavior.

What it does today:
- Requires internal scoped job access and operational mutation entitlement.
- Requires `next_visit_reason`.
- Requires the source job to be `job_type = service`.
- Requires source customer and location.
- Uses the source `service_case_id` or creates one via `ensureServiceCaseForJob`.
- Creates a child service job with:
  - `service_case_id` set to the source service case
  - `service_visit_type` copied from the source if valid, otherwise `return_visit`
  - `service_visit_reason` set to the submitted reason
  - `service_visit_outcome = follow_up_required`
  - `status = open`
  - `ops_status = need_to_schedule`
  - no schedule window
  - copied customer/location/contact/address/contractor context
  - empty visit scope
  - note that it was created from the prior service visit
- Reconciles service case status.
- Writes `service_next_visit_created` on the source job.
- Writes `created_from_service_visit` on the child job.
- If the source job is in an active waiting state, writes an `ops_update` indicating the waiting state was resumed through the child job.
- Revalidates source, child, ops, and jobs pages, then redirects to the child job.

Fit assessment:
- Strong fit for Return Visit.
- Weak fit for Callback unless additional callback intake semantics are added.

## 5. Current Callback-Like Behavior

Existing callback-like support is vocabulary and reporting, not workflow.

Current support:
- `service_cases.case_kind = callback` is allowed.
- `jobs.service_visit_type = callback` is allowed.
- New job and job detail service contract controls expose callback choices.
- Service case continuity reporting can filter/label callback cases.

Missing callback workflow pieces:
- No dedicated callback intake action found.
- No dedicated callback reported event found.
- No callback office queue/read model found.
- No callback-specific creation path that requires a completed/closed prior job.
- No current field or event contract that records "customer reported same/related problem after prior work was believed complete."
- No durable distinction between callback, warranty, courtesy, billable revisit, or continuation beyond editable case/visit labels.

Conclusion: The app can label something as callback, but it does not yet model callback as an office-owned intake decision.

## 6. Service Case / Job / Event Linkage Map

Recommended interpretation of existing primitives:

| Relationship | Current fields/events | Recommended meaning |
|---|---|---|
| Original service work | root `jobs` row plus `service_case_id` | First visit/work unit in a continuity case. |
| Return visit | new `jobs` row in same `service_case_id`, `service_visit_type = return_visit` where possible, `service_visit_outcome = follow_up_required` until resolved | Continuation of unresolved original work. |
| Retest | child `jobs.parent_job_id` plus inherited service case | ECC/test failure lineage remains its own truth path. Preserve existing retest behavior. |
| Callback intake | future `job_events` record on original/anchor job and/or service case context | Customer reported same/related issue after prior work was believed complete. |
| Callback visit | new `jobs` row in same or explicitly linked service case with `service_visit_type = callback` and callback intake metadata | A revisit created because of callback intake, not because field work was simply unfinished. |
| Different issue found | future callback/revisit outcome metadata/event on callback/revisit job | Technician determines the new issue is not the same original issue and office/work-item review is needed. |
| Estimate origin | `origin_job_id`, `service_case_id` in estimates | Estimate linkage only; not current return/callback job lineage. |

## 7. Return Visit Definition and Recommended Model

Definition to preserve: Original work is not fully resolved yet and another visit is needed to continue or complete it.

Recommended model:
- Office/dispatch owns the decision to create the return visit.
- The source is normally a waiting/office-owned service job from B4 finish outcomes:
  - Parts Needed
  - Approval Needed
  - Unable to Complete
- The return visit should be created from job detail or waiting-queue detail context, not automatically by technician finish submission.
- The created job should be unscheduled office backlog first:
  - `status = open`
  - `ops_status = need_to_schedule`
  - `scheduled_date = null`
  - visible to office/dispatch, not normal field My Work until scheduled or actively started
- The linked job should stay in the same `service_case_id`.
- Prefer `service_visit_type = return_visit` for newly created return visits rather than inheriting a non-return source type when the action is explicitly "Create Return Visit".
- Preserve `service_visit_reason` as the practical reason for the return, derived from office input and/or current waiting reason.
- Preserve `service_visit_outcome = follow_up_required` until the new visit resolves the case.

Where to initiate:
- Primary: Office Waiting queue item -> job detail -> existing/future return creation control near Follow Up / Next Service Action.
- Secondary: Job detail service chain/follow-up area for internal users.
- Not technician default field finish panel.

## 8. Callback Definition and Recommended Model

Definition to preserve: Prior work was believed complete/closed, then the customer reported same/related problem later.

Recommended model:
- Callback begins as office/customer intake, not as technician closeout.
- The intake should capture:
  - customer-reported complaint
  - original/anchor job
  - service case context
  - whether office believes it is same/related work
  - intake timestamp and user
  - initial warranty/billable/courtesy posture if needed later
- The intake should create narrative truth before any callback visit is created.
- The callback visit, if office decides one is needed, should be a new service job with:
  - `service_visit_type = callback`
  - `service_visit_reason` from the customer-reported issue
  - `ops_status = need_to_schedule` until scheduled
  - link to the anchor job/service case through existing service case linkage and event metadata

Recommended placement:
- Primary intake should live in an office/customer context where the customer report begins.
- Practical first placement: job detail for the original closed/completed service job, because it has the full history, service chain, notes, and existing internal action surface.
- Follow-on placement: customer profile or service case area for cases where a customer calls before staff finds the prior job.
- A dedicated callback queue should come later only after callback intake exists as a durable event/read model.

## 9. Different Issue Found Placement

`different_issue_found` already exists in `lib/jobs/field-outcome-routing.ts` as:
- `applicability = callback_revisit`
- not visible in default closeout
- office-owned after submission
- leaves normal field My Work
- requires Visit Scope / Work Items review
- creates no database status
- not a manual ECC failure outcome

Model-lock decision:
- Preserve Different Issue Found only for callback/revisit child jobs.
- Do not expose it as a default finish outcome for ordinary technician closeout.
- Do not use it to rewrite the original job's history.
- Future behavior should add an event or metadata on the callback/revisit visit saying the technician found a different issue and office review is required.
- The office/admin review should decide whether to create/update Visit Scope, estimate, billing posture, or a separate service case.

## 10. Schema-Free First Step Recommendation

Recommended schema-free first implementation after this audit:

1. Add an office-only "Create Return Visit" path from waiting/job detail context that reuses the existing service-case plus child-job model.
2. Keep creation office-owned and unscheduled: `ops_status = need_to_schedule`.
3. Use the current waiting reason and office-entered reason to populate `service_visit_reason`.
4. Record relationship truth in `job_events` metadata.
5. Do not add technician auto-create return behavior.
6. Do not add callback behavior in the same slice.

For callback, the first schema-free step should be a separate office-only callback intake event/read contract before visit creation:
- record the customer report against the anchor job/service case using `job_events`
- do not create a callback visit until office confirms scheduling is needed
- preserve original job history unchanged

## 11. Future Schema/Event Needs, if any

Schema-free can go a meaningful distance using existing `jobs`, `service_cases`, and `job_events`.

Likely event additions without schema:
- `return_visit_created` or richer metadata on existing `service_next_visit_created`
- `callback_reported`
- `callback_visit_created`
- `different_issue_found`

Potential additive schema later, only if reporting/operations need stronger queryability:
- `jobs.origin_job_id` or equivalent for direct job-to-job anchor lineage
- `jobs.related_work_kind` or metadata equivalent: `return_visit`, `callback`, `warranty_revisit`
- `jobs.callback_source_event_id`
- `jobs.callback_reported_at`
- `service_cases.callback_origin_job_id`
- dedicated callback intake table if callback triage becomes multi-step and high volume
- callback/return read-model table only if queue performance requires denormalization

Do not add these until the schema-free event and linked-job workflow proves the real query needs.

## 12. Recommended Implementation Sequence

Smallest safe sequence:

1. Return Visit V1, office-only:
   - Rename/clarify the existing "Create Follow-Up Job" surface for waiting-context return creation where appropriate.
   - Prefer explicit `return_visit` type for return action.
   - Keep child job unscheduled and office-owned.
   - Preserve existing service case linkage and event creation.

2. Waiting queue action entry:
   - Let office staff reach the return creation action directly from Parts Needed, Approval Needed, and Unable to Complete waiting items.
   - Avoid extra heavy reads by linking to existing job detail/action surface first.

3. Callback intake event V1:
   - Add office-only intake on original job detail or customer/service case context.
   - Record customer report as an event.
   - Do not create a child visit automatically.

4. Callback visit creation V1:
   - From a callback intake event, create an unscheduled service job with `service_visit_type = callback`.
   - Preserve service case linkage and anchor metadata.

5. Callback/revisit finish outcomes:
   - Expose Different Issue Found only on callback/revisit jobs.
   - Route it to office/work-item review without changing ECC failure truth.

6. Reporting/queue hardening:
   - Add callback and return read models only after the event semantics are stable.

## 13. Risks / Guardrails

Risks:
- Treating current "Create Follow-Up Job" as both return and callback could blur unresolved work with post-completion customer complaints.
- Inheriting `service_visit_type` from the source job can hide explicit return semantics.
- Auto-creating a return visit from field finish would move office scheduling decisions into technician closeout.
- Callback creation without intake evidence could rewrite or muddy original job history.
- Adding callback queues before intake events would create another inferred queue contract that can drift.
- Using `parent_job_id` for all related work could collide with current retest semantics unless carefully separated.
- Heavy service-chain reads on queue pages could slow office workflows.

Guardrails:
- Return Visit continues unresolved work.
- Callback starts from customer report after believed completion.
- Different Issue Found is callback/revisit-only.
- ECC failed/retest remains driven by ECC test truth.
- Original job history is append-only narrative truth, not rewritten by callback creation.
- Office/dispatch owns unscheduled return/callback backlog.
- Field My Work only receives scheduled/actionable assigned work.
- Payment, invoice, warranty, and billable/courtesy posture remain separate authority lanes.

## 14. Explicit Non-Actions

This slice did not:
- implement return visit creation changes
- implement callback intake
- implement callback visit creation
- wire Different Issue Found into UI
- change `FieldOutcomePanel`
- change queue membership
- change My Work behavior
- change ECC failure/retest behavior
- change payment, field billing, invoice, Stripe, QBO, SMS, or provider behavior
- add statuses
- add schema
- add migrations
- access production data
- modify unrelated SMS documentation
