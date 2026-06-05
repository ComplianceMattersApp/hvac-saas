# Compliance Matters Workflow Modernization B7-H Supplemental / Add-On Invoice Audit

## 1. Status / Authority / Scope

Status: ACTIVE MODEL AUDIT / MODEL LOCK CANDIDATE

Authority: Subordinate to:
- `docs/ACTIVE/Workflow_Modernization_B7E_Field_Payment_Collection_Reconciliation_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B7A_Authorized_Field_Invoice_Mode_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B6_Field_Billing_Proposal_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `docs/ACTIVE/Workflow_Modernization_B0_Ownership_Matrix.md`
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

Scope: docs/audit/model only. This slice evaluates the safe model for supplemental or add-on invoice behavior after an original invoice has already become issued or paid commercial truth.

This slice authorizes no product code changes, no schema changes, no migrations, no Supabase writes, no Stripe/provider changes, no payment behavior changes, no invoice mutation changes, no invoice issue/send changes, no Collect Payment changes, no check/cash/other report UI, no reconciliation queue implementation, no `FieldOutcomePanel` changes, no return/callback changes, and no SMS/QBO changes.

## 2. Executive Summary

The current system is intentionally built around invoice immutability after billed and payment truth exists.

Current implementation facts:
- the main invoice resolver is job-scoped and assumes one active non-void invoice per job
- issued invoices are treated as frozen billed truth
- paid and balance projections are derived from invoice-bound payment truth
- card truth is still processor/webhook-led
- non-card truth is still office-verified under the B7-E model

Because of those boundaries, the safest model for post-issue or post-payment added revenue is not editing the original invoice. The safest model is a new supplemental invoice that preserves the original invoice and payment history as historical truth.

Recommended lock:
- original paid invoice remains immutable except separate high-trust correction flows already limited elsewhere
- supplemental invoice is a new invoice record, not a mutation of the original invoice
- supplemental invoice starts as draft invoice truth
- supplemental invoice may be linked to the original invoice, same job, same customer, and same service case when that continuity exists
- supplemental invoice must still be issued before collection
- payment truth for supplemental invoices follows the same existing model as any other invoice: card via Stripe/webhook truth; check/cash/other via report plus office verification

## 3. Business Problem

Real field and office workflows do not end the moment an invoice is paid.

Common real-world cases:
- technician forgot a charge
- customer adds warranty coverage after payment
- customer adds a service plan after payment
- customer chooses another repair or upsell after the original payment
- office or owner catches an omitted charge after invoice issue or payment

The system needs a safe way to collect another commercial amount without corrupting:
- the original billed record
- the original payment history
- the original allocation and register truth
- the original customer communication trail

Core problem statement:

Once an invoice has been issued or paid, new commercial scope is no longer just “edit the old invoice.” It is either:
- true correction of the original billed truth, which is high-trust and narrow
- or new/additional revenue, which should become a separate supplemental invoice

## 4. Original Invoice Immutability Rule

Recommended lock:
- draft invoice = still editable commercial draft truth
- issued invoice = customer-facing billed truth and should be treated as frozen for ordinary add-on behavior
- partially paid invoice = must not have its original totals mutated for ordinary add-on behavior because payment history and allocation context already exist against that invoice
- paid invoice = must remain immutable for ordinary add-on behavior
- void invoice = historical void truth and must not become the base for new add-on billing

Implication:
- paid invoices should not be mutable for ordinary supplemental/add-on work
- partially paid invoices should also be treated as immutable for ordinary add-on work
- issued unpaid invoices should generally remain immutable for net-new add-on scope once they are customer-facing billed truth

Recommended correction boundary:
- true mistakes in the original invoice remain a separate correction/admin lane
- net-new work, upsell, post-payment service-plan sale, and omitted-but-now-billed add-on revenue should not rewrite original invoice history

## 5. Supplemental / Add-On Invoice Model

Recommended model:
- supplemental invoice is a new internal invoice record
- it is linked commercially to an original invoice when it represents added revenue after the original invoice context already exists
- it starts as a draft invoice
- it uses the same line-item model as existing draft invoices
- it becomes collectible only after normal issue/send/payment readiness gates are satisfied

Recommended usage cases:
- forgotten charge discovered after issue/payment
- customer-requested extra work added after issue/payment
- post-visit upsell that belongs to the same job/service-case continuity
- warranty add-on or extended coverage sale when sold after the original invoice is already closed or paid
- service plan sale added after the original invoice, while preserving future service-plan billing-period foundations separately

Recommended non-usage cases:
- do not use supplemental invoice to edit a still-draft invoice; just edit the draft
- do not use supplemental invoice to repair a bad invoice when void/recreate or future explicit correction flow is the real intent
- do not use supplemental invoice for unrelated future work that should instead become a new job/work unit and its own billing context

## 6. Relationship to Job / Customer / Service Case

Recommended continuity lock:
- supplemental invoice should belong to the same `job_id` by default when the added revenue is truly part of the same visit/work context
- supplemental invoice should inherit the same `customer_id`
- supplemental invoice should inherit the same `service_case_id` when the work still belongs to the same service-case continuity

Why same-continuity linkage is preferred:
- original and supplemental revenue remain grouped to the same service event/history
- office and billing can see total commercial outcome for the same visit chain
- payment reporting can separate invoice rows while still aggregating by job/service case when needed

Recommended exception posture:
- if the added work is operationally a new visit or new business event, it should create a new job and normal invoice rather than piggybacking on supplemental linkage

## 7. Relationship to Original Invoice

Recommended linkage:
- supplemental invoice should link to the original invoice explicitly
- the original invoice link should be read as “commercial parent/origin reference,” not payment-allocation truth
- original invoice should remain readable without being rewritten by the supplemental invoice

Recommended first relationship fields conceptually:
- original invoice id reference
- supplemental/add-on classification on the new invoice
- optional reason/category such as forgotten charge, upsell, warranty add-on, service plan sale, or extra work

Recommended display behavior later:
- original invoice should show read-only linked supplemental invoices
- supplemental invoice should show the original invoice reference and reason
- neither direction should imply merged totals or retroactive payment mutation

## 8. Permission Model

Recommended permission split:
- creating a supplemental invoice is invoice-truth creation authority, not proposal-only authority
- issuing/sending a supplemental invoice remains separate from creating the draft
- collecting payment on the supplemental invoice remains separate from creating or issuing it

Recommended allowed actors:
- Owner/Admin/Billing can create supplemental draft invoices by default
- explicitly trusted field users may create supplemental draft invoices only when they already hold direct invoice draft authority and a future explicit supplemental/add-on permission or policy enables that path

Recommended blocked-by-default actors:
- proposal-only field users must not create supplemental invoice truth directly
- technicians without direct invoice authority must not create supplemental invoice truth directly
- contractor/portal users do not create supplemental invoice truth

Critical separation lock:
- supplemental draft authority does not automatically grant issue/send authority
- supplemental draft authority does not automatically grant payment collection authority
- supplemental draft authority does not automatically grant reversal/refund/export/correction authority

## 9. Field User Behavior

Recommended field-user posture:
- trusted direct-invoice field users may create a supplemental draft invoice when net-new added revenue appears after original invoice issue/payment and company policy allows it
- field users should not reopen or rewrite the original paid invoice
- field users may later collect payment on the supplemental invoice only if they separately hold allowed B7-E collection authority and only after the supplemental invoice is issued

Recommended examples:
- customer adds another repair after original invoice payment: create supplemental draft invoice if trusted direct-invoice authority exists
- customer buys upsell/warranty/service plan add-on during same continuity: create supplemental draft invoice if that sale belongs to current job/service-case continuity and policy allows direct invoice truth creation

## 10. Proposal-Only User Behavior

Recommended proposal-only posture:
- proposal-only users should submit add-on proposals, not supplemental invoice truth directly
- office/billing/admin may later convert approved add-on proposals into a supplemental draft invoice
- proposal-first users should not bypass the established B6 proposal safety lane merely because the original invoice is already paid

Implication:
- “add-on after payment” does not erase the proposal-vs-direct-authority split
- it only changes the commercial destination from “edit current draft” to “create linked supplemental invoice draft after approval or authority check”

## 11. Invoice Lifecycle and Payment Requirements

Recommended lifecycle:
1. detect new commercial scope after original invoice issue/payment
2. create supplemental invoice draft
3. add or convert approved line items into that draft
4. issue supplemental invoice before collection
5. optionally send supplemental invoice
6. collect against the supplemental invoice using existing payment rules

Recommended state allowance:
- original invoice `paid`: yes, supplemental invoice allowed and preferred
- original invoice `partially_paid`: yes, supplemental invoice allowed and preferred
- original invoice `issued` and unpaid: yes for net-new post-issue add-on behavior, though true correction of the original invoice remains a separate higher-trust lane
- original invoice `void`: no supplemental invoice should attach to a voided commercial parent as the add-on path
- original invoice `draft`: no supplemental invoice needed; edit the draft instead
- closed job: supplemental invoice may still be allowed when it represents true same-job add-on revenue, but it must not silently reopen operational truth or rewrite closeout history

Recommended payment lock:
- supplemental invoice must be issued before collection
- card collection for supplemental invoice remains Stripe/provider/webhook-led
- check/cash/other for supplemental invoice remains reported/verified under B7-E model
- supplemental invoice payment truth must not be created from UI clicks alone

## 12. Reporting / Ledger Visibility

Recommended reporting posture:
- original and supplemental invoices remain separate invoice rows
- original invoice revenue remains historical truth
- supplemental invoice revenue is additional revenue, not retroactive mutation of original revenue
- Payments Register and invoice payment projections remain invoice-bound to the actual invoice that was paid

Recommended later reporting behavior:
- invoice reports can group original plus supplemental invoices by job/service case/family when needed
- finance exports should preserve separate invoice ids and separate payment rows
- original invoice paid status must not absorb supplemental balance due
- supplemental unpaid balance should remain visible independently

Critical ledger boundary:
- payment allocations stay attached to the invoice actually paid
- original invoice payment truth is not reused or stretched to cover supplemental invoice balances
- no merge of payment rows across original and supplemental invoices should occur by default

## 13. Add-On / Upsell Future Lane

Future UI/product lane can safely build on this lock by routing actors based on authority:
- trusted direct-invoice actor -> create supplemental draft invoice
- proposal-only actor -> submit add-on proposal for office/billing review
- non-authorized actor -> direct to office/admin workflow

Recommended future UI posture:
- original paid invoice may expose a read-only “Create Add-On” or “Submit Add-On Proposal” path later, depending role/permission
- original invoice should show supplemental relationship context without pretending the invoices are one merged bill
- service plan and maintenance agreement add-ons must respect future dedicated billing-period and agreement models rather than collapsing those domains into ad hoc invoice mutation

## 14. Recommended Implementation Sequence

Smallest safe sequence:
1. B7-H docs/model lock only
2. additive schema/read-model foundation for supplemental invoice relationship and multi-invoice-per-job continuity
3. resolver/read-path expansion so invoice lists and job/invoice surfaces can handle more than one invoice for the same job safely
4. read-only original/supplemental relationship display in invoice workspace and reports
5. authorized supplemental draft creation action using existing draft-invoice mechanics where possible
6. proposal-to-supplemental conversion path for proposal-only actors
7. issue/send reuse for supplemental invoices
8. payment collection reuse under existing B7-E and current Stripe/webhook truth boundaries

Why this order is safest:
- current code is centered on one active invoice per job via `resolveInternalInvoiceByJobId`
- payment summaries and allocations are invoice-bound
- invoice workspace/read models must learn invoice families before runtime create flows are added

## 15. Risks / Guardrails

Current codebase risks this audit must acknowledge:
- current read paths assume one active invoice per job
- invoice payment summaries and allocation projections are invoice-specific
- issue/send/payment actions are currently job->invoice singular in posture
- invoice numbering currently generates independent invoice numbers and does not model supplemental suffix families

Recommended guardrails:
- do not mutate original paid invoice totals for net-new add-on work
- do not merge supplemental balances into original invoice paid state
- do not suffix canonical invoice numbers as first posture; prefer a new independent invoice number plus original invoice reference
- do not let proposal-only users create supplemental invoice truth directly
- do not allow supplemental invoice on voided parent invoice as the ordinary path
- do not reopen operational job/service-case truth merely because a supplemental invoice exists
- do not attach maintenance agreement or service-plan future domain truth directly to original invoice mutation shortcuts

Numbering recommendation:
- use a new independent invoice number as canonical truth
- optionally show display copy such as “Supplemental to Invoice #2010” in UI later
- reject first-posture canonical suffix numbering such as `2010-A` because current numbering helpers and read paths already expect ordinary invoice identity, and suffix families would create a second numbering system before invoice-family infrastructure exists

## 16. Explicit Non-Actions

This B7-H slice authorizes none of the following:
- no product code changes
- no schema changes
- no migrations
- no Supabase writes
- no Stripe/provider changes
- no payment behavior changes
- no invoice mutation changes
- no invoice issue/send changes
- no Collect Payment changes
- no check/cash/other report UI
- no reconciliation queue implementation
- no `FieldOutcomePanel` changes
- no return/callback changes
- no SMS/QBO changes

## Audit Conclusions

Recommended answers to the audit questions:
- paid invoices should not be mutable for ordinary add-on behavior
- supplemental invoice should be created instead of editing the original whenever new commercial scope appears after the original invoice is already issued/paid or partially paid
- supplemental invoice is allowed for original invoice states `paid`, `partially_paid`, and `issued`; not for `draft` or `void`; closed job allowance is conditional on same-job continuity and must not reopen operational truth
- supplemental invoice should link to original invoice, same job, same customer, and same service case when that continuity exists
- canonical numbering should be a new independent invoice number with original invoice reference, not a suffix as first posture
- trusted direct-invoice field users may create supplemental drafts only when explicitly allowed; proposal-only users should submit add-on proposals instead
- supplemental invoice should reuse existing draft invoice mechanics where practical, but as a new invoice record
- supplemental invoice must be issued before collection
- supplemental invoice payment collection should reuse existing B7-E payment model boundaries