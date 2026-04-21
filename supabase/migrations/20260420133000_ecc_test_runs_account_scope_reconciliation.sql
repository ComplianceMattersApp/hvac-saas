BEGIN;

DROP POLICY IF EXISTS ecc_test_runs_internal_full_access ON public.ecc_test_runs;

CREATE POLICY ecc_test_runs_internal_all_account_scope
ON public.ecc_test_runs
TO authenticated
USING (
  NOT EXISTS (
    SELECT 1
    FROM public.contractor_users cu
    WHERE cu.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = ecc_test_runs.job_id
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
  NOT EXISTS (
    SELECT 1
    FROM public.contractor_users cu
    WHERE cu.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = ecc_test_runs.job_id
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