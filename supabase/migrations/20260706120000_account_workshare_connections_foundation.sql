-- EveryStep FieldWorks: directional account workshare connection foundation (P1-B)
-- Purpose: receiver/rater initiated, paid account-to-account ECC/HERS connection layer.
-- Non-goals: no handoff requests, no job/customer/schedule/ECC test/payment/portal mutation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_workshare_connections (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_account_id     uuid        NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  receiver_account_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  service_type          text        NOT NULL DEFAULT 'ecc_hers',
  status                text        NOT NULL DEFAULT 'pending',
  invite_email          text        NULL,
  invite_company_name   text        NULL,
  invite_token_hash     text        NULL,
  invited_by_user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_by_user_id   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  disabled_by_user_id   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by_user_id    uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT timezone('utc', now()),
  accepted_at           timestamptz NULL,
  disabled_at           timestamptz NULL,
  revoked_at            timestamptz NULL,
  updated_at            timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT account_workshare_connections_directional_pair_distinct_chk
    CHECK (sender_account_id IS NULL OR sender_account_id <> receiver_account_id),

  CONSTRAINT account_workshare_connections_service_type_valid_chk
    CHECK (service_type IN ('ecc_hers')),

  CONSTRAINT account_workshare_connections_status_valid_chk
    CHECK (status IN ('pending', 'active', 'disabled', 'revoked')),

  CONSTRAINT account_workshare_connections_invite_target_chk
    CHECK (sender_account_id IS NOT NULL OR invite_email IS NOT NULL),

  CONSTRAINT account_workshare_connections_invite_email_format_chk
    CHECK (
      invite_email IS NULL
      OR invite_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    ),

  CONSTRAINT account_workshare_connections_active_state_chk
    CHECK (
      (status <> 'active' OR (sender_account_id IS NOT NULL AND accepted_by_user_id IS NOT NULL AND accepted_at IS NOT NULL))
      AND (status = 'active' OR (accepted_by_user_id IS NULL AND accepted_at IS NULL))
    ),

  CONSTRAINT account_workshare_connections_disabled_state_chk
    CHECK (
      (status <> 'disabled' OR (disabled_by_user_id IS NOT NULL AND disabled_at IS NOT NULL))
      AND (status = 'disabled' OR (disabled_by_user_id IS NULL AND disabled_at IS NULL))
    ),

  CONSTRAINT account_workshare_connections_revoked_state_chk
    CHECK (
      (status <> 'revoked' OR (revoked_by_user_id IS NOT NULL AND revoked_at IS NOT NULL))
      AND (status = 'revoked' OR (revoked_by_user_id IS NULL AND revoked_at IS NULL))
    )
);

CREATE INDEX IF NOT EXISTS account_workshare_connections_sender_idx
  ON public.account_workshare_connections (sender_account_id, service_type, status, created_at DESC)
  WHERE sender_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_workshare_connections_receiver_idx
  ON public.account_workshare_connections (receiver_account_id, service_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS account_workshare_connections_invite_email_idx
  ON public.account_workshare_connections (lower(invite_email), service_type, status, created_at DESC)
  WHERE invite_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS account_workshare_connections_live_directional_pair_uidx
  ON public.account_workshare_connections (sender_account_id, receiver_account_id, service_type)
  WHERE sender_account_id IS NOT NULL
    AND status IN ('pending', 'active');

DROP TRIGGER IF EXISTS account_workshare_connections_set_updated_at
  ON public.account_workshare_connections;

CREATE TRIGGER account_workshare_connections_set_updated_at
BEFORE UPDATE ON public.account_workshare_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_workshare_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_workshare_connections_select_party_scope ON public.account_workshare_connections;
DROP POLICY IF EXISTS account_workshare_connections_insert_receiver_admin_owner_scope ON public.account_workshare_connections;
DROP POLICY IF EXISTS account_workshare_connections_update_receiver_admin_owner_scope ON public.account_workshare_connections;
DROP POLICY IF EXISTS account_workshare_connections_update_sender_admin_owner_scope ON public.account_workshare_connections;

CREATE POLICY account_workshare_connections_select_party_scope
ON public.account_workshare_connections
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    sender_account_id = public.current_internal_account_owner_id()
    OR receiver_account_id = public.current_internal_account_owner_id()
  )
);

CREATE POLICY account_workshare_connections_insert_receiver_admin_owner_scope
ON public.account_workshare_connections
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND receiver_account_id = public.current_internal_account_owner_id()
  AND invited_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = account_workshare_connections.receiver_account_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = account_workshare_connections.receiver_account_id
      )
  )
);

CREATE POLICY account_workshare_connections_update_receiver_admin_owner_scope
ON public.account_workshare_connections
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND receiver_account_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = account_workshare_connections.receiver_account_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = account_workshare_connections.receiver_account_id
      )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND receiver_account_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = account_workshare_connections.receiver_account_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = account_workshare_connections.receiver_account_id
      )
  )
);

CREATE POLICY account_workshare_connections_update_sender_admin_owner_scope
ON public.account_workshare_connections
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND sender_account_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = account_workshare_connections.sender_account_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = account_workshare_connections.sender_account_id
      )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND sender_account_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = account_workshare_connections.sender_account_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = account_workshare_connections.sender_account_id
      )
  )
);

COMMIT;
