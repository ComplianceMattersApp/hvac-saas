# Compliance Matters Workflow Modernization B8-B Field Billing Access and Payment Workflow Closeout

## 1. Status / Authority / Scope

Status: CLOSED.

Authority: subordinate to:
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Workflow_Modernization_B8A_Invoice_Payment_Workspace_Field_First_UX_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B8B1_Field_Billing_Capability_Persistence_Model_Lock.md`
- `docs/ACTIVE/Workflow_Modernization_B7_Field_Billing_Payments_Reconciliation_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B7E_Field_Payment_Collection_Reconciliation_Audit.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Scope: docs-only closeout for the B8-B field billing access, per-user capability persistence, runtime permission wiring, field invoice build path, field payment reporting path, and Confirm Payment office-verification workflow.

This closeout records the committed B8-B state. It does not authorize or perform runtime changes, schema changes, migrations, payment truth changes, Stripe/webhook changes, invoice issue/send changes, customer portal work, SMS, QBO, correction/void actions, refund/reversal/export behavior, or broad invoice builder redesign.

Preflight closeout state:
- working tree clean before this closeout document was created
- branch `main`
- local `main` showed no ahead/behind divergence from `origin/main`
- latest commit at closeout preflight: `06a9332cfe7a83a52ab907918ca71a0cabc3d48f`

## 2. Executive Summary

B8-B existed because B7 completed the payment truth model, but field users still needed a simple, real, end-to-end billing and payment path without becoming Admin or Billing.

B8-B closes that gap. A Technician or field user can now be granted Field Billing Access as a per-user capability grant. That grant lets the user view billing status, build an invoice from job work items, price imported draft invoice lines, issue/freeze the invoice when safe, collect card payment through sanctioned Stripe paths, and report cash/check/other payment for office confirmation.

The core product result is: Field Billing Access is now operationally meaningful end to end, while payment truth boundaries remain intact.

## 3. Completed Capabilities

Completed B8-B capabilities:
- account-scoped per-user capability persistence through `internal_user_access_capabilities`
- strict allowlisted field billing/payment capability keys
- read helper that loads enabled persisted capabilities and maps them into `Partial<FieldBillingCapabilities>`
- runtime wiring so invoice, payment, job-detail, closeout, and report surfaces resolve saved explicit capabilities
- simplified admin permission UI with two owner-facing controls:
  - `Enable field billing access`
  - `Confirm field-reported payments`
- field invoice draft creation from approved job work items
- field draft-line editing for imported work items
- card collection authority through existing Stripe-confirmed paths
- non-card field payment reporting for cash/check/other
- pending report visibility in Confirm Payment workflows
- office verification into final payment truth
- rejection path that creates no payment truth
- Confirm Payment report page polish with queue-style cards and clearer truth copy

## 4. Field Billing Access Final Meaning

For a field user, Field Billing Access now means:
- view billing status
- start/build an invoice from job work items
- import permitted work items as draft invoice charges
- edit imported draft invoice line description/work instruction
- edit imported draft invoice line quantity
- edit imported draft invoice line unit price
- recompute draft invoice totals through the existing invoice line/totals path
- issue/freeze the invoice for collection when the existing invoice readiness gates allow it
- collect card payment when card collection is enabled
- accept cash/check/other payment as a field-reported collection event
- route cash/check/other to Confirm Payment unless the actor has office/final payment authority

Field Billing Access does not mean:
- Admin role
- Billing role
- final manual payment recording authority
- Confirm Payment verification authority
- refund/reversal/export authority
- broad financial reporting authority
- broad manual/custom invoice line authority
- pricebook invoice line authority unless separately granted in a future slice
- invoice send/email authority

## 5. Capability Persistence and Runtime Wiring

B8-B implemented the B8-B1 model lock through a narrow account-scoped row-per-capability table:

`internal_user_access_capabilities`

Foundation characteristics:
- account-scoped by `account_owner_user_id`
- target internal user scoped by `internal_user_id`
- one row per capability key
- `enabled` flag used for grant/disable state
- strict capability-key allowlist
- no broad role expansion
- no delete workflow required for normal disable behavior
- no contractor, portal, or external-user access

