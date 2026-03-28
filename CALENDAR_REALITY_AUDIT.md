# Calendar Reality Audit

---

## 1. Scope

**Files and routes inspected:**

- `app/calendar/page.tsx` — calendar route (server component)
- `components/calendar/calendar-view.tsx` — primary calendar UI: view switcher, DispatchGrid, AgendaList, CalendarMonthGrid mount point, DetailPanel (inspector + schedule + assignment forms)
- `components/calendar/CalendarMonthGrid.tsx` — month grid with inline job hover tooltips
- `components/calendar/unscheduled-lane.tsx` — legacy component, marked "currently not used in calendar"
- `components/calendar/event-details-modal.tsx` — legacy component, marked "currently not used in calendar"
- `components/calendar/calendar-day.tsx` — legacy component, marked "currently not used in calendar"
- `components/calendar/calendar-legend.tsx` — legend display component
- `lib/actions/calendar-actions.ts` — `getDispatchCalendarData()`: canonical query + normalization for day/week views, assignment map, latest event map, unscheduled job collection, assignable users
- `lib/actions/calendar.ts` — re-export barrel (`export * from "./calendar-actions"`)
- `lib/actions/job-actions.ts` — `updateJobScheduleFromForm()`, `assignJobAssigneeFromForm()`, `removeJobAssigneeFromForm()`, `setPrimaryJobAssigneeFromForm()` + schedule email triggers + `job_events` logging
- `lib/staffing/human-layer.ts` — `getAssignableInternalUsers()`, `assertAssignableInternalUser()`, `getActiveJobAssignmentDisplayMap()`
- `app/ops/page.tsx` — ops command board: Field Work (today), Upcoming, Call List, Closeout, Exceptions, Needs Attention queues — all query `scheduled_date` / `window_start` / `window_end`
- `lib/utils/schedule-la.ts` — referenced by multiple surfaces; provides LA-timezone date and window formatting utilities

---

## 2. Scheduling/Calendar Surfaces Found

### Routes
| Route | Purpose |
|---|---|
| `/calendar` | Dedicated dispatch calendar — day / week / month / list views |
| `/ops` | Operational command board — includes scheduling queues (Field Work today, Upcoming, Call List) |
| `/jobs/[id]` | Job detail page — hosts the schedule form (via `updateJobScheduleFromForm`) |

### Components
| Component | Role | Status |
|---|---|---|
| `CalendarView` | Root server component: fetches data, renders all views | Active |
| `DispatchGrid` | Time-blocked day/week grid with technician columns and current-time indicator | Active |
| `AgendaList` | Chronological list grouped by day | Active |
| `CalendarMonthGrid` | Calendar month grid with per-cell job chips and hover tooltips | Active |
| `DetailPanel` | Inspector sidebar: job info, schedule form, assignment form, contact actions | Active |
| `unscheduled-lane.tsx` | Unscheduled job scheduling widget | Legacy / unused in active calendar |
| `event-details-modal.tsx` | Older modal style job detail | Legacy / unused |
| `calendar-day.tsx` | Older day-cell design | Legacy / unused |

### Actions
| Action | What it does |
|---|---|
| `getDispatchCalendarData()` | Server-side: queries `jobs`, builds day/week job arrays, fetches assignment map, fetches latest `job_events` per job, returns assignable users |
| `updateJobScheduleFromForm()` | Writes `scheduled_date`, `window_start`, `window_end`; evaluates `ops_status`; logs `scheduled` / `schedule_updated` / `unscheduled` event to `job_events`; sends customer + contractor emails on scheduling; revalidates `/calendar`, `/ops`, `/portal`, `/jobs/[id]` |
| `assignJobAssigneeFromForm()` | Adds technician assignment; supports `make_primary` flag; logs via staffing layer; revalidates calendar |
| `removeJobAssigneeFromForm()` | Removes assignment; revalidates calendar |
| `setPrimaryJobAssigneeFromForm()` | Changes primary designee |
| `getAssignableInternalUsers()` | Returns active internal users (eligibility gate: internal_users, not contractors) |
| `getActiveJobAssignmentDisplayMap()` | Returns per-job assignment arrays with display names and primary flag |

