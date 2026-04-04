BEGIN;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS internal_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_owner_user_id_fkey'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_internal_user_id_fkey'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_internal_user_id_fkey
      FOREIGN KEY (internal_user_id) REFERENCES public.internal_users(user_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_event_type_valid_chk'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_event_type_valid_chk
      CHECK (event_type IS NULL OR event_type IN ('block', 'job', 'service'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_block_contract_chk'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_block_contract_chk
      CHECK (
        event_type IS DISTINCT FROM 'block'
        OR (
          owner_user_id IS NOT NULL
          AND internal_user_id IS NOT NULL
          AND created_by_user_id IS NOT NULL
          AND end_at IS NOT NULL
          AND end_at > start_at
          AND job_id IS NULL
          AND service_id IS NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS calendar_events_owner_start_idx
  ON public.calendar_events(owner_user_id, start_at);

CREATE INDEX IF NOT EXISTS calendar_events_internal_start_idx
  ON public.calendar_events(internal_user_id, start_at);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_events_internal_select_scope ON public.calendar_events;
CREATE POLICY calendar_events_internal_select_scope
ON public.calendar_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = calendar_events.owner_user_id
  )
);

DROP POLICY IF EXISTS calendar_events_internal_insert_scope ON public.calendar_events;
CREATE POLICY calendar_events_internal_insert_scope
ON public.calendar_events
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
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

COMMIT;
