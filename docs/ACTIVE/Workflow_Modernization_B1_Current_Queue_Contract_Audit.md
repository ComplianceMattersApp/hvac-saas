# Workflow Modernization B1 Current Queue Contract Audit

## 1. Status / Authority / Scope

Status: ACTIVE AUDIT / MODEL COMPARISON

Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`, `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`, `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`, `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`, and active payment/ECC/source-of-truth specs.

Scope: docs/audit only.

This audit maps current queue contracts against the B0 ownership matrix. It authorizes no product code changes, schema changes, migrations, Supabase writes, production data access, Stripe/QBO/SMS/provider changes, environment or feature-flag changes, runtime queue behavior changes, or refactors.

## 2. Executive Summary

Current queue behavior is mostly compatible with the B0 direction at the source-of-truth level: tech-facing Today work is assigned and unfinished, office queues own scheduling/waiting/exception/closeout surfaces, contractor portal visibility remains contractor-safe, connected handoff response explicitly does not complete installer milestones, and financial surfaces are gated to Owner/Admin/Billing.

The main B0 gaps are contract drift and vocabulary gaps rather than a single broken workflow. Queue logic is duplicated across `lib/home/today-read-model.ts`, `/ops`, focused queue pages, closeout helpers, job detail, contractor portal helpers, and handoff helpers. Some states B0 names directly, such as `Parts Needed`, `Access/customer issue`, `Unable to complete`, `Return Needed`, `Callback Reported`, `Different Issue Found`, `Payment Verification Needed`, and `Field Billing Enabled`, do not exist as first-class queue contracts today. They are represented indirectly through `pending_info`, `on_hold`, `need_to_schedule`, `service_visit_type`, follow-up notes, `parent_job_id`, `service_case_id`, invoice state, or payment attempt state.

The highest-risk mismatches to address before broader workflow cleanup are:

- `/ops/field` includes an `Unscheduled` My Work bucket for assigned unfinished jobs, which can show office-owned backlog to field users.
- `pending_office_review` is queried by `/ops/queues/exceptions`, but `buildExceptionQueueRows` filters it out; it is treated as waiting in focused helper and Today follow-up logic.
- Waiting queue page reads `pending_info_reason` but calls display helpers with `on_hold_reason`, which is not selected on that route.
- Current exception taxonomy lacks explicit reason states for parts, access, unable-to-complete, return-needed, callback, and different-issue outcomes.
- Billing/payment visibility is strong for Owner/Admin/Billing, but there is no field-payment verification queue or Field Billing Enabled permission contract in current queue logic.

## 3. Files Reviewed

Required docs reviewed:

- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`

Primary code targets reviewed:

- `lib/home/today-read-model.ts`
- `app/ops/field/page.tsx`
- `app/ops/page.tsx`
- `app/ops/closeout-queue/page.tsx`
- `app/ops/queues/exceptions/page.tsx`
- `app/ops/queues/waiting/page.tsx`
- `app/ops/queues/without-tech/page.tsx`
- `lib/ops/closeout-queue.ts`
- `lib/utils/closeout.ts`
- `lib/ops/focused-queues.ts`
- `lib/utils/ops-status.ts`
- `lib/actions/job-ops-actions.ts`
- `lib/actions/job-actions.ts`
- `app/jobs/[id]/page.tsx`
- `app/ops/handoffs/page.tsx`
- `app/ops/connected-handoffs/page.tsx`
- `lib/workflows/workflow-handoff-requests-read.ts`
- `lib/workflows/connected-recipient-handoff-projection-read.ts`
- `lib/workflows/connected-recipient-handoff-response-actions.ts`
- `lib/portal/resolveContractorIssues.ts`
- `app/portal/jobs/[id]/page.tsx`
- `lib/auth/financial-access.ts`
- `lib/reports/payments-register.ts`
- `lib/business/failed-payment-reconciliation-read-model.ts`
- `app/reports/failed-payments/page.tsx`

Slice A artifact search:

- No standalone `Workflow_Modernization_Audit_Slice_A` markdown artifact was found in `docs/ACTIVE`.
- Slice A findings are reflected in B0 and the modernization plan prompt/history.

