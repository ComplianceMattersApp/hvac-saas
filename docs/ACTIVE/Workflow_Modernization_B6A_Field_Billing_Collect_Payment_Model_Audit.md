# Compliance Matters Workflow Modernization B6-A Field Billing / Collect Payment Model Audit

## 1. Status / Authority / Scope

Status: ACTIVE MODEL AUDIT / MODEL LOCK CANDIDATE

Authority: Subordinate to:
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`

Scope: Audit/model lock for a future field-facing `Collect Payment` / `Take Payment` workflow.

This slice is documentation and audit only. It authorizes no product code changes, schema changes, migrations, Supabase writes, Stripe/provider changes, payment behavior changes, invoice behavior changes, queue membership changes, `FieldOutcomePanel` changes, return/callback behavior changes, SMS changes, QBO changes, or production actions.

Language lock:
- Use `Collect Payment` or `Take Payment` for the field-facing action.
- Avoid `Pay Now` internally for field workflow naming because it reads as a customer-facing invoice button.

## 2. Executive Summary

The existing billing and payment foundation is strong enough to support a future field collection lane, but the lane should be permissioned and sequenced carefully.

Current capabilities already include:
- internal invoice draft creation, billing detail editing, line item management, issue, void, and email/send behavior
- manual/off-platform payment recording for issued invoices
- Stripe Checkout payment link creation for eligible issued invoices
- one-time saved-card charge for eligible issued invoices
- webhook-confirmed Stripe payment truth in `internal_invoice_payments`
- allocation-compatible invoice paid/balance projection
- failed-payment attention and reconciliation visibility for financial users

Current financial authority is intentionally narrow. Structural account owner, `admin`, and `billing` have financial authority. Office/dispatcher and technician users are blocked by default from payment recording, payment-link creation, saved-card charge, invoice lifecycle, financial register, export, and reversal actions. Tests explicitly cover technician denial for manual payment recording and Checkout session creation.

The safest B6 implementation posture is not to let a field button create payment truth. Field card collection should launch an existing sanctioned Stripe path against an issued/approved invoice or approved charge, with final truth still coming from Stripe webhooks. Check/cash/other field collection should create a report requiring office verification and must not count as collected money until a financially authorized office/admin/billing user verifies and records/finalizes payment truth.

## 3. Existing Payment / Invoice Capabilities

Reviewed areas:
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/invoice/page.tsx`
- `app/jobs/[id]/invoice/_components/TenantInvoicePaymentLinkPanel.tsx`
- `lib/actions/internal-invoice-actions.ts`
- `lib/actions/internal-invoice-payment-actions.ts`
- `lib/actions/customer-saved-payment-method-actions.ts`
- `lib/business/internal-invoice.ts`
- `lib/business/internal-invoice-payments.ts`
- `lib/business/tenant-invoice-stripe-webhooks.ts`
- `lib/business/tenant-saved-method-payment-attempts.ts`
- `app/api/stripe/webhook/route.ts`
- `lib/auth/financial-access.ts`
- invoice/payment/pricebook/register tests listed in the validation notes below

Existing invoice lifecycle:
- `createInternalInvoiceDraftFromForm` creates a draft internal invoice for a scoped job.
- `saveInternalInvoiceDraftFromForm` edits draft invoice billing/contact/notes fields.
- `addInternalInvoiceLineItemFromForm` adds manual draft line items.
- `addInternalInvoiceLineItemFromPricebookForm` adds active scoped Pricebook items to draft invoices with frozen snapshots.
- `addInternalInvoiceLineItemsFromVisitScopeForm` adds selected job visit-scope items to draft invoices as zero-dollar service lines unless edited later.
- `updateInternalInvoiceLineItemFromForm` edits draft line item name, description, item type, quantity, and price.
- `removeInternalInvoiceLineItemFromForm` removes draft line items.
- `issueInternalInvoiceFromForm` issues a draft invoice only when the job is completed, field complete, billing name exists, at least one charge exists, and total is greater than zero.
- `sendInternalInvoiceEmailFromForm` sends/resends an already-issued invoice email and can include a payment link when eligible.
- `voidInternalInvoiceFromForm` voids while preserving invoice history.

