# Current App Baseline and Competitive Audit - 2026-07-06

Status: ACTIVE AUDIT REPORT
Mode: documentation/audit only
Authority: subordinate to [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md), [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md), and [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md).

## 1. Purpose

This audit records the current Compliance Matters baseline, separates stale open items from true open work, and compares the product against adjacent field-service platforms including Housecall Pro, Jobber, and Workiz.

This document does not authorize product code, schema, migration, Supabase, Stripe, QBO, SMS/provider, production, or feature-flag changes.

## 2. Sources Reviewed

Internal control-plane docs:
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md`
- `docs/ACTIVE/Documentation_Authority_Map.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Competitive_Packaging_and_Tier_Spec.md`
- workflow modernization B0-B8 docs, SMS specs, payments specs, support specs, service-plan specs, and mobile job V2 working audits

Repo evidence sampled:
- routes under `app/`
- action/read-model/test coverage under `lib/`
- current migrations under `supabase/migrations/`
- historical root audit `PROJECT_AUDIT_SPINE_GAP_REPORT.md`

External competitor sources reviewed:
- Housecall Pro features page: https://www.housecallpro.com/features/
- Jobber features page: https://www.getjobber.com/features/
- Workiz home/features navigation page: https://www.workiz.com/

## 3. Current App Baseline

Current Compliance Matters is no longer a bare scheduling/ECC prototype. The repo shows a broad operational system with:
- jobs, service cases, job events, lifecycle/status projection, and linked visit continuity
- ECC/HERS test workflows, contractor correction/retest paths, permit workflow, cert/invoice separation, and contractor report delivery
- customer/location truth with saved service addresses, job snapshots, service-location edits, equipment inventory, system filters, and equipment lifecycle replacement/retirement foundations
- dispatch calendar, Ops queues, closeout queue, field queue, waiting/exception queues, call list, no-tech queue, and focused queue reports
- internal/contractor invite delivery and acceptance hardening
- internal invoices, invoice line items, Pricebook, Work Items/Visit Scope, invoice issue/send/print, tenant customer payment execution, saved-card setup/charge paths, field payment reporting, payment verification, payments/deposits reports, failed-payment reports, allocation/reversal foundations, and Service Plan billing-period foundations
- estimates/quoting internal chain, multi-option proposal foundations, proposal link/email/customer approval surfaces, print/PDF-by-browser surface, and estimate-to-job/invoice conversion foundations
- PWA/device setup, per-device push subscription, in-app notifications, web-push delivery for assignment and mention alerts, notification delivery attempts, and notification read surfaces
- service plans / maintenance agreements, templates, job prefill, visit linkage, manual count, next-due confirmation, and command-center cleanup
- time clock, team clock status, admin review/correction, history/export
- support V0 docs, support case/call log V1, dormant read-only Support Console foundation, and owner console
- product mode signup and mode-aware planning for ECC/HERS, HVAC Service, Hybrid, and Cleaning
- SMS readiness foundations and admin template governance, but real provider-powered SMS remains non-sending/deferred
- checklist foundations and job checklist completions, with Cleaning/HVAC checklist models separated

Daily-use baseline note:
- Compliance Matters / EveryStep FieldWorks is not a cold first-use product.
- The app has been in daily owner/operator use for several months.
- Current readiness work is controlled expansion / first tester validation on top of an already-used operational baseline.
- First tester smoke validates controlled onboarding and external/user expansion readiness; it is not the first proof that the app can operate day to day.

## 4. Stale Or Resolved Open Items

| Historical item | Current finding | Update |
|---|---|---|
| `PROJECT_AUDIT_SPINE_GAP_REPORT.md` marked notification visibility UI as missing | Stale. The repo now includes `/ops/notifications`, notification list/client components, device notification setup, push subscriptions, web-push delivery, notification delivery attempts, and tests under `lib/notifications` and `app/ops/notifications/_components/__tests__`. | Historical report marked superseded. |
| Location edit sync-point ownership marked incomplete | Stale. `app/locations/[id]/notes-actions.ts` now exposes `updateLocationServiceAddressFromForm`; `app/locations/[id]/page.tsx` and customer profile service-location cards use it; tests include `lib/actions/__tests__/location-service-address-actions.test.ts`. | Treat as closed for current saved service-address correction posture. |
| Invite-flow validation marked open | Mostly stale. Invite redirect utility and internal/contractor invite delivery, resend, acceptance, and scope-hardening tests are present. Full browser e2e coverage can still improve, but "no clear test harness" is no longer accurate. | Reclassify from open gap to residual e2e hardening opportunity. |
| Calendar/dispatch marked active next-phase scope | Stale as a broad gap. Calendar routes, dispatch board loaders, DnD/window mapping, block actions, mobile/list behavior, RLS repair closeout, and many calendar tests exist. | Treat current calendar as closed/monitored; only measured performance or UX issues should reopen. |
| Support V1A production migration described as deferred in some control-plane sections | Stale/inconsistent. Roadmap and prelaunch closeout record production schema apply completed and dormant. Active Spine and Prelaunch checklist were updated in this audit to say production schema exists but no support rows/grants/sessions/flag enablement are live. | Corrected. Support Console operation remains deferred. |

## 5. True Open / Deferred Work Register

This is the honest current to-do list after removing stale items.

| Priority | Item | Why it matters | Current posture |
|---:|---|---|---|
| 1 | Controlled pre-launch hardening and production-readiness sweep | Launch risk now comes more from controlled verification than missing core architecture. | Runbook/checklist-gated. |
| 2 | Customer portal / client hub | Competitors give customers self-service appointment, quote, invoice, history, message, and payment access. Compliance Matters has contractor portal and public proposal/payment links, but broad customer portal is parked. | True competitive gap; needs separate customer/location visibility and authority design. |
| 3 | Provider-powered customer SMS and two-way messaging | Housecall Pro, Jobber, and Workiz all emphasize customer communication, reminders, on-my-way texts, and messaging. Compliance Matters has SMS model foundations but intentionally no live SMS. | Deferred behind consent, provider, legal, callback, opt-out, and activation gates. |
| 4 | Online booking / request intake | Competitors market online booking/request flows as lead capture and scheduling automation. Compliance Matters has internal/contractor intake and proposal links, but not customer self-scheduling. | Competitive gap; should follow customer portal/visibility design. |
| 5 | GPS, route optimization, and location timers | Jobber and Housecall Pro advertise map/routing/GPS; Workiz advertises dispatch and scheduling efficiency. Compliance Matters has scheduling and assignments but no GPS/location-timer model. | Future field-ops expansion; privacy and mobile constraints required. |
| 6 | Review management, referrals, and marketing automation | Housecall Pro and Jobber package reviews, campaigns, referrals, and automated follow-ups as growth tools. Compliance Matters is operations-first and does not currently compete here. | Future GTM/growth lane, not release blocker. |
| 7 | QBO/accounting sync | All three competitor ecosystems surface accounting/QuickBooks integration. Compliance Matters keeps QBO last-last and source-of-truth downstream only. | True integration gap, intentionally deferred. |
| 8 | Payments V2 add-ons | Competitors support richer payment expectations: saved cards, automatic charges, deposits, instant payouts, financing, payment reminders, and customer self-service payment experiences. Compliance Matters has strong V1 payment truth but defers refunds, disputes, ACH, public payment portal expansion, receipts, deeper autopay, and platform-fee execution. | Payments V2 deferred register. |
| 9 | Inventory, purchase orders, job costing, payroll/wage logic, and financing | Competitors advertise inventory, job costing/profitability, payroll, expense cards, financing, and purchase orders. Compliance Matters has Pricebook and financial reporting foundations, not full back-office ERP. | Future business-layer expansion only. |
| 10 | AI/receptionist/call tracking/call insights | Housecall Pro and Workiz now lead with AI/call answering; Jobber advertises AI tools and receptionist. Compliance Matters has help-gap logging/training/support foundations, not AI CSR/call intelligence. | Future support/growth lane after core launch. |
| 11 | Mobile Job V2 owner-led readiness | Mobile Job V2 is launch-ready / monitoring and accepted for controlled owner-led launch use. Canonical mobile `/jobs/[id]` defaults to V2, `mobileLayout=current` / `classic` fallback is retained, Standard View exits preserve `mobileLayout=current`, desktop remains separate, and no source-truth blocker was found. Full fixture state-matrix screenshots remain recommended monitoring evidence, but are not a launch blocker. | Controlled internal UX monitoring; not a competitor parity blocker. |
| 12 | Support Console operation | Foundation exists and production schema is dormant, but real support-console use needs support user seed, grants, flag, smoke, and rollback rehearsal. | Runbook-gated, intentionally parked. |

## 6. Competitor Gap Summary

Housecall Pro positions itself as an operating platform with scheduling, dispatching, invoicing, payments, pipeline, AI/CSR, reporting, QuickBooks, service plans, GPS, Price Book, review management, on-my-way texts, customer portal, checklists, property profiles, job costing, routing, and marketing features.

Jobber positions around all-in-one home-service workflows: reviews/websites/campaigns/referrals, quotes with add-ons/deposits/financing, invoices and reminders, online booking, scheduling with maps/routing/push reminders, job forms/checklists/time tracking/location timers/GPS, client hub, messaging, business dashboard, payments, automatic card charges, instant payouts, job costing, and permissions.

Workiz positions around schedule/dispatch/invoice/pay, CRM, estimates/proposals, inventory, online booking, mobile app, advanced reporting, automations, service plans, equipment tracking, Price Book, branded client portal, purchase orders, QuickBooks, built-in phone/messages, call recordings/tags, ad/source tracking, and AI answering/leads/call insights.

Compliance Matters is ahead or differentiated in ECC/HERS specificity, contractor/rater handoff, retest/correction workflow, compliance report delivery, strict source-of-truth discipline, and controlled financial truth. It is behind the mainstream FSM leaders in customer self-service, live customer communications, marketing/reputation tooling, GPS/routing, accounting integration, and AI/call-center automation.

## 7. Baseline Recommendation

Do not chase every competitor feature at once. The strongest baseline strategy is:

1. Protect the current release quality bar with controlled pre-launch hardening.
2. Treat customer portal plus provider-powered customer communication as the first major competitive expansion pair.
3. Keep QBO and advanced payments behind explicit business signals.
4. Keep GPS/routing, marketing/reviews, inventory/job-costing/payroll, and AI/call answering as post-launch strategic lanes.
5. Keep Mobile Job V2 in controlled owner-led launch use with fallback retained and continue non-blocking state-matrix screenshot monitoring.

## 8. Non-Actions

No code behavior, schema, migration, Supabase data, Stripe, QBO, SMS/provider, production environment, or feature-flag changes were made by this audit.
