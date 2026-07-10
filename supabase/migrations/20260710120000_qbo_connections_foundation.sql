-- EveryStep FieldWorks: QuickBooks Online connection foundation (Lane 6 V1)
-- Purpose: one QBO OAuth connection per account. Tokens are AES-256-GCM encrypted at the app layer.
-- Non-goals: no invoice/customer/payment mutation, no auto-sync, nothing on internal_business_profiles.

BEGIN;

CREATE TABLE IF NOT EXISTS public.qbo_connections (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id     uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  realm_id                  text        NOT NULL,
  access_token_encrypted    text        NOT NULL,
  refresh_token_encrypted   text        NOT NULL,
  token_expires_at          timestamptz NOT NULL,
  environment               text        NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox', 'production')),
  status                    text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disconnected', 'error')),
  connected_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_synced_at            timestamptz NULL,
  last_sync_error           text        NULL,
  created_at                timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.qbo_connections IS
  'QuickBooks Online OAuth connections. One per account. Tokens are AES-256-GCM encrypted at the app layer.';
COMMENT ON COLUMN public.qbo_connections.access_token_encrypted IS
  'AES-256-GCM encrypted QBO access token (format iv:tag:ciphertext, hex). Never store plaintext.';
COMMENT ON COLUMN public.qbo_connections.refresh_token_encrypted IS
  'AES-256-GCM encrypted QBO refresh token (format iv:tag:ciphertext, hex). Never store plaintext.';
COMMENT ON COLUMN public.qbo_connections.realm_id IS
  'QBO company (realm) id — required on every QBO REST call.';

DROP TRIGGER IF EXISTS qbo_connections_set_updated_at ON public.qbo_connections;

CREATE TRIGGER qbo_connections_set_updated_at
BEFORE UPDATE ON public.qbo_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.qbo_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_connections_select_own ON public.qbo_connections;
DROP POLICY IF EXISTS qbo_connections_insert_own ON public.qbo_connections;
DROP POLICY IF EXISTS qbo_connections_update_own ON public.qbo_connections;
DROP POLICY IF EXISTS qbo_connections_delete_own ON public.qbo_connections;

CREATE POLICY qbo_connections_select_own
ON public.qbo_connections
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY qbo_connections_insert_own
ON public.qbo_connections
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY qbo_connections_update_own
ON public.qbo_connections
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY qbo_connections_delete_own
ON public.qbo_connections
FOR DELETE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

COMMIT;
