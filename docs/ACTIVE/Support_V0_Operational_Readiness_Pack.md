# Compliance Matters Software — Support V0 Operational Readiness Pack

**Status:** ACTIVE — current manual support model  
**Authority:** Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`  
**Release context:** See `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md` for locked scope and deferred items.  
**Owner-led go-live addendum:** See `docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md` for relationship-based owner-led first-customer support posture and expansion planning guardrails.  
**Version:** V0 — white-glove manual support for first users and controlled testers

---

## 1. Purpose

Support V0 is the manual, white-glove support model for first users and controlled testers before any self-serve or ticketing infrastructure is in place.

**What Support V0 is:**
- Direct operator-to-user communication for issue intake, triage, and resolution
- A structured intake process to capture issues clearly and consistently
- A documented escalation path from user report to engineering review when needed

**What Support V0 is not:**
- A Support Console requirement — the Support Console feature remains parked behind its production enablement runbook and is not activated under V0
- A grant of impersonation authority — operators may not impersonate users or access sessions on users' behalf
- A grant of support-side mutation authority — operators may not edit production data to resolve user issues
- A signal to begin onboarding new users — V0 support readiness is a prerequisite for controlled testing, not a trigger for it

Support V0 documentation/readiness is complete, but practical first-customer setup still requires live contact details and an owner-led operating path before controlled onboarding begins.

Support V0 closes operationally only when a formal ticketing/support system is in place and Support Console or an equivalent support process is enabled later.

---

## 2. Support Contact SOP

### 2.1 Contact channels

| Channel | Placeholder |
|---|---|
| Support email | `support@[domain]` _(to be confirmed before tester onboarding)_ |
| Support phone | `[phone number]` _(to be confirmed before tester onboarding)_ |
| Preferred channel | Email for non-urgent issues; phone for S1/S2 blocked situations |

### 2.2 Practical setup prerequisites

Before controlled first-customer onboarding begins, the following live details must be filled:

- support email
- support phone
- support hours and timezone
- after-hours S1 path
- issue log location
- owner / first responder identity

### 2.3 Support hours

| Tier | Hours |
|---|---|
| Normal support hours | `[Mon–Fri, 8 AM–5 PM [timezone]]` _(to be confirmed)_ |
| After-hours / emergency | S1 issues only — contact via `[phone/on-call channel]` outside normal hours |

### 2.4 Who receives support requests

- **First responder:** Owner/operator (primary contact for all V0 issues)
- **Escalation:** Engineering review as needed per § 6 escalation tree
- **No third-party support tier exists at V0.** All intake flows through the operator.

### 2.5 User expectations

Inform testers before onboarding:
- Support V0 is direct and manual — there is no ticketing portal or live chat
- Response targets are best-effort, not contractual, at this stage
- Users should submit issues via the intake template (§ 3) for consistent resolution

### 2.6 Issue log location

During V0, issues should be recorded in one shared operational issue log, such as a spreadsheet or doc, while preserving the originating email thread for user-facing communication.

Recommended tracking rule:
- customer-facing communication through email
- phone only for urgent blockers
- internal issue tracking through one spreadsheet/doc issue log
- GitHub issues only for confirmed engineering bugs, not customer-facing support intake

---

## 3. Issue Intake Template

Use this template for every reported issue. Copy it into your support tracking medium (email thread, doc, spreadsheet, or note) for each incident.

```
--- ISSUE INTAKE ---

Date/Time reported:
Account / Company:
User name:
User role:              [ ] Internal  [ ] Contractor  [ ] Owner/Admin
Route / page URL:
Job / Customer / Report involved (if applicable):
Timestamp of incident (approximate):

Expected behavior:
Actual behavior:

Screenshot / video attached?  [ ] Yes  [ ] No
Work blocked?                 [ ] Yes — cannot continue  [ ] Partial — workaround exists  [ ] No
Urgency (caller-stated):      [ ] Critical  [ ] High  [ ] Normal  [ ] Low

Intake notes:

Assigned severity (operator):    S1 / S2 / S3 / S4
Status:                          New / In Review / Engineering / Resolved / Closed
```

---

## 4. Severity Matrix

| Severity | Label | Criteria |
|---|---|---|
| **S1** | Critical | App unavailable for the user or team; data access/security concern; user cannot operate at all; data loss risk |
| **S2** | High | Major workflow blocked with no practical workaround; scheduling, job completion, ECC submission, invoicing, or reporting is blocked; multiple users affected |
| **S3** | Normal | Localized bug with a workaround available; confusing workflow or copy; incorrect display that does not block operations; single-user scope |
| **S4** | Low | Cosmetic issue; copy or label improvement; request for future capability; enhancement that does not affect current operations |

**Classification rules:**
- When in doubt between S1 and S2, default to S1 until verified.
- A workaround must be tested and confirmed to classify as S3 instead of S2.
- S4 issues are never treated as release blockers unless the owner explicitly re-classifies them.

---

## 5. Response-Time Targets

These are best-effort targets for V0 manual support, not contractual SLAs.

| Severity | Target | Notes |
|---|---|---|
| **S1 Critical** | Same business day; immediate when operator is active | Notify user within 2 hours of intake during active hours |
| **S2 High** | Same business day | First response within 4 business hours of intake |
| **S3 Normal** | 1–2 business days | Acknowledge same day; resolution or engineering referral within 1–2 days |
| **S4 Low** | Reviewed during backlog planning | No individual response target; batched into planning review |

---

## 6. Escalation Tree

### 6.1 Normal escalation path

```
User reports issue
    ↓
