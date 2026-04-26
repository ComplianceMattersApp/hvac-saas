-- Compliance Matters: contractor lifecycle archive v1
-- Purpose: add archive-first offboarding fields to contractors.
-- Notes:
-- - additive only
-- - existing contractors default to active
-- - preserves historical attribution on jobs/reports

BEGIN;

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_reason text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contractors_lifecycle_state_valid_chk'
  ) THEN
    ALTER TABLE public.contractors
      ADD CONSTRAINT contractors_lifecycle_state_valid_chk
      CHECK (lifecycle_state IN ('active', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contractors_owner_lifecycle_name_idx
  ON public.contractors (owner_user_id, lifecycle_state, name);

COMMIT;
