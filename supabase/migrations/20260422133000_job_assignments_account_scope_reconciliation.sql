BEGIN;

DROP POLICY IF EXISTS job_assignments_insert_internal_active ON public.job_assignments;
DROP POLICY IF EXISTS job_assignments_select_internal_active ON public.job_assignments;
DROP POLICY IF EXISTS job_assignments_update_internal_active ON public.job_assignments;

CREATE POLICY job_assignments_internal_all_account_scope
ON public.job_assignments
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_assignments.job_id
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
    WHERE j.id = job_assignments.job_id
      AND j.deleted_at IS NULL
      AND public.job_matches_account_owner(
        j.contractor_id,
        j.customer_id,
        j.location_id,
        j.service_case_id,
        public.current_internal_account_owner_id()
      )
  )
  AND (
    job_assignments.assigned_by IS NULL
    OR job_assignments.assigned_by = auth.uid()
  )
);

COMMIT;