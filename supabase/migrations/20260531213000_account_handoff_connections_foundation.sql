-- Compliance Matters: account handoff connections foundation
-- Purpose: explicit account-to-account trust/consent layer for future workflow handoffs.
-- Non-goals: no recipient queue, no request visibility, no job/service_case/job_event mutation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_handoff_connections (
  id                               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requesting_account_owner_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  connection_status                text        NOT NULL,
  handoff_kind                     text        NOT NULL DEFAULT 'ecc',
  requested_by_user_id             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  declined_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by_user_id               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at                     timestamptz NOT NULL DEFAULT timezone('utc', now()),
  approved_at                      timestamptz NULL,
  declined_at                      timestamptz NULL,
  revoked_at                       timestamptz NULL,
  connection_note                  text        NULL,
  created_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT account_handoff_connections_account_pair_distinct_chk
    CHECK (requesting_account_owner_user_id <> recipient_account_owner_user_id),

  CONSTRAINT account_handoff_connections_status_valid_chk
    CHECK (connection_status IN ('pending', 'active', 'declined', 'revoked')),

  CONSTRAINT account_handoff_connections_handoff_kind_valid_chk
    CHECK (handoff_kind IN ('ecc')),

  CONSTRAINT account_handoff_connections_approved_state_chk
    CHECK (
      (connection_status <> 'active' OR approved_at IS NOT NULL)
      AND (connection_status = 'active' OR approved_at IS NULL)
    ),

  CONSTRAINT account_handoff_connections_declined_state_chk
    CHECK (
      (connection_status <> 'declined' OR declined_at IS NOT NULL)
      AND (connection_status = 'declined' OR declined_at IS NULL)
    ),

  CONSTRAINT account_handoff_connections_revoked_state_chk
    CHECK (
      (connection_status <> 'revoked' OR revoked_at IS NOT NULL)
      AND (connection_status = 'revoked' OR revoked_at IS NULL)
    ),

  CONSTRAINT account_handoff_connections_approved_actor_consistency_chk
    CHECK (approved_by_user_id IS NULL OR approved_at IS NOT NULL),

  CONSTRAINT account_handoff_connections_declined_actor_consistency_chk
    CHECK (declined_by_user_id IS NULL OR declined_at IS NOT NULL),

  CONSTRAINT account_handoff_connections_revoked_actor_consistency_chk
    CHECK (revoked_by_user_id IS NULL OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS account_handoff_connections_requesting_account_idx
  ON public.account_handoff_connections (requesting_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_handoff_connections_recipient_account_idx
  ON public.account_handoff_connections (recipient_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_handoff_connections_status_idx
  ON public.account_handoff_connections (connection_status, created_at DESC);

CREATE INDEX IF NOT EXISTS account_handoff_connections_handoff_kind_idx
  ON public.account_handoff_connections (handoff_kind, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS account_handoff_connections_live_pair_uidx
  ON public.account_handoff_connections (
    LEAST(requesting_account_owner_user_id, recipient_account_owner_user_id),
    GREATEST(requesting_account_owner_user_id, recipient_account_owner_user_id),
    handoff_kind
  )
  WHERE connection_status IN ('pending', 'active');

DROP TRIGGER IF EXISTS account_handoff_connections_set_updated_at
  ON public.account_handoff_connections;

CREATE TRIGGER account_handoff_connections_set_updated_at
BEFORE UPDATE ON public.account_handoff_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_handoff_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_handoff_connections_select_account_scope ON public.account_handoff_connections;
DROP POLICY IF EXISTS account_handoff_connections_insert_requesting_admin_owner_scope ON public.account_handoff_connections;
DROP POLICY IF EXISTS account_handoff_connections_update_relevant_admin_owner_scope ON public.account_handoff_connections;

CREATE POLICY account_handoff_connections_select_account_scope
ON public.account_handoff_connections
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    requesting_account_owner_user_id = public.current_internal_account_owner_id()
    OR recipient_account_owner_user_id = public.current_internal_account_owner_id()
  )
);

CREATE POLICY account_handoff_connections_insert_requesting_admin_owner_scope
ON public.account_handoff_connections
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND requesting_account_owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = account_handoff_connections.requesting_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = account_handoff_connections.requesting_account_owner_user_id
      )
  )
);

CREATE POLICY account_handoff_connections_update_relevant_admin_owner_scope
ON public.account_handoff_connections
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    requesting_account_owner_user_id = public.current_internal_account_owner_id()
    OR recipient_account_owner_user_id = public.current_internal_account_owner_id()
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = public.current_internal_account_owner_id()
      AND (
        actor.role = 'admin'
        OR actor.user_id = public.current_internal_account_owner_id()
      )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    requesting_account_owner_user_id = public.current_internal_account_owner_id()
    OR recipient_account_owner_user_id = public.current_internal_account_owner_id()
  )
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = public.current_internal_account_owner_id()
      AND (
        actor.role = 'admin'
        OR actor.user_id = public.current_internal_account_owner_id()
      )
  )
);

COMMIT;