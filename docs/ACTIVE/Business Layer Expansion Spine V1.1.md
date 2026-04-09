# Compliance Matters Software — Business Layer Expansion Spine v1.1

**Status:** DRAFT SOURCE OF TRUTH  
**Purpose:** Define the business/commercial layer that expands the current operational platform without regressing the live workflow.

---

## 1. Purpose

This spine defines the next business-layer expansion of Compliance Matters Software:

- Pricebook
- Estimates
- Internal Invoicing
- Payments
- Business Reporting / Tracking
- Future QuickBooks Online integration seam

This spine is **additive**, not a rebuild.

The current operational platform remains valid and live:
- jobs remain operational work records
- service cases remain continuity containers
- job_events remain narrative truth
- existing closeout behavior remains supported during rollout

---

## 2. Relationship to the Current Platform

The current operational platform is already considered a real working system, not a partial prototype.

This spine does not replace that foundation.

It extends it.

### Locked relationship rules

- **Job** = work/visit record
- **Service Case** = problem / continuity container
- **Estimate** = proposed commercial scope
- **Invoice** = billed commercial scope
- **Payment** = money collected against an internal invoice

These are related, but not the same thing.

---

## 3. Source-of-Truth Expansion Rules

### 3.1 Existing truths remain intact

- `job_events` = narrative / operational truth
- `ecc_test_runs` = technical truth
- `jobs.ops_status` = operational projection
- `jobs` = visit execution truth
- `service_cases` = continuity truth

### 3.2 New business-layer truths

- **pricebook items** = reusable billable definitions
- **estimates** = proposed commercial truth
- **estimate line items** = frozen quoted snapshots
- **invoices** = billed commercial truth
- **invoice line items** = frozen billed snapshots
- **payments** = collected money truth

### 3.3 Locked rule

Business modules must not collapse or overwrite operational ownership boundaries.

---

## 4. Company Billing Modes (Locked)

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
- internal payment records
- invoice and payment reporting
- field or office invoice finalization, depending on permissions/settings

### 4.3 Locked rule

A company is either **in** or **out** of internal invoicing.

Do not support half-use inside one live company workflow, because it immediately corrupts reporting meaning.

---

## 5. Current Starter Closeout Layer (Locked Clarification)

The current system already supports lightweight billing-action tracking through the existing **Invoice Sent** behavior.

This is a valid and supported live workflow.

### 5.1 Meaning

- `Invoice Sent` is a lightweight billing-action tracker
- it does **not** mean a full internal invoice record exists
- it remains first-class for **external-billing** companies

### 5.2 Locked rule

Current invoice-sent behavior remains the lightweight billing-action layer.

Future internal invoicing is a richer optional module layered on top, not a replacement that invalidates the current workflow.

---

## 6. Company Profile / Business Identity (Locked Complete)

Company profile / internal business identity is now considered complete enough to support the next business-layer planning phase.

This means:
- company identity is no longer the next unresolved model decision
- future pricebook, estimates, invoices, templates, and reporting may rely on company context as part of the business layer
- business-layer rollout should use company profile as the company-facing identity foundation

### Locked rule

Company profile is no longer treated as unresolved future design work in this spine.

---

## 7. Pricebook v1 (Locked)

### 7.1 Purpose

Pricebook is the reusable catalog of billable items.

It feeds:
- estimates
- invoices later
- future reporting by item/category

### 7.2 Pricebook item ownership

Pricebook owns reusable definitions, not transactional history.

### 7.3 Required fields

- item_name
- item_type
- category
- default_description
- default_unit_price
- is_active

### 7.4 v1 item types

- service
- material
- diagnostic
- adjustment

### 7.5 Starter catalog rule

Pricebook launches with a starter/default set of common items.

Each company must be able to:
- add items
- expand categories
- deactivate items
- customize its own working catalog over time

### 7.6 Historical integrity rule

Changing pricebook later must not mutate historical estimates or invoices.

Inactive items remain visible historically where already used, but cannot be newly selected.

---

## 8. Service Intake Structure (Planned Refinement)

The current intake flow supports:
- ECC / Title 24 path
- Service path with free-text entry

This remains acceptable for the current operational phase.

However, future service-business modules require more structure on the Service side.

### 8.1 Planned refinement

