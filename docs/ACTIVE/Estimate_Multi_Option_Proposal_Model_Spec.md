# Compliance Matters - Estimate Multi-Option Proposal Model Spec

Status: IMPLEMENTED; production owner testing in progress
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
Mode: Implemented model and behavior record
Date: 2026-05-19; implementation closeout updated 2026-07-20

---

## 1) Current Decision

Implementation closeout (2026-07-20):

- Comparison proposals start with two option packages (`Good` and `Better`); the operator may add an optional third (`Best`).
- Finalize & Send requires at least two populated option packages. It does not require all three slots.
- Empty optional packages are omitted from customer proposal/print output and cannot be selected for approval.
- Existing estimates that already contain an unused third package may leave it empty; it does not block finalization or appear to the customer.
- Finalize & Send Proposal combines readiness validation, proposal finalization, signed customer-link delivery, and the existing approval/notification workflow.
- Internal users can take or upload estimate photos, review/remove them, and control customer proposal visibility. Estimate AI does not automatically interpret or publish photos.
- Production migration `20260720150000_estimate_photos.sql` was confirmed applied by the owner on 2026-07-20.
- Runtime remains environment-gated and is being exercised through owner-controlled production testing.

Future Good / Better / Best proposal support must use one parent Estimate / Proposal with child Option Packages.

The current implemented Estimates model supports one parent estimate with one flat `estimate_line_items` list and one total. That is acceptable for current single-option internal quoting, but it does not cleanly support primary commercial alternatives.

This spec locks the future model direction before schema or UI work begins.

Schema foundation closeout note (2026-05-19):

- Migration `supabase/migrations/20260519110000_estimate_option_packages_foundation.sql` adds additive `estimate_options` and `estimate_option_line_items` tables only.
- Existing `estimate_line_items` remains unchanged for current single-option estimates.
- Option V1 max slots are guarded by `slot_index BETWEEN 1 AND 3` plus unique `(estimate_id, slot_index)`; trigger-based count enforcement is intentionally absent.
- Option-line consistency is enforced with a composite FK from `(estimate_option_id, estimate_id)` to `estimate_options(id, estimate_id)`.
- RLS is internal/authenticated/account-scoped through parent `estimates`; no customer, contractor, public, portal, approval, conversion, payment, email, QBO, or SMS behavior is introduced.

Internal authoring closeout notes (2026-05-19):

- Empty draft estimates create two default option packages, Good and Better; a third Best package is optional.
- Draft multi-option estimates can edit option `label` and `summary` only.
- Draft multi-option estimates can add/remove manual option line items inside each option package with server-computed line subtotals and option-only total recomputation.
- Draft multi-option estimates can add option line items from an internal option-scoped Pricebook picker (with editable defaults), reusing option-line domain snapshots and option-only recomputation.
- Option metadata editing preserves `default_label_key`, `slot_index`, `sort_order`, option totals, option line items, and parent estimate totals.
- Manual option line authoring is draft-only, account-scoped, and blocked whenever legacy flat `estimate_line_items` exist on the same estimate.
- Parent estimate subtotal/total remains unchanged by manual option line add/remove in this slice.
- Option `notes` remain reserved/internal and are not exposed or edited in this slice.
- Option line authoring, option delete/reorder, readiness scoring, approval/response, conversion, portal, email, payment, add-ons, QBO, and SMS remain deferred.

Print rendering closeout note (2026-05-19):
Approval Response V1 closeout note (2026-05-20):

