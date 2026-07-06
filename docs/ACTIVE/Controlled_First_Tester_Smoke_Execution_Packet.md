# Compliance Matters - Controlled First Tester Smoke Execution Packet

Status: ACTIVE EXECUTION CHECKLIST
Mode: smoke execution planning/checklist only
Date: 2026-07-06
Scope: controlled owner-led launch / first tester smoke run sheet

## 1. Purpose And Boundaries

This packet converts the committed Final Launch Readiness Sweep Packet into the exact first tester smoke execution checklist and owner run sheet.

Current launch posture:

- Final Launch Readiness Sweep Packet is committed.
- Verdict is **Go for controlled owner-led launch / first tester readiness**.
- Launch blocker count is **0**.
- Mobile Job V2 is launch-ready / monitoring with current/classic fallback retained.
- Support V0 plus Support Case V1 are the active support model.
- Support Console remains parked/runbook-gated.
- Live SMS remains disabled/deferred.
- QBO remains deferred/downstream-only.
- Customer portal, online booking, GPS/routing, marketing/reviews, AI/call answering, inventory/job costing/payroll remain future/deferred.

Strict non-actions:

- No implementation.
- No production mutation.
- No deferred scope reopening.
- No Support Console enablement.
- No live SMS enablement.
- No QBO work.
- No customer portal work.
- No Stripe/payment behavior changes.
- No schema, migration, Supabase, env, feature-flag, fallback, desktop, or runtime behavior changes.

## 2. Severity Labels

| Severity | Meaning | Owner response |
| --- | --- | --- |
| S1 blocker | Tester cannot proceed with controlled testing, or a source-of-truth/auth/financial/ECC/final-state safety boundary is at risk. | Stop expansion. Use fallback only if safe. Capture evidence. Decide whether to pause tester session. |
| S2 serious | Tester can continue with a verified workaround or current/classic fallback, but the workflow is materially confusing or impaired. | Continue only if owner accepts workaround. Capture issue for focused follow-up. |
| S3 polish/confusion | Workflow works, but wording, layout, or sequence causes confusion. | Track for follow-up. Do not block first tester unless repeated or owner escalates. |
| Future request | Requested capability is outside current launch scope. | Park in roadmap. Do not reopen deferred lane during smoke. |

## 3. First Tester Preflight Checklist

| Item | Expected result | Pass/fail | Screenshot/log note | Issue severity | Owner decision needed |
| --- | --- | --- | --- | --- | --- |
| Confirm tester name, company, role, and intended product mode | Tester role and product mode are known before session starts. |  |  |  |  |
| Confirm tester has approved relationship-based first tester expectations | Tester understands owner-led support and controlled rollout scope. |  |  |  |  |
| Confirm support path is ready | Support email, phone/text, hours, issue log, and owner responder are available. |  |  |  |  |
| Confirm smoke data posture | Use existing safe fixtures or owner-approved test records only; do not repair/delete/mutate production data for checklist cleanup. |  |  |  |  |
| Confirm deferred-feature wording | Tester will not be promised live SMS, customer portal, QBO, online booking, GPS/routing, marketing/reviews, AI/call answering, inventory/job costing/payroll. |  |  |  |  |
| Confirm fallback posture | Mobile current/classic fallback remains available; desktop remains separate. |  |  |  |  |
| Confirm payment posture | Payment smoke uses current safe payment path only when relevant; no Stripe/payment behavior changes are introduced. |  |  |  |  |
| Confirm Support Console posture | Support Console is not enabled or used for first tester support. |  |  |  |  |

## 4. Tester Account / Readiness Checklist

| Item | Route | Tester role | Expected behavior | Pass/fail | Screenshot/log note | Issue severity | Owner decision needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account exists / invite prepared | `/ops/admin/users` or owner-approved admin path | Owner/Admin | Tester account is present or invite can be sent through existing approved flow. |  |  |  |  |
| Login works | `/login` | Tester role | Tester can sign in without redirect loop or unclear error. |  |  |  |  |
| Password / set-password path works if needed | `/set-password` | Tester role | Password setup/recovery gives clear success/error state. |  |  |  |  |
| Invite acceptance works if relevant | invite link / acceptance route | Tester role | Invite accepts into correct account/role; expired/reused states are understandable. |  |  |  |  |
| Landing destination is correct | post-login destination | Tester role | Tester lands in expected app area, not an unauthorized/admin-only page. |  |  |  |  |
| Role boundaries are sane | role-specific routes | Tester role | Tester sees intended routes and does not see Support Console or deferred/admin-only surfaces. |  |  |  |  |
| Device/browser prepared | tester device/browser | Tester role | Browser is supported; screenshots or screen share are available for evidence. |  |  |  |  |

