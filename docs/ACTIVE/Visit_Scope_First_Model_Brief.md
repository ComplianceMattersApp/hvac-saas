# Visit Scope First Model — Current Baseline

**Purpose:** Define Visit Scope as the job-owned operational work-definition layer, distinct from billing/invoicing.

## Current status (baseline)

- Service Workflow / Visit Scope Field Experience V1 Slice 1 is complete:
	- Service job detail now uses clearer field-first Work Items guidance.
	- Prior "confirm the work" helper wording was replaced to avoid implying a required validation action.
	- Waiting/Interrupt State copy now clarifies that waiting explains why work is paused and does not replace Work Items / Visit Scope.
	- Create Next Service Visit copy now clarifies service-chain continuation, per-visit Work Items, and no automatic copy-forward.
	- Invoice language remains downstream: Invoice Charges are billed truth; Work Items are operational scope, not billing records.
	- No schema, RLS, lifecycle, billing, payment, estimate, support console, or contractor-authority behavior changed.

- Job detail is already mostly Visit Scope-first.
- A helper line was added to reinforce workflow priority: "Scope first: confirm the work for this visit, then complete closeout and billing."
- A1-A5 Visit Scope -> invoice bridge is production-promoted on main.
- Visit Scope items now use durable IDs for downstream draft-invoice provenance.
- Internal invoice line provenance now supports Visit Scope linkage (`source_kind = visit_scope`, `source_visit_scope_item_id`).
- Draft internal invoice panels can build invoice lines from selected Visit Scope items.
- Visit Scope-sourced draft lines initialize at qty `1.00` and unit price `$0.00`, then require operator review/edit before issue.
- Service intake now requires at least one structured Visit Scope item (summary-only Service scope is rejected).
- ECC optional scope is simplified/lightweight and does not auto-seed blank structured rows.
- ECC companion scope remains allowed.
- Manual and Pricebook draft invoice line adds still coexist with Visit Scope-based draft build.
- Issued/void invoice records remain immutable and hide draft build/edit controls.
- Service / Visit Scope clarity pass is complete for launch-readiness scope:
	- Service job detail now clearly distinguishes Service Details (visit classification) from Visit Scope (trip-owned work definition)
	- Job Title fallback copy is clarified to reduce ambiguity
	- no model, validation, billing, ECC, or RLS behavior changed in this pass
- Service Waiting State V1 is implemented and does not change Visit Scope ownership:
	- Visit Scope / Work Items remain the operational work-item layer for the visit
	- Waiting State is why work is paused/cannot proceed yet, not a replacement for Work Items
	- invoice line items remain downstream billed/commercial truth
	- no Visit Scope copy-forward behavior was added
	- no automatic billing behavior from waiting state was added
- Create Next Service Visit does not replace Visit Scope:
	- Visit Scope remains the work-to-perform definition for each visit/job
	- waiting/interruption state explains why work is paused; it does not replace or defer Visit Scope
	- no Visit Scope copy-forward was added in the service workflow refinement pass
	- waiting state is job-level V1; no Visit Scope model change was introduced
- Invoice remains downstream billed/commercial truth and no billing/payment execution behavior changed in this note.
- Adjacent completed invoice/report polish that preserves this model boundary:
	- invoice panel wording now anchors invoice as billed truth while payment entries remain tracking-only
	- internal invoice void recovery/replacement behavior is in place without changing Visit Scope ownership
	- invoice report labels are clearer (Send Status, Payment Count) with no calculation changes
- Scope vs Line Items / Work Items terminology alignment is complete:
	- operator-facing UI now uses Work Items where users interact with structured Visit Scope
	- free-form context is labeled Reason for Visit / Dispatch Notes
	- billing UI uses Invoice Charges where referring to billed commercial rows
	- internal model remains Visit Scope-first; this was not a schema rename or behavior change
	- contractor-facing request flow was validated after authenticated contractor smoke
- Future service-model work should focus on workflow refinement, not a model rebuild.
- No payment execution, Stripe, QBO, Pricebook seed behavior, or service lifecycle redesign was introduced by A1-A5.

## Canonical language

