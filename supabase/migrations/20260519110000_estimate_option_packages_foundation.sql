-- Compliance Matters: Estimate option packages schema foundation
-- Purpose: add additive Good / Better / Best option-package tables for future
-- multi-option proposals without changing current flat estimate_line_items.
-- Scope: schema/RLS only. No UI, actions, approval, conversion, send, payment,
-- portal, QBO, SMS, or production operation behavior is altered.

BEGIN;

-- ---------------------------------------------------------------------------
-- estimate_options
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_options (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id           uuid        NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,

  -- V1 option identity / presentation
  slot_index            integer     NOT NULL,
  default_label_key     text        NULL,
  label                 text        NOT NULL,
  sort_order            integer     NOT NULL,
  summary               text        NULL,
  notes                 text        NULL,

  -- Option-scoped totals (cents / integer)
  subtotal_cents        integer     NOT NULL DEFAULT 0,
  total_cents           integer     NOT NULL DEFAULT 0,

  -- Audit
  created_by_user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT estimate_options_estimate_id_id_unique
    UNIQUE (id, estimate_id),

  CONSTRAINT estimate_options_estimate_slot_unique
    UNIQUE (estimate_id, slot_index),

  CONSTRAINT estimate_options_slot_index_v1_chk
    CHECK (slot_index BETWEEN 1 AND 3),

  CONSTRAINT estimate_options_default_label_key_valid_chk
    CHECK (
      default_label_key IS NULL
      OR default_label_key IN ('good', 'better', 'best')
    ),

  CONSTRAINT estimate_options_label_not_blank_chk
    CHECK (length(btrim(label)) > 0),

  CONSTRAINT estimate_options_sort_order_positive_chk
    CHECK (sort_order > 0),

  CONSTRAINT estimate_options_subtotal_nonnegative_chk
    CHECK (subtotal_cents >= 0),

  CONSTRAINT estimate_options_total_nonnegative_chk
    CHECK (total_cents >= 0),

  CONSTRAINT estimate_options_total_gte_subtotal_chk
    CHECK (total_cents >= subtotal_cents)
);

CREATE INDEX IF NOT EXISTS estimate_options_estimate_sort_idx
  ON public.estimate_options (estimate_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- estimate_option_line_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_option_line_items (
  id                           uuid           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_option_id           uuid           NOT NULL,
  estimate_id                  uuid           NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  sort_order                   integer        NOT NULL DEFAULT 1,

  -- Optional pricebook provenance (nullable; snapshot is authoritative)
  source_pricebook_item_id     uuid           NULL REFERENCES public.pricebook_items(id) ON DELETE SET NULL,

  -- Frozen catalog snapshots at time of option line creation
  item_name_snapshot           text           NOT NULL,
  description_snapshot         text           NULL,
  item_type_snapshot           text           NOT NULL,
  category_snapshot            text           NULL,
  unit_label_snapshot          text           NULL,

  -- Quantities / pricing
  quantity                     numeric(12,2)  NOT NULL,
  unit_price_cents             integer        NOT NULL,
  line_subtotal_cents          integer        NOT NULL,

  -- Audit
  created_by_user_id           uuid           NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id           uuid           NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at                   timestamptz    NOT NULL DEFAULT now(),
  updated_at                   timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT estimate_option_line_items_option_estimate_fk
    FOREIGN KEY (estimate_option_id, estimate_id)
    REFERENCES public.estimate_options (id, estimate_id)
    ON DELETE CASCADE,

  CONSTRAINT estimate_option_line_items_sort_order_positive_chk
    CHECK (sort_order > 0),

  CONSTRAINT estimate_option_line_items_item_name_not_blank_chk
    CHECK (length(btrim(item_name_snapshot)) > 0),

  CONSTRAINT estimate_option_line_items_item_type_not_blank_chk
    CHECK (length(btrim(item_type_snapshot)) > 0),

  CONSTRAINT estimate_option_line_items_quantity_positive_chk
    CHECK (quantity > 0),

  CONSTRAINT estimate_option_line_items_unit_price_nonnegative_chk
    CHECK (unit_price_cents >= 0),

  CONSTRAINT estimate_option_line_items_line_subtotal_nonnegative_chk
    CHECK (line_subtotal_cents >= 0)
);

CREATE INDEX IF NOT EXISTS estimate_option_line_items_option_sort_idx
  ON public.estimate_option_line_items (estimate_option_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS estimate_option_line_items_estimate_idx
  ON public.estimate_option_line_items (estimate_id);

CREATE INDEX IF NOT EXISTS estimate_option_line_items_source_pricebook_idx
  ON public.estimate_option_line_items (source_pricebook_item_id)
  WHERE source_pricebook_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS - estimate_options
-- ---------------------------------------------------------------------------

ALTER TABLE public.estimate_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_options_select_account_scope ON public.estimate_options;
DROP POLICY IF EXISTS estimate_options_insert_account_scope ON public.estimate_options;
DROP POLICY IF EXISTS estimate_options_update_account_scope ON public.estimate_options;

CREATE POLICY estimate_options_select_account_scope
ON public.estimate_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_options.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY estimate_options_insert_account_scope
ON public.estimate_options
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_options.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY estimate_options_update_account_scope
ON public.estimate_options
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_options.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_options.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

-- No DELETE policy for estimate_options in this foundation slice.

-- ---------------------------------------------------------------------------
-- RLS - estimate_option_line_items
-- ---------------------------------------------------------------------------

ALTER TABLE public.estimate_option_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_option_line_items_select_account_scope ON public.estimate_option_line_items;
DROP POLICY IF EXISTS estimate_option_line_items_insert_account_scope ON public.estimate_option_line_items;
DROP POLICY IF EXISTS estimate_option_line_items_update_account_scope ON public.estimate_option_line_items;
DROP POLICY IF EXISTS estimate_option_line_items_delete_account_scope ON public.estimate_option_line_items;

CREATE POLICY estimate_option_line_items_select_account_scope
ON public.estimate_option_line_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_option_line_items.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY estimate_option_line_items_insert_account_scope
ON public.estimate_option_line_items
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_option_line_items.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

CREATE POLICY estimate_option_line_items_update_account_scope
ON public.estimate_option_line_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_option_line_items.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_option_line_items.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

-- DELETE matches the current flat estimate_line_items correction posture.
-- Draft-only lifecycle enforcement belongs in future action/server logic.
CREATE POLICY estimate_option_line_items_delete_account_scope
ON public.estimate_option_line_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id = estimate_option_line_items.estimate_id
      AND actor.user_id = auth.uid()
      AND actor.is_active = true
  )
);

COMMIT;
