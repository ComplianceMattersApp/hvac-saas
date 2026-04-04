BEGIN;

DROP POLICY IF EXISTS calendar_events_internal_update_scope ON public.calendar_events;
CREATE POLICY calendar_events_internal_update_scope
ON public.calendar_events
FOR UPDATE
TO authenticated
USING (
  event_type = 'block'
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = calendar_events.owner_user_id
  )
)
WITH CHECK (
  event_type = 'block'
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = calendar_events.owner_user_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_users target
    WHERE target.user_id = calendar_events.internal_user_id
      AND target.is_active = true
      AND target.account_owner_user_id = calendar_events.owner_user_id
  )
);

DROP POLICY IF EXISTS calendar_events_internal_delete_scope ON public.calendar_events;
CREATE POLICY calendar_events_internal_delete_scope
ON public.calendar_events
FOR DELETE
TO authenticated
USING (
  event_type = 'block'
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = calendar_events.owner_user_id
  )
);

COMMIT;