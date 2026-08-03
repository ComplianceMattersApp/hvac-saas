# Operations Mobile Engineering Resolution

Status: active mobile-only implementation contract, July 25, 2026.

This document reconciles the Claude mobile concept package in
`docs/Mobile_Ops_Redesign/` with the production Ops queue engine and the frozen
desktop contract in `docs/OPS_DESKTOP_QUEUE_CONTRACT.md`.

The concept package controls visual direction only. Production controls queue
membership, counts, reasons, sorting, contractor facets, permissions, actions,
forms, URLs, and return behavior.

## Scope boundary

- Mobile work applies below Tailwind `xl` (`<1280px`).
- The approved desktop ledger and right rail at `xl` and wider are frozen.
- Shared application navigation is outside this pass.
- Mobile work may reorganize existing controls and fields but may not invent a
  new queue API, action, filter mode, or status rule.

The concept's proposed 1024px breakpoint is rejected. Production desktop was
approved and frozen at `xl`; changing it would reopen the desktop contract and
create an unreviewed 1024–1279px state.

## Queue switcher resolution

Approved direction:

- The active queue title becomes a 44px mobile control.
- It opens a bottom sheet with the same live queue labels, counts, active state,
  and server-generated destinations used by the desktop rail.
- Queue switching remains link navigation with the existing `bucket`, filters,
  and `#ops-workspace` URL behavior.
- Empty queues are grouped or visually muted when useful, but remain
  interactive and reachable because their empty states are part of the current
  contract.
- The compact chip wall may be removed after the sheet is verified.

Rejected concept behavior:

- No client-only `setActiveQueue` state or new queue fetch/cache.
- No disabled zero-count rows.
- Returned Work remains Workshare, not a fabricated Ops queue.

## Filters and Contractor Focus

- Reason options and the five supported sorts remain unchanged.
- Contractor Focus remains available only for `ecc_hers` and `hybrid`.
- Contractor Focus remains scoped to the active bucket and retains its current
  URL persistence, multi-select, Internal Work, counts, search, clear, cancel,
  and apply behavior.
- A future filter sheet may host the existing controls, but it must submit or
  navigate through the current handlers and parameters.

The concept's cross-queue contractor mode, contractor-name pivot, replacement
Queue cell, Log Attempt action, and special Clear-only exit are rejected as new
workflow behavior.

## Card resolution

The current mobile rich cards remain the functional source of truth.

Every applicable card must keep:

- Current job/follow-up destination
- Reason and distinct reason detail
- Queue age and current urgency semantics
- Contractor/assignment identity
- Last action and recent attempt
- Queue-specific schedule, closeout, follow-up, payment, permit, and intake
  information
- Existing Call/Text links where currently present
- Existing forms, permissions, pending states, hidden inputs, errors, and
  return paths

Approved visual principles for later card slices:

- Flat paper-like cards with a neutral structural spine
- At least 44px touch targets, except compact filter chips may be 40px
- Permanently visible touch actions
- No hover-only interaction
- No horizontal scrolling
- Strong customer/job hierarchy and readable field labels

The concept's removal of age coloring is not automatically adopted. Production
currently uses shared `>30` rose and `>14` amber aging rules, plus separate
follow-up urgency. Changing those semantics requires explicit approval rather
than a mobile-only visual decision.

## First implementation slice

1. Add the mobile active-queue title control and bottom sheet.
2. Source rows directly from the existing desktop queue-link projection.
3. Keep zero-count rows reachable.
4. Remove only the redundant mobile chip wall after parity is guarded.
5. Keep filter values, export destinations and permissions, Contractor Focus,
   cards, and desktop behavior unchanged. Mobile may reflow those existing
   controls without changing their wiring.

## Mobile filter and export layout

- Reason, Sort, and Export share one compact toolbar below `xl`.
- Export is a deliberate 44px pill rather than an undersized control stranded
  on its own row.
