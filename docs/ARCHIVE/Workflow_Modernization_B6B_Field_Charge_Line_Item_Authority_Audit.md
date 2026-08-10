# Compliance Matters Workflow Modernization Slice B6-B

## 1. Status / Authority / Scope

Status: Draft audit and model lock.

Authority: This document extends the B6-A Field Billing / Collect Payment audit and is subordinate to the active Workflow Modernization spine, Payments V2 split, Financial Ledger truth model, and Active Spine decisions. B6-A found the payment foundation strong enough for a future collect-payment experience only after line-item and charge authority are clarified. B6-B locks that clarification for field charge creation and invoice line-item authority.

Scope: Documentation-only audit. This slice reviews existing draft invoice line creation and edit paths, current role/access controls, visit-scope versus invoice-line truth, and the recommended permission and UX model before any Field Charge or Collect Payment implementation.

Out of scope: Runtime behavior, schema migrations, Supabase writes, Stripe/provider changes, invoice or payment code changes, queue changes, FieldOutcomePanel changes, return/callback changes, SMS changes, QBO changes, and any customer-facing payment flow implementation.

## 2. Executive Summary

The existing invoice/payment foundation is intentionally stronger than the current draft line-item authority layer. Invoice lifecycle actions and payment actions are protected by financial access rules: structural account owner, admin, or billing. Pricebook catalog mutation is admin-only. However, draft line-item add/edit/remove actions currently require an internal user, scoped job access, internal-invoicing entitlement, internal billing mode, and a draft invoice, but they do not apply the same financial lifecycle gate.

That split matters because line-item edit authority is charge authority. Adding a manual line, selecting a Pricebook line, converting Visit Scope to a draft invoice line, changing quantity, changing unit price, and deleting a line can all change the commercial amount later issued to the customer. These actions should not be exposed to technicians through the existing draft invoice table without a new server-side Field Billing permission layer.

Recommended first implementation slice: add a schema-free server-side permission wrapper/model for field billing capabilities and use it to render a read-only field billing summary plus a disabled/proposed-charge UX. Do not allow card collection until the invoice is approved/issued by an authorized financial actor.

## 3. Existing Line-Item Creation Paths

Draft invoice creation is financially gated. `createInternalInvoiceDraftFromForm` loads the internal invoice context and then calls `requireInvoiceLifecycleAccessOrRedirect` before creating a draft.

Manual/custom line creation is handled by `addInternalInvoiceLineItemFromForm`. It starts from `requireDraftInvoiceContext`, parses line draft fields, inserts `source_kind: 'manual'`, writes the line snapshots and pricing fields, and resyncs invoice totals.

Pricebook-backed line creation is handled by `addInternalInvoiceLineItemFromPricebookForm`. It also starts from `requireDraftInvoiceContext`, loads a scoped Pricebook snapshot, blocks missing, inactive, adjustment, and negative-price items, freezes Pricebook name/description/type/category/unit snapshots, applies quantity and default unit price, inserts `source_kind: 'pricebook'`, and resyncs totals.

Visit Scope line creation is handled by `addInternalInvoiceLineItemsFromVisitScopeForm`. It starts from `requireDraftInvoiceContext`, validates selected Visit Scope IDs against the job's sanitized `visit_scope_items`, prevents duplicate Visit Scope line sources, inserts `source_kind: 'visit_scope'`, uses the scope title/details as snapshots, defaults item type to service, sets quantity, sets unit price to zero, and resyncs totals.

Important authority finding: all three line creation paths are draft-only and scoped, but they are not financially gated in the same way as invoice creation, issue, void, email, save-draft billing edits, and payment actions.

## 4. Existing Line-Item Edit Paths

`updateInternalInvoiceLineItemFromForm` starts from `requireDraftInvoiceContext`, requires the target line to belong to the draft invoice, parses the same draft line fields used by manual line creation, updates the row, and resyncs totals.

`removeInternalInvoiceLineItemFromForm` starts from `requireDraftInvoiceContext`, requires the target line to belong to the draft invoice, deletes the row, and resyncs totals.

The edit path is broad: it can change item name, description, item type, quantity, unit price, and therefore subtotal/total. Deleting a line is also commercial authority. These paths should be treated as charge-authoring actions, not merely cosmetic invoice editing.

## 5. Current Role / Access Findings

Financial lifecycle access currently allows the structural account owner and active internal users with `admin` or `billing` role. The shared financial helpers cover invoice lifecycle, payment recording, payment link creation, export, and reversal-style financial operations.

Payment action tests confirm the intended boundary: billing is allowed, structural owner is allowed even if role is office, and ordinary office/dispatcher or technician roles are denied for recording payments, checkout session creation, and payment reversal.

Invoice lifecycle hardening tests confirm office users are denied for lifecycle entry points while billing is allowed past the financial authority preflight.

