-- Compliance Matters: Maintenance Agreements V1 foundation
-- Purpose: add customer-owned recurring service agreement records with
-- account-owner-scoped RLS and no job, invoice, payment, calendar, SMS, portal,
-- QBO, or automatic scheduling behavior.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_agreements (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Associations
  customer_id                  uuid        NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  primary_location_id          uuid        NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  preferred_technician_user_id uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Agreement identity / cadence
  agreement_name               text        NOT NULL,
  agreement_type               text        NOT NULL DEFAULT 'maintenance',
  frequency                    text        NOT NULL,
  next_due_date                date        NOT NULL,

  -- Default visit planning content. Copied Work Items remain editable job-level scope later.
  default_visit_scope_summary  text        NULL,
  default_visit_scope_items    jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle
  status                       text        NOT NULL DEFAULT 'draft',
  start_date                   date        NOT NULL,
  renewal_date                 date        NULL,
  internal_notes               text        NULL,

  -- Audit
  created_by_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT maintenance_agreements_name_not_blank_chk
    CHECK (length(btrim(agreement_name)) > 0),

  CONSTRAINT maintenance_agreements_type_valid_chk
    CHECK (agreement_type IN ('maintenance', 'service_plan', 'inspection', 'other')),

  CONSTRAINT maintenance_agreements_frequency_valid_chk
    CHECK (frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'custom')),

  CONSTRAINT maintenance_agreements_status_valid_chk
    CHECK (status IN ('draft', 'active', 'paused', 'expired', 'cancelled')),

  CONSTRAINT maintenance_agreements_visit_scope_items_array_chk
    CHECK (jsonb_typeof(default_visit_scope_items) = 'array')
);

CREATE INDEX IF NOT EXISTS maintenance_agreements_owner_status_due_idx
  ON public.maintenance_agreements (account_owner_user_id, status, next_due_date);

CREATE INDEX IF NOT EXISTS maintenance_agreements_customer_idx
  ON public.maintenance_agreements (customer_id, status, next_due_date);

CREATE INDEX IF NOT EXISTS maintenance_agreements_primary_location_idx
  ON public.maintenance_agreements (primary_location_id, status, next_due_date)
  WHERE primary_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_agreements_preferred_technician_idx
  ON public.maintenance_agreements (preferred_technician_user_id)
  WHERE preferred_technician_user_id IS NOT NULL;

ALTER TABLE public.maintenance_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_agreements_select_account_scope ON public.maintenance_agreements;
DROP POLICY IF EXISTS maintenance_agreements_insert_account_scope ON public.maintenance_agreements;
DROP POLICY IF EXISTS maintenance_agreements_update_account_scope ON public.maintenance_agreements;

-- SELECT: any active internal user on the same account may read agreements.
CREATE POLICY maintenance_agreements_select_account_scope
ON public.maintenance_agreements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreements.account_owner_user_id
  )
);

-- INSERT: internal user on the same account; customer/location/technician must remain in-account.
CREATE POLICY maintenance_agreements_insert_account_scope
ON public.maintenance_agreements
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreements.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = maintenance_agreements.customer_id
      AND customer.owner_user_id = maintenance_agreements.account_owner_user_id
  )
  AND (
    maintenance_agreements.primary_location_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.locations location
      WHERE location.id = maintenance_agreements.primary_location_id
        AND location.customer_id = maintenance_agreements.customer_id
        AND location.owner_user_id = maintenance_agreements.account_owner_user_id
    )
  )
  AND (
    maintenance_agreements.preferred_technician_user_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_users tech
      WHERE tech.user_id = maintenance_agreements.preferred_technician_user_id
        AND tech.is_active = true
        AND tech.account_owner_user_id = maintenance_agreements.account_owner_user_id
    )
  )
);

-- UPDATE: same account check; re-stamp updated_by and preserve in-account references.
CREATE POLICY maintenance_agreements_update_account_scope
ON public.maintenance_agreements
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreements.account_owner_user_id
  )
)
WITH CHECK (
  updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreements.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = maintenance_agreements.customer_id
      AND customer.owner_user_id = maintenance_agreements.account_owner_user_id
  )
  AND (
    maintenance_agreements.primary_location_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.locations location
      WHERE location.id = maintenance_agreements.primary_location_id
        AND location.customer_id = maintenance_agreements.customer_id
        AND location.owner_user_id = maintenance_agreements.account_owner_user_id
    )
  )
  AND (
    maintenance_agreements.preferred_technician_user_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_users tech
      WHERE tech.user_id = maintenance_agreements.preferred_technician_user_id
        AND tech.is_active = true
        AND tech.account_owner_user_id = maintenance_agreements.account_owner_user_id
    )
  )
);

-- No DELETE policy in V1. Hard delete denied for all application roles.

COMMIT;