Existing payment capabilities:
- `recordInternalInvoicePaymentFromForm` records manual/off-platform payments for issued invoices only.
- `createTenantInvoiceCheckoutSessionFromForm` creates a Stripe Checkout session/payment link for eligible issued invoices with positive balance and ready Stripe Connect.
- `collectTenantInvoicePaymentNowFromForm` redirects directly to Stripe Checkout using the same sanctioned Checkout session action.
- `chargeSavedCardForIssuedInvoiceFromForm` starts a one-time saved-card charge for eligible issued invoices.
- `retryFailedScheduledAutopayAttemptFromForm` retries eligible failed scheduled-autopay attempts from the invoice workspace.
- Payment history separates collected rows from failed/reversed/not-collected rows.

Existing payment surfaces:
- Job detail has an internal invoice panel and a link into the richer invoice workspace.
- `/jobs/[id]/invoice` is the primary internal invoice workspace for charge building, issuing, sending, payment options, payment history, failed payment attention, and audit details.
- `/payments/checkout-complete` is the public Stripe Checkout return surface and states that invoice balance updates after payment processing finishes.
- `/reports/payments` and failed-payment reports/read models provide financial visibility.
- Ops/Today failed-payment attention surfaces are financial-authority gated.

## 4. Existing Financial Role / Access Model

Canonical helper: `lib/auth/financial-access.ts`.

Current financial authority:
- structural account owner
- active internal `admin`
- active internal `billing`

Current blocked-by-default roles:
- `office` / dispatcher unless the actor is also the structural owner
- `tech`
- contractor/portal users
- inactive users
- unauthenticated users

Financial helper capabilities:
- `canViewFinancialRegister`
- `canManageInvoiceLifecycle`
- `canRecordInvoicePayment`
- `canCreateTenantInvoicePaymentLink`
- `canExportFinancialData`

Server action gates observed:
- manual payment recording requires `requireInvoicePaymentRecordAccessOrRedirect`
- Checkout session/payment link creation requires `requireTenantInvoicePaymentLinkAccessOrRedirect`
- invoice draft create/issue/void/send paths require `requireInvoiceLifecycleAccessOrRedirect`
- saved-card setup/charge/retry paths use `canManageInvoiceLifecycle`
- financial reports and failed-payment visibility use financial-access checks

Important current-state nuance:
- The richer invoice workspace computes `canManageFinancialInvoiceLifecycle` for saved-card lookup/control, but some issued-invoice payment UI is visible based on invoice/readiness state while server actions enforce authority on submit.
- Draft line-item mutation actions call scoped internal job/draft invoice checks, but the observed `requireDraftInvoiceContext` path does not itself call `requireInvoiceLifecycleAccessOrRedirect`. Existing tests focus heavily on scope/draft/pricebook validity; role-authority coverage for draft line-item mutation should be explicitly audited before field charge permissions are built.

## 5. Field Billing Problem Statement

Field users need a real-world way to collect payment while standing with the customer after work is complete. Today the app supports invoice billing, payment links, saved-card charge, and manual/off-platform payment recording, but those are office/financial-authority oriented surfaces.

The problem is not only adding a button. The field workflow must answer:
- what billable truth exists before payment
- who can create or modify charge lines
- what payment methods a field user can initiate
- when a field-reported collection becomes financial truth
- how office verifies non-card money
- how job closeout reacts without hiding unverified payment obligations

Core rule:

Field work creates billing context. Invoice/charge creation creates billable truth. Payment follows billable truth.

## 6. Collect Payment Definition

`Collect Payment` means the field user initiates or reports a customer payment against approved billable truth.

It has two distinct meanings by method:

Card payment:
- Stripe-backed collection.
- The field user may launch or assist with the Stripe collection flow only when allowed.
- Final payment truth is created by Stripe/webhook-confirmed payment records and allocation truth, not by the field click.
- The app must not manually mark card payments paid from a field action.

Check/cash/other field collection:
- The field user reports that payment was collected.
- This is not final collected-money truth.
- It should create a verification item for office/admin/billing.
- Final payment truth is recorded only after office verification.

`Collect Payment` before an invoice exists means one of two safe things:
- guide to create/review charges first, if the actor has charge-line authority
- route to office billing review, if the actor does not have charge-line authority

It should not create payment truth or mark a job paid when no billable truth exists.

## 7. Card Payment Recommended Model

