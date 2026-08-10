-- Store the monetary value supplied during internal permit intake review.
BEGIN;

ALTER TABLE public.permit_requests
  ADD COLUMN IF NOT EXISTS total_value_cents bigint NULL;

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_total_value_cents_nonnegative_chk,
  ADD CONSTRAINT permit_requests_total_value_cents_nonnegative_chk CHECK (
    total_value_cents IS NULL OR total_value_cents >= 0
  );

COMMENT ON COLUMN public.permit_requests.total_value_cents IS
  'Total project or contract value captured during permit intake, in USD cents.';

COMMIT;
