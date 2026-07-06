# Compliance Matters / EveryStep FieldWorks - Existing Customer Onboarding Cohort Review

Status: ACTIVE READINESS AUDIT
Mode: audit/readiness only
Date: 2026-07-06
Scope: onboarded customer / account cohort review without production data mutation or Supabase queries

## 1. Executive Verdict

Verdict: **Go remains intact for controlled owner-led launch / continued customer expansion.**

No new launch blocker was found in this audit. Launch blocker count remains **0**.

Important context:

- Compliance Matters / EveryStep FieldWorks is not a cold first-use product.
- The app has been in daily owner/operator use for several months.
- Customers have already been onboarded.
- First tester smoke is not the first proof of operation; it is controlled expansion validation on top of an already-used operational baseline.

Evidence limitation:

- This review did **not** query Supabase, inspect production rows, mutate production data, or enumerate a live customer roster.
- Cohorts below are classified from committed docs, route/source inventory, known closeouts, and the recorded first-tester/daily-use readiness context.
- Customer-specific names, accounts, and support history should be added only through an approved read-only owner/customer evidence process.

Current status preserved:

- Mobile V2 remains launch-ready / monitoring with current/classic fallback retained.
- Support V0 / Support Case V1 remain the active support model.
- Support Console remains parked/runbook-gated.
- Live SMS remains disabled/deferred.
- QBO remains deferred/downstream-only.
- Customer portal, online booking, GPS/routing, marketing/reviews, AI/call answering, inventory/job costing/payroll remain future/deferred lanes unless explicitly reopened.

## 2. Onboarded-Customer Cohort Summary

| Cohort / account type | Product mode / use case | Setup path evidenced | Onboarding status | Friction observed in docs |
| --- | --- | --- | --- | --- |
| Owner/operator operating account | Internal-only / hybrid operational baseline | Daily owner/operator use, owner-assisted setup, company/admin settings, internal routes | Active daily baseline for several months | No current S1/S2 reported. Ongoing monitoring only. |
| Relationship first customers / controlled testers | ECC/HERS, HVAC Service, or Hybrid depending account | Owner-assisted onboarding, invite/login/setup support, Support V0 | Controlled expansion posture remains Go | First tester smoke complete with no S1/S2/S3/future-request findings reported. |
| ECC/HERS contractor-facing customers / partners | ECC/HERS with contractor portal/intake/correction context | Contractor portal access, contractor intake, invite/acceptance, internal finalization | Current external model for contractor-facing work | Prior contractor intake missing-state and attachment-size failures are recorded as resolved; no current open blocker found in docs. |
| Internal service workflow users | HVAC Service / field operations | Internal user invite, owner/admin role setup, `/ops`, `/jobs/new`, job detail, calendar | Supported by daily-use baseline and route/test inventory | No current repeatable friction reported from this pass. |
| Billing/admin users | Owner/Admin/Billing financial authority | Owner-assisted role/capability setup, invoice/payment/report routes | Current supported role model | Financial wording/truth remains a hardening monitor; no current S1/S2 reported. |
| Service-plan users, where used | HVAC Service / recurring maintenance | Owner-assisted service-plan setup, plan templates, visit count, next-due confirmation | Current-scope service-plan operations are supported | Monitor visit count/next-due clarity; no current S1/S2 reported. |

## 3. Real Issues / Support Summary

| Issue / signal | Classification | Current status | Notes |
| --- | --- | --- | --- |
| First tester smoke execution | No issue | Closed / clean | Complete; no issues reported. |
| S1 blockers from current pass | S1 blocker | None reported | No current open S1 found in docs. |
| S2 serious issues from current pass | S2 serious | None reported | No current open S2 found in docs. |
| S3 polish/confusion from current pass | S3 polish/confusion | None reported | No S3 reported from first tester pass. |
| Future requests from current pass | Future request | None reported | No future requests reported from first tester pass. |
| Contractor intake missing-state production issue | Prior S2/S1-style workflow incident, now stale/resolved | Resolved | Form now posts state; contractor validation/error handling was hardened; no production data repair possible for failed row because it never persisted. |
| Contractor intake attachment failure | Prior S2/S1-style workflow incident, now stale/resolved | Resolved | Contractor proposal now persists before attachment upload; attachment failure does not erase proposal. |
| Manual SMS/text wording ambiguity | S3/compliance wording risk, resolved for current scope | Resolved / monitor | Wording clarifies manual/device-intent/contact attempt; live provider SMS remains deferred. |
| Support intake process | Setup/training | Active | Support V0 remains owner-led with issue log and Support Case V1 for internal case records. |

