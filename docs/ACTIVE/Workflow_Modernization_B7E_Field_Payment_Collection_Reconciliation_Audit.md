# Compliance Matters Workflow Modernization B7-E Field Payment Collection / Reconciliation Audit

## 1. Status / Authority / Scope

Status: ACTIVE MODEL AUDIT / MODEL LOCK CANDIDATE

Authority: Subordinate to:
- `docs/ACTIVE/Workflow_Modernization_B7A_Authorized_Field_Invoice_Mode_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6_Field_Billing_Proposal_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B6B_Field_Charge_Line_Item_Authority_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6E_Field_Charge_Proposal_Wrapper_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`

Scope: docs/audit/model only. This slice locks the corrected field payment collection and reconciliation model before any runtime payment collection, verification, queue, or schema work begins.

This slice authorizes no product code changes, no schema changes, no migrations, no Supabase writes, no Stripe/provider changes, no payment-truth writes, no Collect Payment button, no check/cash/other report UI, no reconciliation queue implementation, no invoice issue/send changes, no invoice line mutation changes, no proposal behavior changes, no FieldOutcomePanel changes, no return/callback changes, and no SMS/QBO changes.

## 2. Executive Summary

The original “card-only collect payment” framing was too narrow. The corrected model is a field payment collection lane that can cover card, check, cash, and other payment methods, while still protecting the final truth boundary.

The safety boundary is not card vs non-card permission. The safety boundary is:
- card payment is processor-confirmed and webhook-confirmed
- non-card payment is field-reported and office-verified
- field users do not verify their own non-card money as final payment truth

Recommended lock:
- field users may be granted collection/reporting authority for card, check, cash, and other under one family of field-payment capability
- card launch remains processor-backed and produces no local payment truth on click
- check/cash/other reporting creates a reconciliation item, not final collected-money truth
- office/admin/billing or another explicitly trusted verifier closes the reconciliation item into final payment truth
- final `internal_invoice_payments` truth still comes from existing payment truth paths, especially Stripe/webhook-confirmed card flows and office-authorized manual recording flows where policy allows them

Current codebase already contains the ingredients for this model:
- field capability names for card collection, non-card reporting, and non-card verification
- existing Stripe Checkout / payment-link / saved-card helpers
- manual/off-platform payment recording actions
- payment register and failed-payment read models
- invoice workspace attention surfaces

What is missing is the corrected model lock for a unified field collection family and the reconciliation boundary for non-card money.

## 3. Corrected Field Payment Collection Model

Field payment collection means the field user initiates or reports a payment event tied to approved billable truth.

Corrected model by method:

Card:
- field user launches Stripe Checkout or a sanctioned saved-card path only when allowed
- invoice must be issued and customer-facing
- invoice must have positive balance
- Stripe Connect / online payment readiness must be true
- the field click does not create payment truth
- webhook/provider confirmation creates payment truth

Check / Cash / Other:
- field user reports amount, method, reference, note, and optional evidence
- the report is not final payment truth
- the report creates a reconciliation item for office verification
- office/admin/billing verifies, rejects, corrects, or voids the report
- only verification can convert the report into final payment truth

Model boundary:
- field collection is a permitted action family
- payment truth is still split by method path
- card truth is processor/webhook-led
- non-card truth is office-verified

## 4. Field Collector Permission Model

Recommended umbrella capability:
- `can_collect_field_payment`

Recommended subcapabilities under that umbrella:
- `can_collect_card_payment`
- `can_report_non_card_collection`
- `can_verify_non_card_collection`

Recommended interpretation:
- `can_collect_field_payment` is the parent field-payment family permission
- `can_collect_card_payment` permits launching sanctioned processor-backed card collection flows
- `can_report_non_card_collection` permits reporting check/cash/other collection without creating final truth
- `can_verify_non_card_collection` permits office/financial verification into final truth

Recommended default posture:
- trusted field collectors should usually receive both card collection and non-card reporting authority together when the company intends to use field payment collection
- verification should remain separate by default and should not be bundled into ordinary field collection authority

Recommended permission split:
- collection/reporting authority is a field-facing operational permission
- verification authority is a financial control permission
- the reporting field user must never automatically gain verification authority over their own report

## 5. Card Collection Truth Path

Card collection should continue to reuse existing Stripe-backed payment paths rather than inventing a new payment processor path.

