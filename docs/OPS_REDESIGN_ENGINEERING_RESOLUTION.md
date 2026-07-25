# Operations Redesign Engineering Resolution

Status: approved engineering interpretation, desktop frozen July 25, 2026.

`docs/OPS_DESKTOP_QUEUE_CONTRACT.md` is the final authority for the approved
desktop result. The original concept package is historical input wherever it
conflicts with that contract.

This resolution governs implementation whenever the visual specification
conflicts with the current `/ops` behavior or the integrity baseline. The
visual direction is authoritative for appearance. The existing application is
authoritative for data, actions, permissions, navigation, and workflow.

## Scope

- The implementation scope is `/ops` and its `/ops`-owned presentational
  components.
- My Work (`/ops/field`), job detail, contractor portal, and other application
  surfaces are excluded.
- The sand palette may be introduced as reusable theme tokens, but existing
  application-wide fills will not be mechanically replaced in this pass.
  Sand usage is scoped to the redesigned Operations Workspace.
- Shared navigation is not restructured. Existing navigation content,
  handlers, badges, menus, accessibility, and responsive behavior remain.

## Queue navigation

- Preserve the current server-navigation contract for queue switching.
- Queue destinations remain links using the existing `bucket`, contractor, and
  `#ops-workspace` URL behavior.
- Do not add client-side queue fetching, caching, or a new queue API.
- Zero-count queues remain reachable because their empty states are useful and
  this is current behavior. They may be visually muted, but must not be inert.
- The desktop queue selector may move into the right rail as shown in the
  design. Mobile retains a compact, reachable queue selector rather than
  reproducing a 288px desktop rail.

## Aging and urgency

The mockup's 13-day/6-day thresholds are not adopted. Preserve the existing
aging interpretation:

- `ageDays > 30`: critical/rose
- `ageDays > 14`: aging/amber
- `ageDays <= 14`: neutral/slate
- Missing age: neutral/slate

Queue Health continues to report the existing `> 30` aging measure.

The ledger may use a narrow visual age rail, but it must derive its tone from
the same shared helper as the age text. Neutral work must not be labeled green
or "new" merely to match mockup sample data. Follow-up due-date urgency remains
separate from queue-age styling.

## Queue tick colors

- Active queue: blue.
- Inactive queue ticks are neutral by default.
- Exceptions and Waiting / Pending Info may use fixed rose and amber
  presentation respectively because those colors describe the queue category,
  not a new computed severity rule.
- Do not add count thresholds or data-driven tick behavior in this pass.

## Sorting

Only the existing sort contract is supported:

1. Oldest first
2. Newest first
3. Scheduled soonest
4. Contractor A-Z
5. Customer A-Z

The sort control keeps its current client-side behavior within the rendered
queue. Column headings must not look clickable unless they invoke one of these
existing sort options. An age arrow may only appear when it accurately reflects
the active oldest/newest queue-age sort.

## Desktop row architecture

The ledger is a desktop visual grammar, not a replacement data model.

All job rows may share:

- Queue-age rail
- Job type/title
- Customer and location context
- Reason and reason detail
- Contractor/internal-work identity
- Age
- Last action
- Last customer attempt when applicable
- Existing primary destination

The implementation must retain the existing row-view union and its
queue-specific extensions:

- `need_to_schedule`
- `closeout`
- `follow_ups`
- `generic`
- `field_payment_review`

Permits and Contractor Intake remain specialized non-generic surfaces. They
must not be forced into a job ledger that cannot represent their fields or
actions.

## Protected queue-specific extensions

### Needs Scheduling

Preserve recent attempt, phone, Call/Text, contact-attempt logging, schedule
date and window, schedule save/clear behavior, permit context, and return path.
These may use an expandable row detail; they may not be removed or hidden
behind hover-only interaction.

### Closeout & Review

Preserve closeout needs, next step, schedule, assignment, customer contact
links, external-billing-complete action when allowed, and all capability gates.

### Field-payment review

