-- Compliance Matters: internal user access capabilities foundation (B8-B2)
-- Purpose: persist narrow per-user field billing/payment capability grants
-- without changing role truth, payment truth, Stripe/webhook behavior, or
-- invoice issue/send authority.

BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_user_access_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  internal_user_id uuid NOT NULL REFERENCES public.internal_users(user_id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT internal_user_access_capabilities_account_user_key_uidx
    UNIQUE (account_owner_user_id, internal_user_id, capability_key),

  CONSTRAINT internal_user_access_capabilities_key_valid_chk
    CHECK (
      capability_key IN (
        'field_billing_enabled',
        'can_view_field_billing_summary',
        'can_collect_field_payment',
        'can_report_non_card_collection',
        'can_collect_card_payment',
        'can_verify_non_card_collection'
      )
    )
);

CREATE INDEX IF NOT EXISTS internal_user_access_capabilities_account_user_idx
  ON public.internal_user_access_capabilities (account_owner_user_id, internal_user_id);

CREATE INDEX IF NOT EXISTS internal_user_access_capabilities_enabled_key_idx
  ON public.internal_user_access_capabilities (account_owner_user_id, capability_key)
  WHERE enabled = true;

DROP TRIGGER IF EXISTS internal_user_access_capabilities_set_updated_at
  ON public.internal_user_access_capabilities;

CREATE TRIGGER internal_user_access_capabilities_set_updated_at
BEFORE UPDATE ON public.internal_user_access_capabilities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_internal_user_access_capability_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_account_owner_user_id uuid;
BEGIN
  SELECT iu.account_owner_user_id
  INTO target_account_owner_user_id
  FROM public.internal_users iu
  WHERE iu.user_id = NEW.internal_user_id;

  IF target_account_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'internal_user_access_capabilities internal user not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM target_account_owner_user_id THEN
    RAISE EXCEPTION 'internal_user_access_capabilities internal user/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_user_access_capabilities_assert_scope
  ON public.internal_user_access_capabilities;

CREATE TRIGGER internal_user_access_capabilities_assert_scope
BEFORE INSERT OR UPDATE ON public.internal_user_access_capabilities
FOR EACH ROW
EXECUTE FUNCTION public.assert_internal_user_access_capability_scope();

ALTER TABLE public.internal_user_access_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_user_access_capabilities_select_account_scope
  ON public.internal_user_access_capabilities;
DROP POLICY IF EXISTS internal_user_access_capabilities_insert_admin_owner_scope
  ON public.internal_user_access_capabilities;
DROP POLICY IF EXISTS internal_user_access_capabilities_update_admin_owner_scope
  ON public.internal_user_access_capabilities;

CREATE POLICY internal_user_access_capabilities_select_account_scope
ON public.internal_user_access_capabilities
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_user_access_capabilities.account_owner_user_id
  )
);

CREATE POLICY internal_user_access_capabilities_insert_admin_owner_scope
ON public.internal_user_access_capabilities
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_user_access_capabilities.account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = internal_user_access_capabilities.account_owner_user_id
      )
  )
);

CREATE POLICY internal_user_access_capabilities_update_admin_owner_scope
ON public.internal_user_access_capabilities
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_user_access_capabilities.account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = internal_user_access_capabilities.account_owner_user_id
      )
  )
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
  AND updated_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_user_access_capabilities.account_owner_user_id
      AND (
        actor.role = 'admin'
        OR actor.user_id = internal_user_access_capabilities.account_owner_user_id
      )
  )
);

-- No DELETE policy in this foundation slice. Disable by setting enabled = false.

COMMIT;