Open blocker list: **none identified from available readiness evidence**.

No confirmed current open S1/S2 issue was found in this audit.

## 4. Repeatable Onboarding Friction List

| Friction area | Classification | Current finding | Recommended handling |
| --- | --- | --- | --- |
| Owner-assisted onboarding dependency | Setup/training | Intentional for current relationship-customer rollout. | Keep owner-led process; document repeated questions. |
| Invite / password / first login | Setup/training / launch hardening | Route/test coverage exists; browser e2e remains useful per onboarding wave. | Smoke per cohort; do not treat as blocker without observed failure. |
| Role/capability setup | Setup/training | Owner/Admin/Billing/internal/contractor boundaries are source-of-truth sensitive. | Use owner checklist for role setup; confirm financial authority explicitly. |
| PWA/device notifications | Setup/training | Per-device setup is expected; push is best-effort and in-app notifications remain truth. | Walk users through device setup; record device/browser issues. |
| Contractor portal intake | Stale/resolved plus monitor | Prior state/attachment issues resolved. | Continue monitoring contractor submissions and finalization queue. |
| Financial wording | S3/confusion monitor | Invoice/payment truth is mature but user wording must stay honest. | Continue wording smoke around draft/issued/paid/failed states. |
| Deferred feature expectations | Future request risk | Competitor-like requests may arise, especially SMS, customer portal, QBO, GPS/routing. | Use explicit deferred wording; park requests unless owner reopens lane. |

## 5. Account Setup Repeatability Review

| Setup area | Readiness finding | Risk / follow-up |
| --- | --- | --- |
| Company profile | Supported by admin/company profile surfaces and owner-led setup docs. | Keep support/contact/business identity current. |
| Owner/internal user role | Internal user/admin routes and role tests exist. | Confirm user role during onboarding. |
| Team invites and acceptance | Invite delivery/acceptance/recovery tests exist; route inventory confirms auth paths. | Browser-smoke each new cohort. |
| Product mode | Product-mode signup and mode-aware planning exist. | Confirm mode during onboarding; do not use mode to imply unsupported features. |
| Permissions/roles | Internal, contractor, billing, owner/admin boundaries are heavily tested. | Confirm least authority; monitor financial/report access. |
| Billing/admin authority | Owner/Admin/Billing financial authority is current model. | Assign intentionally; avoid making Billing / AR an Admin by implication. |
| Support contact path | Support V0 details are filled; Support Case V1 exists for owner/support-internal records. | Keep issue log open during onboarding. |
| PWA/device setup | Device setup and notification routes exist; push is per-device/best-effort. | Walk users through install/notification setup. |
| Notifications setup | In-app notifications are primary truth; push attempts are secondary. | Confirm in-app fallback if push is unavailable. |
| Contractor portal access | Contractor portal/intake routes and scope tests exist. | Confirm contractor sees only contractor-appropriate work. |

## 6. Production Workflow Health Review

| Workflow area | Evidence reviewed | Current health finding |
| --- | --- | --- |
| `/ops` | Ops command center, queue routes, focused queue tests | No current open blocker found. Continue queue sanity monitoring. |
| `/jobs/new` | Job intake route and new-job tests | Current intake supports internal/ECC/service setup; no current open blocker found. |
| `/jobs/[id]` Mobile V2 and desktop | Mobile V2 closeout docs and route/component inventory | Mobile V2 launch-ready / monitoring; current/classic fallback retained; desktop separate. |
| Scheduling/calendar | Calendar routes and tests | Calendar is no longer a broad open gap; smoke per onboarding cohort. |
| Contractor portal/intake | Portal routes, contractor intake docs/tests | Prior contractor intake incidents resolved; monitor finalization queue. |
| ECC/HERS test flow | ECC docs/tests and job test routes | Current ECC maturity closed for current scope; monitor failed/retest/correction/cert states. |
| HVAC service workflow | Job ops actions, waiting/parts/service tests | Current workflow available; monitor field finish/waiting/exception clarity. |
| Customer/location/equipment/system/filter continuity | Customer/location/equipment routes and tests | No current blocker found; monitor duplicate/location confusion. |
| Estimates/proposals/public approval | Estimate/proposal routes and tests | Current proposal link/approval lane exists; no payment/invoice automation promise. |
| Invoice/payment truth and wording | Invoice/payment routes, reports, model docs/tests | Current truth is mature; monitor wording and failed/recorded separation. |
| Service plans/maintenance agreements | Service-plan docs/routes/tests | Current operational service-plan scope exists; payment must not hard-block operations. |
| Reports/payment register/time clock | Reports/time-clock routes and tests | Current report surfaces exist; role-gate smoke remains important. |
| Notifications/PWA/device setup | Notification/PWA routes/tests/docs | In-app notifications primary; push per-device/best-effort. |
| Support issue logging | Support V0 and Support Case V1 docs/routes | Active support model is owner-led; Support Console remains parked. |