Preserve amount, payment method, reporter/time, job and invoice links, Verify,
Reject, required notes, authorization, and pending states. This remains a
special pinned review row/panel.

### Follow Ups

Preserve owner, due date, urgency, status, reminder, note, and the existing job
or follow-up destination. Due-date urgency is not replaced by queue-age color.

### Permits

Preserve request status, job/customer/location context, jurisdiction,
contractor, notes, attachments, intake editing, permit-number entry, accept,
hold, resume, not-needed, create-job, and mark-created actions plus errors.

### Contractor Intake

Preserve proposed job/customer/location information, contractor identity,
submission age, notes, review status, and Review Intake destination.

## Actions and disclosure

- Open Job, Call, and Text may appear as desktop hover actions only when they
  are also keyboard-reachable and remain visible on touch/mobile.
- No operational form action may be hover-only.
- Expandable details must use accessible disclosure controls and preserve
  focus order.
- Existing links, `tel:`/SMS targets, form actions, hidden fields, pending
  behavior, redirects, and revalidation remain unchanged.

## Right rail

Desktop may use the visual ordering:

1. Queues
2. Queue Health
3. Quick Links

The rail reads existing values and destinations only. It does not introduce
new handoff counts, new settings routes, or new health calculations.

- Open time clock is shown only under its existing visibility rules.
- Export uses the existing export route and contractor-safe gating.
- An Operations settings link is included only if an existing authorized
  destination is confirmed; otherwise it is omitted.
- Team-clock empty and populated states retain their current meaning.

## Header and filters

- Today retains `/today` in shared navigation. The duplicate header-level
  Go to Today control is intentionally removed from `/ops`.
- Returned Work remains visible when its current count requires it, even though
  it is absent from the mockup.
- Notice and permit-error states remain visible.
- Contractor Focus retains multi-select, search, internal work, counts, clear,
  cancel, apply, URL persistence, and bucket-specific facets.
- Reason and sort retain their current option sources and client-side behavior.
- Export retains Internal CSV and capability-gated Contractor-Safe CSV.
- Queue-specific header actions remain available.

## Responsive resolution

There is no approved mobile mockup. Therefore mobile behavior is
preservation-first:

- Keep a single-column card/detail presentation rather than horizontally
  squeezing the six-column ledger.
- Keep queue selection above the work list or in an accessible disclosure.
- Keep operational actions visible with at least the existing touch clearance.
- Keep queue-specific details and forms available.
- Do not introduce horizontal page scrolling as a substitute for mobile design.

A future approved mobile target may retint or reorganize this presentation, but
it cannot remove capability.

## Final approved desktop deviations

- Permanent, centered primary actions replace the proposed hover overlay.
- Desktop Needs Scheduling omits Call/Text buttons while retaining the phone
  number; preserved mobile cards still expose Call/Text.
- Closeout duplicate Reason/Needs/Next values collapse at render time without
  mutating their source data.
- Mockup-only load bars, urgent/aging/new classifications, and footer metadata
  were not adopted because they lack a current queue-engine contract.
- Shared navigation was not recolored or restructured.
- Desktop visuals are frozen. The next phase is a separate mobile-only audit;
  it must not alter the approved desktop ledger at `xl` and wider.

## Implementation sequence

1. Add `/ops`-scoped sand tokens/surfaces and establish shared visual helpers.
2. Build the desktop generic ledger shell without changing row-view data.
3. Add and verify every queue-specific extension.
4. Build the desktop right rail using existing links, counts, and gates.
5. Apply the sticky `/ops` header band while retaining conditional notices and
   actions.
6. Complete the preservation-first mobile treatment.
7. Run contract, action, authorization, export, type, desktop, and mobile
   verification.

Each slice is a separate reviewable commit. No step may proceed by replacing
`app/ops/page.tsx` wholesale.

## Acceptance rule

For every state and action available before the redesign, the redesigned
Operations Workspace must expose the same information and capability under the
same account, product mode, permission, URL, and data conditions, execute the
same underlying operation, and produce the same result.