- Reason for Visit / Dispatch Notes = why we are going
- Work Items = what belongs to this visit
- Estimate Lines = proposed commercial scope
- Invoice Charges = billed commercial truth
- Pricebook Services / Charges = reusable templates/defaults

## 1. Model foundation

Visit Scope defines what the tech needs to do and what scope belongs to this trip. Invoice should remain real and structured, but it should be a downstream commercial layer, not the first thing the tech sees. This fits your existing spine, which keeps jobs as the visit execution unit, service_cases as continuity, and explicitly says ECC and Service must stay separated in actionable relationship decisions.

2. What we learned from HCP and competitors

From the HCP screenshots/video you shared, the job page leads with customer context, visit/workflow progression, and summary of work, while invoice sits as one downstream section. The line-items area behaves like part of the job workflow, not a separate accounting screen.

That pattern also shows up in the broader market:

Housecall Pro’s own job-details materials center the job details page and support progress invoicing as part of the job workflow, not as the first required setup step. Its invoicing docs also describe invoices as pre-filled from job/customer details.
Jobber explicitly says that when an invoice is created from a job, the service dates and service address from the job carry over to the invoice, and some invoice details may already be filled in. That is a strong “job/work first, invoice second” signal.
Workiz treats items and services as reusable line items that can be added to jobs, estimates, and invoices, which is another sign that the reusable work/scope source should not be trapped inside invoice-first UI.
ServiceTitan supports stronger invoice structure, but its office and invoicing materials are more invoice-object-centric, which makes it feel heavier and more office-driven than HCP/Jobber.
Reddit signal points in the same direction: people describe HCP/Jobber as enabling invoicing from the phone right after the job, while ServiceTitan works best when mobile workflow is kept lean and permissions are tightened.

Takeaway: learn the workflow priority from HCP/Jobber/Workiz, not the exact layout. The right priority is: visit/work scope first, invoice second, payment later.

3. Keep ECC and Service as the top-level families

Keep the two intake families:

ECC Test
Service

Do not add a hybrid third job type right now.

That matches the locked spine and current intake rules:

internal /jobs/new is guided
job type is selected before relationship review
ECC and Service must not be blended in actionable relationship decisions
jobs remain visits, not generalized commercial containers.
4. Define “visit scope” vs “invoice line item”

This is the key model distinction.

Visit scope item

Operational/workflow object
Tells the tech why they are there and what they should do on this visit
Lives at the job/visit layer
Exists for both external-billing and internal-invoicing companies
May later drive invoice creation, but is not itself billing truth

Invoice line item

Commercial/billing object
Frozen billing snapshot
Lives at the invoice layer
Exists only when billing is happening
Should continue to follow your roadmap rule that invoice line items are frozen records sourced from defined inputs.

So the model should be:

Job = visit
Visit scope item = what the tech is there to do
Invoice line item = what the customer is being billed for later

That also fits the current business roadmap, which already says estimates are proposed scope, jobs are visits, and invoices are billed scope.

5. ECC + Service recommendation

Use an ECC-first with companion scope rule.

If the visit is fundamentally an ECC visit, let it remain an ECC job so the full ECC engine/workspace is available. Then allow companion visit-scope items under that ECC visit for same-trip service work.

Example:

ECC duct leakage test
Dryer vent cleaning
Replace float switch if needed

But do not make “job = line item,” and do not create a hybrid ECC+Service job type.

Instead, use this promotion rule:

A companion service scope item stays inside the ECC visit only while it is same-visit work.
Promote it into a real Service job if:

a part is missing
a return trip is needed
separate scheduling is needed
separate assignment/follow-up is needed
it becomes its own service lifecycle thread

That preserves ECC engine clarity and still gives you field simplicity. It also aligns with the spine’s current treatment of linked follow-up and the principle that once a newer operative linked record exists, older items should not remain the active operational unit.

6. Intake implications
Internal intake

Add a Visit Scope step or section to internal intake after the core job family is chosen.

Internal intake should capture:

main family: ECC or Service
why the visit exists
scope items/work items for the visit
enough detail for tech instruction

This fits your existing guided internal flow better than putting billing/invoice setup first. The current guided flow already resolves customer/location first, then job setup/details, then scheduling/billing. A scope-first addition belongs in the job-setup/details part, not as an invoice-first step.

