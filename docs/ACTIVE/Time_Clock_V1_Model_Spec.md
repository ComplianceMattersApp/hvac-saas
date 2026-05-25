# Compliance Matters Software - Time Clock V1 Model Spec

Status: ACTIVE planning packet (V1A docs/model lock)
Mode: Audit plus model lock only
Authority: Subordinate to Active Spine and existing ACTIVE source-of-truth docs
Date: 2026-05-24

---

## 1) Purpose and Boundaries

This document locks the V1 Time Clock model and delivery sequence before runtime implementation.

Locked posture:
- Source-of-truth first.
- Time Clock is a dedicated timekeeping truth layer.
- `job_events` remains narrative/timeline truth only.
- `job_events` may later include summaries, but is not timecard truth.
- V1 scope is internal users only.

Explicitly out of scope in V1:
- Payroll calculation and wage policy logic.
- Contractor time tracking.
- Customer portal/public access.
- Broad reporting automation beyond lightweight weekly summary/export planning.

---

## 2) Audit Findings (Current System)

### 2.1 Internal user and role model
- Internal actor gating is centralized in `lib/auth/internal-user.ts`.
- Canonical internal roles are `admin`, `office`, `tech`.
- `internal_users` is account-scoped by `account_owner_user_id` and includes `is_active`.
- Admin-only mutation surfaces follow `requireInternalRole("admin")` and account-scope checks.

### 2.2 Account settings pattern
- `account_settings` exists with account-owned PK `account_owner_user_id`.
- Current model stores product-mode fields and uses RLS select-account-scope policy.
- Existing pattern supports additive account-level booleans without creating a separate settings table.

### 2.3 Admin/settings surfaces
- Admin center exists at `/ops/admin` with card-based module entry.
- Internal team management exists at `/ops/admin/internal-users`.
- Existing settings-module style supports adding Time Clock governance without new IA paradigm.

### 2.4 Ops/Home dashboard card pattern
- `/ops` already uses summary cards and panel sections for operational awareness.
- Team snapshot card patterns are established and suitable for a "Who is clocked in" card.

### 2.5 Navigation and access patterns
- Mobile/primary shell navigation uses internal/admin role gates.
- Admin routes are hidden for non-admin; contractor users redirect to `/portal`.
- Pattern supports adding `/time-clock` for tracked internal users and admin center links for office/admin workflows.

### 2.6 Reports/export pattern (future V1.5 anchor)
- Report ledger modules use explicit export limits and CSV helpers (for example `JOB_VISIT_LEDGER_EXPORT_LIMIT`).
- Existing model supports adding time summary/export in V1.5 as a ledger-style report module.

### 2.7 RLS/account-scope conventions
- Account-scoped tables commonly use `account_owner_user_id`.
- Modern internal-user scope uses helper `current_internal_account_owner_id()` or actor-account EXISTS checks.
- Policy naming pattern: `<table>_select_account_scope` and similar scoped policy names.

### 2.8 Server action mutation patterns
- Actions resolve actor via `createClient()` plus `requireInternalRole(...)`.
- Writes often use `createAdminClient()` after explicit account-scope validation.
- Post-mutation refresh uses targeted `revalidatePath(...)` calls.
- This is the expected mutation style for future clock in/out/correction actions.

### 2.9 Date/time helper conventions
- LA-safe business date/time helpers are centralized in `lib/utils/schedule-la.ts`.
- Existing code avoids timezone drift for date-only values and normalizes display formatting.
- Time Clock UI and exports should reuse these helpers (or additive equivalents) rather than ad hoc formatting.

### 2.10 Audit/edit-reason patterns
- Existing system has correction/audit precedents (`updated_by_user_id`, reason fields in selected domains, support access audit payloads).
- Time entry corrections should require reason and preserve actor/timestamp metadata.

---

## 3) V1 Data Model Lock

### 3.1 Recommended table name
Preferred: `internal_user_time_entries`

Rationale:
- Aligns with existing `internal_users` naming and V1 scope (internal users only).
- Avoids ambiguity with contractors or customer-facing entities.

Alternative allowed alias in discussion: `employee_time_entries` (not preferred).

