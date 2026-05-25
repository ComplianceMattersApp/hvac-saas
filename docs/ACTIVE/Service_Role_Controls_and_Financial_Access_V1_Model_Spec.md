# Service Role Controls / Financial Access Controls V1A Model Spec

Status: ACTIVE MODEL LOCK + IMPLEMENTATION VERIFIED (V1A-2 / V1A-3)
Owner lane: Service Role Controls / Financial Access Controls V1A
Scope: role/access authority model and implemented-access closeout for sensitive invoice/payment financial actions. Billing Register / Payments Register implementation remains separately gated.

## Purpose

Service Role Controls / Financial Access Controls V1A locks the authority model needed before Billing Register / Payments Register implementation becomes heavier.

The Financial Ledger / Payments Register V1 model established that Compliance Matters is tenant financial operating truth for all money received, while Stripe remains processor truth for Stripe transactions. That model creates new sensitive surfaces: payment register views, manual payment recording, payment correction, failed payment signals, exports, and financial dashboards. Those surfaces need source-of-truth authorization rules before implementation resumes.

This lane began as audit/model-first and now has implementation closeout for V1A-2 and V1A-3 financial access controls.

Implemented closeout summary:

- V1A-2 implemented centralized financial access helper and server-side gates for sensitive financial actions.
- V1A-3 implemented `billing` (Billing / AR) as a real internal role in app role model/parsers/UI.
- Financial authority is now Owner/Admin/Billing for sensitive financial actions listed below.
- Admin-only authority remains separate from Billing / AR authority.

Locked dependency rule:

- Financial Ledger / Payments Register implementation remains paused until existing financial access controls are accepted and no additional invoice-lifecycle gating is required for V1.
- Billing Register V1 UI, payment register mutations, payment correction tools, and broad financial dashboards remain blocked until that resume gate is explicitly accepted.

## Current Role Baseline

Current internal roles are simple:

- `admin`
- `office`
- `tech`
- `billing`

Current UI labels:

- `admin` = Admin
- `office` = Dispatcher
- `tech` / `technician` = Technician
- `billing` = Billing / AR

Current code posture observed in audit:

- `lib/auth/internal-user.ts` defines `InternalRole = "admin" | "office" | "tech" | "billing"`.
- `requireInternalUser()` enforces authenticated active internal user access.
- `requireInternalRole()` enforces coarse role gates where used.
- Team/invite/user-management actions are currently admin-only through `requireInternalRole("admin")`.
- Some job/admin operational actions allow admin/office.
- Many job, calendar, invoice, payment, and report actions currently require active internal user plus account scope, but do not yet distinguish financial access roles.
- `account_owner_user_id` is the structural account scope used across internal users, invoices, payments, reports, and operational records.
- Contractor/portal users are separate external actors and are redirected away from internal admin/report surfaces when detected.
- Platform-owner/support visibility uses explicit allowlist-style authority and is separate from tenant internal roles.

Known role-model limitations:

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

Billing / AR is now an implemented internal role in the app role model.

Current authority:

- Billing Register / Payments Register view
- manual off-platform payment recording
- payment metadata correction with audit reason
- financial register CSV export
- failed payment attempt visibility
- financial dashboard cards

Implementation note: no DB migration was required for role-string acceptance because `internal_users.role` is plain text with no role enum/check constraint.

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

Current block-by-default posture for sensitive financial actions:

- Dispatcher/office: blocked by default unless structural owner.
- Technician: blocked by default unless structural owner.
- Contractor/portal users: blocked.
- Inactive internal users: blocked.
- Unauthenticated users: blocked.

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

Currently protected server-side financial actions (implemented):

- manual internal invoice payment recording
- tenant customer payment-link / checkout-session creation
- invoice ledger CSV export

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

Billing Register / Payments Register work remains paused pending explicit resume gate acceptance.

Resume gate requirement:

- Existing financial access controls (Owner/Admin/Billing authority and default blocks) are accepted.
- No additional invoice-lifecycle gating is required for V1 resume.

Blocked until resume gate acceptance:

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

V1A-2 and V1A-3 implementation slices are complete for existing sensitive invoice/payment actions; Billing Register / Payments Register remains a separate resumed lane after the gate above is satisfied.

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
- read-only/auditor implementation
- estimator/sales implementation
- owner transfer flows
- support impersonation
- tenant-configurable technician payment collection
- external portal payment self-service

V1A should not grow into a general RBAC builder. The first goal is to protect sensitive financial surfaces with a small, understandable model.

## V1A Closeout And Next Slice

Completed:

- V1A-2 centralized helper and server-side gates for sensitive existing financial actions.
- V1A-3 Billing / AR role enablement in app role model/parsers/UI and authority grant in financial helper.

Next-slice decision gate (before Billing Register resume):

- confirm whether additional invoice lifecycle actions need Owner/Admin/Billing gating for V1:
	- create draft invoice
	- update invoice
	- issue invoice
	- void/cancel invoice
	- send/resend invoice email

After that decision, resume Billing Register / Payments Register V1 only through explicit gated implementation slices.

## Documentation Cross-References

Related active docs:

- [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md)
- [Compliance_Matters_Payments_Roadmap.md](./Compliance_Matters_Payments_Roadmap.md)
- [Financial_Ledger_Payments_Register_V1_Model_Spec.md](./Financial_Ledger_Payments_Register_V1_Model_Spec.md)
- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md)

## Non-Implementation Boundary

This model spec is now both authority model lock and implementation-closeout reference for V1A-2/V1A-3.

No schema changes, migrations, Supabase commands, RLS changes, Stripe API calls, env/secret changes, production changes, QBO work, recurring billing implementation, platform fee implementation, ACH UI, Billing Register UI, payment register mutation, or allocation implementation are authorized by this spec unless explicitly opened in a separate approved implementation slice.
