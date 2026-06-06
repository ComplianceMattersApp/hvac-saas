# Compliance Matters Workflow Modernization B7 Field Billing / Payments / Reconciliation Closeout

## 1. Status / Authority / Scope

Status: CLOSED (docs-only closeout for B7 field billing, supplemental invoice, field payment collection, and office payment confirmation milestone)

Authority: Subordinate to:
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B7A_Authorized_Field_Invoice_Mode_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B7E_Field_Payment_Collection_Reconciliation_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B7H_Supplemental_Add_On_Invoice_Audit.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Workflow_Modernization_B6_Field_Billing_Proposal_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6B_Field_Charge_Line_Item_Authority_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6E_Field_Charge_Proposal_Wrapper_Model_Audit.md`

Scope: closeout documentation only. This closeout records the completed B7-A through B7-T2 modernization slices and the locked model boundaries for field billing, supplemental/add-on invoice handling, field payment reporting, and office verification.

This closeout authorizes no runtime code changes, no schema changes, no migrations, no test behavior expansion, no feature expansion, no Stripe/provider behavior changes, no QBO/SMS/customer-portal changes, and no reopening of implementation unless a committed-state contradiction is later found.

Language lock:
- User-facing queue language is `Confirm Payment`.
- `Field Payment Reconciliation Attention` is technical/read-model language and is not primary closeout queue UI copy.

## 2. Executive Summary

B7 is closed for the current milestone scope.

The milestone now delivers a complete end-to-end posture across field billing authority separation, supplemental/add-on invoicing, non-card field payment reporting, office verification, and closeout/ops visibility with the correct truth boundaries preserved.

Key outcomes:
- Authorized field invoice mode is locked as a separate authority lane from proposal-only and payment authority lanes.
- Direct draft charge authority is split from invoice issue/send authority.
- Supplemental/add-on billing is modeled as separate invoice truth, preserving original issued/paid invoice history.
- Field-reported non-card collection is workflow/reconciliation truth until office verification.
- Verification is the only moment non-card reported money becomes final payment truth.
- Rejection creates no payment truth.
- Card payment truth remains Stripe/webhook-confirmed.
- Closeout queue UX is aligned to normal queue patterns with the user-facing label `Confirm Payment`.

## 3. Completed Capabilities

1. B7-A: Authorized field invoice mode audit/model lock completed.
2. B7-B/B7-C: Direct draft invoice authority split and granular line-item permissions completed.
3. B7-D: Invoice issue/send authority split from draft-line authority completed.
4. B7-E: Field payment collection and reconciliation model lock completed.
5. B7-F: Field payment report schema foundation completed.
6. B7-G: Checkout success return polish completed.
7. B7-H: Supplemental/add-on invoice audit completed.
8. B7-I: Supplemental invoice schema/read-model foundation completed.
9. B7-J: Invoice-family read-only surfacing completed.
10. B7-K: Supplemental invoice draft action completed.
11. B7-L: Selected invoice workspace routing completed.
12. B7-M: Create Add-On Invoice UI completed.
13. B7-N: Supplemental invoice end-to-end validation completed.
14. B7-O: Field payment collection routing foundation completed.
15. B7-P: Non-card field payment report action completed.
16. B7-Q: Payment reconciliation queue/read model and closeout visibility completed.
17. B7-Q2: Ops dashboard attention chip completed.
18. B7-R: Verify/reject server actions completed.
19. B7-S: Verify/reject UI completed.
20. B7-T: Validation pass completed with no code changes.
21. B7-T2: Confirm Payment closeout queue UX alignment completed.

## 4. Source-of-Truth Boundaries Preserved

Locked boundaries preserved through B7 closeout:
- `internal_invoice_payments` remains collected-money truth.
- `internal_invoice_payment_allocations` remains allocation truth.
- Stripe/card payment truth remains provider/webhook-confirmed.
- Field payment reports remain reconciliation/workflow truth until verified.
- Manual owner/admin/billing payment recording remains final office/billing truth.
- Invoice paid/balance projection updates only from final payment truth.
- Supplemental invoice remains separate invoice truth; original paid/issued invoice truth remains unchanged.
- Closeout queue remains operational attention/visibility truth, not payment truth.

## 5. Field Billing / Direct Invoice Authority Model

B7 closed the authority split originally identified by B7-A and B6 audits.

Model posture:
- Direct draft invoice line mutation authority is permissioned and separate from proposal-only authority.
- Draft-line authority is separate from invoice issue/send lifecycle authority.
- Draft-line authority does not automatically grant payment collection/reporting/verification authority.
- Proposal mode remains valid for limited/review-first actors.
- Authorized direct invoice mode remains valid for trusted actors under explicit permissions.

Operational effect:
- Trusted users can operate direct draft invoice workflows under bounded permissions.
- Office/admin/billing lifecycle controls remain separate where required.

## 6. Supplemental / Add-On Invoice Model

B7-H through B7-N delivered the supplemental/add-on model closure.

Locked model:
- Net-new post-issue/post-payment commercial scope is represented as a separate supplemental invoice.
- Original invoice commercial and payment history remains immutable for ordinary add-on behavior.
- Supplemental invoice is distinct invoice truth and follows normal lifecycle (draft -> issue -> optional send -> collection).
- Invoice-family visibility and selected-invoice routing are present so operators can view and work the correct invoice record.

Financial projection boundary:
- Payments remain attached to the invoice actually paid.
- Supplemental balances do not retroactively mutate original invoice paid truth.

## 7. Field Payment Collection Model

B7-E, B7-O, and B7-P delivered the field collection/reporting foundation.

Locked model:
- Field collection can include card and non-card methods under the field-payment family.
- `Confirm Payment` means field-reported check/cash/other payment needs office confirmation before it counts as collected.
- Field collector report is pending reconciliation, not payment truth.

Method truth split:
- Card path: processor/webhook confirmation creates final payment truth.
- Check/cash/other path: report creates reconciliation item; no final payment truth is created at report time.

## 8. Confirm Payment / Office Verification Model

B7-R and B7-S completed verification behavior across server and UI.

Locked model:
- Verification is the moment non-card field-reported money becomes final payment truth.
- Rejection creates no payment truth.
- Verification/rejection actions are server-authoritative and role-gated.
- UI exposes verification controls only when actor authority allows it.

Financial authority lock:
- Owner/Admin/Billing manual payment recording remains final payment truth path.
- Field reporting authority does not imply verification authority.

## 9. Closeout Queue and Ops Visibility

B7-Q, B7-Q2, and B7-T2 completed queue and ops visibility.

Delivered visibility posture:
- Reconciliation attention appears in closeout queue as normal queue responsibilities.
- User-facing queue/chip label is `Confirm Payment`.
- Technical phrase `Field Payment Reconciliation Attention` is not primary queue UX copy.
- Ops dashboard attention routes to the closeout queue with the confirm-payment filter.
- The large standalone yellow reconciliation panel presentation was removed from closeout as part of B7-T2 alignment.

Meaning lock:
- `Confirm Payment` queue items represent reported non-card collection that still needs office confirmation.
- Queue visibility supports operational follow-through and does not itself write payment truth.

## 10. Role and Permission Matrix

Actor posture in B7 closeout:
- Owner/Admin/Billing:
- direct invoice and lifecycle authority per existing gates
- manual payment recording final truth authority
- can verify/reject non-card field reports where permissioned
- sees `Confirm Payment` attention and closeout visibility
- Trusted field collector (when granted):
- may collect card through sanctioned path if allowed
- may report check/cash/other collection if allowed
- does not verify non-card report into final truth
- Proposal-only / limited actors:
- remain proposal/review lane for charge capture
- do not gain direct supplemental/payment verification authority

Required practical role-smoke follow-up (non-blocker):
- test a field collector profile with:
- `can_collect_field_payment = true`
- `can_report_non_card_collection = true`
- `can_verify_non_card_collection = false`
- expected behavior:
- field collector reports check/cash/other
- invoice remains pending/unconfirmed
- `Confirm Payment` chip appears for owner/admin/billing
- owner/admin/billing verifies
- invoice payment truth updates only after verification

## 11. Validation Summary

Validation evidence for the B7 closeout lane includes:
- focused action tests for internal invoice payment actions
- field payment reconciliation read-model tests
- closeout queue page tests
- Ops dashboard chip tests
- payment reconciliation report page wiring tests
- field billing access tests
- TypeScript no-emit validation
- `git diff --check` hygiene
- B7-T validation pass with no code changes
- B7-T2 presentation correction validation

Representative command set used in B7-T2 validation:
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-payment-actions.test.ts`
- `npx.cmd vitest run lib/business/__tests__/field-payment-reconciliation-read-model.test.ts`
- `npx.cmd vitest run lib/ops/__tests__/closeout-queue-full-page.test.ts`
- `npx.cmd vitest run lib/ops/__tests__/field-payment-verification-chip-wiring.test.ts`
- `npx.cmd vitest run lib/reports/__tests__/field-payment-reconciliation-queue-page-wiring.test.ts`
- `npx.cmd vitest run lib/auth/__tests__/field-billing-access.test.ts`
- `npx.cmd tsc --noEmit`
- `git diff --check`