Operator intake (this pack)
    ↓
Operator classifies severity (§ 4)
    ↓
S3/S4 → Operator resolves or documents for planning
    ↓
S1/S2 → Owner/operator review within response window
    ↓
Cannot resolve without code/data change → Engineering handoff (§ 7)
    ↓
Engineering reviews and classifies: bug / polish / data issue / training / future feature
    ↓
If hotfix warranted: follows standard dev/test/commit/push flow; no shortcuts
    ↓
Resolution communicated back to user
```

### 6.2 Emergency stop conditions

Pause onboarding or testing activity immediately if any of the following occur:

- **S1 data access/security issue** — suspected unauthorized data exposure or session boundary violation
- **S1 app-wide unavailability** — multiple users cannot access the app
- **Repeated S2 issues in the same workflow** — indicates a systemic gap, not isolated user error
- **Any indication of production data corruption** — stop and investigate before continuing

When an emergency stop condition is reached:
1. Notify the owner immediately.
2. Do not attempt to patch data or settings without an explicit engineering review and approval.
3. Document the stop condition in the issue log.
4. Resume controlled testing only after explicit owner sign-off.

### 6.3 When to pause onboarding / testing

- Before any S1 is resolved and verified
- If more than 2 S2 issues are open simultaneously without resolution progress
- If an issue involves a security, auth, or RLS boundary concern, regardless of severity classification

---

## 7. Engineering Handoff Template

Use this template when escalating an issue from operator review to engineering. Include as much detail as available.

```
--- ENGINEERING HANDOFF ---

Summary (1–2 sentences):

Reproduction steps:
  1.
  2.
  3.

Environment:
  [ ] Production   [ ] Sandbox   [ ] Unknown

Role / session type:
  [ ] Internal user   [ ] Contractor   [ ] Owner/Admin   [ ] Unauthenticated

Affected route / page URL:
Job / Customer / Report involved (if applicable):

Expected behavior:
Actual behavior:

Screenshots / logs attached?  [ ] Yes  [ ] No
Console errors observed?      [ ] Yes  [ ] No — if yes, describe:

Was any production data changed as a result of this issue?
  [ ] Yes — describe:    [ ] No    [ ] Unknown

Operator urgency assessment:   S1 / S2 / S3 / S4
Proposed classification:
  [ ] Bug (product behavior does not match intent)
  [ ] Polish (behavior is technically correct but confusing or unclear)
  [ ] Data issue (bad state in production, not a code bug)
  [ ] Training issue (user misunderstood expected behavior — doc/guidance gap)
  [ ] Future feature (valid request but out of current scope)
  [ ] Unknown — needs investigation

