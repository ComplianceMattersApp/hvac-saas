-- EveryStep FieldWorks: global AI usage budget and metering foundation.
-- App-owned authority: provider calls reserve budget first and settle actual cost after completion.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_global_budget_settings (
  singleton_key text PRIMARY KEY DEFAULT 'global' CHECK (singleton_key = 'global'),
  monthly_limit_microusd bigint NOT NULL DEFAULT 25000000 CHECK (monthly_limit_microusd BETWEEN 1000000 AND 1000000000),
  is_enabled boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.ai_global_budget_settings (singleton_key, monthly_limit_microusd, is_enabled)
VALUES ('global', 25000000, true)
ON CONFLICT (singleton_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE CHECK (char_length(request_id) BETWEEN 1 AND 200),
  feature_key text NOT NULL CHECK (feature_key IN ('estimate_coach', 'trainer', 'future_internal_assistant')),
  account_owner_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('reserved', 'completed', 'failed', 'rejected')),
  estimated_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  actual_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (actual_cost_microusd >= 0),
  input_tokens bigint NULL CHECK (input_tokens IS NULL OR input_tokens >= 0),
  cached_input_tokens bigint NULL CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  output_tokens bigint NULL CHECK (output_tokens IS NULL OR output_tokens >= 0),
  rejection_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reserved_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS ai_usage_events_month_status_idx
  ON public.ai_usage_events (created_at, status);
CREATE INDEX IF NOT EXISTS ai_usage_events_feature_month_idx
  ON public.ai_usage_events (feature_key, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_account_month_idx
  ON public.ai_usage_events (account_owner_user_id, created_at)
  WHERE account_owner_user_id IS NOT NULL;

ALTER TABLE public.ai_global_budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_global_budget_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_global_budget_settings TO service_role;
GRANT ALL ON TABLE public.ai_usage_events TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage_budget(
  p_request_id text,
  p_feature_key text,
  p_account_owner_user_id uuid,
  p_actor_user_id uuid,
  p_model text,
  p_estimated_cost_microusd bigint,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (accepted boolean, reason text, remaining_microusd bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings public.ai_global_budget_settings%ROWTYPE;
  v_existing public.ai_usage_events%ROWTYPE;
  v_committed bigint := 0;
  v_month_start timestamptz := date_trunc('month', timezone('utc', now())) AT TIME ZONE 'UTC';
BEGIN
  IF coalesce(trim(p_request_id), '') = '' OR p_estimated_cost_microusd < 0 THEN
    RAISE EXCEPTION 'invalid ai usage reservation';
  END IF;

  SELECT * INTO v_settings
  FROM public.ai_global_budget_settings
  WHERE singleton_key = 'global'
  FOR UPDATE;

  SELECT coalesce(sum(
    CASE WHEN status = 'completed' THEN actual_cost_microusd
         WHEN status = 'reserved' THEN estimated_cost_microusd
         ELSE 0 END
  ), 0)
  INTO v_committed
  FROM public.ai_usage_events
  WHERE created_at >= v_month_start;

  SELECT * INTO v_existing
  FROM public.ai_usage_events
  WHERE request_id = p_request_id;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.status <> 'rejected',
      CASE WHEN v_existing.status = 'rejected' THEN coalesce(v_existing.rejection_reason, 'rejected') ELSE 'idempotent' END,
      greatest(v_settings.monthly_limit_microusd - v_committed, 0);
    RETURN;
  END IF;

  IF NOT v_settings.is_enabled THEN
    INSERT INTO public.ai_usage_events (
      request_id, feature_key, account_owner_user_id, actor_user_id, model, status,
      estimated_cost_microusd, rejection_reason, metadata
    ) VALUES (
      p_request_id, p_feature_key, p_account_owner_user_id, p_actor_user_id, p_model, 'rejected',
      p_estimated_cost_microusd, 'ai_disabled', coalesce(p_metadata, '{}'::jsonb)
    );
    RETURN QUERY SELECT false, 'ai_disabled'::text, greatest(v_settings.monthly_limit_microusd - v_committed, 0);
    RETURN;
  END IF;

  IF v_committed + p_estimated_cost_microusd > v_settings.monthly_limit_microusd THEN
    INSERT INTO public.ai_usage_events (
      request_id, feature_key, account_owner_user_id, actor_user_id, model, status,
      estimated_cost_microusd, rejection_reason, metadata
    ) VALUES (
      p_request_id, p_feature_key, p_account_owner_user_id, p_actor_user_id, p_model, 'rejected',
      p_estimated_cost_microusd, 'monthly_cap_reached', coalesce(p_metadata, '{}'::jsonb)
    );
    RETURN QUERY SELECT false, 'monthly_cap_reached'::text, greatest(v_settings.monthly_limit_microusd - v_committed, 0);
    RETURN;
  END IF;

  INSERT INTO public.ai_usage_events (
    request_id, feature_key, account_owner_user_id, actor_user_id, model, status,
    estimated_cost_microusd, metadata
  ) VALUES (
    p_request_id, p_feature_key, p_account_owner_user_id, p_actor_user_id, p_model, 'reserved',
    p_estimated_cost_microusd, coalesce(p_metadata, '{}'::jsonb)
  );

  RETURN QUERY SELECT true, 'reserved'::text,
    greatest(v_settings.monthly_limit_microusd - v_committed - p_estimated_cost_microusd, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_usage_budget(
  p_request_id text,
  p_actual_cost_microusd bigint,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reserved bigint;
BEGIN
  SELECT estimated_cost_microusd INTO v_reserved
  FROM public.ai_usage_events
  WHERE request_id = p_request_id AND status = 'reserved'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF p_actual_cost_microusd < 0 OR p_actual_cost_microusd > v_reserved THEN
    RAISE EXCEPTION 'actual ai cost exceeds reserved budget';
  END IF;

  UPDATE public.ai_usage_events SET
    status = 'completed', actual_cost_microusd = p_actual_cost_microusd,
    input_tokens = p_input_tokens, cached_input_tokens = p_cached_input_tokens,
    output_tokens = p_output_tokens, completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE request_id = p_request_id AND status = 'reserved';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_usage_budget(p_request_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.ai_usage_events SET
    status = 'failed', actual_cost_microusd = 0,
    completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE request_id = p_request_id AND status = 'reserved';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage_budget(text, text, uuid, uuid, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_usage_budget(text, bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_usage_budget(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage_budget(text, text, uuid, uuid, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage_budget(text, bigint, bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_usage_budget(text) TO service_role;

COMMIT;