Required card conditions:
- invoice is issued
- invoice has positive balance
- customer-facing invoice truth exists
- tenant Stripe / connect readiness is satisfied
- processor-backed flow is available for the account

Truth path:
1. field user initiates card collection
2. app redirects to existing Stripe Checkout or sanctioned saved-card flow
3. Stripe processes the payment
4. webhook/provider confirmation writes final payment truth
5. invoice paid/balance projections update from recorded collected payment truth

Non-goals for card click:
- do not write `internal_invoice_payments` from the click itself
- do not mark the invoice paid locally from the click itself
- do not create a collected-payment row before Stripe confirms
- do not broaden card collection into a direct-charge or custom processor path in this model lock

Failure visibility:
- abandoned or failed card attempts remain visible as non-collected attention
- failed card attempts do not become collected money
- failed card attempts should continue to surface in existing payment attention models and failed-payment reporting surfaces

## 6. Check / Cash / Other Reporting Truth Path

Check / cash / other collection is field-reported and office-verified.

Required report fields:
- amount
- method
- reporter
- reported time
- invoice/job/customer context
- reference or check number where applicable
- note and optional evidence

Truth path:
1. field user records a collection report
2. report is stored durably as reconciliation/verification work item truth
3. report remains visible to office/finance queues and invoice workspace attention surfaces
4. office/admin/billing verifies, rejects, corrects, or voids the report
5. only verified reports can become final payment truth

Important boundary:
- the reporting field user must not be able to verify their own reported non-card payment into final truth
- reporting must never collapse directly into collected-money truth by default

Recommended method taxonomy:
- Check
- Cash
- Other

Recommended `Other` posture:
- use for Venmo, Zelle, Cash App, PayPal, bank transfer, or similar off-platform methods only as reported collection context
- do not treat `Other` as final settlement until verified

## 7. Reconciliation / Verification Queue Model

Recommended queue name:
- `Payment Reconciliation`
- or `Field Payment Verification Needed`

Queue purpose:
- keep reported non-card money visible until verified
- prevent reported money from falling off-screen as if it were already finalized
- provide office/admin/billing with a focused list of reconciliation work

Recommended queue visibility:
- Owner
- Admin
- Billing/AR
- future explicit verification-authorized roles

Recommended queue row content:
- job
- invoice
- customer
- amount
- method
- reporter
- reported time
- reference
- note/evidence
- current status
- recommended action

Recommended queue statuses:
- reported
- under_review
- needs_correction
- verified
- rejected
- voided
- corrected

Recommended actions:
- verify
- reject
- correct
- void

Queue rule:
- the queue must preserve history of reported items even after verification or rejection
- queue items should not disappear without leaving an audit trail

## 8. Invoice State and Balance Requirements

Card collection requirements:
- issued invoice required
- positive balance required
- customer-facing invoice truth required
- no draft-only card collection

Non-card reporting requirements:
- recommended default: issued invoice required
- draft invoice reporting should remain deferred unless a later slice explicitly approves a pre-issue reconciliation model

Why issued invoice should be the default for all methods:
- field collection should happen against billable commercial truth, not against draft pricing intent
- issuing the invoice freezes the billed record and makes the collection target explicit
- it keeps field collection from becoming a workaround for draft pricing or proposal truth

Draft exception posture:
- if a later company policy wants draft-stage precollection notes, that should be a separate audited model
- this B7-E lock does not open draft collection/reporting as a default behavior

## 9. Job Closeout / Financial Visibility Rules

Field closeout and financial closeout are not the same thing.

Rules:
- field work can be complete while financial reconciliation remains open
- a reported non-card payment must keep the job/invoice visible in financial attention until it is verified, rejected, corrected, or voided
- a failed or abandoned card attempt must remain visible as non-collected attention
- a job should not disappear from financial attention merely because the field user clicked a collection button

Recommended closeout posture:
- operational closeout may finish
- financial closeout remains open until payment truth is settled
- unverified reports should keep invoice/workspace/payment queues visible

Recommended visibility surfaces:
- invoice workspace
- payment reconciliation queue
- failed-payment / payment attention surfaces
- office/admin finance dashboards

## 10. Role and Permission Boundaries

