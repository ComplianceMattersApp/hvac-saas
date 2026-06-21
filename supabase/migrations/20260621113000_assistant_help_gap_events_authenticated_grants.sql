-- Compliance Matters: allow authenticated internal users to reach help-gap RLS policies.
-- This grants only the table privileges needed for the existing account-scoped policies.

BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE public.assistant_help_gap_events TO authenticated;

REVOKE DELETE ON TABLE public.assistant_help_gap_events FROM authenticated;
REVOKE ALL ON TABLE public.assistant_help_gap_events FROM anon;

COMMIT;
