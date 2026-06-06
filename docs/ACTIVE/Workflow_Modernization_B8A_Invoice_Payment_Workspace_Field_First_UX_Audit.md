# Compliance Matters Workflow Modernization B8-A Invoice / Payment Workspace Field-First UX Audit

## 1. Current State Summary

Status: AUDIT / MODEL ONLY.

Scope: field-first UX audit of the Invoice Builder and Payment Workspace after the B7 field billing, supplemental/add-on invoice, field payment reporting, and Confirm Payment closeout work.

This document authorizes no payment truth changes, no Stripe/webhook changes, no schema/migration changes, no invoice issue/send behavior changes, no supplemental invoice truth changes, no correction/void actions, no SMS/QBO/customer portal work, and no broad redesign implementation.

Current source-of-truth posture remains:
- Card payment truth is Stripe/webhook-confirmed.
- Owner/Admin/Billing manual payment recording is final payment truth.
- Field-reported cash/check/other payment is pending confirmation until office verification.
- Confirm Payment means office/owner/billing verifies reported non-card money before it counts as collected.
- Supplemental/add-on invoices preserve the original issued/paid invoice truth.

Observed UI posture:
- Mobile job detail has a `FieldBillingSummary` card with invoice status, totals, balance, add-on family context, and field charge proposal controls.
- The invoice workspace exposes charges, issue readiness, supplemental invoice family context, Create Add-On Invoice, payment options, payment history, and office-only financial controls.
- Office payment controls are role-gated behind financial lifecycle authority.
- Field payment collection is role-gated separately, but the current field collection section only exposes card checkout and copy says non-card reporting is not enabled in the workspace, even though B7 server/action/test posture includes non-card field reporting.
- Closeout queue uses the user-facing `Confirm Payment` label and explains that check/cash/other field-reported payments count only after office confirmation.

## 2. Field-User Mobile Workflow Map

Expected fast-path for a field user:
1. Open job detail.
2. Read Billing card status: no invoice, draft, issued/unpaid, paid, void, or waiting for confirmation.
3. If charges are missing and the user has only proposal authority, add proposed charge from Work Items or Pricebook for office review.
4. If the user has direct draft charge authority, open invoice workspace and add permitted charges from Work Items first, Pricebook second, manual exception last.
5. If invoice is issued and unpaid, choose one obvious collection path:
   - `Collect Card Payment` for Stripe checkout.
   - `Report Payment Collected` for cash/check/other.
6. If reporting cash/check/other, submit amount, method, reference, and note with `Submit for Confirmation`.
7. Return to job knowing the invoice state is either paid, unpaid, partially paid, or awaiting office confirmation.

Current field friction:
- The job-detail Billing card can say payment collection is not enabled from field view, which conflicts with B7 field payment capability goals.
- The field invoice workspace primary payment section currently says non-card reporting is not enabled in this slice, so a tech cannot discover the intended `Report Payment Collected` path from the workspace.
- Field collection is separated from Owner/Admin/Billing payment options, which is good, but the field section needs to become the obvious mobile primary action when available.
- The field charge language is partly field-friendly (`Work Items`, `Add Selected Work Items`) and partly accounting-oriented (`Invoice Charges`, `Unit Price`, `Pricebook`).
- Add-on invoice context is understandable in the office workspace, but field users may not know what to do when the customer adds work after payment unless the Billing card gives a plain-language next step.

## 3. Owner/Admin/Billing Workflow Map

Expected desktop path:
1. Open invoice workspace from job or closeout queue.
2. Confirm selected invoice context, including whether it is primary or supplemental/add-on.
3. Review charges and readiness.
4. Issue/send where allowed.
5. Choose final-truth collection option:
   - Charge saved card once.
   - Create payment link / open Stripe checkout.
   - Record Manual Payment for office-confirmed off-platform money.
6. Review Payment History for recorded, failed, reversed, and not-collected activity.
7. Use closeout queue `Confirm Payment` when a field user reported check/cash/other payment.
8. Verify only after confirming money was received, or reject with a reason.

Current owner/admin strengths:
- Office payment controls are clearly absent from the non-financial field collection section.
- `Record manual payment` is in the financial lifecycle payment options area, not the field-only section.
- Saved-card copy correctly states payment is recorded only after Stripe webhook confirmation.
- Payment link copy correctly states payment is recorded after Stripe confirms it.
- Closeout queue uses `Confirm Payment` and warns that non-card field reports count only after office confirmation.

