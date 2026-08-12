# SLICE 02 — Sales Tax on Invoices (+ QBO carry-overs)

You are a senior engineer working in the EveryStep FieldWorks repo (`hvac-saas`).
This slice adds sales tax to the invoice domain and closes two QuickBooks
carry-overs from Slice 01. Read this whole document first; read
`docs/SLICES/SLICE-01-qbo-correctness.md` §1–§2 for repo orientation and the
standing rules (tenancy scoping, additive migrations, sync-never-throws,
never-trust-a-2xx, no-new-columns-in-shared-SELECTs, environment rules). All of
those rules bind this slice too. Design decisions below are made — implement
faithfully, test, and report honestly.

## Why now

The schema has **zero** tax modeling: no rate, no taxable flag, no tax line.
`internal_invoices` carries only `subtotal_cents` and `total_cents` with
`CHECK (total_cents >= subtotal_cents)` (`supabase/migrations/202604161100_internal_invoices_v1.sql:54`).
Launch tenants (CA compliance raters) bill non-taxable services, so the default
behavior must stay exactly as today — but the moment an HVAC tenant invoices
parts/materials they need tax, and the QBO sync must not push tax-blind books.

## Product decisions (owner-approved, do not relitigate)

- Single tax rate per invoice, applied to taxable lines only. No
  multi-jurisdiction, no tax-inclusive pricing, no exemption-certificate
  management, no tax filing features.
- Default rate/label come from the account; each invoice snapshots and can
  override them. Rater tenants that never set a default rate see **no behavior
  change and no new required fields**.
- Tax-exempt customers exist (builders/GCs with resale certificates).
- Estimates stay tax-exclusive in this slice (see Out of scope).
- QuickBooks: we send per-line taxability (`TaxCodeRef` TAX/NON) and let QBO
  compute its own tax. We never send `TxnTaxDetail`. Parity between our tax and
  QBO's is monitored by reconciliation, not enforced by sync.

## Work unit 1 — Schema (one additive migration)

- `pricebook_items`: `is_taxable boolean NOT NULL DEFAULT false`.
- `internal_invoice_line_items`: `is_taxable boolean NOT NULL DEFAULT false`
  (a **snapshot** at line-add time, then independently editable per line —
  same snapshot philosophy as `item_name_snapshot`).
- `internal_invoices`: `tax_rate_percent numeric(6,4) NULL`,
  `tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0)`,
  `tax_label text NULL` (e.g. "Sales Tax (Stanislaus County)").
- `internal_business_profiles`: `default_tax_rate_percent numeric(6,4) NULL`,
  `default_tax_label text NULL`.
- `customers`: `tax_exempt boolean NOT NULL DEFAULT false`.
- Do NOT add a `total = subtotal + tax` CHECK — enforce that invariant in the
  compute seam (below), not the schema, so void/legacy rows stay untouched.
- Column comments on every new column, following the Slice-01 migration style.
  Rates are `numeric(6,4)` **percent** (7.975% stored as `7.9750`) — rates are
  not money; the integer-cents rule does not apply to them.

## Work unit 2 — Compute seam

- New `lib/invoices/invoice-tax.ts`: pure helpers —
  `computeTaxCents(taxableSubtotalCents, ratePercent)` = round-half-up on the
  **summed** taxable subtotal (never per line), plus a
  `deriveInvoiceTaxInputs(lineItems)` that returns taxable/non-taxable subtotals.
  Unit-test rounding edges (e.g. 7.975% on $0.01, $12.34; zero rate; null rate).
- Wire into `syncInvoiceTotalsFromLineItems`
  (`lib/actions/internal-invoice-actions.ts:375`, writes at ~line 395:
  `total_cents: subtotalCents`) so it becomes
  `total_cents = subtotal_cents + tax_cents`. This function is the ONLY place
  the invariant is computed. If the invoice's rate is null or the bill-to
  customer is `tax_exempt`, `tax_cents` is 0.
- Draft creation (job invoice, supplemental, manual) snapshots
  `tax_rate_percent`/`tax_label` from the business profile default; line
  `is_taxable` snapshots from the pricebook item (manual lines default false).
- **Column tolerance:** new invoice tax columns are read through a dedicated
  helper (new `lib/invoices/invoice-tax-state.ts`, modeled on
  `lib/qbo/qbo-void-state.ts` including the `isMissing…ColumnError` guard).
  With the migration not yet applied, every surface must behave exactly as
  today (no tax UI, totals unchanged) — never a 42703 outage.

## Work unit 3 — Surfaces

- **Invoice editor** (`app/jobs/[id]/invoice/` and its line-items component):
  per-line "Taxable" toggle; tax rate + label inputs in the totals area
  (prefilled from snapshot); totals render Subtotal / Tax / Total. When the
  customer is tax-exempt, show a plain "Tax exempt customer" note instead of
  the rate input. Hide the whole tax block when columns are missing (tolerance
  helper) — and when rate is null and no line is taxable, keep today's compact
  Subtotal/Total rendering so rater tenants see no new noise.
- **Print + PDF** (`lib/pdf/internal-invoice-pdf.tsx`, totals block ~line 109;
  and the print page): add a Tax row (with `tax_label`) only when
  `tax_cents > 0`.