Initial allowlisted keys:
- `field_billing_enabled`
- `can_view_field_billing_summary`
- `can_collect_field_payment`
- `can_report_non_card_collection`
- `can_collect_card_payment`
- `can_verify_non_card_collection`

Read helper behavior:
- loads enabled rows for the active internal user and account
- maps only supported field billing/payment keys
- ignores unknown keys defensively
- ignores disabled rows
- returns `{}` when ids are missing
- fails closed on read failure
- does not infer Technician authority from role alone
- cannot grant final manual payment authority, refund/reversal/export, or invoice send authority

Runtime wiring now passes saved explicit capabilities into the field billing resolver across:
- mobile job detail billing card / `FieldBillingSummary`
- invoice workspace
- invoice line item builder/edit actions
- card collection action gates
- non-card field payment reporting action gates
- Ops Confirm Payment attention
- closeout queue
- payment reconciliation / Confirm Payment page

## 6. Field Invoice Build Path

B8-B completes the safe field invoice build path:

1. Technician with Field Billing Access opens a job.
2. Billing card shows a clear invoice path when no invoice exists.
3. User starts a draft invoice.
4. User imports approved job work items as invoice charges.
5. Imported lines start as draft charges and may be edited before issue.
6. User can edit description/work instruction, quantity, and unit price.
7. Existing subtotal and invoice total recompute behavior is used.
8. User can issue/freeze the invoice for collection when safe.

Boundaries preserved:
- draft-line edits remain limited to draft invoices through existing draft invoice guards
- selected invoice routing with `invoice_id` remains preserved
- same-account and selected-job scope checks remain in place
- field user cannot add manual/custom invoice lines
- field user cannot add pricebook invoice lines unless separately granted
- field user cannot remove invoice lines
- field user does not gain invoice send/email authority
- field user does not gain broad invoice lifecycle authority beyond the safe field billing path

## 7. Field Payment Collection Path

B8-B completes the field collection path for card and non-card methods.

Card:
- field user can collect card payment only when card collection is granted
- invoice must be issued and have a balance
- existing Stripe Checkout/sanctioned card paths are used
- click/launch does not create collected-money truth
- card payment truth remains Stripe/webhook-confirmed

Cash/check/other:
- field user enters amount, method, reference/check number when applicable, and note
- action validates active internal user, same account, scoped job, selected invoice, issued invoice state, positive balance, supported method, positive amount, and no over-balance report
- action creates a `field_payment_collection_reports` row
- action does not create an `internal_invoice_payments` row
- action does not update invoice paid/balance as collected
- action routes the item to Confirm Payment

The field user sees the payment as reported/awaiting confirmation, not final collected truth.

## 8. Confirm Payment / Office Verification Path

Confirm Payment is the office verification path for field-reported non-card payments.

Office/verification behavior:
- Owner/Admin/Billing or explicitly authorized verifier can see pending reports
- verifier must not be the reporting user
- Verify is the moment non-card field-reported money becomes final payment truth
- verification creates the final manual/off-platform payment truth through the existing B7-R path
- verification updates invoice paid/balance projection only after final payment truth exists
- Reject requires a reason and creates no payment truth

Confirmed UI surfaces:
- Ops Confirm Payment attention
- closeout queue Confirm Payment items
- `/reports/payment-reconciliation`, now presented as `Confirm Payment`
- invoice workspace pending/awaiting confirmation context

## 9. Admin Permission UX Final State

The owner-facing admin UI is intentionally simple.

Visible controls:
- `Enable field billing access`
- `Confirm field-reported payments`

Meaning:
- `Enable field billing access` grants the selected safe field billing bundle without changing the user role.
- `Confirm field-reported payments` grants verification authority for reported non-card payments.

The UI intentionally removed unnecessary owner-facing sub-toggles for the B8-B smoke/product path. Owners should not need to understand every internal capability needed for the safe field billing path.

Important permission boundaries:
- role dropdown remains role-only
- saving field billing access does not make the target Admin or Billing
- saving field billing access does not grant final manual payment authority
- verification remains separate from field collection/reporting

## 10. Validation Summary