Recommended first card posture:
- Allow field card collection only against an existing issued invoice or an office-approved charge/invoice state.
- Reuse the sanctioned Stripe Checkout or saved-card attempt architecture.
- Keep Stripe Connect readiness checks.
- Keep issued/non-void/positive-balance eligibility checks.
- Keep account/customer/invoice/job metadata on Stripe objects.
- Keep duplicate/idempotency protections.
- Keep final payment truth in webhook-created `internal_invoice_payments` and allocation-compatible projection.
- Keep failed attempts as non-collected attention truth.

Recommended not-first:
- Do not let a field user mark a card payment paid.
- Do not let a field button directly insert recorded Stripe payment rows.
- Do not let field-created unapproved draft charges be card-collected in the first implementation.
- Do not introduce a new processor or direct-charge path in B6 if existing Checkout/saved-card paths can safely carry the first slice.

Existing card paths to reuse:
- `createTenantInvoiceCheckoutSession` for Stripe Checkout payment links against issued invoices.
- `collectTenantInvoicePaymentNowFromForm` for direct redirect into the same Checkout path.
- `startManualSavedMethodPaymentAttempt` for one-time saved-card charge attempts where a saved method and reuse authorization exist.
- `app/api/stripe/webhook/route.ts` handling `checkout.session.completed`, `charge.succeeded`, and `charge.failed`.

## 8. Check / Cash / Other Recommended Model

Recommended model:
- Field user reports method, amount, reference/check number where applicable, and note/photo/context where useful.
- The report is not a recorded payment.
- The report routes to a financial verification queue.
- The report remains visible until verified, rejected, corrected, or voided by authorized office/admin/billing.

Method options:
- Check
- Cash
- Other

`Other` should capture reference/memo details. Digital/off-platform categories such as Venmo, Zelle, Cash App, PayPal, or bank app transfer may later map into the existing payment taxonomy, but first field reporting should avoid pretending those are settled until verified.

Do not use current `recordInternalInvoicePaymentFromForm` as the field report action. That action records final manual/off-platform payment truth today and is correctly reserved for financial authority.

## 9. Office Verification Recommended Model

Office verification means a financially authorized office/admin/billing user confirms that non-card money was actually received and then records/finalizes payment truth.

Recommended verifier:
- structural owner
- `admin`
- `billing`
- any future explicit financial verification permission

Not verifier by default:
- normal technician
- Field Billing Enabled technician
- dispatcher/office without separate financial authority
- contractor/portal user

Verification should include:
- original reported amount/method/reference
- reporter identity
- reported time
- linked customer/job/invoice/charge
- optional evidence/note
- verifier identity
- verified/rejected/corrected status
- final recorded payment id if verified into payment truth

Recommended first surface:
- a Billing/AR or Ops financial attention queue for `Field Payment Verification Needed`
- invoice workspace should also show pending reports for the invoice
- job closeout should not hide unresolved non-card verification obligations

## 10. Field Charge / Line Item Authority

Existing relationship:
- Work Items / Visit Scope are operational work truth on `jobs.visit_scope_items`.
- Invoice line items are billed/commercial truth snapshots in `internal_invoice_line_items`.
- Pricebook items are reusable catalog/default data in `pricebook_items`.
- Manual/custom invoice lines are draft invoice line items with `source_kind = manual`.
- Pricebook lines freeze item name, description, type, category, unit label, quantity, unit price, and subtotal at insertion.
- Visit-scope lines freeze selected work item title/details into invoice line snapshots and currently insert at `$0.00` unless later edited.

Current capabilities:
- active Pricebook item can become a draft invoice line with default price
- visit scope items can become draft invoice lines with provenance and duplicate guards
- manual draft lines can be added
- draft line descriptions, quantities, and prices can be edited
- issued invoice charges are frozen

Recommended field authority split:
- collection authority and charge-line authority must be separate.
- a user may collect payment against approved/issued charges without being able to edit price.
- normal technicians should not modify price, apply discounts, or add manual/custom charges by default.
- Field Billing Enabled should be a separate company/user capability, not a replacement for Billing/Admin/Owner.

Minimum future permissions/settings:
- `Field Billing Enabled`
- `Can edit description`
- `Can edit quantity`
- `Can edit price`
- `Can add manual/custom charge`
- `Can select Pricebook items`
- `Can collect card payment`
- `Can report check/cash/other collection`
- `Can verify check/cash/other collection`

