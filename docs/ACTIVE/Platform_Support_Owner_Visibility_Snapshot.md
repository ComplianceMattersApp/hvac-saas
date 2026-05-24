# Platform Support / Owner Visibility Snapshot

Status: ACTIVE SUPPORT / OWNER VISIBILITY RECORD

Purpose: Record the current owner-led, read-only support visibility surface added after Tenant Customer Payments V1 closeout.

## Current lane posture

This lane improves safe owner visibility for early real customers without activating Support Console V1 and without allowing impersonation or support-side tenant mutation.

The implemented surface is the Owner Console account snapshot flow:

- `/ops/owner-console`
- `/ops/owner-console/[accountOwnerUserId]`

The surface is platform-owner allowlist gated and read-only.

## Implemented owner-console improvements

### Owner Console account list

Completed:

- Account search by company, owner name/email, email domain, account owner id, product label, status label, billing mode, and setup invite state.
- Account dropdown scoped to the selected owner-console view.
- Product filter.
- Status filter.
- Clear filters action.
- Result count display.
- `View Snapshot` link per account row.

### Account Support Snapshot

Completed read-only snapshot sections and actions:

- Support Call Summary.
- Copy Summary client-side action.
- Quick jump buttons for Next Checks, Payments, Team, and Profile.
- Account identity header.
- Support Health.
- Support Next Checks.
- Account State.
- Customer Payments / Stripe Connect readiness snapshot.
- Usage Recency aggregate counts for the last 30 days.
- Operational Activity aggregate counts.
- Team & Seats snapshot, including last sign-in signal.
- Company Profile / Contact snapshot, including logo display.
- Readiness Checklist.
- Entitlement & Billing Snapshot.
- Explicit support boundary notice.

Current intended page order:

1. Support Call Summary.
2. Account Support Snapshot header / identity.
3. Support Health.
4. Support Next Checks.
5. Account State.
6. Customer Payments.
7. Usage Recency.
8. Operational Activity.
9. Team & Seats.
10. Company Profile.
11. Readiness Checklist / Entitlement details.
12. Support Boundary.

## Current visibility provided

The owner can now see these read-only signals for a selected account:

- Company and owner identity.
- Product mode.
- Account status.
- Billing mode.
- Trial end date.
- Active/total internal user count.
- Setup invite state.
- Operational readiness items.
- Entitlement and subscription linkage signals.
- Stripe Connect readiness signals without raw Stripe account id exposure.
- Aggregate customer/job/invoice counts.
- Latest aggregate activity timestamps.
- Last-30-day aggregate usage counts.
- Internal team members, roles, status, created date, and last sign-in signal.
- Company profile display name, support email, support phone, invoice mode, logo, created date, and updated date.
- Copy-friendly support-call summary text.

## Current convenience actions

These actions are intentionally client-side/read-only:

- Copy Summary: copies support-call context to the clipboard for owner notes.
- Next Checks: jumps to the read-only Support Next Checks section.
- Payments: jumps to the read-only Customer Payments section.
- Team: jumps to the read-only Team & Seats section.
- Profile: jumps to the read-only Company Profile section.

These actions do not mutate tenant data, start a support session, impersonate a user, refresh Stripe, create a payment link, or write support notes.

## Explicit boundaries preserved

This lane does not add:

- Impersonation.
- Login-as-customer behavior.
- Tenant data mutation.
- Team invite/edit/deactivate actions from owner snapshot.
- Company profile edits from owner snapshot.
- Customer/job/invoice record browsing from owner snapshot.
- Stripe refreshes.
- Payment link creation.
- Raw Stripe account id display.
- QBO actions.
- SMS actions.
- Customer portal changes.
- Support Console activation.
- Production Supabase commands.
- Schema changes.
- Env changes.
- Persisted support notes or issue tracker rows.

## Source-of-truth boundaries

These source-of-truth boundaries remain unchanged:

- Jobs remain operational truth.
- Service cases remain continuity truth.
- Job events remain activity/audit truth.
- Invoices remain billed truth.
- Payments remain collected truth.
- Stripe webhook-confirmed payments remain payment truth through `internal_invoice_payments`.
- Owner support visibility is observability only and does not become operational truth.

## Implementation commits recorded

Owner Console / Support Snapshot commits:

- `19507c0` — `feat(owner): add read-only account support snapshot`
- `fd60500` — `fix(owner): tighten account snapshot typing`
- `610c8ea` — `feat(owner): link owner console rows to account snapshot`
- `8259783` — `feat(owner): add owner console account filters`
- `87de3ab` — `feat(owner): add owner console account dropdown`
- `d3352ba` — `feat(owner): add account health summary`
- `d99be73` — `feat(owner): add support next checks`
- `2127981` — `feat(owner): add operational activity snapshot`
- `29de4c4` — `feat(owner): add team seats snapshot`
- `40e3228` — `feat(owner): show team last sign-in signals`
- `0b9760c` — `feat(owner): add company profile snapshot`
- `6d0e63f` — `feat(owner): render company profile snapshot`
- `0a4e535` — `feat(owner): add usage recency snapshot`
- `7238686` — `feat(owner): render usage recency snapshot`
- `123716e` — `feat(owner): add payments readiness snapshot`
- `cf74323` — `feat(owner): render payments readiness snapshot`
- `92bf593` — `docs(owner): record support visibility snapshot scope`
- `f73695e` — `feat(owner): add support call summary snapshot`
- `9acd4eb` — `feat(owner): render support call summary snapshot`
- `6382b9c` — `feat(owner): add support summary actions`
- `c765dd3` — `feat(owner): make support summary actionable`
- `eb4bbcc` — `fix(owner): wire support snapshot anchor targets`
- `4f5c069` — `fix(owner): add company profile anchor target`
- `1959bd4` — `fix(owner): add support next checks anchor target`
- `63d9e4b` — `fix(owner): add team seats anchor target`
- `b1d9cc6` — `polish(owner): reorder support snapshot sections`

Docs checkpoint:

- `docs(owner): update support visibility closeout notes`

## Recommended next slices

Recommended next work should stay read-only unless explicitly approved otherwise.

Potential next slices:

1. Browser polish after real support use.
2. Read-only account drilldown audit for customer/job/invoice detail-lite visibility.
3. Error/log visibility audit before any implementation.
4. Support issue tracker planning, but not schema/UI until explicitly approved.
5. Support Console V1 re-evaluation only after owner-console visibility proves insufficient.

## Explicit non-actions still in force

No code should add support-side tenant mutation, impersonation, production repair tools, raw provider identifiers, customer portal access, QBO actions, SMS sends, payment execution, Stripe refresh actions, persisted support notes, or broad tenant record browsing unless separately designed, reviewed, approved, and documented.