Representative B8-B validation passed across the following focused areas:
- admin capability schema foundation tests
- capability read helper tests
- field billing access resolver tests
- admin field billing capability save/action tests
- invoice workspace wiring tests
- job detail billing summary tests
- invoice line item action tests
- internal invoice scope hardening tests
- internal invoice payment action tests
- payment reconciliation / Confirm Payment page wiring tests
- field payment reconciliation read-model tests
- closeout queue page tests
- TypeScript no-emit validation
- `git diff --check`

Representative commands from the closing B8-B slices:
- `npx.cmd vitest run lib/auth/__tests__/field-billing-access.test.ts`
- `npx.cmd vitest run lib/auth/__tests__/internal-user-access-capabilities-read-helper.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-user-field-billing-capabilities-actions.test.ts`
- `npx.cmd vitest run lib/jobs/__tests__/field-billing-summary.test.ts`
- `npx.cmd vitest run lib/jobs/__tests__/internal-invoice-workspace-saved-card-wiring.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-payment-actions.test.ts`
- `npx.cmd vitest run lib/reports/__tests__/field-payment-reconciliation-queue-page-wiring.test.ts`
- `npx.cmd vitest run lib/business/__tests__/field-payment-reconciliation-read-model.test.ts`
- `npx.cmd vitest run lib/ops/__tests__/closeout-queue-full-page.test.ts`
- `npx.cmd tsc --noEmit`
- `git diff --check`

Closeout-doc validation for this slice:
- `git diff --check` required
- no runtime tests required because this closeout is docs-only

## 11. Browser Smoke Summary

B8-B positive-path browser smoke reached the end of the intended workflow:
- Technician with Field Billing Access submitted cash payment.
- Submission created an open field payment report.
- Invoice did not become paid immediately from the field report.
- Owner/Admin saw the pending Confirm Payment item.
- Owner/Admin verification passed.
- Invoice became paid only after verification.

This smoke confirms the intended distinction:
- field report is pending workflow truth
- office verification creates final payment truth

## 12. Source-of-Truth Boundaries Preserved

Preserved boundaries:
- `internal_invoice_payments` remains collected-money truth.
- `internal_invoice_payment_allocations` remains allocation truth.
- `field_payment_collection_reports` remains pending workflow/report truth until verified.
- Card truth remains Stripe/webhook-confirmed.
- Owner/Admin/Billing manual payment remains final office payment truth.
- Confirm Payment verification creates final payment truth.
- Rejection creates no payment truth.
- Invoice paid/balance remains derived from final collected payment truth, not from field-reported pending money.
- Supplemental/add-on invoice truth remains separate; original issued/paid invoice truth remains unchanged.

## 13. Explicit Non-Actions

B8-B closeout confirms no:
- Stripe/webhook behavior changes beyond existing sanctioned paths
- QBO work
- SMS work
- customer portal work
- refund/reversal/export expansion
- correction/void action implementation
- ACH behavior
- customer self-service payment/reporting flow
- broad invoice builder redesign
- broad payment register rewrite
- global Technician role expansion
- Admin/Billing role granted to field users
- final manual payment authority granted to ordinary field users
- self-verification of field-reported non-card payments
- treating a field report as paid before office verification

## 14. Known Follow-Ups

Known follow-ups after B8-B:
- continue to simplify the field workflow from Work Items into invoice charges
- reduce remaining accounting vocabulary in field-first mobile surfaces
- continue desktop payment panel consolidation around truth boundaries
- keep Confirm Payment copy consistent across closeout, reports, invoice workspace, and ops attention
- later model-lock any additional pricebook/manual/custom field invoice authority before exposing it
- defer correction/void workflow until explicitly designed
- defer refund/reversal/export expansion until explicitly designed

## 15. Next Phase Recommendation

Recommended next phase: Work Items to Invoice Flow Simplification.

Why:
- B8-B made the permission and payment-processing path real end to end.
- The next bottleneck is workflow clarity, not payment truth.
- Field users should experience a clean path from job work items to invoice charges to collection, with less accounting-language friction.

Recommended next slice posture:
- audit/model first
- no payment truth changes
- no Stripe/webhook changes
- no schema/migration unless separately model-locked
- focus on mobile field workflow comprehension and speed
- preserve all B8-B source-of-truth boundaries
