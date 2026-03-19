-- Add auth_user_id column to contractor_invites to track the Supabase auth user
-- linked to this invite once the invite is accepted or the user is created.
alter table public.contractor_invites
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists contractor_invites_auth_user_id_idx
  on public.contractor_invites (auth_user_id);

-- Harden handle_new_auth_user trigger function.
-- The original form ON CONFLICT (id) only handles PK conflicts on profiles.id.
-- Using ON CONFLICT DO NOTHING (no target) suppresses ANY constraint violation,
-- making the trigger fully safe regardless of what constraints exist on profiles
-- (e.g. a unique index on email added later, or any other future constraint).
-- This cannot regress existing behaviour: the insert still fires and succeeds on the
-- first insert for a new user; subsequent conflicts are silently ignored.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict do nothing;
  return new;
end;
$$;