## 7. Data Integrity And Stuck-State Review

No production rows were queried. The table below records known or likely watch items from docs/source evidence.

| Risk area | Current finding | Classification | Monitoring action |
| --- | --- | --- | --- |
| Duplicate customers/locations | No known current open issue in docs; customer/location continuity is source-of-truth sensitive. | Post-launch monitoring | Watch onboarding/customer entry for duplicates. |
| Orphaned jobs | No known current open issue in docs. | Post-launch monitoring | Watch `/ops` and job lists for missing customer/location context. |
| Stuck pending/closeout states | No current open blocker; closeout/waiting queues exist. | Post-launch monitoring | Review closeout and waiting queues during owner sessions. |
| Unscheduled work not visible in queues | No current open blocker; no-tech/field/needs scheduling queue coverage exists. | Post-launch monitoring | Smoke queue visibility after intake. |
| Invoice/payment status mismatch | No current open blocker; payment truth remains webhook/manual recorded rows. | Launch hardening monitor | Verify draft/issued/paid/failed/reversed wording. |
| Failed uploads or missing attachments | Prior contractor attachment issue resolved. | Stale/resolved plus monitoring | Monitor contractor and job attachments after onboarding. |
| Contractor intake submissions not finalized | Current model requires internal finalization. | Setup/process monitor | Review pending contractor intake queue regularly. |
| Service-plan visit count/next-due mismatch | No current open blocker; actions/tests exist. | Post-launch monitoring | Verify visit count and next-due after service-plan use. |
| Notification delivery/read-state issues | In-app is primary; push secondary. | Post-launch monitoring | Confirm in-app row exists if push fails. |

Data/access/truth-risk list: **no current S1/S2 truth-risk found from available docs/source evidence**.

## 8. Role / RLS / Access Review

No known onboarded customer or user exposure issue was found in the reviewed docs. Available source inventory shows broad tests for auth, portal, contractor intake, customer actions, job scope, ECC actions, invoice/payment financial access, reports, notifications, support, and service plans.

Confirmed posture:

- No known report of one account seeing or mutating another account's jobs/customers/invoices.
- No known report of unauthorized reports/payments access.
- Support Console remains parked and should not be visible as an active first-customer support surface.
- Owner Console/platform-only surfaces remain separate from normal tenant operation.
- Contractor-only/internal-only boundaries remain sensitive and covered by scope-hardening tests.

Recommended monitoring:

- Keep targeted RLS/scope test packs in the release checklist before broader customer waves.
- Use Support V0 / Support Case V1 for any access-boundary report.
- Treat any cross-account, unauthorized financial, support-console, or contractor/internal boundary issue as S1 until proven otherwise.

## 9. Deferred-Feature Expectation Review

| Deferred lane | Customer/support expectation risk | Current posture |
| --- | --- | --- |
| Live SMS/provider texting | Customers may expect text messaging from field-service tools. | Deferred/non-sending; wording must not imply delivery. |
| QBO sync | Customers may ask about accounting sync. | Deferred/downstream-only; CM remains invoice/payment truth. |
| Broad customer portal/client hub | Customers may expect self-service history/invoices/appointments. | Deferred; contractor portal and public proposal/payment links are current external surfaces. |
| Online booking/self-scheduling | Customers may expect self-scheduling. | Deferred; current intake is internal/contractor/public proposal-link oriented. |
| GPS/routing/location timers | Field teams may expect route optimization or location tracking. | Deferred; no GPS/geofencing/job-costing behavior. |
| Marketing/reviews/referrals automation | Competitive expectation. | Deferred future GTM lane. |
| AI/call answering | Competitive expectation. | Deferred support/growth lane. |
| Inventory/job costing/payroll | Back-office expansion expectation. | Deferred; time clock is not payroll. |
| Support Console | Owner/support operator may expect more support tooling. | Parked/runbook-gated; Support V0 and Support Case V1 are active. |
| Broader Payments V2 add-ons | Customers may expect refunds/disputes/ACH/portal/autopay expansion. | Deferred unless explicitly reopened. |

Deferred expectation risks: **managed by explicit wording and owner-led support; no deferred lane should reopen by default from this audit.**