Current owner/admin friction:
- Payment link appears in two nearby surfaces for financial users: a dedicated `Payment Link` panel and a `Payment Options` card with `Create payment link`.
- `Payment Attention`, `Payment Options`, `Payment Link`, and `Payment History` create several payment boxes on desktop, which is powerful but visually fragmented.
- `Record manual payment` is accurate but should carry stronger final-truth copy at the point of action.
- Verify/Reject controls are findable in the closeout queue item, but both use compact secondary styling and sit inside dense forms; Verify should be visually primary after the required confirmation note area.
- Payment history records field-verified payment as collected once final truth exists, but the UI should preserve enough source context to distinguish Stripe, office manual, and verified field report.

## 4. Confusing Labels or Duplicate Surfaces

Labels/surfaces to tighten:
- `Field Billing Summary`: good for internal model, but mobile title could simply be `Billing` with field-specific status underneath.
- `Payment collection is not enabled from field view yet`: misleading after B7 capabilities; replace when field collection/reporting is available.
- `Check, cash, and other field reporting are not enabled in this slice`: should not remain once B7-P/B7-Q/B7-R/B7-S are considered baseline.
- `Record manual payment`: correct for Owner/Admin/Billing only, but dangerous if field users ever see it because it sounds similar to reporting collected money.
- `Payment Link` plus `Create payment link` inside `Payment Options`: duplicate CTAs for the same Stripe-hosted link path.
- `Supplemental invoices`: model-accurate but less field-friendly than `Add-On invoices`; keep supplemental as secondary/internal context where needed.
- `reconciliation`: avoid in primary field and closeout copy. Keep it in code/read-model docs, not field UI.

## 5. Recommended User-Facing Language

Use these labels:
- Field cash/check/other entry point: `Report Payment Collected`.
- Field non-card submit button: `Submit for Confirmation`.
- Office queue/filter/chip: `Confirm Payment`.
- Office final-truth form: `Record Manual Payment`.
- Add-on after issued/paid invoice: `Create Add-On Invoice`.
- Field status for non-card report: `Awaiting Confirmation`.

Suggested copy:
- Field report explainer: `Use this when the customer paid by cash, check, or another non-card method. Office confirmation is required before the invoice is marked paid.`
- Field card explainer: `Card payments open secure Stripe Checkout. The invoice updates after Stripe confirms payment.`
- Office manual payment explainer: `Use only after the office has confirmed the money was received. This records final payment truth in Compliance Matters.`
- Confirm Payment queue explainer: `A field user reported payment. Verify only after confirming the money was received.`
- Reject explainer: `Rejecting does not record payment.`
- Add-on explainer: `Use this when the customer adds work or a charge after the original invoice was issued or paid. The original invoice stays unchanged.`

## 6. Recommended Mobile Hierarchy

For field users on mobile, the Billing card and invoice workspace should prioritize:
1. Status strip: invoice reference, status, paid/balance, and `Awaiting Confirmation` if a non-card report is pending.
2. One primary action based on state:
   - No invoice/draft without field direct authority: `Add Proposed Charge`.
   - Draft with direct authority: `Build Invoice`.
   - Issued with balance and card authority: `Collect Card Payment`.
   - Issued with balance and non-card authority: `Report Payment Collected`.
   - Paid: `Payment Complete`.
   - Pending non-card report: `Awaiting Confirmation`.
3. Secondary action: `Open Invoice Workspace` only when needed.
4. Charges section: Work Items first, Pricebook second, manual exception last.
5. Payment method choice: card and cash/check/other as separate cards, not mixed into office financial controls.
6. Add-on guidance: show `Create Add-On Invoice` or `Request Add-On Invoice` only when the original invoice is issued/paid and the user has the correct authority.
7. Office-only controls hidden entirely from field users: saved-card charge, manual payment record, reversal, payment history correction, failed autopay retry.

## 7. Recommended Desktop Hierarchy

For Owner/Admin/Billing on desktop, keep richer controls but group them by truth boundary:
1. Invoice Summary: selected invoice, primary/add-on context, status, paid/balance.
2. Charges and Issue Readiness.
3. Collect Payment:
   - `Charge saved card once`.
   - `Create payment link`.
   - Stripe readiness/failure notices.
4. Office Final Payment:
   - `Record Manual Payment`.
   - Copy says it is final office truth.
5. Field Reports:
   - `Confirm Payment` attention, if a pending field report exists for this invoice/job.
   - Link to queue item or inline read-only summary with verify/reject only for authorized verifiers.
6. Payment History:
   - Collected.
   - Pending confirmation.
   - Not collected/failed/reversed.
   - Source labels: Stripe, manual office record, verified field report.
7. Add-On Invoice:
   - Keep `Create Add-On Invoice` near invoice-family context, not inside the main payment controls.

