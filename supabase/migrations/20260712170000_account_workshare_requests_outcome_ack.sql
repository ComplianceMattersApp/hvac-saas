-- EveryStep JobWorks: workshare returned-work acknowledgement (P1-G chip support)
-- Purpose: give the contractor's returned work (a rater outcome that's back) a
--   persistent "unhandled" signal that clears only when the contractor acts —
--   requests a retest (fail) or marks it handled (pass). Adds an acknowledged
--   timestamp. No new trigger arm is needed: the existing outcome arm (Arm 4)
--   already permits an accepted->accepted update that sets outcome_acknowledged_at
--   while the outcome shape is unchanged. The record/retest RPCs are updated to
--   reset the flag so a fresh result / retest is always unhandled again.

BEGIN;

ALTER TABLE public.account_workshare_requests
  ADD COLUMN IF NOT EXISTS outcome_acknowledged_at timestamptz NULL;

-- Only meaningful once an outcome exists.
ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_outcome_ack_state_chk
  CHECK (outcome_acknowledged_at IS NULL OR outcome IS NOT NULL);

-- Record RPC: a newly recorded outcome starts UNhandled (clear the ack).
CREATE OR REPLACE FUNCTION public.record_account_workshare_receiver_outcome(
  p_completing_job_id uuid,
  p_outcome text,
  p_actor_user_id uuid,
  p_outcome_note text DEFAULT NULL
)
RETURNS SETOF public.account_workshare_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case uuid;
  v_request_id uuid;
  v_row public.account_workshare_requests%ROWTYPE;
  v_note text := NULLIF(btrim(coalesce(p_outcome_note, '')), '');
  v_event_type text;
BEGIN
  IF p_completing_job_id IS NULL THEN RETURN; END IF;
  IF p_outcome NOT IN ('passed', 'failed') THEN
    RAISE EXCEPTION 'invalid workshare outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  SELECT service_case_id INTO v_case FROM public.jobs WHERE id = p_completing_job_id;

  IF v_case IS NOT NULL THEN
    SELECT r.id INTO v_request_id
    FROM public.account_workshare_requests r
    JOIN public.jobs j ON j.id = r.receiving_job_id
    WHERE r.status = 'accepted' AND j.service_case_id = v_case
    LIMIT 1;
  END IF;

  IF v_request_id IS NULL THEN
    SELECT r.id INTO v_request_id
    FROM public.account_workshare_requests r
    WHERE r.status = 'accepted' AND r.receiving_job_id = p_completing_job_id
    LIMIT 1;
  END IF;

  IF v_request_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_row FROM public.account_workshare_requests WHERE id = v_request_id FOR UPDATE;

  IF v_row.outcome IS NOT DISTINCT FROM p_outcome
     AND v_row.outcome_note IS NOT DISTINCT FROM v_note THEN
    RETURN;
  END IF;

  UPDATE public.account_workshare_requests
  SET outcome                 = p_outcome,
      outcome_recorded_at     = timezone('utc', now()),
      outcome_note            = v_note,
      outcome_acknowledged_at = NULL,
      retest_requested_at     = NULL,
      retest_note             = NULL,
      updated_at              = timezone('utc', now())
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  v_event_type := CASE WHEN p_outcome = 'passed' THEN 'receiver_job_passed' ELSE 'receiver_job_failed' END;
  INSERT INTO public.account_workshare_request_events (
    account_workshare_request_id, job_id, event_type, actor_user_id, from_status, to_status, note
  ) VALUES (
    v_row.id, p_completing_job_id, v_event_type, p_actor_user_id, 'accepted', 'accepted', v_note
  );

  RETURN NEXT v_row;
END;
$$;

-- Retest RPC: clearing the outcome also clears the ack (keeps the coupling CHECK).
CREATE OR REPLACE FUNCTION public.request_account_workshare_retest(
  p_request_id uuid,
  p_note text,
  p_actor_user_id uuid
)
RETURNS SETOF public.account_workshare_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.account_workshare_requests%ROWTYPE;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
BEGIN
  IF p_request_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_row FROM public.account_workshare_requests
  WHERE id = p_request_id AND status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_row.outcome IS DISTINCT FROM 'failed' THEN RETURN; END IF;

  UPDATE public.account_workshare_requests
  SET retest_requested_at     = timezone('utc', now()),
      retest_note             = v_note,
      retest_count            = v_row.retest_count + 1,
      outcome                 = NULL,
      outcome_recorded_at     = NULL,
      outcome_note            = NULL,
      outcome_acknowledged_at = NULL,
      updated_at              = timezone('utc', now())
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.account_workshare_request_events (
    account_workshare_request_id, job_id, event_type, actor_user_id, from_status, to_status, note
  ) VALUES (
    v_row.id, v_row.receiving_job_id, 'workshare_retest_requested', p_actor_user_id, 'accepted', 'accepted', v_note
  );

  RETURN NEXT v_row;
END;
$$;

COMMIT;
