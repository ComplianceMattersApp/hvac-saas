# Domain Model Closeout Evidence Ledger

Status: ACTIVE HISTORICAL EVIDENCE LEDGER
Scope: docs/evidence only. This file does not authorize product code, schema, migration, Supabase, Stripe, payment, ECC, portal, SMS, QBO, support, env, or production changes.

## Purpose

This ledger is the stable evidence home for phase closeouts and smoke proof that were duplicated across domain model specs.

Durable source-of-truth contracts remain in the owner model specs:

- [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md)
- [Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md)
- [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md)

Roadmap/deferred sequencing remains in roadmap docs. Minor UI polish and tactical regressions remain in [Tactical_Punch_List_Closeout_Ledger.md](./Tactical_Punch_List_Closeout_Ledger.md).

## Cleanup Rule

Future model-spec cleanup may shorten duplicated phase closeout blocks only when the durable model contract remains in the spec and the historical proof is represented here or in a linked closeout doc.

Do not move payment invariants, billing-period contracts, service-plan lifecycle truth, source-of-truth boundaries, or production safety constraints out of their owner model specs.

## Evidence Ownership Map

| Evidence area | Historical evidence home | Durable contract owner |
| --- | --- | --- |
| Payment register, manual payment, Stripe payment truth | This ledger, payment closeout docs where present | Financial Ledger / Payments Register V1 model spec |
| Allocation foundation and backfill/parity proof | This ledger | Financial Ledger / Payments Register V1 model spec |
| Saved-card manual charge, scheduled autopay, failed autopay, reconciliation visibility | This ledger | Payments V2 / Service Plan Billing Foundation model spec plus Financial Ledger for register truth |
| Service-plan billing periods and invoice linking | This ledger | Payments V2 / Service Plan Billing Foundation model spec |
| Maintenance agreements, service-plan command center, service-plan UI closeouts | [Service_Plan_Model_Closeout_Evidence_Ledger.md](./Service_Plan_Model_Closeout_Evidence_Ledger.md), this ledger for payment/billing overlap, plus [Service_Plans_Command_Center_Cleanup_Closeout.md](./Service_Plans_Command_Center_Cleanup_Closeout.md) | Maintenance Agreements / Recurring Services V1 model spec |

## Payment Register / Manual Payment / Stripe Payment Truth

Duplicated evidence currently appears in the financial ledger, payments/service-plan billing, and maintenance agreements specs.

Preserved closeout proof:

- Manual saved-card charge for issued invoices closed in commit `f7fa23fca188029a9a6f38e152a83180b346606e` (`feat(payments): charge saved card manually for issued invoice`).
- Manual saved-card charge is one-time internal action only and remains outside autopay/subscription scope.
- Register truth remained locked: `tenant_saved_method_payment_attempts` rows are workflow/audit truth, webhook-created `internal_invoice_payments` rows are collected-money truth, and allocation rows follow payment truth.
- Sandbox smoke used invoice `INV-20260528-1CFFCB88` (`7f79e75b-06b5-4924-bd0c-91b78740f2d7`), attempt `99949838-81f3-442a-9de1-4bc736b4c40b`, payment `3788c9ff-700d-43ab-8339-46e4cbf24ae3`, allocation `2b702b07-690a-4e4d-82f2-6f6ed6e40627`, Stripe charge `ch_3Tbxg47itDepDR180C1KhPco`, amount `$17.50`, webhook HTTP 200, and UI Paid / Balance `$0.00`.
- Verified non-actions: no autopay consent creation, no maintenance visit mutation, no `maintenance_agreements.next_due_date` mutation, no Stripe Billing subscription behavior, and no ACH/bank-debit behavior.
- Validation proof recorded in duplicated source docs: TypeScript no-emit passed, targeted Vitest matrix passed, `git diff --check` passed, temp artifacts removed, and implementation commit did not include docs/migrations/env/secrets.

Durable truth to keep in the model specs:

- `internal_invoice_payments` is collected-money/payment-event truth.
- `internal_invoice_payment_allocations` is allocation truth.
- Failed payment rows are non-collected and must not inflate paid/balance projections.
- Stripe is processor/payment-method truth, not invoice paid/balance truth.

## Allocation Foundation And Backfill / Parity Evidence

Preserved evidence category:

- Payment allocation foundation and parity/backfill work established allocation rows as the bridge between payment events and invoice/customer/account projections.
- Financial reports and invoice payment projections must count collected payment truth and active allocations, not failed attempts or workflow-only rows.
- Backfill/parity evidence in source specs was used to prove that invoice paid/balance and reporting projections remained aligned after allocation foundation work.

Durable truth to keep in the model specs:

- Allocation rows follow payment truth; they do not create payment truth.
- Failed allocations stay non-counting/inactive.
- Invoice paid/balance remains derived from collected payment truth and valid allocation/projection logic.

## Saved-Card, Scheduled Autopay, Failed Autopay, And Reconciliation Evidence

Duplicated evidence currently appears across the financial ledger, payments/service-plan billing, and maintenance agreements specs.

Preserved closeout proof:

