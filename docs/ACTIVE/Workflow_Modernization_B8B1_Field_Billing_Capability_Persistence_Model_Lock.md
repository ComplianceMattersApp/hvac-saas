# Compliance Matters Workflow Modernization B8-B1 Field Billing Capability Persistence Model Lock

## 1. Status / Authority / Scope

Status: MODEL LOCK / DOCS ONLY.

Authority: subordinate to:
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Workflow_Modernization_B8A_Invoice_Payment_Workspace_Field_First_UX_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B7_Field_Billing_Payments_Reconciliation_Closeout.md`
- `docs/ACTIVE/Workflow_Modernization_B7A_Authorized_Field_Invoice_Mode_Audit.md`
- `docs/ACTIVE/Workflow_Modernization_B7E_Field_Payment_Collection_Reconciliation_Audit.md`
- `docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md`

Scope: model-lock the smallest safe persistence foundation for per-user field billing/payment capabilities. This document authorizes no runtime implementation by itself.

This slice does not add schema, migrations, admin UI, payment behavior, Stripe/webhook behavior, invoice issue/send behavior, payment truth behavior, or global role expansion. It does not make technicians Admin or Billing.

## 2. Current Blocker

B8-B smoke requires a Technician or field user to report cash/check/other payment collection without becoming Admin or Billing.

The field billing resolver already accepts explicit capability input, but there is no persisted per-user capability source, no load helper, and no admin save action. Current runtime callsites resolve field billing capabilities from actor context and financial authority only; saved explicit capabilities are not loaded.

Current practical effect:
- Technician role alone remains read-only for field billing.
- Owner/Admin/Billing can use final-truth payment paths.
- A Technician cannot be granted `can_collect_field_payment` or `can_report_non_card_collection` through admin UI.
- Drawing admin checkboxes without persistence/read wiring would not unblock smoke.

## 3. Existing Capability Resolver Findings

`lib/auth/field-billing-access.ts` already defines a `FieldBillingCapabilities` contract and accepts `explicitCapabilities?: Partial<FieldBillingCapabilities>`.

Important current behavior:
- Owner/Admin/Billing and structural owner receive financial-authority defaults.
- Technician/office users without explicit capabilities get read-only billing summary visibility.
- Explicit `can_report_non_card_collection` grants field collection family access without granting final manual payment authority.
- Explicit `can_collect_card_payment` grants card collection access without granting issue/send or verification authority.
- Explicit `can_verify_non_card_collection` is separate and does not imply collection/reporting authority.
- Direct draft invoice capability, issue/send capability, payment collection/reporting, and verification remain separate.

Runtime gap:
- `resolveFieldBillingCapabilities` can honor explicit capabilities, but callsites do not currently load persisted explicit capabilities.
- No existing `internal_users` columns or companion table store these keys.
- Existing admin actions update role, active state, profile details, and time tracking only.

## 4. Persistence Options Considered

### Option A: Narrow Account-Scoped Capability Table

Example name: `internal_user_access_capabilities`.

Conceptual shape:
- `id uuid primary key default gen_random_uuid()`
- `account_owner_user_id uuid not null references auth.users(id)`
- `internal_user_id uuid not null references public.internal_users(user_id)`
- `capability_key text not null`
- `enabled boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `updated_by_user_id uuid null references auth.users(id)`

Recommended unique key:
- unique `(account_owner_user_id, internal_user_id, capability_key)`

Recommended indexes:
- `(account_owner_user_id, internal_user_id)`
- `(account_owner_user_id, capability_key) where enabled = true`

Pros:
- Clear audit trail at one row per capability.
- Easy allowlist constraint on `capability_key`.
- Easy admin UI: toggle rows on/off.
- Easy read helper: load enabled rows for one user/account and map to `Partial<FieldBillingCapabilities>`.
- Easy RLS: account-scoped select, Owner/Admin-only insert/update.
- Future expansion can add capability keys deliberately without changing `internal_users`.
- Disabling can update `enabled = false`; no delete is required.

Cons:
- Requires one additive table.
- Requires an upsert/save helper instead of a simple profile column update.

### Option B: JSONB Column on `internal_users`

Example column: `field_billing_capabilities jsonb not null default '{}'::jsonb`.

Pros:
- Fewer tables.
- Single-row read if `internal_users` is already loaded.
- Simple first implementation for a few booleans.

Cons:
- Weaker DB-level allowlist unless additional check functions are added.
- Harder to audit per-capability changes.
- Harder RLS posture because the mutable access policy shares the same row as role, active state, and account membership.
- Easier to accidentally mix unrelated future permissions into a blob.
- More awkward to query "who has non-card reporting enabled?"
- Mutation blast radius is larger because role/account membership and explicit capabilities live in the same row.

