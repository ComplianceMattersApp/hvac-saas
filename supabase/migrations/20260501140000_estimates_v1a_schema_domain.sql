-- Compliance Matters: Estimates V1A — schema foundation
-- Purpose: Add commercial-truth estimate foundation.
--   estimates, estimate_line_items, estimate_events tables with
--   account-owner-scoped RLS (internal users only, V1).
-- Scope: Estimate domain only. No invoice, Visit Scope, Pricebook, or job behavior is altered.
-- Non-goals: UI, customer approval, estimate-to-invoice conversion, email, PDF, payment.

BEGIN;

-- ---------------------------------------------------------------------------
-- estimates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimates (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Numbering / identity
  estimate_number        text        NOT NULL,

  -- Associations
  customer_id            uuid        NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  location_id            uuid        NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  service_case_id        uuid        NULL REFERENCES public.service_cases(id) ON DELETE SET NULL,
  origin_job_id          uuid        NULL REFERENCES public.jobs(id) ON DELETE SET NULL,

  -- Status lifecycle
  status                 text        NOT NULL DEFAULT 'draft',

  -- Content
  title                  text        NOT NULL,
  notes                  text        NULL,

  -- Totals (cents / integer)
  subtotal_cents         integer     NOT NULL DEFAULT 0,
  total_cents            integer     NOT NULL DEFAULT 0,

  -- Status timestamps (set once when status transitions occur)
  sent_at                timestamptz NULL,
  approved_at            timestamptz NULL,
  declined_at            timestamptz NULL,
  expired_at             timestamptz NULL,
  cancelled_at           timestamptz NULL,
  converted_at           timestamptz NULL,

  -- Audit
  created_by_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT estimates_status_valid_chk
    CHECK (status IN ('draft', 'sent', 'approved', 'declined', 'expired', 'cancelled', 'converted')),

  CONSTRAINT estimates_estimate_number_not_blank_chk
    CHECK (length(btrim(estimate_number)) > 0),

  CONSTRAINT estimates_title_not_blank_chk
    CHECK (length(btrim(title)) > 0),

  CONSTRAINT estimates_subtotal_nonnegative_chk
    CHECK (subtotal_cents >= 0),

  CONSTRAINT estimates_total_nonnegative_chk
    CHECK (total_cents >= 0),

  CONSTRAINT estimates_total_gte_subtotal_chk
    CHECK (total_cents >= subtotal_cents),

  -- Status timestamp consistency
  CONSTRAINT estimates_sent_requires_timestamp_chk
    CHECK (status <> 'sent' OR sent_at IS NOT NULL),

  CONSTRAINT estimates_approved_requires_timestamp_chk
    CHECK (status <> 'approved' OR approved_at IS NOT NULL),

  CONSTRAINT estimates_declined_requires_timestamp_chk
    CHECK (status <> 'declined' OR declined_at IS NOT NULL),

  CONSTRAINT estimates_expired_requires_timestamp_chk
    CHECK (status <> 'expired' OR expired_at IS NOT NULL),

  CONSTRAINT estimates_cancelled_requires_timestamp_chk
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),

  CONSTRAINT estimates_converted_requires_timestamp_chk
    CHECK (status <> 'converted' OR converted_at IS NOT NULL),

  CONSTRAINT estimates_draft_no_terminal_timestamps_chk
    CHECK (
      status <> 'draft'
      OR (
        sent_at IS NULL
        AND approved_at IS NULL
        AND declined_at IS NULL
        AND expired_at IS NULL
        AND cancelled_at IS NULL
        AND converted_at IS NULL
      )
    )
);

-- Unique estimate number per account
CREATE UNIQUE INDEX IF NOT EXISTS estimates_owner_number_unique_idx
  ON public.estimates (account_owner_user_id, estimate_number);

-- Primary list query: account scoped, status, recency
CREATE INDEX IF NOT EXISTS estimates_owner_status_created_idx
  ON public.estimates (account_owner_user_id, status, created_at DESC);

-- Lookup by customer
CREATE INDEX IF NOT EXISTS estimates_customer_idx
  ON public.estimates (customer_id)
  WHERE customer_id IS NOT NULL;

-- Lookup by service case
CREATE INDEX IF NOT EXISTS estimates_service_case_idx
  ON public.estimates (service_case_id)
  WHERE service_case_id IS NOT NULL;

-- Lookup by origin job
CREATE INDEX IF NOT EXISTS estimates_origin_job_idx
  ON public.estimates (origin_job_id)
  WHERE origin_job_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- estimate_line_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id                           uuid           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id                  uuid           NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  sort_order                   integer        NOT NULL DEFAULT 1,

  -- Optional pricebook provenance (nullable; snapshot is authoritative)
  source_pricebook_item_id     uuid           NULL REFERENCES public.pricebook_items(id) ON DELETE SET NULL,

  -- Frozen catalog snapshots at time of line item creation
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

  CONSTRAINT estimate_line_items_sort_order_positive_chk
    CHECK (sort_order > 0),

  CONSTRAINT estimate_line_items_item_name_not_blank_chk
    CHECK (length(btrim(item_name_snapshot)) > 0),

  CONSTRAINT estimate_line_items_item_type_not_blank_chk
    CHECK (length(btrim(item_type_snapshot)) > 0),

  CONSTRAINT estimate_line_items_quantity_positive_chk
    CHECK (quantity > 0),

  CONSTRAINT estimate_line_items_unit_price_nonnegative_chk
    CHECK (unit_price_cents >= 0),

  CONSTRAINT estimate_line_items_line_subtotal_nonnegative_chk
    CHECK (line_subtotal_cents >= 0)
);

