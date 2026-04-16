BEGIN;

ALTER TABLE public.internal_business_profiles
ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'external_billing';

UPDATE public.internal_business_profiles
SET billing_mode = 'external_billing'
WHERE billing_mode IS NULL;

ALTER TABLE public.internal_business_profiles
DROP CONSTRAINT IF EXISTS internal_business_profiles_billing_mode_check;

ALTER TABLE public.internal_business_profiles
ADD CONSTRAINT internal_business_profiles_billing_mode_check
CHECK (billing_mode IN ('external_billing', 'internal_invoicing'));

COMMIT;