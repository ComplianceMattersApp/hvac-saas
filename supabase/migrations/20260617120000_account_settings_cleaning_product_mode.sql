-- Purpose: allow Cleaning / Janitorial accounts to persist product_mode.
-- Safe rollout: constraint-only update; does not mutate existing rows.

ALTER TABLE public.account_settings
  DROP CONSTRAINT IF EXISTS account_settings_product_mode_valid_chk;

ALTER TABLE public.account_settings
  ADD CONSTRAINT account_settings_product_mode_valid_chk
  CHECK (
    product_mode IS NULL
    OR product_mode IN ('hybrid', 'hvac_service', 'ecc_hers', 'cleaning_services')
  );
