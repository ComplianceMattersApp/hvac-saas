# Support Console Production Enablement Execution Runbook (Planning Only)

Status: ACTIVE EXECUTION-CONTROLLED PLANNING ARTIFACT  
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`  
Scope: Production enablement procedure for Support Console V1, intentionally not executed in this pass.

---

## 1. Executive summary

This runbook defines how production Support Console enablement must be executed later through strict, auditable gates.

Current locked status:
- Support Console H1-H5 hardening is complete on the committed baseline.
- Production support console remains disabled.
- Production support migration remains deferred.
- Production `ENABLE_SUPPORT_CONSOLE` remains false/unset.
- Production support-user setup remains deferred.
- Production support grants remain deferred.
- No production support access is live yet.

Locked boundaries:
- V1 remains read-only only.
- No impersonation.
- No tenant mutation.
- No support-side operational writes.
- No support-side customer-facing actions.
- No broad tenant browsing expansion.

Execution rule:
- Production enablement is allowed only after explicit gate approval, smoke evidence capture, rollback readiness, and final sign-off.

---

## 2. Owner/responsibility table

| Role | Owner | Responsibility | Authority |
|---|---|---|---|
| Release coordinator | RELEASE_OWNER | Runs checklist, tracks gates, records timestamps/evidence | Recommends go/no-go |
| Engineering lead | ENG_LEAD | Validates technical readiness and rollback feasibility | Joint approver |
| Data owner | DB_OWNER | Validates migration readiness and post-apply checks | Joint approver |
| Security/compliance owner | SEC_COMP_OWNER | Validates least privilege, auditability, tenant boundaries | Joint approver |
| Support operations lead | SUPPORT_LEAD | Validates operator workflow discipline and scope | Joint approver |
| QA/validation owner | QA_OWNER | Executes or witnesses smoke evidence steps | Recommends |
| Incident commander | IC_OWNER | Owns rollback command decision during incident path | Rollback authority |
| Product/final approver | PRODUCT_OWNER | Final launch authorization | Final approver |

---

## 3. Required placeholders/inputs

Do not hardcode production secrets/IDs in docs. Use placeholders:
- `PRODUCTION_PROJECT_REF`
- `SUPPORT_OPERATOR_EMAIL`
- `SUPPORT_OPERATOR_USER_ID`
- `SUPPORT_USER_ID`
- `TARGET_ACCOUNT_OWNER_USER_ID`
- `SUPPORT_ACCOUNT_GRANT_ID`
- `SUPPORT_ACCESS_SESSION_ID`
- `DEPLOYMENT_ID`

Additional required run inputs:
- Approved change window and timezone
- Live decision channel
- Named first smoke target account (single account only)
- Evidence storage location
- Rollback on-call roster

---

## 4. Phase A - governance preflight

All checks must pass before any production action:

1. Confirm H1-H5 baseline is deployed and traceable to `DEPLOYMENT_ID`.
2. Confirm production is still disabled (`ENABLE_SUPPORT_CONSOLE` false/unset) pre-change.
3. Reconfirm locked boundaries and deferred scope with all approvers.
4. Confirm no additional support features are bundled into this rollout.
5. Confirm rollback owner and trigger authority.
6. Confirm evidence templates are prepared before first action.
7. Confirm tester onboarding remains blocked until final sign-off.
8. Confirm source-of-truth model and tenant boundaries are unchanged.
9. Confirm all required approvers are present or formally delegated.
10. Record preflight completion timestamp and names.

Gate decision:
- Go only if all preflight checks are complete and signed.
- No-go if any owner, approval, or artifact is missing.

---

## 5. Phase B - migration readiness and verification plan

Planning-only in this pass. No migration is executed here.

Migration apply readiness gate (future execution window):
1. Identify frozen migration artifact and release linkage.
2. Confirm expected schema objects/invariants checklist is documented.
3. Confirm backout path is documented.
4. Confirm change-window readiness and owner availability.
5. Confirm security/compliance review of expected permissions model.

Post-migration verification checklist (future execution):
1. Expected support tables exist and are accessible through approved admin path.
2. Session/grant/account consistency invariant is present.
3. No unexpected schema drift is detected.
4. Existing non-support critical paths remain healthy.
5. Verification evidence is recorded with operator and timestamps.

Gate decision:
- Go only if all migration verification checks pass.
- No-go on any schema/invariant mismatch or unexplained drift.

---

## 6. Phase C - support user setup plan

Planning-only in this pass. No support-user creation is executed here.

Future execution checklist:
1. Validate `SUPPORT_OPERATOR_EMAIL` is approved internal identity.
2. Validate `SUPPORT_OPERATOR_USER_ID` matches same approved identity.
3. Create and activate support-user record, capture `SUPPORT_USER_ID`.
4. Verify active support-user can pass support shell guard.
5. Verify non-support admin cannot pass support shell guard.
6. Record setup and verification evidence.

Gate decision:
- Go only on verified identity mapping and guard parity.
- No-go on mismatch, inactive support-user state, or guard inconsistency.

---

## 7. Phase D - read-only grant setup plan

Planning-only in this pass. No grant creation is executed here.

Future execution checklist:
1. Select first smoke target account (single-account scope).
2. Validate `TARGET_ACCOUNT_OWNER_USER_ID` and account ownership reference.
3. Create read-only grant and capture `SUPPORT_ACCOUNT_GRANT_ID`.
4. Verify grant scope is limited to intended account only.
5. Verify access fails closed without grant.
6. Verify no mutation capability exists through support path.
7. Record setup and verification evidence.

Gate decision:
- Go only with explicit one-account read-only scope verification.
- No-go if scope is broad, ambiguous, or write-capable.

---

## 8. Phase E - feature flag/deployment plan

Planning-only in this pass. Do not enable flags here.

Future execution sequence:
1. Confirm deploy target matches hardened baseline `DEPLOYMENT_ID`.
2. Reconfirm Gates A-D are signed green.
3. Reconfirm rollback readiness and on-call presence.
4. Enable `ENABLE_SUPPORT_CONSOLE` in approved window.
5. Immediately execute controlled smoke (Phase F).
6. Keep blast radius to one operator + one target account until stabilization criteria pass.

Checklist:
1. Flag state transition is attributable (who/when/why).
2. Post-enable state is observed and recorded.
3. Rollback path is immediately available.
4. Stakeholder channel receives enablement and smoke checkpoints.

Gate decision:
- Go only with rollback readiness and smoke operators online.
- No-go if rollback owner/path is uncertain.

---

## 9. Phase F - smoke test script

Future execution script (single-account controlled):

1. Verify operator identity equals `SUPPORT_OPERATOR_EMAIL`.
2. Open support console entry route.
3. Verify support shell gate behavior is correct.
4. Start support session with non-empty operator reason.
5. Capture `SUPPORT_ACCESS_SESSION_ID`.
6. Load explicitly scoped account view.
7. Verify read-only visibility only and no write controls.
8. Verify `account_viewed` audit behavior including dedupe expectation.
9. End support session.
10. Verify non-support admin denial/redirect behavior.
11. Verify no tenant mutations occurred.
12. Record pass/fail and evidence links per step.

Required smoke pass criteria:
- All required steps pass.
- Audit start/view/end trail is complete.
- Role/scope guard behavior is correct.
- No mutation path is exposed.

---

## 10. Phase G - evidence capture template

Run metadata:
- Date/time window:
- `PRODUCTION_PROJECT_REF`:
- `DEPLOYMENT_ID`:
- Release coordinator:
- Approvers present:

Gate evidence:
- Governance gate complete:
- Migration verification complete:
- Support-user verification complete:
- Grant verification complete:
- Flag readiness verification complete:

Smoke evidence:
- `SUPPORT_OPERATOR_EMAIL`:
- `SUPPORT_OPERATOR_USER_ID`:
- `SUPPORT_USER_ID`:
- `TARGET_ACCOUNT_OWNER_USER_ID`:
- `SUPPORT_ACCOUNT_GRANT_ID`:
- `SUPPORT_ACCESS_SESSION_ID`:
- Step-by-step pass/fail outcomes:
- Screenshots/log links:

Audit evidence:
- `session_started` observed:
- `account_viewed` observed (dedupe behavior acceptable):
- `session_ended` observed:
- Expected denied/redirect behavior observed:
- operator reason present in metadata:

Final outcome:
- Go/No-go:
- Rollback executed (if no-go):
- Sign-off names/timestamps:

---

## 11. Phase H - rollback plan

Rollback triggers:
- Any failed gate
- Any smoke failure on required step
- Any boundary breach signal (write path, scope overreach, guard failure)
- Any audit integrity concern

Future execution rollback procedure:
1. Declare no-go/rollback in live decision channel.
2. Disable `ENABLE_SUPPORT_CONSOLE` immediately.
3. Halt support-console usage.
4. Preserve evidence and logs.
5. Validate no tenant operational side effects occurred.
6. Communicate rollback completion and incident ticket.
7. Require full re-approval cycle before reattempt.

Rollback success criteria:
- Feature exposure removed.
- No continued production support-console access.
- Evidence package completed.

---

## 12. Phase I - stabilization window

Recommendation: 24-72 hour constrained stabilization window after first successful controlled enablement.

Stabilization controls:
1. Keep operator/account scope narrow.
2. Review audit event quality daily.
3. Watch for access anomalies or scope drift.
4. Confirm no support mutation paths emerge.
5. Confirm no customer-facing support actions are exposed.
6. Log incidents and operator friction.

Exit criteria:
- No critical incidents.
- Audit and guard behavior remain consistently correct.
- Joint approvers sign expansion readiness.

---

## 13. No-go trigger matrix

| Trigger | Severity | Immediate action | Decision |
|---|---|---|---|
| Missing governance sign-off | High | Stop before next phase | No-go |
| Migration mismatch/invariant failure | Critical | Halt and investigate | No-go |
| Support-user guard inconsistency | Critical | Halt and rollback/hold | No-go |
| Overbroad grant scope | Critical | Halt and correct scope | No-go |
| Any write-capable support path detected | Critical | Immediate rollback | No-go |
| Required audit event missing | High | Halt and investigate | No-go |
| Non-support admin sees scoped support data | Critical | Immediate rollback | No-go |
| Rollback path unavailable/unclear | Critical | Do not enable | No-go |
| Evidence incomplete | High | Hold final decision | No-go |

---

## 14. Deferred support features

Explicitly out of this runbook scope:
- Any support-side mutation capability
- Any impersonation/login-as-customer model
- Broad tenant browsing expansion
- Customer-facing support action surfaces
- Multi-account broad rollout before stabilization evidence

---

## 15. Final operator sign-off checklist

All boxes must be checked before production support-console use is considered approved:

1. Governance preflight signed.
2. Migration verification signed (if migration executed in this window).
3. Support-user setup verification signed.
4. Read-only grant verification signed.
5. Feature-flag enablement evidence signed.
6. Controlled smoke script passed.
7. Audit evidence complete.
8. Rollback readiness preserved throughout.
9. Stabilization criteria met or formally held with constrained scope.
10. Final cross-functional sign-off complete.

Outcome rule:
- Any unchecked required item means no-go.

---

## 16. Commit-before-action requirement

This runbook must be committed to active docs before any production support-console action.

Rationale:
- Prevents rushed rollout decisions.
- Preserves operational discipline and auditability.
- Forces explicit gate ownership and rollback readiness.
- Keeps production enablement status truthful while deferred.

Current status reminder:
- This document does not enable production support access.
- Production support enablement remains deferred until explicit gate-approved execution.