## 5. Owner / Operator Live-Session Checklist

| Step | Owner action | Expected result | Pass/fail | Screenshot/log note | Issue severity | Owner decision needed |
| --- | --- | --- | --- | --- | --- | --- |
| Start session record | Note tester, date/time, role, device, browser, and product mode. | Session has a traceable smoke header. |  |  |  |  |
| Explain scope | State that this is controlled first tester use, not full self-serve launch. | Tester understands owner-led launch boundaries. |  |  |  |  |
| Explain support path | Provide support email/phone and issue reporting expectations. | Tester knows how to report issues. |  |  |  |  |
| Explain deferred features | Use wording in section 10. | Tester does not expect unsupported capabilities. |  |  |  |  |
| Keep issue log open | Log issues as they occur using section 8 template. | No issue is lost during walkthrough. |  |  |  |  |
| Use fallback if needed | For mobile job issue, test `mobileLayout=current` or `classic` only as fallback evidence. | Fallback works or issue is escalated. |  |  |  |  |
| Decide on continuation | After each S1/S2 issue, decide continue/pause/fallback. | Session remains controlled. |  |  |  |  |
| Close session | Record pass/fail summary and go/no-go recommendation for next tester. | Handoff is clear. |  |  |  |  |

## 6. Smoke Path Checklist

Fill every applicable row during the first tester session. Mark non-applicable rows as `N/A - not relevant to this tester`.

