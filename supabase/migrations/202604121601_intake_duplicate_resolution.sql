-- Compliance Matters: add duplicate_of_job_id to contractor_intake_submissions
-- Purpose: when an internal reviewer determines a pending proposal is a duplicate
-- of an existing ECC job, store a structured reference to that job so the
-- closure reason is machine-readable and auditable.
--
-- review_status remains 'rejected' — the CHECK constraint is unchanged.
-- The presence of a non-null duplicate_of_job_id distinguishes a duplicate
-- closure from a generic rejection.

BEGIN;

ALTER TABLE public.contractor_intake_submissions
  ADD COLUMN IF NOT EXISTS duplicate_of_job_id uuid NULL
    REFERENCES public.jobs(id) ON DELETE SET NULL;

COMMIT;