- Internal and contractor-safe export destinations, gating, descriptions, and
  active queue/filter parameters remain unchanged.
- Clear Filters remains available whenever a reason or contractor filter is
  active.

## Mobile card readability slice

- The existing rich-card projections remain the only source of card content
  and actions; no queue-specific field or handler is replaced.
- Mobile cards use white paper surfaces, clearer separation between identity
  and operational metadata, and stronger slate/navy contrast.
- Customer/job titles render at 16px; card field labels have an 11px floor.
- Open Job, Open Follow Up, Call, Text, and tappable phone controls have at
  least 44px hit areas.
- Linked customer/card titles also retain a 44px mobile hit area through
  tablet widths, reverting to their natural height at the frozen desktop
  breakpoint.
- Open Job / Open Follow Up uses its own full-width mobile row so age and the
  action cannot crush the customer/address identity column. The existing
  compact inline action layout resumes at `xl`.
- Existing queue age and follow-up urgency colors remain because they are
  current production semantics. This slice does not adopt the concept's
  proposed removal of those rules.
- Every standard mobile queue card visibly renders job type, customer, address,
  job title, and recent attempt from the existing row projection.
- Closeout applies the same duplicate suppression as the desktop ledger:
  Needs and Next Step render only when they add information beyond Reason.
- The `xl` desktop ledger remains a separate frozen render path.

## Mobile workspace shell slice

- The sticky queue switcher is the single mobile source for the active queue
  name and live count.
- The duplicate Board Filters / Operations Workbench heading and duplicate
  Active Queue heading are hidden below `xl`.
- Decorative nested workspace and active-panel borders, padding, rings, and
  shadows are removed below `xl` so the filter toolbar and first actionable
  card arrive sooner.
- Queue-specific header actions remain visible. In particular, Batch
  Contractor Invoice becomes a full-width 44px mobile action rather than being
  discarded with the duplicate heading.
- Empty states, Clear Filters, forms, and the desktop shell remain unchanged.

## Final standard queue row treatment

- Below `xl`, standard queue work is presented as individually bounded cards on
  the page background: each card has its own `slate-300` border, `rounded-2xl`
  shell, drop shadow, and a gap to its neighbors.
- Superseded: the earlier treatment stacked flat rows inside one white queue
  container, separated only by a neutral slate band. In production the band did
  not read as a boundary — the band was lighter than the card's own internal
  hairlines, so cards ran into each other and the primary action of one card
  appeared to belong to the next. Card separation must therefore be the
  strongest rule on the surface, ranked: gap > card border > internal hairline.
- Each card opens with an age-toned left spine (the desktop ledger's aging
  colors) and ends with a tinted action footer holding Open Job / Call / Text.
  The spine marks where a card starts and the footer marks where it ends.
- Still rejected from the original concept: floating age pills and nested phone
  cards.
- Job type and age remain the row's compact orientation line. Existing aging
  thresholds are preserved through text color rather than a badge.
- Customer, address, and the canonical formatted Reason remain visible before
  the operational fields. Queue membership and reason derivation stay in the
  approved queue engine; this layer only changes presentation.
- Contractor, Last Action, and Last Attempt remain visible. Needs Scheduling
  keeps Open Job, Call, and Text together in the bottom action row with the
  existing phone-link wiring.
- Closeout continues to suppress Needs or Next Step when either merely repeats
  Reason. Follow Ups and generic rows retain their queue-specific fields and
  destinations.
- The `xl` desktop ledger and the specialized field-payment review workflow
  remain separate render paths and are not restyled by this treatment.
- The Ops page background follows the existing Today/job neutral slate-gray
  shell. Any future palette change should be applied through a coordinated
  global design-system pass rather than as another Ops-only color treatment.

## Mobile Contractor Focus selector slice

- The existing bucket-scoped Contractor Focus control opens as a bottom sheet
  below `xl`; the frozen desktop dialog remains centered at `xl` and wider.