## 4. Current Queue Contract Map

| Surface/helper | Current owner contract | Current visibility driver | Notes |
|---|---|---|---|
| `/today` / `lib/home/today-read-model.ts` | Role-aware landing read model. Tech sees assigned unfinished work; office/admin sees today/in-progress operational work; billing sees money/open invoice priority. | `job_assignments`, `jobs.status`, `jobs.scheduled_date`, `jobs.field_complete`, `jobs.ops_status`, invoice/payment reads, failed-payment read model. | Tech Today excludes unscheduled assigned jobs; follow-up groups and priority chips include office/billing queues. |
| `/ops/field` | Field My Work full page. | Active `job_assignments`, `jobs.status`, `scheduled_date`, `field_complete`. | Includes in-progress, today, overdue, upcoming, and unscheduled assigned work. The unscheduled bucket conflicts with B0 when the item is office-owned backlog. |
| `/ops` | Broad internal operations dashboard. | Direct jobs queries, `ops_status`, `field_complete`, assignments, retest events, invoice/closeout projections, failed payment alert reads. | Large page contains its own queue/count logic and labels; high drift risk. |
| `/ops/queues/without-tech` | Office dispatch coverage queue. | Today scheduled jobs plus active assignment map. | Matches B0: office queue, not My Work. |
| `/ops/queues/waiting` | Office waiting/pending queue. | `ops_status in pending_info,on_hold,waiting,pending_office_review`. | Partially matches B0; includes `pending_office_review`, which B0 treats more like office review/exception. Route omits `on_hold_reason` in select while display helper expects it. |
| `/ops/queues/exceptions` | Office exception queue. | Route queries `failed,retest_needed,pending_office_review,problem`, then helper keeps only `failed,retest_needed,problem`. | Contract mismatch: `pending_office_review` is queried but dropped by helper. |
| `/ops/closeout-queue` | Internal closeout queue. | `field_complete = true`, `ops_status != closed`, billing projection, `isInCloseoutQueue`. | Strong closeout surface; combines invoice and paperwork. Needs role-aware decomposition later so cert and billing ownership stay distinct. |
| `lib/utils/closeout.ts` | Closeout eligibility helper. | `field_complete`, `job_type`, `ops_status`, `invoice_complete`, `certs_complete`. | Blocks `pending_info/on_hold`; preserves ECC failure family by not requiring certs during failure flow. |
| `lib/ops/focused-queues.ts` | Shared waiting/exception/without-tech helper. | Static status arrays and assignment predicate. | Good candidate for B2 canonicalization, but current status arrays do not fully match routes/B0. |
| `lib/utils/ops-status.ts` | Generic lifecycle projection. | schedule fields, `field_complete`, cert/invoice booleans, existing ECC failure status. | No first-class B0 statuses for parts/access/return/callback/different issue. |
| Job detail `/jobs/[id]` | Rich job control plane. | Direct job reads, service-case links, invoice/billing state, closeout projection, waiting state, retest chain, handoff/contractor report controls. | Functionally broad but too large to be the canonical queue contract. |
| Contractor portal helpers/pages | Contractor-safe status/action view. | `ops_status`, failure evidence, contractor report events, retest child chain, retest-ready events. | Mostly matches B0 contractor-safe model. |
| `/ops/handoffs` | Installer-account internal handoff response queue. | `workflow_handoff_requests` with status `sent/accepted`. | Explicitly updates handoff state only and does not mutate jobs/milestones. |
| `/ops/connected-handoffs` | Recipient-account connected handoff queue. | Active grants + handoff request projections. | Explicitly does not complete installer milestones; matches B0. |
| `/reports/failed-payments` | Billing/admin failed payment attention queue. | `tenant_saved_method_payment_attempts` + invoice/payment enrichment. | Strong match for card failure attention; no non-card field verification queue. |
| `/reports/payments` | Financial register/reporting. | `internal_invoice_payments`, recorded/failed separation. | Owner/Admin/Billing gated. Reporting truth, not field queue. |

