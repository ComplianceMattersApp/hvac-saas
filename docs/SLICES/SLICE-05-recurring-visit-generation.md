# SLICE 05 — Recurring Visit Generation (Maintenance Agreements → Needs Scheduling)

You are a senior engineer working in the EveryStep FieldWorks repo (`hvac-saas`).
Read `docs/SLICES/SLICE-01-qbo-correctness.md` §1–§2 for repo orientation and
the standing rules — they bind this slice.

## The owner's product rule (non-negotiable)

**The engine never books appointments.** Customer availability is never
guaranteed, so auto-generation creates **due visits** that land in the existing
**Needs Scheduling** queue (`jobs.ops_status = 'need_to_schedule'`) and call
list — the office still phones the customer and picks the slot, exactly like
every other job. Auto-generation replaces the spreadsheet, not the phone call.
Nothing in this slice may write `scheduled_date`, calendar entries, or any
assignment.

## What exists (verified — study these before writing code)

- `maintenance_agreements` (+ `maintenance_agreement_templates`,
  `…_template_checklist_items`, `…_billing_periods`) with `frequency` and
  `next_due_date`; confirmation metadata on `maintenance_agreement_visits`
  (`confirmed_next_due_date`, `baseline_next_due_date`, migration
  `20260514120000`).
- `maintenance_agreement_visits` links agreements to jobs **after the fact**;
  `link_source IN ('service_plan_prefill','manual','system_future')` —
  `'system_future'` was explicitly reserved for this engine (migration
  `20260513110000`) and is written by nothing today.
- The read model (`lib/maintenance-agreements/read-model.ts`) already computes
  `due_state` (`overdue|due_today|upcoming|not_scheduled|inactive`) and
  `fulfillment_state` (`due_for_booking|job_created_unscheduled|booked|
  visit_review_needed|healthy`) plus `suggested_next_due_date` — the UI
  vocabulary for "a job exists but isn't scheduled" already renders.
- There is an existing **service-plan prefill** path (the `service_plan_prefill`
  link source) — locate it and reuse its job-payload construction (title, visit
  scope from template work items, checklist instantiation, customer/location
  wiring). The generator must produce the SAME job shape the manual path
  produces; do not invent a parallel payload.
- Ops queue membership is contract-driven (`lib/ops/queue-status-contracts.ts`,
  `lib/ops/queue-membership.ts`) with a queue-coverage invariant test — a
  generated job must satisfy the Needs Scheduling contract with no queue-logic
  changes.

## Design (decided)

**D1. Trigger:** a daily cron route (follow the `vercel.json` + `app/api/cron/*`
pattern; never throws, per-row isolation like the QBO sweeps). For each ACTIVE
agreement with `auto_generate_visits = true` whose effective next due date
(respect the existing confirmed/baseline/suggested next-due lifecycle — study
it, don't fork it) falls within the **lead window of 14 days** (constant,
`GENERATION_LEAD_DAYS = 14`; per-account configurability is a named follow-up),
generate one visit job.

**D2. Idempotency invariant — at most one open generated visit per agreement.**
Skip generation when the agreement already has ANY linked job that is not
completed/cancelled/archived (regardless of link_source — if the office already
created or booked a visit manually, the engine stays out of the way). This is
the invariant to test hardest: the cron running twice, the office creating a
job the same morning, a generated job being cancelled (→ next run may generate
again), a completed visit advancing the due date.

**D3. Schema (one additive migration):** `maintenance_agreements.
auto_generate_visits boolean NOT NULL DEFAULT true` + a toggle in the agreement
edit UI with one line of copy ("Automatically create the next visit in Needs
Scheduling when it comes due"). On the generated link row:
`link_source = 'system_future'`.

**D4. The generated job:** built via the reused prefill payload; lands with
`ops_status='need_to_schedule'`, no schedule, no assignee; a `job_events` entry
records "Visit generated automatically from service plan {name} (due {date})"
so the timeline explains where the job came from. Dates are compared in the
account's business time zone (existing `America/Los_Angeles` default pattern).

**D5. Due-date advancement is NOT the generator's job.** Whatever advances
`next_due_date` today (visit counting / completion flow) keeps doing it. The
generator only reads due state and creates jobs. If you find the advancement
path has a gap that blocks correct regeneration (e.g. next_due never advances
until a visit is "counted"), report it as a finding — do not silently extend
scope.

## Out of scope (named follow-ups)

Auto-scheduling/booking of any kind · per-account lead-window configuration ·
customer-facing reminders ("your maintenance visit is due — book now" belongs
to the SMS/portal lanes) · seasonal windows beyond the existing placeholder ·
generating more than one occurrence ahead.

## Acceptance criteria

- [ ] Migration additive-only; not applied by you.
- [ ] Daily cron generates a job for a due agreement: correct prefill shape
      (identical fields to the manual service-plan path), Needs Scheduling
      membership (queue-coverage invariant test passes untouched), link row
      with `link_source='system_future'`, timeline event present.
- [ ] D2 idempotency proven by tests for: double cron run, existing manual
      open job, cancelled generated job, completed visit.
- [ ] `auto_generate_visits=false` agreements are never touched; toggle renders
      and saves.
- [ ] Nothing writes `scheduled_date`/assignments/calendar rows anywhere in the
      new code.
- [ ] Agreements UI: generated jobs surface through the existing
      `fulfillment_state` rendering with no new UI concepts (verify
      `job_created_unscheduled` shows for a generated job).
- [ ] `npm run test` (pre-existing failures called out), `npm run build`,
      `tsc --noEmit` clean; lint delta explained.

## Deliverable / report back

Branch `slice-05-recurring-visit-generation`, no PR unless asked. Report in the
established format: files by group, full test/build output, deviations with
reasons, a sandbox manual QA script (create a monthly agreement due in 10 days
→ run the cron → job appears in Needs Scheduling with correct scope/checklist →
run cron again → no duplicate → cancel the job → next run regenerates →
disable the toggle → nothing generates), and open questions for Slice 06
(hardening pair: invite unique constraint + role-change audit events).
