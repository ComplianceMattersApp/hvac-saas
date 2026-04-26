-- Allow historical voided invoices while enforcing one active (non-void) invoice per job.
DROP INDEX IF EXISTS public.internal_invoices_job_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS internal_invoices_job_active_unique_idx
ON public.internal_invoices (job_id)
WHERE status <> 'void';
