-- EveryStep JobWorks: workshare receiver DECLINE slice (P1-D2, Slice 1)
-- Purpose: allow the receiver/rater account to decline a sent ECC/HERS request
--   (sent -> declined) with a required reason, recording one atomic
--   workshare-scoped audit event. No job creation, no notifications, no accept
--   path (Slice 2), no receiver back-link (Slice 3).
-- Owner-approved reopening of the account_workshare_requests foundation
--   (20260708100000) for the deliberate schema changes below.
--
-- Statement order (deliberate): add columns -> decline state-coupling CHECK ->
--   extend status CHECK -> CREATE OR REPLACE transition trigger fn ->
--   receiver UPDATE RLS policy -> create audit table + RLS -> create decline RPC.

BEGIN;

-- 1. Decision columns (shared decision shape; accepted_at is pre-added for
--    Slice 2 shape completeness and is NOT wired to any behavior this slice).
ALTER TABLE public.account_workshare_requests
  ADD COLUMN IF NOT EXISTS declined_at        timestamptz NULL,
  ADD COLUMN IF NOT EXISTS decided_by_user_id uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decline_reason     text        NULL,
  ADD COLUMN IF NOT EXISTS accepted_at        timestamptz NULL;

-- 2. Decline state-coupling CHECK (same timestamp-coupled-to-status discipline
--    as account_workshare_requests_cancelled_state_chk). decided_by_user_id is
--    required WHEN declined but intentionally NOT forbidden on other statuses,
--    so Slice 2's accepted transition can reuse it without re-migrating.
ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_declined_state_chk
  CHECK (
    (status <> 'declined'
      OR (declined_at IS NOT NULL AND decline_reason IS NOT NULL AND decided_by_user_id IS NOT NULL))
    AND (status = 'declined'
      OR (declined_at IS NULL AND decline_reason IS NULL))
  );

ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_decline_reason_length_chk
  CHECK (decline_reason IS NULL OR length(decline_reason) <= 2000);

-- 3. Extend the status domain. 'accepted' is pre-registered so Slice 2 does not
--    re-migrate this constraint; only 'declined' is exercised this slice.
ALTER TABLE public.account_workshare_requests
  DROP CONSTRAINT account_workshare_requests_status_valid_chk;

ALTER TABLE public.account_workshare_requests
  ADD CONSTRAINT account_workshare_requests_status_valid_chk
  CHECK (status IN ('sent', 'cancelled', 'declined', 'accepted'));

-- 4. Relax the transition trigger PRECISELY. Function name is retained (the
--    bound trigger is untouched) even though it is now a slight misnomer.
--    Allowed transitions after this change are EXACTLY:
--      * sent -> cancelled (sender): cancelled_at set, decision fields null.
--      * sent -> declined (receiver): declined_at + decided_by_user_id set,
--          non-blank decline_reason, cancelled_at null, receiving_job_id null.
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

  -- Arm 1: sender cancellation (existing semantics, unchanged).
  IF OLD.status = 'sent'
    AND NEW.status = 'cancelled'
    AND NEW.cancelled_at IS NOT NULL
    AND NEW.receiving_job_id IS NOT DISTINCT FROM OLD.receiving_job_id
    AND NEW.declined_at IS NULL
    AND NEW.decline_reason IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- Arm 2: receiver decline (new this slice).
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

  RAISE EXCEPTION 'account_workshare_requests only supports sender cancellation (sent->cancelled) or receiver decline (sent->declined) in this phase';
END;
$$;

-- 5. Receiver UPDATE RLS policy (additive; coexists with the sender-cancel
--    policy without widening it — the USING predicates are disjoint).
DROP POLICY IF EXISTS account_workshare_requests_update_receiver_decline_scope ON public.account_workshare_requests;

CREATE POLICY account_workshare_requests_update_receiver_decline_scope
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
  AND status = 'declined'
  AND declined_at IS NOT NULL
  AND decided_by_user_id IS NOT NULL
  AND receiving_job_id IS NULL
);

