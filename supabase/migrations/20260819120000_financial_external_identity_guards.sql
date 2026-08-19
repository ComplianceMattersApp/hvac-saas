-- EveryStep FieldWorks: external financial identity guards
--
-- External identities are canonical inside one tenant's provider account.
-- Stripe charges belong to one EveryStep payment; QuickBooks Payments can span
-- invoices, so their identity is canonical per invoice allocation. Application
-- checks improve errors, but only database uniqueness closes concurrency races.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoices_owner_qbo_invoice_identity_unique
  ON public.internal_invoices (account_owner_user_id, (btrim(qbo_invoice_id)))
  WHERE NULLIF(btrim(qbo_invoice_id), '') IS NOT NULL;

-- A single QBO Payment may legitimately allocate across several invoices. Its
-- identity must be unique for each EveryStep invoice allocation, not globally.
CREATE UNIQUE INDEX IF NOT EXISTS internal_inv_pay_owner_invoice_qbo_payment_uidx
  ON public.internal_invoice_payments (account_owner_user_id, invoice_id, (btrim(qbo_payment_id)))
  WHERE NULLIF(btrim(qbo_payment_id), '') IS NOT NULL;

ALTER TABLE public.internal_invoices
  DROP CONSTRAINT IF EXISTS internal_invoices_qbo_synced_requires_identity_chk;
ALTER TABLE public.internal_invoices
  ADD CONSTRAINT internal_invoices_qbo_synced_requires_identity_chk
  CHECK (qbo_sync_status IS DISTINCT FROM 'synced' OR NULLIF(btrim(qbo_invoice_id), '') IS NOT NULL)
  NOT VALID;
ALTER TABLE public.internal_invoices
  VALIDATE CONSTRAINT internal_invoices_qbo_synced_requires_identity_chk;

ALTER TABLE public.internal_invoice_payments
  DROP CONSTRAINT IF EXISTS internal_invoice_payments_qbo_synced_requires_identity_chk;
ALTER TABLE public.internal_invoice_payments
  ADD CONSTRAINT internal_invoice_payments_qbo_synced_requires_identity_chk
  CHECK (qbo_sync_status IS DISTINCT FROM 'synced' OR NULLIF(btrim(qbo_payment_id), '') IS NOT NULL)
  NOT VALID;
ALTER TABLE public.internal_invoice_payments
  VALIDATE CONSTRAINT internal_invoice_payments_qbo_synced_requires_identity_chk;

-- Every future Stripe ledger row must opt into a database-enforced identity
-- lifecycle. attempt_v1 keeps failed Charge history without making a failed
-- PaymentIntent/Checkout Session conflict with its eventual successful row.
ALTER TABLE public.internal_invoice_payments
  DROP CONSTRAINT IF EXISTS internal_invoice_payments_stripe_identity_dedupe_scope_valid_ch;
ALTER TABLE public.internal_invoice_payments
  ADD CONSTRAINT internal_inv_pay_stripe_scope_valid_chk
  CHECK (
    stripe_identity_dedupe_scope IS NULL
    OR stripe_identity_dedupe_scope IN ('recorded_v1', 'checkout_v1', 'attempt_v1')
  );

CREATE OR REPLACE FUNCTION public.assert_internal_invoice_payment_stripe_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  identity_scope text := NULLIF(btrim(NEW.stripe_identity_dedupe_scope), '');
  has_stripe_semantics boolean;
  identity_relevant_update boolean := false;
