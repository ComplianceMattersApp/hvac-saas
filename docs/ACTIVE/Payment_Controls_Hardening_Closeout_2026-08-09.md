# Payment Controls Hardening Closeout

Date: 2026-08-09

Opened by an owner observation: voiding an invoice in EveryStep did not appear to reach QuickBooks. It did not. Tracing that produced four distinct defects, all of the same class — the application asserted something about an external system it had never verified — plus one defect introduced and reverted during the fix. Everything below is merged to `main` and, where noted, confirmed against production.

## 1. Void propagation to QuickBooks (the reported bug)

`voidInternalInvoiceFromForm` wrote app-side truth only: the invoice row, job flags, timeline event, ops recompute. There was no QBO call anywhere on the path, and no primitive to make one — `qbo-api-client.ts` exported create and update but nothing to void. The retry sweep could not heal it either, because its candidate query filters `status='issued'` and the eligibility engine classifies `status='void'` as terminal.

An invoice that was issued (therefore pushed) and later voided kept `qbo_invoice_id` and `qbo_sync_status='synced'` while QuickBooks went on holding a live open invoice — overstated A/R and revenue with nothing surfacing the drift.

`lib/qbo/qbo-void-sync.ts` adds the missing verb. It re-reads the live `SyncToken` before writing (the stored one goes stale the moment a payment posts, and a stale token fails 5010), refuses to void a QBO invoice with payments applied (QBO would keep the payment as an unapplied credit, misstating the books worse than the drift being fixed), and is idempotent for already-voided and deleted-in-QBO. State lives in new `qbo_void_*` columns rather than new `qbo_sync_status` values, because that column is the record of the push and is read by the eligibility engine, the attention center, and the invoice badge.

Those columns are deliberately **not** in `INTERNAL_INVOICE_SELECT`. That select feeds every invoice read, so adding to it would turn a lagging migration into an app-wide 42703. Reads go through `lib/qbo/qbo-void-state.ts` and degrade to showing nothing.

### Root cause, found only in production

The void call failed repeatedly with *"Required param missing … Required parameter Line is missing in the request"* even with the body reduced to exactly `{Id, SyncToken}` — Intuit's documented void payload. The query parameter was wrong: it must be **`?operation=void`**, not `?operate=void`. QBO **ignores an unrecognized query parameter silently**, so it never received a void instruction, fell through to full-invoice-update validation, and complained about the one field a full update requires and a void body does not have. Every confusing symptom followed from that one word.

### A wrong fix, recorded because it is dangerous

Reading the error literally, an intermediate commit retried the call with the invoice's live `Line` and `CustomerRef` echoed back to satisfy the validator. That is wrong and was reverted. Satisfying a full-update validator means QBO performs a **full update**, which rewrites the invoice and clears every field omitted from the payload (`DocNumber`, `TxnDate`, `PrivateNote`) without ever voiding it. The void body must stay exactly `{Id, SyncToken}`; with no `Line`, an unhonored operation can only fail validation, which makes the call inherently non-mutating.

### Never trust a 2xx

The same investigation exposed the more general defect: a successful response was treated as proof the void happened. Invoice 2109 was recorded `voided` while QuickBooks still showed it open. `voidInvoiceInQbo` now re-reads the invoice and records `voided` only when QBO confirms it zeroed; otherwise it records `error` with the observed doc number, total, and balance.

The ordering matters and is the durable lesson: **an unverified success is worse than a recorded failure.** `voided` is terminal — it retires the row from the sweep and the attention center, so the drift goes invisible again, which is the exact bug the lane exists to catch. A false negative merely retries.

### Production evidence

Two invoices had drifted: **2181** ($485, QBO 4676) and **2109** ($840, QBO 4534) — $1,325 of phantom open A/R. Both are now confirmed voided in QuickBooks; sweep candidates are zero. Note 2181 was already zeroed in QBO when the lane first ran (voided there by hand during the investigation), so 2109 is the only invoice the write path has actually voided end to end.

`scripts/qbo-void-drift-check.ts` is a read-only diagnostic that buckets every voided invoice by what will happen to it. It reads EveryStep only and reports what EveryStep *believes* about QuickBooks; it is not a live QBO read.

## 2. The payment surface on a voided invoice

Every in-app payment path was already safe, gating on a `status === 'issued'` whitelist rather than a void blacklist — which is why voiding blocked payment recording, field collection reports, verification, and online payment initiation without anyone having written a void rule.

Stripe was the hole. Stripe does not know an invoice was voided, so an already-open checkout session stayed live and would still take the customer's card; the webhook would then refuse to record it because the invoice is void. Marking an invoice `no_charge` or `externally_billed` expired those sessions. Voiding did not. It now does, best-effort, since a Stripe outage must never block a void.

The remaining race — a customer completing payment in the moments before expiry — was not invisible, which is worse than it sounds. The pending row created at session time surfaced as a *"Stale Stripe checkout session"* **warning** reading *"This is not counted as collected money until Stripe confirms payment."* Stripe had confirmed it. An operator reading that would conclude no money moved while the card had been charged. The webhook now distinguishes void from genuinely missing and annotates the pending row with the charge id and amount; the row stays `pending` on purpose, because recording it would credit a retired invoice balance. The attention center raises it as critical with the true statement and suppresses the abandoned-session copy so one problem is never described twice.

