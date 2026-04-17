-- Visit Scope V1: job-owned operational scope for internal visit definition.

BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS visit_scope_summary text,
  ADD COLUMN IF NOT EXISTS visit_scope_items jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_visit_scope_items_array_chk'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_visit_scope_items_array_chk
      CHECK (jsonb_typeof(visit_scope_items) = 'array');
  END IF;
END
$$;

COMMIT;