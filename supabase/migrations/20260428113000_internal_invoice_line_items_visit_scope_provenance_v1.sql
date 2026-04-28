-- Compliance Matters: internal invoice line-item Visit Scope provenance foundation (A1)
-- Purpose: additive provenance field for future Visit Scope-sourced invoice lines.
-- Historical rows remain valid; no backfill or FK is required.

BEGIN;

ALTER TABLE public.internal_invoice_line_items
  ADD COLUMN IF NOT EXISTS source_visit_scope_item_id uuid NULL;

ALTER TABLE public.internal_invoice_line_items
  DROP CONSTRAINT IF EXISTS internal_invoice_line_items_source_kind_valid_chk;

ALTER TABLE public.internal_invoice_line_items
  ADD CONSTRAINT internal_invoice_line_items_source_kind_valid_chk
  CHECK (source_kind IS NULL OR source_kind IN ('manual', 'pricebook', 'visit_scope'));

CREATE INDEX IF NOT EXISTS internal_invoice_line_items_source_visit_scope_item_idx
  ON public.internal_invoice_line_items (source_visit_scope_item_id)
  WHERE source_visit_scope_item_id IS NOT NULL;

COMMIT;
