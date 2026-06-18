-- Compliance Matters: permit request intake review fields
-- Purpose: add nullable internal intake snapshots without creating customers,
-- jobs, service cases, scheduling records, or route-completion behavior.

BEGIN;

ALTER TABLE public.permit_requests
  ADD COLUMN IF NOT EXISTS request_label text NULL,
  ADD COLUMN IF NOT EXISTS customer_first_name_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS customer_last_name_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS service_address_text_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS internal_intake_note text NULL;

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_request_label_length_chk,
  ADD CONSTRAINT permit_requests_request_label_length_chk CHECK (
    request_label IS NULL
    OR length(request_label) <= 160
  );

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_customer_first_name_snapshot_length_chk,
  ADD CONSTRAINT permit_requests_customer_first_name_snapshot_length_chk CHECK (
    customer_first_name_snapshot IS NULL
    OR length(customer_first_name_snapshot) <= 120
  );

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_customer_last_name_snapshot_length_chk,
  ADD CONSTRAINT permit_requests_customer_last_name_snapshot_length_chk CHECK (
    customer_last_name_snapshot IS NULL
    OR length(customer_last_name_snapshot) <= 120
  );

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_service_address_text_snapshot_length_chk,
  ADD CONSTRAINT permit_requests_service_address_text_snapshot_length_chk CHECK (
    service_address_text_snapshot IS NULL
    OR length(service_address_text_snapshot) <= 500
  );

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_internal_intake_note_length_chk,
  ADD CONSTRAINT permit_requests_internal_intake_note_length_chk CHECK (
    internal_intake_note IS NULL
    OR length(internal_intake_note) <= 4000
  );

ALTER TABLE public.permit_request_events
  DROP CONSTRAINT IF EXISTS permit_request_events_type_valid_chk,
  ADD CONSTRAINT permit_request_events_type_valid_chk CHECK (
    event_type IN (
      'permit_request_received',
      'permit_request_accepted',
      'permit_request_on_hold',
      'permit_request_intake_updated',
      'permit_created',
      'permit_ready_for_testing',
      'permit_pending_install'
    )
  );

COMMIT;