Pricebook catalog mutation is stricter: `createPricebookItemFromForm`, `updatePricebookItemFromForm`, and `setPricebookItemActiveFromForm` require `requireInternalRole("admin")` before entitlement checks. That makes catalog management admin-only.

Authority gap: draft line-item mutations are not visibly covered by the financial access helper. The server-side preflight for line-item add/edit/remove is internal user plus scoped job plus entitlement plus internal invoicing mode plus draft invoice. A technician or non-billing office user with scoped job access is not explicitly denied at these line-item entry points by role unless another upstream route/UI condition prevents access.

UI exposure today is office/invoice oriented but direct. The job detail invoice panel and `/jobs/[id]/invoice` page both mount `InternalInvoiceLineItemsTable` for draft invoices and pass the manual, Pricebook, Visit Scope, update, and remove actions directly into the component.

## 6. Visit Scope vs Invoice Line Truth

Visit Scope is operational truth. It captures intended work, completed work context, source Pricebook-like template references, and optional expected price context. The builder explicitly says the optional price "does not create an invoice charge."

Invoice line items are commercial truth. They snapshot charge name, description, type, category, unit label, quantity, unit price, subtotal, and source provenance. Once a line exists on an internal invoice, it participates in invoice totals and later payment/collection truth.

The field UX must preserve this separation. A technician completing work may confirm operational scope; that should not automatically mean they have authority to create or price a commercial charge.

## 7. Pricebook-Backed Line Model

Pricebook-backed invoice lines are the safest field charge source because catalog mutation is admin-only and line creation freezes a scoped active item snapshot. The current action already rejects inactive Pricebook items, adjustment items, and negative Pricebook prices.

Recommended model:

- Normal field users may select from approved active Pricebook items only if a field billing permission grants it.
- Default Pricebook price should be locked for normal field users.
- Quantity edits may be allowed separately from price edits.
- Description edits should be either locked, appended as field notes, or separately permissioned.
- Pricebook item mutation remains admin-only and out of the field billing flow.
- Pricebook line selection should still require draft invoice authority through a new field billing wrapper, not direct use of the existing office invoice line action.

## 8. Manual / Custom Line Model

Manual/custom lines are high-trust because they allow arbitrary name, type, quantity, and unit price. In practice, this is price-authoring authority.

Recommended model:

- Manual field charges are disabled by default for technicians.
- Manual field charges require an explicit `can_add_manual_charge` capability.
- Manual price entry requires a stronger `can_edit_charge_price` capability.
- Manual charges without price authority should become proposals for office review, not payable invoice lines.
- Manual charge descriptions can be allowed separately as non-price details, but they should not mutate issued invoice truth without approval.

## 9. Field Billing Permission Model

Recommended capabilities:

- `field_billing_enabled`: master switch for the account/user field billing surface.
- `can_view_field_billing_summary`: view invoice/payment readiness and current approved charges.
- `can_select_pricebook_lines`: add approved active Pricebook lines at locked default price.
- `can_convert_visit_scope_to_invoice_line`: propose or add lines from completed Visit Scope items.
- `can_add_manual_charge`: create a custom/manual charge proposal.
- `can_edit_charge_description`: edit customer-visible line descriptions.
- `can_edit_charge_quantity`: adjust quantity/multipliers.
- `can_edit_charge_price`: override unit price or enter custom prices.
- `can_remove_field_charge`: remove a draft/proposed field-created charge.
- `can_submit_field_charges_for_review`: send proposed charges to office billing review.
- `can_approve_field_charges`: approve field-created charges for invoice issue.
- `can_issue_invoice`: issue the invoice.
- `can_collect_card_payment`: collect card payment against an issued/approved invoice.
- `can_report_non_card_collection`: report cash/check/other collection without marking payment verified.
- `can_verify_non_card_collection`: office/admin/billing verification only.

Recommended default roles:

- Technician: no charge mutation by default. May view summary only if enabled.
- Field Billing Enabled technician: may select locked Pricebook lines and/or convert Visit Scope lines only when specifically enabled; no price override by default; manual charges disabled unless separately enabled; no issue, verify, refund, export, or payment reversal authority.
- Office/dispatcher: no financial authority by default. May review/reroute proposed field charges only if separately enabled.
- Billing/admin/structural owner: invoice lifecycle, approval, issue, payment, and verification authority.

## 10. Recommended Field UX Model

The field UI should be a compact Charges step, not the existing office invoice builder. It should show invoice status, approved charges, proposed charges, and payment readiness in plain operational language.

Recommended states:

- No draft invoice: show read-only billing summary and "office invoice required" state.
- Draft invoice, no field charge permission: show read-only draft charges and route to office.
- Field charge permission, locked Pricebook only: show active Pricebook search, quantity selector, selected charges tray, and submit-for-review action.
- Manual allowed: show manual charge fields only after the Pricebook fallback path is exhausted or explicitly selected.
- Needs office review: prevent collection and show review status.
- Issued/approved invoice: enable card collection only when payment authority and B6-A payment guardrails are satisfied.

