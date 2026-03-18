-- Allow active internal users to read/write job assignments.
-- Keep contractor users blocked by requiring an active internal_users row for auth.uid().

alter table public.job_assignments enable row level security;

DROP POLICY IF EXISTS job_assignments_select_internal_active ON public.job_assignments;
CREATE POLICY job_assignments_select_internal_active
  ON public.job_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.internal_users iu
      WHERE iu.user_id = auth.uid()
        AND iu.is_active = true
    )
  );

DROP POLICY IF EXISTS job_assignments_insert_internal_active ON public.job_assignments;
CREATE POLICY job_assignments_insert_internal_active
  ON public.job_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.internal_users iu
      WHERE iu.user_id = auth.uid()
        AND iu.is_active = true
    )
    AND (assigned_by IS NULL OR assigned_by = auth.uid())
  );

DROP POLICY IF EXISTS job_assignments_update_internal_active ON public.job_assignments;
CREATE POLICY job_assignments_update_internal_active
  ON public.job_assignments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.internal_users iu
      WHERE iu.user_id = auth.uid()
        AND iu.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.internal_users iu
      WHERE iu.user_id = auth.uid()
        AND iu.is_active = true
    )
  );
