# Payment Operations Root-Cause and Release Audit

Date: 2026-08-10

Status: CODE HARDENING COMPLETE; STAGING/CONTROLLED-TENANT VALIDATION REQUIRED BEFORE CUSTOMER ROLLOUT

## Executive verdict

The alert for the $850 payment has been repaired, but clearing that alert proved only that the existing payment identity and QuickBooks link were corrected. It did not by itself fix the source path that created the discrepancy.

The source defect has now been traced and corrected in this working tree. The payment audit also found and closed additional high-risk concurrency, retry, refund, dispute, and QuickBooks idempotency gaps. The reviewed money-in path is ready for a migration-first controlled deployment and canary. It should not be represented as production-proven until the migration preflight, webhook configuration check, and live test matrix in this document are complete.

There is one explicit accounting limitation remaining: Stripe refunds, lost disputes, and reversed payments reopen EveryStep truth and raise a critical QuickBooks follow-up, but EveryStep does not automatically create the corresponding QuickBooks refund, credit memo, or reversal. That is safe and visible, but still manual accounting work.

## Incident conclusion

### What is proven

- Stripe carried the exact EveryStep identifiers: account owner `93dd810e-3c0c-4b69-9dae-edfa0e481dbb`, invoice `3599d52f-7bb3-4c45-aeff-2bc695811be8`, and job `79c851ea-af65-4090-a8a7-b6cb7729404b`.
- The Stripe payment amount was $850.
- EveryStep displayed invoice 2007 as paid for $850.
- QuickBooks displayed invoice 1708 for the same $850 work.
- The first reconciliation finding said Stripe had collected money without a matching Stripe-identified payment row in EveryStep.
- After the verified identity repair and QuickBooks payment retry/adoption, the alert cleared.

### What the invoice-number mismatch did and did not do

The visible invoice numbers were not the key Stripe used to place the payment. Stripe metadata contained the immutable EveryStep invoice UUID, and the webhook resolves the invoice from that UUID. QuickBooks payment posting likewise uses the stored `qbo_invoice_id`, not the visible EveryStep invoice number.

The 2007/1708 mismatch remains useful evidence: it can mean a QuickBooks document was renumbered or the wrong QuickBooks record was linked. Reconciliation now reports that mismatch independently. It did not, however, explain why the Stripe charge identity was missing from the EveryStep payment row.

### Root cause

The defect was an asynchronous identity race:

1. Stripe Checkout can return `payment_intent` as either an ID string or an expanded object.
2. The Checkout success path only handled the string form. The charge reference builder had the same weakness and could lose or corrupt the PaymentIntent identity.
3. One success event could record the $850 payment and make the invoice appear paid without persisting the canonical charge/PaymentIntent identity.
4. The companion Stripe event then checked the already-paid invoice before repairing exact Stripe identity and exited.
5. Three-way reconciliation later saw a real Stripe charge with no matching external identity on the already-recorded EveryStep payment and raised the alert.
6. A charge-first delivery made the race wider because a Charge does not directly carry the Checkout Session ID. The pending EveryStep row initially knew only the Session ID, so the Charge handler could fail to find it.

The fix normalizes expanded Stripe objects, resolves the Checkout Session from the PaymentIntent when Charge arrives first, enriches identity before paid/balance gates, requires exact owner/invoice/job/amount/account matches, and makes identity-persistence failure retryable instead of acknowledging it.

### Production-data limitation

The locally configured Supabase project does not contain the incident invoice, job, owner, or payment IDs. Therefore the precise production database timestamp sequence could not be reconstructed from local data. The causal sequence above is supported by the screenshots, Stripe metadata, alert transition, and the exact code branches; it remains an inference about event ordering rather than a production log transcript.

## Payment operation map

### 1. Collection initiation