Service intake should evolve from **free-text-only** into:

- **Service Type** = structured controlled value
- **Service Summary** = free-text description

### 8.2 ECC rule

ECC / Title 24 intake may remain defaulted/standardized as its own structured workflow family.

### 8.3 Why this refinement exists

This planned refinement supports future:
- pricebook suggestions
- estimate defaults
- invoice consistency
- recurring service logic
- cleaner reporting
- better service-case categorization

### 8.4 Locked rule

This is a planned intake refinement, not an immediate intake rebuild.

---

## 9. Estimate v1 (Locked)

### 9.1 Purpose

Estimate is the proposed commercial scope for solving a problem.

### 9.2 Estimate ownership

Estimate belongs to:
- customer
- location
- service_case

It does not belong only to a job by default, because jobs are visits and estimates describe broader commercial scope.

### 9.3 Required fields

- estimate_number
- customer_id
- location_id
- service_case_id
- status
- title_or_summary
- subtotal
- total
- created_at

### 9.4 Useful early fields

- notes
- sent_at
- approved_at
- declined_at

### 9.5 v1 statuses

- draft
- sent
- approved
- declined

### 9.6 Estimate line item rule

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

### 9.7 Locked rule

If the pricebook changes later, old estimates do not change.

---

## 10. Approved Estimate Flow (Locked)

### 10.1 Core rule

An approved estimate does not directly become a job by default.

Instead:
1. estimate is approved
2. approved scope becomes authorized scope under a service case
3. ops schedules one or more jobs under that case
4. jobs execute the work as visits

### 10.2 Service case behavior

- if no service case exists, approval creates one
- if a service case exists, approval updates/attaches authorized scope under it

### 10.3 Locked rule

Approved estimate → service case/business scope first, then jobs/visits under it.

---

## 11. Invoice Sourcing Rules (Locked)

### 11.1 Core rule

Invoice line items must come from a defined source, then become frozen billing records.

### 11.2 Allowed source paths

- approved estimate scope
- completed job scope
- manual office-created billing scope

### 11.3 Default sourcing hierarchy

1. approved estimate scope, if present
2. completed job scope, if no approved estimate exists
3. manual office creation, if neither applies or override is needed

### 11.4 Non-estimated additions

Office may add non-estimated items to invoices.

Those additions must not silently rewrite the estimate.

### 11.5 Locked rule

Estimate = proposed scope.  
Invoice = billed scope.

They may overlap heavily, but they are not the same record.

---

## 12. Internal Invoice v1 (Locked)

### 12.1 Purpose

Invoice is the internal commercial billing record when a company is in internal invoicing mode.

### 12.2 Default relationship rule

One job may have **one primary invoice by default**.

The architecture must not assume that is the only possible future shape forever.

### 12.3 Required fields

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

### 12.4 Useful early fields

- source_type (`estimate`, `job`, `manual`)
- source_estimate_id optional
- voided_at optional
- void_reason optional

### 12.5 v1 statuses

- draft
- issued
- paid
- void

### 12.6 Locked rule

Sourcing creates drafts.  
Issuance makes the invoice real.

### 12.7 Invoice line items

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

### 12.8 Locked rule

Once created, invoice line items do not live-sync back to estimate, job, or pricebook.

---

## 13. Field Invoice Finalization Rules (Locked)

### 13.1 General principle

Techs may participate in job-linked invoicing when company workflow allows it.

This is especially important for field-only or small operations without dedicated office staff.

### 13.2 Techs may be allowed to

- open the draft invoice tied to their job
- review existing line items
- add job-linked invoice items in the field
- adjust quantity
- collect payment
- send/finalize the invoice
- send paid invoice/receipt to the customer

### 13.3 Guardrails

- pricebook-backed additions are the preferred/default path
- custom one-off items should be permission-controlled
- unrestricted price override should not be default
- field-added or field-modified billing items should be attributable to the acting user

### 13.4 Locked rule

Field invoice finalization is allowed, but field invoice administration is not broad by default.

---

## 14. Payment v1 (Locked)

### 14.1 Purpose

Payment is the record of money collected against an internal invoice.

### 14.2 Required fields

- payment_id
- invoice_id
- amount_collected
- date_collected
- collected_by_user_id
- payment_method