- Search, All Contractors, Internal Work, contractor ordering and counts,
  multi-select drafts, Clear, Cancel, and Apply retain their existing state and
  URL wiring.
- The trigger, search field, option rows, Close, Clear, Cancel, and Apply meet
  the 44px mobile touch-target floor.
- Backdrop and Escape dismiss the draft without applying it.
- The action footer includes safe-area padding and remains fixed beneath the
  scrollable option list.

## Specialized mobile queue slice

- Permit and Contractor Intake keep their separate production render path,
  server actions, hidden inputs, validation, pending states, errors, attachment
  links, export destination, and return behavior.
- Below `xl`, their legacy buttons, disclosure summaries, selects, and visible
  text/date inputs receive the same 44px touch floor as standard queue cards.
- Permit textareas receive an 88px mobile floor for usable note entry.
- Checkbox and radio glyphs are excluded from forced sizing; their containing
  labels remain the touch target where applicable.
- The rule is explicitly scoped to specialized Ops queues and ends at 1279px,
  leaving frozen desktop dimensions unchanged.

## Mobile utility workflow slice

- Queue Health remains read-only and available after the queue cards rather
  than being deleted while shared navigation is outside scope.
- Returned Work, incoming Workshare, time clock, queue export, and the
  clocked-in-team disclosure retain their existing destinations and
  permissions.
- Interactive utility rows meet the 44px mobile touch floor and use stronger
  mobile text while reverting to frozen compact desktop sizing at `xl`.
- The mobile Export shortcut targets `#ops-export-menu-mobile`; the desktop
  shortcut continues to target `#ops-export-menu`.

## My Work visual alignment

- `/ops/field` keeps the authoritative scheduled-and-assigned My Work
  eligibility rules for Overdue, Active, Today, and Upcoming. Completed is a
  fifth view containing only assigned jobs whose authoritative
  `field_complete_at` timestamp falls on the current Los Angeles business day;
  it is ordered newest completion first.
- Jobs render as individually bounded, gapped cards matching the standard queue
  row treatment above: `slate-300` border, `rounded-2xl` shell, drop shadow, a
  section-toned left spine, and a tinted action footer holding Open Job, Call,
  Text, and Navigate.
- Superseded: jobs previously rendered inside one continuous white work sheet
  with neutral separators. That treatment failed for the same reason the queue
  band did — the separator between jobs was lighter than the hairlines inside a
  job, so cards ran together and each job's actions appeared to belong to the
  next one. Status pills remain retired.
- The spine reuses `sectionVisualTone(...).dot`, so a card's spine color matches
  its section tab (Active blue, Today amber, Overdue rose, Upcoming indigo,
  Completed emerald).
- Scheduled date/window, contractor, address, current section/status, and the
  existing Open Job, Call, Text, and Navigate destinations remain visible.
- Completed jobs are excluded from every active-work group, and completed
  history from prior business days is excluded from the page.
- The My Work loading skeleton mirrors the discrete-card structure so loading
  does not imply a different presentation than the loaded page.

## Post-mobile desktop revision

The deferred desktop presentation pass now:

- uses the job-detail `104rem` maximum workspace width while retaining the
  queue/workshare structure;
- increases desktop ledger, control, metadata, and right-rail readability;
- replaces the Ops-only beige/sand treatment with the shared neutral
  slate-gray surfaces; and
- places desktop Export inline with Reason and Sort.

Queue definitions, permissions, actions, sorting semantics, and export wiring
remain unchanged.

## Verification gates

- Mobile widths: 360, 390, 430, 768, 1024, and 1279px
- Desktop freeze: 1280px and wider
- No horizontal page scrolling
- All sheet controls at least 44px
- Queue labels, counts, active state, and destinations match desktop
- Zero-count queues remain reachable
- Existing query/filter state survives queue switching
- Full Ops tests, frozen desktop contract tests, TypeScript, and production
  build pass before publishing