- Public/internal Stripe Checkout: validates current invoice scope, issued state, current net balance, job disposition, QuickBooks open balance, and Stripe Connect ownership; then reserves the invoice and creates one idempotent Session.
- Manual saved card: validates user authority, saved-method setup authorization, current balance, QBO balance, and connected-account/customer/method scope; then reserves and submits one idempotent PaymentIntent.
- Scheduled autopay: revalidates current invoice, agreement, consent, amount cap, saved method, account, and duplicate attempt immediately before submitting through the same saved-method primitive.
- Manual/off-platform payment: requires financial authority, expires all verifiably open Checkout Sessions, claims a short operation reservation, and inserts a uniquely keyed payment truth row.
- Field cash/check/other: the field report is not money truth. A different authorized user must verify it; verification then follows the same reservation and final truth path as manual payment.

### 2. Provider confirmation

- `checkout.session.completed` and `charge.succeeded` converge on one canonical payment identity.
- The connected Stripe account, tenant owner, invoice, job, amount, currency, Session, PaymentIntent, and Charge are checked before money is recorded.
- Stripe event retries and companion events return the existing payment ID and rerun idempotent settlement, QuickBooks, and receipt follow-through.
- Missing/transient provider context and failed identity persistence return HTTP 500 so Stripe retries.
- `charge.failed` resolves the attempt without recording collected money.
- `checkout.session.expired` or verified abandonment fails the pending row and releases its collection reservation.

### 3. EveryStep ledger and invoice projection

- `internal_invoice_payments` is the durable payment truth.
- A database trigger locks the invoice row for each payment insert/promotion and rejects cross-account, cross-job, non-issued, invalid refund, and over-balance truth.
- A second database trigger maintains the invoice allocation projection in the same transaction. Application dual-writes remain compatibility/recovery helpers, not the sole integrity control.
- Partial Stripe refunds reduce the active allocation by the cumulative refunded amount and reopen exactly that part of the invoice balance.
- Full refunds and lost disputes reverse the payment and reopen the full balance.

### 4. QuickBooks

- Pre-collection: once an invoice has a QBO identity, a missing connection, failed lookup, missing QBO invoice, or insufficient QBO balance blocks the charge. This prevents an externally posted QBO payment from becoming a duplicate customer charge.
- Invoice writes: deterministic Intuit `requestid` values now cover create, update, and void. New invoices carry an EveryStep origin marker in `PrivateNote`, allowing safe adoption after a provider-success/local-response failure without guessing from DocNumber.
- Payment writes: deterministic `requestid` values prevent duplicate QBO Payments on retry.
- Existing QBO payment adoption requires the correct QBO invoice allocation and exact amount, then either a compatible reference or one unambiguous candidate.
- Multi-invoice QBO Payments are compared using the amount applied to this invoice, not the Payment's total amount.

### 5. Settlement and deposits

- After payment truth is recorded, the settlement lane reads the Stripe Charge, Balance Transaction, and Payout and upserts by connected account plus balance-transaction ID.
- Settlement failure never rolls back collected-money truth.
- A settlement without a payout ID remains visible as pending and can be refreshed. There is no independent automatic payout-refresh cron in this slice; this affects deposit reporting timeliness, not whether the invoice is paid.
- Platform application fees remain unproven in the settlement row (`platformFeeProven: false`) and must not be presented as exact proven fee truth until a dedicated connected-account fee reconciliation is completed.

### 6. Independent detection and recovery

- The 10-minute stale-success reconciliation inspects pending Checkout Sessions and repairs only one exact paid match.
- The nightly/on-demand three-way comparison independently reads EveryStep, QuickBooks, and Stripe.
- It detects missing/changed invoices, number/total/void drift, missing or misallocated QBO payments, unrecorded Stripe money, missing Stripe identity, and refund/dispute drift.
- Provider outages do not auto-resolve existing findings.
- Identity repair verifies the live Stripe charge, connected account, metadata, amount, currency, payment state, uniqueness, and current EveryStep row before linking. It never creates a second payment.

## Findings and disposition

