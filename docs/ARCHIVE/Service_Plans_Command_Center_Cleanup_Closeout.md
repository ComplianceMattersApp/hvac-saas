# Service Plans Command Center Cleanup Closeout (S1-S3)

Date: 2026-06-07
Scope: /service-plans cleanup milestone closeout
Type: Documentation only

## 1. Milestone summary
`/service-plans` was matured from a form-first/template-admin page into a Service Plans command center.

Plain-language outcome:

Service Plans page: health summary -> plan type index -> needs attention/upcoming -> searchable customer plan detail list

Templates page: reusable setup/admin area for template creation, active templates, archived templates, and Default Visit Work

## 2. S1 - Landing page command center cleanup
- `/service-plans` now opens with command-center content.
- The top page focuses on service plan health and customer plan awareness.
- Template creation no longer dominates the first screen.
- `Create Template` remains available but is secondary.
- Customer plan links deep-link directly to the customer Service Plans tab:
  - `/customers/[customerId]?tab=service-plans&maFocus=[agreementId]#maintenance-agreement-[agreementId]`
- Action label changed to `Open Customer Plan`.
- Misleading read-only copy was removed/replaced with customer-management guidance.

## 3. S2 - Default Visit Work and list scanability cleanup
- `Default Work Items (JSON array)` was removed from user-facing UI.
- Raw `[]` no longer appears in normal UI.
- `Advanced default work items` language was removed.
- Final template language:
  - `Default Visit Work`
  - `Describe the default work, checklist, or scope for future visits.`
  - `Example: Inspect system, replace filter, check refrigerant charge, clean condenser coil.`
  - `Leave blank if this template should not prefill visit work.`
- No structured picker was added.
- Flexibility is intentionally preserved because service plan default work may be a short paragraph, checklist, longer description, list of work items, or blank.
- Field use should determine whether a future structured picker is needed.

## 4. S3 - Service Plan Type index and scalable detail list
- `/service-plans` now includes a compact `Service Plan Types` index.
- The type index is compact/list-based, not large cards, so it can scale beyond 7+ plan types.
- Type rows show:
  - type label
  - total plan count
  - compact nonzero indicators for needs attention, due soon, and overdue
- Selecting a type filters the customer plan detail list.
- Active type state appears as `Showing type: ...`.
- `Clear Type` returns the list to all matching plans.
- Status chips remain separate from type/category filtering.
- Search/status/type filters compose together.
- Customer Service Plans list is treated as the detail view, not the whole page.
- List load control was added:
  - page size of 25
  - count copy such as `Showing N plans` or `Showing 1-X of Y plans`
  - `Load More` behavior when needed
- This prevents `All` from becoming an unlimited 100-row wall.

## 5. Template management separation
- Full Template Management moved out of the dashboard flow.
- Dedicated route added: `/service-plans/templates`
- Dashboard now keeps only compact template summary/actions:
  - `Manage Templates`
  - `Create Template`
- Template setup/admin work no longer interrupts the operational command-center flow.
- Template actions and Default Visit Work remain available on the templates page.

## 6. Final `/service-plans` hierarchy
1. Header / intro
2. Compact health summary
3. Compact Service Plan Types index
4. Plans Needing Attention
5. Upcoming Service Plans
6. Customer Service Plans detail list with search, status filters, type filter, and load control
7. Compact Templates summary/actions

## 7. Source-of-truth boundaries preserved
- Maintenance Agreement remains recurring service obligation truth.
- Billing Period remains commercial coverage-window truth.
- Visits and `next_due_date` remain operational truth.
- Invoice/payment truth remains separate.
- Service plan billing, generated invoices, autopay, saved-card charging, customer portal behavior, and scheduled billing remain unchanged.
- No database truth layers were collapsed.

## 8. Explicit non-actions
- No schema/migrations.
- No service plan billing logic changes.
- No visit generation changes.
- No payment truth changes.
- No invoice truth changes.
- No Stripe/webhook changes.
- No Confirm Payment changes.
- No customer portal behavior changes.
- No role/capability changes.
- No revenue/book-value dashboard added.
- No structured Default Visit Work picker added.

## 9. Validation summary
Validation in the Service Plans lane included:
- service-plans page wiring tests
- service-plans templates page wiring tests
- maintenance agreement read-model tests
- template read-model tests
- template action tests
- TypeScript check: `npx.cmd tsc --noEmit`
- `git diff --check`
- Browser smoke for:
  - `/service-plans`
  - Service Plan Types selection/clear
  - search/status filters
  - customer plan deep links
  - list count/load behavior
  - `/service-plans/templates`
  - Default Visit Work copy

## 10. Remaining / field feedback only
The Service Plans command center is now ready for field-use feedback.

Watch items:
- whether users understand plan type labels
- whether the type index helps users find plans faster
- whether list load control feels natural with 20+ or 100+ plans
- whether `/service-plans/templates` feels like the right home for template setup
- whether Default Visit Work should later become structured or remain freeform
- whether customer Service Plans tab needs the next cleanup pass

## 11. Future items
Future work, not part of this closeout:
- Customer Service Plans tab cleanup
- Service Plan revenue/book-value audit
- Service Plan billing/revenue dashboards only after source-of-truth labels are locked
- contextual/favorite Default Visit Work picker only after field use proves it
- further operational refinements from field feedback

## Cross-reference: remaining work register
- The canonical remaining-work tracker is `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`, Section `4.1 Remaining Work Register (Current)`.
- This closeout does not reopen Service Plans V2/expansion.
- Service Plans command-center cleanup is closed for the current pass.
- Further Service Plans capability is field-feedback gated.
- Customer-side Service Plans tab cleanup is the next inspectable lane only if the owner explicitly opens it.
- Revenue/book-value dashboard remains future and requires a model/read-model audit before UI.
- Billing/autopay/generated invoice automation remains under existing Payments V2 / Service Plan Billing model locks, not this cleanup lane.

Current status: Service Plans command center closed for now; monitor field use. Reopen only for real workflow bugs, strongly validated user feedback, or explicitly approved future Service Plans V2/revenue/billing work.