### Schema fields involved
- `jobs.scheduled_date` (`DATE`) — scheduling anchor
- `jobs.window_start` / `jobs.window_end` (`TIME`) — service window
- `jobs.ops_status` — projection reflecting scheduling state (`need_to_schedule`, `scheduled`, etc.)
- `job_assignments` table — multi-tech assignment with `is_primary` flag
- `job_events.event_type` — records `scheduled`, `schedule_updated`, `unscheduled`, `permit_info_updated`
- `notifications` — operational email delivery records for scheduled emails

---

## 3. Capability Matrix

| Capability | Status | Proof |
|---|---|---|
| Create schedule (set date + window on a job) | **COMPLETE** | `updateJobScheduleFromForm()` in `job-actions.ts:5151`; form present in `DetailPanel` (`calendar-view.tsx:758`) and on job detail page |
| Reschedule a job | **COMPLETE** | Same `updateJobScheduleFromForm()`; detects `didScheduleFieldsChange`, logs `schedule_updated` event, sends contractor reschedule email when prior notification history exists |
| Unschedule a job | **COMPLETE** | `unschedule=1` flag in `updateJobScheduleFromForm()`; nulls all three fields; forces `ops_status` back to `need_to_schedule`; logs `unscheduled` event |
| View jobs by date — day view | **COMPLETE** | `DispatchGrid` renders a time-blocked per-technician-column day view at `/calendar?view=day` |
| View jobs by date — week view | **COMPLETE** | `DispatchGrid` called per day within `canonicalDispatchJobsByDay` for `/calendar?view=week` |
| View jobs by date — month view | **COMPLETE** | `CalendarMonthGrid` renders full month calendar at `/calendar?view=month` |
| View jobs by date — list/agenda view | **COMPLETE** | `AgendaList` renders chronological grouped-by-day list at `/calendar?view=list` |
| See technician/team assignment with schedule | **COMPLETE** | `DispatchGrid` columns are per-assignee; assignment names appear in all views; `DetailPanel` shows current assignments |
| Assign technician from calendar | **COMPLETE** | `assignJobAssigneeFromForm` wired into `DetailPanel` inspector (`calendar-view.tsx:780`) |
| Remove technician from calendar | **COMPLETE** | `removeJobAssigneeFromForm` wired into existing assignment list in `DetailPanel` |
| See unscheduled jobs needing scheduling | **COMPLETE** | Left sidebar "Unscheduled Jobs" lane in `CalendarView` shows all active, unscheduled jobs; also Call List queue in `/ops` |
| Navigate from scheduled item to job | **COMPLETE** | `DetailPanel` has "Open Job" / "Open Customer" / "Open Location" links; every job chip in all views links to job or opens inspector |
| Preserve schedule changes in `job_events` | **COMPLETE** | `updateJobScheduleFromForm()` calls `insertJobEvent()` with `scheduled`, `schedule_updated`, or `unscheduled` event type including before/after meta snapshot |
| Reflect schedule in `ops_status` | **COMPLETE** | `evaluateJobOpsStatus()` called after every schedule save; `ops_status` is computed projection, not manually set |
| Reflect schedule in ops queues | **COMPLETE** | `/ops` page has Field Work (today), Upcoming (tomorrow+), Call List (need_to_schedule) queues using `scheduled_date` and `window_start` filters |
| Multi-tech scheduling awareness | **COMPLETE** | `DispatchGrid` renders a separate column per technician; all assignments surfaced; `is_primary` flag tracked |
| Current-time indicator in day/week view | **COMPLETE** | "Now" line rendered using LA timezone minutes-into-day (`currentMinutesLA()`) in `DispatchGrid` |
| Overlap/lane detection in time grid | **COMPLETE** | `laneItemsByUser` lap algorithm in `DispatchGrid` computes lanes and `laneCount` for overlapping jobs per technician column |
| "Needs Tech" badge for unassigned scheduled jobs | **COMPLETE** | `CalendarMonthGrid` and `AgendaList` both display amber "Needs Tech" badge when job has `scheduled_date` but no assignments |
| Email notification on schedule/reschedule | **COMPLETE** | `sendCustomerScheduledEmailForJob()` and `sendContractorScheduledEmailForJob()` called on `scheduled` and on `schedule_updated` when prior email history exists |
| Status-color coding in calendar | **COMPLETE** | `dispatchBlockClass()` and `statusDotClass()` consume `ops_status` from backend — no UI-derived status logic |
| Drag-and-drop scheduling | **MISSING** | No drag-and-drop implementation exists anywhere in the codebase. Scheduling is form-based. |
| Technician filter on calendar | **MISSING** | No in-calendar technician filter control. DispatchGrid auto-columns all assigned techs; there is no way to show one tech's day only. |
| Date-range filter on calendar | **NOT APPLICABLE** | Navigation covers any date/week/month; no arbitrary multi-range filter needed at current product scale |
| Filter by status in calendar view | **MISSING** | No status filter in calendar. All non-closed/non-cancelled scheduled jobs appear. Filter exists in ops page queues but not the calendar surface itself. |
| Schedule from ops surface directly | **PARTIAL** | Ops page shows schedules, has "Need to Schedule" / "Upcoming" queues, but scheduling edits require navigating to `/jobs/[id]` or opening the calendar inspector — no inline scheduling form in ops |
| View ops_status from calendar | **COMPLETE** | All four views (day/week/month/list) display status dots and labels derived from `job.ops_status` |