| Smoke item | Route | Tester role | Expected behavior | Pass/fail | Screenshot/log note | Issue severity | Owner decision needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login | `/login` | Tester role | Tester signs in and reaches expected destination without redirect loop. |  |  |  |  |
| Logout / re-login | `/login` plus app logout path | Tester role | Session ends and re-login works cleanly. |  |  |  |  |
| Password recovery / set password | `/set-password` or recovery link | Tester role | Password flow is understandable and does not expose confusing auth state. |  |  |  |  |
| Invite acceptance | invite acceptance route | Invited tester | Invite lands in correct account and role; expired/reused behavior is clear. |  |  |  |  |
| Ops first impression | `/ops` | Internal tester | Queues load, empty states are understandable, first action is obvious. |  |  |  |  |
| Ops focused queues | `/ops/field`, `/ops/closeout-queue`, `/ops/queues/waiting`, `/ops/queues/exceptions` as relevant | Internal tester | Queue links land correctly and counts/cards look plausible. |  |  |  |  |
| New internal job intake | `/jobs/new` | Internal tester | Tester can create or review intended intake path with clear customer/location/responsible/billing context. |  |  |  |  |
| Mobile V2 default | `/jobs/{id}` on mobile viewport/device | Internal tester | Canonical mobile route renders Mobile Job V2, with no misleading active UI for final/exception jobs. |  |  |  |  |
| Mobile current fallback | `/jobs/{id}?mobileLayout=current` | Internal tester | Current mobile view renders and remains usable. |  |  |  |  |
| Mobile classic fallback | `/jobs/{id}?mobileLayout=classic` | Internal tester | Current mobile view renders and remains usable. |  |  |  |  |
| Mobile Standard View exit | V2 Standard View link | Internal tester | Exit preserves `mobileLayout=current` and does not bounce back to V2. |  |  |  |  |
| Desktop job detail | `/jobs/{id}` on desktop viewport | Internal tester | Desktop branch renders separately and is not affected by Mobile V2 selection. |  |  |  |  |
| Scheduling / calendar | `/calendar`, job schedule controls | Internal tester | Schedule/reschedule/unschedule flow is understandable and return path is clear. |  |  |  |  |
| Contractor portal / intake if relevant | contractor portal routes / contractor `/jobs/new` | Contractor tester | Contractor can submit proposed intake; attachments do not erase proposal; internal finalization remains required. |  |  |  |  |
| ECC/HERS test hub if relevant | `/jobs/{id}/tests` | ECC/internal tester | Required tests, completion report, failed/retest/correction/cert states are honest and clear. |  |  |  |  |
| ECC failed/retest/correction if relevant | `/jobs/{id}`, `/jobs/{id}/tests` | ECC/internal tester | Failed/retest/correction state does not look like normal active work unless current truth says it is. |  |  |  |  |
| HVAC service active flow if relevant | `/jobs/{id}` | Service/internal tester | Active service work, work scope, finish field visit, and follow-up are clear. |  |  |  |  |
| HVAC waiting/exception if relevant | `/jobs/{id}`, `/ops/queues/waiting`, `/ops/queues/exceptions` | Service/internal tester | Waiting on info/parts, approval needed, on hold, and unable-to-complete outcomes are not misleading. |  |  |  |  |
| Customer profile continuity | `/customers/{id}` | Internal tester | Customer, locations, jobs, payment history visibility by role, and notes/relationship context are coherent. |  |  |  |  |
| Location continuity | `/locations/{id}` or customer location section | Internal tester | Saved service address and location context do not conflict with job snapshot. |  |  |  |  |
| Equipment/system/filter continuity | job equipment route, customer equipment/system/filter sections | Internal tester | Equipment, systems, and filters are findable and scoped to the right customer/location. |  |  |  |  |
| Estimate creation if relevant | `/estimates/new`, `/estimates/{id}` | Internal tester | Estimate can be created/reviewed without implying invoice/payment automation. |  |  |  |  |
| Proposal public approval link if relevant | `/proposals/{token}` | Public/proposal reviewer | Public proposal approval works and token/error states are understandable. |  |  |  |  |
| Internal invoice draft/issue if relevant | `/jobs/{id}/invoice` | Owner/Admin/Billing | Draft/issued wording is honest; invoice truth is not confused with work scope. |  |  |  |  |
| Safe payment path if relevant | issued invoice payment route/link | Customer/payment tester or owner-observed | Payment wording is safe; webhook-confirmed/manual payment truth remains the source of truth. |  |  |  |  |
| Payment register if relevant | `/reports/payments` | Owner/Admin/Billing | Recorded and failed payment rows remain visibly separate; unauthorized roles are blocked/hidden. |  |  |  |  |
| Service plan path if relevant | service-plan customer/admin routes | Internal tester | Plan, visit count, next due, and visit creation are operational and not payment-hard-blocked. |  |  |  |  |
| Reports hub | `/reports` | Internal tester | Relevant reports are findable and role-appropriate. |  |  |  |  |
| Invoice report if relevant | `/reports/invoices` | Owner/Admin/Billing | Invoice status, paid/balance, and export wording are honest. |  |  |  |  |
| Time clock if relevant | `/time-clock`, `/reports/time-clock`, `/ops/admin/time-clock` | Employee/Admin as applicable | Clock and report surfaces match tester role; no payroll/GPS/job-costing implication. |  |  |  |  |
| Notifications list | `/ops/notifications` | Internal tester | In-app notifications load and route to expected job/context. |  |  |  |  |
| Device setup / PWA install | `/ops/notifications` device setup and browser install prompt/path | Internal tester | Install/device setup guidance is understandable; push is per-device and best-effort. |  |  |  |  |
| Support V0 issue logging | Support email/phone/log process | Tester and owner | Issue can be captured with route, expected/actual behavior, severity, screenshot/log. |  |  |  |  |
| Support Case V1 logging | `/ops/owner-console/{accountOwnerUserId}` or support case route | Owner/support-internal | Owner can create/update support case/note without impersonation or tenant operational mutation. |  |  |  |  |
| SMS readiness wording | `/ops/admin/communications` | Owner/Admin | Page says sample/readiness only, SMS not enabled, live sends disabled, Mark On The Way does not send SMS. |  |  |  |  |

## 7. Go / No-Go Criteria For Expanding Beyond First Tester

| Decision | Criteria |
| --- | --- |
| Go to next controlled tester | No S1 blockers. Any S2 issues have owner-approved fallback/workaround. Mobile current/classic fallback remains intact. Auth, primary workflow, support path, and payment/ECC/source-of-truth boundaries remain safe. Deferred-feature expectations are clear. |
| Hold at first tester | Any unresolved S2 that materially impairs the tester's core workflow, even with fallback, or repeated S3 confusion in the same critical path. |
| No-go / stop expansion | Any S1 blocker; any issue affecting auth/role gates, source-of-truth boundaries, financial truth, ECC truth, final-state read-only posture, production data integrity, Mobile V2 fallback, desktop separation, live SMS posture, QBO deferred posture, or Support Console parked posture. |

Minimum evidence before expanding:

- Completed smoke rows for the tester's relevant workflow.
- Screenshot/log note for each failed or confusing item.
- Issue log entries for all S1/S2/S3/Future-request findings.
- Owner decision recorded for every S1/S2.
- Confirmation that no deferred lane was reopened.

