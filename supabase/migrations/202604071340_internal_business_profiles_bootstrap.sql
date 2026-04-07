-- Compliance Matters: internal business profile bootstrap
-- Purpose: guarantee that any newly provisioned internal owner scope gets
-- exactly one internal_business_profiles row without introducing lazy
-- read-time creation or a broader onboarding redesign.

BEGIN;

CREATE OR REPLACE FUNCTION public.bootstrap_internal_business_profile_from_internal_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.account_owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.internal_business_profiles (
    account_owner_user_id,
    display_name
  )
  VALUES (
    NEW.account_owner_user_id,
    'Compliance Matters'
  )
  ON CONFLICT (account_owner_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_internal_business_profile_from_internal_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS internal_users_bootstrap_internal_business_profile
ON public.internal_users;

CREATE TRIGGER internal_users_bootstrap_internal_business_profile
AFTER INSERT ON public.internal_users
FOR EACH ROW
EXECUTE FUNCTION public.bootstrap_internal_business_profile_from_internal_user();

COMMIT;