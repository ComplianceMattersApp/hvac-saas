-- Compliance Matters: System Filters Model Foundation V1
-- Purpose: add durable system-level filter records without changing equipment,
-- customer profile editing, reminders, work items, invoices, service visits,
-- maintenance agreements, or ECC test truth.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_system_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.job_systems(id) ON DELETE CASCADE,
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  label text NULL,
  length numeric NOT NULL,
  width numeric NOT NULL,
  height numeric NOT NULL,
  date_changed date NOT NULL,
  notes text NULL,
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  archived_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT job_system_filters_length_positive_chk
    CHECK (length > 0),
  CONSTRAINT job_system_filters_width_positive_chk
    CHECK (width > 0),
  CONSTRAINT job_system_filters_height_positive_chk
    CHECK (height > 0),
  CONSTRAINT job_system_filters_label_not_blank_chk
    CHECK (label IS NULL OR length(btrim(label)) > 0),
  CONSTRAINT job_system_filters_notes_not_blank_chk
    CHECK (notes IS NULL OR length(btrim(notes)) > 0)
);

COMMENT ON TABLE public.job_system_filters IS
  'System-level filter records. A job system can have zero, one, or many filters. Filters do not belong to equipment components and do not create reminders, work items, invoices, visits, maintenance agreement due dates, or ECC test truth.';

COMMENT ON COLUMN public.job_system_filters.system_id IS
  'Parent job_systems row. Filters are attached to the system, not individual job_equipment rows.';

CREATE INDEX IF NOT EXISTS job_system_filters_owner_system_active_idx
  ON public.job_system_filters (account_owner_user_id, system_id, archived_at);

CREATE INDEX IF NOT EXISTS job_system_filters_owner_date_changed_idx
  ON public.job_system_filters (account_owner_user_id, date_changed DESC);

DROP TRIGGER IF EXISTS job_system_filters_set_updated_at ON public.job_system_filters;
CREATE TRIGGER job_system_filters_set_updated_at
BEFORE UPDATE ON public.job_system_filters
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_job_system_filter_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
BEGIN
  SELECT j.id,
         j.account_owner_user_id,
         j.contractor_id,
         j.customer_id,
         j.location_id,
         j.service_case_id,
         j.deleted_at
    INTO v_job
  FROM public.job_systems js
  JOIN public.jobs j
    ON j.id = js.job_id
  WHERE js.id = NEW.system_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job system filter parent system not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_job.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'job system filter parent job is archived'
      USING ERRCODE = '23514';
  END IF;

  IF v_job.account_owner_user_id IS NOT NULL THEN
    IF NEW.account_owner_user_id IS DISTINCT FROM v_job.account_owner_user_id THEN
      RAISE EXCEPTION 'job system filter account_owner_user_id must match parent job account_owner_user_id'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NOT public.job_matches_account_owner(
    v_job.contractor_id,
    v_job.customer_id,
    v_job.location_id,
    v_job.service_case_id,
    NEW.account_owner_user_id
  ) THEN
    RAISE EXCEPTION 'job system filter account scope mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_job_system_filter_account_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_job_system_filter_account_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_job_system_filter_account_scope() TO service_role;

DROP TRIGGER IF EXISTS job_system_filters_assert_account_scope ON public.job_system_filters;
CREATE TRIGGER job_system_filters_assert_account_scope
BEFORE INSERT OR UPDATE OF system_id, account_owner_user_id ON public.job_system_filters
FOR EACH ROW
EXECUTE FUNCTION public.assert_job_system_filter_account_scope();

ALTER TABLE public.job_system_filters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_system_filters_internal_select_account_scope ON public.job_system_filters;
DROP POLICY IF EXISTS job_system_filters_internal_insert_account_scope ON public.job_system_filters;
DROP POLICY IF EXISTS job_system_filters_internal_update_account_scope ON public.job_system_filters;

CREATE POLICY job_system_filters_internal_select_account_scope
ON public.job_system_filters
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY job_system_filters_internal_insert_account_scope
ON public.job_system_filters
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY job_system_filters_internal_update_account_scope
ON public.job_system_filters
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

GRANT SELECT, INSERT, UPDATE ON public.job_system_filters TO authenticated;
GRANT ALL ON public.job_system_filters TO service_role;

COMMIT;
