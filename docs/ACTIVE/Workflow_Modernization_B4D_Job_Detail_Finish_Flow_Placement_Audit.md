# Compliance Matters Workflow Modernization B4-D Job Detail Finish Flow Placement Audit

## 1. Status / Authority / Scope

Status: B4-D audit complete as docs-only planning.

Authority: This placement audit follows `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`, `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`, `docs/ACTIVE/Workflow_Modernization_B1_Current_Queue_Contract_Audit.md`, `docs/ACTIVE/Workflow_Modernization_B4B_Field_Outcome_Exception_Reason_Audit.md`, `docs/ACTIVE/Active Spine V4.0 Current.md`, and `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`.

Recent implementation context:

- B2-A centralized queue status contracts.
- B3-A removed generic unscheduled backlog from `/ops/field`.
- B4-A clarified Waiting and Exception queue labels.
- B4-C added the pure outcome routing contract in `lib/jobs/field-outcome-routing.ts`.
- No finish-flow UI or runtime wiring exists yet.

Scope: Decide where a future lightweight "What happened today?" field outcome panel should live on job detail, which existing controls it should complement or eventually simplify, and how it can avoid increasing page density or read cost.

Boundaries honored: no UI implementation, no control movement, no behavior change, no schema change, no migration, no new status, no Supabase write, no production data access, no queue membership change, no callback/return implementation, no payment or Field Billing Enabled implementation, no contractor/rater handoff behavior change, and no unrelated SMS docs edits.

## 2. Executive Summary

The future "What happened today?" panel should be a mobile-first guided action panel placed near the existing field action path, not buried inside the advanced `Job Status` details section. Its best first home is immediately adjacent to the current field lifecycle action area that leads to `markJobFieldCompleteFromForm`, with a mirrored compact placement in the existing mobile action card area.

The panel should be a router, not a documentation replacement. It should use the B4-C `field-outcome-routing` contract to choose between existing intents: complete field work, set a waiting reason, request a return/follow-up visit, or flag Visit Scope / Work Item review. It should not force technicians/raters to rewrite notes, upload duplicate photos, or re-enter diagnostics already captured in the existing notes, attachments, Visit Scope, and ECC test sections.

The current `Job Status` section and `InterruptStateFields` should remain as advanced/manual office controls. The future guided panel can eventually simplify common usage of those controls, but it should not remove them in the first UI slice.

ECC needs special handling: manual generic ECC failure must remain unavailable. ECC failed/retest truth stays driven by ECC test runs and existing ECC status evaluation. The finish panel can show ECC-safe completion and routing options, but failure/retest outcomes must point users to ECC test capture/status truth rather than a manual field outcome.

## 3. Files Reviewed

- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/_components/ServiceStatusActions.tsx`
- `app/jobs/[id]/_components/InterruptStateFields.tsx`
- `app/jobs/[id]/_components/DeferredJobAttachmentsInternal.tsx`
- `app/jobs/[id]/_components/DeferredTimelineBody.tsx`
- `app/jobs/[id]/_components/DeferredSharedNotesBody.tsx`
- `app/jobs/[id]/_components/DeferredInternalNotesBody.tsx`
- `components/jobs/VisitScopeJobDetailForm.tsx`
- `components/jobs/VisitScopeBuilder.tsx`
- `lib/jobs/field-outcome-routing.ts`
- `lib/actions/job-ops-actions.ts`
- `lib/actions/job-actions.ts`

## 4. Current Job Detail Action Layout

`app/jobs/[id]/page.tsx` is a dense, multi-section job workspace. It contains:

- Header, identity, status, schedule, billing, customer, contractor, and location context.
- Mobile-oriented action cards and compact tool sections.
- Field lifecycle controls through status actions and field-complete forms.
- `Job Status` details with interruption/waiting controls.
- Service closeout and billing-related controls.
- Visit Scope / Work Items sections.
- Notes, attachments, shared notes, internal notes, timeline, follow-up, follow-up history, service chain, workflow milestones, ECC tests, permit, equipment, and failure resolution.

The page already uses deferred sections for heavier narrative/evidence surfaces. Comments in the page indicate prior work intentionally removed a 200-row `job_events` summary read from first paint, preserving deferred timeline/notes bodies as authoritative.

Placement implication: the finish panel must not become another large all-purpose card. It should be small, action-oriented, and should link/point to existing evidence sections rather than embedding them.

## 5. Current Field Complete Control Placement

`markJobFieldCompleteFromForm` is imported into job detail and surfaced in a form near the action area when `job.status === "completed"` but `field_complete` is not true. The control is currently a completion confirmation after lifecycle status has already reached `completed`.

Current behavior:

- Field lifecycle progression is handled separately by status actions such as on-the-way, in-process, and completed.
- Field-complete truth is then recorded by `markJobFieldCompleteFromForm`.
- `markJobFieldCompleteFromForm` writes `field_complete`, `field_complete_at`, `job_completed`, and an `ops_update`.
- It does not ask what happened today.

Recommended relationship: the future panel should sit before or beside this final field-complete confirmation. It should guide the user through the outcome choice, then route to the appropriate existing action or future orchestration action. The old direct field-complete button can remain as a fallback/advanced path during the first UI slice.

## 6. Current Waiting / Interrupt Controls Placement

Waiting/interruption controls are rendered in the `Job Status` details section through a form posting to `updateJobOpsFromForm` and the client component `InterruptStateFields`.

`InterruptStateFields` currently presents:

- Interrupt State: `pending_info`, `on_hold`, or `waiting`.
- Structured waiting reasons: `waiting_on_part`, `waiting_on_customer_approval`, `estimate_needed`, `waiting_on_access`, `waiting_on_information`, and `other`.
- Required text for Pending Info / On Hold, or custom reason text for `other`.

There is also a mobile-tools placement of the same interrupt controls in the mobile action area.

Recommended relationship: the guided finish panel should use B4-C outcome routes to select these reason types for common field outcomes. The existing `Job Status` interruption form should remain as an advanced/manual office control for direct correction, override, and non-finish use.

## 7. Current Return / Follow-Up Controls Placement

Return-like service continuation is currently handled by `createNextServiceVisitFromForm`.

On job detail, this appears in:

- A mobile follow-up job area.
- A desktop/regular follow-up or service-chain-adjacent area.

The current form asks for a next service visit reason and creates an unscheduled child service job with `ops_status = need_to_schedule`, service case linkage, `service_visit_outcome = follow_up_required`, and source/child job events.

Recommended relationship: the guided finish panel should expose `return_needed` as a simple outcome that can request or create a follow-up/return intent. It should not create a new status. In the first UI slice, it can either:

- Hand off to the existing next-service-visit form/section, or
- Submit through a tiny wrapper that uses the same existing action semantics.

The existing next-service-visit controls should remain as advanced/manual office controls until the guided path is proven.

## 8. Current Evidence Capture Placement

Evidence capture is already separated into specialized sections:

- Internal notes: `DeferredInternalNotesBody` and `DeferredInternalNoteMentionComposer`.
- Shared/contractor-visible notes: `DeferredSharedNotesBody` and `addPublicNoteFromForm`.
- Attachments/photos/files: `DeferredJobAttachmentsInternal` and `JobAttachmentsInternal`.
- Timeline: `DeferredTimelineBody`.
- ECC tests/diagnostics: test pages and job detail latest-result summaries.

Attachment visibility is deferred and scoped. `DeferredJobAttachmentsInternal` reads attachment rows and relevant review events, signs authorized attachments, and computes review summaries.

Recommended relationship: the finish panel should not include note history, attachment grids, timeline rows, or ECC diagnostics. It may show lightweight context already available on the page, such as simple counts or links:

- "Notes are below"
- "Attachments are below"
- "Tests are managed in ECC Tests"
- "Visit Scope is below"

Do not add new first-paint reads to make the panel feel smart.

## 9. Current Visit Scope / Work Items Placement

Visit Scope / Work Items are rendered through `VisitScopeJobDetailForm` and `VisitScopeBuilder`.

Current placement appears in both mobile/compact and regular job detail sections. The form updates `visit_scope_summary` and `visit_scope_items` via `updateJobVisitScopeFromForm`.

`VisitScopeBuilder` supports saved work items, custom items, and ECC companion service items. Invoice line creation later can use Visit Scope items through the internal invoice action `addInternalInvoiceLineItemsFromVisitScopeForm`.

Recommended relationship: the guided finish panel should not duplicate Visit Scope editing. For `different_issue_found`, the panel should flag the need for Work Item review and link/scroll to the existing Visit Scope area. A later implementation may preselect the outcome and open the Visit Scope composer, but first UI should avoid embedding another work-item editor.

## 10. Recommended "What Happened Today?" Panel Placement

Primary recommendation: place the panel near the top field action area, directly adjacent to the existing lifecycle/field-complete path.

Why:

- The outcome question belongs at the moment field users are finishing their assigned work.
- It should be easy to reach on mobile from `/ops/field`.
- It should not be buried in `Job Status`, which is office/manual/control-heavy.
- It should make common field finish outcomes easier without hiding advanced controls from office users.

Recommended first placement:

- A compact mobile-first panel after current field lifecycle/status controls and before dense closeout/billing/admin sections.
- Anchor it with a stable ID such as `field-outcome`.
- Show only if the job is active/actionable for the viewer and not closed/cancelled/archived.
- On desktop, keep it in the main action column rather than a lower records/details section.
- On mobile, use a short guided card with outcome choices from `listFieldOutcomeRoutes()`.

Avoid:

- Placing the first version inside `Job Status`; that section should remain advanced/manual.
- Placing it inside closeout; outcome routing happens before closeout.
- Placing it inside notes/attachments; the panel is not an evidence capture surface.
- Adding another large always-open dashboard card below the fold.

## 11. Role-Aware UI Recommendations

Technician / field user:

- Show a simplified panel only for assigned scheduled/actionable work, matching B3-A My Work semantics.
- Show outcome choices: Work Completed, Parts Needed, Approval Needed, Access Issue, Unable to Complete, Return Needed, Different Issue Found.
- Do not show generic manual ECC Failed.
- Do not show billing/payment decisions.
- Use short helper text and only ask for a short reason where B4-C says `requiresShortReason`.
- After office-owned outcomes, make clear that dispatch/office owns the next step.

ECC/rater:

- Show Work Completed only when ECC test requirements are satisfied or guide to tests first.
- Show waiting/access/approval/return/different issue routing where applicable.
- Do not allow manual failed/retest outcome; route failed/retest truth through ECC tests and existing failure/retest actions.
- For `different_issue_found`, point to Visit Scope / companion service review rather than altering ECC test truth.

Office/admin:

- Can see the same guided panel for consistency, but should also retain advanced/manual controls.
- May use the panel as a safer common path, while `Job Status`, Follow Up, Next Service Visit, Visit Scope, Failure Resolution, and Closeout controls remain available.
- Can eventually get additional context like current waiting reason or existing follow-up note, but first UI should avoid new heavy reads.

Contractor/portal:

- Out of scope for this job-detail internal panel.
- Existing contractor/rater handoff and portal retest-ready flows remain separate.

## 12. ECC-Specific Guardrails

ECC failed/retest truth must remain driven by ECC test runs and current ECC evaluation paths.

The future panel should:

- Import/use B4-C outcome routes but respect `manualEccFailureOutcome: false`.
- Exclude any generic manual "Failed" outcome.
- If ECC tests are missing or incomplete, guide the user to ECC Tests instead of allowing Work Completed to bypass guardrails.
- Preserve `failed`, `retest_needed`, and `pending_office_review` semantics.
- Preserve `resolveFailureByCorrectionReviewFromForm` and `createRetestJobFromForm` as office/rater/admin failure-resolution controls.
- Treat contractor retest-ready as event/notification-driven, not panel-driven.

## 13. Already Field-Complete / Closed Job Behavior

Already field-complete jobs:

- Do not show the primary finish panel as an active field action.
- Show a compact read-only outcome/status summary only if the data is already available without extra reads.
- Keep closeout, paperwork, invoice, failure resolution, and follow-up controls in their existing sections.

Closed jobs:

- Do not show the active panel.
- Preserve historical notes, attachments, timeline, and service chain visibility.
- Do not offer outcome routing unless a later explicit reopen/callback workflow exists.

Cancelled jobs:

- Do not show the active panel.
- Keep cancellation/history visibility only.

Archived/deleted jobs:

- Do not show the panel.
- Preserve current not-found/archival behavior.

## 14. Controls to Preserve as Advanced/Manual

Preserve these controls in the first UI implementation:

- `Job Status` advanced/manual form using `updateJobOpsFromForm`.
- `InterruptStateFields`.
- `Follow Up` form using `updateJobOpsDetailsFromForm`.
- `createNextServiceVisitFromForm` controls.
- `VisitScopeJobDetailForm` and `VisitScopeBuilder`.
- `ServiceStatusActions`.
- Closeout controls: `markCertsCompleteFromForm`, `markInvoiceCompleteFromForm`, `completeDataEntryFromForm`, internal invoice workspace actions.
- Failure resolution controls: `createRetestJobFromForm`, `resolveFailureByCorrectionReviewFromForm`.
- Notes, shared notes, internal notes, attachments, timeline, ECC tests, permit, equipment, service chain, and workflow milestone panels.

These are operator-grade controls and should remain reachable until the guided panel has proven coverage and tests.

## 15. Controls the Future Panel Can Eventually Simplify

The panel can eventually simplify common use of:

- Direct field-complete confirmation.
- Common waiting reason setup for parts, approval, access, and unable-to-complete.
- Return-needed handoff into next service visit creation.
- Different-issue-found handoff into Visit Scope review.
- Basic next-action short reason routing.

It should not replace:

- ECC test capture/evaluation.
- Failure resolution/retest controls.
- Billing/payment/closeout controls.
- Full Visit Scope editor.
- Notes/attachments/timeline.
- Office-only manual status correction.

## 16. Performance Guardrails

The panel must not add heavy reads:

- Do not load full `job_events`.
- Do not load attachment lists.
- Do not load signed attachment URLs.
- Do not load all ECC test runs solely for display if existing page data already has enough summary.
- Do not load invoice line items or payment ledgers.
- Do not duplicate deferred notes, shared notes, internal notes, timeline, or attachments queries.

Acceptable first UI data:

- Use fields already loaded by job detail: `status`, `ops_status`, `field_complete`, `job_type`, schedule fields, existing reason fields, service visit fields, and lightweight counts already computed on the page.
- Link to existing sections by anchors.
- Defer any evidence preview to existing deferred components.

If additional data becomes necessary, prefer progressive disclosure: load it only after the panel expands or after a user chooses an outcome that needs it.

## 17. Smallest Safe UI Slice Recommendation

Recommended next UI slice:

1. Create a small client/server-safe display component that receives preloaded job summary props and B4-C routes.
2. Render it near the existing field action area with a mobile-first layout.
3. Start read-only or submit-disabled behind no runtime action wiring if needed, then wire one safe path at a time.
4. First wired path should be the least disruptive: `work_completed` to existing completion path or a no-new-status waiting outcome using existing `updateJobOpsFromForm` semantics.
5. Keep advanced controls visible.
6. Add source-level and helper-level tests before wiring actions.
7. Do not add new database statuses or schema.

Initial visible copy should be short and practical:

- "What happened today?"
- "Choose the outcome. Notes, photos, tests, and work items stay in their sections."
- For office-owned outcomes: "Dispatch/office owns the next step after submission."

## 18. Future Decomposition Candidates

`app/jobs/[id]/page.tsx` is a strong candidate for future decomposition. High-value candidates:

- Extract field action/finish area.
- Extract mobile action card cluster.
- Extract job status/manual operations panel.
- Extract service return/follow-up creation panel.
- Extract closeout summary and closeout controls.
- Extract failure resolution panel.
- Extract Visit Scope placement shell.
- Extract evidence/navigation summary shell.
- Move repeated mobile/desktop duplicates behind shared components.

Any decomposition should be behavior-preserving and tested. Do not combine decomposition with finish-flow action wiring in the same slice unless the diff is very small.

## 19. Explicit Non-Actions

- No UI was implemented.
- No controls were moved.
- No behavior was changed.
- No schema or migration was added.
- No new statuses were added.
- No Supabase writes or production data access occurred.
- No queue membership changed.
- No job detail runtime wiring was added.
- No callback/return workflow was implemented.
- No payment or Field Billing Enabled behavior was added.
- No contractor/rater handoff behavior changed.
- No unrelated SMS docs were edited.
