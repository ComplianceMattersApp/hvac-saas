# Operations Desktop Queue Contract

Status: approved desktop baseline as of July 25, 2026.

This is the authoritative handoff for future `/ops` desktop work. The current
queue engine is authoritative for membership, counts, reasons, sorting,
permissions, actions, and navigation. The approved desktop implementation is
authoritative for presentation. Older mockups, deleted action trays, historic
card layouts, and prior handoff language must not be used as fallback logic.

Mobile is not frozen by this document. Mobile currently preserves the existing
rich cards and will receive a separate mobile-only audit and approval.

## Authority order

When sources disagree, use this order:

1. Current queue builders, queries, and tests on `main`
2. `docs/OPS_DESKTOP_QUEUE_CONTRACT.md`
3. `docs/OPS_REDESIGN_ENGINEERING_RESOLUTION.md`
4. `docs/OPS_REDESIGN_INTEGRITY_BASELINE.md`
5. Original concept files in `docs/Ops Redesign/`

Concept images describe visual direction only. They never define queue
membership or restore an action that the current Ops cards no longer expose.

## Queue engine

All job queues exclude deleted and cancelled work unless a specialized queue
builder applies a stricter rule.

| Queue | Current membership source |
| --- | --- |
| Needs Scheduling | Open jobs with `ops_status = need_to_schedule` |
| Field Work | Not closed, not field-complete, scheduled during the current Los Angeles business day |
| Needs Assignment | The scheduled-without-technician snapshot |
| Waiting / Pending Info | Current `pending_info`, `on_hold`, `waiting`, and `pending_office_review` work; pending-info rows pass through the waiting-queue builder |
| Exceptions | Current `failed`, `retest_needed`, `pending_office_review`, and `problem` work |
| Follow Ups | A follow-up date, next-action note, or action-required-by value exists |
| Closeout & Review | The uncapped field-complete set passed through billing-truth projection and `listCloseoutQueueJobs` |
| Contractor Intake | Pending contractor intake rows when the product surface enables contractor/rater handoff |
| Permits | Active permit requests when both the workflow and schema are available |
| Updates | Existing unread contractor-update and new-work-request awareness |

Exceptions are available to `hvac_service`, `ecc_hers`, and `hybrid` accounts.
They stay visible and reachable at a zero count. Historical ECC retest parents
in `failed`, `retest_needed`, or `pending_office_review` are excluded after a
real continuation job exists. `pending_office_review` intentionally contributes
to both Waiting and Exceptions.

Do not replace these rules with card labels, mockup examples, old status lists,
or inferred workflow semantics.

## Queue state and controls

- Queue switching remains server navigation using `bucket` and
  `#ops-workspace`.
- Zero-count queues are muted, never disabled.
- Legacy bucket aliases continue to normalize.
- Reason options are derived from the rows in the active queue.
- Supported sorts are exactly: Oldest first, Newest first, Scheduled soonest,
  Contractor A-Z, and Customer A-Z.
- Oldest/Newest use time in the active queue where that evidence exists.
- Contractor Focus retains search, multi-select, Internal Work, counts,
  clear/cancel/apply, URL persistence, and bucket-specific facets.
- Contractor Focus is product-mode gated to `ecc_hers` and `hybrid`. A local
  `hvac_service` sandbox correctly hides it even when contractor records exist.
- Export, contractor-safe export, queue-specific actions, permissions, hidden
  fields, redirects, and return paths remain unchanged.

## Approved desktop presentation

- The sand canvas is scoped to `/ops`; shared application navigation is not
  redesigned.
- The Operations header band is sticky beneath shared navigation.
- The duplicate header-level Go to Today link is removed because Today already
  exists in shared sticky navigation.
- Returned Work remains visible when its existing count requires it.
- At `xl` and wider, generic job work renders as a flat ruled ledger with:
  Customer / Job, Contractor, Age, Last Action, Last Attempt, and Actions.
- The primary Open Job or Open Follow Up action is permanently visible and
  centered. There is no hover overlay.
- Desktop Needs Scheduling does not show Call or Text buttons. Its phone number
  remains visible. Mobile retains the existing Call and Text actions until the
  mobile-only audit decides otherwise.
- Closeout Reason, Needs, and Next are de-duplicated only at render time.
  Distinct values remain visible and source values are never rewritten.
- Age styling remains `>30` rose, `>14` amber, otherwise neutral.
- Field-payment review remains a specialized renderer with its existing job
  and invoice links, self-report restriction, Verify/Reject forms, notes,
  authorization, and pending behavior.
- Permits and Contractor Intake remain specialized surfaces and are not forced
  into the generic ledger.
- The desktop right rail contains the existing queue destinations and counts,
  Queue Health, conditional Workshare, and authorized quick links.

## Explicitly rejected or superseded concepts

Do not reintroduce:

- Legacy Details & Actions disclosures
- Removed schedule/contact-log trays on standard queue rows
- The old Closeout Open & Act or invoice-complete tray
- Nested sub-cards under ledger rows
- Hover overlays that cover Last Action or Last Attempt
- Duplicate Reason/Needs/Next text
- Mockup-only urgent/aging/new classifications or thresholds
- A duplicate Go to Today button inside the Ops header
- Desktop Needs Scheduling Call/Text buttons
- Clickable-looking column headings without current sort behavior
- Disabled zero-count queue links

## Change-control rule

Any future desktop change must identify whether it changes presentation or the
queue engine. A queue-engine change requires separate approval and tests in the
authoritative behavioral module. A presentation change must keep the row-view
union and prove it does not alter membership, counts, reasons, permissions,
actions, form payloads, or destinations.

Before merging future work:

1. Diff behavioral directories and database files against the intended base.
2. Run the complete Ops test suite, TypeScript, and production build.
3. Review populated, empty, and filtered-empty states for every available
   desktop queue.
4. Verify product-mode and permission gates.
5. Confirm no rejected legacy UI strings or action trays returned.

## Desktop freeze verification

Completed July 25, 2026 on branch `ops-visual-redesign`:

- User-reviewed authenticated desktop queue presentation at
  `http://localhost:3000/ops`
- 33 Ops test files passed
- 281 Ops tests passed
- TypeScript passed with `npx tsc --noEmit`
- Next.js production build passed with `npm run build`
- `git diff --check` passed
- No non-test changes were present under actions, auth, business logic, Ops
  rules, permits, workflows, or Supabase/database files

The desktop contract is frozen at `xl` and wider. The next approved phase is a
mobile-only audit below `xl`; mobile work must not alter desktop queue
membership, row-view data, actions, rail behavior, or ledger presentation.