### 3.2 Table ownership and identity fields
Required core fields:
- `id uuid primary key default gen_random_uuid()`
- `account_owner_user_id uuid not null`
- `internal_user_id uuid not null`
- `status text not null`
- `clock_in_at timestamptz not null`
- `lunch_start_at timestamptz null`
- `lunch_end_at timestamptz null`
- `clock_out_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Audit/correction fields:
- `adjusted_by_user_id uuid null`
- `adjusted_at timestamptz null`
- `adjustment_reason text null`

Future-ready optional fields (parked V1.5+):
- `job_id uuid null`
- `approved_by_user_id uuid null`
- `approved_at timestamptz null`

### 3.3 Status lifecycle lock
Allowed persisted values for `status`:
- `open`
- `on_lunch`
- `closed`
- `needs_review`
- `voided`

V1 behavioral intent:
- `open`: clocked in and working.
- `on_lunch`: open entry currently in lunch.
- `closed`: normal ended entry.
- `needs_review`: flagged for manual correction.
- `voided`: invalidated entry with audit trail.
- `clocked_out`: derived read-state only when no active entry exists for a user.

### 3.4 Minimal validity guardrails
Model-level guardrails (no implementation in V1A):
- `clock_in_at` required for all persisted entries.
- `lunch_end_at` cannot exist without `lunch_start_at`.
- `closed` status requires `clock_out_at`.
- `on_lunch` requires `lunch_start_at` and no `lunch_end_at`.
- adjustment metadata requires `adjustment_reason`.
- `adjustment_reason` required for admin/owner correction writes.

### 3.5 Account and user settings lock
Account-level setting (global gate):
- Add `time_clock_enabled boolean not null default false` to `account_settings`.

Per-user setting (tracking participation gate):
- Add `time_tracking_enabled boolean not null default false` to `internal_users`.

Both gates must be true for normal tracked user clock workflows.

### 3.6 RLS lock for time entries
V1 policy intent:
- Active internal users can read account-scoped time entries.
- Tracked internal users can insert/update their own active time state rows inside account scope.
- Admin/owner can review and correct account-scoped entries.
- Contractor users have no access to V1 Time Clock tables/routes/actions.

---

## 4) V1 UI Surface Lock

### 4.1 Employee-facing clock page
Route: `/time-clock`

Scope:
- Internal user only.
- Requires `account_settings.time_clock_enabled = true` and `internal_users.time_tracking_enabled = true`.
- V1 actions only: Clock In, Start Lunch, End Lunch, Clock Out.

### 4.2 Ops/Home team status card
Route: `/ops`

Scope:
- Admin/office-only visibility.
- Lightweight awareness card: who is currently clocked in (and lunch state).
- No correction controls on this card.

### 4.3 Time Clock Center (admin review/correction)
Future V1E route (recommended): `/ops/admin/time-clock`

Scope:
- Admin/owner correction and review workspace.
- Correction writes require explicit reason.
- Keep V1 center focused on review/correction, not payroll processing.

---

## 5) Recommended Implementation Sequence

### V1A - model/docs lock (this document)
- Complete audit and lock table/status/setting/visibility decisions.
- No runtime behavior changes.

### V1B - schema/settings foundation
- Add `internal_user_time_entries` table.
- Add `account_settings.time_clock_enabled`.
- Add `internal_users.time_tracking_enabled`.
- Add RLS policies and baseline helper tests.

V1B closeout status:
- Complete in repository: migration + account-scoped read helpers + focused tests.
- Unique active-entry protection is schema-enforced (partial unique index for `open|on_lunch`).
- No employee clock page, Ops card, or admin correction UI behavior added in this phase.

### V1C - settings controls
- Add admin account-level toggle for `account_settings.time_clock_enabled`.
- Add admin per-user toggle for `internal_users.time_tracking_enabled`.
- Keep controls account-scoped and admin-only.

V1C closeout status (settings controls only):
- Complete in repository: admin account-level toggle for `account_settings.time_clock_enabled` and admin per-user toggle for `internal_users.time_tracking_enabled`.
- Contractor/customer portal users remain blocked through existing internal-role/admin route gates.
- No `/time-clock` employee runtime actions, Ops team status card, or admin correction/timesheet runtime behavior added in this pass.

### V1C-2 - consolidated team tracking controls
- Add consolidated Time Tracking status + toggle column to `/ops/admin/internal-users` list page.
- Allow admin/owner to manage time tracking for all team members from one surface.
- Keep existing detail-page toggle as backup control.

V1C-2 closeout status (consolidated team management):
- Complete in repository: Time Tracking status + inline toggle on `/ops/admin/internal-users` list page.
- Consolidated team controls now preferred admin workflow; individual user detail page toggle remains available as backup.
- Action `updateInternalUserTimeTrackingFromListForm` handles list-level updates with account scoping and admin-role gating.
- Inactive users show current time tracking state but toggle is disabled in UI.
- No clock-in/out behavior, Ops card changes, reporting, payroll, GPS, job-costing, or contractor/portal behavior added in this phase.

### V1D - employee clock page
- Add `/time-clock` page and server actions.
- Enforce account/user toggles and internal-user gating.
- Implement Clock In, Start Lunch, End Lunch, Clock Out only.

V1D closeout status:
- Complete in repository: mobile-first internal-user `/time-clock` route with guarded Clock In, Start Lunch, End Lunch, and Clock Out actions.
- Writes remain account-scoped and action-checked, with duplicate-active protection backed by schema constraints.
- No Ops Team Clock Status card, admin correction center, reporting exports, payroll behavior, or contractor/portal time tracking added in this phase.

### V1E - Ops dashboard card
- Add admin/office Team Clock Status card on `/ops`.
- Keep card read-first and lightweight.

V1E closeout status:
- Complete in repository: admin/office-only Team Clock Status card on `/ops` with active entries (`Clocked In` and `On Lunch`) and `Open Time Clock` link.
- Card stays account-scoped and read-only, and remains hidden when account time clock is disabled to avoid dashboard clutter.
- No correction controls, reporting/export, payroll, overtime, GPS, or job-costing behavior added in this phase.

### V1F - admin review/correction page
- Add admin/owner review center.
- Add correction workflow with required reason.
- Add `needs_review` and `voided` review handling UX.

V1F closeout status:
- Complete in repository: admin-only `/ops/admin/time-clock` review center with `Active Now`, rolling review, and `Needs Review` sections.
- Admin correction controls are available for all admin review entries and require adjustment reason.
- Admin correction action supports scoped entry corrections across `clock_in_at`, `lunch_start_at`, `lunch_end_at`, `clock_out_at`, and status (`closed|needs_review|voided`) with audit fields (`adjusted_by_user_id`, `adjusted_at`, `adjustment_reason`).
- Server action is admin-gated and account-scoped; target entry must belong to current account owner scope.
- No payroll approvals, wage/overtime calculations, GPS/geofencing, job-costing, or contractor/customer-portal behavior added in this phase.

### V1G - 7-day admin time review
- Expand admin review center from a today-only list to a rolling 7-day review surface.
- Keep `Active Now`, `Needs Review`, and existing correction controls with required reason.
- Preserve durable time-entry history while keeping older lookup/export parked for V1.5.

V1G closeout status:
- Complete in repository: `/ops/admin/time-clock` now includes `7-Day Time Review` grouped by readable LA date labels.
- Recent review remains account-scoped and uses a rolling 7-calendar-day window based on `clock_in_at`.
- Existing correction controls remain available on each recent entry; entries are durable and no delete/reset behavior was added.
- Older time entries remain durable for future reporting/export surfaces; this page is only a recent review surface.
- No reporting/export, payroll, GPS/geofencing, job-costing, or contractor/customer-portal behavior added in this phase.

### V1.5 - weekly summary/export
- Add report-center ledger style weekly summary/export.
- Reuse existing CSV/export conventions and limits.

### V1.5A - reporting/history foundation
- Add admin-only Time Clock report/history surface with date range, employee, and status filters.
- Keep this surface historical visibility/export only, not payroll or approval workflow.

V1.5A closeout status:
- Complete in repository: admin-only `/reports/time-clock` with date range, employee, and status filtering.
- Includes newest-first historical visibility and simple CSV export using existing Report Center patterns.
- Report fields include employee, status, clock in/out windows, duration, adjusted indicator, adjustment reason, adjusted by, and adjusted at.
- Time entry history remains account-scoped and durable; no payroll, overtime, wages, GPS/geofencing, job-costing, contractor, portal, or approval behavior was added.

### Time Clock lane closeout (V1 + V1.5A)
- Time Clock V1 and V1.5A are complete for current intended scope.
- Latest reporting/history closeout commit: `3f81c71` (`feat(time-clock): add reporting history export`).
- Durability confirmation:
	- time entries are durable records
	- `/ops/admin/time-clock` 7-day review is a recent review surface only, not a retention limit
	- `/reports/time-clock` provides older history lookup and export
- Correction/audit confirmation:
	- corrections require non-empty reason
	- audit metadata remains preserved (`adjusted_by_user_id`, `adjusted_at`, `adjustment_reason`)
	- no delete behavior was added
- Scope guardrails confirmed:
	- no payroll engine
	- no wage/overtime calculations
	- no GPS/geofencing
	- no job-costing behavior
	- no contractor/customer portal time tracking
	- no QBO/payroll sync behavior

Deferred/future items (parked unless explicitly reopened):
- payroll-ready summaries
- overtime rules
- approval workflow
- job labor costing
- GPS/geofence verification
- office view-only permission expansion
- deeper Admin/Settings IA cleanup
- payroll/QBO integration
- contractor/portal time tracking

---

## 6) Explicit Non-Goals

- No payroll engine.
- No overtime, break law, compensation, or tax computations.
- No contractor time tracking.
- No customer-facing time tracking routes.
- No public API exposure for Time Clock V1.
- No migration of timecard truth into `job_events`.
- No automatic job status or lifecycle mutation driven by time clock status.

---

## 7) Decision Summary

Locked decisions:
- Dedicated timekeeping truth table: `internal_user_time_entries`.
- Account gate: `account_settings.time_clock_enabled`.
- User gate: `internal_users.time_tracking_enabled`.
- V1 actions: Clock In, Start Lunch, End Lunch, Clock Out.
- V1 audience: internal users only.
- Admin correction requires reason and audit metadata.
- `job_events` remains narrative-only for this domain.