| Severity | Finding | Disposition |
|---|---|---|
| Critical | Expanded PaymentIntent identity could be lost | Fixed and tested |
| Critical | Paid/balance gate could prevent later exact identity repair | Fixed and tested |
| Critical | Charge-first event could not find Session-only pending row | Fixed through PaymentIntent-to-Session lookup and tested |
| Critical | Concurrent collection channels could both pass read-time balance checks | Fixed with atomic invoice reservation plus database invoice lock |
| Critical | Payment/allocation writes were not one database integrity boundary | Fixed with transaction triggers and backfill |
| Critical | Ambiguous saved-card network error was labeled declined | Fixed: same-key retry, then unknown/pending with long lock and critical alert |
| Critical | QBO payment retry could create a duplicate after a lost response | Fixed with deterministic Intuit `requestid` and exact existing-payment adoption |
| High | QBO invoice create/update/void had the same retry ambiguity | Fixed with deterministic `requestid` and origin-marker recovery |
| High | QBO-linked collection failed open during connection/lookup failure | Fixed; linked invoices now fail closed |
| High | Duplicate Stripe events did not rerun downstream follow-through | Fixed; canonical payment ID drives idempotent settlement/QBO/receipt retry |
| High | Partial refunds did not reopen the refunded balance | Fixed with net allocation projection |
| High | Out-of-order refund/dispute events could regress state | Fixed with monotonic cumulative refunds and terminal dispute guards |
| High | Reconciliation compared total QBO Payment instead of invoice allocation | Fixed and tested |
| High | Manual payment could race an open Checkout Session | Fixed by verified Session expiry, reservation, unique operation key, and DB guard |
| Medium | Abandoned/repaired Checkout reservations could linger | Fixed; recovery paths now release the exact reservation |
| Operational | QBO refund/credit/reversal is not automatically written | Open and visible; requires an accepted manual runbook or a future money-out sync implementation |
| Reporting | Stripe payout association may require later refresh; platform fee is not proven | Open reporting refinement; not a collected-money truth blocker |

## Migration preflight

Run these read-only checks against the target production database before applying `20260810123000_internal_invoice_payment_integrity_guards.sql`.

```sql
-- Must return zero: invalid cumulative refund data.
select id, invoice_id, amount_cents, stripe_refunded_amount_cents
from public.internal_invoice_payments
where stripe_refunded_amount_cents is not null
  and (stripe_refunded_amount_cents < 0 or stripe_refunded_amount_cents > amount_cents);

-- Must return zero: payment scope disagrees with its invoice.
select p.id as payment_id, p.invoice_id, p.account_owner_user_id, p.job_id
from public.internal_invoice_payments p
join public.internal_invoices i on i.id = p.invoice_id
where p.account_owner_user_id is distinct from i.account_owner_user_id
   or p.job_id is distinct from i.job_id;

-- Must return zero: current net recorded truth exceeds invoice total.
select i.id, i.total_cents,
       sum(greatest(p.amount_cents - coalesce(p.stripe_refunded_amount_cents, 0), 0)) as recorded_cents
from public.internal_invoices i
join public.internal_invoice_payments p on p.invoice_id = i.id
where p.payment_status = 'recorded'
group by i.id, i.total_cents
having sum(greatest(p.amount_cents - coalesce(p.stripe_refunded_amount_cents, 0), 0)) > i.total_cents;

-- Inventory before/after migration: after migration this must return zero.
select p.id, p.invoice_id, p.payment_status, p.amount_cents,
       p.stripe_refunded_amount_cents, a.allocated_amount_cents, a.allocation_status
from public.internal_invoice_payments p
left join public.internal_invoice_payment_allocations a
  on a.source_internal_invoice_payment_id = p.id
where a.id is null
   or a.target_invoice_id is distinct from p.invoice_id
   or a.allocated_amount_cents is distinct from
      greatest(p.amount_cents - coalesce(p.stripe_refunded_amount_cents, 0), 0)
   or a.allocation_status is distinct from
      case p.payment_status when 'recorded' then 'active' when 'reversed' then 'reversed' else 'inactive' end;
```

## Migration-first rollout plan

1. Run the production preflight and save the results with the deployment record.
2. Apply `20260810123000_internal_invoice_payment_integrity_guards.sql` before deploying application code. Do not reverse this order: partial-refund and concurrency correctness depend on the database triggers/RPCs.
3. Deploy the application changes.
4. Confirm the Stripe connected-account event destination includes `checkout.session.completed`, `checkout.session.expired`, `charge.succeeded`, `charge.failed`, `charge.refunded`, `charge.dispute.created`, and `charge.dispute.closed`.
5. Confirm the 10-minute Stripe pending-payment reconciliation and nightly three-way reconciliation cron routes are enabled and authenticated.
6. Run the canary matrix below on one controlled tenant.
7. Run three-way reconciliation twice. The second run must refresh/resolve deterministically and must not duplicate findings.
8. Review Needs Attention, Payments, Deposits, Stripe, and QuickBooks together before enabling the next tenant.