## 8. Permission / Role Display Rules

Field collector with card authority:
- Show `Collect Card Payment`.
- Explain Stripe/webhook truth.
- Hide `Charge saved card once`, `Record Manual Payment`, reversal, failed autopay retry, and full office payment history controls.

Field collector with non-card reporting authority:
- Show `Report Payment Collected`.
- Submit button is `Submit for Confirmation`.
- Show pending state as `Awaiting Confirmation`.
- Never show `Record Manual Payment`.
- Never show Verify/Reject for the user's own report.

Field charge proposal actor:
- Show `Add Proposed Charge`.
- Explain proposals are not collectible until office review.
- Hide direct invoice issue/send/payment finalization controls.

Trusted field direct invoice actor:
- Show Work Items and Pricebook charge builders only within granted line-item permissions.
- Keep issue/send separate.
- Keep payment collection/reporting separate from line-item authority.

Owner/Admin/Billing:
- Show final-truth payment controls.
- Show `Record Manual Payment` only here.
- Show `Confirm Payment` queue and Verify/Reject where allowed.
- Show full payment history and correction/reversal controls under existing rules.

Billing/verification user who is also the reporter:
- Show the report and status.
- Disable/hide Verify for own report with copy: `Reporter cannot verify their own report.`

## 9. Suggested Implementation Slices

Recommended first implementation slice: Field Payment Workspace Copy + Hierarchy Alignment.

Why first:
- It addresses the main field-user question without touching payment truth.
- It removes the current contradiction where the workspace says non-card field reporting is not enabled.
- It can be tested with source/wiring tests and existing action tests.

Slice contents:
- Replace field-facing "not enabled" copy with the approved language when `can_report_non_card_collection` is true.
- Add a visible `Report Payment Collected` field panel for issued invoices with balance when the actor has non-card reporting authority and lacks financial lifecycle authority.
- Use `Submit for Confirmation` as the submit label.
- Add `Awaiting Confirmation` status display where a pending field report read-model is available.
- Keep `Record Manual Payment` hidden from field-only actors.
- Keep no payment truth, Stripe, schema, or issue/send behavior changes.

Next slices:
- Mobile Billing card primary-action simplification.
- Desktop payment panel consolidation into truth-boundary groups.
- Invoice/payment history source-label polish.
- Add-on invoice field guidance polish.
- Confirm Payment queue button hierarchy polish.

## 10. Explicit Non-Actions

This B8-A audit does not recommend doing any of the following in this slice:
- No payment truth changes.
- No Stripe/webhook changes.
- No schema or migration changes.
- No invoice issue/send behavior changes.
- No supplemental invoice truth changes.
- No correction/void actions.
- No SMS, QBO, or customer portal changes.
- No broad redesign implementation.
- No automatic verification of field-reported money.
- No treating a field report as collected payment before office confirmation.
- No exposing `Record Manual Payment` to field-only users.
- No merging supplemental/add-on balances back into the original invoice.

## Top Field-User Friction Points

1. Field-facing copy still says payment collection/non-card reporting is not enabled, which conflicts with the B7 baseline and hides the intended path.
2. There is not yet one obvious mobile primary action that adapts across draft charges, card collection, non-card reporting, paid, and awaiting-confirmation states.
3. Field users can understand card collection, but cash/check/other reporting is not yet surfaced as a first-class field action in the workspace.
4. Charge creation still mixes helpful field language (`Work Items`) with accounting language (`Invoice Charges`, `Unit Price`, `Pricebook`) that may slow a tech on mobile.
5. Add-on invoice truth is protected, but field users need clearer "customer added something after payment" guidance.

## Top Owner/Admin/Billing Friction Points

1. Payment actions are split across multiple boxes, including duplicate payment-link surfaces.
2. `Record Manual Payment` needs stronger point-of-action final-truth language.
3. Verify/Reject controls are correct but dense; Verify should be visually clearer without making Reject feel casual.
4. Payment history should label source context more explicitly after Stripe, office manual, and verified field report payments.
5. Supplemental/add-on context is present, but the desktop hierarchy should keep add-on creation separate from core collection controls.

## Audit Conclusion

The current permission model is directionally correct: field users are mostly protected from office-only final payment tools, and Owner/Admin/Billing can still access deeper controls. The main B8-A risk is not payment truth; it is discoverability and language. Field users need a compact mobile path that says exactly what they can do now: build/add permitted charges, collect card through Stripe, or report cash/check/other for office confirmation.

Recommended first implementation slice: Field Payment Workspace Copy + Hierarchy Alignment.
