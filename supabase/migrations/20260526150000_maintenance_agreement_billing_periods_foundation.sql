-- Compliance Matters: service plan billing period schema foundation (Phase 5C)
-- Purpose: add additive billing-period coverage schema with account-scoped guards
-- without changing invoice generation, payment behavior, or operational workflows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_agreement_billing_periods (
  id                           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  maintenance_agreement_id     uuid        NOT NULL REFERENCES public.maintenance_agreements(id) ON DELETE RESTRICT,
  customer_id                  uuid        NULL REFERENCES public.customers(id) ON DELETE SET NULL,

  coverage_start_date          date        NOT NULL,
  coverage_end_date            date        NOT NULL,
  billing_due_date             date        NULL,
  billing_cadence              text        NOT NULL,
  amount_due_cents             integer     NOT NULL,
  currency                     text        NOT NULL DEFAULT 'usd',
  billing_posture              text        NOT NULL,
  billing_period_status        text        NOT NULL,

  internal_invoice_id          uuid        NULL REFERENCES public.internal_invoices(id) ON DELETE SET NULL,
  external_reference           text        NULL,
  external_notes               text        NULL,
  status_reason                text        NULL,

  created_at                   timestamptz NOT NULL DEFAULT now(),
  created_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT maintenance_agreement_billing_periods_coverage_window_valid_chk
    CHECK (coverage_end_date >= coverage_start_date),

  CONSTRAINT maintenance_agreement_billing_periods_amount_nonnegative_chk
    CHECK (amount_due_cents >= 0),

  CONSTRAINT maintenance_agreement_billing_periods_currency_iso3_lower_chk
    CHECK (currency ~ '^[a-z]{3}$'),

  CONSTRAINT maintenance_agreement_billing_periods_status_valid_chk
    CHECK (
      billing_period_status IN (
        'draft',
        'pending_billing',
        'invoice_linked',
        'externally_billed',
        'no_charge',
        'waived',
        'not_billed',
        'cancelled'
      )
    ),

  CONSTRAINT maintenance_agreement_billing_periods_posture_valid_chk
    CHECK (
      billing_posture IN (
        'internal_invoice',
        'external_off_platform',
        'manual',
        'no_charge',
        'waived',
        'not_billed_through_compliance_matters'
      )
    ),

  CONSTRAINT maintenance_agreement_billing_periods_unique_coverage_window
    UNIQUE (
      account_owner_user_id,
      maintenance_agreement_id,
      coverage_start_date,
      coverage_end_date
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ma_billing_periods_internal_invoice_unique_idx
  ON public.maintenance_agreement_billing_periods (internal_invoice_id)
  WHERE internal_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_agreement_billing_periods_owner_agreement_idx
  ON public.maintenance_agreement_billing_periods (account_owner_user_id, maintenance_agreement_id, coverage_start_date);

CREATE INDEX IF NOT EXISTS maintenance_agreement_billing_periods_owner_status_idx
  ON public.maintenance_agreement_billing_periods (account_owner_user_id, billing_period_status, coverage_start_date);

CREATE INDEX IF NOT EXISTS maintenance_agreement_billing_periods_customer_idx
  ON public.maintenance_agreement_billing_periods (customer_id)
  WHERE customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS maintenance_agreement_billing_periods_set_updated_at
  ON public.maintenance_agreement_billing_periods;

CREATE TRIGGER maintenance_agreement_billing_periods_set_updated_at
BEFORE UPDATE ON public.maintenance_agreement_billing_periods
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_maintenance_agreement_billing_period_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  agreement_owner_id uuid;
  agreement_customer_id uuid;
  invoice_owner_id uuid;
  invoice_customer_id uuid;
BEGIN
  SELECT agreement.account_owner_user_id, agreement.customer_id
  INTO agreement_owner_id, agreement_customer_id
  FROM public.maintenance_agreements agreement
  WHERE agreement.id = NEW.maintenance_agreement_id;

  IF agreement_owner_id IS NULL OR agreement_customer_id IS NULL THEN
    RAISE EXCEPTION 'maintenance_agreement_billing_periods maintenance agreement not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM agreement_owner_id THEN
    RAISE EXCEPTION 'maintenance_agreement_billing_periods agreement/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM agreement_customer_id THEN
    RAISE EXCEPTION 'maintenance_agreement_billing_periods customer must match maintenance agreement customer'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.internal_invoice_id IS NOT NULL THEN
    SELECT invoice.account_owner_user_id, invoice.customer_id
    INTO invoice_owner_id, invoice_customer_id
    FROM public.internal_invoices invoice
    WHERE invoice.id = NEW.internal_invoice_id;

    IF invoice_owner_id IS NULL THEN
      RAISE EXCEPTION 'maintenance_agreement_billing_periods internal invoice not found'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.account_owner_user_id IS DISTINCT FROM invoice_owner_id THEN
      RAISE EXCEPTION 'maintenance_agreement_billing_periods internal invoice/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF invoice_customer_id IS NOT NULL AND invoice_customer_id IS DISTINCT FROM agreement_customer_id THEN
      RAISE EXCEPTION 'maintenance_agreement_billing_periods invoice customer must match maintenance agreement customer'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.customer_id IS NOT NULL AND invoice_customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM invoice_customer_id THEN
      RAISE EXCEPTION 'maintenance_agreement_billing_periods customer/invoice mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_agreement_billing_periods_assert_scope
  ON public.maintenance_agreement_billing_periods;

CREATE TRIGGER maintenance_agreement_billing_periods_assert_scope
BEFORE INSERT OR UPDATE ON public.maintenance_agreement_billing_periods
FOR EACH ROW
EXECUTE FUNCTION public.assert_maintenance_agreement_billing_period_scope();

ALTER TABLE public.maintenance_agreement_billing_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_agreement_billing_periods_select_account_scope
  ON public.maintenance_agreement_billing_periods;
DROP POLICY IF EXISTS maintenance_agreement_billing_periods_insert_account_scope
  ON public.maintenance_agreement_billing_periods;
DROP POLICY IF EXISTS maintenance_agreement_billing_periods_update_account_scope
  ON public.maintenance_agreement_billing_periods;

CREATE POLICY maintenance_agreement_billing_periods_select_account_scope
ON public.maintenance_agreement_billing_periods
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
  )
);

