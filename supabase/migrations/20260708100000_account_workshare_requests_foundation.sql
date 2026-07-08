-- EveryStep FieldWorks: account-to-account ECC/HERS work request foundation (P1-C)
-- Purpose: sender-created bridge requests with safe copied snapshots only.
-- Non-goals: no receiver jobs, ECC test runs, external members, contractor records, or paperwork workflow.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_workshare_requests (
  id                              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id                   uuid        NOT NULL REFERENCES public.account_workshare_connections(id) ON DELETE RESTRICT,
  sender_account_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  receiver_account_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_job_id                   uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  receiving_job_id                uuid        NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  request_type                    text        NOT NULL DEFAULT 'ecc_hers_testing',
  status                          text        NOT NULL DEFAULT 'sent',
  customer_name_snapshot          text        NULL,
  customer_contact_name_snapshot  text        NULL,
  customer_phone_snapshot         text        NULL,
  customer_email_snapshot         text        NULL,
  location_address_snapshot       text        NULL,
  location_address_line1_snapshot text        NULL,
  location_address_line2_snapshot text        NULL,
  location_city_snapshot          text        NULL,
  location_state_snapshot         text        NULL,
  location_zip_snapshot           text        NULL,
  source_job_title_snapshot       text        NULL,
  source_job_reference_snapshot   text        NULL,
  source_job_type_snapshot        text        NULL,
  source_job_description_snapshot text        NULL,
  permit_number_snapshot          text        NULL,
  requested_scope_snapshot        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sender_notes_snapshot           text        NULL,
  preferred_date                  date        NULL,
  preferred_window_snapshot       text        NULL,
  created_by_user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sent_at                         timestamptz NOT NULL DEFAULT timezone('utc', now()),
  cancelled_at                    timestamptz NULL,
  created_at                      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                      timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT account_workshare_requests_directional_pair_distinct_chk
    CHECK (sender_account_id <> receiver_account_id),

  CONSTRAINT account_workshare_requests_request_type_valid_chk
    CHECK (request_type IN ('ecc_hers_testing')),

  CONSTRAINT account_workshare_requests_status_valid_chk
    CHECK (status IN ('sent', 'cancelled')),

  CONSTRAINT account_workshare_requests_cancelled_state_chk
    CHECK (
      (status <> 'cancelled' OR cancelled_at IS NOT NULL)
      AND (status = 'cancelled' OR cancelled_at IS NULL)
    ),

  CONSTRAINT account_workshare_requests_receiving_job_future_state_chk
    CHECK (receiving_job_id IS NULL)
);

