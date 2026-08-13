-- EveryStep FieldWorks: sales tax on invoices (Slice 02)
-- Purpose: give the invoice domain a single-rate sales tax, applied to taxable
-- lines only. Additive only.
--
-- Default behavior is unchanged. Launch tenants (CA compliance raters) bill
-- non-taxable services, so every new flag defaults to false and every new rate
-- defaults to NULL: an account that never sets a default rate computes tax of
-- zero and renders exactly as it does today.
--
-- Rates are numeric(6,4) PERCENT (7.975% is stored as 7.9750), not money. The
-- integer-cents rule covers amounts, not rates — storing a rate in cents would
-- lose the fourth decimal California actually uses.
--
-- Deliberately NO `total_cents = subtotal_cents + tax_cents` CHECK. The
-- invariant is enforced in one compute seam (syncInvoiceTotalsFromLineItems) so
-- that historical and voided rows, which predate tax entirely, stay valid and
-- untouched. A schema-level CHECK would reject them on any future write.
--
-- Non-goals: multi-jurisdiction rates, tax-inclusive pricing, exemption
-- certificate storage, filing/remittance, estimate tax parity.

BEGIN;

-- ---------------------------------------------------------------------------
-- Taxability: pricebook items are the source, line items snapshot them
-- ---------------------------------------------------------------------------

ALTER TABLE public.pricebook_items
  ADD COLUMN IF NOT EXISTS is_taxable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pricebook_items.is_taxable IS
  'Whether this catalog item is subject to sales tax. Copied onto an invoice line at add time; editing it here does not change existing invoices.';

ALTER TABLE public.internal_invoice_line_items
  ADD COLUMN IF NOT EXISTS is_taxable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.internal_invoice_line_items.is_taxable IS
  'Snapshot of the pricebook item taxability at line-add time, then independently editable per line — same snapshot philosophy as item_name_snapshot. Manual lines default false.';

-- ---------------------------------------------------------------------------
-- Invoice-level tax: rate + label snapshotted from the account, amount computed
-- ---------------------------------------------------------------------------

ALTER TABLE public.internal_invoices
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric(6,4) NULL,
  ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_label text NULL;

-- Added separately so a re-run over a table that already has the column still
-- installs the constraint (ADD COLUMN IF NOT EXISTS skips its inline CHECK).
ALTER TABLE public.internal_invoices
  DROP CONSTRAINT IF EXISTS internal_invoices_tax_nonnegative_chk;
ALTER TABLE public.internal_invoices
  ADD CONSTRAINT internal_invoices_tax_nonnegative_chk CHECK (tax_cents >= 0);

COMMENT ON COLUMN public.internal_invoices.tax_rate_percent IS
  'Sales tax rate as a PERCENT with 4 decimals (7.975% = 7.9750), snapshotted from the account default at draft creation and overridable per invoice. NULL = no tax on this invoice.';
COMMENT ON COLUMN public.internal_invoices.tax_cents IS
  'Computed tax in integer cents: the rate applied to the SUMMED taxable line subtotals, rounded once. Always 0 when the rate is NULL or the bill-to customer is tax exempt.';
COMMENT ON COLUMN public.internal_invoices.tax_label IS
  'Operator-facing name for the tax line, e.g. "Sales Tax (Stanislaus County)". Shown on the invoice, PDF, and payment page when tax_cents > 0.';

-- ---------------------------------------------------------------------------
-- Account default rate
-- ---------------------------------------------------------------------------

ALTER TABLE public.internal_business_profiles
  ADD COLUMN IF NOT EXISTS default_tax_rate_percent numeric(6,4) NULL,
  ADD COLUMN IF NOT EXISTS default_tax_label text NULL;

COMMENT ON COLUMN public.internal_business_profiles.default_tax_rate_percent IS
  'Account default sales tax rate as a PERCENT with 4 decimals. New invoice drafts snapshot this. NULL = this account does not charge sales tax (the rater default).';
COMMENT ON COLUMN public.internal_business_profiles.default_tax_label IS
  'Account default label for the tax line, snapshotted onto new invoice drafts alongside the rate.';

-- ---------------------------------------------------------------------------
-- Customer exemption (builders/GCs holding resale certificates)
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.tax_exempt IS
  'Customer holds a valid resale/exemption certificate. Invoices billed to them compute zero tax regardless of line taxability. Certificate storage is out of scope.';

COMMIT;
