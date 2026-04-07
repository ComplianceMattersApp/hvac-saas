-- Compliance Matters: internal business profile foundation
-- Purpose: add a lightweight account-owner-scoped canonical internal business
-- identity record without expanding into a broader settings or tenant model.

BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_business_profiles (
  account_owner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  support_email text NULL,
  support_phone text NULL,
  logo_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_business_profiles_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

ALTER TABLE public.internal_business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_business_profiles_select_account_scope ON public.internal_business_profiles;
DROP POLICY IF EXISTS internal_business_profiles_insert_owner ON public.internal_business_profiles;
DROP POLICY IF EXISTS internal_business_profiles_update_owner ON public.internal_business_profiles;
DROP POLICY IF EXISTS internal_business_profiles_delete_owner ON public.internal_business_profiles;

CREATE POLICY internal_business_profiles_select_account_scope
ON public.internal_business_profiles
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY internal_business_profiles_insert_owner
ON public.internal_business_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND account_owner_user_id = auth.uid()
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY internal_business_profiles_update_owner
ON public.internal_business_profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND account_owner_user_id = auth.uid()
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND account_owner_user_id = auth.uid()
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY internal_business_profiles_delete_owner
ON public.internal_business_profiles
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND account_owner_user_id = auth.uid()
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

COMMIT;