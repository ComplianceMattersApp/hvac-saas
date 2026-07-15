BEGIN;

ALTER TABLE public.qbo_connections
  ADD COLUMN IF NOT EXISTS refresh_lease_id uuid NULL,
  ADD COLUMN IF NOT EXISTS refresh_lease_expires_at timestamptz NULL;

COMMENT ON COLUMN public.qbo_connections.refresh_lease_id IS
  'Short-lived owner for serialized OAuth refresh-token rotation.';
COMMENT ON COLUMN public.qbo_connections.refresh_lease_expires_at IS
  'Lease expiry so a crashed refresher cannot permanently block QBO access.';

CREATE OR REPLACE FUNCTION public.acquire_qbo_refresh_lease(
  p_account_owner_user_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer := 0;
BEGIN
  IF auth.role() <> 'service_role'
     AND public.current_internal_account_owner_id() IS DISTINCT FROM p_account_owner_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.qbo_connections
  SET
    refresh_lease_id = p_lease_id,
    refresh_lease_expires_at = timezone('utc', now()) + make_interval(secs => GREATEST(5, LEAST(p_lease_seconds, 120)))
  WHERE account_owner_user_id = p_account_owner_user_id
    AND status = 'active'
    AND (
      refresh_lease_id IS NULL
      OR refresh_lease_expires_at IS NULL
      OR refresh_lease_expires_at <= timezone('utc', now())
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_qbo_refresh_lease(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_qbo_refresh_lease(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_qbo_refresh_lease(uuid, uuid, integer) TO service_role;

COMMIT;