## 5. Recommended Model

Use a narrow account-scoped row-per-capability table: `internal_user_access_capabilities`.

Rationale:
- The repo already favors additive, account-scoped truth tables for grants and workflow state.
- Existing grant-style foundations, such as workflow handoff request grants, use explicit account scope, status, actor columns, invariant triggers, indexes, and RLS instead of embedding grants in unrelated owner rows.
- Field payment reports already use a dedicated table because workflow truth must stay separate from payment truth. Capability grants should follow the same separation principle and stay separate from role truth.
- The table keeps Technician role unchanged while allowing positive, explicit, per-user capability grants.
- The table prevents this B8-B smoke blocker from becoming a broad role-permission rewrite.

Initial implementation should support persisted explicit capabilities, but the first admin UI should expose only the field billing/payment toggles needed for B8-B smoke. Broader line-item, issue/send, proposal, or verification UI expansion should remain separate slices.

## 6. Capability Key Allowlist

Recommended table allowlist should be explicit and versioned through migrations. Unknown keys must be rejected.

Initial B8-B1/B8-B payment-management allowlist:
- `field_billing_enabled`
- `can_view_field_billing_summary`
- `can_collect_field_payment`
- `can_report_non_card_collection`
- `can_collect_card_payment`
- `can_verify_non_card_collection`

Recommended first admin UI exposed toggles:
- `Field payment collection` -> `can_collect_field_payment`
- `Report cash/check/other payment` -> `can_report_non_card_collection`
- `Collect card payment` -> `can_collect_card_payment`
- `Verify reported non-card payments` -> `can_verify_non_card_collection`

Recommended default for the B8-B smoke Technician:
- enabled: `field_billing_enabled`
- enabled: `can_view_field_billing_summary`
- enabled: `can_collect_field_payment`
- enabled: `can_report_non_card_collection`
- optional enabled: `can_collect_card_payment`
- disabled: `can_verify_non_card_collection`

Explicitly not included in the first payment-management UI:
- `can_issue_invoice`
- `can_send_invoice`
- final manual payment authority
- refund/reversal/export authority
- Admin/Billing role changes

Future allowlist expansion may include existing resolver keys for proposal and direct draft invoice authority, but that should be model-locked separately or added as a deliberately scoped migration slice.

## 7. Admin Management Rules

Management authority:
- Owner/structural account owner and Admin may manage per-user field billing/payment capability rows.
- Billing/AR should not manage team access by default because Billing is financial authority, not admin/team authority.
- Technician/office/dispatcher/contractor/portal users cannot manage capability rows.

Target rules:
- Target must be an active internal user in the same `account_owner_user_id`.
- No contractor, portal, support, or external user target is allowed.
- Saving capability rows must not update `internal_users.role`.
- Saving capability rows must not activate/deactivate users.
- Saving capability rows must not change invoice lifecycle authority.
- Saving verification authority should be visually distinct from collection/reporting authority because it can close a field report into final payment truth.

Recommended save behavior:
- One admin server action, for example `updateInternalUserFieldBillingCapabilitiesFromForm`.
- Action requires admin/team-management authority.
- Action loads and scope-checks target internal user.
- Action upserts allowed keys for the target.
- Disabled toggles update existing rows to `enabled = false`.
- Action records `updated_by_user_id = actorUserId`.
- Action revalidates `/ops`, `/ops/admin/users`, `/ops/admin/internal-users`, and the target detail page.

Recommended copy:
- `These permissions do not change the user's role.`
- `Reporting cash/check/other creates a Confirm Payment item unless the user has verification/final payment authority.`
- `Verification should be granted only to office or trusted financial reviewers.`

## 8. Runtime Read Rules

Add a read helper, for example `loadFieldBillingExplicitCapabilitiesForUser`.

Required input:
- Supabase/admin client.
- `accountOwnerUserId`.
- `internalUserId`.

Required behavior:
- Return `{}` when there is no target user id or account owner id.
- Load only rows where `account_owner_user_id` and `internal_user_id` match.
- Consider only `enabled = true` rows.
- Ignore unknown capability keys defensively even though DB should reject them.
- Return `Partial<FieldBillingCapabilities>`.
- Fail closed on read errors for runtime payment authority paths unless a migration-missing compatibility decision is explicitly made for local development.

