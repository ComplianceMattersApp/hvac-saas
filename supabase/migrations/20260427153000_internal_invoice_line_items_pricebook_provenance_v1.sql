-- Compliance Matters: internal invoice line-item pricebook provenance snapshots (Slice C1B)
-- Purpose: additive provenance/snapshot fields for pricebook-backed invoice lines.
-- Historical rows remain valid; no backfill is required.

BEGIN;

ALTER TABLE public.internal_invoice_line_items
  ADD COLUMN IF NOT EXISTS source_kind text NULL,
  ADD COLUMN IF NOT EXISTS source_pricebook_item_id uuid NULL,
  ADD COLUMN IF NOT EXISTS category_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS unit_label_snapshot text NULL;

ALTER TABLE public.internal_invoice_line_items
  DROP CONSTRAINT IF EXISTS internal_invoice_line_items_source_kind_valid_chk;

ALTER TABLE public.internal_invoice_line_items
  ADD CONSTRAINT internal_invoice_line_items_source_kind_valid_chk
  CHECK (source_kind IS NULL OR source_kind IN ('manual', 'pricebook'));

ALTER TABLE public.internal_invoice_line_items
  DROP CONSTRAINT IF EXISTS internal_invoice_line_items_source_pricebook_item_fk;

ALTER TABLE public.internal_invoice_line_items
  ADD CONSTRAINT internal_invoice_line_items_source_pricebook_item_fk
  FOREIGN KEY (source_pricebook_item_id)
  REFERENCES public.pricebook_items(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS internal_invoice_line_items_source_pricebook_idx
  ON public.internal_invoice_line_items (source_pricebook_item_id)
  WHERE source_pricebook_item_id IS NOT NULL;

COMMIT;