## 12. Browser Smoke Summary

Closed browser-smoke posture for B7-T2:
- closeout queue and confirm-payment filter route were exercised.
- no dominant standalone yellow reconciliation panel remained.
- confirm-payment route/filter behavior was validated.
- fixture session had zero open non-card reports during smoke, so positive-path runtime card/chip population was not observable in that session.

Non-blocker rationale:
- server/action/UI tests cover the model behavior and wiring.
- owner-path behavior intentionally remains final-truth manual path when owner records payment directly.

## 13. Known Follow-Up / Role-Smoke Item

Known follow-up to run when fixture/user state is available:
- use a non-financial field collector user who can report non-card collection but cannot verify.
- confirm that reporting creates pending reconciliation state and does not create final payment truth.
- confirm `Confirm Payment` visibility for owner/admin/billing and final-truth transition only on verification.

This follow-up is not a blocker to B7 closeout because:
- owner/financial-authority smoke behavior was correct,
- and tests already cover server/model/UI boundaries for reporting versus verification.

## 14. Deferred Items

Deferred beyond this B7 closeout:
- correction/void action workflow for non-card field payment reports within B7 lane
- refund/dispute behavior expansion
- ACH behavior expansion
- Stripe/webhook behavior expansion beyond existing sanctioned paths
- QBO integration changes
- SMS/provider messaging additions
- customer portal collection/reporting changes
- broad invoice builder redesign
- service-plan visit/next-due operational mutation tied to payment events
- maintenance-agreement operational mutation tied to payment events

