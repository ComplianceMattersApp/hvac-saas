# Compliance Matters Software — Owner-Led Go-Live Readiness Addendum

Status: ACTIVE planning addendum  
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`  
Mode: Documentation/planning only  
Date: 2026-05-08

---

## 1. Purpose

This addendum clarifies practical go-live readiness posture after owner-completion cycle closeout.

Current go-live approach:
- First users are relationship customers.
- Support is owner-led, guided, and hands-on.
- Early adoption is intentionally controlled and high-touch.

This addendum does **not** activate or change any deferred/gated implementation area, including:
- Support Console production enablement
- onboarding automation/provisioning execution
- tenant Stripe customer payment execution
- Estimates production enablement
- QBO work
- customer portal work

---

## 2. Owner-Led Support Model

For initial go-live users, support is relationship-based and owner-led, not department-based.

Operating model:
- The owner personally walks early customers through setup and normal daily use.
- Direct contact with the owner is acceptable and expected for early relationship customers.
- Guidance and training questions are handled directly by the owner as part of onboarding quality.
- Setup friction is resolved through hands-on walkthroughs first.
- Only confirmed product bugs are escalated into development work.

Practical boundary:
- The goal of early support is successful customer adoption and confidence, not building a formal support department process at this stage.

---

## 3. Lightweight Issue Classification

Use the following simple categories for early owner-led support triage:

1. Guidance/training issue
   - User needs instruction or workflow explanation.
   - No product behavior defect is confirmed.

2. Setup/data issue
   - Initial setup or account data state is incomplete/incorrect for intended workflow.
   - Usually resolved via owner walkthrough and corrections within allowed operational processes.

3. UX confusion/polish issue
   - Product behavior may be correct, but wording/layout/flow creates confusion.
   - Track as polish unless a true behavior defect is confirmed.

4. Actual product bug
   - Product behavior does not match expected behavior in a repeatable way.
   - Escalate to development only after confirmation.

5. Future feature request
   - Valid request but outside current release scope.
   - Park in roadmap/planning; do not convert into immediate implementation.

---

## 4. Bug Escalation Rule

Only confirmed product bugs should become development work.

Minimum bug capture before escalation:
- affected route/page
- user role/session type
- expected behavior
- actual behavior
- reproduction steps
- screenshot/log if helpful

Escalation discipline:
- Confirm bug status before opening build work.
- Keep fixes surgical and root-cause oriented.
- Do not expand scope during a bug fix.
- Preserve source-of-truth boundaries and existing runbook/deferred constraints.

---

## 5. Support Console Boundary

Support Console V1 remains parked and runbook-gated.

Locked boundaries remain:
- no impersonation
- no support-side mutation
- no tenant data edits through support paths
- no production support-console enablement in this phase

Future-readiness note:
- Read-only support visibility can be planned later only if user volume/support load justifies it.
- Any such enablement must follow `docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md`.

---

## 6. Product Separation Readiness

Current product model remains:
- ECC/HERS Compliance Testing version
- HVAC Service version
- one shared platform engine
- no codebase split

Current readiness position:
- Full `product_mode` switch implementation is not required before continuing expansion planning/build lanes.
- Product separation is currently governed by documented mode-aware planning discipline, not by an immediate schema/settings overhaul.

---

## 7. Expansion Planning Guardrail

Before starting any expansion module (Estimates, SMS, tenant Stripe customer payments, recurring services, or others), classify each feature as one of:

- shared engine
- ECC/HERS-specific
- HVAC Service-specific
- mode-aware later
- parked/future

Planning rule:
- Classification is required before implementation begins.
- If classification is ambiguous, resolve in docs/planning first.

---

## 8. SMS/Text Readiness Note

Boundary clarifications:
- In-app notifications are not SMS.
- Manual `Sent Text` contact logs are not provider-powered message delivery.

Future SMS capability requirements (before activation):
- consent/opt-in boundaries
- provider setup
- message templates (including on-my-way and appointment reminders)
- delivery logging
- failure handling
- communication audit trail

No SMS provider setup or activation is performed in this addendum.

---

## 9. Stripe/Payment Readiness Note

Boundary clarifications:
- Platform subscription billing is separate from tenant customer payment execution.
- Tenant Stripe customer payments remain a future build.
- QBO remains later/downstream and optional.

Planning implication:
- Expansion work must keep platform-account subscription billing concerns separate from tenant invoice payment execution design.

---

## 10. Speed/Performance Note

Performance remains important for go-live quality.

Execution rule:
- Improvements should be targeted from measured daily-use bottlenecks.
- No broad rewrite unless recurring real-world evidence proves it is necessary.

Likely future measurement surfaces:
- `/jobs/[id]`
- `/ops`
- reports
- customer-profile surfaces
- calendar (if user-visible lag appears)

---

## 11. Immediate Next Decision

After this addendum, next work should be selected from expansion/planning lanes:

1. Estimates / Quoting V1
2. Recurring Services / Maintenance Agreements
3. SMS/Text Messaging
4. Tenant Stripe Customer Payments
5. Targeted performance improvements only if daily use exposes a specific issue

Selection rule:
- Choose one primary lane at a time.
- Maintain deferred/runbook-gated boundaries unless explicitly reopened by owner decision.

---

## Cross-Reference Pointers

- Support model and boundaries baseline: `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md`
- Canonical scope/deferred/runbook-gated posture: `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- Prelaunch checklist continuity surface: `docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md`

---

## Explicit Non-Implementation Confirmation

This addendum is documentation/planning only.

Not performed in this slice:
- no product code changes
- no schema changes
- no migrations
- no Supabase commands
- no data writes
- no feature flag changes
- no onboarding/provisioning/apply/invites
- no Estimates production enablement
- no Support Console production enablement
- no tenant Stripe payment execution
- no SMS provider setup
- no QBO work
- no customer portal work
- no source-of-truth rewrite
