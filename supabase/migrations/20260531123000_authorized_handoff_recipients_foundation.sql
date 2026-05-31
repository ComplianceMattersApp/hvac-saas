-- Compliance Matters: Authorized handoff recipient foundation (V1)
-- Purpose: account-scoped, admin-managed recipient registry for ECC handoff.
-- Non-goals: no cross-account handoff execution, no job/service_case/job_event writes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.authorized_handoff_recipients (
  id                                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  recipient_type                    text        NOT NULL,
  handoff_kind                      text        NOT NULL DEFAULT 'ecc',
  display_name                      text        NOT NULL,

  internal_user_id                  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  external_company_name             text        NULL,
  external_contact_name             text        NULL,
  external_email                    text        NULL,
  external_phone                    text        NULL,
  connected_account_owner_user_id   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  is_default                        boolean     NOT NULL DEFAULT false,
  is_active                         boolean     NOT NULL DEFAULT true,
  notes                             text        NULL,

  created_by_user_id                uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id                uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  archived_at                       timestamptz NULL,

  CONSTRAINT authorized_handoff_recipients_type_valid_chk
    CHECK (recipient_type IN ('internal_user', 'external_manual', 'connected_account_future')),

  CONSTRAINT authorized_handoff_recipients_kind_valid_chk
    CHECK (handoff_kind IN ('ecc', 'general_future')),

  CONSTRAINT authorized_handoff_recipients_display_name_not_blank_chk
    CHECK (length(btrim(display_name)) > 0),

  CONSTRAINT authorized_handoff_recipients_external_email_format_chk
    CHECK (
      external_email IS NULL
      OR external_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    ),

  CONSTRAINT authorized_handoff_recipients_external_phone_len_chk
    CHECK (
      external_phone IS NULL
      OR length(regexp_replace(external_phone, '[^0-9]', '', 'g')) >= 7
    ),

  CONSTRAINT authorized_handoff_recipients_active_default_consistency_chk
    CHECK (is_default = false OR is_active = true),

  CONSTRAINT authorized_handoff_recipients_active_archive_consistency_chk
    CHECK (archived_at IS NULL OR is_active = false),

  CONSTRAINT authorized_handoff_recipients_internal_type_fields_chk
    CHECK (
      recipient_type <> 'internal_user'
      OR internal_user_id IS NOT NULL
    ),

  CONSTRAINT authorized_handoff_recipients_connected_type_fields_chk
    CHECK (
      recipient_type <> 'connected_account_future'
      OR connected_account_owner_user_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS authorized_handoff_recipients_account_kind_active_idx
  ON public.authorized_handoff_recipients (account_owner_user_id, handoff_kind, is_active)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS authorized_handoff_recipients_account_type_idx
  ON public.authorized_handoff_recipients (account_owner_user_id, recipient_type)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS authorized_handoff_recipients_one_default_per_kind_uidx
  ON public.authorized_handoff_recipients (account_owner_user_id, handoff_kind)
  WHERE is_default = true
    AND is_active = true
    AND archived_at IS NULL;

DROP TRIGGER IF EXISTS authorized_handoff_recipients_set_updated_at ON public.authorized_handoff_recipients;

CREATE TRIGGER authorized_handoff_recipients_set_updated_at
BEFORE UPDATE ON public.authorized_handoff_recipients
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.authorized_handoff_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authorized_handoff_recipients_select_account_scope ON public.authorized_handoff_recipients;
DROP POLICY IF EXISTS authorized_handoff_recipients_insert_admin_only ON public.authorized_handoff_recipients;
DROP POLICY IF EXISTS authorized_handoff_recipients_update_admin_only ON public.authorized_handoff_recipients;

CREATE POLICY authorized_handoff_recipients_select_account_scope
ON public.authorized_handoff_recipients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
);

CREATE POLICY authorized_handoff_recipients_insert_admin_only
ON public.authorized_handoff_recipients
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by_user_id IS NULL OR created_by_user_id = auth.uid())
  AND (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.role = 'admin'
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
);

CREATE POLICY authorized_handoff_recipients_update_admin_only
ON public.authorized_handoff_recipients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.role = 'admin'
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
)
WITH CHECK (
  (updated_by_user_id IS NULL OR updated_by_user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.role = 'admin'
      AND actor.account_owner_user_id = authorized_handoff_recipients.account_owner_user_id
  )
);

COMMIT;