CREATE POLICY maintenance_agreement_billing_periods_insert_account_scope
ON public.maintenance_agreement_billing_periods
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_agreements agreement
    WHERE agreement.id = maintenance_agreement_billing_periods.maintenance_agreement_id
      AND agreement.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
  )
  AND (
    maintenance_agreement_billing_periods.customer_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.customers customer
      WHERE customer.id = maintenance_agreement_billing_periods.customer_id
        AND customer.owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
    )
  )
  AND (
    maintenance_agreement_billing_periods.internal_invoice_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_invoices invoice
      WHERE invoice.id = maintenance_agreement_billing_periods.internal_invoice_id
        AND invoice.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
    )
  )
);

CREATE POLICY maintenance_agreement_billing_periods_update_account_scope
ON public.maintenance_agreement_billing_periods
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
  )
)
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_agreements agreement
    WHERE agreement.id = maintenance_agreement_billing_periods.maintenance_agreement_id
      AND agreement.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
  )
  AND (
    maintenance_agreement_billing_periods.customer_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.customers customer
      WHERE customer.id = maintenance_agreement_billing_periods.customer_id
        AND customer.owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
    )
  )
  AND (
    maintenance_agreement_billing_periods.internal_invoice_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.internal_invoices invoice
      WHERE invoice.id = maintenance_agreement_billing_periods.internal_invoice_id
        AND invoice.account_owner_user_id = maintenance_agreement_billing_periods.account_owner_user_id
    )
  )
);

-- No DELETE policy in this foundation slice.

COMMIT;