Strongly recommended:
- reference_number optional
- notes optional

### 14.3 Payment methods

- cash
- check
- card
- digital
- other

Method rules:
- check should support check number in `reference_number`
- digital may store reference/transaction ID
- card may later store a reference if needed

### 14.4 Relationship rule

One invoice may have many payments.

One payment belongs to one invoice.

### 14.5 Derived payment state rule

User enters amount collected.  
System derives:
- unpaid
- partial
- paid

Based on:
- invoice total
- cumulative payments recorded against the invoice

### 14.6 Locked rule

A structured payment record requires an internal invoice record.

No payment records in external-billing mode.

---

## 15. Billing Permissions (Locked)

### 15.1 Office/Admin

- full invoice management
- create/edit draft invoices
- issue invoices
- void invoices
- record and correct payments
- manage broader billing administration

### 15.2 Tech

May be allowed, depending on company workflow/settings:
- access job-linked draft invoice
- add/adjust permitted line items
- collect payment
- send/finalize job-linked invoice
- send paid invoice/receipt

Techs do **not** broadly administer company-wide billing by default.

### 15.3 Contractor

No ownership of internal invoice/payment records.

---

## 16. Reporting and Tracking Principles (Locked)

### 16.1 Reporting families

Reporting must be split into:
- operational reporting
- commercial reporting
- collection reporting
- continuity/service-quality reporting

### 16.2 Owner discipline

- jobs / ops_status = operational truth
- service_cases = continuity truth
- estimates = quoted truth
- invoices = billed truth
- payments = collected truth
- job_events = audit/activity truth

### 16.3 Mode-aware reporting rule

Reports must respect company billing mode.

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
- payments collected
- collected by tech/user
- payment method reporting

### 16.4 No mixed-meaning bucket rule

Do not combine these into one ambiguous metric:
- no billing action yet
- billed externally
- internal invoice drafted
- internal invoice issued
- payment outstanding
- payment complete

### 16.5 Snapshot rule

Historical reporting must read frozen transactional snapshots, not today’s mutable pricebook definitions.

---

## 17. Future QBO Seam (Locked Planning Direction)

### 17.1 Product rule

Compliance Matters must remain usable as a standalone system.

QBO is a **future optional integration seam**, not a requirement.

### 17.2 External target

Future accounting/billing integration planning is modeled around **QuickBooks Online** as the single chosen external provider direction.

### 17.3 Internal-first rule

Internal workflow remains canonical.

QBO later becomes:
- sync/export target
- optional integration layer
- never the owner of operational truth

### 17.4 Future placeholder fields

Not required now, but future planning may include:
- qbo_customer_id
- qbo_estimate_id
- qbo_invoice_id
- qbo_sync_status
- qbo_last_synced_at
- qbo_last_error

---

## 18. Rollout and Integration Guardrails (Locked)

### 18.1 Additive-first rule

Business-layer rollout must be additive first, not replacement first.

### 18.2 Current closeout protection

Current live closeout behavior remains valid during rollout:
- Invoice Sent
- cert-complete behavior
- existing job closeout logic

### 18.3 Billing-mode-driven exposure

Feature exposure must follow company billing mode.

### 18.4 No mixed billing truth

Do not let lightweight invoice-action tracking and internal invoice records compete inside one live company workflow.

### 18.5 Historical integrity

Do not fake-backfill historical invoice/payment records just to make reporting look complete.

### 18.6 Mode switching rule

Switching from external billing to internal invoicing must be explicit and deliberate.

### 18.7 v1 rollout focus

Internal invoicing rollout should begin with **job-linked invoices**, not broad freeform billing across the system.

### 18.8 Must-not-regress list

New business modules must not regress:
- current job closeout behavior
- ECC/service distinction
- cert-completion logic
- service case / job ownership model
- operational dashboard truth
- external-billing workflow via current Invoice Sent path

---

## 19. Deferred / Later Business-Layer Expansion

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
- richer QBO sync behavior

---

## 20. One-Line Business Layer Definition

Compliance Matters’ business layer is an **internal-first, mode-aware commercial system** built on top of the existing operational platform, where estimates define proposed scope, invoices define billed scope, payments define collected money, and reporting stays clean by respecting ownership boundaries.