Additional context:
```

---

## 8. Daily Support Review Checklist

Run this review once per business day during active tester use. During quiet periods (no active testers), weekly is sufficient.

- [ ] Review all new issues submitted since last review
- [ ] Classify severity (S1–S4) for any unclassified items
- [ ] Confirm no S1 or S2 issues are unacknowledged
- [ ] Check for blocked users — if any user cannot continue work, escalate immediately
- [ ] Look for repeated patterns — if the same confusion or error appears more than once, it is a systemic gap, not a user error
- [ ] Identify any documentation gaps exposed by user questions or misunderstandings
- [ ] Decide whether any open issue has escalated to a release blocker (requires owner decision)
- [ ] Update issue log status (New → In Review → Engineering / Resolved / Closed)
- [ ] If engineering handoffs are open, check status and follow up

---

## 9. Launch-Week / Controlled Tester Support Cadence

### 9.1 Active tester first week

During the first week any controlled tester is actively using the app:

- **Daily support review** (§ 8) is required every business day
- Owner/operator checks for any new issue reports at the start of each business day and at end of day
- Any S1 or S2 issue reported during a business day is acknowledged to the user same day

### 9.2 Issue review rhythm

| Period | Review frequency |
|---|---|
| First week of active tester use | Daily |
| Weeks 2–4 of active tester use | Every 2 days, or daily if issues are accumulating |
| Stable period (no new S1/S2 for 5+ business days) | Weekly |

### 9.3 Hotfix decision rules

Not every bug warrants an immediate hotfix. Use these rules:

| Condition | Action |
|---|---|
| S1 confirmed | Investigate immediately; hotfix if root cause is identified and fix is safe |
| S2 blocking tester use | Prioritize for next available engineering slot; communicate ETA to user |
| S2 with workaround | Document workaround for user; schedule fix for next sprint/batch |
| S3 or S4 | Queue for planning backlog; do not interrupt current work stream |
| Any hotfix | Must follow standard dev/test/commit/push flow — no manual production data edits, no unreviewed schema changes |

### 9.4 Documentation feedback loop

When a user issue reveals a gap in guidance or copy:
- Note the gap in the issue log
- Decide whether to fix copy/wording in the app (via normal code review) or add operator guidance to this pack
- Do not create new support documentation unless the gap will recur

---

## 10. Support V0 Boundaries

These boundaries are hard limits under V0. They may only change through explicit owner decision and, where applicable, through the relevant runbook.

| Boundary | Rule |
|---|---|
| Impersonation | **Prohibited.** Operators may not log in as users, access user sessions, or impersonate any account. |
| Support-side mutation | **Prohibited.** No production data edits through support tooling or direct database access to resolve user issues. |
| Production data edits | **Prohibited** outside of reviewed engineering hotfixes following standard commit/test/push flow. |
| Support Console | **Not activated.** Support Console feature remains parked behind its production enablement runbook. V0 does not require it. |
| Runbook bypass | **Prohibited.** No estimates, support-console, or first-owner provisioning operations may be executed outside their runbooks. |
| Estimates production enablement | **Parked.** Requires explicit gate approval per `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md`. |
| Support Console production enablement | **Parked.** Requires explicit gate approval per `docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md`. |
| Tenant customer payment execution | **Deferred.** No Pay Now / Charge Card / checkout / refund / dispute actions are live at V0. |
| QBO | **Not in scope.** Optional downstream only. |
| Customer portal | **Not in scope.** Parked. Contractors and internal users only for current release. |

---

## 11. Acceptance Checklist for Controlled First Tester Onboarding

All items must be confirmed before the first controlled tester is onboarded. This checklist is operator-verified; no engineering action is required unless an item is flagged incomplete.

- [ ] **Support contact confirmed** — support email and phone are established and reachable
- [ ] **Issue intake template ready** — template (§ 3) is in your support tracking medium, ready to use on first contact
- [ ] **Severity matrix understood** — operator can classify S1–S4 without ambiguity
- [ ] **Escalation owner assigned** — a named person is responsible for S1/S2 response during tester active periods
- [ ] **Release packet reviewed** — operator has read `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md` and understands locked scope
- [ ] **Deferred/runbook-gated items understood** — operator can clearly state what is not available without confusion (no Estimates, no Support Console, no customer portal, no payment execution, no QBO)
- [ ] **Known limitations communicated to tester** — tester has been told what is in scope, what is deferred, and what to do if they encounter an issue
- [ ] **Daily review cadence committed** — operator has scheduled daily support review for the first week of active tester use
- [ ] **Engineering escalation path clear** — operator knows how to reach engineering and how to use the handoff template (§ 7)
- [ ] **Emergency stop conditions understood** — operator knows when to pause testing and how to communicate it

---

## Appendix: Quick Reference

| Situation | Action |
|---|---|
| New issue reported | Use intake template (§ 3), classify severity (§ 4) |
| S1 confirmed | Notify owner immediately; acknowledge user same day; escalate to engineering if not immediately resolvable |
| S2 blocking tester | Acknowledge same day; escalate if not resolvable within 4 hours |
| Repeated confusion from multiple users | Flag as systemic gap; review docs/copy at next planning slot |
| Engineering handoff needed | Use handoff template (§ 7); do not attempt production data edits |
| Emergency stop condition | Notify owner; pause testing; document the stop in issue log |
| Tester asks about deferred feature | Redirect to known limitations communicated at onboarding; do not promise timelines |
| Support Console or impersonation requested | Decline — not available at V0 |

---

## Group 3 — First HVAC Service User Onboarding: Monitoring Note (May 2026)

Group 3 is closed / monitoring.

- First HVAC Service user has signed up and appears in the Owner Console.
- No active blocker is known at time of group closeout.
- Support V0 intake discipline is the correct path for any user-reported issues: use the intake template (§ 3), classify severity (§ 4), and escalate through the documented path before treating any feedback as build work.
- Any feedback that suggests a platform gap should be classified as S3/S4 minimum and reviewed at the next planning slot before becoming a work item.
- Controlled onboarding expansion (additional testers/users) remains owner-decision-gated; V0 support readiness is a prerequisite but not a trigger.
