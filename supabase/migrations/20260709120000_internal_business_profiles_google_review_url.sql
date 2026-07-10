BEGIN;

ALTER TABLE public.internal_business_profiles
  ADD COLUMN IF NOT EXISTS google_review_url text NULL;

COMMENT ON COLUMN public.internal_business_profiles.google_review_url
  IS 'Optional Google Business review URL for the review-ask feature. Null disables the review ask on job detail.';

COMMIT;
