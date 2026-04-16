-- Compliance Matters: internal invoice v1 line items
-- Purpose: add frozen line-item snapshots for internal invoices while keeping
-- one primary invoice per job and no payment/domain expansion.

BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.internal_invoices(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 1,
  item_name_snapshot text NOT NULL,
  description_snapshot text NULL,
  item_type_snapshot text NOT NULL,
  quantity numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  line_subtotal numeric(12,2) NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT internal_invoice_line_items_sort_order_positive_chk
    CHECK (sort_order > 0),
  CONSTRAINT internal_invoice_line_items_item_name_not_blank_chk
    CHECK (length(btrim(item_name_snapshot)) > 0),
  CONSTRAINT internal_invoice_line_items_item_type_not_blank_chk
    CHECK (length(btrim(item_type_snapshot)) > 0),
  CONSTRAINT internal_invoice_line_items_quantity_positive_chk
    CHECK (quantity > 0),
  CONSTRAINT internal_invoice_line_items_unit_price_nonnegative_chk
    CHECK (unit_price >= 0),
  CONSTRAINT internal_invoice_line_items_line_subtotal_nonnegative_chk
    CHECK (line_subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS internal_invoice_line_items_invoice_sort_idx
  ON public.internal_invoice_line_items (invoice_id, sort_order, created_at);

ALTER TABLE public.internal_invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_invoice_line_items_select_account_scope ON public.internal_invoice_line_items;
DROP POLICY IF EXISTS internal_invoice_line_items_insert_account_scope ON public.internal_invoice_line_items;
DROP POLICY IF EXISTS internal_invoice_line_items_update_account_scope ON public.internal_invoice_line_items;
DROP POLICY IF EXISTS internal_invoice_line_items_delete_account_scope ON public.internal_invoice_line_items;

CREATE POLICY internal_invoice_line_items_select_account_scope
ON public.internal_invoice_line_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = invoice.account_owner_user_id
    WHERE invoice.id = internal_invoice_line_items.invoice_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY internal_invoice_line_items_insert_account_scope
ON public.internal_invoice_line_items
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = invoice.account_owner_user_id
    WHERE invoice.id = internal_invoice_line_items.invoice_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY internal_invoice_line_items_update_account_scope
ON public.internal_invoice_line_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = invoice.account_owner_user_id
    WHERE invoice.id = internal_invoice_line_items.invoice_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = invoice.account_owner_user_id
    WHERE invoice.id = internal_invoice_line_items.invoice_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY internal_invoice_line_items_delete_account_scope
ON public.internal_invoice_line_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = invoice.account_owner_user_id
    WHERE invoice.id = internal_invoice_line_items.invoice_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

INSERT INTO public.internal_invoice_line_items (
  invoice_id,
  sort_order,
  item_name_snapshot,
  description_snapshot,
  item_type_snapshot,
  quantity,
  unit_price,
  line_subtotal,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
SELECT
  invoice.id,
  1,
  'Existing invoice amount',
  'Backfilled from header-level internal invoice totals before line-item support.',
  'service',
  1.00,
  (invoice.total_cents::numeric / 100.0),
  (invoice.total_cents::numeric / 100.0),
  invoice.created_by_user_id,
  invoice.updated_by_user_id,
  invoice.created_at,
  invoice.updated_at
FROM public.internal_invoices invoice
WHERE invoice.total_cents > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.internal_invoice_line_items line_item
    WHERE line_item.invoice_id = invoice.id
  );

COMMIT;