- Migration `supabase/migrations/20260520110000_estimate_approval_response_v1.sql` adds 4 nullable columns to `estimates`: `selected_option_id`, `selected_option_label_snapshot`, `selected_option_total_cents`, `response_note`.
- `recordEstimateApprovalResponse` server action handles flat (no option required) and multi-option (option required; snapshots label + total at approval time).
- `buildEstimateApprovalViewModel` helper added to `estimate-domain.ts` for read model consumers; includes `isFlatEstimate` convenience field.
- Internal UI: `EstimateApprovalResponseForm` on the estimate detail page replaces the simple "Mark Approved" button with an option-selector dropdown (multi-option) or a confirm button (flat), plus an optional response note field.
- Approval response panel added to `app/estimates/[id]/page.tsx` showing selected option label, total, timestamp, and note when estimate is `approved`.
- `estimate_approved` event enriched with `proposal_mode`, `selected_option_id`, `selected_option_label_snapshot`, `selected_option_total_cents`, `response_note`, `response_source: "internal"` meta fields.
- No public/portal/email/conversion/payment/QBO/SMS/e-signature/stored PDF behavior introduced.


- Internal authenticated browser print route (`/estimates/[id]/print`) branches on `proposalMode`: single-option flat renders as before; multi-option renders option package sections (label, summary, line items, per-option total) with no parent "Proposed Total" shown.
- Option notes are excluded from the print view model; option summaries are included.
- Empty optional packages remain available for internal draft editing but are omitted from customer proposal and print output.
- Explanatory copy states options are proposed alternatives and no selection occurs in the print view.
- Boundary copy states choosing/approving/paying/converting/invoicing an option is not captured by this print view.
- Document view model (`buildEstimateDocumentViewModel`) extended with `proposalMode` and `options` fields; flat `lines` and parent `totals` remain unchanged.
- Readiness scoring, approval, selected-option response, conversion, portal, outbound email, stored/generated PDFs, public links, payment, QBO, and SMS remain deferred.

Original model-lock boundary:

- no code changes
- no schema changes
- no migrations
- no Supabase commands
- no env/secret changes
- no outbound email
- no `ENABLE_ESTIMATE_EMAIL_SEND` enablement
- no public links
- no customer portal
- no approval/e-signature implementation
- no estimate-to-job conversion
- no estimate-to-invoice conversion
- no payment/deposit behavior
- no Stripe tenant payment behavior
- no QBO behavior
- no SMS/Twilio behavior

Section 2K closeout alignment note (2026-05-23):

- Customer proposal delivery lane is now complete: Finalize Proposal -> Customer Delivery -> Send Proposal Email / Copy Link -> Customer Approves -> Internal Notification -> Review/Convert when ready.
- Provider-backed proposal email send, public proposal-link approval, internal approval notification, active-link regeneration fallback, Customer Delivery deployed UI, and local preview mode (`EMAIL_DELIVERY_MODE=preview`) smoke are all recorded as passed.
- Token safety is verified for proposal-link handling: raw token and token_hash are not persisted in events, communications, or notification payloads.
- Non-actions remain locked for this closeout: no SMS/text proposal delivery, no payment collection from proposal, no QBO behavior, no invoice issue/send from proposal approval, no automatic job conversion, no automatic invoice conversion, no customer portal login dependency, and no e-signature/legal artifact model.
- Multi-option customer-facing visual treatment remains optional polish only and is parked unless future field evidence reopens it.

---

## 2) Current Model Limitation

Current estimate data is shaped as:

- parent `estimates` row for customer/location/service-case/context/lifecycle
- flat child `estimate_line_items` rows
- one subtotal/total for the whole estimate

That shape has no first-class place for alternate packages. If Good / Better / Best is represented only by line-item ordering or headings, the system cannot safely answer:

- which option the customer approved
- which option total should print as selected
- which option should convert later
- which option line items should report as quoted scope
- whether a line belongs to a primary option or a non-option note/header

The limitation is structural, not just UI polish.

---

## 3) Rejected Approaches

### Three linked estimates

Rejected.

Creating three separate estimates for Good / Better / Best would fragment one customer proposal into multiple lifecycle records. It would create ambiguity around:

- one proposal number versus three estimate numbers
- one customer response versus three independent approval states
- one print/email artifact versus three artifacts
- one revision/history trail versus parallel histories
- future conversion source when one option is selected
- reporting a single sales proposal versus reporting three independent proposals

Separate estimates may still exist for truly separate proposals, but they are not the model for primary alternatives inside one proposal.

### Fake option headers inside flat line items

Rejected.

