## Compliance Matters Sandbox Setup

1. Create a new Supabase project
2. Update `.env.local` with the new project URL, anon key, and service role key
3. Run:
   supabase link --project-ref YOUR_PROJECT_REF
4. Run:
   supabase db push
5. Run:
   npm run dev

If sandbox gets dirty, abandon it and create a fresh one.
Do not patch sandboxes manually unless debugging a specific issue.

Create a new ADMIN to begin:

---admin user---
insert into public.internal_users (
  user_id,
  role,
  is_active,
  account_owner_user_id,
  created_by
)
values (
  'YOUR_USER_ID',
  'admin',
  true,
  'YOUR_USER_ID',
  'YOUR_USER_ID'
);

---Correct contractor setup (for your system)
Step 1 — Create contractor

Use this:

insert into public.contractors (
  id,
  name,
  owner_user_id
)
values (
  gen_random_uuid(),
  'Test Contractor',
  'YOUR_INTERNAL_ADMIN_USER_ID'
)
returning id;

Copy the returned id

Step 2 — Link contractor user
insert into public.contractor_users (
  contractor_id,
  user_id,
  role
)
values (
  'PASTE_CONTRACTOR_ID_HERE',
  'CONTRACTOR_AUTH_USER_ID',
  'owner'
);