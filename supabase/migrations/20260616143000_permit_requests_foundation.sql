-- Compliance Matters: permit requests schema/read-model foundation
-- Purpose: add dormant permit paperwork tracking without changing Ops UI,
-- job lifecycle, ECC truth, or contractor scheduling authority.

BEGIN;

CREATE TABLE IF NOT EXISTS public.permit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  job_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  service_case_id uuid NULL REFERENCES public.service_cases(id) ON DELETE SET NULL,
  contractor_intake_submission_id uuid NULL REFERENCES public.contractor_intake_submissions(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'permit_request',
  hold_reason text NULL,
  post_permit_route text NULL,

  permit_number text NULL,
  jurisdiction text NULL,
  permit_date date NULL,
  contractor_note text NULL,

  submitted_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  accepted_at timestamptz NULL,
  on_hold_at timestamptz NULL,
  completed_at timestamptz NULL,

  CONSTRAINT permit_requests_status_valid_chk CHECK (
    status IN (
      'permit_request',
      'accepted_in_process',
      'on_hold_additional_info_needed',
      'permit_created'
    )
  ),
  CONSTRAINT permit_requests_hold_reason_valid_chk CHECK (
    hold_reason IS NULL
    OR hold_reason IN ('additional_information_needed')
  ),
  CONSTRAINT permit_requests_post_permit_route_valid_chk CHECK (
    post_permit_route IS NULL
    OR post_permit_route IN ('ready_for_testing', 'pending_install')
  ),
  CONSTRAINT permit_requests_hold_reason_required_chk CHECK (
    status <> 'on_hold_additional_info_needed'
    OR hold_reason = 'additional_information_needed'
  ),
  CONSTRAINT permit_requests_terminal_route_required_chk CHECK (
    status <> 'permit_created'
    OR post_permit_route IS NOT NULL
  ),
  CONSTRAINT permit_requests_terminal_completed_at_required_chk CHECK (
    status <> 'permit_created'
    OR completed_at IS NOT NULL
  ),
  CONSTRAINT permit_requests_contractor_note_length_chk CHECK (
    contractor_note IS NULL
    OR length(contractor_note) <= 4000
  )
);

CREATE TABLE IF NOT EXISTS public.permit_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  permit_request_id uuid NOT NULL REFERENCES public.permit_requests(id) ON DELETE RESTRICT,
  job_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  service_case_id uuid NULL REFERENCES public.service_cases(id) ON DELETE SET NULL,

  event_type text NOT NULL,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status text NULL,
  to_status text NULL,
  post_permit_route text NULL,
  note text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT permit_request_events_type_valid_chk CHECK (
    event_type IN (
      'permit_request_received',
      'permit_request_accepted',
      'permit_request_on_hold',
      'permit_created',
      'permit_ready_for_testing',
      'permit_pending_install'
    )
  ),
  CONSTRAINT permit_request_events_from_status_valid_chk CHECK (
    from_status IS NULL
    OR from_status IN (
      'permit_request',
      'accepted_in_process',
      'on_hold_additional_info_needed',
      'permit_created'
    )
  ),
  CONSTRAINT permit_request_events_to_status_valid_chk CHECK (
    to_status IS NULL
    OR to_status IN (
      'permit_request',
      'accepted_in_process',
      'on_hold_additional_info_needed',
      'permit_created'
    )
  ),
  CONSTRAINT permit_request_events_post_permit_route_valid_chk CHECK (
    post_permit_route IS NULL
    OR post_permit_route IN ('ready_for_testing', 'pending_install')
  )
);

CREATE INDEX IF NOT EXISTS permit_requests_active_queue_idx
  ON public.permit_requests (account_owner_user_id, status, created_at ASC)
  WHERE status IN (
    'permit_request',
    'accepted_in_process',
    'on_hold_additional_info_needed'
  );