## Required canary matrix

- Checkout: double-click and two-browser submission produce one Session and one payment.
- Event order: replay Checkout-first, Charge-first, duplicate Checkout, and duplicate Charge deliveries; all converge on one payment row with Session, PaymentIntent, and Charge IDs.
- Provider failure: simulate identity database failure; webhook returns 500 and succeeds on retry.
- Saved card: simulate a lost Stripe response; the exact idempotency key is reused, no second attempt/channel can collect, and an unresolved outcome surfaces after 15 minutes.
- Manual payment: open a Checkout Session, then record cash/check; the Session is expired before manual truth commits.
- QBO preflight: settle a linked invoice directly in QBO; EveryStep refuses a new Stripe collection.
- QBO lost response: retry invoice and payment writes with the same `requestid`; recover the original external entity rather than creating another.
- Partial refund: deliver cumulative refund events out of order; EveryStep retains the largest total and reopens the correct balance.
- Full refund and lost dispute: payment reverses, invoice balance reopens, and QBO follow-up remains critical until handled.
- Multi-invoice QBO Payment: allocation comparison uses only the amount applied to the EveryStep-linked invoice.
- Public link: paid, changed-balance, voided, and job-resolved links cannot open a new collection.

## Automated verification

- Focused payment/QBO/reconciliation suite: 27 files, 371 tests passed.
- Earlier focused regression runs: 91 and 53 tests passed after the money-out and ambiguous-submit changes.
- Repository-wide Vitest run: 6,003 of 6,006 tests passed. The only three failures are pre-existing mock-shape failures in `lib/actions/__tests__/attachment-entitlement-hardening.test.ts`; they do not exercise invoice, Stripe, QuickBooks, reconciliation, or payment code.
- `git diff --check`: clean other than repository line-ending warnings.
- TypeScript: all touched files are clean. The repository-wide typecheck still has pre-existing test-only errors in unrelated cron/API mocks and Drawer tests.

## Deferred live verification: refunds

Status: **Pending operator verification after 2026-08-10.** Do not treat the refund workflow as production-proven until this checklist is completed.

- [ ] Create a new low-value internal test invoice and pay it through the live Stripe flow. Do not reuse invoice 2007 / QuickBooks 1708 or a customer transaction.
- [ ] Record the EveryStep payment ID, Stripe Checkout Session, PaymentIntent, Charge ID, invoice balance, allocation, and QuickBooks balance before refunding.
- [ ] Issue a partial refund in Stripe. Confirm the webhook succeeds, `stripe_refunded_amount_cents` reflects the cumulative refund, the EveryStep allocation decreases by that amount, and the invoice reopens for exactly the refunded balance.
- [ ] Confirm Needs Attention creates the expected critical QuickBooks refund/credit follow-up. QuickBooks is expected to remain unchanged until the accounting adjustment is handled manually.
- [ ] Refund the remainder. Confirm the EveryStep payment becomes reversed, the full invoice balance reopens, and no duplicate payment, allocation, or alert is created if the Stripe event is delivered again.
- [ ] Complete the QuickBooks refund/credit procedure, rerun reconciliation twice, and confirm the second run creates no new discrepancy.
- [ ] Save screenshots or IDs with the deployment record and mark this checklist complete.

## Go/no-go decision

Go for migration-first staging and a controlled tenant canary.

No-go for broad real-customer rollout until:

- production preflight returns no invalid scope/refund/overpayment rows;
- the migration is applied and post-migration allocation drift is zero;
- webhook event configuration is confirmed;
- the canary matrix passes with live Stripe test-mode and QBO sandbox responses;
- the business explicitly accepts manual QBO handling for refunds/disputes/reversals, or that automation is implemented first.