- Phase 6G-A locked scheduled autopay attempts as model/audit truth without changing register truth.
- Phase 6H-A locked failed-autopay retry/attention workflow as docs/model only.
- Phase 6H-B added the failed-autopay attention read model in commit `e2690e2e36c0e40b2797d73bac8985693b18f381`.
- Phase 6H-C added read-only failed scheduled autopay attention visibility on invoice workspace in commit `5b383e842a62d0cc95f7b1d90ca3865b735f5e87`.
- Phase 6H-D added manual retry for failed scheduled autopay in commit `c3ea465987ac138822b01c914839c6ec62a696fa`.
- Phase 6H-E/E6 declined-path smoke proved failed rows stayed non-collected, inactive allocations did not count, invoice summary remained unpaid, and failed payment remained visible in attention surfaces.
- Declined-path smoke used customer `ad18fa80-2817-476b-8fca-bdcf4ff3c3d6`, billing period `c89c4c36-a842-40e2-9b20-745dce4b959c`, job `1a52288c-78ae-4e79-9472-d00ed928f32f`, invoice `INV-20260529-DDC200B6` (`3d5edb10-8695-42ab-a133-54bd64e4a2a0`), scheduled attempt `6d9120a4-d571-41a0-8ad3-b5172ac39275`, and retry attempt `980c90c2-745f-470f-aa86-e2ba5b30fbc0`.
- Phase 6I-A locked failed payment alert/reconciliation queue requirements as docs/model only.
- Phase 6I-E closed failed payment reconciliation visibility as docs-only evidence.
- Phase 6G-E4 closed fresh scheduled autopay submit smoke for the supported sandbox path.

Durable truth to keep in the model specs:

- `tenant_saved_method_payment_attempts` is attempt/attention truth.
- Scheduled autopay retries create guarded attempts and do not directly write collected payment/allocation truth.
- Failed payment attention must not be silent before production-grade scheduled autopay rollout.
- Customer email/SMS/portal update-card flows remain deferred unless an owner spec/roadmap explicitly unlocks them.

## Platform Application Fee Evidence

Preserved evidence category:

- Platform application fee foundation locked default fee math to `25` basis points (`0.25%`) with explicit skip guards and rounding behavior.
- Wiring smoke validated Checkout and saved-card/manual plus scheduled-autopay PaymentIntent submit paths with `1750` cents gross charge and `4` cents application fee.

Durable truth to keep in the model specs:

- Platform application fee is Stripe/platform revenue only.
- It does not create customer-facing surcharge line items.
- It must not distort invoice paid/balance projections.
- Refunds/disputes and ACH remain deferred unless separately unlocked.

## Service-Plan Billing Period Foundation Evidence

Preserved evidence category:

- Phase 5C-2 production dormant billing-period migration proof confirmed `maintenance_agreement_billing_periods` was applied to production as a dormant table with required fields, constraints, indexes, RLS, policies, triggers/functions, zero rows, and no billing-period creation, invoice generation, UI, payment, Stripe, allocation, projection, or service-plan behavior change.
- Billing-period invoice link/unlink UI wiring and sandbox smoke were recorded in Phase 5G-B2 and 5G-B3.
- Stripe payment identity dedupe and conflict recovery were recorded in Phase 5G-B4F.
- Linked billing-period smoke passed in Phase 5G-B4G.
- Phase 6C generated draft invoice sandbox smoke proved the customer-profile UI could generate one draft job-scoped internal invoice and one controlled service-plan billing line from an eligible billing period without issue/send/email/payment-link, Stripe behavior, payment rows, allocation rows, visit-link mutation, or `next_due_date` mutation.
- Phase 6E-C recorded saved-card setup and related sandbox evidence.

Durable truth to keep in the model specs:

- Service-plan billing periods are billing-cycle anchors, not payment events.
- Linked invoice relationships must preserve invoice/payment truth boundaries.
- Payment identity dedupe protects processor/register integrity.
- Billing-period UI does not itself mutate collected-money truth.

## Maintenance / Service-Plan Command-Center And UI Closeout Evidence

Preserved evidence category:

- Group 9A Maintenance Agreements / Service Plans implementation closeout proof is now preserved in [Service_Plan_Model_Closeout_Evidence_Ledger.md](./Service_Plan_Model_Closeout_Evidence_Ledger.md).
- `/service-plans` command-center cleanup moved the page hierarchy toward a command-center first layout with compact health summary, compact Service Plan Types index, attention/upcoming panels, customer plan detail list, and compact template summary/actions.
- Full template management moved to `/service-plans/templates`.
- Customer plan actions deep-link to the customer Service Plans tab with `maFocus` and agreement anchor.
- Service plan UI closeout preserved boundaries: no service plan billing logic change, no visit generation change, no payment/invoice truth change, no Stripe/webhook change, no Confirm Payment change, no customer portal behavior change, no schema/migration change, and no role/capability change.
- Full detail remains in [Service_Plans_Command_Center_Cleanup_Closeout.md](./Service_Plans_Command_Center_Cleanup_Closeout.md).

Durable truth to keep in the model specs:

- Maintenance agreements/service plans remain the lifecycle and recurring-service contract owner.
- Service-plan visits and next-due operational truth must not be payment-mutated.
- Service-plan billing integration must preserve the boundary between recurring-service operations and invoice/payment truth.

## Later Cleanup Candidates

The following duplicated sections can be shortened in owner specs after review because their evidence is represented here:

- Phase 6F-C manual saved-card charge closeout repeated across the financial, payments, and maintenance specs.
- Phase 6G/6H/6I scheduled-autopay, failed-autopay, and reconciliation closeout blocks repeated across the financial, payments, and maintenance specs.
- Phase 5G billing-period invoice link/unlink, payment identity dedupe, and linked billing-period smoke repeated in payments and maintenance specs.
- Service Plans Command Center closeout summary in the maintenance spec, because full detail already has a dedicated closeout doc.

Do not shorten model-lock sections that define current source-of-truth boundaries unless the same durable contract remains clearly present in the owner spec.
