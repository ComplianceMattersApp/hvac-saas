-- Compliance Matters: account setup progress tracking
-- Purpose: add durable user-confirmed completion signals to internal_business_profiles
-- so that provisioned baseline data never counts as "user completed setup."
--
-- profile_reviewed_at: set when the account owner explicitly saves the company profile form.
-- team_reviewed_at:    set when the account owner explicitly confirms their team setup
--                      on the internal users admin page.
--
-- Both default to NULL so newly provisioned accounts start at 0/5 complete.

BEGIN;

ALTER TABLE public.internal_business_profiles
  ADD COLUMN IF NOT EXISTS profile_reviewed_at timestamptz NULL;

ALTER TABLE public.internal_business_profiles
  ADD COLUMN IF NOT EXISTS team_reviewed_at timestamptz NULL;

COMMENT ON COLUMN public.internal_business_profiles.profile_reviewed_at
  IS 'Set when the account owner explicitly saves the company profile. NULL = never reviewed.';

COMMENT ON COLUMN public.internal_business_profiles.team_reviewed_at
  IS 'Set when the account owner explicitly confirms internal team setup. NULL = never confirmed.';

COMMIT;
