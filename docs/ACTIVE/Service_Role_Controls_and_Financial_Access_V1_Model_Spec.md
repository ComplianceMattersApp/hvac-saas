# Service Role Controls / Financial Access Controls V1A Model Spec

Status: ACTIVE MODEL LOCK
Owner lane: Service Role Controls / Financial Access Controls V1A
Scope: docs/model only. No runtime behavior, schema, migration, Supabase/RLS, Stripe, env, production, Billing Register, payment register mutation, export, QBO, ACH, platform fee, or recurring billing implementation is authorized by this spec.

## Purpose

Service Role Controls / Financial Access Controls V1A locks the authority model needed before Billing Register / Payments Register implementation becomes heavier.

The Financial Ledger / Payments Register V1 model established that Compliance Matters is tenant financial operating truth for all money received, while Stripe remains processor truth for Stripe transactions. That model creates new sensitive surfaces: payment register views, manual payment recording, payment correction, failed payment signals, exports, and financial dashboards. Those surfaces need source-of-truth authorization rules before implementation resumes.

This lane is intentionally audit/model-first. It does not add custom permissions UI, schema, RLS, billing register UI, payment actions, Stripe changes, or recurring billing.

Locked dependency rule:

- Financial Ledger / Payments Register implementation is paused until this V1A access model is locked.
- Billing Register V1 UI, payment register mutations, financial exports, payment correction tools, and broad financial dashboards remain blocked until this model is accepted as the implementation authority.

## Current Role Baseline

Current internal roles are simple:

- `admin`
- `office`
- `tech`

Current UI labels:

- `admin` = Admin
- `office` = Dispatcher
- `tech` / `technician` = Technician

Current code posture observed in audit:

- `lib/auth/internal-user.ts` defines `InternalRole = "admin" | "office" | "tech"`.
- `requireInternalUser()` enforces authenticated active internal user access.
- `requireInternalRole()` enforces coarse role gates where used.
- Team/invite/user-management actions are currently admin-only through `requireInternalRole("admin")`.
- Some job/admin operational actions allow admin/office.
- Many job, calendar, invoice, payment, and report actions currently require active internal user plus account scope, but do not yet distinguish financial access roles.
- `account_owner_user_id` is the structural account scope used across internal users, invoices, payments, reports, and operational records.
- Contractor/portal users are separate external actors and are redirected away from internal admin/report surfaces when detected.
- Platform-owner/support visibility uses explicit allowlist-style authority and is separate from tenant internal roles.

Known role-model limitations:

- No internal `billing` / AR role exists today.
- No selectable `owner` role exists today.
- No read-only/auditor role exists today.
- No estimator/sales role exists today.
- Product mode controls workflow relevance/defaults only and must not control authorization.

## Service Role Target Model

V1A locks the target service role concepts for future implementation. It does not require all concepts to be implemented in the first slice.

### Account Owner / Owner Authority

Owner authority is structural account authority, not merely a role label.

The current system is built around `account_owner_user_id`. Do not blindly add `owner` as a selectable internal role without a deeper audit of how account ownership, internal user membership, subscription entitlement, and support/platform visibility interact.

Future owner-only controls may include:

- highest-sensitivity financial setup
- platform/application fee settings where applicable
- Stripe/payment setup ownership
- account-level role and billing administration
- transfer-of-ownership flows, if separately designed

### Admin / Manager

Admin remains the broad internal management role.

Target authority:

- team and role management
- admin workspace access
- broad operational configuration
- financial register access by default
- manual off-platform payment recording by default
- payment metadata correction by default, with audit reason
- financial exports by default
- Stripe/payment setup with Owner authority

### Dispatcher

Dispatcher is the operational coordination role currently represented by `office`.

Target authority:

- job/customer/calendar/dispatch workflow
- operational invoice workflow status where needed
- limited invoice follow-up visibility
- no broad financial register ownership by default
- no payment CSV/register export by default
- no manual payment recording by default unless the tenant later enables a custom permission model

