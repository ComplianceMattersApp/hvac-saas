-- Compliance Matters: short display numbers foundation (jobs + internal invoices)
-- Scope: schema/data foundation only. No UI or business-flow rewiring.

BEGIN;

-- Jobs currently do not persist account owner directly; add it so tenant-scoped
-- uniqueness can be enforced on job display numbers.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS account_owner_user_id uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_display_number bigint NULL;

ALTER TABLE public.internal_invoices
  ADD COLUMN IF NOT EXISTS invoice_display_number bigint NULL;

-- Backfill jobs.account_owner_user_id from customers.owner_user_id.
UPDATE public.jobs AS j
SET account_owner_user_id = c.owner_user_id
FROM public.customers AS c
WHERE j.customer_id = c.id
  AND j.account_owner_user_id IS NULL;

DO $$
DECLARE
  v_jobs_without_owner bigint;
  v_invoices_without_owner bigint;
BEGIN
  SELECT count(*) INTO v_jobs_without_owner
  FROM public.jobs
  WHERE account_owner_user_id IS NULL;

  IF v_jobs_without_owner > 0 THEN
    RAISE EXCEPTION 'Cannot continue: % jobs still missing account_owner_user_id after backfill.', v_jobs_without_owner;
  END IF;

  SELECT count(*) INTO v_invoices_without_owner
  FROM public.internal_invoices
  WHERE account_owner_user_id IS NULL;

  IF v_invoices_without_owner > 0 THEN
    RAISE EXCEPTION 'Cannot continue: % internal_invoices missing account_owner_user_id.', v_invoices_without_owner;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tenant_display_counters (
  account_owner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  next_job_display_number bigint NOT NULL DEFAULT 1001,
  next_invoice_display_number bigint NOT NULL DEFAULT 2001,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.allocate_next_job_display_number(p_account_owner_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF p_account_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'p_account_owner_user_id is required';
  END IF;

  INSERT INTO public.tenant_display_counters (account_owner_user_id)
  VALUES (p_account_owner_user_id)
  ON CONFLICT (account_owner_user_id) DO NOTHING;

  UPDATE public.tenant_display_counters
  SET next_job_display_number = next_job_display_number + 1,
      updated_at = now()
  WHERE account_owner_user_id = p_account_owner_user_id
  RETURNING next_job_display_number - 1 INTO v_next;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_next_invoice_display_number(p_account_owner_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF p_account_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'p_account_owner_user_id is required';
  END IF;

  INSERT INTO public.tenant_display_counters (account_owner_user_id)
  VALUES (p_account_owner_user_id)
  ON CONFLICT (account_owner_user_id) DO NOTHING;

  UPDATE public.tenant_display_counters
  SET next_invoice_display_number = next_invoice_display_number + 1,
      updated_at = now()
  WHERE account_owner_user_id = p_account_owner_user_id
  RETURNING next_invoice_display_number - 1 INTO v_next;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_next_job_display_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_next_invoice_display_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_next_job_display_number(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_next_invoice_display_number(uuid) TO authenticated, service_role;

-- Deterministic tenant-scoped backfill for jobs.
WITH ranked_jobs AS (
  SELECT
    j.id,
    row_number() OVER (
      PARTITION BY j.account_owner_user_id
      ORDER BY j.created_at ASC NULLS LAST, j.id ASC
    ) AS rn
  FROM public.jobs AS j
  WHERE j.job_display_number IS NULL
)
UPDATE public.jobs AS j
SET job_display_number = 1000 + r.rn
FROM ranked_jobs AS r
WHERE j.id = r.id;

-- Deterministic tenant-scoped backfill for internal invoices.
WITH ranked_invoices AS (
  SELECT
    i.id,
    row_number() OVER (
      PARTITION BY i.account_owner_user_id
      ORDER BY i.created_at ASC NULLS LAST, i.id ASC
    ) AS rn
  FROM public.internal_invoices AS i
  WHERE i.invoice_display_number IS NULL
)
UPDATE public.internal_invoices AS i
SET invoice_display_number = 2000 + r.rn
FROM ranked_invoices AS r
WHERE i.id = r.id;

-- Ensure every tenant participating in jobs or invoices has a counter row.
INSERT INTO public.tenant_display_counters (
  account_owner_user_id,
  next_job_display_number,
  next_invoice_display_number
)
SELECT owner_id, 1001, 2001
FROM (
  SELECT DISTINCT j.account_owner_user_id AS owner_id
  FROM public.jobs AS j
  UNION
  SELECT DISTINCT i.account_owner_user_id AS owner_id
  FROM public.internal_invoices AS i
) AS owners
WHERE owner_id IS NOT NULL
ON CONFLICT (account_owner_user_id) DO NOTHING;

-- Advance counters to max + 1 after backfill.
UPDATE public.tenant_display_counters AS t
SET next_job_display_number = GREATEST(COALESCE(j.max_job_display + 1, 1001), 1001),
    next_invoice_display_number = GREATEST(COALESCE(i.max_invoice_display + 1, 2001), 2001),
    updated_at = now()
FROM (
  SELECT account_owner_user_id, max(job_display_number)::bigint AS max_job_display
  FROM public.jobs
  GROUP BY account_owner_user_id
) AS j
FULL OUTER JOIN (
  SELECT account_owner_user_id, max(invoice_display_number)::bigint AS max_invoice_display
  FROM public.internal_invoices
  GROUP BY account_owner_user_id
) AS i
ON i.account_owner_user_id = j.account_owner_user_id
WHERE t.account_owner_user_id = COALESCE(j.account_owner_user_id, i.account_owner_user_id);

-- Enforce tenant uniqueness after data is backfilled.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_owner_display_number_unique_idx
  ON public.jobs (account_owner_user_id, job_display_number);

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoices_owner_display_number_unique_idx
  ON public.internal_invoices (account_owner_user_id, invoice_display_number);

DO $$
DECLARE
  v_jobs_without_display bigint;
  v_invoices_without_display bigint;
BEGIN
  SELECT count(*) INTO v_jobs_without_display
  FROM public.jobs
  WHERE job_display_number IS NULL;

  SELECT count(*) INTO v_invoices_without_display
  FROM public.internal_invoices
  WHERE invoice_display_number IS NULL;

  IF v_jobs_without_display > 0 THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL: % jobs still missing job_display_number.', v_jobs_without_display;
  END IF;

  IF v_invoices_without_display > 0 THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL: % internal_invoices still missing invoice_display_number.', v_invoices_without_display;
  END IF;
END $$;

ALTER TABLE public.jobs
  ALTER COLUMN account_owner_user_id SET NOT NULL;

ALTER TABLE public.jobs
  ALTER COLUMN job_display_number SET NOT NULL;

ALTER TABLE public.internal_invoices
  ALTER COLUMN invoice_display_number SET NOT NULL;

COMMIT;