## 5. B0 Matrix Alignment Table

| B0 workflow state / signal | Current support | Current owner/page/helper | Current driver | Alignment notes |
|---|---|---|---|---|
| Scheduled assigned work | Supported | `/today`, `/ops/field`, Ops coverage | `job_assignments`, `scheduled_date`, active status, `field_complete=false` | Matches B0 for scheduled/assigned visibility. |
| Active/on-the-way/started work | Supported | `/today`, `/ops/field`, job detail | `jobs.status=on_the_way/in_process` | Matches B0; `on_the_way` is lifecycle status, not `ops_status`. |
| Field complete | Supported | Closeout queue, job detail | `field_complete`, `field_complete_at`, `ops_status` | Matches B0: leaves ordinary field queues when `field_complete=true`. |
| Complete with no billing needed | Partially supported | `resolveOpsStatus`, job detail | `ops_status=closed`, `invoice_complete`, `certs_complete` | Complete/no-billing is not distinct; closure depends on billing/certs booleans. |
| Parts Needed | Partial/indirect | Waiting queue, job detail | waiting reason type `waiting_on_part`, `pending_info/on_hold` | No first-class outcome/status; can be represented as waiting reason. |
| Access/customer issue | Partial/indirect | Waiting queue, job detail | waiting reason type `waiting_on_access` or notes | No first-class outcome/status. |
| Unable to complete | Not first-class | Job detail notes/status | generic `pending_info/on_hold/problem` or notes | Needs explicit outcome mapping. |
| On Hold / Waiting on Part | Supported indirectly | Waiting queue, job detail | `ops_status=pending_info/on_hold`, parsed reason `waiting_on_part` | Good enough for office queue; display contract needs cleanup. |
| On Hold / Waiting on Customer | Supported indirectly | Waiting queue, job detail | `waiting_on_customer_approval`, `pending_info/on_hold` | Good enough for office queue; no separate queue row type. |
| Return Needed, unscheduled | Partial | Job detail linked follow-up, call list/need scheduling | `service_visit_type=return_visit`, `parent_job_id`, `service_case_id`, `need_to_schedule` | Lacks dedicated return-needed queue/reason. |
| Return Visit Scheduled | Supported | `/today`, `/ops/field`, schedule/coverage | linked job with `service_visit_type=return_visit`, `scheduled_date`, assignment | Works if scheduled/assigned. |
| Callback Reported, unscheduled | Partial | Job intake/detail, scheduling queues | `service_visit_type=callback`, `need_to_schedule`, service case link | No callback-specific office queue/review state. |
| Callback Scheduled | Supported if represented as job | `/today`, `/ops/field`, Ops | `service_visit_type=callback`, `scheduled_date`, assignment | Works as scheduled assigned work. |
| Callback Completed | Partial | Job detail/closeout | `service_visit_type=callback`, `field_complete`, billing state | No callback final posture queue. |
| Different Issue Found | Not first-class | Notes/outcome fields only | `service_visit_outcome` options do not clearly lock this | Needs B4/B5 design. |
| Different Issue Repaired Today | Not first-class | Notes/outcome fields only | no dedicated status/event found | Needs B4/B5 design. |
| ECC Failed Test | Supported | exception queue, job detail, contractor portal | `ops_status=failed`, failed `ecc_test_runs`, `job_events` | Mostly matches B0, but `failed` should remain ECC/test-only. |
| ECC Retest Needed | Supported/legacy | exception queue, job detail, contractor portal | `ops_status=retest_needed`, retest child chain | Current docs say `retest_needed` is legacy compatibility-only; implementation still reads it. |
| ECC Retest Scheduled | Supported | `/today`, `/ops/field`, portal, job detail | linked retest child with `parent_job_id`, `scheduled_date`, assignment | Matches B0 when scheduled/assigned. |
| Certs Needed | Supported | closeout queue, job detail | ECC `field_complete=true`, `certs_complete=false`, not failure flow | Needs later role-aware split so assigned rater cert closeout can be separated from billing. |
| Certs Sent | Supported as completion/history | job detail/events | `certs_complete=true`, cert closeout event | Not an action queue unless other closeout remains. |
| Invoice Needed | Supported | closeout queue, job invoice workspace | `invoice_complete=false`, billing projection | Strong closeout support; financial actions gated. |
| Invoice Draft / Review Needed | Supported | job invoice workspace | `internal_invoices.status=draft`, line item state | Owner/Admin/Billing gated by financial access. |
| Ready for Payment | Partial | invoice workspace, payment link/reporting | issued invoice, balance due | Internal financial surface exists; no field-payment assignment queue. |
| Card Payment In Progress | Partial | invoice workspace/payment attempts | checkout/session/attempt state | Stripe truth exists; queue is mostly failed-payment attention, not in-progress field state. |
| Card Payment Confirmed | Supported | payment register, invoice workspace | webhook-created recorded payment/allocation | Matches B0 payment truth boundary. |
| Check/Cash/Other Reported | Not as B0 field report | invoice workspace manual payment | authorized user records `payment_status=recorded` directly | No field-reported pending-verification state. |
| Payment Verification Needed | Not supported as queue | none found | no pending non-card verification state found | Major B8 gap. |
| Payment Verified | Supported as recorded payment | payment register, invoice workspace | `internal_invoice_payments.payment_status=recorded` | Works for financial truth, but not field verification workflow. |
| Contractor Correction Needed | Supported | contractor portal, Ops exception/retest readiness | `ops_status=failed/retest_needed`, contractor report/events | Matches contractor-safe model. |
| Contractor Retest Ready | Supported | Ops page signal, notifications, portal | `job_events.event_type=retest_ready_requested` | Matches B0: creates office/rater attention, not automatic completion. |
| Contractor/Rater Handoff Requested | Supported | `/ops/handoffs`, `/ops/connected-handoffs` | `workflow_handoff_requests`, grants | Strong match. |
| Connected Recipient Responded | Supported | handoff actions/pages | handoff request `accepted/completed/rejected` | Strong match; response does not complete installer milestone. |
| Final Inspection Needed | Partial/indirect | contractor portal guidance | passed/certs/final processing status | No first-class final-inspection queue. |

