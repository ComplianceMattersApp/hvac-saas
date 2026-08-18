BEGIN;

-- The sweep is called exclusively by the server-side cron with the service
-- role. The function's foundation migration intentionally revokes PUBLIC,
-- anon, and authenticated access; grant back only the trusted caller.
GRANT EXECUTE ON FUNCTION public.sweep_abandoned_attachment_uploads(interval, integer)
  TO service_role;

COMMIT;