Contractor intake

Keep contractor intake constrained.

Contractors should still submit:

requested work
requested scope
notes/photos/context

But contractor-submitted scope should remain requested operational scope, not commercial truth. Internal users can later turn that into true visit scope, paired jobs, or invoice lines when appropriate. That stays consistent with your current contractor-intake boundary and role separation.

7. Invoice sourcing implications

With the production baseline, visit-scope-first invoice sourcing now exists for draft internal invoices:

- selected Visit Scope items can become draft invoice candidates directly in the job invoice panel
- selected items create draft invoice lines with conservative defaults (qty `1.00`, unit `$0.00`) for operator review/edit
- provenance is now durable and traceable through Visit Scope linkage fields
- automatic billing is not implemented; operator review/issue remains required

Invoice still remains a downstream commercial action:

For internal-invoicing companies, invoice lines source from:
approved estimate scope if present
completed job scope if no approved estimate exists
manual office creation as fallback

Pricebook-backed drafting should stay aligned to that boundary:

- reusable Pricebook entries may prefill defaults into draft Estimate Lines or draft Invoice Charges
- those draft transactional rows remain editable records owned by the estimate/invoice workflow, not live catalog pointers
- Visit Scope / Work Items remain the operational layer and should not be renamed into commercial truth
- Estimate Pricebook Editable Defaults V1 is complete for draft estimate pre-add behavior: selected Pricebook values now prefill editable estimate draft fields before add while preserving `source_pricebook_item_id` provenance; this did not change Visit Scope ownership, invoice behavior, or post-add estimate editing.
- Work Item-first Invoice Builder Clarity V1 is complete as copy/UX-only polish on draft internal invoice panel: Work Item import is now explicitly presented as the recommended path when Work Items exist, helper copy now states Work Items already captured for the visit can become draft Invoice Charges for review/edit before issue, boundary copy now explicitly preserves operational-vs-billed truth, and Pricebook add remains available as secondary/fallback.
- This slice did not change Work Item-to-invoice transfer mechanics (`source_kind = visit_scope`, `source_visit_scope_item_id` preserved, default `quantity = 1.00`, default `unit_price = 0.00`) and did not change manual line behavior, issue/send/payment behavior, Visit Scope behavior, Pricebook behavior, estimate behavior, Stripe tenant payment behavior, or QBO behavior.
- Work Item Import Defaults Clarification V1 is also complete as copy/UX-only polish on the same draft internal invoice panel: the Work Item import area now explicitly states the current conservative defaults with helper copy, `Imported Work Items start as draft Invoice Charges with Qty 1.00 and Unit Price $0.00. Review and edit pricing before issuing.`
- This clarification reinforces the locked boundary without changing mechanics: Work Items remain the operational work record, imported Work Items become draft Invoice Charges, Invoice Charges remain reviewed/edited billed copies before issue, no automatic pricing or Pricebook text matching was introduced, and no persisted Work Item provenance was added.
- Invoice Panel Hierarchy Polish V1 is complete as copy/layout-only refinement on the same draft internal invoice panel (`2cc5d58`): Work Item import now appears before `Add From Pricebook`, Work Item import remains the clear recommended path, `Add From Pricebook` now reads as a fallback path, and manual `+ Add Charge` now reads as an exception/fallback path.
- This hierarchy refinement preserves the same locked boundary and behavior: Work Items remain the operational work record, Invoice Charges remain reviewed billed copies for the invoice, imported defaults remain qty `1.00` and unit price `$0.00`, and no action/payload/schema/pricing/auth/payment/Pricebook/estimate/Stripe tenant payment/QBO behavior changed.
- Pricebook-assisted Work Item Creation V1 is complete (`6145f16`) with model boundaries preserved:
	- Work Item builder now includes optional `Start from Pricebook template` assist in both intake and job detail edit surfaces.
	- Template selection now prefills Work Item `title` from Pricebook `item_name` and Work Item `details` from Pricebook `default_description`.
	- Behavior is create-or-prefill: fills an existing blank Work Item when available, otherwise creates a new Work Item row within existing limits.
	- Work Items remain fully editable after template prefill and continue saving through existing `visit_scope_items_json` submission.
	- No Pricebook commercial/provenance fields are persisted onto Work Items in this slice.
	- Validation passed: `npx.cmd tsc --noEmit`, targeted tests (`4` files / `76` tests), and browser smoke (intake prefill/edit/save, job-detail template assist, Work Item import to draft Invoice Charges, and direct draft invoice Add From Pricebook path).
