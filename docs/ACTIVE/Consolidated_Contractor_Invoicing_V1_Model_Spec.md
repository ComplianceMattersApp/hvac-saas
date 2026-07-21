# Consolidated Contractor Invoicing V1 Model Spec

Status: Implemented locally; non-production migration and browser smoke pending explicit environment approval.

Date: 2026-07-20

## Product contract

V1 adds a manual Ready to Bill path that lets an authorized internal financial user select compatible completed jobs for one contractor and create one draft invoice. It does not replace or alter normal single-job invoice creation. Creation never automatically issues, sends, charges, or syncs the draft.

## Source-of-truth lock

- `internal_invoices` remains commercial total, balance, payment target, delivery, and QBO linkage truth.
- `internal_invoice_jobs` is durable invoice-to-job membership truth. The existing `internal_invoices.job_id` remains the compatibility anchor and is also a membership.
- `internal_invoice_line_items.source_job_id` identifies the job whose existing invoice-source builder produced a line.
- `internal_invoice_payments` and current allocation/settlement models remain the only collected-money truth. Consolidation creates no job-level payment copies.
- One consolidated invoice produces one report/revenue row and one QBO invoice. Job-level views may all resolve that same invoice.

## Creation invariants

`create_consolidated_invoice_draft_v1` owns the transaction. It revalidates authority, account scope, internal-invoicing mode, job readiness, contractor and recipient compatibility, active-invoice conflicts, and deterministic line inputs immediately before writing. Advisory locks and database constraints prevent competing active primary memberships. A stable request key makes retries idempotent. The transaction creates either the complete invoice, all memberships, all lines, and job audit events, or nothing.

The shared per-job source builder remains the input for both creation paths. Contributions are ordered deterministically; line order within each job remains unchanged. Draft membership is fixed in V1. Corrections after issue follow existing void/replacement behavior.

## Operator workflow

`/billing/ready-to-bill` is a capped, billing-specific read surface. It groups eligible jobs by contractor and exposes explicit checkbox selection, selected count, running expected total, blockers, and a single Create Consolidated Draft Invoice action. Success opens the existing job-scoped invoice workspace through the compatibility anchor. Individual Create Invoice remains available and unchanged.

## Compatibility behavior

- Every member job resolves the same active or historical invoice and participates in existing duplicate-invoice and closeout truth.
- Issue and void projections, audit history, and closeout recomputation run for every member job.
- Existing print, PDF, HTML email, and text email consume the shared invoice document model. Consolidated lines add their source job reference, customer, and service location; single-job output retains its existing fallback path.
- QBO timing, customer mapping, stored IDs, retry behavior, and one-invoice payload remain unchanged. Only multi-source invoices add per-line source-job context.
- Invoice ledger, payment totals, and revenue remain invoice-centered. Consolidated rows receive a clear scope label without joining memberships into account-level totals.

## Security and immutability

The action uses existing financial authority and server-side account checks. The membership table has account-scoped RLS and referential constraints. Issued/void historical membership and line provenance cannot be destructively rewritten. Contractor, portal, public, inactive, and unauthorized operational users receive no new authority.

## Rollout gate

No migration has been applied and no Supabase, Stripe, QBO, email-provider, or production mutation was performed during local implementation. Before enablement, explicitly identify and approve a non-production Supabase environment, then:

1. Apply the two consolidated-invoice migrations only there.
2. Seed or identify one test contractor with three eligible jobs and another with one eligible job.
3. Execute the browser-smoke matrix from the implementation brief, using email preview/test mode and mocked or approved sandbox QBO behavior.
4. Verify one invoice/payment/report/QBO result, member-job resolution, closeout and void/replacement behavior, and unchanged single-job invoicing.
5. Record evidence and failures before considering any production rollout.

Production migration and production smoke require separate explicit approval.

## Deferred by design

Automatic billing schedules, automatic issue/send/charge, post-creation membership editing, portal changes, invoice redesign, payment splitting, job revenue allocation, and new tax/discount engines remain out of scope.
