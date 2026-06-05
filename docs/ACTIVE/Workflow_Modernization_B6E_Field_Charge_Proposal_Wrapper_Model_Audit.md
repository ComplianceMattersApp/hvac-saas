# Workflow Modernization B6-E Field Charge Proposal / Wrapper Model Audit

## 1. Status / Authority / Scope

Status: ACTIVE PLANNING / MODEL LOCK CANDIDATE

Authority: Subordinate to:
- `docs/ACTIVE/Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6B_Field_Charge_Line_Item_Authority_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Scope: docs/audit/model only. This document locks recommended field charge proposal and wrapper-action semantics before any field charge entry UI or direct field-to-invoice implementation begins.

This document authorizes no product code changes, schema changes, migrations, Supabase commands, Supabase data writes, invoice/payment behavior changes, Stripe/provider changes, QBO behavior changes, SMS behavior changes, field charge UI, Collect Payment button, queue membership changes, `FieldOutcomePanel` changes, or return/callback behavior changes.

## 2. Executive Summary

B6-E recommends a proposal-first model for V1 field-created charges.

Field-created charges should not become real draft invoice lines by default. Existing draft invoice line actions already mutate commercial truth, and B6-B/B6-C hardening correctly treats those paths as financial/charge-authoring authority. A field-specific wrapper should therefore create proposed charges first, then route them to office/billing review before they become invoice truth or payment-collectible balance.

Recommended V1 posture:
- Pricebook-backed field charges are the safest field entry source, but should still begin as proposed charges unless an explicit future policy allows direct draft-line creation.
- Visit Scope-derived charges should begin as proposals because Visit Scope is operational work truth, not invoice truth.
- Manual/custom field charges should always begin as proposals in V1 and require stronger permission plus office/billing review.
- Description and quantity edits are lower-risk than price edits, but all customer-visible charge changes should remain reviewable before collectible invoice truth.
- Price edits are high-trust and should require explicit `can_edit_charge_price` authority plus review.
- Collection remains blocked until approved/issued invoice truth exists.

The schema-free first step is safe only for wrapper/action skeletons, capability tests, copy, and read-only summary evolution. It is not safe for durable proposed charges, because current `internal_invoice_line_items` cannot honestly represent "field proposed but not approved invoice truth" without overloading commercial truth.

## 3. Current Post-B6-C Authority Baseline

Post-B6-C/B6-D, field billing authority is capability-based and server-side gated.

Current field billing capability names:
- `field_billing_enabled`
- `can_view_field_billing_summary`
- `can_select_pricebook_lines`
- `can_convert_visit_scope_to_invoice_line`
- `can_add_manual_charge`
- `can_edit_charge_description`
- `can_edit_charge_quantity`
- `can_edit_charge_price`
- `can_remove_field_charge`
- `can_submit_field_charges_for_review`
- `can_approve_field_charges`
- `can_collect_card_payment`
- `can_report_non_card_collection`
- `can_verify_non_card_collection`

Current hardened action baseline:
- `addInternalInvoiceLineItemFromForm` is gated by manual field charge access.
- `addInternalInvoiceLineItemFromPricebookForm` is gated by Pricebook field charge access.
- `addInternalInvoiceLineItemsFromVisitScopeForm` is gated by Visit Scope field charge access.
- `updateInternalInvoiceLineItemFromForm` is gated by field charge edit access.
- `removeInternalInvoiceLineItemFromForm` is gated by field charge removal access.

The important authority interpretation is that these existing actions still create, update, or remove real draft invoice line items. They are not proposal actions. Once called successfully, they mutate billed/commercial draft truth even if the invoice has not yet been issued.

Current read-only baseline:
- Field users with active scoped internal access can see the Field Billing Summary where allowed.
- Non-financial field users do not receive mutation authority by default.
- The Field Billing Summary does not expose charge-entry or payment collection controls.

## 4. Field Charge Proposal Problem Statement

The core problem is that "what the field wants to charge" and "what the company has approved as billable invoice truth" are not the same state.

If a technician selects or enters a field charge while standing at the job, that action may be:
- a valid Pricebook item at standard price,
- a Visit Scope item that needs billing conversion,
- a manually described extra task,
- a customer-approved price adjustment,
- a billing note that office must evaluate,
- a warranty/courtesy/no-charge decision pending office review.

Draft invoice lines are already commercial truth snapshots. Using them as "maybe proposed" rows would blur authority, confuse invoice totals, and make it too easy to surface a collectible balance before office/billing approval. That would conflict with the active model that payment follows billable truth and that invoice paid/balance derives from approved invoice/payment truth only.

## 5. Wrapper Action Model Options

Option A: direct field action delegates to existing invoice line actions.

This is only appropriate for actors with explicit invoice/charge-authoring authority and a future account policy that intentionally allows direct field draft-line creation. It should not be the default V1 field UX.

Option B: field wrapper creates a durable field charge proposal.

This is the recommended V1. The wrapper authenticates, scopes, validates, snapshots, and writes a proposal record/event. Office/billing approval later converts approved proposals into real draft invoice line items through existing invoice-line logic.

Option C: schema-free wrapper collects form intent and redirects to review without durable proposal truth.

This is safe as a foundation/test slice but does not solve field charge entry. It can validate capability semantics and keep UI copy honest, but it cannot preserve durable proposed charges.

Recommended wrapper responsibilities before any delegation:
- Require authenticated active internal user and same-account job scope.
- Resolve field billing capabilities for the job context.
- Verify field billing is enabled for the actor/action.
- Confirm job eligibility and avoid closed, cancelled, void, archived, or soft-deleted anchors where applicable.
- Validate source type: Pricebook, Visit Scope, or manual/custom.
- Enforce action-specific capability.
- Freeze source snapshots used for later office review.
- Prevent price override unless `can_edit_charge_price` is present.
- Record proposal/review events where durable proposal state exists.
- Block collection readiness until approved/issued invoice truth exists.

## 6. Pricebook-Backed Field Charge Model

Pricebook-backed charges are the safest V1 field entry path because they start from approved reusable catalog/default pricing truth.

Recommended V1 behavior:
- Field user selects an active Pricebook item.
- Description/name/unit/default price are snapshotted from Pricebook.
- Quantity may be supplied if `can_edit_charge_quantity` or a narrower quantity capability permits it.
- Default price remains locked unless `can_edit_charge_price` is present.
- The result is a field charge proposal, not a real invoice line by default.
- Office/billing reviews and converts accepted proposals into invoice lines.

Future possible direct-to-draft exception:
- A tenant policy could later allow direct draft-line creation for locked-price Pricebook items.
- That path should require `can_select_pricebook_lines`, no price override, eligible draft invoice context, and clear audit events.
- Manual/custom and price-override paths should not inherit that exception automatically.

## 7. Visit Scope-Derived Field Charge Model

Visit Scope / Work Items are operational work truth. The existing Visit Scope copy correctly states that expected pricing helps upfront context and does not create an invoice charge.

Recommended V1 behavior:
- Field user selects completed or relevant Visit Scope items for billing consideration.
- The wrapper creates proposals linked to `visit_scope_items` or equivalent source ids.
- Proposal carries title/details/source snapshot and may carry expected price as context.
- Expected price should not silently become invoice price unless office/billing approves it.
- Conversion to real invoice lines happens during office/billing review.

This keeps operational work context separate from billable commercial truth and avoids making scope completion act like invoice creation.

## 8. Manual / Custom Field Charge Model

Manual/custom charges are high-trust because they create new customer-visible charge language and potentially new pricing outside standardized catalog truth.

Recommended V1 behavior:
- Manual/custom field charges always begin as proposals.
- `can_add_manual_charge` is required to propose a manual/custom charge.
- Description is required and should be clear enough for office review.
- Quantity can be entered only where allowed.
- Price can be entered or overridden only with `can_edit_charge_price`; otherwise the manual proposal should be a billing note or "price needed" proposal.
- Office/billing must approve, edit, reject, or convert the proposal before it becomes invoice truth.

Manual/custom charges should not directly create real draft invoice lines from the field in V1.

## 9. Description / Quantity / Price Authority

Description authority:
- Lower financial risk than price, but still customer-visible.
- Recommended V1: allow proposal description/notes where permitted; office can normalize before invoice conversion.
- Existing real invoice line description edits remain office/financial-authority behavior unless explicitly delegated.

Quantity authority:
- Directly affects amount due.
- Recommended V1: allow quantity changes for Pricebook/Visit Scope proposals where `can_edit_charge_quantity` is present or where a narrow source-specific rule permits quantity only.
- Quantity edits after approval should return the proposal to review or require office authority.

Price authority:
- Highest trust because it directly changes customer amount due.
- Recommended V1: require `can_edit_charge_price` and office/billing review.
- Pricebook price override should never be implied by Pricebook selection.
- Discounting, courtesy/no-charge, warranty adjustment, and phone-approved pricing need explicit audit context.

Removal authority:
- Removing a field-created draft proposal before submission can be allowed to the creator where policy permits.
- Removing submitted/approved proposals should require review authority.
- Removing real invoice lines remains existing invoice-line removal authority.

## 10. Office Review / Approval Model

Office/billing review should happen in or adjacent to the existing invoice workspace because that is where draft invoice truth, issue/send behavior, balance, and payment readiness already live.

Recommended V1 review states:
- draft field proposal
- submitted for review
- approved
- rejected
- cancelled/removed
- converted to invoice line

Recommended V1 office actions:
- approve and convert to invoice line,
- edit then approve,
- reject with reason,
- request clarification,
- cancel/void proposal before conversion,
- open linked job/field context.

Approval authority should require `can_approve_field_charges` or existing Owner/Admin/Billing financial authority. Approval converts proposal truth into draft invoice line truth; it should not issue, send, collect, or mark paid by itself.

## 11. Schema-Free Feasibility

Schema-free implementation is safe only for non-durable foundation work:
- capability helper tests,
- wrapper action skeletons that deny or redirect safely,
- read-only Field Billing Summary copy,
- no-op or model-only submit affordance planning,
- office review copy/prototype without persisted proposed charges.

Schema-free implementation is not safe for true field charge proposal persistence.

Current `internal_invoice_line_items` support source kinds such as manual, Pricebook, and Visit Scope, but they do not have proposal status, review status, submitter identity, approver identity, rejection reason, conversion identity, or a way to exclude proposed lines from invoice commercial truth. Overloading draft invoice lines as proposals would make totals and payment readiness ambiguous.

Conclusion: a schema-free first step is safe only if it does not claim to persist field proposals. True proposal-first field charge entry needs minimal additive schema or an equivalent durable review table before UI launch.

## 12. Future Schema / Event Needs

Recommended minimal additive model: `field_charge_proposals` or equivalent.

Conceptual fields:
- `id`
- `account_owner_user_id`
- `job_id`
- `customer_id`
- `location_id`
- `internal_invoice_id` nullable
- `source_kind`: `pricebook`, `visit_scope`, `manual`
- `source_pricebook_item_id` nullable
- `source_visit_scope_item_id` nullable
- `item_name`
- `description`
- `item_type`
- `category`
- `unit_label`
- `quantity`
- `proposed_unit_price_cents` nullable
- `proposed_subtotal_cents` nullable
- `currency`
- `proposal_status`
- `submitted_at`
- `submitted_by_user_id`
- `approved_at`
- `approved_by_user_id`
- `rejected_at`
- `rejected_by_user_id`
- `rejection_reason`
- `converted_invoice_line_item_id`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Recommended events:
- `field_charge_proposed`
- `field_charge_proposal_updated`
- `field_charge_proposal_removed`
- `field_charge_submitted_for_review`
- `field_charge_approved`
- `field_charge_rejected`
- `field_charge_converted_to_invoice_line`

The event stream should remain narrative/timeline truth. The proposal table should remain review/workflow truth. Invoice line items should remain commercial truth after conversion.

## 13. Recommended V1 UX Flow

Recommended field flow:
1. Field Billing Summary shows current billing posture: no invoice, draft invoice, proposed charges, review needed, approved/issued invoice, paid/balance due.
2. Field user opens Add Field Charge only if capability and future UI slice permit it.
3. User chooses source: Pricebook item, Visit Scope item, or manual/custom.
4. UI makes source authority obvious without heavy invoice language.
5. User reviews quantity/description/price fields according to capability.
6. Submit creates a proposed charge, not a collectible invoice line.
7. Summary shows "Submitted for office review" or equivalent.
8. Office/billing reviews in invoice workspace.
9. Approval converts proposal to draft invoice line.
10. Invoice issue/payment collection remains separate and only becomes available after invoice truth is approved/issued according to existing payment rules.

Recommended first wording principle: field charge entry should ask "What did you do or sell today?" while the system preserves "not collectible until approved" behind the scenes.

## 14. Recommended Implementation Sequence

Smallest safe sequence after this audit:

1. B6-F: proposal schema/event foundation.
   - Add durable field charge proposal table/model/events.
   - No field charge UI.
   - No invoice line conversion yet unless tests prove office-only conversion separately.

2. B6-G: server-side proposal wrapper actions.
   - Pricebook proposal action.
   - Visit Scope proposal action.
   - Manual/custom proposal action.
   - Edit/remove/submit-for-review proposal actions.
   - Capability and same-account tests.

3. B6-H: read-only Field Billing Summary and invoice workspace proposal display.
   - Show proposed/review-needed state.
   - No Collect Payment.
   - No payment behavior.

4. B6-I: office approval/conversion action.
   - `can_approve_field_charges` or Owner/Admin/Billing authority.
   - Convert approved proposals into real draft invoice lines.
   - Write conversion events.

5. B6-J: field charge entry UI.
   - Mobile-first.
   - Proposal-first.
   - Pricebook first, then Visit Scope, then manual/custom if permitted.

6. Later: payment collection.
   - Only after approved/issued invoice truth exists.
   - Card, non-card report, and verification remain governed by the payment model.

If a schema-free next slice is required, limit it to wrapper/action capability skeletons and read-only copy. Do not present it as durable field charge entry.

## 15. Risks / Guardrails

Risks:
- Treating draft invoice lines as proposals would blur commercial truth and may expose premature balances.
- Allowing field price edits without review creates discount/overcharge/audit risk.
- Visit Scope conversion can accidentally make operational work completion equal billing.
- Manual/custom charges can create inconsistent customer-facing language and pricing.
- Collection controls could appear before invoice truth is approved.
- Office review could become invisible if proposals are not surfaced in daily billing workflow.

Guardrails:
- Field-created charges are proposals first in V1.
- Existing invoice line actions remain real invoice-line actions.
- Payment follows approved/issued invoice truth.
- Stripe/card truth remains webhook/provider-confirmed.
- Check/cash/other remains reported first and office-verified before final collected-money truth.
- Pricebook remains catalog/default truth, not field override authority.
- Visit Scope remains operational truth, not invoice truth.
- Office/billing approval is required before collectible invoice truth.
- All wrapper actions must enforce same-account scope and server-side capability checks.

## 16. Explicit Non-Actions

This B6-E slice performed docs/audit/model work only.

Explicit non-actions:
- no product code changes
- no schema changes
- no migrations
- no Supabase commands
- no Supabase writes
- no invoice behavior changes
- no payment behavior changes
- no Stripe/provider behavior changes
- no QBO behavior changes
- no SMS behavior changes
- no Collect Payment button
- no field charge UI
- no queue membership changes
- no `FieldOutcomePanel` changes
- no return/callback behavior changes
- no office review implementation
- no proposal persistence implementation
- no invoice line conversion implementation

Source references reviewed:
- `docs/ACTIVE/Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6B_Field_Charge_Line_Item_Authority_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `lib/auth/field-billing-access.ts`
- `lib/actions/internal-invoice-actions.ts`
- `lib/business/internal-invoice.ts`
- `components/jobs/VisitScopeBuilder.tsx`
- `app/jobs/[id]/_components/FieldBillingSummary.tsx`
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/invoice/page.tsx`
- targeted tests covering field billing access, invoice line action hardening, Pricebook/Visit Scope/manual line behavior, and Field Billing Summary read-only posture