---

## 4. Scheduling Engine Assessment

### What is truly complete

- **Data model**: `scheduled_date`, `window_start`, `window_end`, and `job_assignments` with `is_primary` are fully implemented as the scheduling record.
- **Write actions**: All three scheduling mutations (`updateJobScheduleFromForm`, `assignJobAssigneeFromForm`, `removeJobAssigneeFromForm`) are real, validated, server-side actions with proper authorization (`requireInternalUser`).
- **`ops_status` projection**: `evaluateJobOpsStatus()` is called after every schedule write, keeping the projection authoritative.
- **Event logging**: Every schedule change produces a typed `job_events` row with a before/after snapshot. The engine correctly distinguishes `scheduled` (first time), `schedule_updated` (change), and `unscheduled` (removal).
- **Email side-effects**: Customer and contractor schedule emails fire correctly — on initial schedule and on reschedule if prior email history exists.
- **Unschedule policy**: Explicit unschedule returns `ops_status` to `need_to_schedule` and sets `status` back to `open`. This is policy-correct.
- **Multi-tech assignment engine**: `getActiveJobAssignmentDisplayMap()` resolves all active assignments per job batch. Assignment guard (`assertAssignableInternalUser()`) enforces internal-user-only eligibility.
- **Ops queue integration**: `/ops` page queries are built directly from `scheduled_date` and `window_start`, pulling Field Work (today), Upcoming, and past-scheduled exceptions.
- **Calendar data fetcher**: `getDispatchCalendarData()` is a single canonical fetch function with proper filtering (excludes `closed`/`cancelled`, excludes `deleted_at`, separates scheduled vs unscheduled lanes).

### What remains incomplete technically

- **No drag-and-drop write path**: There is no server action or client-side mutation for drag-to-reschedule. Scheduling is 100% form-based. This is a capability gap but not a correctness gap — form-based scheduling works correctly.
- **Technician filter missing from calendar query**: `getDispatchCalendarData()` fetches all jobs then columns by assignee; there is no server-side technician scope parameter, meaning as team scale grows the client receives the full unfiltered dataset.
- **`unscheduled-lane.tsx` is orphaned**: The more feature-rich clientside unscheduled lane (`onSchedule` callback, call logging) is marked legacy and not wired into the active calendar. The calendar uses a simpler server-rendered link list instead.

---

## 5. Calendar/Dispatch UX Assessment

### What is usable now

- **Four view modes are working**: Day, Week, Month, List. Navigation (Previous / Today / Next) functions correctly across all views with proper LA-timezone anchoring.
- **Time-blocked per-tech grid** (day / week): Shows overlapping jobs, handles lane conflicts, renders a real-time "now" line. A dispatcher can see today's schedule at a glance.
- **Inspector panel** (DetailPanel): Clicking any job in any view opens an inspector sidebar (desktop: fixed right panel; mobile: full-screen overlay) with contact info, Call/Text/SMS links, a schedule form (date + window_start + window_end), and an assignment selector with remove capability. Actions round-trip through real server actions and return to the same calendar position with a banner.
- **Month grid**: Full calendar month view with per-day job chips, hover tooltips showing address / window / contractor / status, and a "Needs Tech" amber badge. Max 3 visible per cell with overflow count.
- **Unscheduled jobs lane**: Left sidebar always shows active unscheduled jobs; each one is clickable to open in the inspector so a dispatcher can schedule them without leaving the calendar.
- **Status-color legend**: Visible in the header; all views consistently use `ops_status`-derived colors.
- **Ops surface integration**: The `/ops` command board has dedicated scheduling queues (Field Work, Upcoming, Call List, Exceptions/Still Open) that serve as a scheduling workflow surface independent of the calendar.

