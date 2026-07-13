-- EveryStep JobWorks: workshare cross-account correction/retest loop (P1-F.3)
-- Purpose: after a failed outcome, let the contractor (sender) request a retest
--   with a corrections note; the rater retests (their normal ECC retest chain);
--   the retest RESULT flows back reliably even when the rater retests via a CHILD
--   job. Also lets the rater attach a note to the returned outcome. Builds on the
--   outcome slice (20260712140000).
--
-- Key correctness fix: the outcome recorder now matches the workshare request by
--   the shared service_case_id of the completing job (chain-aware) rather than the
--   exact receiving_job_id, so a retest CHILD job's terminal pass/fail still
--   updates the one accepted request keyed on the original receiving job.

BEGIN;

-- 1. Retest + outcome-note columns.
ALTER TABLE public.account_workshare_requests
  ADD COLUMN IF NOT EXISTS retest_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS retest_note         text        NULL,
  ADD COLUMN IF NOT EXISTS retest_count        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outcome_note        text        NULL;

-- 2. Couplings: retest_note only alongside a pending retest; outcome_note only
--    alongside a recorded outcome; length guards.
ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_retest_note_state_chk
  CHECK (retest_note IS NULL OR retest_requested_at IS NOT NULL);

ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_outcome_note_state_chk
  CHECK (outcome_note IS NULL OR outcome IS NOT NULL);

ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_retest_note_length_chk
  CHECK (retest_note IS NULL OR length(retest_note) <= 2000);

ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_outcome_note_length_chk
  CHECK (outcome_note IS NULL OR length(outcome_note) <= 2000);

-- 3. Extend the audit event_type domain with the retest-request event.
ALTER TABLE public.account_workshare_request_events
  DROP CONSTRAINT account_workshare_request_events_type_valid_chk;

ALTER TABLE public.account_workshare_request_events
  ADD CONSTRAINT account_workshare_request_events_type_valid_chk
  CHECK (
    event_type IN (
      'workshare_request_declined',
      'workshare_request_accepted',
      'receiver_job_created',
      'receiver_job_passed',
      'receiver_job_failed',
      'workshare_retest_requested'
    )
  );

-- 4. Trigger: keep Arms 1-3; update Arm 4 (record outcome — now clears any pending
--    retest and may carry an outcome_note); add Arm 5 (sender requests a retest).
--    Allowed transitions after this change:
--      * sent -> cancelled / declined / accepted (Arms 1-3, unchanged)
--      * accepted -> accepted recording a receiving-job outcome (Arm 4)
--      * accepted -> accepted requesting a retest (Arm 5)
CREATE OR REPLACE FUNCTION public.assert_account_workshare_request_cancel_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
        NEW.id = OLD.id
    AND NEW.connection_id = OLD.connection_id
    AND NEW.sender_account_id = OLD.sender_account_id
    AND NEW.receiver_account_id = OLD.receiver_account_id
    AND NEW.source_job_id = OLD.source_job_id
    AND NEW.request_type = OLD.request_type
    AND NEW.customer_name_snapshot          IS NOT DISTINCT FROM OLD.customer_name_snapshot
    AND NEW.customer_contact_name_snapshot  IS NOT DISTINCT FROM OLD.customer_contact_name_snapshot
    AND NEW.customer_phone_snapshot         IS NOT DISTINCT FROM OLD.customer_phone_snapshot
    AND NEW.customer_email_snapshot         IS NOT DISTINCT FROM OLD.customer_email_snapshot
    AND NEW.location_address_snapshot       IS NOT DISTINCT FROM OLD.location_address_snapshot
    AND NEW.location_address_line1_snapshot IS NOT DISTINCT FROM OLD.location_address_line1_snapshot
    AND NEW.location_address_line2_snapshot IS NOT DISTINCT FROM OLD.location_address_line2_snapshot
    AND NEW.location_city_snapshot          IS NOT DISTINCT FROM OLD.location_city_snapshot
    AND NEW.location_state_snapshot         IS NOT DISTINCT FROM OLD.location_state_snapshot
    AND NEW.location_zip_snapshot           IS NOT DISTINCT FROM OLD.location_zip_snapshot
    AND NEW.source_job_title_snapshot       IS NOT DISTINCT FROM OLD.source_job_title_snapshot
    AND NEW.source_job_reference_snapshot   IS NOT DISTINCT FROM OLD.source_job_reference_snapshot
    AND NEW.source_job_type_snapshot        IS NOT DISTINCT FROM OLD.source_job_type_snapshot
    AND NEW.source_job_description_snapshot IS NOT DISTINCT FROM OLD.source_job_description_snapshot
    AND NEW.permit_number_snapshot          IS NOT DISTINCT FROM OLD.permit_number_snapshot
    AND NEW.requested_scope_snapshot        IS NOT DISTINCT FROM OLD.requested_scope_snapshot
    AND NEW.sender_notes_snapshot           IS NOT DISTINCT FROM OLD.sender_notes_snapshot
    AND NEW.preferred_date                  IS NOT DISTINCT FROM OLD.preferred_date
    AND NEW.preferred_window_snapshot       IS NOT DISTINCT FROM OLD.preferred_window_snapshot
    AND NEW.created_by_user_id = OLD.created_by_user_id
    AND NEW.sent_at = OLD.sent_at
    AND NEW.created_at = OLD.created_at
  ) THEN
    RAISE EXCEPTION 'account_workshare_requests snapshot/identity columns are immutable';
  END IF;

  -- Arm 1: sender cancellation.
  IF OLD.status = 'sent'
    AND NEW.status = 'cancelled'
    AND NEW.cancelled_at IS NOT NULL
    AND NEW.receiving_job_id IS NOT DISTINCT FROM OLD.receiving_job_id
    AND NEW.declined_at IS NULL
    AND NEW.decline_reason IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- Arm 2: receiver decline.
  IF OLD.status = 'sent'
    AND NEW.status = 'declined'
    AND NEW.declined_at IS NOT NULL
    AND NEW.decided_by_user_id IS NOT NULL
    AND btrim(coalesce(NEW.decline_reason, '')) <> ''
    AND NEW.cancelled_at IS NULL
    AND NEW.receiving_job_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- Arm 3: receiver accept.
  IF OLD.status = 'sent'
    AND NEW.status = 'accepted'
    AND NEW.accepted_at IS NOT NULL
    AND NEW.decided_by_user_id IS NOT NULL
    AND NEW.receiving_job_id IS NOT NULL
    AND NEW.cancelled_at IS NULL
    AND NEW.declined_at IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- Arm 4: record receiving-job outcome (clears any pending retest; may add note).
  IF OLD.status = 'accepted'
    AND NEW.status = 'accepted'
    AND NEW.receiving_job_id IS NOT DISTINCT FROM OLD.receiving_job_id
    AND NEW.accepted_at IS NOT DISTINCT FROM OLD.accepted_at
    AND NEW.decided_by_user_id IS NOT DISTINCT FROM OLD.decided_by_user_id
    AND NEW.cancelled_at IS NULL
    AND NEW.declined_at IS NULL
    AND NEW.outcome IN ('passed', 'failed')
    AND NEW.outcome_recorded_at IS NOT NULL
    AND NEW.retest_requested_at IS NULL
    AND NEW.retest_note IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- Arm 5: sender requests a retest (clears the prior outcome; bumps the counter).
  IF OLD.status = 'accepted'
    AND NEW.status = 'accepted'
    AND NEW.receiving_job_id IS NOT DISTINCT FROM OLD.receiving_job_id
    AND NEW.accepted_at IS NOT DISTINCT FROM OLD.accepted_at
    AND NEW.decided_by_user_id IS NOT DISTINCT FROM OLD.decided_by_user_id
    AND NEW.cancelled_at IS NULL
    AND NEW.declined_at IS NULL
    AND NEW.retest_requested_at IS NOT NULL
    AND NEW.outcome IS NULL
    AND NEW.outcome_recorded_at IS NULL
    AND NEW.outcome_note IS NULL
    AND NEW.retest_count = OLD.retest_count + 1
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'account_workshare_requests: unsupported transition';
END;
$$;

