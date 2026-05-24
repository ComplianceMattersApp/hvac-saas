# Support Case / Call Log V1 Model Spec

Status: PROPOSED / SOURCE-OF-TRUTH SPEC

Purpose: Pivot owner support from accumulating read-only data cards toward a practical support workspace: account visibility plus issue/call logging, without impersonation or tenant mutation.

## Product intent

Support Case / Call Log V1 gives the owner a lightweight way to track real customer support interactions:

- who called or contacted support
- which tenant account the issue belongs to
- what the issue is
- current support status
- internal notes and follow-up context
- optional links to read-only support snapshots

This is not a help desk replacement yet. It is a practical owner-led SaaS support layer for early real customers.

## What this replaces conceptually

The owner support lane should not become a pile of broad data views. Read-only drilldowns are useful only when attached to a support reason or support case.

The intended operating model is:

1. Open or find a support case.
2. Review the account support snapshot.
3. Use limited read-only drilldowns only as needed.
4. Add internal support notes.
5. Close or follow up on the case.

## V1 scope

### Support case fields

Recommended V1 case fields:

- `id`
- `account_owner_user_id`
- `created_by_user_id`
- `assigned_to_user_id` nullable
- `status`
  - `open`
  - `waiting`
  - `resolved`
- `priority`
  - `normal`
  - `high`
  - `urgent`
- `source`
  - `phone`
  - `text`
  - `email`
  - `in_app`
  - `internal`
- `title`
- `issue_summary`
- `resolution_summary` nullable
- `related_customer_id` nullable
- `related_job_id` nullable
- `related_invoice_id` nullable
- `last_activity_at`
- `resolved_at` nullable
- `created_at`
- `updated_at`

### Support note fields

Recommended V1 note fields:

- `id`
- `support_case_id`
- `author_user_id`
- `body`
- `note_type`
  - `internal_note`
  - `customer_update_summary`
  - `resolution_note`
- `created_at`

All notes are owner/support internal only in V1. No customer-facing support portal exposure.

## V1 UI surfaces

### Owner Console account snapshot

Add a support cases section:

- recent cases for the selected account
- open/waiting/resolved counts
- create case button
- link to all cases for that account

### Support Cases index

Route proposal:

- `/ops/owner-console/support-cases`

Capabilities:

- list cases across accounts for the owner/support operator
- filter by status
- filter/search by company, title, related customer, or issue text
- open a case

### Account-scoped support cases

Route proposal:

- `/ops/owner-console/[accountOwnerUserId]/support-cases`

Capabilities:

- list cases for one tenant account
- create new case for that account
- link back to account snapshot

### Support case detail

Route proposal:

- `/ops/owner-console/support-cases/[supportCaseId]`

Capabilities:

- view case details
- update case status
- add internal notes
- set priority
- set related customer/job/invoice ids only through controlled selectors or validated ids
- link to account snapshot
- link to read-only customer/job/invoice snapshots when related records exist

## Mutation boundary

Support Case / Call Log V1 may mutate only the support-case tables.

It must not mutate tenant operational records:

- no customer edits
- no job edits
- no invoice edits
- no payment actions
- no team/user access changes
- no company profile edits
- no SMS sends
- no QBO actions
- no Stripe refreshes or payment link creation

## Access model

V1 should be platform-owner/support-operator only.

Minimum requirements:

- platform-owner allowlist gate reused from owner console
- no tenant users can access support cases
- support cases are operationally platform-internal records, not tenant records
- support notes are platform-internal only

Future versions can add support roles if needed, but V1 can remain owner-only.

## Audit posture

Every support case and note already creates its own operational history because rows are timestamped and authored.

Recommended V1 audit additions:

- record `created_by_user_id` on cases
- record `author_user_id` on notes
- update `last_activity_at` whenever notes/status changes
- preserve status/resolution timestamps

Optional later audit enhancement:

- support access/view logs for sensitive drilldowns
- explicit support session reason before deeper account/customer/job/invoice snapshots

## Relationship to read-only account visibility

Read-only drilldowns should support the case, not replace it.

Suggested workflow:

- Customer calls about a job or invoice.
- Owner opens/creates a support case.
- Owner opens the account snapshot.
- Owner uses customer/job/invoice snapshot only as needed.
- Owner logs the conversation in the support case.
- Owner marks the case waiting or resolved.

## Recommended implementation sequence

### Slice 1 — Schema and read/write helpers

- Add support case and support note tables.
- Add allowed status/priority/source constraints.
- Add helper functions for create/read/update case and add note.
- Add tests for owner-only access boundaries.

### Slice 2 — Account snapshot cases panel

- Add recent support cases panel to account snapshot.
- Show open/waiting/resolved counts.
- Add create-case link for selected account.

### Slice 3 — Case create and detail

- Add account-scoped create case form.
- Add case detail page.
- Add internal notes.
- Add status changes limited to support case state.

### Slice 4 — Cases index

- Add all-support-cases index.
- Add status/search filters.
- Keep owner-only.

### Slice 5 — Related read-only links

- Allow support case detail to link to existing read-only snapshots.
- Do not link to tenant editable pages.

## First recommended build slice

First implementation should be:

`Support Case / Call Log V1 — Schema + Helpers + Account Case Panel`

However, because this introduces schema, it should be explicitly approved before implementation.

Minimum first build:

- `support_cases` table
- `support_case_notes` table
- owner-only read helpers
- create support case action
- add internal note action
- account snapshot recent cases panel

## Explicit non-actions

Do not add:

- impersonation
- customer-facing support portal
- tenant-visible notes
- job/customer/invoice mutations
- payment actions
- provider actions
- QBO/SMS actions
- broad raw data browsing
- production Supabase commands without explicit approval

## Decision needed before implementation

This spec intentionally stops before schema implementation.

Before building, approve:

1. Table names:
   - `support_cases`
   - `support_case_notes`
2. V1 statuses:
   - `open`
   - `waiting`
   - `resolved`
3. V1 is owner/support internal only.
4. V1 support notes are not visible to tenant users or their customers.
5. V1 can mutate support-case tables only, not tenant operational tables.
