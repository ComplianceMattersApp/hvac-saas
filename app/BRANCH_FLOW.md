Exact workflow
Normal feature/fix flow
Step 1

Start from your integration branch:

git checkout sandbox-clean-start
git pull
Step 2

For small work, stay on sandbox-clean-start.

For larger work, make a short-lived branch:

git checkout -b feature/whatever-you-are-building
Step 3

Do the work locally.

Step 4

Commit and push:

git add .
git commit -m "describe change"
git push

If it is a new branch:

git push --set-upstream origin feature/whatever-you-are-building
Step 5

Test in:

local app
sandbox Supabase
Vercel preview if needed
Step 6

Merge back into sandbox-clean-start

If you used a feature branch:

git checkout sandbox-clean-start
git pull
git merge feature/whatever-you-are-building
git push

Now sandbox-clean-start becomes the single source of current tested work.

Production release flow

Only promote code that already passed in sandbox-clean-start.

Step 1

Make sure sandbox-clean-start is stable.

Step 2

Move it into main:

git checkout main
git pull
git merge sandbox-clean-start
git push origin main

That is your production code release.

Database flow

This is the part that needs to be explicit.

Sandbox DB

All new migrations get tested here first.

Flow:

create/edit migration locally
run against sandbox Supabase
verify app behavior
commit migration
Production DB

Only apply migrations after the code is proven.

So the release order is:

migration tested in sandbox
code merged to main
apply same migration to production Supabase intentionally
verify production app
Rule

Never create production-only DB changes by hand unless it is an emergency repair.

If you have to do an emergency manual fix, capture it back into migrations immediately.

Environment mapping
Local
branch: whatever you are actively editing
DB: sandbox Supabase
purpose: fast iteration
Preview
branch: sandbox-clean-start or short-lived feature branch
DB: usually sandbox Supabase
purpose: deployment/build/UI verification
Production
branch: main
DB: production Supabase
purpose: live app
Non-negotiable rules
Rule 1

Do not work directly on main.

Rule 2

Do not point production code at sandbox DB.

Rule 3

Do not test risky schema changes first in production.

Rule 4

If a sandbox gets weird, abandon it and recreate it from the baseline.

Rule 5

sandbox-clean-start is the current integration lane. Keep it usable.

Simple decision tree
Small bug fix

Work directly on sandbox-clean-start

Large or risky change

Create short-lived feature branch off sandbox-clean-start

Ready for production

Merge sandbox-clean-start into main

The exact commands you’ll use most
Start work
git checkout sandbox-clean-start
git pull
Save work
git add .
git commit -m "message"
git push
Create focused branch
git checkout -b feature/something
git push --set-upstream origin feature/something
Merge focused branch back
git checkout sandbox-clean-start
git pull
git merge feature/something
git push
Release to production
git checkout main
git pull
git merge sandbox-clean-start
git push origin main
My recommendation for you specifically

Use only these two all the time unless the change is big:

sandbox-clean-start
main

That keeps things simple.

Use a third short-lived branch only when:

the change is risky
the thread is large
you might need to abandon it
Best naming policy
Long-lived
main
sandbox-clean-start
Short-lived
fix/...
feature/...
refactor/...