CREATE INDEX IF NOT EXISTS permit_requests_owner_contractor_idx
  ON public.permit_requests (account_owner_user_id, contractor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS permit_requests_owner_job_idx
  ON public.permit_requests (account_owner_user_id, job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS permit_requests_service_case_idx
  ON public.permit_requests (service_case_id)
  WHERE service_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS permit_requests_intake_submission_idx
  ON public.permit_requests (contractor_intake_submission_id)
  WHERE contractor_intake_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS permit_request_events_request_recent_idx
  ON public.permit_request_events (permit_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS permit_request_events_owner_recent_idx
  ON public.permit_request_events (account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS permit_request_events_type_idx
  ON public.permit_request_events (event_type, created_at DESC);

DROP TRIGGER IF EXISTS permit_requests_set_updated_at ON public.permit_requests;
CREATE TRIGGER permit_requests_set_updated_at
BEFORE UPDATE ON public.permit_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_permit_request_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contractor_owner uuid;
  v_job record;
  v_service_case record;
  v_intake record;
BEGIN
  SELECT owner_user_id
    INTO v_contractor_owner
  FROM public.contractors
  WHERE id = NEW.contractor_id;

  IF v_contractor_owner IS DISTINCT FROM NEW.account_owner_user_id THEN
    RAISE EXCEPTION 'permit request contractor account scope mismatch';
  END IF;

  IF NEW.job_id IS NOT NULL THEN
    SELECT contractor_id, customer_id, location_id, service_case_id
      INTO v_job
    FROM public.jobs
    WHERE id = NEW.job_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'permit request job account scope mismatch';
    END IF;

    IF NOT public.job_matches_account_owner(
      v_job.contractor_id,
      v_job.customer_id,
      v_job.location_id,
      v_job.service_case_id,
      NEW.account_owner_user_id
    ) THEN
      RAISE EXCEPTION 'permit request job account scope mismatch';
    END IF;
  END IF;

  IF NEW.service_case_id IS NOT NULL THEN
    SELECT id, customer_id, location_id
      INTO v_service_case
    FROM public.service_cases
    WHERE id = NEW.service_case_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'permit request service case account scope mismatch';
    END IF;

    IF NOT public.service_case_matches_account_owner(
      v_service_case.id,
      v_service_case.customer_id,
      v_service_case.location_id,
      NEW.account_owner_user_id
    ) THEN
      RAISE EXCEPTION 'permit request service case account scope mismatch';
    END IF;
  END IF;

  IF NEW.contractor_intake_submission_id IS NOT NULL THEN
    SELECT account_owner_user_id, contractor_id
      INTO v_intake
    FROM public.contractor_intake_submissions
    WHERE id = NEW.contractor_intake_submission_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'permit request intake submission account scope mismatch';
    END IF;

    IF v_intake.account_owner_user_id IS DISTINCT FROM NEW.account_owner_user_id
      OR v_intake.contractor_id IS DISTINCT FROM NEW.contractor_id THEN
      RAISE EXCEPTION 'permit request intake submission account scope mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_permit_request_account_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_permit_request_account_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_permit_request_account_scope() TO service_role;

DROP TRIGGER IF EXISTS permit_requests_assert_account_scope ON public.permit_requests;
CREATE TRIGGER permit_requests_assert_account_scope
BEFORE INSERT OR UPDATE ON public.permit_requests
FOR EACH ROW
EXECUTE FUNCTION public.assert_permit_request_account_scope();

CREATE OR REPLACE FUNCTION public.assert_permit_request_event_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
  v_job record;
  v_service_case record;
BEGIN
  SELECT account_owner_user_id, job_id, service_case_id
    INTO v_request
  FROM public.permit_requests
  WHERE id = NEW.permit_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permit request event account scope mismatch';
  END IF;

  IF v_request.account_owner_user_id IS DISTINCT FROM NEW.account_owner_user_id THEN
    RAISE EXCEPTION 'permit request event account scope mismatch';
  END IF;

  IF NEW.job_id IS NOT NULL THEN
    SELECT contractor_id, customer_id, location_id, service_case_id
      INTO v_job
    FROM public.jobs
    WHERE id = NEW.job_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'permit request event job account scope mismatch';
    END IF;

    IF NOT public.job_matches_account_owner(
      v_job.contractor_id,
      v_job.customer_id,
      v_job.location_id,
      v_job.service_case_id,
      NEW.account_owner_user_id
    ) THEN
      RAISE EXCEPTION 'permit request event job account scope mismatch';
    END IF;
  END IF;

  IF NEW.service_case_id IS NOT NULL THEN
    SELECT id, customer_id, location_id
      INTO v_service_case
    FROM public.service_cases
    WHERE id = NEW.service_case_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'permit request event service case account scope mismatch';
    END IF;

    IF NOT public.service_case_matches_account_owner(
      v_service_case.id,
      v_service_case.customer_id,
      v_service_case.location_id,
      NEW.account_owner_user_id
    ) THEN
      RAISE EXCEPTION 'permit request event service case account scope mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_permit_request_event_account_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_permit_request_event_account_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_permit_request_event_account_scope() TO service_role;

DROP TRIGGER IF EXISTS permit_request_events_assert_account_scope ON public.permit_request_events;
CREATE TRIGGER permit_request_events_assert_account_scope
BEFORE INSERT OR UPDATE ON public.permit_request_events
FOR EACH ROW
EXECUTE FUNCTION public.assert_permit_request_event_account_scope();

ALTER TABLE public.permit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permit_requests_internal_select_account_scope ON public.permit_requests;
CREATE POLICY permit_requests_internal_select_account_scope
ON public.permit_requests
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

DROP POLICY IF EXISTS permit_requests_contractor_select_own ON public.permit_requests;
CREATE POLICY permit_requests_contractor_select_own
ON public.permit_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contractor_users cu
    WHERE cu.contractor_id = permit_requests.contractor_id
      AND cu.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS permit_request_events_internal_select_account_scope ON public.permit_request_events;
CREATE POLICY permit_request_events_internal_select_account_scope
ON public.permit_request_events
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

DROP POLICY IF EXISTS permit_request_events_contractor_select_own ON public.permit_request_events;
CREATE POLICY permit_request_events_contractor_select_own
ON public.permit_request_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.permit_requests pr
    JOIN public.contractor_users cu
      ON cu.contractor_id = pr.contractor_id
    WHERE pr.id = permit_request_events.permit_request_id
      AND cu.user_id = auth.uid()
  )
);

COMMIT;