- Work Item Import Defaults Clarification V1 validation passed: `npx.cmd tsc --noEmit`; targeted tests (`2` files / `24` tests); and browser smoke confirming the helper copy appeared near Work Item import, imported Work Items still created draft Invoice Charges at qty `1.00` and unit price `$0.00`, imported charges remained editable, and issue behavior did not change.
- Invoice Panel Hierarchy Polish V1 validation passed: `npx.cmd tsc --noEmit`; targeted tests (`2` files / `24` tests); and browser smoke confirming Work Item import rendered before Pricebook add, Work Item import remained recommended, Pricebook add remained fallback, manual add remained exception/fallback, import/pricebook/manual add paths all still worked, and issue behavior did not change.

That is already the locked business roadmap direction.

So the conceptual chain is:

Visit scope → operational work performed
Completed job scope → candidate invoice source
Invoice line items → frozen billed truth

That keeps you aligned with your business roadmap and avoids creating two competing truths. Jobs remain operational truth; invoices remain billed truth.

8. What should change on the job page

The top section should no longer lead with:

Invoice
Draft
Create Draft Invoice

Instead it should lead with something like:

Visit Scope
Work Scope
Scope for This Visit

The first action should be:

add scope item
add work item
build visit scope

Invoice can still exist, but as a downstream/commercial surface rather than the first instruction the tech sees.

This is the direct workflow lesson from HCP and the clearest fit for a field-first product.

9. What not to do

Do not:

create a hybrid ECC+Service top-level job type yet
redefine jobs as invoice rows
make invoice draft creation the first field action
silently blur service address, billing address, and visit scope into one object
collapse operational scope and commercial truth into the same row type
10. Recommended decision to lock now

Lock this model:

Keep ECC Test and Service as top-level job families
Introduce job-level Visit Scope items as the field-first work layer
Use ECC-first + companion scope for same-trip mixed visits
Promote companion service scope into a real Service job when it becomes its own lifecycle
Allow draft invoice lines to be sourced from Visit Scope with operator review before issue
Make the top of the job page scope-first, not invoice-first

11. Future work still deferred

- Shared Pricebook Entry UI Primitive V1 is complete for estimate/invoice draft entry continuity only; this does not change Visit Scope ownership, lifecycle, or source-of-truth boundaries
- completion/billable toggles on Visit Scope items are not implemented yet
- Pricebook-assisted Work Item template prefill is implemented for title/details only; persisted provenance and commercial-field carryover are not implemented
- normalized Visit Scope item table redesign is not implemented yet
- estimate-first/full estimate flow integration remains future work
- automatic billing from Visit Scope without operator review is not implemented
- Future backlog: Line Item Source Consolidation / Pricebook-style Entry.
	- Long-term direction should reduce duplicate/similar line-item entry paths and favor selecting from Pricebook or adding manual line items through the same clean Pricebook-like entry pattern.
	- Preserve the boundary between Work Items, Estimate Lines, and Invoice Charges.
	- Future customer-centered estimate/invoice history, reporting views, conversion flows, and top-nav/profile access should layer on top of that boundary rather than collapsing Work Items into commercial rows.
	- Future Work Item-first billing flow remains a separate audit/planning item: structured Work Items stay primary operational truth, free-text scope/notes remain narrative context, and Invoice Charges should eventually be buildable from existing Work Items with review/editing to avoid re-entry.

	Work Item-first billing direction remains active after this closeout:
	- enter the work once
	- use it downstream
	- review before billing
	- avoid duplicate entry

	Future work remains deferred and not implemented by this slice:
	- persisted Pricebook provenance on Work Items
	- smarter defaulting/pricing from Work Items into draft Invoice Charges
	- Work Item commercial fields
	- smarter defaults for downstream commercial drafting
	- broader invoice panel polish beyond this clarity pass