-- Primary read: lines for an estimate in order
CREATE INDEX IF NOT EXISTS estimate_line_items_estimate_sort_idx
  ON public.estimate_line_items (estimate_id, sort_order, created_at);

-- Provenance: find lines sourced from a specific pricebook item
CREATE INDEX IF NOT EXISTS estimate_line_items_source_pricebook_idx
  ON public.estimate_line_items (source_pricebook_item_id)
  WHERE source_pricebook_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- estimate_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_events (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id  uuid        NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  event_type   text        NOT NULL,
  meta         jsonb       NULL,
  user_id      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT estimate_events_event_type_not_blank_chk
    CHECK (length(btrim(event_type)) > 0)
);

-- Primary read: event log for an estimate, chronological
CREATE INDEX IF NOT EXISTS estimate_events_estimate_created_idx
  ON public.estimate_events (estimate_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — estimates
-- ---------------------------------------------------------------------------

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimates_select_account_scope ON public.estimates;
DROP POLICY IF EXISTS estimates_insert_account_scope ON public.estimates;
DROP POLICY IF EXISTS estimates_update_account_scope ON public.estimates;

-- SELECT: any active internal user on the same account may read estimates.
CREATE POLICY estimates_select_account_scope
ON public.estimates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id   = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimates.account_owner_user_id
  )
);

-- INSERT: internal user; must stamp created_by / updated_by with their own uid.
CREATE POLICY estimates_insert_account_scope
ON public.estimates
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id   = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimates.account_owner_user_id
  )
);

-- UPDATE: internal user on same account; must re-stamp updated_by.
CREATE POLICY estimates_update_account_scope
ON public.estimates
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id   = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimates.account_owner_user_id
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id   = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = estimates.account_owner_user_id
  )
);

-- No DELETE policy in V1. Hard delete denied for all application roles.

-- ---------------------------------------------------------------------------
-- RLS — estimate_line_items
-- ---------------------------------------------------------------------------

ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_line_items_select_account_scope ON public.estimate_line_items;
DROP POLICY IF EXISTS estimate_line_items_insert_account_scope ON public.estimate_line_items;
DROP POLICY IF EXISTS estimate_line_items_update_account_scope ON public.estimate_line_items;
DROP POLICY IF EXISTS estimate_line_items_delete_account_scope ON public.estimate_line_items;

-- SELECT: join through parent estimate to verify account membership.
CREATE POLICY estimate_line_items_select_account_scope
ON public.estimate_line_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id          = estimate_line_items.estimate_id
      AND actor.user_id   = auth.uid()
      AND actor.is_active = true
  )
);

-- INSERT: line item must resolve to an estimate the actor can access.
CREATE POLICY estimate_line_items_insert_account_scope
ON public.estimate_line_items
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
    WHERE est.id          = estimate_line_items.estimate_id
      AND actor.user_id   = auth.uid()
      AND actor.is_active = true
  )
);

-- UPDATE: same account check; re-stamp updated_by.
CREATE POLICY estimate_line_items_update_account_scope
ON public.estimate_line_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id          = estimate_line_items.estimate_id
      AND actor.user_id   = auth.uid()
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
    WHERE est.id          = estimate_line_items.estimate_id
      AND actor.user_id   = auth.uid()
      AND actor.is_active = true
  )
);

-- DELETE: line items may be removed (reordering / corrections pre-send).
CREATE POLICY estimate_line_items_delete_account_scope
ON public.estimate_line_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id          = estimate_line_items.estimate_id
      AND actor.user_id   = auth.uid()
      AND actor.is_active = true
  )
);

-- ---------------------------------------------------------------------------
-- RLS — estimate_events
-- ---------------------------------------------------------------------------

ALTER TABLE public.estimate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_events_select_account_scope ON public.estimate_events;
DROP POLICY IF EXISTS estimate_events_insert_account_scope ON public.estimate_events;

-- SELECT: join through parent estimate.
CREATE POLICY estimate_events_select_account_scope
ON public.estimate_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id          = estimate_events.estimate_id
      AND actor.user_id   = auth.uid()
      AND actor.is_active = true
  )
);

-- INSERT: internal users may append events to estimates on their account.
CREATE POLICY estimate_events_insert_account_scope
ON public.estimate_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.estimates est
    JOIN public.internal_users actor
      ON actor.account_owner_user_id = est.account_owner_user_id
    WHERE est.id          = estimate_events.estimate_id
      AND actor.user_id   = auth.uid()
      AND actor.is_active = true
  )
);

-- No UPDATE or DELETE policy for event log rows.

COMMIT;
