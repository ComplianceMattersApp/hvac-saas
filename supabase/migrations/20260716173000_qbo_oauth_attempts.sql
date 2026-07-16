BEGIN;

CREATE TABLE IF NOT EXISTS public.qbo_oauth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL,
  state_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS qbo_oauth_attempts_account_created_idx
  ON public.qbo_oauth_attempts (account_owner_user_id, created_at DESC);

ALTER TABLE public.qbo_oauth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.qbo_oauth_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.qbo_oauth_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.register_qbo_oauth_attempt(
  p_account_owner_user_id uuid,
  p_state_hash text,
  p_ttl_seconds integer DEFAULT 600
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND public.current_internal_account_owner_id() IS DISTINCT FROM p_account_owner_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.qbo_oauth_attempts
  WHERE expires_at < timezone('utc', now()) - interval '1 day';

  INSERT INTO public.qbo_oauth_attempts (
    account_owner_user_id,
    state_hash,
    expires_at
  ) VALUES (
    p_account_owner_user_id,
    p_state_hash,
    timezone('utc', now()) + make_interval(secs => GREATEST(60, LEAST(p_ttl_seconds, 900)))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_qbo_oauth_attempt(
  p_account_owner_user_id uuid,
  p_state_hash text
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

  UPDATE public.qbo_oauth_attempts
  SET consumed_at = timezone('utc', now())
  WHERE account_owner_user_id = p_account_owner_user_id
    AND state_hash = p_state_hash
    AND consumed_at IS NULL
    AND expires_at >= timezone('utc', now());

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.register_qbo_oauth_attempt(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_qbo_oauth_attempt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_qbo_oauth_attempt(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_qbo_oauth_attempt(uuid, text) TO authenticated, service_role;

COMMIT;
