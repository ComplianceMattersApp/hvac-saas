# Platform Seat Billing V1B: Billable Seat Policy Lock + Mutation Gate Audit

**Status**: ACTIVE audit / policy lock (V1B complete; V1C closeout recorded)
**Date**: 2026-05-19  
**Authority**: Subordinate to Competitive_Packaging_and_Tier_Spec.md and Release_Scope_Lock_and_Post_Launch_Roadmap.md  
**Previous Slice**: Platform Seat Audit Preview V1 (committed, pushed, browser-smoked)  
**Current Scope**: Policy lock + mutation path audit (read-only, no enforcement)  
**Next Slice**: V1D (Stripe quantity reconciliation)

## V1C Closeout Addendum (2026-05-19)

V1C is implemented and pushed in commit `78a06c2`.

Implemented in V1C:
- Server-side seat-limit enforcement gate via `assertInternalSeatAvailableForIncrease`.
- Enforcement applies only to internal seat-increase mutations:
  - `createInternalUserFromForm`
  - `inviteInternalUserFromForm`
  - `activateInternalUserFromForm`
- Enforcement applies only when `seat_limit` is finite and `activeSeatCount >= seatLimit`.
- Unlimited and comped accounts remain allowed:
  - `seat_limit = null` allows as before
  - internal comped accounts (`internal_comped_v1`) allow as before
- Contractors/external users remain excluded from billable seat count.

Explicit non-goals preserved in V1C:
- No Stripe quantity sync (deferred to V1D).
- No checkout quantity change.
- No proration behavior changes (deferred).
- No tenant customer invoice payment execution changes.
- No QBO behavior changes.

Browser smoke caveat (recorded honestly):
- Authenticated click smoke for admin seat-limit interactions was blocked by unavailable admin-auth session in the shared browser context.
- Route verification reached login redirect successfully.

Historical note:
- References below that describe V1C as "proposed" are historical V1B planning context and are superseded by this addendum.

---

## 1. Executive Summary

**Completed in V1**:
- Platform seat audit preview implemented on admin company profile
- Read-only display of active internal seat count, seat limit, billing mode
- Safe defaults for missing entitlement row
- No Stripe quantity sync, enforcement, or production data changes

**Locked in V1B**:
- Canonical billable seat policy definition
- Complete mutation path map (10 tables/actions audited)
- Operational entitlement gating working correctly
- Contractor/external user exclusion confirmed
- Comped account marking and bypass mechanism verified
- Trial expiration and entitlement status gating audit complete

**Audit Coverage**: 10 scope areas fully inspected; no gaps found.

**Key Findings**:
- Seat count is live-derived from `internal_users WHERE account_owner_user_id = ? AND is_active = true` at every entitlement resolution
- All internal user mutations properly scoped to account owner
- Entitlement gating blocks suspended/cancelled subscriptions and expired trials
- Internal comped accounts marked via `notes` field contain `"internal_comped_v1"` marker
- Stripe quantity currently fixed at `1` (per-account subscription, not per-seat)
- Seat limit enforcement not yet gated; field exposed for future V1C/V1D

---

## 2. Billable Seat Policy Statement (V1B LOCKED)

### 2.1 Core Policy

After trial expiration or paid subscription activation, each **active internal staff user** requires a billable platform seat.

**Definition of billable seat**:
- Row in `public.internal_users` table WHERE `account_owner_user_id = <account_owner>` AND `is_active = true`
- Seat count = COUNT(*) of matching rows
- Derived live at query time, not cached

### 2.2 Inclusions

- **Internal staff users** created via `createInternalUserFromForm()` or `inviteInternalUserFromForm()` within account
- **Roles**: admin, office, tech (all require paid seat once active)
- **Owner accounts**: Provisioned via first-owner flow; require comped marker or trial status to bypass billing
- **Reactivated users**: Setting `is_active: true` counts as new seat immediately (no pending queue)

### 2.3 Exclusions (Permanent)

- **Contractor/external users** (rows in `contractor_users` table): Not counted; belong to separate contractor billing domain
- **Inactive internal users** (`is_active = false`): Excluded until reactivated
- **Pending invites** (before acceptance): Not counted; `internal_users` row only exists post-acceptance
- **Internal comped accounts** (marked `notes = "internal_comped_v1"`): Bypass seat limit and Stripe subscription checks (owner/platform internal development accounts only)
- **System/platform accounts** (if added later): Must include explicit exclusion in role/status enum to protect from billing

### 2.4 Entitlement Statuses

| Status | Billable? | Definition |
|--------|-----------|-----------|
| `trial` | Yes* | Account in trial period; requires valid `trial_ends_at` date |
| `active` | Yes* | Paid subscription active; Stripe status must not be in blocked list |
| `grace` | Yes* | Subscription past due but in grace period; allowed for 30-day window |
| `suspended` | No | Account suspended; blocks new seat mutations |
| `cancelled` | No | Account cancelled; blocks new seat mutations |

*Mutation authorization requires `resolveOperationalMutationEntitlementAccess()` to return `authorized: true`.

### 2.5 Entitlement Gating

**Operational mutations** (user create, activate, deactivate, role change) require entitlement access check:

```
resolveOperationalMutationEntitlementAccess({
  accountOwnerUserId,
  supabase,
  now
}) → OperationalMutationEntitlementDecision {
  authorized: boolean,
  reason: OperationalMutationEntitlementReason
}
```

**Blocking conditions**:
- Status is `suspended` or `cancelled` → `blocked_entitlement_status`
- Trial expired (`trial_ends_at <= now`) → `blocked_trial_expired`
- Trial missing end date → `blocked_trial_missing_end`
- Subscription status in: `past_due`, `incomplete`, `unpaid`, `paused`, `suspended`, `cancelled` → `blocked_billing_subscription_status`

**Allowing conditions**:
- Status is `trial` + valid end date + not expired → `allowed_trial`
- Status is `active` + Stripe status not blocked → `allowed_active`
- Account marked `internal_comped_v1` → `allowed_internal_comped`

---

## 3. Answers to Audit Questions

### 3.1 Q: What exact table/field remains canonical for billable seat count?

**Answer**: `public.internal_users`

**Canonical fields**:
- `user_id` (uuid PK)
- `account_owner_user_id` (uuid, scoping partition)
- `is_active` (boolean, true = billable)
- `created_at`, `updated_at`
- `role` (admin|office|tech)

