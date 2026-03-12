# Portal QA Smoke Checklist

Purpose: quick validation for portal search scope, queue/count consistency, and stale-status refresh behavior.

## Preconditions

- Have at least two contractor users for testing: Contractor A and Contractor B.
- Have known jobs for each contractor.
- Have one Contractor A job that can reproduce pending_info -> non-pending_info transition after permit update.

## Test 1: Search Scope And Coverage

1. Sign in as Contractor A and open /portal.
2. Verify only Contractor A jobs appear in list view.
3. Search by each of these values from known Contractor A jobs:
   - Job title
   - Customer full name
   - Customer phone
   - Street address
   - City
   - Permit number
4. Confirm results include expected Contractor A job(s) for each search.
5. Search using a value known to exist only in Contractor B jobs.
6. Confirm no Contractor B data appears in results.
7. With a search active, switch queue chips/tabs.
8. Confirm active search remains applied across queue navigation.

Pass criteria:

- Search works for expected fields.
- No cross-contractor results are returned.
- Queue navigation preserves active search context.

## Test 2: Counts And Displayed Rows Stay In Sync

1. Clear search and set sort to Newest.
2. Record each queue chip count.
3. Click each queue chip and compare displayed row count to chip count.
4. Apply a search term that narrows results.
5. Repeat queue chip checks with search active.
6. Change sort between Newest, Oldest, and Follow-up Date.
7. Confirm order changes as expected and count-to-rows alignment remains correct.

Pass criteria:

- Chip counts match rendered rows in active queue.
- Search + queue + sort produce consistent, predictable results.
- No row truncation mismatch is observed.

## Test 3: Pending Info Refresh After Permit Update

1. Identify a Contractor A job currently in pending_info due to missing permit number.
2. From internal/admin flow, add permit number and perform the status-release/recompute action.
3. Open /portal and /portal/jobs/[id] for that job.
4. Hard refresh once if needed.
5. Confirm portal badge/queue is updated and no longer shows stale pending_info when recompute moved it.

Pass criteria:

- Portal list and detail reflect latest status after update.
- Queue membership and status badge are aligned with current DB state.

## Security Regression Spot Check

1. Sign in as Contractor B.
2. Search for known Contractor A values.
3. Attempt direct access to Contractor A portal job URL.

Pass criteria:

- Contractor B cannot view Contractor A jobs via list, search, or direct route access.

## Notes For Failures

- Capture the exact query params (queue, q, sort) and user role.
- Capture affected job IDs and expected vs actual status.
- Include timestamp and environment (local/staging/prod).
