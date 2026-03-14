create table if not exists public.internal_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'office', 'tech')),
  is_active boolean not null default true,
  account_owner_user_id uuid not null references auth.users(id),
  created_by uuid null references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists internal_users_account_owner_user_id_idx
  on public.internal_users (account_owner_user_id);

create index if not exists internal_users_account_owner_active_idx
  on public.internal_users (account_owner_user_id, is_active);

create index if not exists internal_users_role_idx
  on public.internal_users (role);

alter table public.internal_users enable row level security;

drop policy if exists internal_users_select_self on public.internal_users;
create policy internal_users_select_self
  on public.internal_users
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists internal_users_select_admin on public.internal_users;
create policy internal_users_select_admin
  on public.internal_users
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.internal_users as actor
      where actor.user_id = auth.uid()
        and actor.is_active = true
        and actor.role = 'admin'
        and actor.account_owner_user_id = internal_users.account_owner_user_id
    )
  );

drop policy if exists internal_users_insert_admin on public.internal_users;
create policy internal_users_insert_admin
  on public.internal_users
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.internal_users as actor
      where actor.user_id = auth.uid()
        and actor.is_active = true
        and actor.role = 'admin'
        and actor.account_owner_user_id = internal_users.account_owner_user_id
    )
  );

drop policy if exists internal_users_update_admin on public.internal_users;
create policy internal_users_update_admin
  on public.internal_users
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.internal_users as actor
      where actor.user_id = auth.uid()
        and actor.is_active = true
        and actor.role = 'admin'
        and actor.account_owner_user_id = internal_users.account_owner_user_id
    )
  )
  with check (
    exists (
      select 1
      from public.internal_users as actor
      where actor.user_id = auth.uid()
        and actor.is_active = true
        and actor.role = 'admin'
        and actor.account_owner_user_id = internal_users.account_owner_user_id
    )
  );

drop trigger if exists set_internal_users_updated_at on public.internal_users;
create trigger set_internal_users_updated_at
before update on public.internal_users
for each row
execute function public.set_updated_at();