-- 5. Sender retest-request UPDATE RLS policy (defense-in-depth; write path is admin).
DROP POLICY IF EXISTS account_workshare_requests_update_sender_retest_scope ON public.account_workshare_requests;

CREATE POLICY account_workshare_requests_update_sender_retest_scope
ON public.account_workshare_requests
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND sender_account_id = public.current_internal_account_owner_id()
  AND status = 'accepted'
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND sender_account_id = public.current_internal_account_owner_id()
  AND status = 'accepted'
  AND retest_requested_at IS NOT NULL
  AND outcome IS NULL
);

-- 6. Replace the outcome recorder: chain-aware (match by the completing job's
--    service_case_id) + optional outcome_note. Returns a row ONLY on a newly
--    recorded/changed outcome or a newly added note. service_role only.
DROP FUNCTION IF EXISTS public.record_account_workshare_receiver_outcome(uuid, text, uuid);

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

  -- Match the accepted request via the shared service_case (covers retest children);
  -- fall back to the exact receiving job id when no case is present.
  IF v_case IS NOT NULL THEN
    SELECT r.id INTO v_request_id
    FROM public.account_workshare_requests r
    JOIN public.jobs j ON j.id = r.receiving_job_id
    WHERE r.status = 'accepted'
      AND j.service_case_id = v_case
    LIMIT 1;
  END IF;

  IF v_request_id IS NULL THEN
    SELECT r.id INTO v_request_id
    FROM public.account_workshare_requests r
    WHERE r.status = 'accepted'
      AND r.receiving_job_id = p_completing_job_id
    LIMIT 1;
  END IF;

  IF v_request_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_row FROM public.account_workshare_requests WHERE id = v_request_id FOR UPDATE;

  -- Idempotent: skip when the outcome and note are already identical.
  IF v_row.outcome IS NOT DISTINCT FROM p_outcome
     AND v_row.outcome_note IS NOT DISTINCT FROM v_note THEN
    RETURN;
  END IF;

  UPDATE public.account_workshare_requests
  SET outcome             = p_outcome,
      outcome_recorded_at = timezone('utc', now()),
      outcome_note        = v_note,
      retest_requested_at = NULL,
      retest_note         = NULL,
      updated_at          = timezone('utc', now())
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

REVOKE ALL ON FUNCTION public.record_account_workshare_receiver_outcome(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_account_workshare_receiver_outcome(uuid, text, uuid, text) TO service_role;

-- 7. Sender requests a retest: clear the prior (failed) outcome, set the retest
--    note, bump the counter, write the audit event. Returns a row only when a
--    matching accepted+failed request was updated. service_role only.
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
  -- Only a failed outcome can be retested.
  IF v_row.outcome IS DISTINCT FROM 'failed' THEN RETURN; END IF;

  UPDATE public.account_workshare_requests
  SET retest_requested_at = timezone('utc', now()),
      retest_note         = v_note,
      retest_count        = v_row.retest_count + 1,
      outcome             = NULL,
      outcome_recorded_at = NULL,
      outcome_note        = NULL,
      updated_at          = timezone('utc', now())
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

REVOKE ALL ON FUNCTION public.request_account_workshare_retest(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_workshare_retest(uuid, text, uuid) TO service_role;

COMMIT;