## 10. Next-Lane Signal Review

Recommendation: **No new feature lane yet; continue monitoring with onboarding/process polish.**

Why:

- First tester smoke completed with no reported S1/S2/S3/future-request findings.
- Daily owner/operator use has been active for several months.
- No current open S1/S2 blocker was found from available docs/source evidence.
- Existing deferred lanes should remain deferred until repeated customer signal justifies reopening.

Recommended near-term lane:

1. Continue controlled customer onboarding monitoring.
2. Keep Support V0 issue log and Support Case V1 records current.
3. Capture repeated setup/training questions and classify them before opening implementation work.
4. If repeated visibility requests emerge, run a **customer visibility/portal model audit** before any portal build.
5. If repeated communication requests emerge, run a **provider-powered communication model audit** before any SMS activation.
6. If repeated invoice/customer-page friction emerges, run a **narrow invoice/customer page UX polish audit**.

Do **not** start customer portal, live SMS, QBO, GPS/routing, marketing/reviews, AI/call answering, inventory/job costing/payroll, or broader Payments V2 from this audit alone.

## 11. Exact Implementation Prompt

No narrow S1/S2 blocker was found, so no implementation prompt is recommended.

If future owner/customer evidence identifies a narrow S1/S2 blocker, use this prompt shape only after owner approval:

> Fix only the confirmed existing-customer S1/S2 blocker in `[route/workflow]`. Preserve Mobile V2 current/classic fallback, desktop separation, source-of-truth boundaries, auth/role gates, payment truth, ECC truth, final-state read-only posture, SMS non-sending posture, QBO deferred posture, Support Console parked posture, customer portal deferred posture, and all deferred-lane boundaries. Do not change schema, migrations, Supabase data, production env/flags, Stripe/SMS/QBO/provider behavior, or unrelated workflows.

## 12. Explicit Non-Actions

This audit did not:

- implement product code;
- change schema or migrations;
- run Supabase commands;
- call or configure Stripe, SMS, QBO, providers, env, or feature flags;
- mutate production data;
- remove Mobile V2 fallback;
- change desktop behavior;
- enable Support Console;
- enable live SMS;
- start QBO;
- build customer portal;
- reopen deferred lanes;
- change runtime behavior.

## 13. Commands / Evidence Used

Commands run:

- `rg -n "onboard|onboarding|customer|first tester|daily owner|daily use|owner/operator|support issue|known issue|friction|S1|S2|S3|contractor|portal|invite|Support V0|Support Case|customer portal|QBO|SMS|PWA|notification|invoice|payment|service plan|maintenance" docs/ACTIVE docs/WORKING -g "*.md"`
  Result: broad docs/readiness inventory; output was large and confirmed daily-use baseline, first-tester closeout, Support V0/Case V1 posture, Mobile V2 posture, contractor intake closeouts, and deferred-lane boundaries.
- `Get-Content docs/ACTIVE/Final_Launch_Readiness_Sweep_Packet.md -TotalCount 90`
  Result: confirmed Go verdict, launch blocker count 0, first tester smoke closeout, daily-use baseline, Mobile V2 fallback retained, and deferred boundaries.
- `Get-Content docs/ACTIVE/Controlled_First_Tester_Smoke_Execution_Packet.md -TotalCount 80`
  Result: confirmed first tester closeout, no S1/S2/S3/future request findings, and strict no-implementation posture.
- `Get-Content docs/ACTIVE/Current_App_Baseline_and_Competitive_Audit_2026-07-06.md -TotalCount 120`
  Result: confirmed broad operational baseline, daily-use context, deferred register, and Mobile V2/support/SMS/QBO posture.
- `rg --files app | rg "(ops|jobs|calendar|contractor|customers|locations|equipment|estimates|proposals|invoice|payments|reports|time-clock|notifications|owner-console|support)"`
  Result: confirmed route inventory across requested workflow areas.
- `rg --files lib | rg "(__tests__|auth|job|calendar|contractor|customer|location|equipment|estimate|proposal|invoice|payment|maintenance|notification|support|time-clock|portal)"`
  Result: confirmed broad local test/source coverage across onboarding, workflow, access, financial, notification, support, and portal boundaries.
- `Get-Content docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md -TotalCount 180`
  Result: confirmed relationship-customer, owner-assisted onboarding/support model, Support V0, Support Case V1, and deferred boundaries.
- `Get-Content docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md -TotalCount 150`
  Result: confirmed Support V0 practical support path and issue capture process.

Tests run: none. Browser smoke run: none. Supabase commands run: none. Production mutations: none.
