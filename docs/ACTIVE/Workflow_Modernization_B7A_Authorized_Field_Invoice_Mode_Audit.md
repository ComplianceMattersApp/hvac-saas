# Compliance Matters Workflow Modernization B7-A Authorized Field Invoice Mode Audit

## 1. Status / Authority / Scope

Status: ACTIVE MODEL AUDIT / MODEL LOCK CANDIDATE

Authority: Subordinate to:
- `docs/ACTIVE/Workflow_Modernization_B6_Field_Billing_Proposal_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6B_Field_Charge_Line_Item_Authority_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6E_Field_Charge_Proposal_Wrapper_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Scope: docs/audit/model only for Authorized Field Invoice Mode. This slice evaluates how to add a direct field draft-invoice workflow for explicitly trusted users while preserving the completed B6 proposal lane and keeping Collect Payment separate.

This slice authorizes no runtime behavior changes, no schema changes, no migrations, no Supabase writes, no invoice behavior changes, no payment behavior changes, no Collect Payment button, no Stripe/provider changes, no queue membership changes, no `FieldOutcomePanel` changes, no return/callback behavior changes, and no SMS/QBO changes.

## 2. Executive Summary

B6 closed the proposal-first field billing lane successfully, but that lane is not the main path for many trusted field users.

Real-world field workflow often works like this:
- technician calls owner or manager
- price is approved in the moment
- technician creates or updates the actual invoice charge
- payment may be collected later only if separately allowed

Therefore the app should support two distinct billing modes:
- Proposal / Office Review Mode
- Authorized Field Invoice Mode

Current code already contains most of the raw authority surfaces needed for direct draft-invoice line mutation:
- direct draft invoice line actions already exist
- those actions are draft-only and scoped to the same job/account
- field billing capability names already cover Pricebook selection, Visit Scope conversion, manual charge, description, quantity, price, edit, and remove authority

However, current capability resolution is too broad for the next lane:
- `resolveFieldBillingCapabilities` returns `allTrue()` for Owner/Admin/Billing
- that currently bundles charge authority, proposal authority, review authority, future collection authority, and future verification authority together
- that is acceptable for B6 proposal foundation but not precise enough for B7 direct field invoice mode

The model lock for B7-A is:
- proposal mode remains valid and useful for limited or supervised users
- direct field invoice mode becomes a separate permission-driven path for trusted users
- direct draft invoice line authority must not automatically grant invoice issue, invoice send, payment collection, payment verification, reversal, refund, or export authority

## 3. Why B6 Proposal Mode Is Not the Main Path for Trusted Users

B6 solved the safety path first, which was the correct sequence.

Proposal mode is well-suited for:
- new technicians
- limited technicians
- office-controlled teams
- disputed pricing situations
- companies that require office review before charges become billable truth

But proposal mode is not the main operational path for many service companies because:
- the trusted field user often already has verbal price approval
- office review may add friction without adding real safety for that user/company posture
- the company expectation is usually "make the invoice right now," not "submit a proposal and wait"

Therefore B6 proposal mode should remain one billing mode, not the only billing mode.

## 4. Two Billing Modes

Locked two-mode model:

Mode A: Proposal / Office Review Mode
- field user submits a proposed charge
- office/billing reviews
- approved proposal converts into one draft invoice line item
- good for limited users and review-heavy companies

Mode B: Authorized Field Invoice Mode
- trusted field user creates or edits actual draft invoice line items directly
- this is the real-world "owner greenlit it" workflow
- it is permission-driven, not universal
- it still stops short of invoice issue, send, and payment behavior unless those are separately granted later

Both modes can coexist in the product.
They should not compete visually as equal primary workflows for the same actor in the same state.

## 5. Proposal / Office Review Mode

Current completed B6 posture remains locked:
- field-created proposal rows persist in `field_charge_proposals`
- proposal source kinds are `pricebook`, `visit_scope`, and `manual`
- proposal statuses are `draft`, `submitted_for_review`, `approved`, `rejected`, and `voided`
- V1 proposal entry uses `submitted_for_review`
- approval converts one proposal into one draft invoice line item
- rejection does not affect invoice totals
- proposals stay separate from invoice totals until approved

Recommended ongoing role for proposal mode:
- primary mode for limited users with no direct invoice truth authority
- fallback mode when direct invoice authority is absent but field pricing input still needs to be captured
- optional secondary mode for future hybrid companies that want direct invoice on some charge types and proposal review on others

## 6. Authorized Field Invoice Mode

Authorized Field Invoice Mode means:
- user can create or edit real draft invoice line items directly
- the created/edited rows are real commercial draft invoice truth immediately
- this is allowed only for trusted users with explicit permission

Current codebase facts supporting this mode:
- `addInternalInvoiceLineItemFromForm` creates manual draft invoice line items
- `addInternalInvoiceLineItemFromPricebookForm` creates Pricebook-backed draft invoice line items
- `addInternalInvoiceLineItemsFromVisitScopeForm` creates Visit Scope-backed draft invoice line items
- `updateInternalInvoiceLineItemFromForm` edits real draft invoice line items
- `removeInternalInvoiceLineItemFromForm` deletes real draft invoice line items
- these paths are already draft-only, same-account scoped, and server-side checked

Current gap:
- direct field invoice mode is not explicitly modeled as a separate billing mode in the docs/UI routing yet
- the existing capability helper still mixes future payment/verification capabilities into the same full-trust bundle

Locked B7-A conclusion:
- Authorized Field Invoice Mode is a valid and necessary mode
- it should become the primary field billing path for trusted users
- proposal mode remains the primary path only for non-trusted or review-required users

## 7. Permission Model

### Current findings

Existing field billing capabilities already relevant to direct invoice authority:
- `can_select_pricebook_lines`
- `can_convert_visit_scope_to_invoice_line`
- `can_add_manual_charge`
- `can_edit_charge_description`
- `can_edit_charge_quantity`
- `can_edit_charge_price`
- `can_remove_field_charge`

Existing future/non-direct capabilities already present but conceptually separate:
- `can_submit_field_charges_for_review`
- `can_approve_field_charges`
- `can_collect_card_payment`
- `can_report_non_card_collection`
- `can_verify_non_card_collection`

Existing financial authority remains separate in `financial-access.ts`:
- `canManageInvoiceLifecycle`
- `canRecordInvoicePayment`
- `canCreateTenantInvoicePaymentLink`
- `canExportFinancialData`

### Recommended B7-A lock

Direct draft invoice authority should be modeled as its own permission family, not inferred from proposal mode and not bundled automatically with payment mode.

Recommended direct invoice authority group:
- `can_create_direct_invoice_draft` or equivalent
- `can_select_pricebook_invoice_lines`
- `can_convert_visit_scope_to_invoice_lines`
- `can_add_manual_invoice_line`
- `can_edit_invoice_line_description`
- `can_edit_invoice_line_quantity`
- `can_edit_invoice_line_price`
- `can_remove_invoice_line`

Recommended interpretation for V1:
- Pricebook direct line entry: allowed with explicit direct invoice authority
- Visit Scope direct conversion: allowed with explicit direct invoice authority
- description edit: allowed with explicit direct invoice authority
- quantity edit: allowed with explicit direct invoice authority
- price edit: stronger permission than selection/quantity
- manual/custom line entry: stronger permission than Pricebook/Visit Scope selection

Critical separation lock:
- direct invoice authority does not automatically grant `can_issue_invoice`
- direct invoice authority does not automatically grant `can_send_invoice`
- direct invoice authority does not automatically grant `can_collect_card_payment`
- direct invoice authority does not automatically grant `can_report_non_card_collection`
- direct invoice authority does not automatically grant `can_verify_non_card_collection`
- direct invoice authority does not automatically grant reversal/refund/export authority

## 8. Owner Greenlight / Field Approval Concept

Real-world "owner greenlight" should be treated as real-world approval context, not as a hidden in-app financial authority transfer.

Recommended B7-A lock:
- V1 direct field invoice mode may rely on real-world approval outside the app for trusted users
- the app should not require a separate office approval record before every trusted direct draft line entry
- however, price overrides and manual/custom lines should support optional required note/attestation for audit context

Recommended V1 note posture:
- locked/default Pricebook entry does not require special attestation beyond normal audit trail
- manual/custom line entry should require stronger permission and a note/reason field
- price override should require stronger permission and a note/reason field such as phone-approved, owner-approved, or customer-approved context

Recommended future posture, deferred beyond this audit:
- optional in-app explicit approval event or attestation event for higher-risk overrides
- optional policy thresholds where office approval is required above certain amounts or discounts

## 9. Direct Invoice Line Authority

### Current code finding

Direct invoice line authority already exists through the existing invoice line actions.

Those actions already:
- require internal user
- require same-account scoped job/invoice context
- require internal invoicing mode
- require draft invoice state
- apply field billing capability checks before mutation

### Recommendation on action shape

Safest V1 direction:
- reuse the existing invoice line mutation actions rather than creating duplicate write paths
- do not create a second direct-invoice persistence model
- if UI/routing copy needs a field-specific action surface, use thin field-specific wrapper actions that delegate to the existing invoice line actions

Rationale:
- existing actions already write real draft invoice truth
- existing actions already preserve source kinds and invoice total recomputation
- duplicating write logic would create parallel commercial-truth paths

Recommendation on draft prerequisite:
- direct field invoice users should operate against a draft invoice first
- direct line creation should not target an issued invoice
- direct line creation should not target a void invoice

Recommendation on draft creation:
- Authorized Field Invoice Mode may safely auto-create a draft invoice when none exists, but only for actors with explicit direct invoice draft authority
- that auto-create authority should still remain separate from issue/send/payment authority
- safest V1 direct path is to allow direct users to create or auto-create the draft, then edit draft lines only

## 10. Invoice Issue / Send Authority

Current code finding:
- invoice issue and send remain protected by `requireInvoiceLifecycleAccessOrRedirect`
- that authority is currently structural owner, `admin`, or `billing`

Recommended B7-A lock:
- direct field invoice authority should not automatically imply invoice issue authority
- direct field invoice authority should not automatically imply invoice send authority

Recommended V1 posture:
- Owner/Admin/Billing continue to use `Review Invoice` and existing issue/send controls
- trusted direct field invoice users can build or edit the draft invoice but do not issue or send in V1 unless a later slice explicitly adds separate capability and audits the blast radius

This preserves the distinction between:
- charge-authoring authority
- invoice lifecycle authority
- payment authority

## 11. Collect Card Payment Boundary

Collect Card Payment remains a separate lane.

Locked boundary after this audit:
- Collect Card Payment is separate from direct invoice line authority
- Collect Card Payment requires issued invoice truth
- Collect Card Payment requires positive balance due
- Collect Card Payment requires Stripe Connect readiness
- Collect Card Payment requires explicit card collection permission
- final truth remains webhook/provider-led in `internal_invoice_payments`

Direct invoice authority must not automatically grant card collection authority.

Likewise, direct invoice authority must not grant:
- manual payment recording authority
- check/cash/other verification authority
- payment-link creation authority
- reversal/refund/export authority

## 12. UI Routing Rules

Recommended UI routing lock:

If actor has direct invoice workflow authority:
- primary field billing CTA should be direct invoice workflow
- proposal entry should be hidden or clearly secondary

If actor lacks direct invoice workflow authority but has proposal authority:
- primary field billing CTA should be `Add Proposed Charge`

If actor has neither:
- show read-only Field Billing Summary only

If actor is Owner/Admin/Billing:
- `Review Invoice` remains the primary direct workflow
- proposal entry should not compete as the main path

Recommended labels by mode:
- direct invoice mode: `Review Invoice` or `Add Invoice Charge`
- proposal mode: `Add Proposed Charge`
- payment mode later: `Collect Card Payment`

The UI should route by permission and invoice state, not by showing every possible path at once.

## 13. Avoiding Three Competing Line-Item Areas

The product must avoid three competing primary charge areas:
- invoice workspace draft line items
- field proposal entry
- future field direct invoice entry

Locked B7-A rule:
- there should be one primary charge-entry area per actor/state

Recommended precedence:
1. If user has direct invoice authority, show direct invoice workflow as primary.
2. If user lacks direct invoice authority but has proposal authority, show proposal workflow as primary.
3. If user has neither, show read-only billing summary.

Owner/Admin/Billing should not be pushed through proposal entry as the main workflow when a direct invoice draft workflow already exists.

If future hybrid companies need both surfaces, proposal mode should be secondary and intentionally labeled, not co-equal.

## 14. Recommended V1 Direct Field Invoice Flow

Recommended safest V1 direct path:
1. Actor has explicit direct invoice authority or existing Owner/Admin/Billing lifecycle authority.
2. If no draft invoice exists, create or auto-create a draft invoice through a controlled path.
3. Actor can add Pricebook-backed draft invoice lines directly.
4. Actor can convert Visit Scope items to draft invoice lines directly.
5. Actor can edit quantity and description where permitted.
6. Price override requires stronger permission and required note/attestation.
7. Manual/custom line entry requires stronger permission than Pricebook/Visit Scope entry.
8. Invoice remains draft until separate issue authority is exercised.
9. Collect Payment remains absent until issued invoice and separate payment authority exist.

Recommended V1 scope for direct users:
- yes: select Pricebook items
- yes: convert Visit Scope to invoice lines
- yes: edit description
- yes: edit quantity
- maybe/stronger gate: edit price
- maybe/stronger gate: add manual/custom charge
- no by default: issue invoice
- no by default: send invoice
- no by default: collect card payment

## 15. Recommended Implementation Sequence

Recommended next implementation sequence:
1. B7-A audit/model lock.
2. Direct field invoice permission wrapper/actions and capability split.
3. UI routing cleanup so users see either direct invoice workflow or proposal workflow, not both as competing primary paths.
4. Direct Pricebook and Visit Scope line entry for authorized users.
5. Manual/custom direct line entry only with stronger permission and required note posture.
6. Separate invoice issue/send permission decision.
7. Card-only Collect Payment against issued invoice.
8. Check/cash/other reporting and office verification later.

Implementation note:
- the safest V1 should reuse existing draft invoice line actions and existing draft invoice workspace truth where possible
- the first implementation change after this audit should be permission and routing cleanup, not payment work

## 16. Risks / Guardrails

Risks:
- conflating direct invoice authority with payment authority
- leaving `allTrue()` as the permanent trusted-user model, which over-grants future payment/verification permissions
- showing both direct invoice entry and proposal entry as equal primary workflows
- allowing manual/custom direct line entry without stronger permission or attestation
- allowing price override without audit context
- allowing direct invoice authority to implicitly issue or send invoices
- collecting payment against draft invoice truth

Guardrails:
- keep invoice line truth and payment truth separate
- keep issue/send authority separate from direct line mutation authority
- keep collection authority separate from direct line mutation authority
- keep payment truth webhook/provider-led
- keep Pricebook catalog mutation admin-only
- require draft invoice context for direct line mutation
- require stronger permission for price override and manual/custom direct lines
- prefer one primary UI path per actor/state
- preserve proposal mode for limited/supervised users

## 17. Explicit Non-Actions

This B7-A slice is docs/audit only.

Explicit non-actions:
- no product code changes
- no schema changes
- no migrations
- no Supabase writes
- no invoice behavior changes
- no payment behavior changes
- no Collect Payment button
- no Stripe/provider changes
- no queue membership changes
- no `FieldOutcomePanel` changes
- no return/callback behavior changes
- no SMS/provider changes
- no QBO changes