Runtime callsite rule:
- Any page/action that currently calls `resolveFieldBillingCapabilities` for a real actor must load explicit capabilities for that active internal user and pass them as `explicitCapabilities`.
- Owner/Admin/Billing financial defaults remain unchanged.
- Saved explicit capabilities cannot grant final manual payment recording authority, refund/reversal/export authority, or Admin/Billing role.
- `can_report_non_card_collection` should enable the field report path only; it must not create final payment truth.
- `can_verify_non_card_collection` enables verification eligibility only where existing verification action gates also pass self-verification and account/invoice scope checks.

## 9. Security / RLS Requirements

Schema requirements:
- Table must be account-scoped by `account_owner_user_id`.
- `internal_user_id` must reference `public.internal_users(user_id)`.
- A trigger should assert that `internal_user_id` belongs to the same `account_owner_user_id`.
- `capability_key` must have a strict allowlist check.
- Unique `(account_owner_user_id, internal_user_id, capability_key)` prevents duplicate active/inactive rows for the same key.
- `updated_at` should use the standard `set_updated_at` trigger.

RLS requirements:
- Enable RLS.
- SELECT allowed to active internal users in the same account for admin/detail display and runtime reads, or more narrowly to Owner/Admin if runtime reads use service-role/admin client.
- INSERT/UPDATE allowed only to active account owner or Admin.
- DELETE should be absent initially; disabling is `enabled = false`.
- WITH CHECK must require same account scope, actor identity in `updated_by_user_id`, and allowed owner/admin actor.

Server-side requirements:
- Server actions must perform their own account-scope and authority checks even with RLS.
- Admin UI must not rely on hidden form inputs for authority.
- Tests must cover cross-account denial and role-preserving save behavior.

## 10. Implementation Sequence

Recommended first implementation sequence after this model lock:

1. Schema foundation for `internal_user_access_capabilities`.
2. Schema tests for columns, allowlist, same-account trigger, indexes, and RLS policies.
3. Read helper that loads enabled rows into `Partial<FieldBillingCapabilities>`.
4. Unit tests for read helper mapping, unknown-key ignore, disabled-row ignore, account scope, and missing-table/fail-closed posture.
5. Wire runtime capability resolver callsites to pass saved explicit capabilities.
6. Admin action to update only the initial field billing/payment capability keys.
7. Admin UI on `/ops/admin/users` or `/ops/admin/internal-users/[userId]` under `Field Billing Access` or `Payment Permissions`.
8. B8-B smoke grant for Technician:
   - enable `can_collect_field_payment`
   - enable `can_report_non_card_collection`
   - optionally enable `can_collect_card_payment`
   - leave `can_verify_non_card_collection` disabled
9. Return to B8-B field payment workspace smoke.

## 11. Test Plan

Schema/model tests:
- Defines `internal_user_access_capabilities` with account owner, internal user, key, enabled, timestamps, and updated-by fields.
- Enforces allowed capability keys.
- Enforces target internal user same-account invariant.
- Has no DELETE policy.
- Has Owner/Admin-only management policies.

Read helper tests:
- Maps enabled rows to `explicitCapabilities`.
- Ignores disabled rows.
- Ignores unknown keys defensively.
- Does not infer capabilities from Technician role alone.
- Does not grant final manual payment authority from explicit field reporting keys.

Admin action/UI tests:
- Owner/Admin can see field billing/payment capability controls for a Technician.
- Saving `can_collect_field_payment` and `can_report_non_card_collection` does not change `internal_users.role`.
- Permission controls do not submit the role update form.
- Role update still works only through the `Update Role` button.
- Verification toggle is present but disabled/off by default for a field collector smoke setup.

Runtime tests:
- Technician with saved `can_collect_field_payment` and `can_report_non_card_collection` gets field report authority.
- Technician without `can_verify_non_card_collection` cannot verify reported payments.
- Technician with report-only capability cannot collect card.
- Technician with card-only capability cannot report non-card.
- Owner/Admin/Billing final manual payment authority remains unchanged.
- Existing field billing access tests remain green.
- Invoice workspace saved-card/non-card reporting tests remain green.

## 12. Explicit Non-Actions

This B8-B1 model lock does not:
- implement the table
- add migrations
- add admin UI
- add server actions
- wire runtime callsites
- grant any real user permissions
- change payment truth behavior
- change Stripe/webhook behavior
- change invoice issue/send behavior
- broaden Technician role globally
- make field collectors Admin or Billing
- grant final manual payment authority
- grant refund, reversal, export, or correction authority
- add customer portal, SMS, QBO, or support-console behavior
- allow field-reported non-card money to count as paid before office confirmation
- allow a reporter to verify their own non-card report
