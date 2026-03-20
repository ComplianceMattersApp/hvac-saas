-- Compliance Matters: contractor intake job_events RLS repair
-- Purpose: allow only contractor-generated intake events that the app now emits,
-- without opening broad contractor write access.

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
        'contractor_schedule_updated'::text
      ]
    )
  )
);

COMMIT;