BEGIN
  has_stripe_semantics := (
    lower(btrim(COALESCE(NEW.processor_name, ''))) = 'stripe'
    OR NEW.payment_method = 'card_stripe_online'
    OR identity_scope IS NOT NULL
    OR NULLIF(btrim(NEW.stripe_checkout_session_id), '') IS NOT NULL
    OR NULLIF(btrim(NEW.stripe_payment_intent_id), '') IS NOT NULL
    OR NULLIF(btrim(NEW.stripe_event_id), '') IS NOT NULL
    OR (
      NULLIF(btrim(NEW.processor_charge_id), '') IS NOT NULL
      AND btrim(NEW.processor_charge_id) ~ '^ch_'
    )
  );

  IF NOT has_stripe_semantics THEN
    RETURN NEW;
  END IF;

  -- Existing NULL-scope rows are immutable with respect to money and Stripe
  -- identity, but unrelated accounting/audit updates remain possible. INSERTs
  -- can never use this legacy exemption.
  IF identity_scope IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Stripe payment rows require an identity lifecycle scope'
        USING ERRCODE = '23514';
    END IF;

    identity_relevant_update := ROW(
      NEW.account_owner_user_id,
      NEW.invoice_id,
      NEW.job_id,
      NEW.payment_status,
      NEW.payment_method,
      NEW.amount_cents,
      NEW.processor_name,
      NEW.processor_payment_reference,
      NEW.processor_charge_id,
      NEW.stripe_checkout_session_id,
      NEW.stripe_payment_intent_id,
      NEW.stripe_event_id,
      NEW.stripe_identity_dedupe_scope
    ) IS DISTINCT FROM ROW(
      OLD.account_owner_user_id,
      OLD.invoice_id,
      OLD.job_id,
      OLD.payment_status,
      OLD.payment_method,
      OLD.amount_cents,
      OLD.processor_name,
      OLD.processor_payment_reference,
      OLD.processor_charge_id,
      OLD.stripe_checkout_session_id,
      OLD.stripe_payment_intent_id,
      OLD.stripe_event_id,
      OLD.stripe_identity_dedupe_scope
    );

    IF identity_relevant_update THEN
      RAISE EXCEPTION 'Legacy Stripe payment identity must be reconciled before modification'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF lower(btrim(COALESCE(NEW.processor_name, ''))) <> 'stripe' THEN
    RAISE EXCEPTION 'Stripe identity lifecycle scope requires processor_name=stripe'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(NEW.processor_charge_id), '') IS NULL
    AND NULLIF(btrim(NEW.stripe_payment_intent_id), '') IS NULL
    AND NULLIF(btrim(NEW.stripe_checkout_session_id), '') IS NULL
  THEN
    RAISE EXCEPTION 'Stripe payment rows require a Charge, PaymentIntent, or Checkout Session identity'
      USING ERRCODE = '23514';
  END IF;

  IF (identity_scope = 'attempt_v1' AND NEW.payment_status <> 'failed')
    OR (identity_scope = 'checkout_v1' AND NEW.payment_status NOT IN ('pending', 'failed'))
    OR (identity_scope = 'recorded_v1' AND NEW.payment_status NOT IN ('recorded', 'reversed'))
  THEN
    RAISE EXCEPTION 'Stripe identity lifecycle scope does not match payment status'
      USING ERRCODE = '23514';
  END IF;

  -- Partial unique indexes below close concurrent races between current rows.
  -- These lookups also prevent a new scoped row from colliding with a retained
  -- pre-hardening row that cannot participate in those indexes.
  IF NULLIF(btrim(NEW.processor_charge_id), '') IS NOT NULL THEN
    PERFORM 1
    FROM public.internal_invoice_payments existing
    WHERE existing.account_owner_user_id = NEW.account_owner_user_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND NULLIF(btrim(existing.processor_charge_id), '') = btrim(NEW.processor_charge_id)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Stripe Charge identity already belongs to another payment'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF NEW.payment_status <> 'failed'
    AND NULLIF(btrim(NEW.stripe_payment_intent_id), '') IS NOT NULL
  THEN
    PERFORM 1
    FROM public.internal_invoice_payments existing
    WHERE existing.account_owner_user_id = NEW.account_owner_user_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND existing.payment_status <> 'failed'
      AND NULLIF(btrim(existing.stripe_payment_intent_id), '') = btrim(NEW.stripe_payment_intent_id)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Stripe PaymentIntent identity already belongs to another canonical payment'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF NEW.payment_status <> 'failed'
    AND NULLIF(btrim(NEW.stripe_checkout_session_id), '') IS NOT NULL
  THEN
    PERFORM 1
    FROM public.internal_invoice_payments existing
    WHERE existing.account_owner_user_id = NEW.account_owner_user_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND existing.payment_status <> 'failed'
      AND NULLIF(btrim(existing.stripe_checkout_session_id), '') = btrim(NEW.stripe_checkout_session_id)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Stripe Checkout Session identity already belongs to another canonical payment'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_invoice_payments_assert_stripe_identity
  ON public.internal_invoice_payments;
CREATE TRIGGER internal_invoice_payments_assert_stripe_identity
BEFORE INSERT OR UPDATE ON public.internal_invoice_payments
FOR EACH ROW
EXECUTE FUNCTION public.assert_internal_invoice_payment_stripe_identity();

-- Historical rows with a NULL dedupe scope predate the hardened webhook path.
-- Some environments deliberately retain duplicate legacy rows as financial
-- evidence, so they must be reconciled explicitly rather than silently deleted
-- or reclassified during a schema deployment. Every current Stripe write uses
-- recorded_v1, checkout_v1, or attempt_v1. Charge identity is unique for every
-- scoped row; failed PaymentIntent/Checkout history is excluded from only those
-- two canonical indexes because a later successful attempt may share it.
CREATE UNIQUE INDEX IF NOT EXISTS internal_inv_pay_owner_stripe_charge_uidx
  ON public.internal_invoice_payments (account_owner_user_id, (btrim(processor_charge_id)))
  WHERE stripe_identity_dedupe_scope IN ('recorded_v1', 'checkout_v1', 'attempt_v1')
    AND NULLIF(btrim(processor_charge_id), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS internal_inv_pay_owner_stripe_pi_uidx
  ON public.internal_invoice_payments (account_owner_user_id, (btrim(stripe_payment_intent_id)))
  WHERE stripe_identity_dedupe_scope IN ('recorded_v1', 'checkout_v1', 'attempt_v1')
    AND payment_status <> 'failed'
    AND NULLIF(btrim(stripe_payment_intent_id), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS internal_inv_pay_owner_stripe_checkout_uidx
  ON public.internal_invoice_payments (account_owner_user_id, (btrim(stripe_checkout_session_id)))
  WHERE stripe_identity_dedupe_scope IN ('recorded_v1', 'checkout_v1', 'attempt_v1')
    AND payment_status <> 'failed'
    AND NULLIF(btrim(stripe_checkout_session_id), '') IS NOT NULL;

COMMIT;
