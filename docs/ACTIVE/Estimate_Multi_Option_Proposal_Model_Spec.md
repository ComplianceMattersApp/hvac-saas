# Compliance Matters - Estimate Multi-Option Proposal Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-19

---

## 1) Current Decision

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

- Empty draft estimates can create exactly three default option packages: Good / Better / Best.
- Draft multi-option estimates can edit option `label` and `summary` only.
- Draft multi-option estimates can add/remove manual option line items inside each option package with server-computed line subtotals and option-only total recomputation.
- Draft multi-option estimates can add option line items from an internal option-scoped Pricebook picker (with editable defaults), reusing option-line domain snapshots and option-only recomputation.
- Option metadata editing preserves `default_label_key`, `slot_index`, `sort_order`, option totals, option line items, and parent estimate totals.
- Manual option line authoring is draft-only, account-scoped, and blocked whenever legacy flat `estimate_line_items` exist on the same estimate.
- Parent estimate subtotal/total remains unchanged by manual option line add/remove in this slice.
- Option `notes` remain reserved/internal and are not exposed or edited in this slice.
- Option line authoring, option delete/reorder, print multi-option rendering, readiness scoring, approval/response, conversion, portal, email, payment, add-ons, QBO, and SMS remain deferred.

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

Future conversion must anchor from selected option id.

Conversion should not infer selected scope from:

- option label text
- line-item display order
- a parent estimate total
- a manually typed note
- a fake heading row

Future conversion paths should explicitly consume:

- parent estimate id
- selected option id
- selected option line-item snapshots
- selected option total snapshot
- optional add-on selections only after add-ons are designed

Estimate-to-job and estimate-to-invoice conversion remain deferred and are not implemented by this spec.

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
8. Add conversion from selected option id only after response and snapshot semantics are locked.
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
