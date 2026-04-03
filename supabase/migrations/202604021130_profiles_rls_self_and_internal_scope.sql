-- Compliance Matters: profiles RLS hardening
-- Purpose: protect profile rows from cross-user enumeration while preserving
-- self profile access and internal display flows.

BEGIN;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_internal_select_account_scope ON public.profiles;

CREATE POLICY profiles_select_self
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY profiles_insert_self
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_self
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_internal_select_account_scope
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND (
        profiles.id = actor.user_id
        OR EXISTS (
          SELECT 1
          FROM public.internal_users teammate
          WHERE teammate.user_id = profiles.id
            AND teammate.account_owner_user_id = actor.account_owner_user_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.contractor_users cu
          JOIN public.contractors c
            ON c.id = cu.contractor_id
          WHERE cu.user_id = profiles.id
            AND c.owner_user_id = actor.account_owner_user_id
        )
      )
  )
);

COMMIT;
