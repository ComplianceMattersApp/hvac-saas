-- Compliance Matters: contractor retest-ready event permission contract repair
-- Purpose: align portal-exposed contractor action with job_events insert RLS without broadening contractor write scope.

BEGIN;

DROP POLICY IF EXISTS contractor_insert_own_job_events_limited ON public.job_events;

CREATE POLICY contractor_insert_own_job_events_limited
ON public.job_events
FOR INSERT
TO authenticated
WITH CHECK (
  (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.contractor_users cu
        ON cu.contractor_id = j.contractor_id
      WHERE cu.user_id = auth.uid()
        AND j.id = job_events.job_id
    )
  )
  AND (
    event_type = ANY (
      ARRAY[
        'contractor_note'::text,
        'contractor_correction_submission'::text,
        'attachment_added'::text,
        'contractor_job_created'::text,
        'contractor_schedule_updated'::text,
        'retest_ready_requested'::text
      ]
    )
  )
);

COMMIT;
