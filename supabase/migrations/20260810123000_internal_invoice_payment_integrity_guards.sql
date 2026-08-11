-- EveryStep FieldWorks: payment ledger integrity guards
--
-- Payment truth is written by several independent paths (manual entry, field
-- verification, Checkout webhooks, saved cards, and autopay). Application-level
-- balance checks are necessary for good UX but cannot prevent two concurrent
-- transactions from both observing the same balance. These triggers make the
-- database the final authority for account scope, invoice scope, overpayment,
-- and allocation projection consistency.

BEGIN;

ALTER TABLE public.internal_invoice_payments
  ADD COLUMN IF NOT EXISTS collection_reservation_key text;

ALTER TABLE public.internal_invoice_payments
  DROP CONSTRAINT IF EXISTS internal_invoice_payments_refund_amount_valid_chk;
ALTER TABLE public.internal_invoice_payments
  ADD CONSTRAINT internal_invoice_payments_refund_amount_valid_chk
  CHECK (
    stripe_refunded_amount_cents IS NULL
    OR (
      stripe_refunded_amount_cents >= 0
      AND stripe_refunded_amount_cents <= amount_cents
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoice_payments_collection_operation_unique
  ON public.internal_invoice_payments (account_owner_user_id, collection_reservation_key)
  WHERE collection_reservation_key IS NOT NULL;

ALTER TABLE public.internal_invoice_payments
  DROP CONSTRAINT IF EXISTS internal_invoice_payments_stripe_identity_dedupe_scope_valid_chk;

ALTER TABLE public.internal_invoice_payments
  ADD CONSTRAINT internal_invoice_payments_stripe_identity_dedupe_scope_valid_chk
  CHECK (
    stripe_identity_dedupe_scope IS NULL
    OR stripe_identity_dedupe_scope IN ('recorded_v1', 'checkout_v1')
  );

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoice_payments_checkout_v1_session_unique
  ON public.internal_invoice_payments (
    account_owner_user_id,
    stripe_checkout_session_id
  )
  WHERE stripe_identity_dedupe_scope = 'checkout_v1'
    AND payment_status = 'pending'
    AND stripe_checkout_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_internal_invoice_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  invoice_owner_id uuid;
  invoice_job_id uuid;
  invoice_status text;
  invoice_total_cents integer;
  other_recorded_cents bigint;
BEGIN
  -- Refund events expose a cumulative amount and can be delivered out of
  -- order. Preserve the largest amount already observed so an older replay
  -- cannot silently re-close part of a legitimately reopened balance.
  IF TG_OP = 'UPDATE'
    AND COALESCE(NEW.stripe_refunded_amount_cents, 0)
      < COALESCE(OLD.stripe_refunded_amount_cents, 0)
  THEN
    NEW.stripe_refunded_amount_cents := OLD.stripe_refunded_amount_cents;
  END IF;

  -- Lock the invoice row so all payment inserts/promotions for one invoice are
  -- serialized before the recorded total is calculated.
  SELECT
    invoice.account_owner_user_id,
    invoice.job_id,
    invoice.status,
    invoice.total_cents
  INTO
    invoice_owner_id,
    invoice_job_id,
    invoice_status,
    invoice_total_cents
  FROM public.internal_invoices invoice
  WHERE invoice.id = NEW.invoice_id
  FOR UPDATE;

  IF invoice_owner_id IS NULL OR invoice_job_id IS NULL THEN
    RAISE EXCEPTION 'internal invoice payment invoice not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM invoice_owner_id THEN
    RAISE EXCEPTION 'internal invoice payment account does not match invoice'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.job_id IS DISTINCT FROM invoice_job_id THEN
    RAISE EXCEPTION 'internal invoice payment job does not match invoice'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.payment_status = 'recorded' THEN
    IF invoice_status IS DISTINCT FROM 'issued' THEN
      RAISE EXCEPTION 'recorded payment requires an issued invoice'
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(GREATEST(payment.amount_cents - COALESCE(payment.stripe_refunded_amount_cents, 0), 0)), 0)
    INTO other_recorded_cents
    FROM public.internal_invoice_payments payment
    WHERE payment.invoice_id = NEW.invoice_id
      AND payment.payment_status = 'recorded'
      AND payment.id IS DISTINCT FROM NEW.id;

    IF other_recorded_cents
      + GREATEST(NEW.amount_cents - COALESCE(NEW.stripe_refunded_amount_cents, 0), 0)
      > invoice_total_cents
    THEN
      RAISE EXCEPTION 'recorded payments would exceed invoice total'
        USING
          ERRCODE = '23514',
          DETAIL = format(
            'invoice_id=%s invoice_total_cents=%s other_recorded_cents=%s attempted_amount_cents=%s',
            NEW.invoice_id,
            invoice_total_cents,
            other_recorded_cents,
            NEW.amount_cents
          );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_invoice_payments_assert_integrity
  ON public.internal_invoice_payments;

CREATE TRIGGER internal_invoice_payments_assert_integrity
BEFORE INSERT OR UPDATE OF
  account_owner_user_id,
  invoice_id,
  job_id,
  amount_cents,
  stripe_refunded_amount_cents,
  payment_status
ON public.internal_invoice_payments
FOR EACH ROW
EXECUTE FUNCTION public.assert_internal_invoice_payment_integrity();

CREATE OR REPLACE FUNCTION public.sync_internal_invoice_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_allocation_status text;
BEGIN
  next_allocation_status := CASE NEW.payment_status
    WHEN 'recorded' THEN 'active'
    WHEN 'reversed' THEN 'reversed'
    WHEN 'pending' THEN 'inactive'
    WHEN 'failed' THEN 'inactive'
    ELSE NULL
  END;

  IF next_allocation_status IS NULL THEN
    RAISE EXCEPTION 'unsupported payment status for invoice allocation'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.internal_invoice_payment_allocations (
    account_owner_user_id,
    source_internal_invoice_payment_id,
    target_invoice_id,
    allocated_amount_cents,
    allocation_status,
    allocation_source_kind,
    status_changed_at
  )
  VALUES (
    NEW.account_owner_user_id,
    NEW.id,
    NEW.invoice_id,
    GREATEST(NEW.amount_cents - COALESCE(NEW.stripe_refunded_amount_cents, 0), 0),
    next_allocation_status,
    'invoice_payment_record',
    now()
  )
  ON CONFLICT (source_internal_invoice_payment_id)
  DO UPDATE SET
    account_owner_user_id = EXCLUDED.account_owner_user_id,
    target_invoice_id = EXCLUDED.target_invoice_id,
    allocated_amount_cents = EXCLUDED.allocated_amount_cents,
    allocation_status = EXCLUDED.allocation_status,
    allocation_source_kind = EXCLUDED.allocation_source_kind,
    status_changed_at = CASE
      WHEN public.internal_invoice_payment_allocations.allocation_status
        IS DISTINCT FROM EXCLUDED.allocation_status
      THEN now()
      ELSE public.internal_invoice_payment_allocations.status_changed_at
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_invoice_payments_sync_allocation
  ON public.internal_invoice_payments;

CREATE TRIGGER internal_invoice_payments_sync_allocation
AFTER INSERT OR UPDATE OF
  account_owner_user_id,
  invoice_id,
  amount_cents,
  stripe_refunded_amount_cents,
  payment_status
ON public.internal_invoice_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_internal_invoice_payment_allocation();

-- Repair any historical allocation gaps before the trigger becomes the only
-- required writer. Existing rows are updated in place; payment truth is never
-- deleted or rewritten.
INSERT INTO public.internal_invoice_payment_allocations (
  account_owner_user_id,
  source_internal_invoice_payment_id,
  target_invoice_id,
  allocated_amount_cents,
  allocation_status,
  allocation_source_kind,
  status_changed_at
)
SELECT
  payment.account_owner_user_id,
  payment.id,
  payment.invoice_id,
  GREATEST(payment.amount_cents - COALESCE(payment.stripe_refunded_amount_cents, 0), 0),
  CASE payment.payment_status
    WHEN 'recorded' THEN 'active'
    WHEN 'reversed' THEN 'reversed'
    ELSE 'inactive'
  END,
  'invoice_payment_record',
  now()
FROM public.internal_invoice_payments payment
ON CONFLICT (source_internal_invoice_payment_id)
DO UPDATE SET
  account_owner_user_id = EXCLUDED.account_owner_user_id,
  target_invoice_id = EXCLUDED.target_invoice_id,
  allocated_amount_cents = EXCLUDED.allocated_amount_cents,
  allocation_status = EXCLUDED.allocation_status,
  allocation_source_kind = EXCLUDED.allocation_source_kind,
  status_changed_at = CASE
    WHEN public.internal_invoice_payment_allocations.allocation_status
      IS DISTINCT FROM EXCLUDED.allocation_status
    THEN now()
    ELSE public.internal_invoice_payment_allocations.status_changed_at
  END;

-- One live collection operation per invoice across Checkout, saved cards, and
-- scheduled autopay. This prevents two different channels from both passing a
-- read-time balance check and charging the customer concurrently.
CREATE TABLE IF NOT EXISTS public.internal_invoice_collection_reservations (
  invoice_id uuid PRIMARY KEY REFERENCES public.internal_invoices(id) ON DELETE CASCADE,
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  source_kind text NOT NULL
    CHECK (source_kind IN (
      'stripe_checkout',
      'manual_saved_method',
      'scheduled_autopay',
      'manual_off_platform',
      'field_payment_verification'
    )),
  reservation_key text NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_invoice_collection_reservations_expiry_idx
  ON public.internal_invoice_collection_reservations (expires_at);

ALTER TABLE public.internal_invoice_collection_reservations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_internal_invoice_collection_reservation(
  p_account_owner_user_id uuid,
  p_invoice_id uuid,
  p_source_kind text,
  p_reservation_key text,
  p_amount_cents integer,
  p_ttl_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_owner_id uuid;
  invoice_owner_id uuid;
  invoice_job_id uuid;
  invoice_status text;
  invoice_total_cents integer;
  recorded_cents bigint;
  current_key text;
BEGIN
  IF p_account_owner_user_id IS NULL
    OR p_invoice_id IS NULL
    OR btrim(COALESCE(p_reservation_key, '')) = ''
    OR p_source_kind NOT IN (
      'stripe_checkout',
      'manual_saved_method',
      'scheduled_autopay',
      'manual_off_platform',
      'field_payment_verification'
    )
    OR p_amount_cents <= 0
  THEN
    RETURN false;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    caller_owner_id := public.current_internal_account_owner_id();
    IF caller_owner_id IS NULL OR caller_owner_id IS DISTINCT FROM p_account_owner_user_id THEN
      RAISE EXCEPTION 'not authorized to claim invoice collection reservation'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT
    invoice.account_owner_user_id,
    invoice.job_id,
    invoice.status,
    invoice.total_cents
  INTO
    invoice_owner_id,
    invoice_job_id,
    invoice_status,
    invoice_total_cents
  FROM public.internal_invoices invoice
  WHERE invoice.id = p_invoice_id
  FOR UPDATE;

  IF invoice_owner_id IS NULL
    OR invoice_owner_id IS DISTINCT FROM p_account_owner_user_id
    OR invoice_status IS DISTINCT FROM 'issued'
  THEN
    RETURN false;
  END IF;

  -- A caller retrying an operation whose payment truth was already committed
  -- must be allowed through to the unique insert, where the application can
  -- resolve and reuse that exact payment id. Without this check, a full-balance
  -- payment retry would be rejected by the balance check before idempotency
  -- could be recognized.
  IF EXISTS (
    SELECT 1
    FROM public.internal_invoice_payments payment
    WHERE payment.account_owner_user_id = p_account_owner_user_id
      AND payment.invoice_id = p_invoice_id
      AND payment.job_id = invoice_job_id
      AND payment.collection_reservation_key = p_reservation_key
      AND payment.amount_cents = p_amount_cents
      AND payment.payment_status = 'recorded'
  ) THEN
    RETURN true;
  END IF;

  SELECT COALESCE(SUM(GREATEST(payment.amount_cents - COALESCE(payment.stripe_refunded_amount_cents, 0), 0)), 0)
  INTO recorded_cents
  FROM public.internal_invoice_payments payment
  WHERE payment.invoice_id = p_invoice_id
    AND payment.payment_status = 'recorded';

  IF recorded_cents + p_amount_cents > invoice_total_cents THEN
    RETURN false;
  END IF;

  DELETE FROM public.internal_invoice_collection_reservations reservation
  WHERE reservation.invoice_id = p_invoice_id
    AND reservation.expires_at <= now();

  SELECT reservation.reservation_key
  INTO current_key
  FROM public.internal_invoice_collection_reservations reservation
  WHERE reservation.invoice_id = p_invoice_id;

  IF current_key IS NOT NULL THEN
    IF current_key IS DISTINCT FROM p_reservation_key THEN
      RETURN false;
    END IF;

    UPDATE public.internal_invoice_collection_reservations
    SET
      source_kind = p_source_kind,
      amount_cents = p_amount_cents,
      expires_at = now() + make_interval(secs => LEAST(GREATEST(p_ttl_seconds, 60), 2678400)),
      updated_at = now()
    WHERE invoice_id = p_invoice_id
      AND reservation_key = p_reservation_key;
    RETURN true;
  END IF;

  INSERT INTO public.internal_invoice_collection_reservations (
    invoice_id,
    account_owner_user_id,
    job_id,
    source_kind,
    reservation_key,
    amount_cents,
    expires_at
  )
  VALUES (
    p_invoice_id,
    p_account_owner_user_id,
    invoice_job_id,
    p_source_kind,
    p_reservation_key,
    p_amount_cents,
    now() + make_interval(secs => LEAST(GREATEST(p_ttl_seconds, 60), 2678400))
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_internal_invoice_collection_reservation(
  p_account_owner_user_id uuid,
  p_invoice_id uuid,
  p_reservation_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_owner_id uuid;
  removed_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    caller_owner_id := public.current_internal_account_owner_id();
    IF caller_owner_id IS NULL OR caller_owner_id IS DISTINCT FROM p_account_owner_user_id THEN
      RAISE EXCEPTION 'not authorized to release invoice collection reservation'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.internal_invoice_collection_reservations reservation
  WHERE reservation.invoice_id = p_invoice_id
    AND reservation.account_owner_user_id = p_account_owner_user_id
    AND reservation.reservation_key = p_reservation_key;

  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RETURN removed_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_internal_invoice_collection_reservation(uuid, uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_internal_invoice_collection_reservation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_internal_invoice_collection_reservation(uuid, uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_internal_invoice_collection_reservation(uuid, uuid, text) TO authenticated, service_role;

COMMIT;
