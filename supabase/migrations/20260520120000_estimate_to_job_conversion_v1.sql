-- Compliance Matters: Estimate to Job Conversion V1 (Section 2C)
-- Adds durable linkage and idempotency for internal-only estimate → job conversion.

-- 1. Add converted_job_id and converted_by_user_id to estimates
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS converted_job_id uuid NULL REFERENCES public.jobs(id),
  ADD COLUMN IF NOT EXISTS converted_by_user_id uuid NULL REFERENCES auth.users(id);

-- 2. Add origin_estimate_id to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS origin_estimate_id uuid NULL REFERENCES public.estimates(id);

-- 3. Unique partial index on estimates.converted_job_id
CREATE UNIQUE INDEX IF NOT EXISTS estimates_converted_job_id_unique
  ON public.estimates(converted_job_id)
  WHERE converted_job_id IS NOT NULL;

-- 4. Unique partial index on jobs.origin_estimate_id
CREATE UNIQUE INDEX IF NOT EXISTS jobs_origin_estimate_id_unique
  ON public.jobs(origin_estimate_id)
  WHERE origin_estimate_id IS NOT NULL;

-- No invoice conversion fields in this migration.
-- No production apply in this slice.
