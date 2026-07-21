-- Store the tenant's canonical business timezone. Timestamps remain UTC; this
-- value controls operational display and business-day interpretation.
BEGIN;

ALTER TABLE public.internal_business_profiles
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'America/Los_Angeles';

ALTER TABLE public.internal_business_profiles
  DROP CONSTRAINT IF EXISTS internal_business_profiles_time_zone_not_blank;

ALTER TABLE public.internal_business_profiles
  ADD CONSTRAINT internal_business_profiles_time_zone_not_blank
  CHECK (length(btrim(time_zone)) > 0);

COMMENT ON COLUMN public.internal_business_profiles.time_zone IS
  'Canonical IANA timezone for this account, such as America/Chicago.';

COMMIT;
