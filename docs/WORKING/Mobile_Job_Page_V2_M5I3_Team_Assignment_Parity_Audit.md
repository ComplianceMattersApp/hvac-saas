# Mobile Job Page V2 M5-I3 Team Assignment Parity Audit

Status: Phase M5-I3 audit only  
Date: 2026-06-28  
Scope: determine whether current mobile Team Assignment can be safely promoted into owner-only Mobile Job Page V2

## Sources Reviewed

- `docs/WORKING/Mobile_Job_Page_V2_M5I0_Parity_Checkpoint.md`
- `app/jobs/[id]/_components/MobileJobDetailCurrent.tsx`
- `app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx`
- `app/jobs/[id]/page.tsx`
- `app/jobs/[id]/_components/AssignedTeamControls.tsx`
- `app/jobs/[id]/_components/DeferredAddAssigneeForm.tsx`
- `app/jobs/[id]/_components/TeamAssignmentSelector.tsx`
- `lib/actions/job-actions.ts`
- `lib/actions/__tests__/job-staffing-scope-hardening.test.ts`
- `lib/actions/__tests__/job-staffing-entitlement-hardening.test.ts`
- `lib/jobs/__tests__/job-detail-mobile-assignment-parity.test.ts`
- `lib/jobs/__tests__/job-tests-page-wiring.test.ts`

## Summary

Team Assignment is a real current-mobile capability, but it is riskier than Contact Logging because it mutates job assignment truth, primary-assignee state, job events, and assignment notifications. The visible current mobile component is reusable, but its edit selector depends on `DeferredAddAssigneeForm`, which reads assignable internal users through `getAssignableInternalUsers`.

Recommendation: **keep Team Assignment standard-linked for now, or add only a V2 tool row to the standard/current assignment anchor.** Do not implement full native Team Assignment in V2 until a small implementation slice explicitly accepts the assignable-user deferred read and verifies return behavior under owner-default V2.

## 1. Current Mobile Behavior

| Item | Current behavior |
| --- | --- |
| Current mobile location | `MobileJobDetailCurrent.tsx`, inside the Field Operations Board area, immediately after Contact Logging and before contractor/context attention sections. |
| Component | `AssignedTeamControls` from `app/jobs/[id]/_components/AssignedTeamControls.tsx`. |
| Current wrapper anchor | Outer current-mobile wrapper uses `id="assigned-team"`. The component itself renders `id="mobile-assigned-team"` when `variant="mobile"`. |
| Current props | `jobId={String(job.id)}`, `tab={tab}`, `assignedTeam={assignedTeam}`, `assignedUserIds={assignedUserIds}`, `isInternalUser={isInternalUser}`, `fieldTeamLabel`, `fieldUserLabel`, mobile empty-state class, and `variant="mobile"`. |
| Visibility gates | The current mobile card is visible in the mobile Field Operations Board. Mutation controls inside `AssignedTeamControls` are gated by `isInternalUser`. The add/change selector is also only rendered when `isInternalUser` is true. |
| Role/account restrictions | Server actions require internal scoped job access and operational mutation entitlement. Client-side visibility only hides controls for non-internal users; server action checks are authoritative. |
| Empty state | `No team assigned yet.` with mobile empty-state styling. |
| Assigned display | Shows assigned users, a `Primary` badge for the primary assignee, `Make Primary` for eligible non-primary rows, and `Remove` for internal users. |
| Current return behavior | Mobile `AssignedTeamControls` computes return target `/jobs/{jobId}?tab={tab}#mobile-assigned-team`. `TeamAssignmentSelector` also sets `return_to` to `/jobs/{jobId}?tab={tab}#mobile-assigned-team` through the `returnAnchor` prop. |
| Current success/failure banners | Page renders assignment banners including `assignment_added`, `assignment_added_primary`, `assignment_team_updated`, `assignment_team_unchanged`, `assignment_team_target_invalid`, `assignment_team_update_failed`, `assignment_primary_set`, `assignment_primary_target_invalid`, `assignment_primary_failed`, `assignment_removed`, and `assignment_user_required`. |
| Internal-only? | Editing is internal-only by UI and server action. The read-only assigned team display may render for non-internal users if they reach the current mobile route, but forms/actions are hidden. |
| Contractors/portal users | Contractors/portal-only users should not be able to mutate assignment. The action layer requires internal scoped job access, so form submission is protected even if UI exposure regressed. |

## 2. Action Contract

Team Assignment uses several existing server actions in `lib/actions/job-actions.ts`.

### `setPrimaryJobAssigneeFromForm`