### What is awkward, limited, or missing from a human-operator perspective

1. **No inline scheduling from Ops**: Moving a job from "Need to Schedule" to scheduled requires navigating to `/jobs/[id]` or opening the `/calendar` inspector. There is no "quick schedule" form directly in the ops card.
2. **No tech filter on the calendar**: A dispatcher managing a team cannot scope the grid to one technician. All techs always appear as columns. At small team sizes this is fine; at 4+ techs, the grid becomes wide.
3. **No status filter on the calendar**: Cannot filter to "only show unconfirmed/pending jobs" or "only show jobs needing tech" without leaving the calendar.
4. **Drag-and-drop is absent**: Rescheduling requires opening the inspector and typing a new date/time. For high-volume dispatch (10–20 jobs/day), this is slower than a drag-and-drop model.
5. **No "unschedule" button in the inspector**: The `updateJobScheduleFromForm` action supports `unschedule=1`, but the `DetailPanel` form does not expose an "Unschedule" button. A dispatcher must navigate to the job detail page to explicitly unschedule.
6. **Assignment does not support set-primary from inspector**: `setPrimaryJobAssigneeFromForm` exists but is not wired into the `DetailPanel`. The only primary-assignment control is in the job detail page.
7. **`unscheduled-lane.tsx` (legacy)**: The richer clientside unscheduled-job widget with inline call logging is orphaned. Its functionality is partly replicated by the ops Call List queue, but the calendar sidebar shows a link list only — no call-logging or contact state tracking visible from the calendar.
8. **Month view tooltip only, not a schedule surface**: Hovering a job in the month view shows a tooltip but there is no click-to-open-inspector path from the month grid itself. Jobs must be clicked to open the URL with `?job=ID` which does open the inspector panel, but only because of URL state — not an in-grid interaction.

---

## 6. Spine Alignment Assessment

**Was the prior "calendar/dispatch is incomplete" conclusion accurate, partially accurate, or misleading?**

**Partially accurate, but overstated the gap — the engine is already complete.**

The spine and surrounding docs discussed the calendar as a gap area, likely because:
- Legacy components (`calendar-day.tsx`, `event-details-modal.tsx`, `unscheduled-lane.tsx`) are present in the repo but marked "not used in calendar." Their presence could read as "calendar is still being built."
- The four-view dispatch calendar (`DispatchGrid`, `AgendaList`, `CalendarMonthGrid`, `DetailPanel`) is a fully-realized, active implementation that was completed after whatever docs flagged it as incomplete.
- The scheduling engine (write actions, `job_events` logging, `ops_status` projection, email side-effects, multi-tech assignments) is complete and architecturally correct.

The remaining gaps are real but **UX-layer only**: no drag-and-drop, no technician filter, no unschedule button in the inspector, no inline ops scheduling. None of these represent missing data model or missing server actions — the write paths all exist. The gaps are in surfacing existing capabilities more efficiently for dispatch operators.

The claim "calendar/dispatch is incomplete" was **misleading when applied to the engine**. It becomes **partially accurate only when applied to UX** — specifically the absence of drag-and-drop and the extra navigation steps required for common dispatch operations.

---

## 7. Final Verdict

**FUNCTIONALLY COMPLETE, UX POLISH REMAINS**

The scheduling engine, data model, write actions, `job_events` logging, `ops_status` projection, and multi-tech assignment system are fully implemented and architecturally correct. Four calendar view modes are working. The ops command board integrates scheduling queues. The remaining gaps are operator UX friction points — not missing functionality at the engine or data layer.

---

## 8. Recommended Next Step

**Add an "Unschedule" button to the `DetailPanel` inspector in `calendar-view.tsx`.**

It is the smallest, highest-impact UX gap: the capability already exists (`unschedule=1` in `updateJobScheduleFromForm`), the form is already in place, and adding a single button closes a real workflow hole without any schema change, new action, or data model work.
