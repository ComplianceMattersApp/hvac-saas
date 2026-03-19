-- Root cause: `on_auth_user_created_contractors` trigger on auth.users calls
-- `public.handle_contractor_invite_accept()`, which references
-- `public.contractor_invites.role` — a column that does not exist.
-- This causes every brand-new contractor auth.users INSERT to fail with
-- "Database error saving new user".
--
-- Fix:
--   1. Drop the broken trigger from auth.users.
--   2. Replace the function with a safe no-op so any accidental re-attachment
--      of the trigger cannot cause a failure.
--
-- Canonical contractor membership is now handled app-side by
-- ensureContractorMembershipFromInvite() called from /set-password after
-- a successful updateUser({ password }) call.

-- Step 1: remove the trigger
drop trigger if exists on_auth_user_created_contractors on auth.users;

-- Step 2: neutralize the function (no-op, safe if ever called)
create or replace function public.handle_contractor_invite_accept()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Intentionally empty.
  -- Contractor membership is written by the app-level acceptance bridge
  -- (ensureContractorMembershipFromInvite) in /set-password, not by a
  -- DB trigger. The trigger that previously called this function has been
  -- dropped above. This no-op body remains so the function object is
  -- present and harmless if queried.
  return new;
end;
$$;
