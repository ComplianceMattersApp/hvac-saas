-- Create contractor_invites table to formalize invite tracking for contractor onboarding.
-- This table backs the resend invite, pending invite visibility, and invite lifecycle.

create table if not exists public.contractor_invites (
  id uuid default gen_random_uuid() not null primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  sent_count integer not null default 1,
  last_sent_at timestamp with time zone,
  invited_by uuid references auth.users(id) on delete set null,
  role text default 'member' check (role in ('member', 'owner')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Unique index on (owner_user_id, contractor_id, lower(email)) to support upsert logic.
-- This allows one invite per (owner, contractor, email) tuple. Resends update the existing row.
create unique index if not exists contractor_invites_owner_contractor_email_idx
  on public.contractor_invites (owner_user_id, contractor_id, lower(email));

-- Indexes for common query patterns
create index if not exists contractor_invites_owner_user_id_idx
  on public.contractor_invites (owner_user_id);

create index if not exists contractor_invites_contractor_id_idx
  on public.contractor_invites (contractor_id);

create index if not exists contractor_invites_status_idx
  on public.contractor_invites (status);

create index if not exists contractor_invites_owner_status_idx
  on public.contractor_invites (owner_user_id, status);

-- Trigger to auto-update updated_at timestamp
create or replace trigger set_contractor_invites_updated_at
before update on public.contractor_invites
for each row
execute function public.set_updated_at();

-- Row Level Security (RLS)
-- Pattern matches contractors and internal_users: admins scoped to same owner_user_id can read/write
alter table public.contractor_invites enable row level security;

drop policy if exists contractor_invites_select_admin on public.contractor_invites;
create policy contractor_invites_select_admin
  on public.contractor_invites
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.internal_users
      where internal_users.user_id = auth.uid()
        and internal_users.is_active = true
        and internal_users.role = 'admin'
        and internal_users.account_owner_user_id = contractor_invites.owner_user_id
    )
  );

drop policy if exists contractor_invites_insert_admin on public.contractor_invites;
create policy contractor_invites_insert_admin
  on public.contractor_invites
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.internal_users
      where internal_users.user_id = auth.uid()
        and internal_users.is_active = true
        and internal_users.role = 'admin'
        and internal_users.account_owner_user_id = contractor_invites.owner_user_id
    )
  );

drop policy if exists contractor_invites_update_admin on public.contractor_invites;
create policy contractor_invites_update_admin
  on public.contractor_invites
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.internal_users
      where internal_users.user_id = auth.uid()
        and internal_users.is_active = true
        and internal_users.role = 'admin'
        and internal_users.account_owner_user_id = contractor_invites.owner_user_id
    )
  )
  with check (
    exists (
      select 1
      from public.internal_users
      where internal_users.user_id = auth.uid()
        and internal_users.is_active = true
        and internal_users.role = 'admin'
        and internal_users.account_owner_user_id = contractor_invites.owner_user_id
    )
  );
