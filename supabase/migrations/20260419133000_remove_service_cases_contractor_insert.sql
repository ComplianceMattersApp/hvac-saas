-- Compliance Matters: remove stale contractor INSERT permission on service_cases
-- Contractor canonical job creation already uses the canonical/admin writer for service_case creation.
-- No current contractor-facing path should insert service_cases directly through RLS.

DROP POLICY IF EXISTS service_cases_contractor_insert ON public.service_cases;