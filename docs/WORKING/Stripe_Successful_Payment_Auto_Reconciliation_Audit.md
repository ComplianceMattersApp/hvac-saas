# Stripe Successful Payment Auto-Reconciliation Audit

Date: 2026-07-21
Branch: `feature/stripe-successful-payment-auto-reconciliation-v1`

## Executive summary

Stripe Checkout creates a `pending` row in `internal_invoice_payments`; collected truth is established only when a signed connected-account webhook promotes that row (or deduplicates the same Stripe identity) and upserts `internal_invoice_payment_allocations`. A paid Checkout Session can therefore remain open in EveryStep when delivery or processing is missed or incomplete. The existing inspector proves a narrow paid match and its repair action replays the real Checkout event through the sanctioned writer, but it was user-triggered and checked less evidence than unattended repair requires.

The smallest safe design is a protected, bounded Vercel cron safety net using stored Checkout candidates. A typed service verifies tenant connected account, unique paid session, Checkout and PaymentIntent completion, charge state, scope, USD currency, amount snapshot, invoice eligibility, and customer email when both snapshots exist. It then calls the existing webhook writer, allocation upsert, and downstream QBO mechanism. It never creates a Checkout Session, PaymentIntent, or charge.

## Incident and root-cause limit

The observed state proves that successful provider state was not fully projected into durable EveryStep payment/allocation truth. Repository evidence cannot prove whether the production event was undelivered, misconfigured, acknowledged with a non-recorded result, or failed during handling. There is no durable event-receipt/completion table for this route, so the historical seam cannot be reconstructed from code alone.

Verified contributing gaps:

- Successful tenant-invoice ingestion relies on `checkout.session.completed` and `charge.succeeded`; `payment_intent.succeeded` and async Checkout events are not routed.
- Handler-level non-recording results are acknowledged as HTTP 200; only thrown exceptions produce 500.
- Checkout creation persists a pending payment row, but no automatic process revisited it.
- Manual repair required a financial operator to certify provider evidence EveryStep had fetched.
- QBO/email/settlement are best-effort after payment truth and cannot determine paid state.

Unproven hypotheses include endpoint delivery/configuration failure, metadata/schema drift, runtime exception, event races, and stale deployed code.

## Files and lifecycle reviewed

Reviewed the reconciliation and failed-payment report routes, inspector/repair/actions, Checkout creation, Stripe webhook route and handlers, payment/allocation projection, identity-dedupe migrations, QBO sync, cron convention, focused tests, and required source-of-truth documents.

Lifecycle: issued eligible invoice -> USD Checkout creation on the tenant connected account -> durable pending payment snapshot -> signed `checkout.session.completed` and/or `charge.succeeded` -> connected-account and metadata validation -> event/session/PaymentIntent/charge identity dedupe -> payment promotion/write -> allocation upsert -> derived paid/balance projection -> best-effort job audit, settlement, QBO, and receipt work. Promotion closes the pending row; previously, missed completion left it stale.

## Inspector and repair audit

The inspector is financial-access gated and account scoped. It reads stale pending payments and invoice labels, retrieves Stripe objects under the connected account, and exposes suffixes. The repair action additionally requires invoice-lifecycle authority. It checked one paid session, owner/invoice/job metadata and amount, found the original Checkout event, then invoked the webhook writer, QBO, and email. Database partial unique indexes protect recorded Checkout Session, PaymentIntent, and charge identities; event ID is unique; allocation upsert is unique by source payment.

Prior gaps were no PaymentIntent-succeeded, currency/customer/invoice-status/refund/dispute checks, background trigger, or truthful separation from Failed Payments. Original event lookup remains required so reconciliation preserves real event identity rather than inventing a synthetic collision risk.

## Trigger, risks, and boundaries

The repository already uses `CRON_SECRET`-protected Vercel cron. A second route is the smallest existing-infrastructure choice. It processes at most 25 rows older than 15 minutes, uses stored Session IDs, and isolates each account. Multiple paid sessions, mismatches, ineligible invoices, negative money state, and transient failures do not write.

Concurrent webhook/manual/cron execution is protected by database Stripe-identity uniqueness, canonical resolution, and allocation upsert. Edited invoices retain the stored Checkout amount snapshot; the sanctioned writer also rejects an amount above current balance, and reconciliation never silently introduces partial-payment semantics. QBO failure cannot roll back EveryStep truth. Logs and responses contain typed outcomes/identifiers, not raw payloads or secrets.

No schema migration is justified. No production Stripe/Supabase/QBO action, deployment, environment change, scheduler activation, remote migration, or data repair is authorized or performed.
