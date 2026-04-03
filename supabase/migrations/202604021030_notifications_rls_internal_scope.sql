-- Compliance Matters: notifications RLS hardening
-- Purpose: protect notifications at DB layer while preserving internal notification flows.

BEGIN;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_internal_full_access ON public.notifications;

CREATE POLICY notifications_internal_full_access
ON public.notifications
FOR ALL
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

COMMIT;
