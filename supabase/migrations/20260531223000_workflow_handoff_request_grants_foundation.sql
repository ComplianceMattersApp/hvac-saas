-- Compliance Matters: workflow handoff request grants foundation
-- Purpose: request-scoped recipient account access grants for future connected handoff response lanes.
-- Non-goals: no recipient queue, no send enablement, no jobs/service_case/job_event exposure.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workflow_handoff_request_grants (
  id                               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installer_account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_account_owner_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  account_handoff_connection_id    uuid        NOT NULL REFERENCES public.account_handoff_connections(id) ON DELETE RESTRICT,
  workflow_handoff_request_id      uuid        NOT NULL REFERENCES public.workflow_handoff_requests(id) ON DELETE CASCADE,
  authorized_handoff_recipient_id  uuid        NULL REFERENCES public.authorized_handoff_recipients(id) ON DELETE SET NULL,
  handoff_kind                     text        NOT NULL DEFAULT 'ecc',
  grant_status                     text        NOT NULL DEFAULT 'active',
  shared_scope                     text        NOT NULL DEFAULT 'handoff_request_only',
  granted_by_user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  revoked_by_user_id               uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at                       timestamptz NULL,
  revoke_reason                    text        NULL,
  created_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                       timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT workflow_handoff_request_grants_account_pair_distinct_chk
    CHECK (installer_account_owner_user_id <> recipient_account_owner_user_id),

  CONSTRAINT workflow_handoff_request_grants_handoff_kind_valid_chk
    CHECK (handoff_kind IN ('ecc')),

  CONSTRAINT workflow_handoff_request_grants_status_valid_chk
    CHECK (grant_status IN ('active', 'revoked')),

  CONSTRAINT workflow_handoff_request_grants_shared_scope_valid_chk
    CHECK (shared_scope IN ('handoff_request_only')),

  CONSTRAINT workflow_handoff_request_grants_revoked_state_chk
    CHECK (
      (grant_status <> 'revoked' OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL))
      AND (grant_status = 'revoked' OR (revoked_at IS NULL AND revoked_by_user_id IS NULL))
    )
);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_installer_account_idx
  ON public.workflow_handoff_request_grants (installer_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_recipient_account_idx
  ON public.workflow_handoff_request_grants (recipient_account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_request_idx
  ON public.workflow_handoff_request_grants (workflow_handoff_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_request_grants_connection_idx
  ON public.workflow_handoff_request_grants (account_handoff_connection_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_handoff_request_grants_active_request_recipient_uidx
  ON public.workflow_handoff_request_grants (workflow_handoff_request_id, recipient_account_owner_user_id)
  WHERE grant_status = 'active';

DROP TRIGGER IF EXISTS workflow_handoff_request_grants_set_updated_at
  ON public.workflow_handoff_request_grants;

CREATE TRIGGER workflow_handoff_request_grants_set_updated_at
BEFORE UPDATE ON public.workflow_handoff_request_grants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_workflow_handoff_request_grant_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  handoff_request_row record;
  connection_row record;
  authorized_recipient_row record;
BEGIN
  SELECT
    request.id,
    request.installer_account_owner_user_id,
    request.authorized_handoff_recipient_id,
    request.handoff_kind
  INTO handoff_request_row
  FROM public.workflow_handoff_requests request
  WHERE request.id = NEW.workflow_handoff_request_id;

  IF handoff_request_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants workflow_handoff_request_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF handoff_request_row.installer_account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants handoff request installer/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF handoff_request_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants handoff request kind mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    connection.id,
    connection.requesting_account_owner_user_id,
    connection.recipient_account_owner_user_id,
    connection.handoff_kind,
    connection.connection_status
  INTO connection_row
  FROM public.account_handoff_connections connection
  WHERE connection.id = NEW.account_handoff_connection_id;

  IF connection_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants account_handoff_connection_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF connection_row.requesting_account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants installer account mismatch for account_handoff_connection_id'
      USING ERRCODE = '23514';
  END IF;

  IF connection_row.recipient_account_owner_user_id IS DISTINCT FROM NEW.recipient_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants recipient account mismatch for account_handoff_connection_id'
      USING ERRCODE = '23514';
  END IF;

  IF connection_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants connection handoff kind mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.grant_status = 'active' AND connection_row.connection_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'workflow_handoff_request_grants active grant requires active account_handoff_connection'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.authorized_handoff_recipient_id IS NOT NULL THEN
    SELECT
      recipient.id,
      recipient.account_owner_user_id,
      recipient.handoff_kind
    INTO authorized_recipient_row
    FROM public.authorized_handoff_recipients recipient
    WHERE recipient.id = NEW.authorized_handoff_recipient_id;

    IF authorized_recipient_row.id IS NULL THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized_handoff_recipient_id not found'
        USING ERRCODE = '23503';
    END IF;

    IF authorized_recipient_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized recipient/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF authorized_recipient_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized recipient handoff kind mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF handoff_request_row.authorized_handoff_recipient_id IS DISTINCT FROM NEW.authorized_handoff_recipient_id THEN
      RAISE EXCEPTION 'workflow_handoff_request_grants authorized recipient must match handoff request snapshot'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_handoff_request_grants_assert_scope
  ON public.workflow_handoff_request_grants;

CREATE TRIGGER workflow_handoff_request_grants_assert_scope
BEFORE INSERT OR UPDATE ON public.workflow_handoff_request_grants
FOR EACH ROW
EXECUTE FUNCTION public.assert_workflow_handoff_request_grant_scope();

ALTER TABLE public.workflow_handoff_request_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_handoff_request_grants_select_installer_account_scope ON public.workflow_handoff_request_grants;
DROP POLICY IF EXISTS workflow_handoff_request_grants_select_recipient_account_scope ON public.workflow_handoff_request_grants;
DROP POLICY IF EXISTS workflow_handoff_request_grants_insert_installer_admin_owner_scope ON public.workflow_handoff_request_grants;
DROP POLICY IF EXISTS workflow_handoff_request_grants_update_revoke_installer_admin_owner_scope ON public.workflow_handoff_request_grants;

CREATE POLICY workflow_handoff_request_grants_select_installer_account_scope
ON public.workflow_handoff_request_grants
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY workflow_handoff_request_grants_select_recipient_account_scope
ON public.workflow_handoff_request_grants
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND recipient_account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY workflow_handoff_request_grants_insert_installer_admin_owner_scope
ON public.workflow_handoff_request_grants
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND granted_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      )
  )
);

CREATE POLICY workflow_handoff_request_grants_update_revoke_installer_admin_owner_scope
ON public.workflow_handoff_request_grants
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND grant_status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND grant_status = 'revoked'
  AND revoked_by_user_id = auth.uid()
  AND revoked_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = workflow_handoff_request_grants.installer_account_owner_user_id
      )
  )
);

COMMIT;
