-- Compliance Matters: push subscription dormant foundation
-- Purpose: store per-user/device Web Push subscription material for future
-- outside-app alerts without registering a service worker or sending push.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint              text        NOT NULL,
  p256dh                text        NOT NULL,
  auth                  text        NOT NULL,
  user_agent            text        NULL,
  device_label          text        NULL,
  permission_state      text        NOT NULL DEFAULT 'granted',
  is_active             boolean     NOT NULL DEFAULT true,
  last_seen_at          timestamptz NULL,
  last_success_at       timestamptz NULL,
  last_failure_at       timestamptz NULL,
  last_failure_code     text        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT push_subscriptions_endpoint_not_blank_chk
    CHECK (length(btrim(endpoint)) > 0),

  CONSTRAINT push_subscriptions_p256dh_not_blank_chk
    CHECK (length(btrim(p256dh)) > 0),

  CONSTRAINT push_subscriptions_auth_not_blank_chk
    CHECK (length(btrim(auth)) > 0),

  CONSTRAINT push_subscriptions_permission_state_valid_chk
    CHECK (permission_state IN ('granted', 'denied', 'default', 'unknown')),

  CONSTRAINT push_subscriptions_failure_state_consistency_chk
    CHECK (last_failure_code IS NULL OR last_failure_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_account_user_active_idx
  ON public.push_subscriptions (account_owner_user_id, user_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_active_user_endpoint_uidx
  ON public.push_subscriptions (user_id, endpoint)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at
  ON public.push_subscriptions;

CREATE TRIGGER push_subscriptions_set_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own_internal
  ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert_own_internal
  ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_own_internal
  ON public.push_subscriptions;

CREATE POLICY push_subscriptions_select_own_internal
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY push_subscriptions_insert_own_internal
ON public.push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY push_subscriptions_update_own_internal
ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  user_id = auth.uid()
  AND public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

-- No DELETE policy. Historical inactive rows are preserved.

COMMIT;
