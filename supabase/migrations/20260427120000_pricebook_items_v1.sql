-- Compliance Matters: pricebook items v1
-- Purpose: create the account-owner-scoped reusable catalog of billable items
-- (Pricebook V1 schema + RLS, Slice A).
-- Scope: Pricebook domain only. No existing tables are altered.
-- No hard delete in V1. No DELETE policy is created.
-- Integration with invoice/estimate line items is deferred to Slice C.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pricebook_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  item_type text NOT NULL,
  category text NULL,
  default_description text NULL,
  default_unit_price numeric(10,2) NOT NULL DEFAULT 0.00,
  unit_label text NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_starter boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pricebook_items_item_name_not_blank
    CHECK (length(btrim(item_name)) > 0),
  CONSTRAINT pricebook_items_item_type_valid
    CHECK (item_type IN ('service', 'material', 'diagnostic', 'adjustment')),
  CONSTRAINT pricebook_items_unit_price_non_negative
    CHECK (default_unit_price >= -99999.99)
);

-- Index: account-owner scoped list queries (primary catalog read pattern)
CREATE INDEX IF NOT EXISTS pricebook_items_owner_active_idx
  ON public.pricebook_items (account_owner_user_id, is_active);

-- Index: account-owner scoped type queries
CREATE INDEX IF NOT EXISTS pricebook_items_owner_type_idx
  ON public.pricebook_items (account_owner_user_id, item_type);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.pricebook_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricebook_items_select_account_scope ON public.pricebook_items;
DROP POLICY IF EXISTS pricebook_items_insert_account_scope ON public.pricebook_items;
DROP POLICY IF EXISTS pricebook_items_update_account_scope ON public.pricebook_items;

-- SELECT: any internal user of the same account may read catalog rows.
CREATE POLICY pricebook_items_select_account_scope
ON public.pricebook_items
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

-- INSERT: any internal user of the same account may add catalog items.
-- The new row must carry the correct account_owner_user_id for the account.
CREATE POLICY pricebook_items_insert_account_scope
ON public.pricebook_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

-- UPDATE: any internal user of the same account may edit or deactivate items.
-- Hard delete is not supported in V1; no DELETE policy is created.
CREATE POLICY pricebook_items_update_account_scope
ON public.pricebook_items
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

-- No DELETE policy. Hard delete denied for all application roles in V1.

COMMIT;
