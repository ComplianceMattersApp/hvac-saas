-- Compliance Matters: DB-enforced recorded Stripe identity dedupe v1
-- Purpose: prevent duplicate recorded Stripe invoice payments under concurrent webhook delivery.
-- Notes:
-- 1) Additive-only migration; no row cleanup or destructive changes.
-- 2) Existing duplicate sandbox evidence rows remain untouched.
-- 3) Uniqueness is gated by stripe_identity_dedupe_scope so legacy rows are excluded.

BEGIN;

ALTER TABLE IF EXISTS public.internal_invoice_payments
  ADD COLUMN IF NOT EXISTS stripe_identity_dedupe_scope TEXT NULL;

ALTER TABLE IF EXISTS public.internal_invoice_payments
  DROP CONSTRAINT IF EXISTS internal_invoice_payments_stripe_identity_dedupe_scope_valid_chk;

ALTER TABLE IF EXISTS public.internal_invoice_payments
  ADD CONSTRAINT internal_invoice_payments_stripe_identity_dedupe_scope_valid_chk
  CHECK (
    stripe_identity_dedupe_scope IS NULL
    OR stripe_identity_dedupe_scope IN ('recorded_v1')
  );

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoice_payments_recorded_v1_pi_identity_unique
  ON public.internal_invoice_payments (
    account_owner_user_id,
    invoice_id,
    stripe_payment_intent_id
  )
  WHERE stripe_identity_dedupe_scope = 'recorded_v1'
    AND payment_status = 'recorded'
    AND payment_method = 'card_stripe_online'
    AND stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoice_payments_recorded_v1_charge_identity_unique
  ON public.internal_invoice_payments (
    account_owner_user_id,
    invoice_id,
    processor_charge_id
  )
  WHERE stripe_identity_dedupe_scope = 'recorded_v1'
    AND payment_status = 'recorded'
    AND payment_method = 'card_stripe_online'
    AND processor_charge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoice_payments_recorded_v1_checkout_identity_unique
  ON public.internal_invoice_payments (
    account_owner_user_id,
    invoice_id,
    stripe_checkout_session_id
  )
  WHERE stripe_identity_dedupe_scope = 'recorded_v1'
    AND payment_status = 'recorded'
    AND payment_method = 'card_stripe_online'
    AND stripe_checkout_session_id IS NOT NULL;

COMMIT;
