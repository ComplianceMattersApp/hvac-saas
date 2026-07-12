-- EveryStep JobWorks: workshare receiver ACCEPT slice (P1-D2 slice 2 / P1-E)
-- Purpose: allow the receiver/rater account to accept a sent ECC/HERS request,
--   which creates an ECC job in the rater's account from the snapshot and links
--   it back via receiving_job_id, recording atomic audit events. One-click
--   accept-creates-job. Builds on the decline slice (20260712120000), which
--   already added 'accepted' to the status CHECK, the accepted_at column, the
--   shared decided_by_user_id, and pre-registered the accept/receiver-job event
--   types on account_workshare_request_events.
--
-- Statement order: swap receiving-job back-link CHECK -> accepted state-coupling
--   CHECK -> CREATE OR REPLACE trigger fn (add accept arm) -> receiver accept RLS
--   policy -> accept RPC.

BEGIN;

-- 1. Allow the receiving_job_id back-link, but only on an accepted row. Replaces
--    the foundation's hard "receiving_job_id IS NULL" future-state guard.
ALTER TABLE public.account_workshare_requests
  DROP CONSTRAINT account_workshare_requests_receiving_job_future_state_chk;

ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_receiving_job_state_chk
  CHECK (status = 'accepted' OR receiving_job_id IS NULL);

-- 2. Accept state-coupling: accepted <=> accepted_at + decided_by_user_id +
--    receiving_job_id all present; non-accepted rows carry no accepted_at.
ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_accepted_state_chk
  CHECK (
    (status <> 'accepted'
      OR (accepted_at IS NOT NULL AND decided_by_user_id IS NOT NULL AND receiving_job_id IS NOT NULL))
    AND (status = 'accepted' OR accepted_at IS NULL)
  );

-- 3. Extend the transition trigger with Arm 3 (receiver accept). Allowed
--    transitions after this change are EXACTLY:
--      * sent -> cancelled (sender)
--      * sent -> declined  (receiver, with reason)
--      * sent -> accepted  (receiver, with a created receiving job)
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

  -- Arm 3: receiver accept (new this slice).
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

  RAISE EXCEPTION 'account_workshare_requests only supports sender cancellation (sent->cancelled), receiver decline (sent->declined), or receiver accept (sent->accepted) in this phase';
END;
$$;

-- 4. Receiver accept UPDATE RLS policy (additive; disjoint from the sender-cancel
--    and receiver-decline policies).
DROP POLICY IF EXISTS account_workshare_requests_update_receiver_accept_scope ON public.account_workshare_requests;

CREATE POLICY account_workshare_requests_update_receiver_accept_scope
ON public.account_workshare_requests
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND receiver_account_id = public.current_internal_account_owner_id()
  AND status = 'sent'
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND receiver_account_id = public.current_internal_account_owner_id()
  AND status = 'accepted'
  AND accepted_at IS NOT NULL
  AND decided_by_user_id IS NOT NULL
  AND receiving_job_id IS NOT NULL
);

-- 5. Atomic accept: flip status + stamp the back-link + write both audit events
--    in one function body/txn. Called via the admin/service-role client from the
--    server action AFTER the receiving job has been created (needs its id).
--    Granted to service_role only.
CREATE OR REPLACE FUNCTION public.accept_account_workshare_request(
  p_request_id uuid,
  p_receiving_job_id uuid,
  p_actor_user_id uuid
)
RETURNS public.account_workshare_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.account_workshare_requests%ROWTYPE;
  v_from_status text;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Request id is required' USING ERRCODE = '22023';
  END IF;
  IF p_receiving_job_id IS NULL THEN
    RAISE EXCEPTION 'Receiving job id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.account_workshare_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'sent' THEN
    RAISE EXCEPTION 'Only sent requests can be accepted' USING ERRCODE = '22023';
  END IF;

  v_from_status := v_row.status;

  UPDATE public.account_workshare_requests
  SET status             = 'accepted',
      accepted_at        = timezone('utc', now()),
      decided_by_user_id = p_actor_user_id,
      receiving_job_id   = p_receiving_job_id,
      updated_at         = timezone('utc', now())
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  INSERT INTO public.account_workshare_request_events (
    account_workshare_request_id, job_id, event_type, actor_user_id, from_status, to_status
  ) VALUES
    (p_request_id, NULL, 'workshare_request_accepted', p_actor_user_id, v_from_status, 'accepted'),
    (p_request_id, p_receiving_job_id, 'receiver_job_created', p_actor_user_id, v_from_status, 'accepted');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_account_workshare_request(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_account_workshare_request(uuid, uuid, uuid) TO service_role;

COMMIT;
