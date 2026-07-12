# EveryStep JobWorks — CURRENT ROADMAP

Status: ACTIVE ROADMAP POSTURE (updated at lane close)
Purpose: Where the build currently stands and what work is safe to continue. An agent reads this to pick up the next safe slice per lane without re-deriving the whole product.

- Stable product truth, locked architecture, and standing constraints → [PROJECT_TRUTH.md](./PROJECT_TRUTH.md)
- Session-start briefing → [SESSION_CONTEXT_TEMPLATE.md](./SESSION_CONTEXT_TEMPLATE.md)
- Strategic sequencing / deferred-lane authority → [ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md](./ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- Tactical closeout evidence (commits/smoke) → [ACTIVE/Tactical_Punch_List_Closeout_Ledger.md](./ACTIVE/Tactical_Punch_List_Closeout_Ledger.md)

### How to read this roadmap

- This file carries **current-state one-liners and next-safe-slice guidance only**. Commit hashes, smoke results, and full closeout narratives live in the Tactical Ledger and the domain evidence ledgers — not here.
- A lane is **Active** when work is in progress or it is the designated next lane. A lane is **Merged-awaiting-smoke** when code is on `main` but the owner has not yet run the live production smoke. A lane is **Closed** when it is live and accepted.
- Every lane inherits the standing constraints in [PROJECT_TRUTH.md](./PROJECT_TRUTH.md). Where a lane lists **Guardrails**, those are the specific do-not-cross lines for that lane on top of the standing constraints.
- Update this file at lane close: move the lane to "Recently closed lanes," collapse it to one line, and push detail to the ledgers.

### Standing constraints (apply to every lane)

These hold in every session regardless of which lane is active. They restate the load-bearing rules from [PROJECT_TRUTH.md](./PROJECT_TRUTH.md):

- Source-of-truth ownership is locked: `job_events` = narrative truth, `ecc_test_runs` = ECC technical truth, `jobs.ops_status` = operational projection (never freeform UI state), `service_cases` = continuity container.
- UI never owns lifecycle truth and never guesses ECC resolution. Changes are additive unless an explicit, approved change says otherwise.
- No schema, migration, Supabase, or RLS change lands without following the sandbox-first migration discipline and confirming the target project.
- No Stripe/payment behavior change and no implied live payment acceptance before it actually exists.
- Contractors interact only through constrained portal paths; they never own lifecycle, schedule work, or close jobs.
- Never work directly on `main`; branch off `sandbox-clean-start`.
- `.github/instructions/*` and `.github/prompt/*` are operational tooling config — do not treat them as product docs and do not fold them into consolidation.

### Lane lifecycle

- **Active** → work in progress or the designated next lane.
- **Merged-awaiting-smoke** → code is on `main`; owner has not yet run the live production smoke.
- **Closed** → live and accepted; collapsed to a one-liner here with detail in the ledgers.
- When a lane closes, record commit/smoke evidence in [ACTIVE/Tactical_Punch_List_Closeout_Ledger.md](./ACTIVE/Tactical_Punch_List_Closeout_Ledger.md) (tactical) or the relevant domain evidence ledger (durable), then trim this file.

---

## Current posture

EveryStep JobWorks is core-complete and live-use proven; the phase is **post-completion maturation**, not foundation building. The foundation is no longer the problem — the priority is making the complete operational loop clearer, faster, and more commercially mature for real users on real devices.

A structured competitive review (HouseCall Pro, FieldProMax, Jobber, ServiceTitan) confirmed the primary gap is **field-invoicing friction and commercial packaging clarity**, not missing features. EveryStep's truth model and ECC differentiation are stronger; the gap to close is UX speed and commercial completeness perception.

Milestone position: service model buildout (milestone 1) is closed; billing/invoice workflow (milestone 2) is complete enough to move forward; reporting/analytics (milestone 3) is substantially complete; Payments P1 foundation is closed at the current baseline. Current product focus is the maturation lanes below.

### Immediate next moves (quick reference)

If you are starting a session and just need the shortest answer to "what now?":

1. **Lane 6 (App Store Wrap Part A / Android)** is the active build lane — device-smoke the geolocation branch (`lane7-capacitor-statusbar-splash-fixes`), get the splash logo rendering, then merge to `main`.
2. **Admin Center Restructure** is the designated next build lane — extend the sectioned-console pattern into `/ops/admin`.
3. **PERF Slice 3** and the **Documentation consolidation Phase 2+** are safe, well-scoped parallel work that does not touch product runtime behavior.

Several closed lanes are waiting on non-build follow-ups (owner decisions and external approvals) — see **Outstanding follow-ups** below. Anything not in the Active lanes list is deferred or runbook-gated — do not start it without an explicit owner decision.

---

## Active lanes

### Lane 6 — App Store Wrap Part A (Android) ◀ ACTIVE BUILD LANE
- **Status:** In progress. Capacitor shell installed and the Android project scaffolded in remote-URL mode (WebView → the production app; bundle ID `com.compliancematters.everystep`). Android 15+ status-bar overlap fixed and Supabase-session cookie persistence enabled. Native geolocation work is on `lane7-capacitor-statusbar-splash-fixes`; the splash-screen logo does not yet render correctly.
- **Next safe slice:** device-smoke the geolocation branch, fix splash-logo rendering, then merge to `main`. Android Play Store submission is ready when the owner decides.
- **Guardrails:** remote-URL wrap only — web-layer changes keep deploying instantly and no product runtime logic moves into the native shell. Apple App Store and push notifications (Part B) are deferred pending an Apple Developer account (owner decision).

### Admin Center Restructure
- **Status:** Active / next, continuing the sectioned-console direction. First-owner acceptance now routes into the Admin Center readiness setup at `/ops/admin`; the Company Profile console established the sectioned-settings pattern to extend.
- **Next safe slice:** continue extracting admin / onboarding / readiness surfaces into the sectioned model (Launch Room / Training Room / readiness surfaces as proposed).
- **Guardrails:** the locked Company Profile §2A UX model in [ACTIVE/Startup_Maturity_Lane_Model_Lock.md](./ACTIVE/Startup_Maturity_Lane_Model_Lock.md) governs page/field ordering and the primary/Advanced split (provider/Stripe internals stay behind Advanced). Keep account scoping + admin authz server-side; no settings removed without owner sign-off.

### Documentation Audit / Consolidation
- **Status:** Active. Full documentation audit complete. Phase 0 (safe deletes + archive scaffolding) and Phase 1 (PROJECT_TRUTH, CURRENT_ROADMAP, SESSION_CONTEXT_TEMPLATE created; the Active Spine retired to a redirect stub — CURRENT_ROADMAP is now the lane-status authority) are complete as of July 11, 2026. Control-plane authority: [ACTIVE/Documentation_Authority_Map.md](./ACTIVE/Documentation_Authority_Map.md) and [ACTIVE/Documentation_Consolidation_Audit.md](./ACTIVE/Documentation_Consolidation_Audit.md).
- **Next safe slice:** Phase 2+ — de-dup merges (invite-flow docs, GTM docs, launch-readiness cluster), trim control-plane/roadmap docs to their lanes, archive historical closeouts to `docs/ARCHIVE/closeouts/`, add an SMS documentation index.
- **Guardrails:** documentation-only. No schema, Supabase, RLS, Stripe/payment, server-action, component, or `.github/instructions`/`.github/prompt` changes. Anything carrying a locked decision, production-protection rule, or owner-approved boundary is flagged for owner review, never blind-deleted.

### Performance — Identity Resolution fast-path (Slice 3)
- **Status:** Slices 1 and 2 are merged to `main` (request-scoped identity dedup + shared memoized `getRequestUser()` + v2 job-detail timing). Slice 3 is open and unstarted.
- **Next safe slice:** finish the `getRequestUser()` migration across remaining routes, retire the dead v1 job-detail route, then the separate `revalidatePath` / `getClaims` / build-tooling sub-lanes. Backlog: [PERF_IDENTITY_RESOLUTION_SLICE3_BACKLOG.md](./ACTIVE/PERF_IDENTITY_RESOLUTION_SLICE3_BACKLOG.md).
- **Guardrails:** behavior-preserving only. No revalidation trimming without dependency mapping; billing paths off-limits; no source-of-truth changes without a dedicated audit.

---

## Recently closed lanes

One-liner per lane (detail lives in the ledgers):

- **Lane 5 — QuickBooks Online Integration V1** — CLOSED (July 10, 2026). OAuth connect flow with AES-256-GCM-encrypted tokens in a separate `qbo_connections` table; manual one-way sync (EveryStep → QBO invoices + customers); Intuit production review submitted, awaiting external approval.
- **Lane 4 — SMS Token Rendering V1** — CLOSED (July 9, 2026). Real token rendering in `sms_message_intents` message-body snapshots with quiet-hours write-vs-skip policy locked; no Twilio provider wired yet, so live send stays activation-gated (see Live SMS send under runbook-gated items).
- **ECC/HERS Partner Network Cleanup** — CLOSED (July 2026). Dedicated `/ops/admin/connections` page; Company Profile reduced to a single "Manage connections →" link.
- **P1-D1 — ECC/HERS Workshare Receiver Queue** — CLOSED (July 2026). Read-only incoming-request queue at `/ops/workshare/incoming` for receiver/rater accounts; production smoke pending a real cross-account workshare request (not a build task). Accept/decline (P1-D2) → receiver job creation (P1-E) remain the next workshare slices.
- **Company Profile — Sectioned Settings Console** — CLOSED (July 2026). Navy shell/rail sectioned console with logo MIME/SVG hardening and a `confirmTeamSetup` guard; Integrations (QBO) and Google Review Link added.
- **Privacy Policy & Terms of Service** — CLOSED (July 2026). Public `/privacy` and `/terms` routes live; URLs entered in the Intuit developer dashboard.
- **Lane 1 — Field Invoice Flow V1** — CLOSED (July 9, 2026). Non-technical user on a phone goes from job complete to invoice sent without re-entry (pricebook price carry-through, mobile invoice compression, quick-add with optional pricebook save).
- **Lane 2 — Landing Page Polish** — CLOSED (July 9, 2026). Warm, crafted landing/login + signup funnel (off-white `#faf7f2`, navy, terracotta accent); front-end only. Note: the landing page IS the login page — no separate marketing route.
- **Lane 3 — Google Review Ask** — CLOSED (July 9, 2026). One-tap Google review ask on `field_complete` jobs via device-intent `mailto:`/`sms:`; per-account `google_review_url`; no SMS provider dependency.
- **Field Invoice charge-form progressive disclosure** — CLOSED (July 9, 2026). Two-tier charge entry on desktop + manual-add (Item Name + Unit Price + live subtotal; Type/Qty/Description collapsed). (Branch mislabeled "lane3"; it is a Field Invoice Flow follow-on, not roadmap Lane 3.)
- **Service model buildout (milestone 1)** — CLOSED. Service Contract V1, relationship-aware intake V1, Visit Scope, Waiting State V1, Service Case reconciliation.
- **Payments P1 foundation** — CLOSED at current baseline. Payment tracking + manual payment ledger + collected-payment reporting; Stripe Platform Subscription V1 live-smoke confirmed.
- **Operational entitlement mutation guard** — CLOSED, production-promoted. Expired/invalid entitlement blocks operational mutations server-side (see PROJECT_TRUTH §16).
- **True App / PWA V1** — CLOSED for controlled tester use. `proxy.ts` is the correct Next.js 16 routing convention; native-store distribution deferred.
- **Reporting / analytics (milestone 3)** — substantially complete for current scope.

---

## Outstanding follow-ups (open threads on closed lanes)

Open threads on otherwise-closed lanes. Only the geolocation merge is a build task; everything else is an owner decision or an external dependency.

- **Lane 6 geolocation branch** — device-smoke `lane7-capacitor-statusbar-splash-fixes`, then merge to `main`. *(build follow-up)*
- **QBO_REDIRECT_URI** — update to the production URL in Vercel env once Intuit approves production keys. *(external dependency)*
- **Intuit production app review** — awaiting external approval. *(external dependency)*
- **P1-D1 production smoke** — needs a real cross-account workshare request. *(owner action)*
- **Twilio activation** — infrastructure ready; live SMS gated on Twilio account setup. *(owner decision)*
- **Apple Developer Program enrollment** — deferred; blocks the iOS wrap and push notifications. *(owner decision)*
- **Android Play Store submission** — ready; deferred pending owner decision. *(owner decision)*

---

## Deferred items (intentional, not missing)

These are future/business-layer modules, not spine failures. Each stays parked unless an explicit owner decision reopens it.

**Product-surface deferrals**
- **Customer portal / client hub** — out of current release scope. *Unlock:* explicit owner scope decision. There is no customer portal in current scope.
- **Reviews / marketing suite beyond the Google review ask** — out of scope. *Unlock:* owner decision.
- **Online booking; AI receptionist / call tracking** — out of current product scope. *Unlock:* owner decision.
- **Route Builder / Schedule Assist** — nice-to-have, not operationally urgent. *Unlock:* owner decision.
- **GPS / location timers** — sequenced after QBO and app wrap. *Unlock:* after Lanes 5–6.
- **Additional dispatch UX micro-polish** — core scheduling is complete (PROJECT_TRUTH §10); this is UX-only and opportunistic.

**Payments / billing deferrals**
- **Deeper Payments V2** (refunds, ACH, autopay expansion, disputes/chargebacks, saved-method self-service) — beyond the P1 tracking foundation. *Unlock:* after Lane 5 (QBO) posture is set + owner decision.
- **Service Plan billing / autopay / generated-invoice expansion** — beyond the current maintenance-agreement baseline. *Unlock:* owner decision + Payments V2 sequencing.
- **Controlled production money-flow / deposit proof** — see runbook-gated items.

**Platform / packaging deferrals**
- **Native app-store wrapper ahead of Lane 6** — Web/PWA is the baseline; the wrap is deliberately last. *Unlock:* everything above Lane 6 solid.
- **Deeper offline mode** — not operationally urgent. *Unlock:* owner decision.
- **Full support-system buildout beyond runbook-gated posture** — see runbook-gated items.

**Field-workflow deferrals**
- **Checklist Phase 2 — Field Mode** — target surface `MobileJobDetailV2Preview`; not part of Field Invoice Flow V1. *Unlock:* separate mobile-surface audit + explicit owner sign-off.
- **Tech dispatch phone notifications** (PROJECT_TRUTH §11.9 backlog) — a tech assigned/dispatched should receive a phone notification, with a later on/off preference. *Unlock:* notification + preference/toggle work is scheduled.
- **Inventory, job costing, payroll, financing, mileage / expense capture, broad customer-specific pricing complexity** — out of current product scope. *Unlock:* owner decision.

---

## Runbook-gated items (gate must pass first)

Built or partially built, but held behind an explicit flag/runbook and owner approval before production enablement.

- **Live SMS send** — Gate: Twilio account setup + provider wiring + STOP/HELP/opt-out + legal/A2P + explicit activation. Token rendering and quiet-hours policy are built (Lane 4 closed); no provider is wired yet. Owner doc: the `SMS_*` spec family (`SMS_Provider_Twilio_Readiness_Spec.md` and related).
- **Estimates production** — Gate: `ENABLE_ESTIMATES` and `ENABLE_ESTIMATE_EMAIL_SEND` (both disabled in prod; estimate migrations are sandbox-only, production estimate migrations not applied). Owner doc: [ACTIVE/Estimates_Production_Enablement_Runbook.md](./ACTIVE/Estimates_Production_Enablement_Runbook.md).
- **Support Console** — Gate: `ENABLE_SUPPORT_CONSOLE` (fail-closed, unset in prod); sessions are read-only, account-owner scoped, audited. Owner doc: [ACTIVE/Support_Console_Production_Enablement_Runbook.md](./ACTIVE/Support_Console_Production_Enablement_Runbook.md).
- **Owner-Scoped Permit Workflow** — Gate: `ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS` allowlist (owner/operator only; internal Permits visibility, contractor Request Permit exposure, and permit mutations all fail closed outside the allowlist). Owner doc: [ACTIVE/Owner_Scoped_Permit_Workflow_V1_Model_Spec.md](./ACTIVE/Owner_Scoped_Permit_Workflow_V1_Model_Spec.md).
- **Controlled production money-flow / deposit proof** — Gate: explicit controlled smoke + owner approval. Owner doc: [ACTIVE/Compliance_Matters_Payments_Roadmap.md](./ACTIVE/Compliance_Matters_Payments_Roadmap.md).
- **First-owner provisioning (operator path)** — Gate: `ALLOW_FIRST_OWNER_PROVISIONING` + `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING` for hosted `.supabase.co` targets; dry-run first. Owner doc: [ACTIVE/First_Owner_Provisioning_Runbook.md](./ACTIVE/First_Owner_Provisioning_Runbook.md).

---

## Authority pointers (which spec owns which domain)

When a lane touches one of these domains, the linked doc is the canonical owner of its model/contract — read it before changing behavior, and back-link rather than duplicating its detail.

- **Source-of-truth (customer/location/job/ECC/snapshot):** [ACTIVE/source-of-truth-strategy.md](./ACTIVE/source-of-truth-strategy.md)
- **ECC guided workflow / retest / cert separation:** [ACTIVE/ECC_Guided_Workflow_Separation_Model_Lock.md](./ACTIVE/ECC_Guided_Workflow_Separation_Model_Lock.md)
- **Visit Scope / Work Items → invoice boundary:** [ACTIVE/Visit_Scope_First_Model_Brief.md](./ACTIVE/Visit_Scope_First_Model_Brief.md)
- **Estimates / multi-option proposals:** [ACTIVE/Estimate_Multi_Option_Proposal_Model_Spec.md](./ACTIVE/Estimate_Multi_Option_Proposal_Model_Spec.md)
- **Payment register / allocations / failed-payment truth:** [ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md](./ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md)
- **Deposits / payout reconciliation:** [ACTIVE/Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md](./ACTIVE/Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md)
- **Service-plan billing / billing periods:** [ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md](./ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md)
- **Maintenance agreements / service plans:** [ACTIVE/Maintenance_Agreements_V1_Model_Spec.md](./ACTIVE/Maintenance_Agreements_V1_Model_Spec.md)
- **Financial role / capability access:** [ACTIVE/Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md](./ACTIVE/Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md)
- **Product modes / signup:** [ACTIVE/Product_Mode_Signup_Spec.md](./ACTIVE/Product_Mode_Signup_Spec.md)
- **Checklists (cleaning-first / maintenance-visit):** [ACTIVE/Checklist_Foundation_V1_Model_Spec.md](./ACTIVE/Checklist_Foundation_V1_Model_Spec.md), [ACTIVE/Maintenance_Visit_Checklist_V1_Model_Spec.md](./ACTIVE/Maintenance_Visit_Checklist_V1_Model_Spec.md)
- **Mobile job page V2 (shipped default surface):** [ACTIVE/Mobile_Job_Page_V2_Blueprint.md](./ACTIVE/Mobile_Job_Page_V2_Blueprint.md)
- **Workflow modernization program:** [ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md](./ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md)
- **Business-layer / commercial roadmap:** [ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md](./ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md)
- **Payments roadmap:** [ACTIVE/Compliance_Matters_Payments_Roadmap.md](./ACTIVE/Compliance_Matters_Payments_Roadmap.md)

---

## Post-launch roadmap order (recommended sequence)

Locked lane order (July 2026):

1. **Lane 1 — Field Invoice Flow V1** — CLOSED.
2. **Lane 2 — Landing Page Polish** — CLOSED.
3. **Lane 3 — Google Review Ask** — CLOSED.
4. **Lane 4 — SMS Token Rendering V1** — CLOSED. Live send gated on Twilio account setup (see runbook-gated items).
5. **Lane 5 — QuickBooks Online Integration V1** — CLOSED. Manual one-way sync (EveryStep → QBO) live; Intuit production review pending external approval. Locked boundary holds: QBO is downstream accounting only; EveryStep remains operational source of truth for all job, customer, invoice, payment, and closeout data.
6. **Lane 6 — App Store Wrap Part A (Android)** — IN PROGRESS. Capacitor remote-URL Android shell; the geolocation branch needs device smoke + merge. Web/PWA remains the baseline and web-layer changes keep deploying instantly. Apple App Store and push notifications (Part B) are deferred pending an Apple Developer account.

Named next lanes after the numbered sequence: **Admin Center Restructure** (extend the sectioned-console pattern into `/ops/admin`) and **Documentation Audit & Spine Consolidation** (Phase 0 + Phase 1 complete as of July 11, 2026; Phase 2 merges and trimming remain). Also in flight: the ECC/HERS workshare accept/decline (P1-D2) → receiver job-creation (P1-E) slices, and the PERF identity-resolution Slice 3.

Underlying product-track checkpoint (recommended emphasis order): service model buildout (milestone 1 closed) → billing/invoice workflow (milestone 2) → reporting/analytics (milestone 3, substantially complete) → RLS completion / permission hardening → Payment P1 closeout (closed) → out-of-box readiness / business identity / settings packaging → Pricebook V1 continuation → smaller service-model / service-workflow refinements.

---

## Related documents

- [PROJECT_TRUTH.md](./PROJECT_TRUTH.md) — stable product facts, locked architecture, standing constraints.
- [SESSION_CONTEXT_TEMPLATE.md](./SESSION_CONTEXT_TEMPLATE.md) — paste-at-start session briefing.
- [ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md](./ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md) — deeper strategic sequencing / deferred-lane authority.
- [ACTIVE/Tactical_Punch_List_Closeout_Ledger.md](./ACTIVE/Tactical_Punch_List_Closeout_Ledger.md) — tactical closeout evidence (commits/smoke).
- [ACTIVE/Domain_Model_Closeout_Evidence_Ledger.md](./ACTIVE/Domain_Model_Closeout_Evidence_Ledger.md) and [ACTIVE/Service_Plan_Model_Closeout_Evidence_Ledger.md](./ACTIVE/Service_Plan_Model_Closeout_Evidence_Ledger.md) — durable closeout evidence.
- [ACTIVE/Documentation_Authority_Map.md](./ACTIVE/Documentation_Authority_Map.md) — which doc owns what.

Last updated: July 2026 (lane-status refresh after Lanes 4–5 closed and Lane 6 entered progress; created during the documentation consolidation, Phase 1).