Open implementation risk:
- Before enabling field charge entry, audit and tighten draft line-item action authority so field permissions are explicit. Do not rely on the current broad internal draft-line action posture unless that is deliberately accepted and tested.

## 11. Pricebook-Incomplete Startup Reality

Pricebook should help standardize field billing but cannot be a startup dependency.

Observed current model supports:
- Pricebook-backed lines where active scoped items exist.
- Visit-scope-backed lines even when Pricebook is incomplete.
- Manual draft lines.

Recommended startup posture:
- If Pricebook has matching items, prefer it and lock default price for normal techs.
- If Pricebook is incomplete, allow office/admin/billing or Field Billing Enabled users to create manual/custom charge lines.
- If a normal technician lacks manual price authority and Pricebook is incomplete, route to office billing review rather than blocking job completion or inventing a price.
- Visit scope can help prefill operational descriptions, but it is not automatically commercial truth.

Pricebook-incomplete should result in guided fallback, not payment truth shortcuts.

## 12. Job Closeout Interaction

Existing B4/B5 lock:
- field finish outcomes route responsibility without adding payment/invoice side effects
- return/callback workflows do not add invoice/payment behavior
- field payment and office verification were intentionally deferred

Recommended future interaction:
- Card collected and webhook-confirmed paid:
  - invoice payment projection updates from collected payment truth
  - job closeout can advance only if operational, paperwork/certs, billing, and other blockers are satisfied
  - no visit count or service-plan next-due mutation should be driven by payment alone
- Card attempted but failed:
  - job remains unpaid from financial perspective
  - failed payment appears as attention, not collected money
  - closeout should not treat failed attempt as payment complete
- Check/cash/other reported by field:
  - field responsibility for payment collection may be complete
  - financial closeout remains blocked by verification
  - job should surface `Payment Verification Needed` or equivalent billing attention
- Check/cash/other verified:
  - authorized verifier records/finalizes payment truth
  - closeout can reevaluate billing state
- Check/cash/other rejected/corrected:
  - job remains unpaid or partially paid
  - office decides next customer/payment action

## 13. Required Permissions / Settings

Recommended model:
- `Field Billing Enabled`: user/company setting allowing field billing entry points.
- `Can select Pricebook items`: may add approved catalog items at locked/default price.
- `Can edit description`: may alter charge descriptions.
- `Can edit quantity`: may change quantity.
- `Can edit price`: may enter or override unit price.
- `Can add manual/custom charge`: may add non-Pricebook line items.
- `Can collect card payment`: may launch sanctioned Stripe collection against eligible approved billable truth.
- `Can report check/cash/other collection`: may create a non-card field collection report.
- `Can verify check/cash/other collection`: financial authority only in first posture.

Recommended defaults:
- normal technician: off for charge editing; optionally on for card collection against issued/approved invoice; optionally on for non-card report only
- Field Billing Enabled technician: may add/edit charges within configured policy; cannot verify non-card money
- office/dispatcher: not financial by default; may route/review operationally
- billing/admin/owner: financial lifecycle, verification, correction, reversal, export where supported

## 14. Schema-Free First Step Recommendation

The first implementation step should remain schema-free or as close to schema-free as possible.

Recommended immediate next slice after B6-A:
- Field charge/line-item UX and authority audit.
- Verify server-side authority for every draft charge action.
- Decide whether existing invoice draft line item actions need role/permission hardening before field use.
- Map exactly which current actions can be reused unchanged, wrapped, or must be split for field-specific authority.
- Keep no runtime behavior changes until that audit is accepted.

Possible schema-free implementation after that:
- show a `Collect Payment` entry point only when an existing issued invoice has a balance and the actor has explicit field collection permission
- use existing Checkout redirect/session action path with a new field wrapper that still calls the same eligibility and server-side financial/field permission checks
- do not create new payment truth or verification tables in the card-only first slice

Check/cash/other reporting likely needs schema or event storage to be honest. Do not fake it with final manual payment recording.

## 15. Future Schema/Event Needs, If Any