- **Public payment page** (`app/payments/invoice/[token]`): same conditional
  Tax row. Verify (do not change) that Stripe checkout charges `total_cents` —
  tax rides automatically.
- **Consolidated invoices**: the draft RPC
  (`supabase/migrations/20260720200000_create_consolidated_invoice_draft_rpc.sql`
  — check for a later `_v` version and modify the LATEST via a new migration
  re-creating the function) creates drafts with `tax_cents = 0`,
  `tax_rate_percent = NULL`. Contractor consolidated billing is services-only
  today; a later edit in the invoice editor recomputes through the same seam,
  so coherence is preserved.
- **Pricebook admin** (`app/ops/admin/pricebook/`): "Taxable" toggle on the
  item form; CSV import template gains the column.
- **Company profile admin**: default tax rate + label fields, admin-gated,
  near the invoice/billing settings.
- **Customer edit**: "Tax exempt" toggle with one line of explanatory copy.
- **Reports**: invoices report + its CSV export gain a Tax column. Nothing else.

## Work unit 4 — QuickBooks

- `buildInvoiceBody` (`lib/qbo/qbo-api-client.ts`): each line gains
  `SalesItemLineDetail.TaxCodeRef = { value: is_taxable ? 'TAX' : 'NON' }`
  (the US semantic codes). Thread `is_taxable` through `buildInvoiceInput`
  (`lib/qbo/qbo-sync.ts`). We still never send `TxnTaxDetail`.
- **Verification stays pre-tax** (Slice 01 already compares
  `TotalAmt − TxnTaxDetail.TotalTax` to the line sum). Do NOT add our
  `tax_cents` to the expected total — our tax never reaches QBO as an amount;
  QBO computes its own from the tax codes.
- **Carry-over #1 (SyncToken):** immediately before `updateQboInvoice`, re-read
  the live invoice via `findQboInvoiceById` and use its `syncToken` instead of
  the stored one. If the re-read fails, take the error path — do not fall back
  to the stored token (stale-token 5010s are exactly what this closes).
- **Carry-over #2 (revised):** the earlier "taxable line on the EveryStep
  Services fallback item = hard error" decision is **withdrawn** — taxability
  now rides on the line's TaxCodeRef, so the fallback item is tax-correct. No
  hard error; nothing to implement beyond the TaxCodeRef itself.
- **Tax parity monitoring:** new finding type `qbo_tax_mismatch` in the daily
  three-way reconciliation (`lib/reconciliation/`, table
  `reconciliation_findings` — foundation migration
  `20260809190000_reconciliation_findings_foundation.sql`): for synced issued
  invoices where our `tax_cents` and QBO's `TotalTax` differ by more than one
  cent, record a finding naming both amounts. A tax delta is NOT a sync error
  and must never block or un-sync an invoice; if QBO's computed tax differs,
  payment over/under-application in QBO is an accepted v1 consequence that this
  finding surfaces.

## Out of scope (documented follow-ups, do not build)

- Estimates/proposals remain tax-exclusive. Estimate→invoice conversion must
  still snapshot line `is_taxable` from the pricebook, which means a converted
  invoice can total more than the approved estimate — acceptable and visible in
  the editor; full estimate tax parity is a later slice.
- Multi-jurisdiction/destination-based rates, tax-inclusive pricing, exemption
  certificate storage, filing/remittance, QBO tax-agency/TaxCode entity mapping
  beyond TAX/NON, retro-editing tax on issued invoices (issued stays immutable
  except through the existing void path).

## Acceptance criteria

- [ ] Migration is additive-only, tolerant style, never applied by you.
- [ ] With no default rate configured and no taxable items, every surface
      renders byte-for-byte like today (rater tenants unaffected); with the
      migration unapplied, no 42703 anywhere (tolerance tests, following the
      existing `*-migration.test.ts` pattern).
- [ ] `computeTaxCents` unit tests cover rounding edges, zero/null rate, and
      exempt customers; the invariant `total = subtotal + tax` holds through
      every mutation path that touches line items (add/edit/remove/discard,
      supplemental, consolidated-then-edited).
- [ ] Taxable + non-taxable mixed invoice: editor, print, PDF, public payment
      page, and CSV all show the same Subtotal/Tax/Total.
- [ ] Stripe checkout amount equals `total_cents` (verified, unchanged).
- [ ] QBO body carries per-line TAX/NON; verification still passes for both
      AST and non-AST sandbox companies; update path uses a freshly re-read
      SyncToken (test: stored token stale → still succeeds).
- [ ] `qbo_tax_mismatch` finding appears when amounts differ and never affects
      `qbo_sync_status`.
- [ ] `npm run test` (call out pre-existing failures explicitly), `npm run build`,
      `tsc --noEmit` clean; lint delta explained if nonzero.

## Deliverable / report back

Branch `slice-02-sales-tax`, no PR unless asked. Report in the Slice-01 format:
files changed by group, full test/build results, deviations with reasons, a
sandbox manual-QA script (must include: 7.975% default rate; mixed-taxability
invoice math on all surfaces; tax-exempt customer; QBO sandbox invoice showing
TAX/NON per line with AST computing its own tax; a deliberate rate mismatch
surfacing a `qbo_tax_mismatch` finding), and open questions for Slice 03
(offline test-form drafts).