### Technician

Technician is the field/service execution role currently represented by `tech`.

Target authority:

- assigned or operationally relevant work access
- field completion and job workflow actions where currently allowed
- no broad payment register
- no payment export
- no financial summaries by default
- no Stripe/payment setup
- no team/role management

### Billing / AR

Billing / AR is a target internal financial role, not an implemented current role.

Target authority:

- Billing Register / Payments Register view
- manual off-platform payment recording
- payment metadata correction with audit reason
- financial register CSV export
- failed payment attempt visibility
- financial dashboard cards

Implementation note: adding `billing` as a real role requires a separate schema/RLS/migration and role-parser design. This spec locks the concept but does not authorize implementation.

### Read-Only / Auditor

Read-only / Auditor is deferred unless explicitly approved.

Potential future authority:

- read-only financial reports
- no payment recording
- no correction
- no export unless separately approved
- no Stripe/payment setup

### Estimator / Sales

Estimator / Sales is deferred unless explicitly approved.

Potential future authority:

- estimate/proposal workflows
- limited customer/job context
- no default financial register access
- no default payment recording/export authority

### Contractor / External Portal User

Contractor and external portal users are separate external actors, not internal service roles.

They must not receive internal financial register access through this role model. Any future external-facing payment or portal visibility must be designed separately and must not reuse internal service-role authority by accident.

## Financial Access Control Posture

V1A minimum posture:

- Billing Register view: Owner/Admin/Billing by default.
- Record manual payment: Owner/Admin/Billing only.
- Edit/correct payment metadata: Owner/Admin/Billing only, audit reason required.
- Export payment CSV/register data: Owner/Admin/Billing only.
- Failed payment attempt visibility: Owner/Admin/Billing; limited operational signal can be shown elsewhere if needed.
- Financial dashboard cards: Owner/Admin/Billing; Dispatcher may see limited invoice workflow status only.
- Technician: no broad payment register, no payment exports, no financial summaries by default.
- Dispatcher: operational invoice status only by default, not financial register ownership.
- Stripe/payment setup: Owner/Admin only.
- Platform/application fee settings: owner/platform-owner gated later, not tenant-wide admin-by-default without explicit design.
- Team/role management: Owner/Admin only.
- Contractor/portal users: no internal financial register access.

Financial access should be evaluated as account-scoped authority plus a financial capability check. Product mode, entitlement tier, UI visibility, or route naming must not be treated as financial authorization.

## Server-Side Enforcement Requirements

Every sensitive financial read, mutation, or export must check permission server-side. Hiding buttons is not sufficient.

Server-side gates are required for:

- Billing Register / Payments Register pages
- payment register API/read models
- manual payment recording actions
- payment correction actions
- payment void/reversal/refund tooling if later designed
- failed payment attempt lists
- financial dashboard cards
- payment register CSV exports
- Stripe/payment setup actions
- any future recurring billing-period payment views/actions

Each sensitive check should verify:

- authenticated active internal user or structural owner authority
- account scope through `account_owner_user_id`
- role/capability authority for the requested financial action
- no contractor/portal actor crossing into internal financial access
- no product-mode grant of security authority

Future implementation should prefer named capability helpers over scattered inline role checks so exports, server actions, route handlers, and page loaders enforce the same model.

## UI Visibility vs True Authorization

UI visibility may reduce clutter, guide users, and prevent accidental clicks.

UI visibility is not authorization.

Rules:

- A hidden button does not secure a mutation.
- A disabled control does not secure an export.
- A route absent from navigation does not secure direct URL access.
- Every sensitive action/export/read model must enforce the financial capability server-side.
- Product mode may hide irrelevant workflows but must not grant or deny financial authority.

## Billing Register Dependency Rule

Billing Register / Payments Register work remains blocked until this model is locked.

Blocked until V1A lock:

- Billing Register V1 UI
- payment register mutations
- payment allocation implementation
- financial exports
- payment correction tools
- broad financial dashboard cards
- Stripe fee work
- ACH
- QBO
- recurring billing

After V1A lock, the first implementation slices should add permission helpers and tests before exposing register views, mutations, or exports.

## Contractor / Portal Separation

Contractors, contractor users, customer portal users, and future external portal actors are outside the internal service role model.

Rules:

- Contractor/portal access must not inherit internal financial register authority.
- Internal admin/dispatcher/technician roles must not be assigned to contractor/portal users as a shortcut.
- Future portal payment self-service is deferred and must have its own access and data-minimization model.
- Existing contractor portal workflows remain operational/external collaboration truth, not tenant financial administration truth.

## Owner vs Admin Distinction

Owner authority and Admin role overlap but are not identical.

V1A distinction:

- Owner authority is structural and tied to account ownership.
- Admin is an internal service role.
- Current code uses `account_owner_user_id` for account scope and `admin` for broad internal management.
- Future owner-only financial/platform controls must not be implemented by simply adding `owner` to the role dropdown.

Open design work before implementation:

- determine whether the owner is always also represented in `internal_users`
- determine whether owner authority should be checked by user id matching `account_owner_user_id`
- determine how account ownership transfer should work if ever needed
- determine whether billing/admin capabilities should be role strings, capability flags, or derived helpers

Until that design is complete, Owner authority should be documented as structural authority and Admin as the current implemented management role.

## Support / Platform-Owner Visibility

Support/platform-owner visibility is separate from tenant internal service roles.

Current support posture:

- owner console access is allowlist-gated
- support/call-log work is read-only or support-case scoped where documented
- no impersonation
- no tenant financial mutation
- no customer-facing portal exposure

Future support visibility may include:

- tenants using online payments
- failed payment signals
- webhook/payment exceptions
- payment readiness problems
- Stripe readiness state

Support/platform-owner financial visibility should remain read-only unless a separate platform support operation is explicitly designed with audit trail and least-privilege constraints.

## Deferred / Custom Permission UI Boundaries

Deferred until separately designed:

- custom permissions UI
- arbitrary per-user permission toggles
- Billing / AR role implementation
- read-only/auditor implementation
- estimator/sales implementation
- owner transfer flows
- support impersonation
- tenant-configurable technician payment collection
- external portal payment self-service

V1A should not grow into a general RBAC builder. The first goal is to protect sensitive financial surfaces with a small, understandable model.

## Future Implementation Slices

A. Model lock doc.

B. Define named role/capability helpers for:

- account owner authority
- admin authority
- financial register view
- manual payment recording
- payment metadata correction
- payment export
- Stripe/payment setup
- team/role management

C. Decide physical representation for Billing / AR before schema work:

- new role string
- capability flag
- membership metadata
- deferred/custom permissions model

D. Add server-side financial gates and tests to existing invoice/payment actions before broadening register work.

E. Gate read-only Billing Register / Payments Register page.

F. Gate manual payment field cleanup and payment register mutations.

G. Gate payment correction tools with required audit reason.

H. Gate Payments Register CSV/export routes.

I. Gate financial dashboard cards and failed payment signals.

J. Gate Stripe/payment setup and future platform/application fee controls.

K. Revisit recurring billing-period model only after financial access controls and allocation foundation are accepted.

## Documentation Cross-References

Related active docs:

- [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md)
- [Compliance_Matters_Payments_Roadmap.md](./Compliance_Matters_Payments_Roadmap.md)
- [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md)
- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md)

## Non-Implementation Boundary

This model spec created no implementation approval by itself.

No code changes, runtime behavior changes, schema changes, migrations, Supabase commands, RLS changes, Stripe API calls, env/secret changes, production changes, QBO work, recurring billing implementation, platform fee implementation, ACH UI, Billing Register UI, payment register mutation, allocation implementation, or financial export implementation are authorized by this spec.
