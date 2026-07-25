# Operations Redesign Integrity Baseline

Status: preserved behavioral baseline; desktop redesign approved July 25, 2026.

For future implementation work, read
`docs/OPS_DESKTOP_QUEUE_CONTRACT.md` first. It records the final approved
desktop presentation and the current queue-engine authority. This file remains
the protected behavioral inventory.

## Remodel rule

The `/ops` remodel may change visual composition, typography, spacing, color,
icons, responsive layout, and presentational component boundaries. It must not
change which work appears, what users can do, who may do it, how actions are
executed, or where users land afterward.

Behavioral parity is the acceptance requirement. A visually similar screenshot
is not sufficient.

## Protected route and access behavior

- Unauthenticated users are redirected to `/login`.
- Users without active app access are redirected through the existing
  dual-context landing resolution.
- Contractor actors are redirected to `/portal`.
- `/ops` requires an internal user context.
- Product mode, permit schema availability, billing mode, financial access, and
  explicit field-billing capabilities continue to control visibility.

## Protected URL state

The following `/ops` query parameters and the `#ops-workspace` anchor are part
of the current navigation contract:

- `bucket`
- `contractor` (including multiple contractor IDs and internal work)
- `q`
- `sort`
- `reason`
- `signal`
- `notice`
- `create`
- `permit_error`

Legacy bucket aliases (`need_to_schedule`, `scheduled`, and `intake`) must
continue to normalize to their current destinations.

## Queue inventory

The operations workspace currently exposes:

1. Needs Scheduling
2. Field Work
3. Needs Assignment
4. Waiting / Pending Info
5. Exceptions
6. Closeout & Review
7. Follow Ups
8. Contractor Intake, when available for the product mode
9. Permits, when the workflow and schema are available
10. Updates

Queue counts, active state, visible rows, empty states, reason options, sorting,
and contractor facets must stay aligned. The full closeout set is intentionally
uncapped and is reused for counts, facets, and rendered cards.

## Protected global controls and destinations

- Today remains available in shared navigation; the duplicate `/ops` header
  link is intentionally removed on desktop
- Returned Work, when present
- Queue selector with counts
- Contractor Focus multi-select, search, internal-work option, clear, cancel,
  and apply
- Reason filter
- Sort control
- Clear filters
- Internal CSV export
- Contractor-safe CSV export only when contractor focus is active
- Queue-specific header actions
- Job links continue to open the operations tab where currently specified

## Protected row information

The redesign must preserve information conditionally presented by each row
kind, including:

- Job title and customer/location context
- Queue reason and reason detail
- Queue age and urgency
- State chips and last-action text
- Contractor or internal-work identity
- Assignment state
- Schedule date and time window
- Customer phone and contact affordances where approved for the active
  breakpoint; desktop Needs Scheduling retains the number but intentionally
  omits Call/Text buttons, while the preserved mobile card still exposes them
- Recent contact-attempt state
- Closeout needs and next step
- Follow-up owner, due date, and urgency
- Field-payment review and reconciliation state
- Permit request context, notes, status, attachments, and errors
- Contractor-intake submission context

## Protected actions

Actions must keep their existing server action, submitted fields, authorization,
pending/disabled behavior, return path, refresh/revalidation, and error display.
The current surface includes at least:

- Open job
- Call customer
- Text customer
- Update schedule
- Log customer contact attempt
- Mark external invoice complete when allowed
- Verify or reject a field-payment collection report when allowed
- Create a manual permit request
- Accept, hold, resume, or mark a permit request not needed
- Update permit intake
- Mark a permit created
- Create a job from a permit request and mark it created

This list is reconciled by `docs/OPS_DESKTOP_QUEUE_CONTRACT.md`. Absence from a
mockup does not authorize removal, and an approved breakpoint-specific visual
decision does not delete the underlying workflow.

## Responsive and state coverage

The parity review must cover desktop and mobile for:

- Loading
- Empty queue
- Populated queue
- Filtered-to-empty queue
- Active contractor focus
- Permission-hidden actions
- Product-mode-hidden queues
- Permit workflow unavailable
- Action pending/disabled
- Action success and redirect
- Action error
- Long names, addresses, reasons, and notes

## Code boundaries

Changes in these areas require separate behavioral review and are not presumed
visual:

- `lib/actions/**`
- `lib/auth/**`
- `lib/business/**`
- `lib/ops/**`
- `lib/permits/**`
- `lib/workflows/**`
- Supabase queries, migrations, and policies
- Redirects, query-parameter normalization, form fields, and export routes

Presentation files can also contain behavior. In particular,
`app/ops/page.tsx`, `OpsBoardActiveQueuePanel`, `ContractorFocusSelector`, and
`OpsQueueRowCard` must not be wholesale-replaced without contract-level review.

## Final desktop design mapping

For every element in the new design, record:

| Design element | Existing source | Data preserved | Action preserved | Permission rule | URL/return behavior | Mobile state |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop ledger rows | Current row-view union and active queue rows | Yes | Current primary destination; Needs Scheduling Call/Text intentionally mobile-only | Existing route and capability gates | Existing job/follow-up hrefs | Preserved rich cards pending separate audit |
| Desktop queue rail | Existing queue chips and hidden Today tabs | Counts and active state | Existing server links | Existing product/schema gates | Existing bucket/query/anchor contract | Compact selector preserved pending separate audit |
| Header band | Current tenant identity, notices, Returned Work | Yes | Duplicate Go to Today removed; shared navigation remains | Existing Returned Work count gate | Existing Returned Work route | Pending separate audit |
| Specialized rows | Field payment, Permits, Contractor Intake | Yes | All current specialized forms and links | Existing capability/product/schema gates | Existing return paths | Preserved pending separate audit |

Any existing item without a destination in the design is a design gap, not an
implementation deletion.

## Verification gates

1. Capture the current ops-specific test baseline.
2. Complete the design-to-contract mapping before editing the page.
3. Implement one surface at a time.
4. Keep behavioral modules and server actions unchanged unless separately
   approved.
5. Run ops, action, authorization, export, and type-check coverage after each
   slice.
6. Compare authenticated desktop and mobile scenarios before rollout.
7. Retain a rollback path until parity is accepted.
