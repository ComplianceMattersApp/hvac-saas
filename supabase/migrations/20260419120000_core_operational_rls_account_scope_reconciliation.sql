-- Compliance Matters: core operational RLS account-scope reconciliation
-- Purpose: replace broad internal access assumptions on source-of-truth
-- tables with positive account-owner-scoped internal policies while
-- preserving existing contractor access policies.

BEGIN;

CREATE OR REPLACE FUNCTION public.service_case_matches_account_owner(
  p_service_case_id uuid,
  p_customer_id uuid,
  p_location_id uuid,
  p_account_owner_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_account_owner_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.locations loc
        WHERE loc.id = p_location_id
          AND loc.owner_user_id = p_account_owner_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.customers cust
        WHERE cust.id = p_customer_id
          AND cust.owner_user_id = p_account_owner_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.jobs j
        LEFT JOIN public.contractors ctr
          ON ctr.id = j.contractor_id
        LEFT JOIN public.customers cust
          ON cust.id = j.customer_id
        LEFT JOIN public.locations loc
          ON loc.id = j.location_id
        WHERE j.service_case_id = p_service_case_id
          AND (
            ctr.owner_user_id = p_account_owner_user_id
            OR cust.owner_user_id = p_account_owner_user_id
            OR loc.owner_user_id = p_account_owner_user_id
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.service_case_matches_account_owner(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_case_matches_account_owner(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_case_matches_account_owner(uuid, uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.job_matches_account_owner(
  p_contractor_id uuid,
  p_customer_id uuid,
  p_location_id uuid,
  p_service_case_id uuid,
  p_account_owner_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_account_owner_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.contractors ctr
        WHERE ctr.id = p_contractor_id
          AND ctr.owner_user_id = p_account_owner_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.customers cust
        WHERE cust.id = p_customer_id
          AND cust.owner_user_id = p_account_owner_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.locations loc
        WHERE loc.id = p_location_id
          AND loc.owner_user_id = p_account_owner_user_id
      )
      OR public.service_case_matches_account_owner(
        p_service_case_id,
        NULL,
        NULL,
        p_account_owner_user_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.job_matches_account_owner(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_matches_account_owner(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_matches_account_owner(uuid, uuid, uuid, uuid, uuid) TO service_role;

DROP POLICY IF EXISTS internal_archive_jobs ON public.jobs;
DROP POLICY IF EXISTS internal_full_access_jobs ON public.jobs;

CREATE POLICY jobs_internal_all_account_scope
ON public.jobs
FOR ALL
TO authenticated
USING (
  public.job_matches_account_owner(
    contractor_id,
    customer_id,
    location_id,
    service_case_id,
    public.current_internal_account_owner_id()
  )
)
WITH CHECK (
  public.job_matches_account_owner(
    contractor_id,
    customer_id,
    location_id,
    service_case_id,
    public.current_internal_account_owner_id()
  )
);

DROP POLICY IF EXISTS internal_full_access_job_events ON public.job_events;

CREATE POLICY job_events_internal_all_account_scope
ON public.job_events
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_events.job_id
      AND j.deleted_at IS NULL
      AND public.job_matches_account_owner(
        j.contractor_id,
        j.customer_id,
        j.location_id,
        j.service_case_id,
        public.current_internal_account_owner_id()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_events.job_id
      AND j.deleted_at IS NULL
      AND public.job_matches_account_owner(
        j.contractor_id,
        j.customer_id,
        j.location_id,
        j.service_case_id,
        public.current_internal_account_owner_id()
      )
  )
);

DROP POLICY IF EXISTS internal_full_access_service_cases ON public.service_cases;
DROP POLICY IF EXISTS service_cases_internal_full_access ON public.service_cases;

CREATE POLICY service_cases_internal_all_account_scope
ON public.service_cases
FOR ALL
TO authenticated
USING (
  public.service_case_matches_account_owner(
    id,
    customer_id,
    location_id,
    public.current_internal_account_owner_id()
  )
)
WITH CHECK (
  public.service_case_matches_account_owner(
    id,
    customer_id,
    location_id,
    public.current_internal_account_owner_id()
  )
);

COMMIT;