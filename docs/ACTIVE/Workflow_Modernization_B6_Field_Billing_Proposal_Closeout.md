# Compliance Matters Workflow Modernization B6 Field Billing Proposal Closeout

## 1. Status / Authority / Scope

Status: CLOSED (field billing proposal foundation implemented, validated, and ready for push)

Authority: Subordinate to:
- `docs/ACTIVE/Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6B_Field_Charge_Line_Item_Authority_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6E_Field_Charge_Proposal_Wrapper_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Scope: B6 closeout for the field billing proposal lane only. This closeout documents delivered behavior across the B6 foundation slices that establish field billing authority, read-only billing visibility, proposal-first field charge creation, office/billing review, and compact proposal entry UI.

This closeout does not authorize Collect Payment implementation, card collection, check/cash/other reporting, office payment verification, Stripe/provider changes, invoice issue/send/payment-link changes, customer portal payment changes, queue redesign, `FieldOutcomePanel` changes, return/callback behavior changes, SMS changes, QBO changes, or payment-truth changes.

## 2. Executive Summary

B6 is complete for the field billing proposal foundation lane.

The delivered posture is proposal-first, not payment-first.

Field-created charges now enter the system as proposals that stay separate from invoice commercial truth until office/billing review approves them into an existing same-job draft invoice. The implementation preserves the active financial and source-of-truth boundaries:
- field-created proposals are not invoice line items by default
- proposals do not affect invoice totals, paid amount, balance due, payment readiness, or payment truth
- approval is the conversion point from proposal truth to draft invoice line-item truth
- rejection does not affect invoice totals
- Collect Payment remains deferred until approved and issued invoice truth exists

Delivered behavior includes:
- `resolveFieldBillingCapabilities` server-side capability resolution
- read-only Field Billing Summary on job detail for allowed internal users
- additive `field_charge_proposals` storage and normalization model
- server-side Pricebook and Visit Scope proposal creation actions
- office/billing approval and rejection actions
- compact proposal entry UI for authorized users only

## 3. Completed B6 Slices

Completed slices:
- B6-A: Field Billing / Collect Payment model audit completed.
- B6-B: Field Charge / Line-Item Authority audit completed.
- B6-C: Field Billing capability foundation completed.
- B6-D: Read-Only Field Billing Summary completed.
- B6-E: Field Charge Proposal / Wrapper Model audit completed.
- B6-F: Field Charge Proposal schema/model foundation completed.
- B6-G: Field Charge Proposal server-side creation actions completed.
- B6-H: Read-Only Field Charge Proposal display completed.
- B6-I: Office/Billing review action foundation completed.
- B6-J: Office/Billing review UI completed.
- B6-K: Field Charge Proposal entry UI completed and already committed before this closeout.

Relevant implementation commits already on `main` / `origin/main`:
- `a16dbf4` `feat(billing): add field billing authority foundation`
- `3ff2512` `feat(billing): add read-only field billing summary`
- `38c161f` `feat(billing): add field charge proposal foundation`
- `4091d5c` `feat(billing): add field charge proposal actions`
- `23df96a` `feat(billing): show field charge proposals in billing summary`
- `8b94e0a` `feat(billing): add field charge proposal review actions`
- `e39c008` `feat(billing): add field charge proposal entry`

## 4. Field Billing Authority Model

Canonical helper: `resolveFieldBillingCapabilities` in `lib/auth/field-billing-access.ts`.

Delivered authority behavior:
- structural owner resolves full field billing capabilities by default
- active internal `admin` resolves full field billing capabilities by default
- active internal `billing` resolves full field billing capabilities by default
- active scoped internal technician and ordinary office/dispatcher users are mutation-denied by default
- active scoped internal users may still receive read-only field billing summary visibility when allowed
- inactive, contractor/portal, unauthenticated, and cross-account contexts resolve false capabilities

Delivered server-side hardening result:
- draft invoice line mutations remain hardened on the server
- manual line add, Pricebook line add, Visit Scope line add, line edit, and line remove stay behind explicit capability and scope checks
- field users do not gain invoice truth mutation authority by UI visibility alone

## 5. Read-Only Field Billing Summary

Delivered read-only summary behavior:
- `FieldBillingSummary` exists on job detail
- invoice state is shown as not started, draft, issued, paid, or voided
- invoice total, paid amount, and balance remain visible as read-only status context only
- financial users still see summary information while actions remain in the invoice workspace
- unauthorized users do not get mutation controls

Delivered separation behavior:
- invoice data and proposal data render as separate sections
- proposed total is visually separated from invoice total
- proposal copy explicitly states proposals are not collectible yet
- no Collect Payment button or payment collection affordance is rendered from this summary

## 6. Field Charge Proposal Storage Model

Delivered additive storage/model posture:
- `field_charge_proposals` exists as proposal truth separate from invoice line-item truth
- proposal source kinds include `pricebook`, `visit_scope`, and `manual`
- manual/custom source kind is reserved in the model foundation but remains deferred in UI/workflow usage for this lane
- proposal statuses include `draft`, `submitted_for_review`, `approved`, `rejected`, and `voided`
- normalization helpers resolve source kind and status consistently for reads/tests

Delivered V1 storage semantics:
- V1 proposal creation writes `submitted_for_review`
- proposal rows capture proposed name, description, type, quantity, unit price, subtotal, currency, proposer identity, and review metadata
- proposal rows may link to source Pricebook item or Visit Scope item without becoming invoice truth by that linkage alone

## 7. Field Charge Proposal Creation Actions

Delivered server-side creation actions:
- Pricebook proposal action exists
- Visit Scope proposal action exists
- manual/custom proposal creation action is not surfaced in this lane

Delivered creation behavior:
- proposal actions authenticate internal user, enforce same-account scoped job access, require operational entitlement, and require internal invoicing mode
- Pricebook proposals validate active scoped Pricebook sources and reject inactive, adjustment, negative-price, missing, or cross-account sources
- Visit Scope proposals validate selected Visit Scope membership on the scoped job
- created proposals write additive proposal truth and append `field_charge_proposed` job-event narrative truth
- proposal creation does not insert `internal_invoice_line_items`
- proposal creation does not change invoice totals, paid amount, balance due, or payment status

## 8. Field Charge Proposal Display

Delivered display behavior:
- submitted proposals display in Field Billing Summary
- proposal source kind is labeled separately from invoice truth
- quantity and amount display with proposal status context
- submitted proposal amounts roll into a proposal-only total
- proposal total remains explicitly separate from invoice total
- already reviewed proposals remain visible historically without reopening invoice truth automatically

This display posture preserves the core model decision that proposals are review-state commercial intent, not invoice truth.

## 9. Office/Billing Review and Approval

Delivered review posture:
- office/billing review controls exist for authorized reviewers
- Owner/Admin/Billing may approve or reject submitted proposals by default
- explicit future `can_approve_field_charges` capability is supported in the server-side model

Delivered approval behavior:
- approval requires an existing same-job draft invoice
- approval requires proposal status `submitted_for_review`
- approval requires a proposed price
- approval converts one proposal into exactly one draft invoice line item
- approval updates proposal status to `approved`
- approval writes proposal review metadata and converted invoice line linkage
- approval appends `field_charge_approved` event truth
- invoice totals are resynced only after the approved draft line is inserted

Delivered rejection behavior:
- rejection is available to authorized reviewers on submitted proposals
- rejection updates proposal status to `rejected`
- rejection writes review metadata and note context
- rejection appends `field_charge_rejected` event truth
- rejection does not create invoice line items
- rejection does not affect invoice totals

## 10. Field Charge Proposal Entry UI

Delivered entry UI posture:
- compact proposal entry UI exists inside Field Billing Summary for authorized users only
- Pricebook proposal entry is shown only when `can_select_pricebook_lines` is present
- Visit Scope proposal entry is shown only when `can_convert_visit_scope_to_invoice_line` is present
- price override entry is shown only when `can_edit_charge_price` is present
- unauthorized users remain read-only

Delivered deferral posture:
- manual/custom field charge UI is not added
- proposal entry remains review-oriented and does not present itself as invoice editing or payment collection
- proposal entry stays compact and localized rather than exposing the existing office invoice builder to field users

## 11. Invoice / Payment Truth Boundaries

Delivered truth boundaries preserved in B6:
- field-created charges are proposals first
- proposals are not invoice line items by default
- proposals do not affect invoice totals, paid amount, balance due, payment readiness, or payment truth
- approval is the moment a proposal becomes draft invoice truth
- approval requires office/billing authority and an existing same-job draft invoice
- approval converts one proposal into exactly one draft invoice line item
- rejection does not affect invoice totals
- Visit Scope remains operational truth, not invoice truth
- Pricebook-backed proposals are the safest first field charge source
- manual/custom field charges remain deferred
- no Collect Payment exists yet
- card payment truth remains Stripe/webhook-led and unchanged
- check/cash/other reporting and office verification remain future work

## 12. Role and Permission Boundaries

Delivered role boundaries:
- Owner/Admin/Billing receive default review and charge-authoring capabilities by server-side resolution
- technician users are denied mutation by default
- ordinary office/dispatcher users are denied mutation by default unless structural owner authority applies
- active scoped internal users can still be read-only viewers of billing status
- contractor/portal users remain outside this internal field billing mutation lane

Delivered permission interpretation:
- proposal creation authority is narrower than invoice truth authority and still enforced server-side
- proposal approval remains high-trust office/billing authority
- UI visibility never substitutes for server-side permission checks

## 13. What Was Intentionally Not Added

Intentionally not added in this B6 closeout scope:
- Collect Payment button
- card collection flow
- check/cash/other reporting flow
- office payment verification queue or verification action
- Stripe/provider/payment truth changes
- invoice issue, send, or payment-link behavior changes
- manual/custom field charge UI
- customer-facing payment portal behavior
- queue membership or queue-ownership redesign
- `FieldOutcomePanel` changes
- return/callback behavior changes
- SMS behavior changes
- QBO behavior changes

## 14. Deferred Items

Deferred after this closeout:
- Card-only Collect Payment against existing issued invoice truth.
- field collection reporting for check/cash/other
- office payment verification workflow
- closeout integration for verified/unverified payment state
- manual/custom field charge proposals with stronger permission gates
- field billing visual polish after real-use testing
- payment/reporting dashboards for pending field collections and verified payments
- performance triage if job-detail or payment flows reproduce slow/timeout behavior outside sandbox/dev-server conditions

## 15. Future Recommended Next Lanes

Recommended next lanes:
1. Card-only Collect Payment against existing issued invoice with positive balance and Stripe Connect ready.
2. Field collection reporting for check/cash/other.
3. Office payment verification queue/action.
4. Closeout integration for verified/unverified payment state.
5. Manual/custom field charge proposals with stronger permission gates.
6. Field billing visual polish after real-use testing.
7. Payment/reporting dashboards for pending field collections and verified payments.
8. Performance triage only if job-detail or payment flows reproduce slow/timeout behavior outside sandbox/dev-server conditions.

## 16. Validation / Commit References

Validation run for this closeout lane:
- `npx.cmd vitest run lib/jobs/__tests__/field-billing-summary.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/field-charge-proposal-actions.test.ts`
- `npx.cmd vitest run lib/business/__tests__/field-charge-proposals.test.ts lib/business/__tests__/field-charge-proposals-schema-foundation.test.ts`
- `npx.cmd vitest run lib/auth/__tests__/field-billing-access.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-scope-hardening.test.ts`
- `npx.cmd vitest run lib/actions/__tests__/internal-invoice-payment-actions.test.ts`
- `npx.cmd tsc --noEmit`
- `git diff --check`

Implementation commit references already present on `main`:
- `4f6c3a5` `docs(workflows): audit field collect payment model`
- `cf956f5` `docs(workflows): audit field charge authority`
- `a16dbf4` `feat(billing): add field billing authority foundation`
- `3ff2512` `feat(billing): add read-only field billing summary`
- `b036f88` `docs(workflows): audit field charge proposal model`
- `38c161f` `feat(billing): add field charge proposal foundation`
- `4091d5c` `feat(billing): add field charge proposal actions`
- `23df96a` `feat(billing): show field charge proposals in billing summary`
- `8b94e0a` `feat(billing): add field charge proposal review actions`
- `e39c008` `feat(billing): add field charge proposal entry`

B6-K implementation commit note:
- `e39c008` was already present at `HEAD` before this closeout. No duplicate implementation commit was created.

## 17. Explicit Non-Actions

This closeout document performs no runtime mutation.

Explicit non-actions:
- no product code changes outside this docs closeout
- no schema changes
- no migrations
- no Supabase writes
- no Collect Payment implementation
- no card collection implementation
- no check/cash/other reporting implementation
- no office payment verification implementation
- no Stripe/provider/payment truth changes
- no invoice issue/send/payment-link changes
- no manual/custom field charge UI
- no customer-facing payment portal changes
- no queue membership changes
- no `FieldOutcomePanel` changes
- no return/callback behavior changes
- no SMS/provider behavior changes
- no QBO behavior changes