Likely future additive needs for non-card field collection:
- `field_collection_reports` or equivalent durable table
- report status: `reported`, `verification_needed`, `verified`, `rejected`, `corrected`, `voided`
- method: `check`, `cash`, `other`
- amount, currency, reference, memo/note
- reporter user id and reported timestamp
- customer/job/invoice/charge ids
- optional evidence/attachment references
- verifier user id and verified timestamp
- final internal invoice payment id if verified
- rejection/correction reason

Likely event needs:
- `field_collection_reported`
- `field_collection_verified`
- `field_collection_rejected`
- `field_collection_corrected`

Potential read models:
- Field Payment Verification Needed queue
- invoice-level pending field collections
- customer payment history pending/verified separation
- Ops/Today financial attention counts for authorized users

Schema/event additions should be additive, audit-preserving, and separated from Stripe/card payment truth.

## 16. Recommended Implementation Sequence

1. B6-A audit/model lock.
2. Field charge/line-item UX and authority audit.
3. Permission model for `Field Billing Enabled` and field collection sub-permissions.
4. Card-only `Collect Payment` against existing issued invoice or approved charge, using sanctioned Stripe path and webhook truth.
5. Field collection report for check/cash/other, with no collected-money truth mutation.
6. Office verification queue/action for check/cash/other.
7. Closeout integration so verified payment can satisfy billing while unverified reports remain visible.
8. Visual polish and reporting for field collection, verification, invoice workspace, Ops/Today attention, and payment history.

Smallest safe implementation slice:
- field card collection against existing issued invoice with positive balance, Stripe Connect ready, explicit field collection permission, no line-item creation, no manual/non-card reporting, and no payment truth mutation outside existing webhook paths.

## 17. Risks / Guardrails

Risks:
- confusing field `Collect Payment` with customer-facing `Pay Now`
- letting a field click create payment truth
- letting failed Stripe attempts count as collected money
- letting check/cash/other reports disappear without verification
- allowing line-item price edits through broad internal draft invoice paths
- collecting against draft or unapproved charges too early
- requiring complete Pricebook before startup customers can bill
- blending office financial verification with technician field responsibility
- hiding unpaid/unverified financial state during job closeout

Guardrails:
- Stripe/card truth remains webhook-confirmed.
- Manual/off-platform final payment recording remains financial-authority only.
- Non-card field collection reports are not collected money.
- Charge-line authority is separate from collection authority.
- Issued invoice charges remain frozen.
- Failed payment rows remain non-collected and visually separated.
- Invoice paid/balance remains derived from collected/recorded/active payment truth.
- Payment does not mutate visit truth, service-plan visit counts, or `next_due_date`.
- Field Billing Enabled does not grant refund, reversal, void, correction, export, or non-card verification authority.

## 18. Explicit Non-Actions

This B6-A audit performed no runtime mutation.

Explicit non-actions:
- no product code changes
- no schema changes
- no migrations
- no Supabase writes
- no Stripe/provider changes
- no payment behavior changes
- no invoice behavior changes
- no queue membership changes
- no `FieldOutcomePanel` changes
- no return/callback behavior changes
- no SMS behavior changes
- no QBO behavior changes
- no env/feature flag changes
- no broad rewrite of prior docs

## Source References Reviewed

Docs:
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Code/tests:
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/invoice/page.tsx`
- `app/jobs/[id]/invoice/_components/TenantInvoicePaymentLinkPanel.tsx`
- `app/api/stripe/webhook/route.ts`
- `lib/actions/internal-invoice-actions.ts`
- `lib/actions/internal-invoice-payment-actions.ts`
- `lib/actions/customer-saved-payment-method-actions.ts`
- `lib/actions/pricebook-actions.ts`
- `lib/auth/financial-access.ts`
- `lib/business/internal-invoice.ts`
- `lib/business/internal-invoice-payments.ts`
- `lib/business/payment-allocations.ts`
- `lib/business/tenant-invoice-stripe-webhooks.ts`
- `lib/business/tenant-saved-method-payment-attempts.ts`
- `lib/jobs/visit-scope.ts`
- `lib/reports/payments-register.ts`
- relevant tests under `lib/actions/__tests__`, `lib/business/__tests__`, `lib/reports/__tests__`, `lib/jobs/__tests__`, and `app/jobs/[id]/invoice/__tests__` for invoice payment links, Stripe Checkout, manual payment recording, saved-card charge, payment allocations, payment register, financial access, Pricebook line items, and role denial.
