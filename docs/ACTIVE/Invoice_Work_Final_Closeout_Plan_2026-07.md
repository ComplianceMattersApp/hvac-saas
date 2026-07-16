# Invoice Work Final Closeout Plan — July 2026

Status: NEXT ACTIVE PRODUCT LANE

Purpose: finish and prove the existing invoice workflow without reopening broad payment architecture. This plan supersedes older generic “invoice page UX cleanup” and “invoice add-ons / field charge audit” next-step wording where those items were already delivered in July 2026.

## Closure boundary

Invoice work is complete when an authorized field or office user can build, issue, deliver, review, collect, and reconcile a customer- or contractor-billed invoice with an understandable mobile/desktop path and durable evidence.

The owner pulled contractor saved-card self-service forward as the first closeout milestone on July 16, 2026. ACH, processor refunds/disputes, broad customer portal history, and broader recurring-payment automation remain separate Payments V2 expansions and do **not** block invoice closeout.

## Milestone C0 — Contractor saved card

Goal: let an authenticated contractor intentionally save and manage a card owned by the contractor company, without attaching it to the homeowner/customer record and without charging it during setup.

### C0-A — Contractor-owned data foundation

- Separate contractor Stripe customer, display-safe payment-method, setup-workflow, and webhook-receipt records.
- Contractor-member and same-account internal read boundaries; service-role-only writes.
- No raw card data or SetupIntent client secrets stored.
- Setup never creates payment truth or changes an invoice balance.

### C0-B — Stripe hosted setup and webhook completion

- Contractor portal starts Stripe Checkout in setup mode against the tenant connected account.
- Metadata binds account owner, contractor, and setup row; safe return path remains in `/portal`.
- Webhook receipt is idempotent and persists only Stripe references plus brand/last4/expiry display data.

### C0-C — Portal management and invoice use

- Contractor can see the saved card summary and replace/remove it.
- An explicit invoice payment action may use the saved method only after reconfirming invoice scope, issued state, and current balance.
- A saved card does not imply autopay consent; every manual charge remains an explicit action and payment remains webhook-confirmed.

Exit gate: contractor A cannot see or use contractor B's method; customer/homeowner payment profiles remain untouched; setup performs no charge; duplicate webhooks create no duplicate method; an explicit saved-card invoice payment produces one webhook-confirmed payment.

## Milestone I1 — Production truth sweep

Goal: prove the completed workflow against representative production records before adding more behavior.

### I1-A — Field and desk invoice journey

- Create a draft from a job on mobile and desktop.
- Search the Pricebook, add the charge, and finish price/quantity/details in the single guided step.
- Confirm customer versus contractor bill-to identity before issue.
- Issue and send without losing the selected invoice or creating an unintended duplicate.
- Confirm the job-detail invoice entry opens the intended invoice directly.

### I1-B — Customer artifact and communication

- Confirm staff email preview matches the customer email and invoice artifact.
- Confirm unpaid artifacts include the secure payment action and paid artifacts clearly show Paid with a zero balance.
- Confirm mobile PDF/print rendering remains legible.
- Confirm provider acceptance/delivery evidence and resend state appear honestly in the app.

### I1-C — Payment and accounting truth

- Confirm check/manual payment immediately updates paid and balance truth.
- Confirm Stripe payment becomes collected only after webhook confirmation.
- Confirm customer- and contractor-billed invoices remain visible only to the correct party.
- Confirm QBO sync/retry is per invoice, downstream, and does not alter EveryStep truth.

Exit gate: record production observations in the prelaunch checklist and tactical ledger. Any defect becomes its own smallest safe fix slice; do not combine unrelated cleanup.

## Milestone I2 — Delivery and receipt closeout

Goal: make communication status and the post-payment customer record unambiguous.

### I2-A — Delivery clarity

- Keep Send/Send Again near the issued-invoice next action.
- Present recipient, last accepted send, failure detail, and retry action together.
- Preserve the distinction between provider accepted, delivered, and opened; never claim more than available evidence.

### I2-B — Customer payment receipt

- Send a customer-facing payment confirmation only after durable collected-payment truth.
- Include or link the same customer invoice artifact, now showing Paid/partial balance accurately.
- Make delivery idempotent and best-effort; receipt failure must never reverse payment.
- Keep manual/off-platform and Stripe-confirmed payments consistent while retaining their actual method/reference.

### I2-C — Email trust and branding

- Use the configured business reply/support identity rather than a one-way no-reply experience.
- Keep customer-visible branding and invoice imagery on trusted application/sending-domain paths where practical.
- Verify the exact message in preview before production enablement.

Exit gate: one unpaid send, one resend, one full manual payment, and one Stripe payment each produce correct invoice and communication evidence without duplication.

## Milestone I3 — Final field usability and exception pass

Goal: remove the remaining avoidable clicks and make exceptions recoverable without exposing administrative complexity.

### I3-A — Guided next action

- Draft: payer and charges first, then issue/send.
- Issued and unsent: delivery first.
- Issued and unpaid: collect or record payment first.
- Paid: paid artifact and history first.
- Failed delivery or QBO sync: show the one recovery action beside the failure.

### I3-B — Add-on and duplicate protection

- Verify add-on invoices stay linked and visible on the job.
- Clearly distinguish add-on invoice from continuation job.
- Preserve the current payer when editing unrelated job/customer/contractor details.
- Keep duplicate issuance and invoice-number collision protections covered by focused tests.

### I3-C — Mobile and desktop acceptance

- Run the same representative journey at phone and desktop widths.
- Confirm primary actions remain above the fold or in the immediate next-action card.
- Confirm charge rows, totals, recipient identity, payment state, and PDF remain readable.

Exit gate: owner acceptance from one real field journey and one desk journey, with no unresolved severity-high invoice defects.

## Final closeout

After I1–I3 pass:

1. mark this lane Closed in `docs/CURRENT_ROADMAP.md`;
2. move evidence to `Tactical_Punch_List_Closeout_Ledger.md`;
3. keep only production runbook notes active;
4. open later payment conveniences as new lanes rather than continuing the invoice lane.

## Recommended execution order

Start with C0-A, then apply its additive migration before C0-B. Complete C0-C before returning to the I1 production truth sweep. I2 remains the other planned net-new invoice behavior; I3 is the final acceptance and exception pass.