## 6. My Work Visibility Findings

- `/today` tech My Work is conservative: it reads active assignments for the current user, filters out `field_complete`, prioritizes `on_the_way`/`in_process`, then today and overdue scheduled work. It does not include assigned unscheduled work.
- `/ops/field` is broader: it reads all active assigned unfinished jobs and groups them into In Progress, Today, Overdue, Upcoming, and Unscheduled.
- B0 conflict: `/ops/field` `Unscheduled` can expose office-owned backlog in My Work if dispatch assigned someone before scheduling or if an old assigned job lost its scheduled date.
- B0 match to preserve: both `/today` and `/ops/field` remove `field_complete` jobs from ordinary field work.
- B0 match to preserve: active/in-progress assigned work is prioritized.
- Rater-specific My Work is not clearly separated from tech role in reviewed queue contracts; ECC/rater behavior appears represented by assigned internal work plus job type/status rather than a distinct rater role queue.

## 7. Office Queue Findings

- Office/admin/owner operational visibility exists through `/ops`, `/ops/queues/without-tech`, `/ops/queues/waiting`, `/ops/queues/exceptions`, `/ops/closeout-queue`, `/ops/handoffs`, and job detail.
- `need_to_schedule` and without-tech contracts are office-owned and align with B0.
- Office-owned return/callback review is not first-class. Unscheduled return/callback work appears to collapse into `need_to_schedule` or generic linked follow-up state.
- `/ops` contains broad direct queue/count logic, retest-ready signal logic, closeout labels, and handoff/payment cards. It should not remain the only encoded source of queue truth after B2.

## 8. Closeout Queue Findings

