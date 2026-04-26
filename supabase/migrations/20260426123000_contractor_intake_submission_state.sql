-- Persist proposed state on contractor intake submissions so finalization can
-- carry state into canonical locations without operator re-entry.

BEGIN;

ALTER TABLE public.contractor_intake_submissions
  ADD COLUMN IF NOT EXISTS proposed_state text NULL;

COMMIT;
