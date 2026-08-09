-- Route-planning foundations (V1 slice 1 of the route-first scheduling lane).
-- Three additive pieces:
--   1. Coordinates on canonical service locations, captured from the address
--      autocomplete at write time and backfilled by
--      scripts/backfill-location-geocodes.ts for manually entered rows.
--   2. A per-job service-duration estimate for route/timeline math.
--   3. The dispatch home base (shop address + coordinates) on the business
--      profile, so a route has somewhere to start and end.
BEGIN;

-- 1. locations: coordinates -------------------------------------------------

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamp with time zone;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_latitude_range;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_latitude_range
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_longitude_range;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_longitude_range
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- Coordinates are only meaningful as a pair; forbid half-written rows.
ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_coordinates_paired;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_coordinates_paired
  CHECK ((latitude IS NULL) = (longitude IS NULL));

COMMENT ON COLUMN public.locations.latitude IS
  'Service-address latitude (WGS84). Captured from address autocomplete or geocode backfill; null when never geocoded.';
COMMENT ON COLUMN public.locations.longitude IS
  'Service-address longitude (WGS84). Always paired with latitude.';
COMMENT ON COLUMN public.locations.geocode_source IS
  'Provenance of the coordinates: places_autocomplete | geocoding_backfill | dispatch_profile_save.';
COMMENT ON COLUMN public.locations.geocoded_at IS
  'When the coordinates were captured or last refreshed.';

-- Backfill and planner queries look up rows still missing coordinates.
CREATE INDEX IF NOT EXISTS locations_missing_coordinates_idx
  ON public.locations (owner_user_id)
  WHERE latitude IS NULL;

-- 2. jobs: service-duration estimate ----------------------------------------

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes integer;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_estimated_duration_minutes_range;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_estimated_duration_minutes_range
  CHECK (
    estimated_duration_minutes IS NULL
    OR (estimated_duration_minutes >= 5 AND estimated_duration_minutes <= 1440)
  );

COMMENT ON COLUMN public.jobs.estimated_duration_minutes IS
  'Estimated on-site service time in minutes for route/timeline planning. Null falls back to the dispatch-grid default (120).';

-- 3. internal_business_profiles: dispatch home base --------------------------

ALTER TABLE public.internal_business_profiles
  ADD COLUMN IF NOT EXISTS dispatch_address_line1 text,
  ADD COLUMN IF NOT EXISTS dispatch_address_line2 text,
  ADD COLUMN IF NOT EXISTS dispatch_city text,
  ADD COLUMN IF NOT EXISTS dispatch_state text,
  ADD COLUMN IF NOT EXISTS dispatch_zip text,
  ADD COLUMN IF NOT EXISTS dispatch_latitude double precision,
  ADD COLUMN IF NOT EXISTS dispatch_longitude double precision;

ALTER TABLE public.internal_business_profiles
  DROP CONSTRAINT IF EXISTS internal_business_profiles_dispatch_latitude_range;
ALTER TABLE public.internal_business_profiles
  ADD CONSTRAINT internal_business_profiles_dispatch_latitude_range
  CHECK (dispatch_latitude IS NULL OR (dispatch_latitude >= -90 AND dispatch_latitude <= 90));

ALTER TABLE public.internal_business_profiles
  DROP CONSTRAINT IF EXISTS internal_business_profiles_dispatch_longitude_range;
ALTER TABLE public.internal_business_profiles
  ADD CONSTRAINT internal_business_profiles_dispatch_longitude_range
  CHECK (dispatch_longitude IS NULL OR (dispatch_longitude >= -180 AND dispatch_longitude <= 180));

ALTER TABLE public.internal_business_profiles
  DROP CONSTRAINT IF EXISTS internal_business_profiles_dispatch_coordinates_paired;
ALTER TABLE public.internal_business_profiles
  ADD CONSTRAINT internal_business_profiles_dispatch_coordinates_paired
  CHECK ((dispatch_latitude IS NULL) = (dispatch_longitude IS NULL));

COMMENT ON COLUMN public.internal_business_profiles.dispatch_address_line1 IS
  'Dispatch home base (shop) street address. Anchors route start/end for route planning.';
COMMENT ON COLUMN public.internal_business_profiles.dispatch_latitude IS
  'Dispatch home base latitude, geocoded on company-profile save. Null when the address is unset or geocoding failed.';
COMMENT ON COLUMN public.internal_business_profiles.dispatch_longitude IS
  'Dispatch home base longitude. Always paired with dispatch_latitude.';

COMMIT;