| Field | Required | Notes |
| --- | --- | --- |
| `job_id` | Yes | Missing value throws `Missing job_id`. |
| `user_id` | Yes | Target user must already be an active assignee and assignable. Missing value throws `Missing user_id`. |
| `tab` | Optional | Used by `redirectToJobWithBanner`; normalized to `info`, `ops`, or `tests`, defaulting to `info`. |
| `return_to` | Optional | If safe local path, banner is added and redirect preserves hash. Current mobile sends `#mobile-assigned-team`. |

Behavior:

- requires internal scoped job access through `requireInternalScopedJobAccessOrRedirect`;
- checks operational mutation entitlement;
- calls `setPrimaryJobAssignment`;
- redirects with `assignment_primary_set`, `assignment_primary_target_invalid`, or `assignment_primary_failed`;
- revalidates `/jobs/{jobId}`, `/ops`, `/ops/field`, and `/calendar`;
- does not create assignment notifications for primary-only changes, based on existing tests.

### `removeJobAssigneeFromForm`

| Field | Required | Notes |
| --- | --- | --- |
| `job_id` | Yes | Missing value throws `Missing job_id`. |
| `user_id` | Yes | User assignment to remove. Missing value throws `Missing user_id`. |
| `tab` | Optional | Used for fallback redirect. |
| `return_to` | Optional | Current mobile sends `#mobile-assigned-team`. |

Behavior:

- requires internal scoped job access;
- checks operational mutation entitlement;
- calls `softRemoveJobAssignment`;
- emits assignment removal truth through existing helpers;
- revalidates `/jobs/{jobId}`, `/ops`, `/ops/field`, and `/calendar`;
- redirects with `assignment_removed`.

### `updateJobTeamAssignmentsFromForm`

| Field | Required | Notes |
| --- | --- | --- |
| `job_id` | Yes | Missing value throws `Missing job_id`. |
| `tab` | Optional | Used for fallback redirect. |
| `return_to` | Optional | `TeamAssignmentSelector` sends `/jobs/{jobId}?tab={tab}#mobile-assigned-team` in current mobile. |
| `primary_user_id` | Optional | Must be included in selected users if present. |
| `selected_user_ids` | Optional/repeated | Multi-value field for selected assignees. Empty selection clears assignments. |

Behavior:

- requires internal scoped job access;
- checks operational mutation entitlement;
- validates every selected user with `assertAssignableInternalUser`;
- ensures active assignments for selected users;
- soft-removes deselected assignments;
- sets/maintains primary assignment according to existing rules;
- returns `assignment_team_target_invalid` when selected/primary users are invalid;
- catches RLS-style assignment update failures and returns `assignment_team_update_failed`;
- sends `internal_job_assigned` notifications only for newly-created assignments after assignment writes complete;
- avoids duplicate notifications for already-active users;
- revalidates `/jobs/{jobId}`, `/ops`, `/ops/field`, and `/calendar`;
- redirects with `assignment_team_updated` or `assignment_team_unchanged`.

### `assignJobAssigneeFromForm`

This older/single-user action still exists and is covered by tests, but the current mobile `AssignedTeamControls` path uses `setPrimaryJobAssigneeFromForm`, `removeJobAssigneeFromForm`, and `updateJobTeamAssignmentsFromForm` through `TeamAssignmentSelector`.

## 3. V2 Prop Readiness

`page.tsx` already passes these assignment-related props to the selected mobile component:

- `assignedTeam`
- `assignedUserIds`
- `AssignedTeamControls`
- `isInternalUser`
- `job`
- `tab`
- `surfaceProfile.labels.fieldTeam`
- `surfaceProfile.labels.fieldUser`

`MobileJobDetailV2Preview.tsx` already destructures `assignedTeam`, but it does not currently destructure/render `AssignedTeamControls` or `assignedUserIds`.

Critical readiness gap: `AssignedTeamControls` includes `DeferredAddAssigneeForm`, and that server component reads assignable internal users via `getAssignableInternalUsers({ supabase })`. V2 does not currently receive an assignable-user list from `page.tsx`. Directly rendering `AssignedTeamControls` in V2 would therefore add the existing deferred assignable-user read to V2.

This read is already part of current mobile, and only one mobile component is selected at a time. Still, it is a real V2 read/fanout change and should be accepted explicitly before native promotion.

## 4. Safe Reuse Path

Classification: **Needs small wrapper, and full native mutation is not pure prop-only reuse.**

Options:

