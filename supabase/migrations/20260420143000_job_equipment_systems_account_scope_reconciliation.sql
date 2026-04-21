BEGIN;

DROP POLICY IF EXISTS internal_full_access_job_equipment ON public.job_equipment;

CREATE POLICY job_equipment_internal_all_account_scope
ON public.job_equipment
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_equipment.job_id
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
    WHERE j.id = job_equipment.job_id
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

DROP POLICY IF EXISTS internal_full_access_job_systems ON public.job_systems;

CREATE POLICY job_systems_internal_all_account_scope
ON public.job_systems
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_systems.job_id
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
    WHERE j.id = job_systems.job_id
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

COMMIT;