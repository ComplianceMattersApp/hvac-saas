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

### V1C - employee clock page
- Add `/time-clock` page and server actions.
- Enforce account/user toggles and internal-user gating.
- Implement Clock In, Start Lunch, End Lunch, Clock Out only.

### V1D - Ops dashboard card
- Add admin/office Team Clock Status card on `/ops`.
- Keep card read-first and lightweight.

### V1E - admin review/correction page
- Add admin/owner review center.
- Add correction workflow with required reason.
- Add `needs_review` and `voided` review handling UX.

### V1.5 - weekly summary/export
- Add report-center ledger style weekly summary/export.
- Reuse existing CSV/export conventions and limits.

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
