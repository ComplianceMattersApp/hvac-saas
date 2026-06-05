# Workflow Modernization B0 Ownership Matrix

## 1. Status / Authority / Scope

Status: ACTIVE PLANNING / MODEL LOCK

Authority: This document is subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`, `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`, `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`, and the active payment/ECC/service-case source-of-truth documents.

Scope: docs/model only.

This document authorizes no product code changes, schema changes, migrations, Supabase commands, Supabase data writes, Stripe behavior changes, QBO behavior changes, SMS/provider behavior changes, environment or feature-flag changes, runtime queue behavior changes, or production actions. It locks target workflow ownership rules so later implementation slices can be audited against an agreed model.

## 2. Executive Summary

Workflow Modernization B0 exists to lock the role-aware operating model before queue, helper, and guided-workflow implementation begins. The modernization north star is that field users do field work, capture evidence naturally, and submit lightweight outcomes; office/admin/dispatch routes exceptions and follow-up work; ECC/rater users retain technical and paperwork closeout where assigned; and Billing/Admin/Owner retains financial truth, verification, corrections, and reporting.

Slice A found that current behavior is broadly consistent with the source-of-truth model, but queue logic is split across Today/My Work read models, Ops page query paths, focused queue helpers, closeout queue helpers, large action files, contractor portal resolution helpers, and job detail sections. If implementation starts before ownership is locked, future extraction could harden old assumptions such as treating unscheduled backlog as technician work, overloading `failed` for non-ECC problems, or blending cert closeout with billing closeout.

This B0 matrix defines the target ownership model for My Work, office queues, ECC cert closeout, exceptions, return visits, callbacks, contractor/rater handoff, invoice and field charge visibility, and payment verification.

## 3. Role Definitions

Owner/Admin owns full operational visibility, escalation review, role/permission governance, final business posture decisions, and access to financial and reporting surfaces where permitted by existing financial access rules. Owner/Admin can see field, ECC, office, contractor, and billing state, but visibility does not imply that every future action belongs in every page.

Office/Dispatcher owns scheduling, assignment, unscheduled backlog, exception triage, waiting-state follow-up, return scheduling, callback intake/review, contractor/rater handoff monitoring, and queue resolution. Office/Dispatcher should not be treated as final payment truth owner unless separately granted Billing/Admin/Owner authority.

Billing/AR owns invoice review, issued-invoice follow-up, payment verification for check/cash/other, payment register review, corrections, reversals, voids, refunds where later supported, exports, and financial reporting. Billing/AR is financial authority, not general Admin authority.

Technician / Field User owns scheduled or active assigned field work, field notes, photos, diagnostics, work item context, lightweight visit outcome submission, allowed Pricebook selection at locked/default prices, and allowed payment acceptance on existing/approved charges.

Technician with Field Billing Enabled is a technician with an additional per-user capability. This user may create or modify field charges within allowed policy, including descriptions, quantities, manual/custom charges, and phone-approved pricing. This capability does not grant final financial verification, correction, reversal, void, refund, export, or Admin authority.

ECC/Rater owns assigned ECC field work, test data/evidence capture, failed-test technical findings, retest field work when scheduled/assigned, and cert/paperwork closeout where assigned. ECC/Rater does not own invoice truth or payment verification unless separately granted financial authority.

Contractor / Portal User owns contractor-safe response actions such as supplying requested information, submitting corrections, requesting retest readiness, reviewing contractor-safe failure guidance, and seeing safe status. Contractor portal visibility does not grant lifecycle, scheduling, billing, payment, or internal queue authority.

Connected contractor/rater recipient where both parties use the app participates in a platform-mediated handoff: contractor can complete install and send work to rater queue; rater can test and send result/status back; contractor can submit correction or retest-ready signals; internal/rater/office scheduling and final lifecycle authority remain explicitly controlled.

## 4. Core Ownership Principles

- My Work means scheduled/actionable assigned work.
- Field users do not own unscheduled backlog.
- Office owns exception, return, callback, waiting, and queue-resolution work.
- Billing owns financial verification, corrections, reversals, voids, refunds where later supported, exports, and reporting.
- Cert closeout is technical/paperwork responsibility, not billing responsibility.
- Failed means true ECC/test failure, not a generic service problem.
- Exception means normal workflow was interrupted and office review is needed.
- Return Needed means unresolved original work needs continuation.
- Callback means work was believed complete, then the customer reported the same or related problem later.
- Callback must not rewrite original job history.
- Linked visit chains must preserve `service_cases` continuity, `jobs` as visit/work execution units, and `job_events` as narrative/timeline truth.
- Contractor portal visibility does not grant lifecycle, scheduling, billing, or payment authority.
- Work Items / Visit Scope are operational work truth.
- Invoice line items are billed/commercial truth snapshots.
- Pricebook items are reusable catalog/default pricing truth.
- Stripe/card payment truth comes from verified processor/webhook paths.
- Check/cash/other field collections remain visible until office verification.
- Payment and visit/service-plan truth remain separate.

## 5. Workflow Ownership Matrix

| Workflow state / signal | Field user My Work visibility | ECC/rater visibility/action | Office/dispatch visibility/action | Admin/owner visibility/action | Billing/AR visibility/action | Contractor/portal visibility/action | Should it appear in My Work? | Should it appear in an office queue? | Should it appear in billing/payment queues? | Notes / source-of-truth guardrails |
|---|---|---|---|---|---|---|---|---|---|---|
| Scheduled assigned work | Visible only to assigned field user for scheduled work. | Visible if assigned ECC/rater work. | Visible for dispatch coverage and schedule management. | Visible. | No, unless financial context exists. | Contractor-safe schedule visibility only when applicable. | Yes, for assigned scheduled field user. | Yes, for schedule/coverage views. | No. | My Work is not company backlog. |
| Active/on-the-way/started work | Visible and prioritized for assigned user. | Visible and actionable if assigned. | Visible for live operations. | Visible. | No, unless payment/invoice action is in progress. | Safe progress visibility only. | Yes. | Yes. | Only if payment action exists. | `on_the_way` is a field lifecycle state, not `ops_status`. |
| Field complete | Leaves ordinary field My Work unless another scheduled action is assigned. | ECC may still see cert closeout if assigned. | Visible for closeout/routing. | Visible. | Visible if invoice/payment work remains. | Safe completion status where appropriate. | No, except assigned cert/paperwork action. | Yes, when closeout/routing remains. | Yes, when invoice/payment remains. | Field completion is not full business closeout. |
| Complete with no billing needed | Not visible. | Cert closeout may be complete or not applicable. | May show only if office review remains. | Visible historically. | No. | Safe complete status. | No. | No, unless review remains. | No. | Close only when operational and required paperwork states are satisfied. |
| Parts Needed | Leaves field My Work after outcome submission. | No, unless ECC-specific part/test context assigned. | Office owns ordering, approval, return decision. | Visible/escalatable. | Only if estimate/invoice decision is needed. | Safe next-step visibility if contractor affected. | No, until return is scheduled/assigned. | Yes. | Maybe, if estimate/invoice needed. | Exception reason should be explicit, not generic. |
| Access/customer issue | Leaves field My Work after outcome submission. | No, unless assigned revisit later. | Office owns contact, access, rescheduling. | Visible/escalatable. | No, unless billing decision arises. | Safe request/status visibility where applicable. | No, until scheduled/assigned. | Yes. | No. | Treat as exception/waiting, not field backlog. |
| Unable to complete | Leaves field My Work after outcome submission. | No, unless scheduled follow-up is assigned. | Office owns triage and next step. | Visible/escalatable. | Maybe, if billing/no-charge decision needed. | Safe status only. | No, until scheduled/assigned. | Yes. | Maybe. | Must preserve notes/photos/diagnostics already captured. |
| On Hold / Waiting on Part | Not visible unless a scheduled action is assigned. | No, unless assigned action exists. | Office monitors part status and schedules return. | Visible. | Maybe, if deposit/approval/invoice decision exists. | Safe waiting status if appropriate. | No. | Yes. | Maybe. | Waiting is office-owned until actionable field work exists. |
| On Hold / Waiting on Customer | Not visible unless a scheduled action is assigned. | No, unless assigned action exists. | Office owns customer follow-up. | Visible. | Maybe, if payment/approval issue exists. | Safe waiting status if appropriate. | No. | Yes. | Maybe. | Do not make tech own customer backlog. |
| Return Needed, unscheduled | Not visible. | Not visible unless ECC/rater office review assigned. | Office reviews context and schedules linked return if needed. | Visible/escalatable. | Maybe, if estimate/invoice decision is needed. | Safe status only. | No. | Yes. | Maybe. | Continuation of unresolved original work; preserve service_case continuity. |
| Return Visit Scheduled | Visible to assigned field user. | Visible to assigned rater if ECC return/retest. | Visible for schedule/coverage. | Visible. | No, unless charges/payment due. | Safe schedule visibility if applicable. | Yes, for assigned scheduled user. | Yes. | Maybe. | Return visit is a linked visit/work unit. |
| Callback Reported, unscheduled | Not visible to field. | No, unless ECC review assigned. | Office owns intake, review, and scheduling. | Visible/escalatable. | Maybe, if warranty/billable decision needed. | Usually no, unless contractor-safe context applies. | No. | Yes. | Maybe. | Original job remains historically complete. |
| Callback Scheduled | Visible to assigned field user. | Visible to assigned ECC/rater if applicable. | Visible for schedule/coverage and callback review. | Visible. | Maybe, if billable/warranty decision exists. | Safe schedule visibility if applicable. | Yes, for assigned scheduled user. | Yes. | Maybe. | Linked callback visit must not rewrite original history. |
| Callback Completed | Leaves field My Work. | ECC/rater may close technical/paperwork if assigned. | Office decides final posture. | Visible/escalatable. | Visible if billable/no-charge/payment decision remains. | Safe outcome visibility if applicable. | No. | Yes, until office decision complete. | Maybe/Yes when billing decision remains. | Office decides warranty, courtesy, billable, estimate, return, or close. |
| Different Issue Found | Leaves field My Work after outcome, unless same-day repair continues. | Visible if assigned ECC/rater context. | Office reviews billable/estimate/courtesy posture. | Visible. | Visible if commercial decision required. | Safe status only. | No, unless assigned continuation exists. | Yes. | Maybe/Yes. | Do not mark original job failed by default. |
| Different Issue Repaired Today | Leaves field My Work after completion. | Visible if assigned ECC/rater context. | Office reviews final posture if needed. | Visible. | Visible if charges/payment decision required. | Safe complete/status visibility. | No. | Maybe. | Maybe/Yes. | Keep original callback/history linkage intact. |
| ECC Failed Test | Field sees only if assigned active/scheduled ECC work remains. | ECC/rater owns technical failed-test context and evidence. | Office/rater/admin owns correction/retest routing. | Visible/escalatable. | No, except invoice/billing decision after routing. | Contractor-safe failure guidance may be visible. | No, unless scheduled/assigned action remains. | Yes. | Maybe later. | `failed` means true ECC/test failure. |
| ECC Retest Needed | Not visible until retest is scheduled/assigned. | Rater sees when assigned or in rater queue by design. | Office schedules retest and monitors readiness. | Visible. | No, except billing decision. | Contractor may see correction/retest guidance. | No, until scheduled/assigned. | Yes. | Maybe. | Active model treats legacy `retest_needed` carefully; do not create new assumptions without implementation slice. |
| ECC Retest Scheduled | Visible to assigned rater/field user. | Visible/actionable for assigned rater. | Visible for schedule/coverage. | Visible. | No, unless charges/payment due. | Contractor-safe schedule/status visibility. | Yes, for assigned scheduled rater/field user. | Yes. | Maybe. | Retest child/follow-up should be actionable unit. |
| Certs Needed | Visible to assigned ECC/rater if cert closeout is their responsibility. | ECC/rater completes cert/paperwork. | Office may monitor. | Visible. | No, unless billing separately needed. | Safe final-processing status only. | Yes, only for assigned cert/paperwork responsibility. | Yes, as closeout/paperwork queue. | No. | Cert closeout is not billing closeout. |
| Certs Sent | Not visible as action. | Historical confirmation. | Monitor if final closeout remains. | Visible. | No, unless invoice/payment remains. | Safe status if applicable. | No. | Maybe, only if other closeout remains. | Maybe, only if invoice/payment remains. | Preserve `job_events` narrative truth. |
| Invoice Needed | Field does not own by default. | No, unless rater has separate billing authority. | Office may see as closeout context. | Visible. | Billing/Admin/Owner owns invoice creation/review. | No. | No. | Yes, closeout context. | Yes. | Invoice is billed commercial truth. |
| Invoice Draft / Review Needed | Field does not own by default. | No. | Office may see operational dependency. | Visible. | Billing/Admin/Owner reviews/issues/voids/corrects. | No. | No. | Maybe. | Yes. | Draft/review is financial authority work. |
| Ready for Payment | Field may accept payment on existing/approved charge if allowed. | No, unless separate permission. | Office may see status. | Visible. | Billing owns payment follow-up. | Customer/portal future only if explicitly designed. | Maybe, only as assigned payment collection action. | Maybe. | Yes. | Payment follows billable truth. |
| Card Payment In Progress | Field can launch/assist only if allowed; cannot mark paid manually. | No, unless allowed by role/permission. | Office sees operational context. | Visible. | Billing monitors failed/in-progress payment attention. | Customer-facing payment flow only where implemented. | Maybe. | Maybe. | Yes. | Stripe/card truth must come from webhook/processor paths. |
| Card Payment Confirmed | No field action remains. | No. | May see job closeout impact. | Visible. | Billing sees collected-money truth/reporting. | Customer-safe receipt/status only where implemented. | No. | Maybe, only if operational closeout remains. | Yes, as recorded payment history. | Webhook-confirmed `internal_invoice_payments`/allocations are payment truth. |
| Check/Cash/Other Reported | Field sees submitted state only, not verified close. | No. | Office/Admin/Billing must verify receipt. | Visible. | Billing verifies and records/corrects as allowed. | No. | No, after reported. | Maybe, if office review queue includes it. | Yes. | Reported non-card collection must not disappear before verification. |
| Payment Verification Needed | Not field-owned. | No. | Office/Admin may assist depending on company workflow. | Visible/escalatable. | Billing/Admin/Owner verifies. | No. | No. | Maybe. | Yes. | Verification is final financial authority, not normal tech authority. |
| Payment Verified | No field action remains. | No. | Operational closeout may proceed if all else complete. | Visible. | Billing sees final recorded state. | Safe paid status only where applicable. | No. | Maybe, only if operational closeout remains. | Yes, as payment history. | Only verified/recorded/active collected truth counts toward balances. |
| Contractor Correction Needed | Not internal field My Work unless scheduled assigned work exists. | Rater/office sees failed ECC correction dependency. | Office monitors and communicates. | Visible. | No, unless billing decision. | Contractor sees actionable correction guidance. | No. | Yes. | Maybe. | Contractor-safe details only; internal lifecycle authority remains internal. |
| Contractor Retest Ready | Not field My Work until retest scheduled/assigned. | Rater/office sees readiness review. | Office/rater reviews and schedules retest. | Visible. | No, unless billing decision. | Contractor sees submitted/under-review status. | No. | Yes. | Maybe. | Retest-ready signal is not automatic schedule or completion. |
| Contractor/Rater Handoff Requested | Contractor/rater recipient may see incoming actionable item by role. | Rater sees queue item if assigned/accepted by design. | Office monitors routing and schedule authority. | Visible. | No, unless billing decision. | Contractor sees sent/pending status. | Maybe, only for assigned recipient action. | Yes. | Maybe. | Handoff visibility does not grant lifecycle authority. |
| Connected Recipient Responded | Not automatic field My Work unless scheduled action exists. | Rater/contractor sees safe response context. | Office reviews response and decides next step. | Visible. | Maybe, if commercial decision created. | Responding party sees their response/status. | No, unless assigned scheduled/actionable work created. | Yes. | Maybe. | Response does not automatically complete installer milestone unless later designed. |
| Final Inspection Needed | Field/internal visibility only if assigned/scheduled. | ECC/rater may see if responsible. | Office/dispatch guides next step. | Visible. | Maybe, if final billing/payment prerequisite exists. | Contractor may see next-step guidance. | Yes, only when assigned/scheduled. | Yes. | Maybe. | Contractor guidance is safe next step, not authority transfer. |

## 6. Field Billing / Payment Permission Matrix

| Capability | Normal technician | Technician with Field Billing Enabled | Office/Dispatcher | Billing/AR | Owner/Admin | Guardrail |
|---|---|---|---|---|---|---|
| Accept payment on existing/approved charges | Allowed if company policy permits. | Allowed if company policy permits. | Usually no unless separately authorized. | Allowed. | Allowed. | Existing/approved charge must already be billable truth. |
| Select approved Pricebook item | Allowed if company policy permits. | Allowed. | May assist by workflow. | Allowed. | Allowed. | Normal tech uses locked/default price. |
| Modify Pricebook item price | Not allowed. | Allowed only as field charge override if policy permits; does not rewrite Pricebook truth. | Not allowed by default. | Allowed where financial workflow permits. | Allowed. | Pricebook remains catalog/default truth. |
| Modify description/quantity | Not allowed materially by default. | Allowed for field charge context. | Not by default. | Allowed. | Allowed. | Changes become charge/invoice context, not retroactive operational truth. |
| Add manual/custom charge | Not allowed. | Allowed if policy permits. | Not by default. | Allowed. | Allowed. | Custom charges require clear audit context. |
| Enter phone-approved pricing | Not allowed. | Allowed with note/context. | Not by default. | Allowed. | Allowed. | Approval context should be auditable in later implementation. |
| Apply discount | Not allowed. | Not allowed unless explicitly designed later. | Not allowed by default. | Allowed only if future policy permits. | Allowed only if future policy permits. | Discounts affect financial truth and require high authority. |
| Launch card payment | Allowed on approved charges if company permits. | Allowed on approved/created allowed field charges. | Maybe, if policy permits. | Allowed. | Allowed. | Tech does not manually mark Stripe/card as paid. |
| Report check/cash/other collected | Allowed if company permits. | Allowed. | Maybe. | Allowed. | Allowed. | Reported state routes to verification. |
| Verify check/cash/other | Not allowed. | Not allowed. | Not allowed unless separately granted financial authority. | Allowed. | Allowed. | Verification creates final collected-money truth. |
| Reverse/void/refund/correct/export | Not allowed. | Not allowed. | Not allowed unless separately granted financial authority. | Allowed where supported. | Allowed where supported. | Preserve non-destructive ledger history. |

Locked payment rules:

- Normal technicians can accept payment on existing/approved charges if the company allows it.
- Normal technicians can select approved Pricebook items at locked/default price if allowed.
- Normal technicians cannot modify price, add manual/custom charges, apply discounts, verify check/cash/other, reverse, void, refund, or export financial data.
- Field Billing Enabled technicians can modify descriptions and quantities, add manual/custom field charges, and enter phone-approved pricing where policy permits.
- Admin/Billing/Owner verifies non-card payments and controls corrections, reversals, voids, refunds where later supported, and exports.
- Card payment truth comes from Stripe/webhook paths.
- Check/cash/other field collections must route to office verification and remain visible until verified.
- Failed payment attempts are attention/audit signals, not collected money.
- Invoice paid/balance must derive from collected/recorded/active payment truth, not manual status mutation.

## 7. Contractor <-> Rater Handoff Rules

One-sided contractor portal/request visibility:

- Contractor submissions, correction notes, attachments, and retest-ready requests are contractor-safe signals.
- Internal users retain adjudication, scheduling, lifecycle, billing, and queue-resolution authority.
- Contractor-facing failure guidance should be specific enough to act on while avoiding internal-only notes, financial details, raw internal IDs, and authority-confusing language.
- Contractor retest-ready should create internal/rater/office attention, not immediate rater My Work clutter unless a scheduled/assigned action is created.

Both-party platform workflow:

1. Contractor completes install or correction.
2. Contractor sends/queues work to the rater path.
3. Rater/office reviews and schedules/performs ECC testing.
4. Rater sends result/status back to contractor through contractor-safe status.
5. If failed, contractor receives correction guidance.
6. Contractor completes correction and signals retest ready.
7. Rater/office reviews and schedules retest.
8. If passed and cert/paperwork closeout is handled, contractor is guided toward final inspection or next closeout step.

Connected-recipient response does not automatically complete the installer milestone, close the job, schedule a retest, verify billing, verify payment, or advance final inspection unless a later implementation slice explicitly designs and authorizes that behavior.

## 8. Performance Guardrails

Future implementation must protect the performance posture documented in the workflow modernization plan and current read-model patterns.

- Do not add heavy parent-page reads just to compute queue ownership.
- Prefer compact queue projections/read models for Today/My Work, Ops, closeout, waiting, exceptions, callback, return, contractor/rater handoff, and payment verification surfaces.
- Keep timeline/history and detailed event narratives deferred where possible.
- Avoid repeating queue logic across pages; extract canonical helpers only after B1 maps current contracts against this matrix.
- Queue cards should use compact summaries, reason labels, assignment/schedule fields, and counts rather than loading full job detail.
- Job detail can show richer context, but secondary sections should stay deferred/progressive where practical.
- Any future implementation must include performance review for Today/My Work, Ops, job detail, closeout queues, focused queues, contractor portal, and payment/verification queues.

## 9. Implementation Sequence Recommendation

Recommended next slices:

1. B1: Current queue contract mapping against this matrix.
2. B2: Canonical queue/read-model helper extraction.
3. B3: My Work visibility cleanup.
4. B4: Exception/waiting/return/callback queue cleanup.
5. B5: Job detail guided workflow panel decomposition.
6. B6: Contractor/rater handoff UX alignment.
7. B7: Field line-item/field charge UX audit.
8. B8: Field payment plus office verification audit/implementation plan.
9. Performance pass wherever timings justify it, especially if B1/B2 expose duplicated or heavy queue reads.

## 10. Explicit Non-Actions

This B0 slice confirms:

- No product code changes.
- No schema changes.
- No migration changes.
- No Supabase commands.
- No Supabase writes.
- No production data access.
- No Stripe/provider behavior changes.
- No QBO behavior changes.
- No SMS/provider behavior changes.
- No env or feature-flag changes.
- No runtime queue behavior changes.
- No status renames.
- No role/permission implementation.
- No broad refactors.

## Source References Reviewed

- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `lib/home/today-read-model.ts`
- `lib/ops/closeout-queue.ts`
- `lib/ops/focused-queues.ts`
- `lib/portal/resolveContractorIssues.ts`
- Static searches across `docs`, `app`, and `lib` for Workflow Modernization Audit Slice A, My Work, Ops queues, closeout queue, service cases/jobs/job events, waiting states, callback, return visit, ECC failed/retest behavior, contractor handoff, and payment verification references.