-- 6. Workshare-scoped audit trail. Modeled on permit_request_events. No job
--    exists at decline time, so this is NOT job_events. event_type / status
--    domains pre-register the whole lane so Slice 2/3 do not re-migrate.
CREATE TABLE IF NOT EXISTS public.account_workshare_request_events (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_workshare_request_id  uuid        NOT NULL REFERENCES public.account_workshare_requests(id) ON DELETE RESTRICT,
  job_id                        uuid        NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  event_type                    text        NOT NULL,
  actor_user_id                 uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status                   text        NULL,
  to_status                     text        NULL,
  note                          text        NULL,
  meta                          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                    timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT account_workshare_request_events_type_valid_chk CHECK (
    event_type IN (
      'workshare_request_declined',
      'workshare_request_accepted',
      'receiver_job_created'
    )
  ),
  CONSTRAINT account_workshare_request_events_from_status_valid_chk CHECK (
    from_status IS NULL OR from_status IN ('sent', 'cancelled', 'declined', 'accepted')
  ),
  CONSTRAINT account_workshare_request_events_to_status_valid_chk CHECK (
    to_status IS NULL OR to_status IN ('sent', 'cancelled', 'declined', 'accepted')
  ),
  CONSTRAINT account_workshare_request_events_note_length_chk CHECK (
    note IS NULL OR length(note) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS account_workshare_request_events_request_recent_idx
  ON public.account_workshare_request_events (account_workshare_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_workshare_request_events_type_idx
  ON public.account_workshare_request_events (event_type, created_at DESC);

ALTER TABLE public.account_workshare_request_events ENABLE ROW LEVEL SECURITY;

-- SELECT: either party to the parent request may read its audit trail. The
-- join mirrors account_workshare_requests_select_party_scope and avoids
-- denormalizing the two party-account columns onto the event row.
DROP POLICY IF EXISTS account_workshare_request_events_select_party_scope ON public.account_workshare_request_events;

CREATE POLICY account_workshare_request_events_select_party_scope
ON public.account_workshare_request_events
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.account_workshare_requests request
    WHERE request.id = account_workshare_request_events.account_workshare_request_id
      AND (
        request.sender_account_id = public.current_internal_account_owner_id()
        OR request.receiver_account_id = public.current_internal_account_owner_id()
      )
  )
);
-- No INSERT/UPDATE/DELETE policy: writes are service-role only, exactly like
-- permit_request_events.

-- 7. Atomic decline: status transition + audit event in one function body/txn.
--    Called only via the admin/service-role client from the server action, which
--    performs the app-level receiver authorization first. Granted to
--    service_role only (NOT authenticated) so an authenticated user cannot
--    invoke it directly and bypass the action's receiver check.
CREATE OR REPLACE FUNCTION public.decline_account_workshare_request(
  p_request_id uuid,
  p_reason text,
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
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Request id is required' USING ERRCODE = '22023';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A decline reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.account_workshare_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'sent' THEN
    RAISE EXCEPTION 'Only sent requests can be declined' USING ERRCODE = '22023';
  END IF;

  v_from_status := v_row.status;

  UPDATE public.account_workshare_requests
  SET status             = 'declined',
      declined_at        = timezone('utc', now()),
      decided_by_user_id = p_actor_user_id,
      decline_reason     = v_reason,
      updated_at         = timezone('utc', now())
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  INSERT INTO public.account_workshare_request_events (
    account_workshare_request_id,
    job_id,
    event_type,
    actor_user_id,
    from_status,
    to_status,
    note
  ) VALUES (
    p_request_id,
    NULL,
    'workshare_request_declined',
    p_actor_user_id,
    v_from_status,
    'declined',
    v_reason
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_account_workshare_request(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_account_workshare_request(uuid, text, uuid) TO service_role;

COMMIT;