Using flat `estimate_line_items` rows as fake section headers for Good / Better / Best would create approval, print, total, conversion, and reporting ambiguity.

Specific problems:

- heading rows are not commercial line items
- totals would require fragile grouping logic not represented in the data model
- approval would need to infer a selected option from display order or text labels
- conversion would not have a durable selected option id
- reporting would mix proposed commercial lines with presentation-only rows
- editing/reordering could accidentally move lines across implied option boundaries

The flat-line approach must remain limited to current single-option estimates until a first-class option model exists.

---

## 4) Approved Parent + Child Model

Approved future model:

- Parent Estimate / Proposal remains the shared proposal container.
- Child Option Packages represent the primary commercial alternatives.
- Each Option Package owns its own line items and total.
- Customer approval intent is recorded against one selected primary option.

Parent estimate responsibilities:

- estimate/proposal number
- customer
- location
- service case or originating job context when present
- title/summary
- lifecycle state
- shared proposal notes/disclaimers/readiness context
- revision/freeze context when later implemented
- overall proposal response state

Child option package responsibilities:

- option id
- parent estimate id
- editable option label
- stable sort order
- primary-option flag/type
- option-specific description/scope summary when needed
- option-specific line items
- option-specific subtotal/total
- option-specific approval/selection eligibility

Line-item ownership should move from parent-flat commercial scope to option-scoped commercial scope for multi-option proposals. Current single-option estimates can be migrated or adapted later by creating one default option package if that path is chosen during implementation.

---

## 5) V1 Option Rules

V1 primary options:

- Default max is 3 primary options by app rule.
- Default labels are Good / Better / Best.
- Labels remain editable.
- Sort/order is stored separately from label.
- Each option has its own line items.
- Each option has its own subtotal/total.
- Primary option approval intent is single-select.

Important distinction:

- label answers "what should users/customers see?"
- sort order answers "where does this option appear?"
- option id answers "what durable package was selected?"

The app should not infer order from label text. Renaming "Good" to "Repair Only" must not change sort order or selected-option identity.

---

## 6) Optional Add-ons

Optional add-ons are separate from primary option packages and remain deferred.

Future optional add-ons should not be modeled as extra primary options. They are proposed selectable extras that may attach to or be compatible with one or more primary options.

Deferred add-on design questions:

- whether add-ons are global to the proposal or scoped to specific primary options
- whether add-ons are single-select, multi-select, quantity-based, or informational
- how add-on totals combine with a selected primary option
- how add-on approval/decline is captured
- how add-on conversion snapshots are produced

Until that model exists, V1 should not overload primary options to behave like add-ons.

---

## 7) Future Print Presentation Expectations

Print and Save as PDF presentation should clearly show:

- one proposal header and shared customer/location/business context
- primary option packages in stored sort order
- editable option labels, such as Good / Better / Best defaults or operator-renamed labels
- each option's own scope lines and total
- clear single-select customer response language when approval is later implemented
- selected option identity once a response exists
- no implication that unselected alternatives are approved

Print presentation may compare options side-by-side or stacked, but the underlying data must remain option-scoped. Presentation must not depend on fake line-item headers.

---

## 8) Future Approval / Response Expectations

Approval/response design remains future work, but the model direction is locked:

- customer primary-option approval intent should be single-select
- response should anchor to `estimate_option_id` or equivalent durable option id
- response should preserve option label and total snapshots at response/freeze time when revision semantics are implemented
- decline/request-change flows remain separate future design
- e-signature remains deferred
- customer portal/public response surfaces remain deferred

Internal status transitions may continue to exist for the current internal-only baseline, but they must not be confused with customer approval truth.

---

## 9) Future Conversion Expectations

**Status: Model locked (May 20, 2026 audit) — documented in `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md` Section 1.5.**

Future conversion must anchor from selected option id.

Conversion should not infer selected scope from:

- option label text
- line-item display order
- a parent estimate total
- a manually typed note
- a fake heading row

Future conversion paths should explicitly consume:

