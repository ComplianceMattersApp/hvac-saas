-- Non-destructive terminal disposition for permit requests that are no longer required.
BEGIN;

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_status_valid_chk,
  ADD CONSTRAINT permit_requests_status_valid_chk CHECK (
    status IN (
      'permit_request',
      'accepted_in_process',
      'on_hold_additional_info_needed',
      'permit_created',
      'not_needed'
    )
  );

ALTER TABLE public.permit_requests
  DROP CONSTRAINT IF EXISTS permit_requests_terminal_completed_at_required_chk,
  ADD CONSTRAINT permit_requests_terminal_completed_at_required_chk CHECK (
    status NOT IN ('permit_created', 'not_needed')
    OR completed_at IS NOT NULL
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
      'permit_pending_install',
      'permit_request_not_needed'
    )
  ),
  DROP CONSTRAINT IF EXISTS permit_request_events_from_status_valid_chk,
  ADD CONSTRAINT permit_request_events_from_status_valid_chk CHECK (
    from_status IS NULL OR from_status IN (
      'permit_request',
      'accepted_in_process',
      'on_hold_additional_info_needed',
      'permit_created',
      'not_needed'
    )
  ),
  DROP CONSTRAINT IF EXISTS permit_request_events_to_status_valid_chk,
  ADD CONSTRAINT permit_request_events_to_status_valid_chk CHECK (
    to_status IS NULL OR to_status IN (
      'permit_request',
      'accepted_in_process',
      'on_hold_additional_info_needed',
      'permit_created',
      'not_needed'
    )
  );

COMMIT;
