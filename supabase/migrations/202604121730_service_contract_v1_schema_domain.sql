-- Service Contract V1 — Schema/Domain pass
-- Scope: minimal service_case + service_visit classification and lineage integrity guardrail.

BEGIN;

-- 1) service_cases: add Service Contract V1 fields
ALTER TABLE public.service_cases
  ADD COLUMN IF NOT EXISTS case_kind text,
  ADD COLUMN IF NOT EXISTS resolved_by_job_id uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS resolution_summary text;

UPDATE public.service_cases
SET case_kind = 'reactive'
WHERE case_kind IS NULL;

ALTER TABLE public.service_cases
  ALTER COLUMN case_kind SET DEFAULT 'reactive',
  ALTER COLUMN case_kind SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_cases_case_kind_chk'
  ) THEN
    ALTER TABLE public.service_cases
      ADD CONSTRAINT service_cases_case_kind_chk
      CHECK (case_kind = ANY (ARRAY['reactive'::text, 'callback'::text, 'warranty'::text, 'maintenance'::text]));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_cases_resolved_by_job_id_fkey'
  ) THEN
    ALTER TABLE public.service_cases
      ADD CONSTRAINT service_cases_resolved_by_job_id_fkey
      FOREIGN KEY (resolved_by_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- 2) jobs: add Service Visit classification fields
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS service_visit_type text,
  ADD COLUMN IF NOT EXISTS service_visit_reason text,
  ADD COLUMN IF NOT EXISTS service_visit_outcome text;

-- Backfill existing service jobs so required-on-service checks can be enforced safely.
UPDATE public.jobs
SET service_visit_type = 'diagnostic'
WHERE lower(coalesce(job_type, '')) = 'service'
  AND service_visit_type IS NULL;

UPDATE public.jobs
SET service_visit_reason = COALESCE(
  NULLIF(btrim(job_notes), ''),
  NULLIF(btrim(title), ''),
  'service visit'
)
WHERE lower(coalesce(job_type, '')) = 'service'
  AND service_visit_reason IS NULL;

UPDATE public.jobs
SET service_visit_outcome = 'follow_up_required'
WHERE lower(coalesce(job_type, '')) = 'service'
  AND service_visit_outcome IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_service_visit_type_chk'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_service_visit_type_chk
      CHECK (
        service_visit_type IS NULL
        OR service_visit_type = ANY (
          ARRAY['diagnostic'::text, 'repair'::text, 'return_visit'::text, 'callback'::text, 'maintenance'::text]
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_service_visit_outcome_chk'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_service_visit_outcome_chk
      CHECK (
        service_visit_outcome IS NULL
        OR service_visit_outcome = ANY (
          ARRAY['resolved'::text, 'follow_up_required'::text, 'no_issue_found'::text]
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_service_visit_fields_required_for_service_chk'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_service_visit_fields_required_for_service_chk
      CHECK (
        lower(coalesce(job_type, '')) <> 'service'
        OR (
          service_visit_type IS NOT NULL
          AND service_visit_reason IS NOT NULL
          AND service_visit_outcome IS NOT NULL
        )
      );
  END IF;
END
$$;

-- 3) Ensure jobs.service_case_id has an FK to service_cases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_service_case_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_service_case_id_fkey
      FOREIGN KEY (service_case_id) REFERENCES public.service_cases(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- 4) Backfill child links where parent has case and child is missing it
UPDATE public.jobs AS child
SET service_case_id = parent.service_case_id
FROM public.jobs AS parent
WHERE child.parent_job_id = parent.id
  AND child.service_case_id IS NULL
  AND parent.service_case_id IS NOT NULL;

-- 5) Guardrail trigger: parent/child lineage must stay within one service_case_id
CREATE OR REPLACE FUNCTION public.enforce_job_service_case_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_service_case_id uuid;
BEGIN
  IF NEW.parent_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT j.service_case_id
  INTO v_parent_service_case_id
  FROM public.jobs j
  WHERE j.id = NEW.parent_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent_job_id does not reference an existing job';
  END IF;

  IF v_parent_service_case_id IS NULL THEN
    RAISE EXCEPTION 'Parent/child lineage requires parent service_case_id';
  END IF;

  IF NEW.service_case_id IS NULL THEN
    RAISE EXCEPTION 'Parent/child lineage requires child service_case_id';
  END IF;

  IF NEW.service_case_id <> v_parent_service_case_id THEN
    RAISE EXCEPTION 'Cross-case parent/child linkage is invalid';
  END IF;

  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_enforce_job_service_case_lineage'
  ) THEN
    CREATE TRIGGER trg_enforce_job_service_case_lineage
    BEFORE INSERT OR UPDATE OF parent_job_id, service_case_id
    ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_job_service_case_lineage();
  END IF;
END
$$;

COMMIT;
