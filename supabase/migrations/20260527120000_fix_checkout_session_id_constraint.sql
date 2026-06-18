-- Phase 6E-C: Fix checkout session id constraint to accept Stripe's real format
-- Stripe Checkout Session IDs include underscores after the prefix segment:
--   cs_test_<alphanumeric>   (test mode)
--   cs_live_<alphanumeric>   (live mode)
-- The original constraint ^cs_[A-Za-z0-9]+$ rejected underscores inside the value.

BEGIN;

-- Tolerant for local/dev migration chains where the saved-payment-method
-- setup table may not exist yet; the table is created by a later foundation
-- migration in some replay orders.
ALTER TABLE IF EXISTS public.tenant_saved_payment_method_setups
  DROP CONSTRAINT IF EXISTS tenant_saved_payment_method_setups_checkout_session_id_format_c;

ALTER TABLE IF EXISTS public.tenant_saved_payment_method_setups
  DROP CONSTRAINT IF EXISTS tenant_saved_payment_method_setups_checkout_session_id_format_chk;

DO $$
BEGIN
  IF to_regclass('public.tenant_saved_payment_method_setups') IS NOT NULL THEN
    ALTER TABLE public.tenant_saved_payment_method_setups
      ADD CONSTRAINT tenant_saved_payment_method_setups_checkout_session_id_format_c
        CHECK (
          (stripe_checkout_session_id IS NULL)
          OR (stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$')
        );
  END IF;
END $$;

COMMIT;