## 15. Explicit Non-Actions

This closeout performs none of the following:
- no Stripe/webhook behavior change in this closeout doc
- no card payment behavior change
- no QBO changes
- no SMS changes
- no customer portal changes
- no correction/void action addition in B7 closeout
- no refund/dispute behavior change
- no ACH changes
- no schema changes in this closeout doc
- no invoice issue/send behavior expansion beyond completed authorized scope
- no broad invoice builder redesign
- no service-plan visit/next-due mutation
- no maintenance-agreement operational mutation

## 16. Commit / Implementation References

Preflight closeout state:
- working tree clean
- branch `main`
- local `HEAD` equals `origin/main`
- divergence `0/0` against `origin/main`

Latest pushed commit at closeout time:
- `4543d6ba5cf3062f5115e4849287845a15240628`
- `polish(payments): align confirm payment closeout queue`

B7-T2 implementation/documentation references:
- closeout queue integration and `Confirm Payment` filter/chip wiring in `app/ops/closeout-queue/page.tsx`
- ops chip routing/copy alignment in `app/ops/page.tsx`
- closeout queue page coverage in `lib/ops/__tests__/closeout-queue-full-page.test.ts`
- ops chip routing/copy coverage in `lib/ops/__tests__/field-payment-verification-chip-wiring.test.ts`

Closeout note:
- This document records the committed B7 milestone state and does not reopen implementation scope.
