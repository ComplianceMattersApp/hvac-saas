# Compliance Matters Software — Business Layer Expansion Roadmap

**Status:** DRAFT SUPPORTING PLANNING DOC  
**Authority:** Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`  
**Purpose:** Define the future business/commercial layer that expands the current operational platform without regressing the live workflow or conflicting with the active spine.

---

## 1. Document role

This document is a **future-state business-layer planning doc**, not the operational source of truth.

It exists to plan the next commercial/business modules on top of the existing platform, while staying aligned with the active spine.

### Locked authority rule
If any planning detail in this document conflicts with either of the following:

- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

the spine and payments roadmap win.

---

## 2. Current platform baseline

The current operational platform remains valid and live.

This roadmap does not replace that foundation.  
It extends it.

### Existing truths remain intact
- `job_events` = narrative / operational truth
- `ecc_test_runs` = technical truth
- `jobs.ops_status` = operational projection
- `jobs` = visit execution truth
- `service_cases` = continuity truth

### Locked relationship rules
- **Job** = work / visit record
- **Visit Scope** = operational work scope for a specific visit/job
- **Service Case** = problem / continuity container
- **Estimate** = proposed commercial scope
- **Invoice** = billed commercial scope
- **Payment** = money collected against an internal invoice, when payment capability exists

### Locked rule
Business-layer modules must not collapse, overwrite, or blur operational ownership boundaries.

Visit Scope is an operational layer under the job/visit model, not a billing record.
Invoice line items remain billed truth and must not be treated as the primary visit/work-definition layer.

---

## 3. Business-layer scope

This roadmap covers future planning for:

- Pricebook
- Estimates
- Internal invoicing
- Billing/reporting structure
- Company billing modes
- Business-layer rollout rules
- Optional accounting sync context

This roadmap does **not** own payment-execution architecture.

Payment-execution direction is governed by:

- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

### Payment expectation (locked)
Yes — **Stripe is now the future payment expectation**.

That means:
- future payment acceptance should follow the Stripe-first direction defined in the payments roadmap
- QBO remains optional and downstream only
- this document should not redefine payment architecture independently

---

## 4. Company billing modes (locked)

A company must operate in one of two billing modes:

### 4.1 External Billing
The company uses Compliance Matters for operations, but bills outside the platform.

Supported behavior:
- current `Invoice Sent` workflow remains valid
- no internal invoice records
- no internal payment records
- billing is tracked only at the lightweight action level

### 4.2 Internal Invoicing
The company uses Compliance Matters as its billing system.

Supported behavior:
- internal invoice records
- invoice line items
- invoice/reporting workflows
- later payment support when that capability is introduced under the payments roadmap

### 4.3 Locked rule
A company is either **in** or **out** of internal invoicing.

Do not support half-use inside one live company workflow, because it corrupts reporting meaning.

---

## 5. Current starter closeout layer (locked clarification)

The current system already supports lightweight billing-action tracking through the existing **Invoice Sent** behavior.

This is a valid and supported live workflow.

### Meaning
- `Invoice Sent` is a lightweight billing-action tracker
- it does **not** mean a full internal invoice record exists
- it remains first-class for **external-billing** companies

### Locked rule
Current invoice-sent behavior remains the lightweight billing-action layer.

Future internal invoicing is a richer optional module layered on top, not a replacement that invalidates the current workflow.

### Implemented repo truth clarification
Current implemented repo truth is still job-level closeout and lightweight invoice-action tracking, not a full internal invoice domain.

For current live workflows:
- `Invoice Sent` remains the lightweight billing-action path for external-billing companies
- `jobs.invoice_complete` remains an operational closeout marker
- neither `Invoice Sent` nor `jobs.invoice_complete` means that a full internal invoice record exists

Completed billing hardening slices for the current stabilized baseline:
- the external-billing split-brain closeout seam was corrected narrowly
- the supported `Mark Invoice Sent -> Closed` path now writes the lightweight billed-truth marker before supported closeout
- billing-truth read-side normalization is complete for current closeout/report/dashboard/ops surfaces: internal-invoicing readers derive billed truth from the internal invoice domain, while external-billing readers preserve lightweight job-level invoice-action meaning
- invoice-required counter/label normalization is complete for the current stabilized surfaces: invoice-required metrics and messaging now derive from billing-aware invoice-needed truth rather than raw `jobs.ops_status = invoice_required`
- external-billing secondary-field unification is complete for the supported lightweight completion paths: `data_entry_completed_at` is aligned across those supported paths, while `invoice_number` remains intentionally owned by the explicit data-entry path rather than being invented by lightweight action buttons
- internal-invoicing workflow and invoice-record truth ownership were intentionally left unchanged

Intentionally deferred after these completed slices:
- any broader dashboard/report expansion beyond the completed billing-aware normalization already shipped
- any payment-execution behavior

### Locked seam rule
- jobs remain operational closeout truth
- invoices become billed truth for internal-invoicing companies
- payments remain later collected truth and must not become job billing truth

---

## 6. Company profile / business identity

Company profile / internal business identity is considered complete enough to support business-layer planning.

This means future:
- pricebook
- estimates
- invoices
- templates
- reporting

may rely on company context as the business-facing identity foundation.

### Locked rule
Company profile is not the next unresolved model decision in this roadmap.

---

## 7. Pricebook v1 (planned)

### Purpose
Pricebook is the reusable catalog of billable items.

It feeds:
- estimates
- invoices later
- future reporting by item/category

### Pricebook item ownership
Pricebook owns reusable definitions, not transactional history.

### Required fields
- item_name
- item_type
- category
- default_description
- default_unit_price
- is_active

### v1 item types
- service
- material
- diagnostic
- adjustment

### Starter catalog rule
Pricebook launches with a starter/default set of common items.

Each company must be able to:
- add items
- expand categories
- deactivate items
- customize its own working catalog over time

### Historical integrity rule
Changing pricebook later must not mutate historical estimates or invoices.

Inactive items remain visible historically where already used, but cannot be newly selected.

---

## 8. Service V1 baseline

Service Contract V1 is already implemented and remains subordinate to the active spine.

Milestone-1 closeout status:
Service model buildout is now closed as prerequisite foundation.

The current baseline for Service is:
- `service_cases.case_kind` is structured case classification
- `jobs.service_visit_type`, `jobs.service_visit_reason`, and `jobs.service_visit_outcome` are the current visit-level Service fields
- follow-up continuity is carried through shared `service_case_id`
- parent/child lineage must remain inside one service case

Closed milestone-1 baseline also includes:
- relationship-aware internal intake V1
- Visit Scope as the job-owned operational scope layer
- ECC optional vs Service required Visit Scope behavior
- ECC companion-scope promotion into real Service jobs
- promoted-companion read-only visibility on internal scan surfaces
- internal Job Title demotion with derived stored titles preserved
- milestone-1 write-path reliability cleanup for the live `jobs.updated_at` mismatch

### ECC rule
ECC / Title 24 intake may remain defaulted/standardized as its own structured workflow family.

### Locked rule
This roadmap does not reopen Service Contract V1 design.

Future business-layer planning in this document must build on the existing Service baseline for commercial workflows, reporting, and consistency.

Billing / invoice workflow is now complete enough to move forward for the current milestone-2 scope.

That achieved milestone-2 baseline includes:
- job-linked internal invoice workflow
- reviewable draft invoice behavior
- issue/send invoice behavior
- resend as a communication action on the same invoice record
- operator-facing invoice communication tracking/history

Bare-bones invoice email content/presentation is acceptable for this milestone boundary; email formatting/content polish remains deferred refinement work.

Reporting / analytics is no longer the active incomplete milestone.

The next active major roadmap item after this achieved milestone-2 baseline and reporting completion is RLS completion / permission hardening, followed later by business-layer modules in this document.

Completed RLS / permission hardening slice for the current stabilized baseline:
- customer/location internal account-owner reconciliation is complete
- jobs and service_cases were already ahead on account-owner-aware internal scope; customers and locations have now been reconciled to that same internal account-owner model for internal same-account teammates
- validated passed for customer list, customer detail, internal `/jobs/new` guided lookup, and location detail for non-owner internal teammates
- customer/location visibility no longer depends primarily on admin/manual scope reconstruction for those internal reads
- contractor customer/location visibility remains constrained, read-only, and job-derived
- notifications internal-awareness write-path hardening is also complete
- notifications remain account-owner-scoped for internal awareness
- the generic `42501 -> service-role` fallback was removed from the internal awareness notification write path
- contractor-originated or mixed-context internal awareness notifications now use one explicit, policy-aligned write contract
- internal notification read boundaries remain internal-only; contractors still do not get direct read access to internal notifications
- no role redesign, support-access model, payment work, billing work, or broader notifications UX/polish work was part of these slices

What this completion does not mean:
- it does not mean RLS completion / permission hardening is finished overall
- it does not mean contractor notifications were introduced
- it does not mean support-access modeling is complete
- it does not mean role redesign was done
- it does not mean payment/billing/security work outside this seam was done

The next active major roadmap item remains RLS completion / permission hardening until the broader hardening milestone is actually closed.

Older archived Service planning docs are historical only and remain subordinate to the active spine and this active roadmap.

---

## 9. Estimate v1 (planned)

### Purpose
Estimate is the proposed commercial scope for solving a problem.

### Estimate ownership
Estimate belongs to:
- customer
- location
- service_case

It does not belong only to a job by default, because jobs are visits and estimates describe broader commercial scope.

### Required fields
- estimate_number
- customer_id
- location_id
- service_case_id
- status
- title_or_summary
- subtotal
- total
- created_at

### Useful early fields
- notes
- sent_at
- approved_at
- declined_at

### v1 statuses
- draft
- sent
- approved
- declined

### Estimate line item rule
Estimate line items are frozen quoted snapshots.

Required line-item fields:
- estimate_id
- sort_order
- source_pricebook_item_id optional
- item_name_snapshot
- description_snapshot
- item_type_snapshot
- quantity
- unit_price
- line_subtotal

### Locked rule
If the pricebook changes later, old estimates do not change.

---

## 10. Approved estimate flow (planned)

### Core rule
An approved estimate does not directly become a job by default.

Instead:
1. estimate is approved
2. approved scope becomes authorized scope under a service case
3. ops schedules one or more jobs under that case
4. jobs execute the work as visits

### Service-case behavior
- if no service case exists, approval creates one
- if a service case exists, approval updates/attaches authorized scope under it

### Locked rule
Approved estimate → service case/business scope first, then jobs/visits under it.

---

## 11. Invoice sourcing rules (planned)

### Core rule
Invoice line items must come from a defined source, then become frozen billing records.

When invoice sourcing comes from job execution, the operational source is completed visit scope.
Internal invoicing remains downstream of visit execution and must not define visit scope itself.

### Allowed source paths
- approved estimate scope
- completed visit scope
- manual office-created billing scope

### Default sourcing hierarchy
1. approved estimate scope, if present
2. completed visit scope, if no approved estimate exists
3. manual office creation, if neither applies or override is needed

### Non-estimated additions
Office may add non-estimated items to invoices.

Those additions must not silently rewrite the estimate.

### Locked rule
Estimate = proposed scope.  
Invoice = billed scope.

They may overlap heavily, but they are not the same record.

Completed visit scope may feed invoice creation later, but invoice line items remain frozen billed snapshots rather than the primary operational work-definition layer.

---

## 12. Internal invoice v1 (planned)

### Purpose
Invoice is the internal commercial billing record when a company is in internal invoicing mode.

### Default relationship rule
One job may have **one primary invoice by default**.

The architecture must not assume that is the only possible future shape forever.

### Required fields
- invoice_number
- company_id
- customer_id
- location_id
- job_id
- service_case_id optional but preferred
- status
- invoice_date
- issued_date nullable until issued
- subtotal
- total
- notes optional

### Useful early fields
- source_type (`estimate`, `job`, `manual`)
- source_estimate_id optional
- voided_at optional
- void_reason optional

### V1 workflow scope
Internal Invoice V1 explicitly includes:
- job-linked invoice first
- reviewable draft invoice before issuance
- job/customer/location prefill into the draft invoice
- issue/send invoice from the job-linked invoice record
- resend as a communication action, not a second invoice
- invoice communication tracking/history owned by the invoice workflow
- source-path compatibility for approved estimate scope, completed job/visit scope, and manual office-created billing scope
- paid-state planning in the invoice roadmap, without implying live processor execution in this phase

### Current milestone-2 baseline status
This invoice/billing workflow is now complete enough to move forward for the current milestone-2 scope.

Achieved baseline at this milestone includes:
- invoice review before issuance
- invoice issue/send behavior
- resend behavior as a communication action
- invoice communication tracking/history at the job-linked invoice layer
- closeout alignment around billed truth for internal-invoicing mode

Deferred refinement still remaining:
- invoice email content/design polish
- broader presentation refinements that do not change billed truth, closeout ownership, or payment boundaries

### Invoice communication seam
Invoice communication tracking is an invoice-owned communication seam, not payment execution.

It should support at least:
- sent
- resent
- failed
- recipient
- last sent at
- delivery/error note if available
- honest attempt tracking rather than fake guaranteed-delivery claims

This seam must not be read as introducing Stripe checkout, live card/ACH collection, refunds/disputes, contractor payouts, QBO sync, or any other live payment-execution behavior.

### v1 statuses
- draft
- issued
- void
- paid (planned later under payment tracking, not the initial invoice-closeout seam)

### Locked rule
Sourcing creates drafts.  
Issuance makes the invoice real.

For Internal Invoice V1, `issued` is the billing-satisfied boundary for operational closeout. `paid` remains part of invoice-state planning, but belongs to later payment-tracking truth rather than the initial invoice-closeout seam.

### Invoice line items
Invoice line items are frozen billing snapshots.

Required line-item fields:
- invoice_id
- sort_order
- source_pricebook_item_id optional
- source_estimate_line_item_id optional
- item_name_snapshot
- description_snapshot
- item_type_snapshot
- quantity
- unit_price
- line_subtotal

### Locked rule
Once created, invoice line items do not live-sync back to estimate, job, or pricebook.

Pricebook-backed items are the preferred/default future path for invoice creation, but invoice line items remain frozen billed snapshots once created.

### Closeout seam clarification
Internal Invoice V1 must not create a second billing truth on jobs.

For internal-invoicing companies:
- the primary job-linked invoice is billed truth
- `jobs.invoice_complete` remains an operational closeout projection
- `jobs.invoice_complete` may be satisfied by invoice issuance, but it is not itself the invoice record

For external-billing companies:
- the current lightweight `Invoice Sent` / closeout behavior remains the billing-action path
- no internal invoice record is required

---

## 13. Field invoice finalization rules (planned)

### General principle
Techs may participate in job-linked invoicing when company workflow allows it.

This is especially important for field-only or small operations without dedicated office staff.

### Techs may be allowed to
- open the draft invoice tied to their job
- review existing line items
- add job-linked invoice items in the field
- adjust quantity
- send/finalize the invoice
- later collect payment if/when live payment capability exists under the payments roadmap
- send invoice/receipt to the customer

### Guardrails
- pricebook-backed additions are the preferred/default path
- custom one-off items should be permission-controlled
- unrestricted price override should not be default
- field-added or field-modified billing items should be attributable to the acting user

### Locked rule
Field invoice finalization is allowed, but field invoice administration is not broad by default.

---

## 14. Payments relationship note (subordinate to payments roadmap)

This roadmap does not define payment processor architecture.

That direction is owned by:
- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

### Business-layer meaning of payments
For business-layer planning purposes:
- payment = money collected against an internal invoice
- one invoice may have many payments
- reporting must distinguish billed truth from collected truth
- payment behavior must respect company billing mode

### Locked rule
Do not use this document to override:
- Stripe-first future payment direction
- QBO optional-only rule
- payment-ready-now / payment-active-later architecture
- small configurable platform-fee support

Those belong to the payments roadmap.

---

## 15. Billing permissions (planned)

### Office/Admin
- full invoice management
- create/edit draft invoices
- issue invoices
- void invoices
- manage broader billing administration
- later manage payment correction flows if/when payment capability exists

### Tech
May be allowed, depending on company workflow/settings:
- access job-linked draft invoice
- add/adjust permitted line items
- send/finalize job-linked invoice
- later collect payment if enabled by company workflow and payment capability

Techs do **not** broadly administer company-wide billing by default.

### Contractor
No ownership of internal invoice/payment records.

---

## 16. Reporting and tracking principles (planned)

### Reporting families
Reporting must be split into:
- operational reporting
- commercial reporting
- collection reporting
- continuity/service-quality reporting

### Owner discipline
- jobs / ops_status = operational truth
- service_cases = continuity truth
- estimates = quoted truth
- invoices = billed truth
- payments = collected truth when payment capability exists
- job_events = audit/activity truth

### Mode-aware reporting rule

#### External-billing companies
Valid:
- invoice action taken/not taken
- billing follow-up visibility

Not valid:
- internal invoice totals
- payment collection reports
- internal receivables reporting

#### Internal-invoicing companies
Valid:
- draft/issued/paid/void invoice reports
- outstanding balances
- payments collected when payment capability exists
- collected by tech/user
- payment method reporting when payment capability exists

### No mixed-meaning bucket rule
Do not combine these into one ambiguous metric:
- no billing action yet
- billed externally
- internal invoice drafted
- internal invoice issued
- payment outstanding
- payment complete

### Snapshot rule
Historical reporting must read frozen transactional snapshots, not today’s mutable pricebook definitions.

### Current implemented reporting baseline (achieved)

Reporting / analytics now has a real Report Center baseline and is no longer only planning-level direction.

Current implemented baseline includes:
- Dashboard as the default internal reporting entry
- Jobs Report for visit-level operational reporting
- Service Cases Report for continuity/service-quality reporting
- Closeout Report for visit-owned closeout/follow-up backlog reporting
- Invoices Report for billed-truth internal invoice reporting where internal invoicing mode is active
- CSV export support on the report-family ledgers
- dashboard drill/export behavior that reuses existing ledgers where that is the honest source
- KPI Reference retained as lower-priority internal scaffolding rather than a primary product destination

Locked boundary:
- Reporting still must stay split by family and owner truth.
- Operational truth, billed truth, and collected truth must not be collapsed into one ambiguous reporting surface.
- Invoice reporting may surface billed truth where real internal invoice records exist.
- Collection/payment reporting remains later and must not be implied before payment truth materially supports it.

---

## 17. Optional accounting sync seam (planning only)

Compliance Matters must remain usable as a standalone system.

### Locked rule
QBO remains optional and downstream.

### Meaning
Future accounting sync may later include:
- exported/synced customer mappings
- synced invoice mappings
- synced payment mappings
- reconciliation status / sync status fields

But:
- QBO is not required for core use
- QBO is not the payment foundation
- QBO is not the source of operational truth

For payment architecture, defer to the payments roadmap.

---

## 18. Rollout and integration guardrails (locked)

### Additive-first rule
Business-layer rollout must be additive first, not replacement first.

### Current closeout protection
Current live closeout behavior remains valid during rollout:
- Invoice Sent
- cert-complete behavior
- existing job closeout logic

Current implemented protection note:
- for external-billing companies, the supported `Invoice Sent` / `Mark Invoice Sent -> Closed` path now satisfies the same lightweight `jobs.invoice_complete` projection required by external-billing closeout before the supported closed path is reached
- for internal-invoicing companies, job-level `invoice_complete` remains only an operational closeout projection and must not compete with invoice-record billed truth
- internal-invoicing closeout/report/dashboard/ops readers must derive billed truth from the invoice record domain, not from lightweight job-level invoice-action markers
- external-billing readers must preserve the lightweight job-level invoice-action meaning and must not pretend an internal invoice record exists
- invoice-required metrics and operator messaging must derive from billing-aware invoice-needed truth, not raw `jobs.ops_status = invoice_required`
- supported lightweight external-billing completion paths now align `data_entry_completed_at`; `invoice_number` remains explicit data-entry-owned input rather than lightweight button-generated data

### Billing-mode-driven exposure
Feature exposure must follow company billing mode.

### No mixed billing truth
Do not let lightweight invoice-action tracking and internal invoice records compete inside one live company workflow.

For internal-invoicing companies, do not let job-level `invoice_complete` compete with invoice record state as separate billing truth. Job closeout may project billing-satisfied state, but the invoice record owns billed truth.

### Historical integrity
Do not fake-backfill historical invoice/payment records just to make reporting look complete.

### Mode switching rule
Switching from external billing to internal invoicing must be explicit and deliberate.

### v1 rollout focus
Internal invoicing rollout should begin with **job-linked invoices**, not broad freeform billing across the system.

### Must-not-regress list
New business modules must not regress:
- current job closeout behavior
- ECC/service distinction
- cert-completion logic
- service case / job ownership model
- operational dashboard truth
- external-billing workflow via current Invoice Sent path

---

## 19. Deferred / later business-layer expansion

Not part of v1 unless explicitly pulled forward:
- due dates / terms
- tax and discount breakdown
- revision/superseded estimate flow
- deposit/progress invoicing
- multiple active invoices per job
- advanced payment correction/reversal tooling
- deeper receivables aging
- membership/maintenance-linked billing
- advanced recurring-service billing
- richer accounting sync behavior

---

## 20. One-line definition

Compliance Matters’ business layer is an **internal-first, mode-aware commercial planning roadmap** built on top of the existing operational platform, where estimates define proposed scope, invoices define billed scope, payments relate to collected money when enabled, and commercial reporting stays clean by respecting ownership boundaries.
