-- EveryStep JobWorks: workshare receiver-job OUTCOME return (P1-F.1)
-- Purpose: when the rater's accepted receiving job finishes ECC testing (pass or
--   fail), record the outcome back on the workshare request so it can surface on
--   the contractor's source job and notify the sender. Builds on the accept slice
--   (20260712130000). Outcome is a separate axis from the request lifecycle
--   status (which stays 'accepted').
--
-- Statement order: outcome columns -> outcome state-coupling CHECK -> extend
--   audit event_type CHECK -> CREATE OR REPLACE trigger (add Arm 4) -> receiver
--   outcome UPDATE RLS policy -> record-outcome RPC.

BEGIN;

-- 1. Outcome columns (separate from status; only meaningful on an accepted row).
ALTER TABLE public.account_workshare_requests
  ADD COLUMN IF NOT EXISTS outcome             text        NULL,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz NULL;

-- 2. Outcome state-coupling: outcome in (passed,failed); only on an accepted row
--    with a receiving job; recorded_at present iff outcome present.
ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_outcome_state_chk
  CHECK (
    (outcome IS NULL OR outcome IN ('passed', 'failed'))
    AND (outcome IS NULL OR (status = 'accepted' AND receiving_job_id IS NOT NULL AND outcome_recorded_at IS NOT NULL))
    AND (outcome IS NOT NULL OR outcome_recorded_at IS NULL)
  );

-- 3. Extend the audit event_type domain with the outcome events.
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
      'receiver_job_failed'
    )
  );

-- 4. Add Arm 4 (record outcome on an accepted request) to the transition trigger.
--    Allowed transitions after this change:
--      * sent -> cancelled (sender)
--      * sent -> declined  (receiver)
--      * sent -> accepted  (receiver, with a created receiving job)
--      * accepted -> accepted (receiver, recording the receiving-job outcome only)
--    Everything else RAISEs. Snapshot/identity columns remain immutable.
CREATE OR REPLACE FUNCTION public.assert_account_workshare_request_cancel_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Shared guard: snapshot + identity columns are immutable on ANY allowed update.
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

  -- Arm 4: record receiving-job outcome on an accepted request (new this slice).
  --   Identity/decision fields are frozen; only outcome fields (and updated_at)
  --   may change.
  IF OLD.status = 'accepted'
    AND NEW.status = 'accepted'
    AND NEW.receiving_job_id IS NOT DISTINCT FROM OLD.receiving_job_id
    AND NEW.accepted_at IS NOT DISTINCT FROM OLD.accepted_at
    AND NEW.decided_by_user_id IS NOT DISTINCT FROM OLD.decided_by_user_id
    AND NEW.cancelled_at IS NULL
    AND NEW.declined_at IS NULL
    AND NEW.outcome IN ('passed', 'failed')
    AND NEW.outcome_recorded_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'account_workshare_requests only supports sender cancellation, receiver decline, receiver accept, or receiving-job outcome recording in this phase';
END;
$$;

-- 5. Receiver outcome UPDATE RLS policy (additive; the write path uses the admin
--    client, so this is defense-in-depth for any future user-client path).
DROP POLICY IF EXISTS account_workshare_requests_update_receiver_outcome_scope ON public.account_workshare_requests;

CREATE POLICY account_workshare_requests_update_receiver_outcome_scope
ON public.account_workshare_requests
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND receiver_account_id = public.current_internal_account_owner_id()
  AND status = 'accepted'
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND receiver_account_id = public.current_internal_account_owner_id()
  AND status = 'accepted'
  AND outcome IN ('passed', 'failed')
  AND outcome_recorded_at IS NOT NULL
);

-- 6. Record the receiving-job outcome + audit event, idempotently. Returns the
--    updated request row ONLY when the outcome was newly recorded (0 rows when
--    there is no matching accepted request or the outcome is unchanged), so the
--    caller notifies exactly once. service_role only.
CREATE OR REPLACE FUNCTION public.record_account_workshare_receiver_outcome(
  p_receiving_job_id uuid,
  p_outcome text,
  p_actor_user_id uuid
)
RETURNS SETOF public.account_workshare_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.account_workshare_requests%ROWTYPE;
  v_event_type text;
BEGIN
  IF p_receiving_job_id IS NULL THEN RETURN; END IF;
  IF p_outcome NOT IN ('passed', 'failed') THEN
    RAISE EXCEPTION 'invalid workshare outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.account_workshare_requests
  WHERE receiving_job_id = p_receiving_job_id
    AND status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_row.outcome IS NOT DISTINCT FROM p_outcome THEN RETURN; END IF;

  UPDATE public.account_workshare_requests
  SET outcome             = p_outcome,
      outcome_recorded_at = timezone('utc', now()),
      updated_at          = timezone('utc', now())
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  v_event_type := CASE WHEN p_outcome = 'passed' THEN 'receiver_job_passed' ELSE 'receiver_job_failed' END;

  INSERT INTO public.account_workshare_request_events (
    account_workshare_request_id, job_id, event_type, actor_user_id, from_status, to_status
  ) VALUES (
    v_row.id, p_receiving_job_id, v_event_type, p_actor_user_id, 'accepted', 'accepted'
  );

  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_account_workshare_receiver_outcome(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_account_workshare_receiver_outcome(uuid, text, uuid) TO service_role;

COMMIT;
