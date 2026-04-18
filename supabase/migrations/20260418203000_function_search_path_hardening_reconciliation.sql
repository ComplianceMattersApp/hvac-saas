-- Compliance Matters — function search_path hardening reconciliation
-- Purpose:
--   Reconcile repo migration history to match the already-applied TEST/PROD
--   hotfixes that pin search_path for flagged public functions.
--
-- Important:
--   This migration is intended to be safely re-runnable and to align repo
--   history with live schema reality.

begin;

alter function public.set_updated_at()
  set search_path = pg_catalog, public;

alter function public.is_job_owned_by_current_contractor(uuid)
  set search_path = pg_catalog, public;

alter function public.prevent_job_parent_cycles()
  set search_path = pg_catalog, public;

alter function public.search_customers(text, integer)
  set search_path = pg_catalog, public;

alter function public.portal_job_counts()
  set search_path = pg_catalog, public;

alter function public.portal_job_counts(uuid)
  set search_path = pg_catalog, public;

alter function public.enforce_job_service_case_lineage()
  set search_path = pg_catalog, public;

commit;