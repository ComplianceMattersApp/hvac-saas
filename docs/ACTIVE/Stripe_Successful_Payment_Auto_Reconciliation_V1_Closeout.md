# Stripe Successful Payment Auto-Reconciliation V1 Closeout

Date: 2026-07-21

This slice adds a self-healing safety net for stale tenant-invoice Stripe Checkout payments while retaining webhooks as the primary real-time path. The exact historical production failure cannot be proven without durable event-receipt history; the repository confirms that pending Checkout snapshots previously had no automatic retry.

`reconcileStripeSuccessfulPayment` is shared by manual fallback and the automatic runner. It requires a unique complete/paid Checkout Session, succeeded PaymentIntent, paid non-refunded/non-disputed charge, matching connected account and tenant/invoice/job scope, USD currency, exact stored amount snapshot, eligible non-void/cancelled invoice, and matching billing/customer email when both exist. Multiple successes, conflicts, incomplete/failed state, refund/dispute, missing evidence, and provider errors remain non-mutating.

The existing webhook writer establishes payment truth and allocation; invoice paid/balance remains derived. Event, Checkout Session, PaymentIntent, and charge uniqueness plus allocation upsert protect races. QBO runs only after durable EveryStep truth and remains downstream/best-effort.

`/api/cron/stripe-payment-reconciliation` is `CRON_SECRET` protected, checks rows older than 15 minutes, and is bounded to 25 candidates. Repository scheduler configuration runs it every ten minutes. Deployment and scheduler activation are the remaining production steps. The advanced inspector is retained but now uses reconciliation language and no longer requires an operator to independently search/certify Stripe.

No migration or new credential is required. No production provider action, data mutation, deployment, environment change, or reconciliation run was performed.
