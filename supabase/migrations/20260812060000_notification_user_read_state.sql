-- Per-user read state for shared internal notifications.
-- notifications.read_at remains the legacy global read marker; existing values
-- continue to suppress those rows for every user.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_user_read_states (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS notification_user_read_states_user_read_idx
  ON public.notification_user_read_states (user_id, read_at DESC);

ALTER TABLE public.notification_user_read_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_user_read_states_own_select
  ON public.notification_user_read_states;
CREATE POLICY notification_user_read_states_own_select
ON public.notification_user_read_states
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.notifications n
    JOIN public.internal_users iu
      ON iu.user_id = auth.uid()
     AND iu.is_active = true
     AND iu.account_owner_user_id = n.account_owner_user_id
    WHERE n.id = notification_id
      AND n.recipient_type IN ('internal', 'internal_user')
      AND (n.recipient_ref IS NULL OR n.recipient_ref = auth.uid())
  )
);

DROP POLICY IF EXISTS notification_user_read_states_own_insert
  ON public.notification_user_read_states;
CREATE POLICY notification_user_read_states_own_insert
ON public.notification_user_read_states
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.notifications n
    JOIN public.internal_users iu
      ON iu.user_id = auth.uid()
     AND iu.is_active = true
     AND iu.account_owner_user_id = n.account_owner_user_id
    WHERE n.id = notification_id
      AND n.recipient_type IN ('internal', 'internal_user')
      AND (n.recipient_ref IS NULL OR n.recipient_ref = auth.uid())
  )
);

DROP POLICY IF EXISTS notification_user_read_states_own_update
  ON public.notification_user_read_states;
CREATE POLICY notification_user_read_states_own_update
ON public.notification_user_read_states
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.notifications n
    JOIN public.internal_users iu
      ON iu.user_id = auth.uid()
     AND iu.is_active = true
     AND iu.account_owner_user_id = n.account_owner_user_id
    WHERE n.id = notification_id
      AND n.recipient_type IN ('internal', 'internal_user')
      AND (n.recipient_ref IS NULL OR n.recipient_ref = auth.uid())
  )
);

GRANT SELECT, INSERT, UPDATE ON public.notification_user_read_states TO authenticated;

COMMIT;
