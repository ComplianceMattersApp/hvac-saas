# Compliance Matters Software — Payments Roadmap

**Status:** ACTIVE IMPLEMENTATION DIRECTION  
**Purpose:** Define the correct payment architecture now, while building only the payment-ready foundation and avoiding rework later.

---

## 1. Core decision

Compliance Matters will **build payment architecture now**, but will **not yet enable live payment processing**.

### Locked rule
- the platform is **payment-ready by design**
- the platform is **not yet payment-active**
- payment execution comes later
- architecture must support future payment acceptance without requiring backwards redesign

---

## 2. System boundary

### Locked ownership model
- **Compliance Matters** = operational source of truth for payment visibility and workflow state
- **Stripe (future)** = payment rail for acceptance and money movement
- **QBO (optional future)** = accounting integration seam only

### Meaning
The app must be built now so that:
- payment tracking works without processor dependency
- future Stripe integration can plug in cleanly
- future QBO sync can remain optional
- accounting adoption is never required for core usage

---

## 3. QBO rule (locked)

QuickBooks Online must **not** be the required foundation for payment architecture.

### QBO is:
- optional
- downstream
- accounting-oriented
- a future sync/integration seam

### QBO is not:
- the required merchant/payment setup
- the core payment rail
- the foundation for contractor payment acceptance
- a prerequisite for core product use

---

## 4. Stripe rule (locked)

Stripe is the preferred future payment rail.

### Meaning
When real payment acceptance is introduced later:
- customer payment execution should be processor-led
- processor-specific logic should fit a Stripe-first path
- contractor payout/onboarding complexity should be handled at the payment-rail layer, not forced into accounting logic

### Current implementation rule
Do not build Stripe execution now.  
Build the platform so Stripe can be introduced later without structural rework.

---

## 5. Current product truth

### Live behavior right now
Payments are **tracking-only**.

Current implemented repo truth now includes:
- a real internal invoice domain for internal-invoicing mode
- job-linked invoice workflow and billed-truth invoice records
- invoice communication tracking/history
- billed-truth invoice reporting through the internal Report Center
- job-level closeout and invoice-action tracking still used where appropriate for operational follow-up
- dashboard invoice visibility and invoice-report drill paths where honest

Not yet materially implemented in repo:
- a mature payment/collection reporting domain with real collected-truth ownership
- live processor-backed payment execution
- customer checkout / saved payment methods / refunds / disputes / payout workflows

Locked direction:
- billed truth and payment/collection truth remain separate
- invoice reporting does not imply live payment execution
- payment architecture should still be built so later payment truth can be added without rework

Not supported now:
- live card collection
- ACH collection
- saved payment methods
- refunds through processor
- contractor payout onboarding
- chargeback/dispute tooling
- processor-driven customer checkout

---

## 6. Payment foundation requirements (build now)

### 6.1 Data model rule
Build the payment domain now, even if live payment execution is deferred.

The payment layer must be able to support future:
- online payment acceptance
- partial payments
- external transaction references
- refunds / reversals
- sync status
- processor identification
- accounting sync without QBO dependency

### Minimum domain expectations
The system should be able to represent:
- payment status
- amount due
- amount paid
- balance due
- payment method type
- processor reference
- processor name
- recorded/paid date
- refund status
- refund amount
- failure/error note
- sync state

This does **not** require all live processor workflows now, but the architecture must anticipate them.

### 6.2 Processor abstraction rule
Payment tracking must not assume QBO objects or QBO-specific payment structure.

The model should remain generic enough that:
- Stripe can become the live processor later
- QBO can optionally receive synced accounting/payment records later
- manual/off-platform payment recording can still coexist

### 6.3 Event rule
Payment-related operational changes should be event-capable from the start.

Examples:
- `invoice_sent`
- `invoice_resent`
- `invoice_delivery_failed`
- `payment_recorded`
- `payment_partially_paid`
- `payment_marked_paid`
- `payment_marked_failed`
- `refund_recorded`
- `payment_sync_failed`

**Locked rule:** If payment state materially affects operations, history, or accountability, it should be event-backed.

### 6.4 UI rule
Current UI must reflect tracking truth only.

Allowed current language:
- Payment Status
- Amount Paid
- Balance Due
- Payment Recorded
- External Payment Reference

Disallowed current language unless real processing exists:
- Pay Now
- Collect Card
- Charge Card
- Process Refund
- Card on File

The UI must not imply live payment execution before it truly exists.

---

## 7. Platform fee rule (locked)

Future Stripe-based payment acceptance should support a **small configurable platform fee**.

### Meaning
- the architecture should allow the platform to retain a modest fee later
- the fee should help sustain the platform
- the fee must be configurable, not hardcoded as a fixed aggressive monetization model

### Current implementation rule
- support the ability to add a platform fee later
- keep it low by default
- do not assume heavy fee extraction at launch
- do not make payment monetization the centerpiece of the current build

---

## 8. Roadmap phases

### Phase P0 — Tracking only (active)
Current live state.

Includes:
- operationally oriented job closeout and lightweight invoice-action tracking
- job-level invoice reference / invoice-complete markers
- billing-aware closeout visibility

### Phase P1 — Payment-ready foundation (build now)
This is the current implementation phase.

Clarification:
P1 is the phase that introduces the real invoice/payment-domain seam. It should not be read as meaning that full invoice/payment domain tables or fields already exist in the current implemented repo baseline.