| Option | Classification | Notes |
| --- | --- | --- |
| Render `AssignedTeamControls` directly in V2 | Technically reusable, but not audit-safe without accepting the deferred assignable-user read and return-anchor behavior. |
| Render `AssignedTeamControls` in a V2 collapsed panel/wrapper | Best native path if approved. Use `variant="mobile"` and `returnAnchor="mobile-assigned-team"` behavior unchanged. Needs field/presentation validation because the selector dialog is fixed-position. |
| Add a V2 More Details / Tools row to Standard View `#mobile-assigned-team` | Safest immediate path. No new reads in V2, no action behavior change. |
| Read-only team summary in V2 plus Standard View edit link | Low risk, but not full native parity. Could be useful if owner only needs visibility. |

## 5. Proposed V2 Placement

Preferred initial posture: **More Details / Tools**, not the hero.

Recommended first safe implementation:

- Add a `Team Assignment` row inside expanded More Details / Tools.
- Route to `standardJobAnchorHref("mobile-assigned-team")` or a stable Standard View anchor that includes `mobileLayout=current`.
- Label: `Team Assignment`
- Helper: `View or change assigned field team`

Recommended native implementation only after explicit approval:

- Add a collapsed `Team Assignment` disclosure/panel inside More Details / Tools.
- Render `AssignedTeamControls` with:
  - `jobId={String(job.id)}`
  - `tab={tab}`
  - `assignedTeam={assignedTeam}`
  - `assignedUserIds={assignedUserIds}`
  - `isInternalUser={isInternalUser}`
  - labels from `surfaceProfile`
  - `variant="mobile"`
- Preserve `id="mobile-assigned-team"` so current return anchors continue working.
- Verify the fixed selector dialog behaves correctly when launched from inside nested Tools details.

Do not place mutation controls high in the hero/team identity area unless owner field testing shows assignment is a high-frequency field action.

## 6. Risk Review

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| Accidental reassignment | Medium/High. Assignment controls can add/remove users and change primary. | Keep in More Details / Tools; use collapsed disclosure if native. |
| Duplicate notifications | Medium. New assignments trigger `internal_job_assigned` notifications. | Reuse existing actions; tests already guard no duplicate notifications for already-active users. |
| Primary assignee mismatch | Medium/High. Bulk selector preserves existing primary unless removed; primary choices are constrained. | Do not alter `TeamAssignmentSelector` logic or hidden fields. |
| Wrong account/user visibility | High if assignable-user data is mishandled. | Reuse `getAssignableInternalUsers` and `assertAssignableInternalUser`; no custom filtering in V2. |
| Contractor exposure | Medium. Display may be harmless, mutation is not. | Preserve `isInternalUser` gates and rely on server action auth. |
| RLS failure behavior | Medium. Existing action can partially write before a later failure in some paths, then returns safe banner. | Do not change action. Run staffing hardening tests if implemented. |
| Return path breaking owner-default V2 | Medium. Current `return_to` omits `mobileLayout=v2` and anchors to current mobile `#mobile-assigned-team`. In owner-default V2, returning to `/jobs/{id}?tab={tab}#mobile-assigned-team` may stay in V2 if owner default is enabled. | Native V2 needs an explicit accepted return strategy. Standard View row should use `mobileLayout=current`. |
| Needing new route reads | Medium. Full native edit needs assignable-user read via `DeferredAddAssigneeForm`. | Keep standard-linked until accepting this read. |
| Confusing assignment display vs assignment editing | Medium. The assigned team can be useful context, while edits are lower-frequency admin actions. | Consider read-only summary in V2 plus Standard View edit first. |

## 7. Recommendation

Recommendation: **Add only a V2 tool row to the Standard View assignment anchor for now.**

Reason:

- The action contract is clear and well-tested, but mutation impact is higher than recent Contact Logging parity.
- V2 has current assignee display data, but full editing requires the deferred assignable-user read.
- Current `return_to` / `mobile-assigned-team` behavior is designed for current mobile; owner-default V2 needs a deliberate return strategy before native mutation controls are mounted.
- Team Assignment is lower-frequency than schedule, notes, work scope, status, and contact logging.

Next implementation slice if accepted:

1. Add `Team Assignment` to V2 More Details / Tools as a Standard View escape to `standardJobAnchorHref("mobile-assigned-team")`.
2. Update source tests to protect the Standard View anchor with `mobileLayout=current`.
3. Do not render `AssignedTeamControls` natively yet.

Future native slice after field validation:

1. Create a V2 collapsed Team Assignment panel.
2. Render `AssignedTeamControls` with `variant="mobile"` inside that panel.
3. Explicitly decide whether return targets should preserve V2 or force current mobile.
4. Run staffing scope/entitlement tests plus job-detail source tests.

## Validation

Documentation-only. No product code changes were made for this audit.