## 3. Refunds and disputes

Money in was fully instrumented. Money out was not handled at all: the webhook listened for `checkout.session.*`, `charge.succeeded`, and `charge.failed`. A refund issued from the Stripe dashboard never reached EveryStep — the invoice stayed paid, the job stayed closed, the payment stayed synced to QuickBooks, permanently.

The domain already modelled this (`payment_status='reversed'`, `reversed_at`, `reversal_reason`, and a manual reversal action); only the inbound wiring was missing. Notably the manual path deliberately **refuses** to reverse Stripe-sourced payments — online money must be returned through Stripe — so until now a Stripe payment could not be reversed in this app by any route.

- **`charge.refunded`** — a full refund reverses the payment, mirroring the manual path including the allocation dual-write. The invoice balance derives from allocations, not the payment row; skipping that write would reverse the payment while the invoice still read paid. A **partial** refund does not reverse: `reversed` is all-or-nothing and guessing the allocation would corrupt the balance, so the amount is recorded and raised for a human.
- **`charge.dispute.created` / `closed`** — opening a dispute does **not** reverse. Funds are held while the case runs and it may still be won; collapsing that into `reversed` would understate collected money for a dispute that is later won. Only a lost dispute reverses. Dispute state is therefore its own column, not a `payment_status` value. Disputes do not reliably carry our metadata, so the account is resolved from the payment row the original charge produced.

Four attention items were added, each stating what is true of the money: live chargeback (held, still counted, respond before the deadline), lost dispute (gone, balance reopened), partial refund (left, still counted, fix by hand), and a reversal QuickBooks has not heard about.

**These events must be enabled in the Stripe dashboard.** The route ignores unlisted event types, so the lane is inert until `charge.refunded`, `charge.dispute.created`, and `charge.dispute.closed` are checked.

## 4. Three-way reconciliation (the detection layer)

Every control above is driven by EveryStep's own state, so all of them report on actions this app took. None can see an invoice edited or deleted in QuickBooks, a Stripe charge whose metadata never matched, or a write believed successful that was not. The QBO void drifted for six days because the only detector was a person happening to look.

`lib/reconciliation/three-way-reconciliation.ts` is an independent observer. It reads raw external state and compares it to raw EveryStep state, deliberately **without** going through the sync engine or reusing its eligibility rules — reading through the component under test would inherit whatever assumption is broken and confirm the bug rather than find it.

It is **report-only**, as a design constraint rather than a phase. It writes findings and never touches invoices or payments. A detector that also corrects can mask its own failures, and an unattended nightly job holding write access to accounting is a bad trade.

Over a rolling 90 days it compares:

- invoices EveryStep claims are synced — missing from QBO, totals disagreeing, voided here but open there, voided there but live here
- payments — reversed here but still in QBO, recorded here but gone from QBO
- Stripe — refunds and disputes EveryStep never learned about, and, the part nothing else in the app can see, **charges carrying one of our invoice ids that produced no payment row at all**

Reads are bulk and paginated, then compared in memory; QBO throttles hard enough that a per-row lookup loop would be slow and likely to trip a rate limit mid-run. Findings are keyed by `(account, type, subject)` so a nightly re-run refreshes rather than duplicates, and anything no longer observed auto-resolves. Auto-resolution is scoped to comparisons that actually ran: if QuickBooks was unreachable its findings stay open, because an outage must not look like a fix.

Runs nightly at 09:00 UTC via `vercel.json` and on demand from Company Profile → Integrations ("Check for discrepancies").

## Migrations

All applied to both `ornrnvxtwwtulohqwxop` (production) and `kvpesjdukqwwlgpkzfjm`.

- `20260809140000_internal_invoices_qbo_void_columns.sql`
- `20260809170000_internal_invoice_payments_refund_dispute_columns.sql`
- `20260809190000_reconciliation_findings_foundation.sql`

## Verification status

Full suite green at 621 files / 5922 tests; `tsc --noEmit` unchanged at its 11 pre-existing test-file errors.

Confirmed in production: QBO void propagation (2109, verified by read-back and visually in QuickBooks) and the drift repair.

**Not yet exercised in production:** the automatic void-on-void path (both repairs ran through the sweep, not `autoVoidInvoiceInQbo`); the payments-applied `blocked` branch; the refund and dispute handlers; and the reconciliation engine. Their tests assert against mocked provider responses — the same category of evidence that said `operate=void` was correct. The first real reconciliation run should be treated as calibration, and some findings may be false positives from response shapes not yet seen.

## Known gaps

- `charge.dispute.funds_withdrawn` / `funds_reinstated` are not handled; `closed` is the decisive outcome, so this is refinement rather than a hole.
- A reversal is surfaced for manual removal in QuickBooks; nothing pushes it there.
- Payout-level Stripe events remain outside this work.
- The paid-after-void marker is a string prefix in `notes` matched by `LIKE`, shared via `lib/business/voided-invoice-charge-marker.ts`. It works and is reversible, but a typed column would be the correct model. Recorded as debt.
- The same unverified-write pattern very likely still exists in `createQboInvoice` and the QBO payment sync, which trust their responses the way the void did. Nobody has looked, because nothing has gone visibly wrong there — which was equally true of voids before today.
