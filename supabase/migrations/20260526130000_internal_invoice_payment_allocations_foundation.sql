-- Compliance Matters: invoice payment allocation foundation (Phase 4C)
-- Purpose: add additive allocation table foundation without changing current
-- payment recording or invoice projection read paths.

BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_invoice_payment_allocations (
  id                                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_internal_invoice_payment_id uuid       NOT NULL REFERENCES public.internal_invoice_payments(id) ON DELETE RESTRICT,
  target_invoice_id                 uuid        NOT NULL REFERENCES public.internal_invoices(id) ON DELETE RESTRICT,
  allocated_amount_cents            integer     NOT NULL,
  allocation_status                 text        NOT NULL,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  created_by_user_id                uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status_changed_at                 timestamptz NULL,
  status_changed_by_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status_change_reason              text        NULL,
  allocation_source_kind            text        NOT NULL DEFAULT 'invoice_payment_record',

  CONSTRAINT internal_invoice_payment_allocations_source_unique
    UNIQUE (source_internal_invoice_payment_id),

  CONSTRAINT internal_invoice_payment_allocations_status_valid_chk
    CHECK (allocation_status IN ('active', 'inactive', 'reversed', 'voided')),

  CONSTRAINT internal_invoice_payment_allocations_source_kind_valid_chk
    CHECK (allocation_source_kind IN ('invoice_payment_record'))
);

CREATE INDEX IF NOT EXISTS internal_invoice_payment_allocations_owner_status_idx
  ON public.internal_invoice_payment_allocations (account_owner_user_id, allocation_status);

CREATE INDEX IF NOT EXISTS internal_invoice_payment_allocations_owner_invoice_status_idx
  ON public.internal_invoice_payment_allocations (account_owner_user_id, target_invoice_id, allocation_status);

CREATE INDEX IF NOT EXISTS internal_invoice_payment_allocations_target_invoice_idx
  ON public.internal_invoice_payment_allocations (target_invoice_id);

CREATE INDEX IF NOT EXISTS internal_invoice_payment_allocations_active_invoice_idx
  ON public.internal_invoice_payment_allocations (target_invoice_id)
  WHERE allocation_status = 'active';

-- Enforce first-posture account and source/target consistency at write time:
-- source payment and target invoice must both be in the same account as the row,
-- and target invoice must match the existing invoice-bound source payment.
CREATE OR REPLACE FUNCTION public.assert_internal_invoice_payment_allocation_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_owner_id uuid;
  source_invoice_id uuid;
  target_owner_id uuid;
BEGIN
  SELECT payment.account_owner_user_id, payment.invoice_id
  INTO source_owner_id, source_invoice_id
  FROM public.internal_invoice_payments payment
  WHERE payment.id = NEW.source_internal_invoice_payment_id;

  IF source_owner_id IS NULL OR source_invoice_id IS NULL THEN
    RAISE EXCEPTION 'internal_invoice_payment_allocations source payment not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM source_owner_id THEN
    RAISE EXCEPTION 'internal_invoice_payment_allocations source payment/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.target_invoice_id IS DISTINCT FROM source_invoice_id THEN
    RAISE EXCEPTION 'internal_invoice_payment_allocations target invoice must match source payment invoice in V1 posture'
      USING ERRCODE = '23514';
  END IF;

  SELECT invoice.account_owner_user_id
  INTO target_owner_id
  FROM public.internal_invoices invoice
  WHERE invoice.id = NEW.target_invoice_id;

  IF target_owner_id IS NULL THEN
    RAISE EXCEPTION 'internal_invoice_payment_allocations target invoice not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM target_owner_id THEN
    RAISE EXCEPTION 'internal_invoice_payment_allocations target invoice/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_invoice_payment_allocations_assert_scope
  ON public.internal_invoice_payment_allocations;

CREATE TRIGGER internal_invoice_payment_allocations_assert_scope
BEFORE INSERT OR UPDATE ON public.internal_invoice_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION public.assert_internal_invoice_payment_allocation_scope();

ALTER TABLE public.internal_invoice_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_invoice_payment_allocations_select_account_scope
  ON public.internal_invoice_payment_allocations;
DROP POLICY IF EXISTS internal_invoice_payment_allocations_insert_account_scope
  ON public.internal_invoice_payment_allocations;
DROP POLICY IF EXISTS internal_invoice_payment_allocations_update_account_scope
  ON public.internal_invoice_payment_allocations;

CREATE POLICY internal_invoice_payment_allocations_select_account_scope
ON public.internal_invoice_payment_allocations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
  )
);

CREATE POLICY internal_invoice_payment_allocations_insert_account_scope
ON public.internal_invoice_payment_allocations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
  )
  AND (
    created_by_user_id IS NULL
    OR created_by_user_id = auth.uid()
  )
  AND (
    status_changed_by_user_id IS NULL
    OR status_changed_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoice_payments payment
    WHERE payment.id = internal_invoice_payment_allocations.source_internal_invoice_payment_id
      AND payment.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
      AND payment.invoice_id = internal_invoice_payment_allocations.target_invoice_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    WHERE invoice.id = internal_invoice_payment_allocations.target_invoice_id
      AND invoice.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
  )
);

CREATE POLICY internal_invoice_payment_allocations_update_account_scope
ON public.internal_invoice_payment_allocations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
  )
  AND (
    created_by_user_id IS NULL
    OR created_by_user_id = auth.uid()
  )
  AND (
    status_changed_by_user_id IS NULL
    OR status_changed_by_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoice_payments payment
    WHERE payment.id = internal_invoice_payment_allocations.source_internal_invoice_payment_id
      AND payment.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
      AND payment.invoice_id = internal_invoice_payment_allocations.target_invoice_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_invoices invoice
    WHERE invoice.id = internal_invoice_payment_allocations.target_invoice_id
      AND invoice.account_owner_user_id = internal_invoice_payment_allocations.account_owner_user_id
  )
);

-- No DELETE policy in this foundation slice.

COMMIT;