- parent estimate id
- selected option id (for multi-option)
- selected option line-item snapshots
- selected option total snapshot
- optional add-on selections only after add-ons are designed

**Conversion model specifics (from locked audit, May 20, 2026):**

- Conversion is two durable internal actions: estimate → job (Action A), then estimate → invoice draft (Action B).
- Both actions require estimate `approved` status for initial conversion.
- After Action A, estimate becomes `converted` (terminal for regular status transitions).
- Action B is callable when estimate status is `approved` **OR** `converted`, permitting invoice creation after job creation without blocking.
- Selected-option requirement for multi-option; all selected-option line items only (no grand total fallback).
- Flat estimates: all lines convert, total snapshot captured.
- Durable linkage via `converted_job_id`, `converted_invoice_id` on estimates; `origin_estimate_id` on jobs; `source_estimate_id` on invoices.
- Audit trail via `estimate_events` with `estimate_converted_to_job` and `estimate_converted_to_invoice` entry types.
- Idempotency via unique constraints on all linkage fields; one active invoice per job enforced.
- Conversion is historically-only; not reversible in V1 through status transitions.

Section 2C Action A closeout note (2026-05-20):

- Internal-only approved estimate -> job conversion is implemented with durable linkage and idempotency guards.
- Action A migration is staged as `supabase/migrations/20260520120000_estimate_to_job_conversion_v1.sql` and remains environment-activation gated.
- Action A adds/uses: `estimates.converted_job_id`, `estimates.converted_by_user_id`, `jobs.origin_estimate_id`, plus unique partial indexes on both linkage fields.
- Conversion action is schema-safe: when migration columns are unavailable, UI action is hidden and action returns `estimate_conversion_schema_unavailable`.
- Flat estimates convert all flat estimate lines to job `visit_scope_items`; multi-option estimates require `selected_option_id` and convert selected option lines only.
- Action A writes `estimate_events.estimate_converted_to_job` metadata with `job_id`, `converted_by_user_id`, `approved_total_cents`, `proposal_mode`, and selected-option snapshots for multi-option.
- No invoice conversion is included in this slice.
- No payment/Stripe tenant execution/QBO/SMS/email/customer portal/public-link/e-signature/stored-PDF behavior is introduced.

Estimate-to-invoice conversion (Action B) remains deferred.

---

## 10) Template / Versioning Direction

Future template support should likely use versioned templates, not a single mutable template table.

Planning posture:

- proposal templates should distinguish template identity from template version
- approved/published template versions should be immutable or effectively frozen
- editing an approved template should create a new draft version
- generated proposal content should snapshot the template version used
- option package templates may define default labels, sort order, line groups, and recommended wording
- template use must not live-sync historical estimates

This mirrors the broader platform preference for durable historical snapshots and explicit version semantics.

---

## 11) Phased Implementation Plan

Recommended future sequence:

1. Schema design review for parent estimate plus child option packages.
2. Add option package foundation and option-scoped line item model, behind existing estimate guards.
3. Add read helpers that can project both current single-option estimates and future option-package estimates safely.
4. Add internal draft UI for creating/editing up to 3 primary options with Good / Better / Best defaults.
5. Add internal print/readiness presentation for multi-option proposals.
6. Add internal response/selection recording model only after approval semantics are reviewed.
7. Add customer-facing approval/e-signature/public/portal surfaces only after separate authority and security design.
8. (**Section 2B locked, May 20, 2026**) Add conversion from selected option id following the locked two-action model: Action A (estimate → job), then Action B (estimate → invoice draft). Action A is now implemented internally (environment migration-gated) with durable linkage and audit trail. Action B remains deferred.
9. Add optional add-ons as a separate model after primary options are proven.
10. Add versioned template system after proposal content/revision semantics are mature enough to freeze safely.

Each phase should preserve the existing boundaries around email, public links, portal, conversion, payments, Stripe tenant behavior, QBO, and SMS unless that phase explicitly reopens one of those gates.

---

## 12) Source-of-Truth Boundaries

Locked terminology:

- Estimate Lines = proposed commercial scope in the current single-option model.
- Future Estimate Options / Packages = proposed commercial alternatives.
- Future Optional Add-ons = proposed selectable extras.
- Work Items / Visit Scope = operational work scope.
- Invoice Charges = billed commercial scope.
- Payment entries = tracking/collected truth only where already implemented.

Do not collapse these meanings into one line-item bucket.

---

## 13) Explicit Non-Goals

This spec does not implement or authorize:

- schema changes
- migrations
- UI changes
- server actions
- Supabase commands
- production writes
- email sending
- `ENABLE_ESTIMATE_EMAIL_SEND`
- public estimate links
- customer portal visibility
- customer approval
- customer e-signature
- customer decline/request-change workflow
- estimate-to-job conversion
- estimate-to-invoice conversion
- optional add-on implementation
- payment/deposit behavior
- Stripe tenant payment behavior
- QBO behavior
- SMS/Twilio behavior

This is a model lock only.

## 2) Section 2D Model Lock: Estimate → Invoice Draft Conversion

### Locked Model

1. **V1 requires Section 2C first**:
   - Invoice conversion requires `estimates.converted_job_id`.
   - V1 does not convert approved estimates directly to invoices without a converted job.
   - This preserves the chain: estimate → job → invoice.

2. **Invoice conversion creates draft invoice only**:
   - No issuing.
   - No sending.
   - No payment collection.
   - No Stripe tenant payment execution.
   - No QBO.
   - No SMS.
   - No portal/public behavior.

3. **Preconditions**:
   - Estimate status may be `converted`.
   - `converted_job_id` must exist.
   - Job must belong to the same account.
   - Internal invoicing mode must allow internal invoice creation.
   - External-billing mode blocks invoice conversion.
   - Job must not already have an active non-void invoice.
   - Multi-option estimate must already have selected option captured from Section 2A/2C flow.

4. **Line item source**:
   - Invoice conversion reads from converted job `visit_scope_items`, not directly from estimate lines.
   - `source_kind = visit_scope`.
   - Preserve `source_visit_scope_item_id` when present.
   - Preserve `source_pricebook_item_id`, item type, category, unit label, quantity, and unit price snapshots as available.
   - No live Pricebook re-resolution.

5. **Schema needed for future implementation**:
   - `internal_invoices.source_estimate_id`.
   - `estimates.converted_invoice_id`.
   - Partial unique index on `internal_invoices(source_estimate_id)` where `source_estimate_id is not null and status != 'void'`.
   - Do not add `converted_invoice_by_user_id` in V1; actor truth lives in `estimate_events`.

6. **Idempotency**:
   - Block if `estimates.converted_invoice_id` points to an active invoice.
   - Block if an active non-void `internal_invoices.source_estimate_id` already exists.
   - Voided invoice replacement may be allowed later through a deliberate replacement/void-aware flow.

7. **Status**:
   - Action B does not change estimate status if already `converted`.
   - Action B does not update `converted_at`.
   - Action B only links `converted_invoice_id` after draft invoice creation.

8. **Audit**:
   - Write `estimate_converted_to_invoice`.
   - Metadata should include:
     - `invoice_id`.
     - `job_id`.
     - `source_estimate_id`.
     - `converted_by_user_id`.
     - `proposal_mode`.
     - `approved_total_cents`.
     - `selected_option_id` / selected option label when multi-option.

9. **Boundaries**:
   - No payment execution.
   - No invoice issue/send.
   - No QBO.
   - No SMS.
   - No email/provider changes.
   - No portal/public behavior.
   - No production Supabase commands.

## 3) Section 2E: Estimate → Invoice Draft Conversion Schema Foundation

**Status: Implementation complete (2026-05-20) — schema foundation and deploy-safety compatibility only.**

Section 2E implements schema and read-model compatibility for future Action B (estimate → invoice draft conversion), without introducing any invoice conversion behavior, invoice draft creation, invoice line items, or production Supabase commands.

**Schema foundation**:

- Migration `supabase/migrations/20260520130000_estimate_invoice_conversion_foundation_v1.sql` adds:
  - `estimates.converted_invoice_id` (nullable string).
  - `internal_invoices.source_estimate_id` (nullable string).
  - Unique partial index on `estimates(converted_invoice_id)` where `converted_invoice_id is not null`.
  - Unique partial index on `internal_invoices(source_estimate_id)` where `source_estimate_id is not null and status != 'void'`.
  - No RLS changes; internal/authenticated scope inherited from parent tables.

**Read-model compatibility**:

- `getEstimateConvertedInvoiceId()` normalizes missing `converted_invoice_id` to null for compatibility with older schema.
- `isEstimateToInvoiceConversionSchemaReady()` returns `false` when the field is absent and `true` only when the field exists.
- `EstimateReadResult` includes `converted_invoice_id` and `invoiceConversionSchemaReady` fields for consumers.
- `EstimateListItem` includes `converted_invoice_id` for list operations.

**Boundaries**:

- No `recordEstimateToInvoiceConversion` action.
- No invoice draft creation.
- No invoice line item creation.
- No "Convert to Invoice" button or UI.
- No issue/send/payment/QBO/SMS/email/provider/portal behavior.
- No production Supabase command was run in this slice.
- Migration activation remains environment-gated; V1 Action B requires a separate approval window after Section 2D behavior is proven live.

## 4) Section 2F: Estimate -> Invoice Draft Conversion V1 (Action B)

**Status: Implementation complete (2026-05-20) — internal-only Action B behavior.**

Section 2F implements converted estimate/job -> draft internal invoice conversion only.

- Requires Section 2C first (`converted_job_id` required).
- Requires invoice conversion schema readiness (`invoiceConversionSchemaReady = true`).
- Creates draft invoice only (`status = draft`, `source_type = estimate`, `source_estimate_id = estimate.id`, `job_id = converted_job_id`).
- Invoice line items are created from converted job `visit_scope_items` only (not estimate lines).
- Visit-scope provenance is preserved (`source_kind = visit_scope`, `source_visit_scope_item_id`, `source_pricebook_item_id` when present) with frozen snapshots.
- Idempotency guards block active duplicates by `converted_invoice_id`, active non-void job invoice, and active non-void `source_estimate_id` invoice.
- Estimate is updated with `converted_invoice_id` only; no status change and no `converted_at` mutation.
- Audit event `estimate_converted_to_invoice` is written with invoice/job/source/actor/proposal metadata.

**Boundaries preserved**:

- No issue/send/payment execution.
- No Stripe tenant payment execution, QBO, SMS, email/provider, portal/public behavior.
- No production Supabase command was run in this slice.
- Migration activation remains environment-gated by target environment migration windows.

## 5) Section 2G: Internal Estimate Chain Closeout

**Status: Chain closeout (2026-05-20) — internal chain code-complete and smoke-passed.**

The Section 2 internal estimate chain is code-complete and pushed to main/origin.

- Completed chain: Create estimate → approve/select option (Sections 2A/2B) → convert approved estimate to job (Section 2C) → convert to draft invoice (Sections 2E/2F).
- Local Section 2G smoke passed for:
  - flat estimate chain (single-option)
  - multi-option selected-option chain (Good / Better / Best)
- Hardening commit included in main/origin: `47f58af` — `fix(estimates): harden conversion smoke edge cases`
- Environment-gated migrations not yet applied to production:
  - `20260520110000_estimate_approval_response_v1.sql`
  - `20260520120000_estimate_to_job_conversion_v1.sql`
  - `20260520130000_estimate_invoice_conversion_foundation_v1.sql`
- Production usability requires a controlled migration-and-smoke window.
- No production Supabase command was run.
- No production migration was applied.
- No env/secret changes.

**Still deferred**:

- customer/public estimate approval link
- customer portal approval
- e-signature
- stored/generated PDF artifact pipeline
- automatic invoice issue/send from conversion
- payment collection from estimate conversion
- Stripe tenant payment execution
- QBO
- SMS
