-- Preserve a structured service address from permit intake through job creation.
BEGIN;

ALTER TABLE public.permit_requests
  ADD COLUMN IF NOT EXISTS address_line1_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS address_line2_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS city_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS state_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS zip_snapshot text NULL;

COMMIT;