CREATE INDEX IF NOT EXISTS account_workshare_requests_sender_idx
  ON public.account_workshare_requests (sender_account_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS account_workshare_requests_receiver_idx
  ON public.account_workshare_requests (receiver_account_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS account_workshare_requests_source_job_idx
  ON public.account_workshare_requests (sender_account_id, source_job_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS account_workshare_requests_connection_idx
  ON public.account_workshare_requests (connection_id, sent_at DESC);

CREATE OR REPLACE FUNCTION public.assert_account_workshare_request_cancel_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'sent'
    AND NEW.status = 'cancelled'
    AND NEW.cancelled_at IS NOT NULL
    AND NEW.id = OLD.id
    AND NEW.connection_id = OLD.connection_id
    AND NEW.sender_account_id = OLD.sender_account_id
    AND NEW.receiver_account_id = OLD.receiver_account_id
    AND NEW.source_job_id = OLD.source_job_id
    AND NEW.receiving_job_id IS NOT DISTINCT FROM OLD.receiving_job_id
    AND NEW.request_type = OLD.request_type
    AND NEW.customer_name_snapshot IS NOT DISTINCT FROM OLD.customer_name_snapshot
    AND NEW.customer_contact_name_snapshot IS NOT DISTINCT FROM OLD.customer_contact_name_snapshot
    AND NEW.customer_phone_snapshot IS NOT DISTINCT FROM OLD.customer_phone_snapshot
    AND NEW.customer_email_snapshot IS NOT DISTINCT FROM OLD.customer_email_snapshot
    AND NEW.location_address_snapshot IS NOT DISTINCT FROM OLD.location_address_snapshot
    AND NEW.location_address_line1_snapshot IS NOT DISTINCT FROM OLD.location_address_line1_snapshot
    AND NEW.location_address_line2_snapshot IS NOT DISTINCT FROM OLD.location_address_line2_snapshot
    AND NEW.location_city_snapshot IS NOT DISTINCT FROM OLD.location_city_snapshot
    AND NEW.location_state_snapshot IS NOT DISTINCT FROM OLD.location_state_snapshot
    AND NEW.location_zip_snapshot IS NOT DISTINCT FROM OLD.location_zip_snapshot
    AND NEW.source_job_title_snapshot IS NOT DISTINCT FROM OLD.source_job_title_snapshot
    AND NEW.source_job_reference_snapshot IS NOT DISTINCT FROM OLD.source_job_reference_snapshot
    AND NEW.source_job_type_snapshot IS NOT DISTINCT FROM OLD.source_job_type_snapshot
    AND NEW.source_job_description_snapshot IS NOT DISTINCT FROM OLD.source_job_description_snapshot
    AND NEW.permit_number_snapshot IS NOT DISTINCT FROM OLD.permit_number_snapshot
    AND NEW.requested_scope_snapshot IS NOT DISTINCT FROM OLD.requested_scope_snapshot
    AND NEW.sender_notes_snapshot IS NOT DISTINCT FROM OLD.sender_notes_snapshot
    AND NEW.preferred_date IS NOT DISTINCT FROM OLD.preferred_date
    AND NEW.preferred_window_snapshot IS NOT DISTINCT FROM OLD.preferred_window_snapshot
    AND NEW.created_by_user_id = OLD.created_by_user_id
    AND NEW.sent_at = OLD.sent_at
    AND NEW.created_at = OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'account_workshare_requests only supports sender cancellation updates in this phase';
END;
$$;

DROP TRIGGER IF EXISTS account_workshare_requests_cancel_only
  ON public.account_workshare_requests;

CREATE TRIGGER account_workshare_requests_cancel_only
BEFORE UPDATE ON public.account_workshare_requests
FOR EACH ROW
EXECUTE FUNCTION public.assert_account_workshare_request_cancel_only();

DROP TRIGGER IF EXISTS account_workshare_requests_set_updated_at
  ON public.account_workshare_requests;

CREATE TRIGGER account_workshare_requests_set_updated_at
BEFORE UPDATE ON public.account_workshare_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_workshare_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_workshare_requests_select_party_scope ON public.account_workshare_requests;
DROP POLICY IF EXISTS account_workshare_requests_insert_sender_scope ON public.account_workshare_requests;
DROP POLICY IF EXISTS account_workshare_requests_update_sender_cancel_scope ON public.account_workshare_requests;

CREATE POLICY account_workshare_requests_select_party_scope
ON public.account_workshare_requests
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND (
    sender_account_id = public.current_internal_account_owner_id()
    OR receiver_account_id = public.current_internal_account_owner_id()
  )
);

CREATE POLICY account_workshare_requests_insert_sender_scope
ON public.account_workshare_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND sender_account_id = public.current_internal_account_owner_id()
  AND created_by_user_id = auth.uid()
  AND receiving_job_id IS NULL
  AND status = 'sent'
  AND EXISTS (
    SELECT 1
    FROM public.account_workshare_connections connection
    WHERE connection.id = account_workshare_requests.connection_id
      AND connection.sender_account_id = account_workshare_requests.sender_account_id
      AND connection.receiver_account_id = account_workshare_requests.receiver_account_id
      AND connection.service_type = 'ecc_hers'
      AND connection.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM public.jobs source_job
    JOIN public.customers source_customer ON source_customer.id = source_job.customer_id
    WHERE source_job.id = account_workshare_requests.source_job_id
      AND source_job.deleted_at IS NULL
      AND source_customer.owner_user_id = account_workshare_requests.sender_account_id
  )
);

CREATE POLICY account_workshare_requests_update_sender_cancel_scope
ON public.account_workshare_requests
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND sender_account_id = public.current_internal_account_owner_id()
  AND status = 'sent'
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND sender_account_id = public.current_internal_account_owner_id()
  AND status = 'cancelled'
  AND cancelled_at IS NOT NULL
  AND receiving_job_id IS NULL
);

COMMIT;
