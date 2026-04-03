-- Compliance Matters: security definer search_path hardening
-- Purpose: remove mutable search_path risk on remaining SECURITY DEFINER functions.

BEGIN;

ALTER FUNCTION public.handle_contractor_invite_accept()
  SET search_path = public;

ALTER FUNCTION public.handle_new_auth_user()
  SET search_path = public;

COMMIT;