The mobile field flow should optimize for quick selection, quantity confirmation, and clear charge status. It should not expose dense invoice editing controls, arbitrary price edits, voiding, issuing, exporting, reversal, webhook, or provider details.

## 11. Pricebook-Incomplete Fallback Model

When Pricebook is incomplete, the field user should not be pushed into full manual invoice authority by default.

Recommended fallback:

- Let the technician complete the operational Visit Scope.
- Let them flag "charge needed" with notes and optional internal estimate.
- If `can_add_manual_charge` is absent, route the item to office billing review.
- If manual charge is allowed but price override is absent, create a proposal without collection readiness.
- If manual price entry is allowed, still require office approval before collection unless `can_approve_field_charges` is also granted.

This keeps job completion unblocked while preventing unapproved field-created charges from becoming payable invoice truth.

## 12. Office Review / Approval Model

Office review should bridge field charge proposals and invoice truth. The office/billing user should see the source, actor, Visit Scope linkage, Pricebook linkage, quantity, price, and customer-visible text before approval.

Recommended approval rules:

- Proposed charges do not become collectible until approved and issued.
- Price overrides always require explicit review unless the actor has price approval authority.
- Manual charges require review by default.
- Visit Scope-derived charges should show operational completion context but must still distinguish "work done" from "charge approved."
- Collection should only use issued/approved invoice totals and webhook/provider truth, consistent with B6-A.

## 13. Schema-Free First Step Recommendation

The first implementation slice should avoid schema changes and avoid exposing the existing line-item actions directly to field users.

Recommended first slice:

- Add a server-side field billing permission resolver near the financial access layer.
- Add explicit tests proving technicians cannot call draft line-item add/edit/remove unless the new field billing capability allows the exact action.
- Add a read-only field billing summary model for job detail/field completion surfaces.
- Gate any future field charge UI through new wrapper actions that call the permission resolver before delegating to draft invoice mutation logic.
- Keep card collection disabled unless invoice status and authority satisfy B6-A.

This slice gives the product a safe permission foundation before adding any new commercial mutation surface.

## 14. Future Schema/Event Needs, if any

Schema may eventually be useful, but it should not be the first step.

Likely future needs:

- Field charge proposal records or invoice-line proposal metadata.
- Approval status separate from invoice draft status.
- Actor/source metadata for field-created, Pricebook-created, Visit Scope-created, office-approved, and price-overridden lines.
- Job events such as `field_charge_proposed`, `field_charge_updated`, `field_charge_removed`, `field_charge_submitted_for_review`, `field_charge_approved`, and `field_charge_rejected`.
- Optional policy configuration for allowed field charge types, max price override, required review thresholds, and non-card collection reporting.

## 15. Recommended Implementation Sequence

1. Add server-side field billing capability resolver and tests around current draft line-item actions.
2. Add wrapper actions for field charge proposals or permissioned draft line additions. Do not wire field UI directly to existing office invoice line actions.
3. Add read-only field billing summary to the field/job completion surface.
4. Add locked Pricebook selection for explicitly enabled users.
5. Add submit-for-office-review state before collection.
6. Add office approval UX.
7. Add card collection only against approved/issued invoice truth, following B6-A.
8. Add manual/custom field charges only after Pricebook-backed flow and approval rules are stable.
9. Add schema/events if proposal status and audit needs outgrow existing invoice line metadata.

## 16. Risks / Guardrails

Risks:

- Treating Visit Scope optional price as invoice truth.
- Letting technicians mutate draft invoice lines through current office actions.
- Allowing manual line creation without separating description, quantity, and price authority.
- Letting Pricebook gaps force unsafe custom charges.
- Collecting payment against unapproved draft totals.
- Blurring non-card collection reporting with verified payment truth.
- Assuming UI hiding is enough when server actions remain callable.

Guardrails:

- Treat line-item mutation as charge authority.
- Enforce field billing permissions server-side.
- Keep Pricebook catalog mutation admin-only.
- Lock Pricebook default price for normal field users.
- Route manual and price override flows to office review by default.
- Require issued/approved invoice truth before card collection.
- Keep payment truth provider/webhook-led.
- Add denial tests for technician/office access to draft line-item mutation entry points.

## 17. Explicit Non-Actions

This slice does not:

- Change runtime behavior.
- Add or modify schema.
- Add migrations.
- Modify Supabase data.
- Modify Stripe, provider, webhook, payment, or checkout behavior.
- Modify invoice actions, payment actions, queue behavior, SMS, QBO, return/callback handling, or FieldOutcomePanel.
- Expose a new field charge UI.
- Implement card collection.
- Treat Visit Scope optional price as an invoice charge.
- Grant technicians invoice issue, payment verification, refund/reversal, export, or Pricebook catalog authority.
