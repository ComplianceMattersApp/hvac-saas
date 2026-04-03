-- Compliance Matters: service_cases contractor SELECT scope hardening
-- Purpose: prevent contractors from reading unrelated service_cases rows.

BEGIN;

DROP POLICY IF EXISTS service_cases_contractor_select ON public.service_cases;

CREATE POLICY service_cases_contractor_select
ON public.service_cases
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.contractor_users cu
      ON cu.contractor_id = j.contractor_id
    WHERE cu.user_id = auth.uid()
      AND j.service_case_id = service_cases.id
      AND j.deleted_at IS NULL
  )
);

COMMIT;
