-- Compliance Matters: Estimate Invoice Conversion Foundation V1 (Section 2E)
-- Adds durable linkage and idempotency for future internal-only estimate → invoice draft conversion.
-- No invoice conversion behavior is implemented in this migration.
-- No production apply in this slice.

-- 1. Add converted_invoice_id to estimates
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS converted_invoice_id uuid NULL REFERENCES public.internal_invoices(id);

-- 2. Add source_estimate_id to internal_invoices
ALTER TABLE public.internal_invoices
  ADD COLUMN IF NOT EXISTS source_estimate_id uuid NULL REFERENCES public.estimates(id);

-- 3. Unique partial index on estimates.converted_invoice_id
CREATE UNIQUE INDEX IF NOT EXISTS estimates_converted_invoice_id_unique
  ON public.estimates(converted_invoice_id)
  WHERE converted_invoice_id IS NOT NULL;

-- 4. Unique partial index on internal_invoices.source_estimate_id
CREATE UNIQUE INDEX IF NOT EXISTS internal_invoices_source_estimate_id_active_unique
  ON public.internal_invoices(source_estimate_id)
  WHERE source_estimate_id IS NOT NULL AND status <> 'void';