- `lib/utils/closeout.ts` is the cleanest current closeout contract: `field_complete=true`, not closed, not blocked by `pending_info/on_hold`, and needing invoice or ECC certs.
- ECC failure flow is guarded: `failed`, `retest_needed`, and `pending_office_review` do not generate cert-needed closeout in `getCloseoutNeeds`.
- Invoice needs can still cause failed/review-family items to appear in closeout when invoice truth is incomplete. That may be acceptable for visibility but should not blur office/rater failure resolution with billing closeout.
- `/ops/closeout-queue` builds a billing-truth projection before filtering, which is good for invoice truth but makes the page heavier than a compact status-only queue.
- Closeout combines cert/paperwork and invoice work in one queue. B0 allows office visibility but wants cert closeout technical/paperwork and billing closeout financial ownership separated in future UX.

## 9. Waiting / Exception Findings

- Waiting status taxonomy exists in `lib/utils/ops-status.ts` through `WAITING_STATE_TYPES`: `waiting_on_part`, `waiting_on_customer_approval`, `estimate_needed`, `waiting_on_access`, `waiting_on_information`, and `other`.
- These waiting types are stored/displayed as reasons under `pending_info` or `on_hold`, not as first-class queue states.
- `lib/ops/focused-queues.ts` says waiting statuses are `pending_info`, `on_hold`, `waiting`, and `pending_office_review`.
- `app/ops/queues/waiting/page.tsx` queries those same statuses, but its select omits `on_hold_reason` while display helpers try to read it.
- `app/ops/queues/exceptions/page.tsx` queries `pending_office_review`, but `buildExceptionQueueRows` drops it because `EXCEPTION_QUEUE_STATUSES` excludes `pending_office_review`.
- Current `problem` is an exception status in helper/page but is not part of `resolveOpsStatus` and is not clearly tied to B0 reason labels.
- B0 conflict: `pending_office_review` is an office review/exception-like state but currently lands in waiting and may disappear from the dedicated exception helper.

## 10. Return / Callback / Retest Findings

- Return/callback vocabulary exists through `service_visit_type` values including `return_visit` and `callback`.
- Linked visit continuity exists through `service_case_id` and `parent_job_id`.
- Job detail includes linked follow-up creation and service-case visit history; job history summary recognizes linked retest/follow-up jobs.
- There is no dedicated office queue for `Return Needed, unscheduled`, `Callback Reported, unscheduled`, callback final posture, or different-issue outcomes.
- Retest is the most mature linked follow-up path: retest children inherit service case, `retest_created` events are written, portal reads retest child chains, and retest-ready requests create contractor-safe/internal attention.
- Current docs state `retest_needed` should be legacy compatibility-only for new writes, while code still reads and routes it broadly. Future implementation should preserve read compatibility while avoiding new assumptions.

## 11. Contractor-Rater Handoff Findings

- Contractor portal visibility is contractor-safe and driven by `ops_status`, failed ECC details, contractor report events, retest child state, and `retest_ready_requested` events.
- Contractor failure guidance is actionable and does not grant scheduling/lifecycle/billing authority.
- `retest_ready_requested` is a contractor signal that routes to internal review/next action; it does not auto-schedule or auto-complete.
- `/ops/handoffs` lists open installer-account handoff requests with `sent/accepted` statuses and explicitly says it updates durable handoff state only and does not complete milestones or mutate jobs.
- `/ops/connected-handoffs` lists active grants for recipient accounts and explicitly says responses do not complete installer milestones.
- Connected-recipient projections use `shared_scope=handoff_request_only`, which matches B0 contractor-safe/recipient-safe boundaries.
- Gap: final inspection guidance exists only indirectly; no first-class `Final Inspection Needed` office/contractor queue contract was found.

## 12. Billing / Payment Visibility Findings

- `lib/auth/financial-access.ts` gates financial authority to structural owner, `admin`, and `billing`.
- Payments Register and failed payment reconciliation are financial-authority surfaces and preserve separation between recorded money and failed attempts.
- `/reports/failed-payments` is a real billing/payment attention queue for unresolved scheduled-autopay failures.
- Job invoice workspace supports internal invoice draft/issue/send/payment recording and Pricebook line item add flows.
- Manual/off-platform payment recording writes `payment_status=recorded` for authorized users; it is not a field-reported pending-verification state.
- No queue was found for `Check/Cash/Other Reported` or `Payment Verification Needed`.
- No Field Billing Enabled per-user capability was found in the reviewed queue contracts.
- Normal technicians appear blocked from financial authority by role, which preserves current safety but does not yet implement B0's future allowed field collection/approved-charge payment model.

