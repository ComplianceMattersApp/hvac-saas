-- Compliance Matters: workflow handoff request foundation
-- Purpose: durable installer-side handoff request/response truth for ECC workflow return flow.
-- Non-goals: no rater UI, no cross-account execution, no job/service_case/job_event mutation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workflow_handoff_requests (
  id                                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installer_account_owner_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workflow_instance_id              uuid        NOT NULL REFERENCES public.workflow_instances(id) ON DELETE RESTRICT,
  workflow_instance_milestone_id    uuid        NOT NULL REFERENCES public.workflow_instance_milestones(id) ON DELETE RESTRICT,
  service_case_id                   uuid        NOT NULL REFERENCES public.service_cases(id) ON DELETE RESTRICT,
  source_job_id                     uuid        NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  authorized_handoff_recipient_id   uuid        NOT NULL REFERENCES public.authorized_handoff_recipients(id) ON DELETE RESTRICT,
  recipient_type_snapshot           text        NOT NULL,
  recipient_display_name_snapshot   text        NOT NULL,
  handoff_kind                      text        NOT NULL DEFAULT 'ecc',
  handoff_status                    text        NOT NULL DEFAULT 'sent',
  sent_by_user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sent_at                           timestamptz NOT NULL DEFAULT timezone('utc', now()),
  responded_by_user_id              uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at                      timestamptz NULL,
  response_note                     text        NULL,
  evidence_reference                text        NULL,
  created_at                        timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                        timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT workflow_handoff_requests_handoff_kind_valid_chk
    CHECK (handoff_kind IN ('ecc', 'general_future')),

  CONSTRAINT workflow_handoff_requests_handoff_status_valid_chk
    CHECK (handoff_status IN ('sent', 'accepted', 'completed', 'rejected', 'cancelled')),

  CONSTRAINT workflow_handoff_requests_recipient_type_snapshot_not_blank_chk
    CHECK (length(btrim(recipient_type_snapshot)) > 0),

  CONSTRAINT workflow_handoff_requests_recipient_display_name_snapshot_not_blank_chk
    CHECK (length(btrim(recipient_display_name_snapshot)) > 0),

  CONSTRAINT workflow_handoff_requests_response_required_for_non_sent_chk
    CHECK (
      handoff_status = 'sent'
      OR (responded_by_user_id IS NOT NULL AND responded_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_installer_status_idx
  ON public.workflow_handoff_requests (installer_account_owner_user_id, handoff_status, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_installer_sent_at_idx
  ON public.workflow_handoff_requests (installer_account_owner_user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_workflow_instance_idx
  ON public.workflow_handoff_requests (workflow_instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_milestone_idx
  ON public.workflow_handoff_requests (workflow_instance_milestone_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_service_case_idx
  ON public.workflow_handoff_requests (service_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_recipient_idx
  ON public.workflow_handoff_requests (authorized_handoff_recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_handoff_requests_kind_status_idx
  ON public.workflow_handoff_requests (handoff_kind, handoff_status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_handoff_requests_open_recipient_uidx
  ON public.workflow_handoff_requests (workflow_instance_milestone_id, authorized_handoff_recipient_id)
  WHERE handoff_status IN ('sent', 'accepted');

DROP TRIGGER IF EXISTS workflow_handoff_requests_set_updated_at
  ON public.workflow_handoff_requests;

CREATE TRIGGER workflow_handoff_requests_set_updated_at
BEFORE UPDATE ON public.workflow_handoff_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_workflow_handoff_request_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  workflow_instance_row record;
  milestone_row record;
  recipient_row record;
  source_job_row record;
BEGIN
  SELECT wi.id, wi.account_owner_user_id, wi.service_case_id
  INTO workflow_instance_row
  FROM public.workflow_instances wi
  WHERE wi.id = NEW.workflow_instance_id;

  IF workflow_instance_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_requests workflow_instance_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF workflow_instance_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests workflow_instance/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.service_case_id IS DISTINCT FROM workflow_instance_row.service_case_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests service_case/workflow mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT wm.id, wm.account_owner_user_id, wm.workflow_instance_id
  INTO milestone_row
  FROM public.workflow_instance_milestones wm
  WHERE wm.id = NEW.workflow_instance_milestone_id;

  IF milestone_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_requests workflow_instance_milestone_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF milestone_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests milestone/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF milestone_row.workflow_instance_id IS DISTINCT FROM NEW.workflow_instance_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests milestone/workflow mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT r.id, r.account_owner_user_id, r.handoff_kind, r.recipient_type
  INTO recipient_row
  FROM public.authorized_handoff_recipients r
  WHERE r.id = NEW.authorized_handoff_recipient_id;

  IF recipient_row.id IS NULL THEN
    RAISE EXCEPTION 'workflow_handoff_requests authorized_handoff_recipient_id not found'
      USING ERRCODE = '23503';
  END IF;

  IF recipient_row.account_owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
    RAISE EXCEPTION 'workflow_handoff_requests recipient/account mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF recipient_row.handoff_kind IS DISTINCT FROM NEW.handoff_kind THEN
    RAISE EXCEPTION 'workflow_handoff_requests recipient/handoff_kind mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.source_job_id IS NOT NULL THEN
    SELECT j.id, c.owner_user_id, j.service_case_id
    INTO source_job_row
    FROM public.jobs j
    JOIN public.customers c ON c.id = j.customer_id
    WHERE j.id = NEW.source_job_id;

    IF source_job_row.id IS NULL THEN
      RAISE EXCEPTION 'workflow_handoff_requests source_job_id not found'
        USING ERRCODE = '23503';
    END IF;

    IF source_job_row.owner_user_id IS DISTINCT FROM NEW.installer_account_owner_user_id THEN
      RAISE EXCEPTION 'workflow_handoff_requests source_job/account mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF source_job_row.service_case_id IS DISTINCT FROM NEW.service_case_id THEN
      RAISE EXCEPTION 'workflow_handoff_requests source_job/service_case mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_handoff_requests_assert_scope
  ON public.workflow_handoff_requests;

CREATE TRIGGER workflow_handoff_requests_assert_scope
BEFORE INSERT OR UPDATE ON public.workflow_handoff_requests
FOR EACH ROW
EXECUTE FUNCTION public.assert_workflow_handoff_request_scope();

ALTER TABLE public.workflow_handoff_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_handoff_requests_select_account_scope ON public.workflow_handoff_requests;
DROP POLICY IF EXISTS workflow_handoff_requests_insert_account_scope ON public.workflow_handoff_requests;

CREATE POLICY workflow_handoff_requests_select_account_scope
ON public.workflow_handoff_requests
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY workflow_handoff_requests_insert_account_scope
ON public.workflow_handoff_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND installer_account_owner_user_id = public.current_internal_account_owner_id()
  AND sent_by_user_id = auth.uid()
);

COMMIT;