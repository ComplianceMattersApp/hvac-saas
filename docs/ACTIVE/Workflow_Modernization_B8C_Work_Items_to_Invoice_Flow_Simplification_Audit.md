# Compliance Matters Workflow Modernization B8-C Work Items to Invoice Flow Simplification Audit

## 1. Status / Authority / Scope

Status: ACTIVE AUDIT / MODEL DIRECTION.

Authority: subordinate to:
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Workflow_Modernization_B8B_Field_Billing_Access_and_Payment_Workflow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B8A_Invoice_Payment_Workspace_Field_First_UX_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B7_Field_Billing_Payments_Reconciliation_Closeout.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`

Scope: product direction and audit/model guidance for simplifying the user-facing path from Work Items to Invoice Charges to payment collection/reporting.

This document does not authorize runtime code changes, schema changes, migrations, payment truth changes, Stripe/webhook changes, invoice issue/send changes, QBO, SMS, customer portal, correction/void actions, refund/reversal/export behavior, or global role expansion.

## 2. Product Direction

The current Work Items to Invoice Charges flow is correct in its source-of-truth separation, but it does not yet feel intuitive enough. It has too many visible layers, too many handoffs between sections, and too many places where the user has to understand internal system concepts before knowing what to do next.

B8-C should simplify the user-facing path:

1. Add work.
2. Price it naturally with quantity and unit price.
3. Make it invoice-ready.
4. Issue.
5. Collect card payment or report cash/check/other payment.

Success means a field user or office user can understand the next action without needing to learn how the app is built.

## 3. Current Friction

Current friction to audit:
- Work Items and Invoice Charges are visibly separate concepts, even when the user's intent is one continuous flow.
- A user may enter or review the same work information twice: once operationally, then again as invoice charge context.
- Draft invoice line creation requires moving from job/work scope context into billing context and then back into payment context.
- The UI exposes internal layers: operational work scope, draft invoice line truth, invoice issue readiness, payment truth, and confirmation workflow.
- Field users can now complete the path technically, but the path still feels like a sequence of system handoffs.
- Office users can manage the path, but the desktop workspace can still feel like several adjacent financial boxes rather than one guided workflow.

This is not a signal that the source-of-truth separation is wrong. It is a signal that the workflow presentation should hide more of the internal layering while preserving the underlying boundaries.

## 4. Audit Questions

B8-C should ask these questions throughout:
- Can this be done in fewer steps?
- Are we making the user enter or review the same thing twice?
- Are we exposing internal system layers instead of one natural workflow?
- Can automation move work into invoice-ready state without hiding important truth boundaries?
- Can role, permission, and status routing decide the right path instead of making the user choose?
- Can the next action be obvious from the current state?
- Can field and office users share the same natural workflow while seeing different controls based on authority?

## 5. Target User-Facing Flow

The target flow should feel like:

1. `Add Work`
   - User records work performed or work to bill.
   - Work can carry billable intent when appropriate.

2. `Price Work`
   - User adds or edits quantity and unit price in the same natural flow.
   - Description/work instruction remains visible and editable when appropriate.

3. `Review Invoice`
   - App shows invoice-ready charges without making the user manually translate every Work Item into a separate accounting object.
   - Existing invoice truth remains draft until issue.

4. `Issue for Collection`
   - App freezes billable truth only when existing invoice readiness rules pass.
   - User does not need to understand every internal readiness flag.

5. `Collect or Report Payment`
   - Card collection remains Stripe-confirmed.
   - Cash/check/other reporting remains pending Confirm Payment unless actor has final authority.

## 6. Source-of-Truth Boundaries to Preserve

B8-C should simplify presentation, not collapse truth.

Preserve:
- Operational Work Items remain operational work scope truth.
- Invoice Charges remain billed commercial truth.
- Issued invoice remains customer-facing billed truth.
- `internal_invoice_payments` remains collected-money truth.
- `internal_invoice_payment_allocations` remains allocation truth.
- `field_payment_collection_reports` remains pending workflow truth until verified.
- Card payment truth remains Stripe/webhook-confirmed.
- Owner/Admin/Billing manual payment remains final office payment truth.
- Confirm Payment verification creates final non-card payment truth.
- Rejection creates no payment truth.

Design principle:
- Hide internal layers when they do not help the user decide what to do.
- Preserve internal layers where they protect auditability, payment truth, or scope integrity.

## 7. Automation Opportunities

Automation candidates to evaluate:
- Auto-create a draft invoice shell when a field billing user starts pricing work and no invoice exists.
- Auto-import eligible Work Items into invoice-ready draft charges when the user starts the billing flow.
- Mark imported charges as draft and editable before issue.
- Carry Work Item title/details into draft invoice line name/description.
- Default quantity to `1.00` and unit price to `$0.00`, but prompt clearly for price before issue/collection.
- Detect unpriced invoice-ready lines and keep the primary action as `Price Work` or `Finish Pricing`.
- Route the next action by invoice status:
  - no invoice: start invoice/pricing flow
  - draft with unpriced lines: finish pricing
  - draft priced/ready: issue for collection
  - issued with balance: collect/report payment
  - pending report: awaiting confirmation
  - paid: payment complete

Automation must not:
- issue invoices without explicit permitted action
- mark reported non-card money paid before verification
- create final payment truth from field report
- send invoices automatically unless separately approved
- import unrelated or cross-account work
- hide meaningful exceptions such as missing price, missing customer, void/supplemental context, or balance state

## 8. Role and Permission Routing

The UI should avoid asking users to choose system paths when authority can decide.

Field Billing Access actor:
- sees one natural work-to-invoice path
- can start/build invoice from eligible work
- can price imported draft lines
- can issue/freeze for collection when safe
- can collect card if card collection is enabled
- can submit cash/check/other for confirmation
- does not see final manual payment, refund/reversal/export, send/email, broad pricebook/manual/custom tooling, or verification controls

Owner/Admin/Billing:
- may see richer controls but should still follow the same natural workflow
- cash/check/other with final authority routes to final manual payment truth
- field reports route to Confirm Payment verification
- deeper controls remain available without cluttering the field path

Reporter with verification authority:
- self-verification guard remains in force
- report is visible but Verify remains blocked for own report

## 9. UX Principles

B8-C UX principles:
- One primary next action per state.
- Use user language first: `Work`, `Price`, `Invoice`, `Collect Payment`, `Payment Collected`.
- Keep internal terms secondary: draft, invoice charge, allocation, reconciliation, payment truth.
- Do not make users re-enter the same title/details/amount unless the second entry has a clear purpose.
- Do not make a field user choose between manual payment and field report; route by authority.
- Do not make a user manually bridge Work Items and Invoice Charges if the app can safely do it.
- Show truth-state warnings only when they affect the decision.
- Keep field mobile path compact and forward-moving.
- Keep office desktop path richer but grouped by the same natural workflow.

## 10. Recommended First Slice

Recommended B8-C first implementation slice: `Work Items to Invoice-Ready Draft Pricing`.

Goal:
- Reduce the number of steps from eligible Work Items to priced draft invoice lines.

Candidate behavior:
- Start from the Billing card or invoice workspace with one primary CTA.
- If no draft invoice exists and the actor has Field Billing Access, create or enter an invoice-pricing flow without making the user think about invoice shells first.
- Present eligible Work Items as draft billable rows.
- Let user enter quantity and unit price immediately.
- Save draft invoice lines through existing draft invoice line actions.
- Show missing-price state clearly.
- Keep issue disabled until invoice readiness passes.

Why this first:
- It attacks the main cognitive load: translating work into invoice charges.
- It preserves B8-B payment and permission safety.
- It makes field collection feel like the natural continuation of pricing work.

## 11. Suggested Implementation Slices

1. B8-C1: audit current Work Items, Billing card, invoice workspace, and line item table path.
2. B8-C2: design/source-test a simplified state machine for next action labels.
3. B8-C3: combine Work Item import and draft-line pricing into one field-facing section.
4. B8-C4: reduce duplicate invoice/work item copy and labels.
5. B8-C5: mobile Billing card primary-action polish.
6. B8-C6: desktop invoice workspace grouping polish.
7. B8-C7: browser smoke for field user and office user from work creation through payment/report.
8. B8-C8: closeout documentation.

## 12. Explicit Non-Actions

B8-C audit does not approve:
- payment truth changes
- Stripe/webhook changes
- schema/migration changes
- invoice issue/send behavior changes
- automatic invoice send/email
- customer portal
- SMS
- QBO
- correction/void actions
- refund/reversal/export
- global Technician role expansion
- Admin/Billing role for field users
- final manual payment authority for ordinary field users
- treating field reports as collected before confirmation
- broad invoice builder redesign unrelated to Work Items to invoice flow

## 13. Acceptance Criteria

B8-C should be considered successful when:
- a field user can identify the next action without understanding internal truth layers
- a field user can move from work to priced invoice-ready charges with fewer touches
- a field user does not re-enter work details unnecessarily
- an office user can still access deeper controls without cluttering the field path
- role/status routing decides the correct payment/reporting path
- payment truth boundaries remain unchanged
- invoice issue remains explicit and permissioned
- card truth remains webhook-confirmed
- non-card field reports remain pending until Confirm Payment verification

## 14. Next Step

Next recommended action: start B8-C1 as a focused audit of the current Work Items to Invoice Charges path across:
- mobile job detail Billing card
- invoice workspace line item builder
- Work Items / visit scope source data
- `InternalInvoiceLineItemsTable`
- draft invoice create/import/edit actions
- issue readiness and payment collection handoff

B8-C1 should produce a concrete before/after workflow map and the smallest safe first implementation slice.
