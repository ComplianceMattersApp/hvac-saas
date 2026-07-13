-- EveryStep JobWorks: workshare equipment snapshot (port installed equipment)
-- Purpose: carry the contractor's ECC-testable equipment (job_systems +
--   job_equipment) along with the request so the rater's accepted job is
--   pre-populated and immediately testable — no re-typing. Stored as a JSONB
--   snapshot frozen at send time, like the other *_snapshot fields.
--
-- Only schema here is the new column + adding it to the transition trigger's
--   immutability guard (it is set once at send and must never change afterward).
--   The snapshot read and the recreate-on-accept are application code.

BEGIN;

ALTER TABLE public.account_workshare_requests
  ADD COLUMN IF NOT EXISTS equipment_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Re-assert the transition trigger with equipment_snapshot added to the shared
-- immutability guard. Arms 1-5 are unchanged from 20260712150000.
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
    AND NEW.equipment_snapshot              IS NOT DISTINCT FROM OLD.equipment_snapshot
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

  -- Arm 4: record receiving-job outcome.
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

  -- Arm 5: sender requests a retest.
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

COMMIT;
