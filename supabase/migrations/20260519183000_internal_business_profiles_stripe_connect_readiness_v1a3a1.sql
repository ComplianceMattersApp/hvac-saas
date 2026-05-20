-- Compliance Matters: tenant Stripe Connect readiness foundation (V1A-3A-1)
-- Purpose: add additive, nullable-friendly fields to internal_business_profiles
-- required for direct-charge connected-account readiness gating.

BEGIN;

ALTER TABLE public.internal_business_profiles
  ADD COLUMN IF NOT EXISTS stripe_connected_account_id text NULL,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_disabled_reason text NULL,
  ADD COLUMN IF NOT EXISTS stripe_connect_last_synced_at timestamptz NULL;

COMMENT ON COLUMN public.internal_business_profiles.stripe_connected_account_id
  IS 'Stripe Connect account id (acct_*) for tenant direct-charge context.';

COMMENT ON COLUMN public.internal_business_profiles.stripe_connect_onboarding_status
  IS 'Tenant Stripe Connect onboarding lifecycle status. Default not_started.';

COMMENT ON COLUMN public.internal_business_profiles.stripe_charges_enabled
  IS 'Latest known Stripe account charges_enabled flag for tenant connected account.';

COMMENT ON COLUMN public.internal_business_profiles.stripe_payouts_enabled
  IS 'Latest known Stripe account payouts_enabled flag for tenant connected account.';

COMMENT ON COLUMN public.internal_business_profiles.stripe_details_submitted
  IS 'Latest known Stripe account details_submitted flag for tenant connected account.';

COMMENT ON COLUMN public.internal_business_profiles.stripe_connect_disabled_reason
  IS 'Latest known Stripe disabled reason for tenant connected account, if present.';

COMMENT ON COLUMN public.internal_business_profiles.stripe_connect_last_synced_at
  IS 'Timestamp of last Stripe Connect account status sync for tenant readiness checks.';

CREATE INDEX IF NOT EXISTS internal_business_profiles_stripe_connected_account_idx
  ON public.internal_business_profiles (stripe_connected_account_id)
  WHERE stripe_connected_account_id IS NOT NULL;

COMMIT;