Includes:
- payment domain model
- payment-related fields
- event-ready payment transitions
- processor-agnostic architecture
- optional external reference storage
- clear ownership and UI wording boundaries
- invoice communication seam for Milestone 2 billing rollout, including draft-review clarity, issue/send, resend, and honest communication tracking/history
- invoice-owned communication tracking fields such as sent, resent, failed, recipient, last sent at, and delivery/error note when available
- truthful attempt tracking for invoice delivery without implying guaranteed delivery confirmation
- future Stripe seam
- optional future QBO sync seam
- support for a later configurable platform fee

Completed P1 foundation work (V1):

**Platform Account Entitlement / Usage Foundation**
- Implemented platform entitlement truth is account-owner-scoped and separate from:
	- tenant billed truth (`internal_invoices` / `internal_invoice_line_items`)
	- collected-payment truth (now materially implemented for issued internal invoices)
- This completed slice did not introduce a `payments` table.
- This completed slice did not introduce live processor execution, checkout, card collection, refund/dispute handling, or QBO-dependent flows.

**Manual Payment Ledger V1**
- Implemented collected-payment truth for manual/off-platform payment recording on issued internal invoices.
- New `internal_invoice_payments` table with account-owner scope and RLS:
	- Records manual payments (cash, check, ACH, bank transfer, card off-platform, other).
	- One invoice may have multiple payment rows.
	- Balance due derived from invoice total minus recorded payments.
	- Payment status: recorded, pending, failed, reversed (only "recorded" counts toward collected total).
	- Payment records are immutable.
	- Stripe and QBO fields are inert schema scaffolding only.
- New read-side resolver for collected payment summary and payment row queries.
- New server action for manual payment recording with validation:
	- Issued invoice requirement (draft and void invoices cannot receive payments).
	- Overpayment prevention (server-side balance check).
	- Account-scoped preflight and RLS verification.
- Minimal internal job-detail UI integration:
	- Payment status chips and historical payment ledger display.
	- Payment recording form for authorized users.
	- `payment_recorded` events written with full metadata to `job_events`.
- Internal invoices remain billed truth; payment recording does not mutate invoice totals or line items.
- No live processor execution exists. This implementation is manual/off-platform only.
- Stripe and QBO remain optional future seams, not active in this phase.

**Collected Payment Reporting / Invoice Ledger Visibility V1**
- Implemented collected-payment visibility in the internal invoice ledger report and CSV export.
- Internal invoice ledger now shows: Amount Paid, Balance Due, Payment Status, Last Payment, Payments.
- CSV export now includes: Amount Paid, Balance Due, Payment Status, Last Payment Date, Payment Count.
- Collected-payment truth is read from `internal_invoice_payments`; only `payment_status = recorded` contributes to collected totals.
- Balance due remains read-side derived from invoice total minus recorded payments and does not mutate billed-truth invoice totals or line items.
- Last Payment Date now renders as a clean report date (not a raw ISO timestamp).
- This is reporting/visibility only and does not introduce payment execution, Stripe checkout, QBO sync, or portal payment UX.

Locked clarification:
Invoice send/resend/tracking in this phase is allowed only as a billing communication seam attached to the invoice record. It is not live payment execution, not Stripe checkout, not card/ACH collection, not refund/dispute handling, not contractor payout flow, and not QBO-led billing.

Invoice email content/design polish may continue later as refinement work, but that refinement does not change the payment-ready architecture or convert this seam into payment execution.

Does **not** include:
- customer checkout
- processor onboarding
- contractor payouts
- saved cards
- refunds through processor

### Phase P2 — Customer payment acceptance (later)
First live processor phase.

Locked carry-forward clarification:
- Dashboard payment/cash-performance analytics expansion remains deferred.
- Customer payment acceptance remains a later P2 Stripe-first implementation.

Recommended first scope:
- customer pays invoice online
- transaction outcome writes back to Compliance Matters
- payment state updates automatically
- minimal processor-led implementation
- no contractor payout complexity unless explicitly required

### Phase P3 — Contractor/platform payout layer (later)
Only after customer payment acceptance is stable.

Includes:
- contractor payment onboarding
- payout ownership model
- payout visibility
- refund/dispute responsibility rules
- merchant-of-record / recipient logic
- optional platform fee logic if desired

### Phase P4 — Optional QBO sync (later)
Accounting convenience only.

Possible scope:
- invoice sync
- payment sync
- reconciliation support
- bookkeeping-friendly exports or mappings

**Locked boundary:**
- QBO sync must remain optional and downstream
- this must never become required for core usage
- this must never be the only path to payment acceptance

---

## 9. Product launch rule

### Locked launch rule
Lack of live payment acceptance does **not** block launch by itself.

Why:
- current product can still operate with payment tracking
- invoice/payment status can still be managed operationally
- payment acceptance is a convenience and revenue-collection expansion layer, not a core workflow backbone requirement

---

## 10. Strategic takeaway

Compliance Matters should launch and grow as:

**operations-first software with optional future accounting integration and later Stripe-based payment acceptance**

Not as:
- a QBO-dependent app
- a bookkeeping-led platform
- a payment-first system before operational maturity is in place

---

## 11. Non-negotiables

- Do not require QBO for core product use
- Do not couple payment acceptance to accounting adoption
- Do not let payment features distort the operational source-of-truth model
- Do not expand into payout complexity until customer payment acceptance is stable
- Keep payments additive, not disruptive

---

## 12. One-line definition

Compliance Matters is **payment-ready by design now, payment-active later**: operational payment truth lives in the platform, Stripe is the future payment rail, QBO remains optional accounting sync only, and a small configurable platform fee is supported for later rollout.