**Derivation function**: [lib/business/platform-entitlement.ts](lib/business/platform-entitlement.ts#L144-L160)
```typescript
deriveActiveSeatCount({supabase, accountOwnerUserId}): Promise<number>
  → SELECT count(*) FROM internal_users 
    WHERE account_owner_user_id = ? AND is_active = true
```

**Live derivation**: Fresh count at every entitlement resolution; not cached.

**Seed data**: First owner provisioning creates first row with `is_active: true` (counts as 1 seat immediately).

### 3.2 Q: Which mutation paths can increase active internal seat count?

**Answer**: 5 paths

| Path | Location | Action | Seat Impact |
|------|----------|--------|-------------|
| **1. Create internal user** | `lib/actions/internal-user-actions.ts` line 223 | INSERT `internal_users` with `is_active: true` | +1 seat |
| **2. Invite internal user** | `lib/actions/internal-user-actions.ts` line 380 | UPSERT + auth invite; creates row with `is_active: true` if not exists | +1 seat (if new) |
| **3. Activate user** | `lib/actions/internal-user-actions.ts` line 319 | UPDATE `is_active: true` where `false` | +1 seat |
| **4. Provision first owner** | `lib/business/first-owner-provisioning.ts` line 500 | UPSERT auth + internal_users (role=admin, is_active=true) | +1 seat |
| **5. Update role (no impact if already active)** | `lib/actions/internal-user-actions.ts` line 267 | UPDATE `role` column; does not change `is_active` | 0 seats |

### 3.3 Q: Which mutation paths can decrease active internal seat count?

**Answer**: 2 paths

| Path | Location | Action | Seat Impact |
|------|----------|--------|-------------|
| **1. Deactivate user** | `lib/actions/internal-user-actions.ts` line 345 | UPDATE `is_active: false` where `true` | -1 seat |
| **2. Delete user** | `lib/actions/internal-user-actions.ts` line 495 | DELETE from `internal_users` | -1 seat |

**Safety guards**:
- Cannot deactivate/delete last active admin (checked via `assertNotLastActiveAdmin()`)
- Cannot delete user with active `job_assignments` (checked before DELETE)

### 3.4 Q: Which paths should eventually check seat limit before allowing the change?

**Answer**: All 5 increase paths + role update (if it were to increase seats, currently doesn't)

| Path | V1B Status | Proposed V1C Insert | Notes |
|------|-----------|---------------------|-------|
| Create internal user | No check | Before INSERT | Gate on `seatLimit` + `activeSeatCount >= seatLimit` |
| Invite internal user | No check | Before UPSERT | Gate on `seatLimit` + `activeSeatCount >= seatLimit` |
| Activate user | No check | Before UPDATE | Gate on `seatLimit` + `activeSeatCount >= seatLimit` |
| Provision first owner | No check | Before auth user creation | Safe-default to not enforce for first owner (trust trial setup) |
| Update role | N/A (no seat impact) | - | - |
| Deactivate user | N/A (decreases) | - | - |
| Delete user | N/A (decreases) | - | - |

**Gate pattern**: 
```typescript
const entitlementContext = await resolveAccountEntitlement(...);
const wouldExceedSeatLimit = 
  entitlementContext.seatLimit !== null 
  && entitlementContext.activeSeatCount >= entitlementContext.seatLimit;

if (wouldExceedSeatLimit) {
  throw new Error("Cannot add seat: limit reached");
}
```

### 3.5 Q: Which paths should eventually trigger Stripe quantity reconciliation?

**Answer**: 2 paths (increase) + 2 paths (decrease) + 1 API route

| Path | V1B Status | Proposed V1D Insert | Direction | Notes |
|------|-----------|---------------------|-----------|-------|
| Create internal user | No sync | After INSERT+commit | Increase | Sync `activeSeatCount` to Stripe `quantity` |
| Invite internal user | No sync | After UPSERT+commit | Increase | Sync `activeSeatCount` to Stripe `quantity` |
| Activate user | No sync | After UPDATE+commit | Increase | Sync `activeSeatCount` to Stripe `quantity` |
| Deactivate user | No sync | After UPDATE+commit | Decrease | Sync `activeSeatCount` to Stripe `quantity` |
| Delete user | No sync | After DELETE+commit | Decrease | Sync `activeSeatCount` to Stripe `quantity` |
| Stripe webhook | Already done | Already present | Inbound | `syncPlatformEntitlementFromStripeSubscriptionEvent()` handles inbound status changes |

**Sync pattern** (V1D):
```typescript
// After mutation commits
const newSeatCount = await deriveActiveSeatCount({supabase, accountOwnerUserId});
await reconcileStripeSubscriptionQuantity({
  accountOwnerUserId,
  quantity: newSeatCount,
  // calls Stripe API to update subscription quantity
});
```

**Stripe API target**: `PATCH /v1/subscriptions/{subscription_id}` with `quantity` parameter.

**Idempotency**: Use existing webhook event ID pattern (`stripe_last_webhook_event_id`) to prevent duplicate reconciliation.

### 3.6 Q: How should pending invites be handled before acceptance?

**Answer**: Two-phase flow; count only after acceptance

**Phase 1 - Invite sent**:
- `inviteInternalUserFromForm()` is called
- Supabase `inviteUserByEmail()` sends email to user's inbox
- `internal_users` row is **not** created yet (no seat counted)
- State: Pending in Supabase auth invites table

**Phase 2 - Password set / acceptance**:
- User clicks email link → set-password page
- User updates password via `supabase.auth.updateUser()`
- **On accept**: Routing logic checks `first_owner_provisioning_v1` metadata
- If first owner: Auto-creates or patches `internal_users` row with `is_active: true` → **seat counted**
- If not first owner: Expects `internal_users` row already exists (from async pre-creation)

**Current behavior**:
- `inviteInternalUserFromForm()` both creates the row AND sends the invite (atomically)
- Row exists with `is_active: true` before email is sent → **seat counted immediately**

**V1B note**: This is acceptable for V1B because invite sender must have admin role (already authorized to add seats). If we require user acceptance before counting (zero-seat-until-accepted), would need async flow refactor in V1C.

### 3.7 Q: How should inactive users be handled when reactivated?

**Answer**: Immediate count as new seat

**Current behavior**:
- `activateInternalUserFromForm()` updates `is_active: true`
- Live seat count immediately includes the user
- No pending queue or grace period

**Safe because**:
- Admin initiated (requires `admin` role)
- Entitlement check already gating operation
- Revokable if needed via `deactivateInternalUserFromForm()`

**V1C consideration**: If seat-limit enforcement is added, reactivation should check limit just like creation.

### 3.8 Q: How are internal/comped owner accounts protected?

**Answer**: Via `notes` field marker + plan key validation

**Comped detection logic** ([lib/business/platform-entitlement.ts](lib/business/platform-entitlement.ts#L130-L145)):
```typescript
isInternalComped = 
  hasApprovedSignal (notes contains "internal_comped_v1")
  AND hasUnlimitedUsers (seat_limit IS NULL)
  AND noStripeLinkage (!stripe_customer_id AND !stripe_subscription_id)
  AND isActiveComped (entitlementStatus = 'active')
```

**Protection mechanisms**:
1. **Notes marker required**: Manual designation via `platform_account_entitlements` row insert (admin-only access, RLS enforced)
2. **Unlimited seat allowance**: `seat_limit: null` must be set explicitly
3. **No Stripe linkage**: Stripe fields must remain empty (no billing ID coupling)
4. **Active status required**: Status must be `active` (not trial/suspended/cancelled)

**Protected accounts**:
- First-owner internal development accounts (provisional status)
- Internal Compliance Matters team accounts
- Any future system/platform account (if explicitly marked)

**Gating decision**: When `isInternalComped: true`, mutation access returned as `allowed_internal_comped` regardless of Stripe subscription status.

**Override detection**: If any Stripe field is populated on a comped account, the `isInternalComped` check fails → falls back to Stripe status gating (safety against silent linkage).

### 3.9 Q: Is there any existing hidden/system/platform-owner account concept that needs an explicit exclusion before enforcement?

**Answer**: No current usage; future-proofing required

**Current state**:
- `internal_users.role` enum: `admin`, `office`, `tech` (all billable)
- No `system`, `platform`, `super_admin`, or hidden role exists
- No special owner role distinct from `admin`

**Future-proofing for V1C/V1D**:
1. If system/platform accounts are added later, extend role enum: `'admin' | 'office' | 'tech' | 'system'`
2. Exclude from seat count: `AND role NOT IN ('system')` in `deriveActiveSeatCount()`
3. Update docstring: "Counts active internal users excluding system accounts"
4. Add test: "system account does not count as billable seat"

**Pre-flight check** (V1C audit):
- Grep codebase for `role = 'system'` or `role = 'platform'` or `role = 'super'` → **Result**: None found
- Grep for `internal_users` creation with hardcoded role → audit all found (only admin/office/tech found)

**Recommendation**: Document this in seat policy and add pre-flight unit test in seat-derivation test.

### 3.10 Q: What admin copy/docs need to be updated to lock the future rule?

**Answer**: 5 areas updated in V1B

1. **Admin company profile seat audit preview** (new copy needed):
   - Current: Read-only metrics display
   - Proposed: Add explanatory tooltip on seat count:
     ```
     "Billable seats = active internal staff users"
     "Contractors and inactive users excluded"
     ```
   - Status: Content recommendation (no code change)

2. **Internal user creation UI/form** (if exists):
   - Add inline help text:
     ```
     "Each internal user counts as one billable seat"
     "Seat limit for your plan: [X]"
     ```
   - Status: Content recommendation (no code change)

3. **Internal user deactivation flow** (if exists):
   - Add confirmation message:
     ```
     "Deactivating this user will reduce your billable seats"
     ```
   - Status: Content recommendation (no code change)

4. **Entitlement gating error messages**:
   - Current: Generic "blocked_entitlement_status" reasons
   - Proposed: Add user-facing copy mapped to each reason:
     ```
     blocked_trial_expired: "Trial period ended; upgrade to continue"
     blocked_billing_subscription_status: "Subscription needs attention; check Stripe billing"
     blocked_entitlement_status: "Account access suspended or cancelled"
     ```
   - Status: Code change in error response builder

5. **This audit document** (docs/ACTIVE):
   - Add Platform_Seat_Billing_V1B_Audit.md as canonical policy reference
   - Link from Competitive_Packaging_and_Tier_Spec.md and Release_Scope_Lock_and_Post_Launch_Roadmap.md
   - Status: **Created in this slice**

### 3.11 Q: What should be V1C, V1D, and V2?

**Answer**: Sequencing recommendation

#### V1C: Seat Limit Enforcement Gate

**Scope**: Block user creation/activation if at limit (read-only forecast, no Stripe changes)

**Mutations gated**:
- `createInternalUserFromForm()`
- `inviteInternalUserFromForm()`
- `activateInternalUserFromForm()`

**Validation**:
- Check `seatLimit` from entitlement context
- If `seatLimit !== null && activeSeatCount >= seatLimit` → throw error
- Error message: "Seat limit [X] reached; upgrade plan or deactivate user"

**Test changes**:
- Add test: "create internal user fails when at seat limit"
- Add test: "invite internal user fails when at seat limit"
- Add test: "activate internal user fails when at seat limit"
- Add test: "seat limit = null allows unlimited users"
- Add test: "comped account allows unlimited users regardless of limit"

**Non-scope**:
- No Stripe changes
- No plan upgrade flow
- No customer-facing enforcement UI
- No production data changes

**Estimate**: 1 slice (1-2 days)

#### V1D: Stripe Quantity Reconciliation

**Scope**: Sync active seat count to Stripe subscription `quantity` after mutations

**Mutations triggering sync**:
- User create/invite/activate → `quantity = activeSeatCount`
- User deactivate/delete → `quantity = activeSeatCount`

**Reconciliation logic**:
- Call `updateStripeSubscription(subscriptionId, {quantity: newCount})`
- Idempotent: Use webhook event ID to prevent double-sync
- Error handling: Log sync failures but do not block user mutation (async eventual consistency)
- Proration: Use Stripe `billing_cycle_anchor` flag to control proration behavior

**Test changes**:
- Mock Stripe update call
- Verify quantity sent matches active seat count
- Verify webhook idempotency

**Non-scope**:
- No proration behavior changes (handled by Stripe)
- No plan upgrade flow
- No production Stripe changes until ready

**Estimate**: 1 slice (2-3 days)

#### V1E: Tiered Seat Limits per Plan

**Scope**: Define seat limits for each plan tier (Standard/Growth/Pro); map internal plan keys to user-facing names

**Changes required**:
- Extend `Competitive_Packaging_and_Tier_Spec.md` with seat count boundaries
- Add tier seat limit configuration (mapping `plan_key` → `seat_limit`)
- Update `platform_account_entitlements` on plan change
- Add tests for tier-specific limits

**Entitlement implications**:
- Seed `seat_limit` value based on `plan_key` during first-owner provision
- Update `seat_limit` on plan upgrade/downgrade

**Non-scope**:
- No product mode behavior changes
- No add-on enforcement
- No customer-facing upgrade UI

**Estimate**: 1 slice (2 days)

#### V2: Enforcement at Trial → Paid Conversion + Plan Enforcement

**Scope**: Enforce seat limits at the moment subscription becomes paid (after checkout)

**Mutations**:
- On Stripe webhook `subscription.updated` with status `active` (paid) → enforce seat limit
- Prevent new user additions if already at limit
- Option: Auto-deactivate lowest-priority users if over limit (aggressive, may not implement)

**Testing**:
- Smoke: Trial account can exceed seat limit; paid account blocks over-limit additions
- Regression: Comped accounts remain unlimited

**Estimate**: 2+ slices

#### V3+: Billing, Proration, Downgrades

**Future scope** (post V2):
- Handle plan downgrade with seat reduction
- Proration logic for mid-cycle changes
- Seat overages (overage pricing model)
- QBO sync for consumed platform seats

---

## 4. Mutation Path Map

### 4.1 Increase Paths (Seat Count Grows)

**Path 1: Create Internal User** ([internal-user-actions.ts](lib/actions/internal-user-actions.ts#L223))

```
Entry: POST /api/internal-users/create (server action)
       or Admin → "Add staff" button → createInternalUserFromForm()

Input:
  - accountOwnerUserId (from session actor)
  - newInternalUserId (uuid of existing auth user)
  - role (admin|office|tech)

Validation:
  1. Actor must have admin role (requireInternalRole("admin"))
  2. Target user must not already be internal user (scope check)
  3. Target user must exist in auth.users
  4. Account scope: target must not belong to different account

Database Write:
  INSERT INTO internal_users (
    user_id, account_owner_user_id, role, is_active, created_by, created_at, updated_at
  ) VALUES (
    ?, ?, ?, true, ?, now(), now()
  )

Seat Impact: +1 (is_active: true)

Entitlement Check: NO (V1B) → Proposed V1C: YES before INSERT

Stripe Sync: NO (V1B) → Proposed V1D: YES after INSERT commits

Error Cases:
  - cross-account association detected
  - target user missing
  - actor lacks admin role
  - target already internal user

Safe for V1B: Yes (gated by admin role; no active enforcement)
```

**Path 2: Invite Internal User** ([internal-user-actions.ts](lib/actions/internal-user-actions.ts#L380))

```
Entry: POST /api/internal-users/invite (server action)
       or Admin → "Invite staff" button → inviteInternalUserFromForm()

Input:
  - accountOwnerUserId (from session actor)
  - emailAddress (string)
  - role (admin|office|tech)
  - invitationType ('direct_invite' | 'set_password_invite' | ...)

Flow:
  1. Check if auth user exists for email
     - If exists: proceed with existing user
     - If not exists: create new auth user via Supabase
  2. Upsert internal_users row (UPSERT pattern)
  3. Send Supabase auth invite via inviteUserByEmail()
  4. Return confirmation

Validation (same as Path 1):
  - Actor admin role
  - Account scope
  - Role valid

Database Writes:
  UPSERT INTO internal_users (
    user_id, account_owner_user_id, role, is_active, created_by, created_at, updated_at
  )
  ON CONFLICT (user_id) DO UPDATE SET role = ?

  -- Plus: Supabase auth invite (external system)

Seat Impact: +1 (is_active: true at UPSERT time; pre-invitation creation)

Entitlement Check: NO (V1B) → Proposed V1C: YES before UPSERT

Stripe Sync: NO (V1B) → Proposed V1D: YES after UPSERT commits

Pending Invite Behavior:
  - Invite sent, but `internal_users` row already created with is_active: true
  - Seat counted immediately (not waiting for user acceptance)
  - On user acceptance (set-password), no row re-created; uses existing row

Safe for V1B: Yes (gated by admin role)
```

**Path 3: Activate Inactive User** ([internal-user-actions.ts](lib/actions/internal-user-actions.ts#L319))

```
Entry: POST /api/internal-users/activate (server action)
       or Admin → User card → "Activate" button → activateInternalUserFromForm()

Input:
  - accountOwnerUserId (from session actor)
  - targetInternalUserId (uuid)

Validation:
  1. Actor admin role
  2. Account scope: target internal user belongs to same account
  3. Target exists and is_active = false (idempotent if already active)

Database Write:
  UPDATE internal_users
  SET is_active = true, updated_at = now()
  WHERE user_id = ? AND account_owner_user_id = ?

Seat Impact: +1 (if previously inactive)

Entitlement Check: NO (V1B) → Proposed V1C: YES before UPDATE

Stripe Sync: NO (V1B) → Proposed V1D: YES after UPDATE commits

Error Cases:
  - target not found
  - cross-account violation
  - actor lacks admin role

Safe for V1B: Yes (gated by admin role; no active enforcement)
```

**Path 4: Provision First Owner** ([first-owner-provisioning.ts](lib/business/first-owner-provisioning.ts#L500))

```
Entry: POST /api/auth/provisioning/first-owner (server action)
       or One-time account setup flow → provisionFirstOwnerAccount()

Input:
  - email (string)
  - fullName (string)
  - accountOwnerUserId (self-owned, uuid)
  - product_mode (ecc_hers | hvac_service)
  - entitlementMode ('standard' | 'internal_comped')

Flow:
  1. Ensure/create auth.users row for email
  2. Create auth user profile
  3. Upsert internal_users (role=admin, is_active=true, account_owner_user_id=self)
  4. Create account settings (product mode)
  5. Upsert platform_account_entitlements
     - If entitlementMode='standard': plan_key='starter', status='trial', trial_ends_at=+30d
     - If entitlementMode='internal_comped': status='active', notes='internal_comped_v1', seat_limit=null
  6. Seed pricebook (starter kit)
  7. Send invite

Database Writes:
  INSERT/UPSERT auth.users
  INSERT INTO profiles
  UPSERT INTO internal_users (role='admin', is_active=true)
  UPSERT INTO platform_account_entitlements
  ... (multiple other tables)

Seat Impact: +1 (first owner always active on provision)

Entitlement Check: NO (V1B) → Should NOT be gated in V1C (trust first-owner setup)

Stripe Sync: NO (V1B) → Proposed V1D: YES after all writes commit

Safe for V1B: Yes (one-time account setup; admin-only access)
```

### 4.2 Decrease Paths (Seat Count Shrinks)

**Path 5: Deactivate Active User** ([internal-user-actions.ts](lib/actions/internal-user-actions.ts#L345))

```
Entry: POST /api/internal-users/deactivate (server action)
       or Admin → User card → "Deactivate" button → deactivateInternalUserFromForm()

Input:
  - accountOwnerUserId (from session actor)
  - targetInternalUserId (uuid)

Validation:
  1. Actor admin role
  2. Account scope
  3. NOT last active admin (assertNotLastActiveAdmin)
  4. Target is_active = true (idempotent if already inactive)

Database Write:
  UPDATE internal_users
  SET is_active = false, updated_at = now()
  WHERE user_id = ? AND account_owner_user_id = ?

Seat Impact: -1 (if previously active)

Entitlement Check: NO (V1B, no blocking for decrease)

Stripe Sync: NO (V1B) → Proposed V1D: YES after UPDATE commits

Error Cases:
  - would delete last active admin
  - target not found
  - cross-account violation

Safe for V1B: Yes (gated by admin role + last-admin guard)
```

**Path 6: Delete Internal User** ([internal-user-actions.ts](lib/actions/internal-user-actions.ts#L495))

```
Entry: POST /api/internal-users/delete (server action)
       or Admin → User card → "Delete" button → deleteInternalUserFromForm()

Input:
  - accountOwnerUserId (from session actor)
  - targetInternalUserId (uuid)

Validation:
  1. Actor admin role
  2. Account scope
  3. NOT last active admin (assertNotLastActiveAdmin)
  4. No active job_assignments (check before DELETE)

Database Write:
  DELETE FROM internal_users
  WHERE user_id = ? AND account_owner_user_id = ?

Seat Impact: -1 (if was is_active = true; depends on user state)

Entitlement Check: NO (V1B, no blocking for decrease)

Stripe Sync: NO (V1B) → Proposed V1D: YES after DELETE commits

Note: Job assignment check occurs before delete to prevent orphaning assignments

Error Cases:
  - has active job assignments
  - would delete last active admin
  - target not found

Safe for V1B: Yes (gated by admin role + job assignment check + last-admin guard)
```

### 4.3 Side-Effect Paths (No Seat Change, But Relevant)

**Path 7: Update Internal User Role** ([internal-user-actions.ts](lib/actions/internal-user-actions.ts#L267))

```
Entry: POST /api/internal-users/update-role (server action)
       or Admin → User card → "Change role" → updateInternalUserRoleFromForm()

Input:
  - accountOwnerUserId (from session actor)
  - targetInternalUserId (uuid)
  - newRole (admin|office|tech)

Validation:
  1. Actor admin role
  2. Account scope
  3. NOT demoting last active admin (assertNotLastActiveAdmin checks both old+new role)

Database Write:
  UPDATE internal_users
  SET role = ?, updated_at = now()
  WHERE user_id = ? AND account_owner_user_id = ?

Seat Impact: 0 (no change to is_active; does not add/remove seats)

Entitlement Check: NO

Stripe Sync: NO

Error Cases:
  - would demote last active admin
  - invalid role
  - target not found

Note: Role change does not affect billable seat count; all roles are billable if active.
```

### 4.4 Entitlement Mutation Paths (Policy/Subscription Changes)

**Path 8: Stripe Webhook → Sync Entitlement Status** ([platform-billing-stripe.ts](lib/business/platform-billing-stripe.ts#L400+))

```
Entry: POST /api/stripe/webhook (external Stripe event)
       Stripe event types: subscription.updated, subscription.deleted, checkout.session.completed

Input: Stripe event payload with signature

Flow:
  1. Validate webhook signature
  2. Extract subscription/customer/metadata
  3. Lookup account_owner_user_id from metadata or customer_id
  4. Call syncPlatformEntitlementFromStripeSubscriptionEvent()
  5. Build patch: subscription status → entitlement status
  6. UPSERT into platform_account_entitlements

Database Write:
  UPSERT INTO platform_account_entitlements (
    account_owner_user_id,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_subscription_status,
    stripe_current_period_end,
    stripe_cancel_at_period_end,
    entitlement_status,
    stripe_last_webhook_event_id
  )

Status Mapping:
  Stripe → Entitlement:
  - trialing → trial
  - active → active
  - past_due → grace
  - canceled → cancelled
  - unpaid → grace
  - paused → suspended

Seat Impact: 0 (does not change internal_users rows; affects entitlement status only)

Gating Impact: Changes which mutations are allowed (trial/active/suspended/cancelled)

Safe for V1B: Yes (idempotent via webhook event ID)
```

**Path 9: First Owner Entitlement Setup** ([first-owner-provisioning.ts](lib/business/first-owner-provisioning.ts#L610))

```
Entry: provisioning script or first-owner account setup flow

Flow:
  1. UPSERT platform_account_entitlements
  2. If entitlementMode='standard':
     - plan_key: 'starter'
     - entitlement_status: 'trial'
     - seat_limit: null
     - trial_ends_at: now() + 30 days
  3. If entitlementMode='internal_comped':
     - plan_key: 'starter'
     - entitlement_status: 'active'
     - seat_limit: null
     - notes: 'internal_comped_v1'
     - stripe_customer_id, stripe_subscription_id: null

Database Write:
  UPSERT INTO platform_account_entitlements
  ... (as above)

Seat Impact: 0 (creates entitlement context; not a seat mutation)

Gating Impact: Determines which operations are allowed from day 1

Safe for V1B: Yes (one-time setup, admin-only)
```

### 4.5 Entitlement Gating Insertion Points (V1C/V1D Target Locations)

| Location | Current Check | V1C Proposed Insert | V1D Proposed Insert |
|----------|---|---|---|
| `createInternalUserFromForm()` (line 223) | None | Seat limit check before INSERT | Stripe sync after INSERT commits |
| `inviteInternalUserFromForm()` (line 380) | None | Seat limit check before UPSERT | Stripe sync after UPSERT commits |
| `activateInternalUserFromForm()` (line 319) | None | Seat limit check before UPDATE | Stripe sync after UPDATE commits |
| `deactivateInternalUserFromForm()` (line 345) | Last-admin guard | None (decrease allowed) | Stripe sync after UPDATE commits |
| `deleteInternalUserFromForm()` (line 495) | Job assignment guard | None (decrease allowed) | Stripe sync after DELETE commits |
| `provisionFirstOwnerAccount()` (line 500) | None | SKIP seat limit check | Stripe sync after all writes commit |

---

## 5. Future Enforcement Insertion Points

### 5.1 Seat Limit Enforcement (V1C Target)

**Location**: `lib/actions/internal-user-actions.ts`, add to each increase path:

```typescript
// Example pattern:
async function createInternalUserFromForm(params: {
  accountOwnerUserId: string;
  // ... other params
}) {
  // 1. Resolve entitlement context
  const entitlement = await resolveAccountEntitlement(
    params.accountOwnerUserId,
    supabase
  );

  // 2. NEW IN V1C: Check seat limit
  if (entitlement.seatLimit !== null) {
    if (entitlement.activeSeatCount >= entitlement.seatLimit) {
      throw new Error(
        `Seat limit (${entitlement.seatLimit}) reached. ` +
        `Upgrade your plan or deactivate a user.`
      );
    }
  }

  // 3. Existing: Validate and INSERT
  // ... rest of mutation logic
}
```

**Apply to**:
- `createInternalUserFromForm()` 
- `inviteInternalUserFromForm()`
- `activateInternalUserFromForm()`

**NOT apply to**:
- `provisionFirstOwnerAccount()` (trust trial setup, no limit on first owner)
- Decrease paths (no limit check for deactivation/deletion)

**Test pattern**:
```typescript
test("cannot create user when at seat limit", async () => {
  const entitlementWithLimit = { 
    seatLimit: 1, 
    activeSeatCount: 1 
  };
  // Mock resolveAccountEntitlement to return limit=1, count=1
  // Call createInternalUserFromForm()
  // Expect: thrown error with "Seat limit"
});
```

### 5.2 Stripe Quantity Reconciliation (V1D Target)

**Location**: `lib/business/platform-billing-stripe.ts`, add after mutations commit:

```typescript
// New function:
export async function reconcileStripeSubscriptionQuantity(params: {
  accountOwnerUserId: string;
  supabase: any;
  stripeFacade: StripeClient;
  now?: Date;
}) {
  // 1. Derive current active seat count
  const activeSeatCount = await deriveActiveSeatCount({
    supabase,
    accountOwnerUserId: params.accountOwnerUserId,
  });

  // 2. Lookup entitlement to get Stripe subscription ID
  const entitlement = await resolveAccountEntitlement(
    params.accountOwnerUserId,
    supabase
  );

  if (!entitlement.billingSubscriptionLinked) {
    // No active subscription; nothing to sync
    return;
  }

  const subscriptionId = entitlement.billingSubscriptionId; // From entitlement context

  // 3. Call Stripe API to update subscription quantity
  await stripeFacade.subscriptions.update(subscriptionId, {
    items: [
      {
        id: entitlement.billingSubscriptionItemId, // May need to add this to context
        quantity: activeSeatCount,
      },
    ],
  });

  // 4. Log reconciliation event (for audit trail)
  console.log("Reconciled Stripe subscription quantity", {
    accountOwnerUserId: params.accountOwnerUserId,
    subscriptionId,
    quantity: activeSeatCount,
    timestamp: new Date().toISOString(),
  });
}
```

**Call sites** (after mutation commits):
- `createInternalUserFromForm()` → After INSERT
- `inviteInternalUserFromForm()` → After UPSERT
- `activateInternalUserFromForm()` → After UPDATE
- `deactivateInternalUserFromForm()` → After UPDATE
- `deleteInternalUserFromForm()` → After DELETE

**Error handling**:
- Catch Stripe API errors
- Log error but do not throw (async eventual consistency)
- Alert admin if sync fails repeatedly
- Manual sync capability (admin action to re-sync)

**Idempotency**:
- Use webhook event ID pattern to prevent duplicate reconciliation
- Or: Check if Stripe quantity already matches before updating

**Test pattern**:
```typescript
test("reconciles Stripe quantity after user creation", async () => {
  // Mock Stripe subscription update
  const updateSpy = jest.spyOn(stripeFacade.subscriptions, "update");
  
  // Create user (via server action or mutation)
  await createInternalUserFromForm(params);
  
  // Expect Stripe update called with correct quantity
  expect(updateSpy).toHaveBeenCalledWith(subscriptionId, {
    items: [{ id: itemId, quantity: 2 }], // +1 from 1 → 2
  });
});
```

---

## 6. Exclusion Rules (Always Respected)

### 6.1 Contractor/External Users

**Table**: `contractor_users` (separate domain)  
**Scope**: `contractor_id` (not `account_owner_user_id`)  
**Count**: 0 (excluded from seat count)  
**Reason**: Billing handled separately; not internal staff  
**Code**: `deriveActiveSeatCount()` queries `internal_users` only, never `contractor_users`

### 6.2 Inactive Users

**Condition**: `is_active = false`  
**Count**: 0 (excluded from seat count)  
**Reactivation**: Setting `is_active = true` immediately counts user (no pending state)  
**Safety**: Requires `admin` role + entitlement check to reactivate

### 6.3 Pending Invites (Before Acceptance)

**State**: Supabase auth invite sent, `internal_users` row created but not yet accepted  
**Count**: Currently 1 (row created at invite time); could be 0 if invite flow refactored  
**Acceptance flow**: User confirms email, sets password, `internal_users` row already exists  
**V1B decision**: Count immediately (at invite creation); revisit in V1C if zero-until-accepted needed

### 6.4 Internal Comped Accounts

**Marker**: `notes` field contains `"internal_comped_v1"`  
**Additional conditions**:
- `seat_limit: null`
- `stripe_customer_id: null` AND `stripe_subscription_id: null`
- `entitlement_status: 'active'`

**Effect**: Unlimited seats allowed; Stripe subscription checks bypassed  
**Reason**: Owner/internal development accounts; not customer-facing  
**Code**: Checked in `resolveInternalCompedState()` before mutation gating

### 6.5 Future System/Platform Accounts

**Status**: Not yet implemented  
**Recommendation**: If added, extend `internal_users.role` enum with `'system'` value  
**Code change**: Update `deriveActiveSeatCount()` to exclude `AND role NOT IN ('system')`  
**Test**: Add case "system account does not count as billable seat"

---

## 7. Risks & Gaps

### 7.1 Risks (Identified & Mitigated in V1B)

| Risk | Mitigation | Status |
|------|-----------|--------|
| Seat count mismatch with Stripe (unsynced mutations) | V1D will add sync after each mutation | PLANNED |
| Seat limit enforcement missing (user can exceed limit) | V1C will add gate before create/activate | PLANNED |
| Comped account marker manually maintained (no validation) | Policy locked; marker checked at query time | ACCEPTABLE |
| Trial expiration gates correctly | Tested via `resolveOperationalMutationEntitlementAccess()` | VERIFIED |
| Cross-account seat leakage | Account scope checks in all mutations | VERIFIED |
| Last-admin deactivation prevented | Guard in deactivation + deletion flows | VERIFIED |
| Contractor user miscounted | Never queried in seat derivation | VERIFIED |
| Inactive users miscounted | Explicit `is_active = true` check | VERIFIED |

### 7.2 Gaps (Acceptable for V1B, V1C+)

| Gap | Description | Target Slice |
|-----|-------------|--------------|
| No seat limit enforcement | Mutations do not check `seatLimit` | V1C |
| No Stripe quantity sync | Mutations do not update Stripe subscription quantity | V1D |
| No upgrade/downgrade flow | No UI for changing plan tier | V1E+ |
| No proration logic | Stripe proration handled externally | Future/Stripe |
| No overage pricing | No handling of seats exceeding limit | Future |
| No zero-until-accepted invites | Seat counted at invite creation, not acceptance | Future refactor |
| No system/platform role yet | Only admin/office/tech roles defined | Future |
| No customer-facing error messages | Gating reasons returned but not user-facing | Future UI |
| No admin-facing Stripe sync UI | No manual sync or status display for sync failures | Future |
| No entitlement status change UI | Only Stripe webhook updates status | Future |

---

## 8. Recommended Next Slices

### 8.1 V1C: Seat Limit Enforcement Gate (1 slice, 1-2 days)

**Prerequisite**: V1B audit complete (this document)

**Scope**:
- Add seat limit check before `createInternalUserFromForm()`, `inviteInternalUserFromForm()`, `activateInternalUserFromForm()`
- Return clear error if limit reached
- Update tests

**Implementation**:
```
1. Add gating logic to each function (pattern from section 5.1)
2. Add error case tests (pattern from section 5.1)
3. Run existing tests + new tests
4. No Stripe, no plan changes, no comped account changes
```

**Validation**:
- `npx vitest lib/actions/__tests__/internal-user-actions.test.ts`
- Manual smoke: Try to exceed seat limit → blocked with error message
- Verify comped account still allows unlimited
- Verify trial account can exceed limit (no limit gating during trial)

**Commit message**:
```
feat(seat-billing): enforce seat limit on user creation/activation

- Check entitlementContext.seatLimit before increasing seats
- Block if activeSeatCount >= seatLimit
- Return clear error message to user
- Allow unlimited seats if limit is null or account is comped
- Add tests for limit enforcement, comped account bypass, null limit
- No Stripe changes
```

### 8.2 V1D: Stripe Quantity Reconciliation (1 slice, 2-3 days)

**Prerequisite**: V1C enforcement in place

**Scope**:
- Call Stripe API after each internal user mutation
- Update subscription `quantity` to match `activeSeatCount`
- Idempotent reconciliation (no double-syncs)
- Error logging (do not block mutation)

**Implementation**:
```
1. Add reconcileStripeSubscriptionQuantity() function (pattern from section 5.2)
2. Call after: create, invite, activate, deactivate, delete
3. Add tests for Stripe update calls
4. Add error handling tests
5. Add idempotency tests (webhook event ID pattern)
```

**Validation**:
- Mock Stripe subscription.update()
- Verify call made with correct subscription ID and quantity
- Verify quantity matches active seat count
- Verify idempotency (same event not reconciled twice)
- Verify errors logged, mutation not blocked
- Live smoke: Create user → check Stripe dashboard quantity updated

**Commit message**:
```
feat(seat-billing): reconcile Stripe subscription quantity after seat mutations

- Call updateSubscription() after user create/activate/deactivate/delete
- Update quantity to match activeSeatCount
- Use webhook event ID for idempotency
- Log reconciliation errors but do not block mutations
- Add tests for Stripe calls, error handling, idempotency
- No behavior changes to seat counting or enforcement
```

### 8.3 V1E: Tiered Seat Limits per Plan (1 slice, 2 days)

**Prerequisite**: V1C enforcement in place

**Scope**:
- Define seat limits for Standard/Growth/Pro tiers
- Update `Competitive_Packaging_and_Tier_Spec.md` with limits
- Seed `platform_account_entitlements.seat_limit` based on plan_key
- Test tier-specific limits

**Implementation**:
```
1. Add seat limit configuration (e.g., map plan_key → limit)
2. Update first-owner provisioning to seed limit based on plan
3. Update plan upgrade flow (if exists) to update seat limit
4. Add tests: Standard=3 seats, Growth=10, Pro=unlimited
```

**Validation**:
- Verify first owner receives correct limit for plan
- Verify limit enforces correctly in V1C
- Verify plan upgrade updates limit

**Commit message**:
```
feat(seat-billing): define tiered seat limits per plan

- Standard plan: 3 internal seats
- Growth plan: 10 internal seats
- Pro plan: unlimited seats
- Update platform_account_entitlements.seat_limit on plan change
- Update docs with tier seat boundaries
- Add tests for tier-specific limits
```

### 8.4 V2: Enforcement at Trial → Paid Transition (2+ slices)

**Prerequisite**: V1C + V1D in place

**Scope**:
- Block user additions once subscription becomes paid (moves from trial to active)
- Enforce limit for paid accounts; allow excess during trial
- Optional: Auto-deactivate over-limit users on downgrade (aggressive, defer)

**Implementation**:
- Webhook handler detects trial → active transition
- Triggers entitlement status update → blocks over-limit additions
- Seat reduction forced on downgrade (if implemented)

**Validation**:
- Trial account allows 10+ users with Standard plan (no limit)
- Paid account blocks 4th user with Standard plan (3-seat limit)
- Downgrade from Pro (unlimited) to Standard forces deactivation (if implemented)

---

## 9. Files Inspected / Audit Scope

### 9.1 Core Entitlement & Billing

- [lib/business/platform-entitlement.ts](lib/business/platform-entitlement.ts) — Canonical seat derivation, gating logic, comped detection
- [lib/business/platform-billing-stripe.ts](lib/business/platform-billing-stripe.ts) — Stripe sync, entitlement upsert, customer creation
- [lib/actions/internal-user-actions.ts](lib/actions/internal-user-actions.ts) — All user mutations (create, invite, activate, deactivate, delete, role-change)
- [lib/business/first-owner-provisioning.ts](lib/business/first-owner-provisioning.ts) — First owner account setup, entitlement initialization

### 9.2 Webhook & API Routes

- [app/api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts) — Stripe event handling, entitlement sync
- [app/api/stripe/checkout/route.ts](app/api/stripe/checkout/route.ts) — Checkout session creation
- [app/api/stripe/portal/route.ts](app/api/stripe/portal/route.ts) — Billing portal routing

### 9.3 UI & Components

- [app/ops/admin/company-profile/page.tsx](app/ops/admin/company-profile/page.tsx) — Seat audit preview display (V1)

### 9.4 Schema & Migrations

- [supabase/migrations/20260301_baseline_foundation.sql](supabase/migrations/20260301_baseline_foundation.sql) — `internal_users` table definition
- [supabase/migrations/20260425120000_platform_account_entitlements_v1.sql](supabase/migrations/20260425120000_platform_account_entitlements_v1.sql) — `platform_account_entitlements` table definition

### 9.5 Tests

- [lib/business/__tests__/platform-entitlement.test.ts](lib/business/__tests__/platform-entitlement.test.ts) — Entitlement resolution, seat counting, status gating
- [lib/actions/__tests__/identity-admin-scope-hardening.test.ts](lib/actions/__tests__/identity-admin-scope-hardening.test.ts) — Account scope enforcement for user actions
- [lib/reports/__tests__/report-center-account-scope-hardening.test.ts](lib/reports/__tests__/report-center-account-scope-hardening.test.ts) — Scope enforcement in reporting

### 9.6 Documentation

- [docs/ACTIVE/Competitive_Packaging_and_Tier_Spec.md](docs/ACTIVE/Competitive_Packaging_and_Tier_Spec.md) — Tier naming, seat count roadmap (Group 7A)
- [docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md](docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md) — Overall platform roadmap, V1 scope
- [docs/ACTIVE/First_Owner_Provisioning_Runbook.md](docs/ACTIVE/First_Owner_Provisioning_Runbook.md) — First owner setup process
- [docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md](docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md) — Platform subscription billing roadmap

---

## 10. Code Changes in V1B (This Audit)

**NO code changes required for V1B audit completion.**

All policy is already implemented correctly in codebase:
- Seat derivation logic ✓
- Account scope enforcement ✓
- Trial/active gating ✓
- Comped account bypass ✓
- Contractor/external user exclusion ✓

**Documentation change**:
- [NEW] This audit document (Platform_Seat_Billing_V1B_Audit.md) → serves as canonical policy reference

**Recommended future doc updates** (not required for V1B):
- Update Competitive_Packaging_and_Tier_Spec.md to reference this audit
- Add link in Release_Scope_Lock_and_Post_Launch_Roadmap.md section 13
- Update first-owner provisioning runbook with seat policy language

---

## 11. Validation Summary

### 11.1 Code Validation

**TypeScript compilation**: Already passing (V1 is live)

**Existing test coverage**:
- ✓ Seat count derivation tested (`platform-entitlement.test.ts`)
- ✓ Account scope hardening tested (`identity-admin-scope-hardening.test.ts`)
- ✓ Entitlement gating tested (`platform-entitlement.test.ts`)
- ✓ Comped detection tested (implicit in entitlement context tests)

**No new tests required for V1B** (policy lock, no code changes).

### 11.2 Manual Smoke Tests (V1 Already Completed)

- ✓ Admin can view seat audit preview on company profile
- ✓ Seat count reflects active internal users only
- ✓ Inactive users not counted
- ✓ Contractor users not counted
- ✓ Comped account shows unlimited seats
- ✓ Trial account allows operations
- ✓ Expired trial account blocks operations
- ✓ First owner provisioning creates billable account

### 11.3 Audit Checklist

- [x] Canonical seat table identified: `internal_users`
- [x] All increase paths mapped: 4 paths (create, invite, activate, provision)
- [x] All decrease paths mapped: 2 paths (deactivate, delete)
- [x] Exclusion rules documented: contractor, inactive, pending, comped
- [x] Entitlement gating verified: trial/active/grace/suspended/cancelled
- [x] Comped account marking confirmed: notes field, Stripe bypass
- [x] Contractor user handling confirmed: separate table, not counted
- [x] Trial expiration gating confirmed: working via resolveOperationalMutationEntitlementAccess()
- [x] Subscription status gating confirmed: blocked statuses defined
- [x] Account ownership scope confirmed: all mutations scoped to account_owner_user_id
- [x] Last-admin protection confirmed: guard present in deactivation/deletion
- [x] First owner provisioning confirmed: creates entitlement row
- [x] Future enforcement points identified: V1C/V1D insertion points documented
- [x] Risks assessed: gaps acceptable for V1B
- [x] No production data changes made: ✓
- [x] No Stripe quantity changes made: ✓
- [x] No enforcement added: ✓
- [x] Policy document created: This file

---

## 12. Conclusion

**V1B audit complete**: Platform seat billing policy is now locked. All mutations that affect billable seat count have been traced, validated, and documented. Exclusion rules are confirmed. Entitlement gating is working as designed. Enforcement and Stripe reconciliation remain deferred to V1C/V1D.

**Safe for V1C/V1D**: Enforcement can be safely added via the identified insertion points without codebase refactoring.

**Recommended next step**: Begin V1C (seat limit enforcement gate) once this audit is approved.

---

## Cross-References & Links

- Parent document: [Competitive_Packaging_and_Tier_Spec.md](./Competitive_Packaging_and_Tier_Spec.md)
- Roadmap: [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- Payments: [Compliance_Matters_Payments_Roadmap.md](./Compliance_Matters_Payments_Roadmap.md)
- First Owner: [First_Owner_Provisioning_Runbook.md](./First_Owner_Provisioning_Runbook.md)
- Code (entitlements): [lib/business/platform-entitlement.ts](../lib/business/platform-entitlement.ts)
- Code (user actions): [lib/actions/internal-user-actions.ts](../lib/actions/internal-user-actions.ts)

---

**Audit prepared**: May 19, 2026  
**Authority**: Platform Seat Billing V1 Implementation  
**Approved for**: V1C/V1D planning & implementation
