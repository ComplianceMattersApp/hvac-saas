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

Completed read-only snapshot sections:

- Account identity header.
- Support Health.
- Support Next Checks.
- Operational Activity aggregate counts.
- Usage Recency aggregate counts for the last 30 days.
- Account State.
- Readiness Checklist.
- Entitlement & Billing Snapshot.
- Customer Payments / Stripe Connect readiness snapshot.
- Team & Seats snapshot, including last sign-in signal.
- Company Profile / Contact snapshot, including logo display.
- Explicit support boundary notice.

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

Docs checkpoint:

- `docs(owner): record support visibility snapshot scope`

## Recommended next slices

Recommended next work should stay read-only unless explicitly approved otherwise.

Potential next slices:

1. Owner Console snapshot layout polish after live use.
2. Small account-support print/copy summary for owner notes, without persistence.
3. Error/log visibility audit before any implementation.
4. Support issue tracker planning, but not schema/UI until explicitly approved.
5. Support Console V1 re-evaluation only after owner-console visibility proves insufficient.

## Explicit non-actions still in force

No code should add support-side tenant mutation, impersonation, production repair tools, raw provider identifiers, customer portal access, QBO actions, SMS sends, payment execution, Stripe refresh actions, or broad tenant record browsing unless separately designed, reviewed, approved, and documented.
