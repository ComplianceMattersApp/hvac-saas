## Compliance Matters Sandbox Setup

1. Create a new Supabase project
2. Update `.env.local` with the new project URL, anon key, and service role key
3. Run:
   supabase link --project-ref YOUR_PROJECT_REF
4. Run:
   supabase db push
5. Run:
   npm run dev

### Local Login Smoke Credentials

Do not store raw local smoke credentials in this repository or any tracked document.

For local-only browser smoke on `/login?next=/today`, keep the test account in an untracked local source such as:

- a local password manager entry named `Compliance Matters Local Smoke`
- `.env.local` entries such as:
  - `LOCAL_SMOKE_LOGIN_EMAIL=...`
  - `LOCAL_SMOKE_LOGIN_PASSWORD=...`

Recommended usage:

1. Keep the actual email and password only in local, untracked storage.
2. Use that account only for local/sandbox login continuity smoke.
3. If the account becomes unreliable or shared too broadly, rotate it rather than documenting it here.

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