Field collector authority:
- may collect/report payment when explicitly granted
- may not verify own non-card report
- may not reverse, refund, export, or correct final payment truth

Verification authority:
- Owner
- Admin
- Billing/AR
- future explicit verifier role

Non-goals for field collectors:
- no financial self-approval
- no self-verification of check/cash/other reports
- no payment export authority
- no correction authority over final payment truth
- no Stripe/provider administration authority

Recommended default grouping:
- trusted field collectors receive card collection and non-card reporting together by default when the company wants field collection
- verification remains separate and permissioned to office/financial authority

## 11. Data / Schema Needs

This audit does not authorize schema changes, but the model requires durable storage for non-card reports and reconciliation state.

Likely future additive structures:
- field payment report record
- verification status
- reporter identity
- verifier identity
- audit timestamps
- invoice/job/customer linkage
- reference/evidence fields
- resolution reason fields

Recommended model shape for a later schema slice:
- one reported item per field collection event
- one optional verification outcome per reported item
- preserve report history after verification or rejection
- preserve linkage to final payment rows when verified into truth

Why a dedicated report layer is needed:
- `internal_invoice_payments` is collected-money truth, not a field-report inbox
- the queue needs to represent unverified money without pretending it is already collected truth
- verification history must remain auditable and separate from the report event itself

## 12. Existing Payment Paths to Reuse

Reuse, do not replace:

Card collection reuse:
- existing Stripe Checkout / payment-link helpers
- existing saved-card charge paths
- existing webhook-confirmed payment truth handlers

Manual/off-platform reuse:
- existing manual payment recording action as the office/finalization path where policy allows it
- existing invoice payment / allocation projection helpers

Attention / visibility reuse:
- existing failed-payment reconciliation read model
- existing invoice workspace failed-payment attention panels
- existing payment register and failed-payment queue surfaces

What should not be reused directly for field reporting:
- the final manual payment record action as a field report action
- the payment truth tables as a substitute for a reconciliation inbox

## 13. UI Routing Rules

Field user UI:
- show field payment collection entry points only when the user has field collection authority
- card, check, cash, and other should sit under one field-payment family in the UI
- card launch should be clearly separated from non-card reporting copy
- non-card reporting should make it obvious that office verification is still required

Office / finance UI:
- show reconciliation queue for reported non-card items
- show verification actions only to authorized users
- show payment attention and failed-card attempts as separate but related visibility surfaces

Invoice workspace UI:
- show collected card truth separately from reported non-card items
- show reported-but-unverified money as open financial attention
- keep history after verification, rejection, correction, or voiding

## 14. Recommended Implementation Sequence

1. B7-E model lock.
2. Add field collection report schema/event foundation for check/cash/other.
3. Add field collection permission helpers: field collection/report authority and card launch authority.
4. Add non-card report authority.
5. Add non-card verification authority.
6. Add card collection wrapper using existing Stripe path for issued positive-balance invoices.
7. Add non-card report action with no payment-truth mutation.
8. Add reconciliation queue/read model.
9. Add verify/reject/correct/void actions for financial authority.
10. Integrate invoice workspace and job detail visibility.
11. Integrate closeout / financial attention so unverified reports stay visible.
12. Add visual polish and reporting after the model is stable.

## 15. Risks / Guardrails

Risks:
- collapsing reported money into final payment truth too early
- allowing field users to verify their own non-card reports
- hiding reported cash/check/other behind a collection click without a queue item
- making card and non-card logic drift into separate inconsistent permission families
- introducing a new runtime path that bypasses existing webhook-confirmed card truth

Guardrails:
- keep card truth processor/webhook-led
- keep non-card truth office-verified
- keep reporting and verification separate
- keep verification authority away from the reporting field user
- preserve historical report items after resolution
- reuse existing sanctioned payment paths wherever possible

## 16. Explicit Non-Actions

This slice does not:
- change runtime behavior
- add or modify schema
- add migrations
- modify Supabase data
- modify Stripe/provider/webhook behavior
- create a Collect Payment button
- create a check/cash/other report UI
- create a reconciliation queue
- create verification actions
- change invoice issue/send behavior
- change invoice line mutation behavior
- change proposal behavior
- change FieldOutcomePanel behavior
- change return/callback behavior
- change SMS/QBO behavior
- create any payment truth from field click alone
- let the reporting field user verify their own non-card money