## 8. Issue Capture Template

Use this template for every failed, confusing, or deferred-request item.

```text
CONTROLLED FIRST TESTER ISSUE

Date/time:
Tester:
Company/account:
Tester role:
Device/browser:
Route:
Smoke item:

Expected behavior:
Actual behavior:

Severity:
[ ] S1 blocker
[ ] S2 serious
[ ] S3 polish/confusion
[ ] Future request

Work blocked?
[ ] Yes - cannot proceed
[ ] Partial - workaround/fallback exists
[ ] No

Fallback/workaround tested:
[ ] Not needed
[ ] Mobile current fallback
[ ] Mobile classic fallback
[ ] Desktop route
[ ] Owner/manual support workaround
[ ] Other:

Screenshot/log note:
Owner decision:
[ ] Continue session
[ ] Continue with workaround
[ ] Pause tester session
[ ] Stop expansion
[ ] Park as future request

Build work needed?
[ ] No
[ ] Yes, confirmed narrow blocker

Notes:
```

## 9. Rollback / Containment Plan

If tester hits an S1 blocker:

1. Stop the affected workflow immediately.
2. Do not repair, delete, mutate, or manually "fix" production data as part of smoke.
3. Capture route, tester role, expected behavior, actual behavior, screenshot/log note, and time.
4. If the issue is Mobile V2-specific, test current/classic fallback only to confirm containment; do not remove fallback.
5. If the issue is auth/role/security/financial/ECC/source-of-truth/final-state related, stop expansion until triaged.
6. Move support intake to Support V0 and, when account-specific, log a Support Case V1 note.
7. Communicate the workaround or pause decision to the tester.
8. Use a narrow implementation prompt only after owner confirms the issue is a true blocker.

If tester hits an S2 serious issue:

1. Confirm whether a safe workaround or fallback exists.
2. Continue only if owner accepts the workaround.
3. Capture evidence and owner decision.
4. Do not broaden scope or reopen deferred lanes while addressing the issue.

If tester makes a future-feature request:

1. Acknowledge the request.
2. Record it as `Future request`.
3. Park it in roadmap/backlog.
4. Do not promise timing or treat it as launch scope.

## 10. Explicit Deferred-Feature Wording

Use plain wording like this during the first tester session:

- Customer portal: "For this first controlled launch, customer self-service portal is not part of the active scope. We are using owner-led support, contractor portal where relevant, and public proposal/payment links where already supported."
- SMS: "Live provider SMS is not enabled. Text-related labels are contact/logging or device-intent only unless we explicitly activate provider SMS later."
- QBO: "QuickBooks integration is deferred and downstream-only. Compliance Matters remains the source of truth for app invoices and payment status."
- Online booking: "Online self-scheduling/request intake is not active for this first tester launch."
- GPS/routing/location timers: "GPS routing, geofencing, and location timers are not active launch features."
- Marketing/reviews/referrals: "Review management and marketing automation are future growth lanes, not first tester scope."
- AI/call answering: "AI receptionist, call answering, and call insights are not active launch features."
- Inventory/job costing/payroll: "Inventory, job costing, payroll, wage logic, and financing are future business-layer lanes. Time clock is not payroll."
- Support Console: "Support Console remains parked. First tester support uses owner-led Support V0 and Support Case V1 logging."
- Payments: "Only current supported invoice/payment paths are in scope. Refunds, disputes, ACH, QBO sync, broader payment portal behavior, and deeper automation remain deferred unless explicitly reopened."
- Mobile V2 fallback: "Mobile V2 is the default mobile job page, and current/classic fallback remains available."

## 11. Exact Next Implementation Prompt

No implementation is authorized by this packet.

If the smoke session finds a narrow S1 blocker, use this prompt shape only after owner approval:

> Fix only the confirmed first-tester S1 blocker in `[route/workflow]`. Preserve Mobile V2 current/classic fallback, desktop separation, source-of-truth boundaries, auth/role gates, payment truth, ECC truth, final-state read-only posture, SMS non-sending posture, QBO deferred posture, Support Console parked posture, and all deferred-lane boundaries. Do not change schema, migrations, Supabase data, production env/flags, Stripe/SMS/QBO/provider behavior, customer portal scope, or unrelated workflows.

## 12. Validation Notes

This packet is docs/readiness only. It creates no product behavior and executes no smoke by itself.

Commands/tests/smoke for this packet:

- Tests run: none.
- Browser smoke run: none.
- Supabase commands run: none.
- Production mutations: none.