## 13. Performance Risk Findings

- `/today` is intentionally parallelized and fail-soft, but it reads multiple concerns: product mode, identity, unread notifications, time clock, today jobs, priority counts, follow-ups, team coverage, recent work, service plans, open invoices, and failed-payment attention.
- `/today` follow-ups read jobs, `job_events`, and `ecc_test_runs` to compute aging/evidence. Any richer B0 routing should avoid making this path heavier.
- `/ops/field` reads all active assigned jobs without a visible limit; adding more queue metadata here could affect field mobile performance.
- `/ops/closeout-queue` reads all field-complete not-closed jobs, builds billing projections, loads assignment display maps, and renders detailed cards. This is accurate but not compact.
- Focused queue routes repeat direct Supabase filters before helper filtering and then load event/evidence aging. B2 should centralize filters to prevent both drift and extra reads.
- `/ops` is a very large orchestration page with many direct queue labels/counts. Future B0 implementation should extract compact read models before adding more logic.
- Handoff and failed-payment queues are relatively compact and should be preserved as projection/read-model style examples.

## 14. Gaps Against B0

1. Field My Work can show assigned unscheduled work on `/ops/field`.
2. `pending_office_review` has inconsistent ownership: waiting queue includes it, exception page queries it, exception helper drops it.
3. Parts/access/unable-to-complete/return-needed/callback/different-issue outcomes lack first-class queue contracts.
4. Return and callback scheduled work works as normal linked jobs, but unscheduled/review states are not distinct from generic scheduling.
5. Cert closeout and invoice closeout are visible together; future UI should separate technical/paperwork responsibility from financial authority.
6. Non-card field payment reporting and office verification are not represented as pending states/queues.
7. Field Billing Enabled is not represented in current queue/permission contracts.
8. `problem`, `waiting`, `field_complete`, `retest_needed`, and `pending_office_review` need clearer status/label ownership before extraction.
9. Queue logic is repeated across route queries, helpers, Today, Ops, job detail, and portal helpers.
10. Final inspection guidance is not first-class.

## 15. Preserve-As-Is Items

- Keep `service_cases` as continuity/history container, `jobs` as visit/work units, and `job_events` as narrative/timeline truth.
- Preserve `/today` tech filtering to assigned unfinished scheduled/active work.
- Preserve removal of `field_complete` jobs from ordinary field My Work.
- Preserve `on_the_way`/`in_process` as active field lifecycle states.
- Preserve financial authority gating to structural owner/admin/billing.
- Preserve webhook/processor truth for Stripe/card payments.
- Preserve failed payment queue separation from collected payment totals.
- Preserve contractor-safe portal visibility and retest-ready as a signal, not an automatic lifecycle mutation.
- Preserve connected handoff response boundaries: response updates handoff state only.
- Preserve closeout helper protection that avoids cert completion for unresolved ECC failure family.

## 16. Recommended Smallest Safe Implementation Slice

Recommended B2 scope should be a docs-backed helper extraction and contract correction slice, not a UI redesign.

Smallest safe path:

1. Create canonical queue status constants/selectors for waiting, exception, closeout, scheduled assigned My Work, and without-tech.
2. Fix the `pending_office_review` contract decision in one place: either exception-owned, waiting-owned, or dual-surfaced with explicit reason. B0 suggests office-review/exception ownership.
3. Align focused queue route filters with helper filters so route query and helper cannot disagree.
4. Add tests for the canonical queue membership functions before changing routes.
5. Keep runtime behavior equivalent except for explicitly accepted contract mismatches such as `pending_office_review` disappearing from Exceptions.

Do not start B3 My Work cleanup, B4 return/callback/exception redesign, or B8 payment verification until B2 canonical queue contracts exist.

## 17. Explicit Non-Actions

This B1 audit performed no implementation changes.

Explicitly not performed:

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

Validation requested for this docs-only slice: `git diff --check`.
