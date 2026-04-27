-- Compliance Matters: platform account entitlements Stripe lifecycle fields v1
-- Purpose: add minimal Stripe subscription lifecycle sync fields for
-- platform account onboarding without touching tenant invoice/payment truth.

BEGIN;

ALTER TABLE public.platform_account_entitlements
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text NULL,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_last_webhook_event_id text NULL,
  ADD COLUMN IF NOT EXISTS stripe_last_synced_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_account_entitlements_stripe_subscription_unique_idx
  ON public.platform_account_entitlements (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_account_entitlements_stripe_customer_unique_idx
  ON public.platform_account_entitlements (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMIT;
