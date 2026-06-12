ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS billing_disposition text,
  ADD COLUMN IF NOT EXISTS billing_disposition_note text,
  ADD COLUMN IF NOT EXISTS billing_disposition_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS billing_disposition_by_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_billing_disposition_valid_chk'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_billing_disposition_valid_chk
      CHECK (
        billing_disposition IS NULL
        OR billing_disposition IN ('externally_billed', 'no_charge')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_billing_disposition_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_billing_disposition_by_user_id_fkey
      FOREIGN KEY (billing_disposition_by_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.jobs.billing_disposition IS
  'Typed commercial closeout reason for jobs resolved without collected-money truth. V1A values: externally_billed, no_charge.';
COMMENT ON COLUMN public.jobs.billing_disposition_note IS
  'Optional operator note captured when setting a job billing disposition.';
COMMENT ON COLUMN public.jobs.billing_disposition_at IS
  'Timestamp when the current job billing disposition was applied.';
COMMENT ON COLUMN public.jobs.billing_disposition_by_user_id IS
  'Internal user who applied the current job billing disposition.';
