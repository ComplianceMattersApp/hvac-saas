# EveryStep FieldWorks — CURRENT ROADMAP

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

### Recently closed — Contractor experience and payment communications (July 2026)

- **Status: Closed in code; production operator smoke remains the normal post-deploy confirmation.** Public signed invoice payment no longer requires signup; payers receive a limited review step before Stripe and a public-safe return experience.
- Contractor management is profile-centered: searchable compact directory, dedicated internal profile, billing/QBO identity, access administration, lifecycle controls, associated work, and contractor-billed invoice/payment/delivery history.
- Internal payment-received email is wired after durable manual or Stripe-recorded payment truth with database dedupe and failure isolation.
- Contractor portal invoice center is live at `/portal/invoices` and is authorized only by frozen contractor billing identity, never job assignment. Detail, printable view, and payment entry points repeat the same scope check.
- Remaining closeout is documentation and production smoke evidence only. Deferred payment expansion remains ACH, refunds/disputes, contractor saved-card self-service, and broader recurring automation.
- Operator map and smoke checklist: [Contractor_Payment_Communications_Closeout_2026-07.md](./ACTIVE/Contractor_Payment_Communications_Closeout_2026-07.md).

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

EveryStep FieldWorks is core-complete and live-use proven; the phase is **post-completion maturation**, not foundation building. The foundation is no longer the problem — the priority is making the complete operational loop clearer, faster, and more commercially mature for real users on real devices.

### Strategic focus: the ECC lane (owner decision, 2026-08-09)

**The ECC/HERS compliance lane is the designated product focus. HVAC-service feature parity is sequenced after it — deferred, not abandoned.**

The reasoning, from a competitive review refreshed with live research on 2026-08-09:

- **ECC is a category we own outright.** No FSM competitor models energy-code compliance testing, ECC-Rater workflow, or cross-account work-sharing. Housecall Pro, Jobber, ServiceTitan and Workiz all serve general home services.
- **The regime just changed in our favour.** Effective 2026-01-01 the HERS program became ECC; HERS raters are now ECC-Raters. CalCERTS ceased HERS operations in 2024 and the residential registry consolidated under CHEERS. Our codebase carries zero CalCERTS references and already uses ECC/CHEERS vocabulary, so we are current on a regime raters are actively transitioning through.
- **The service-side gaps are catch-up in a fight we are not picking.** Customer portal, online booking, reviews/marketing and AI receptionist are all sold hard by competitors — Jobber's AI Receptionist is a $99/month add-on. Chasing them means competing on their terms with no advantage.

**What this means in practice:** build depth for raters first. Revisit HVAC-service parity — the customer portal above all — as a deliberate later lane once the ECC lane is deep. The portal remains a real gap for HVAC service companies and is expected to be closed; it is simply not first.

Milestone position: service model buildout (milestone 1) is closed; reporting/analytics (milestone 3) is substantially complete; Payments P1 foundation is closed and Payments V2 has partially shipped (autopay, saved methods, refunds/disputes). Field Invoice Flow V1 is closed. Current product focus is the ECC lane below.

### Immediate next moves (quick reference)

1. **Ask CHEERS what EDDS access looks like for an ECC-Rater Company's software.** This is a conversation, not a sprint, and it gates the flagship ECC build below. CHEERS is approved to provide an external digital data source; no public API documentation was found, so their answer decides whether we build filing or a structured export.
2. ~~Ship Routes API drive times.~~ **DONE 2026-08-09.** Live `computeRouteMatrix` drive times are fetched before planning and passed into the pure engine as data, with straight-line fallback. Cost-bounded to the focused job. *Verify in production:* the `GOOGLE_MAPS_GEOCODING_API_KEY` needs the **Routes API** enabled on it — Geocoding and Routes are separate APIs, and a key that geocodes fine can still return `REQUEST_DENIED`, which degrades silently to estimates. Open a job in the Call Worksheet and confirm drive times shift.
3. **Owner smoke ECC/HERS Work-Sharing** in production — code is on `main`, loop unconfirmed.

If you are starting a session and just need the shortest answer to "what now?":

1. **Owner smoke ECC/HERS Work-Sharing** in live prod — its code is fully on `main` (incoming/decided/returned surfaces, receiver panel, migrations) and the feature branch is gone, but the end-to-end loop has not been confirmed against production. *(Company Profile Console was the other track here; it was smoked in production on 2026-08-09 and is now Closed.)*
2. **SMS: an owner action plus one merge.** The Twilio campaign was approved 2026-08-05 and production smoke passed; lift the test-phone suppression and press Activate. Separately, **Lane 7's provisioning wizard is built and green on `slice-04-twilio-provisioning`** and is waiting to merge — see Lane 7 for its env/cron prerequisites.
3. **Before switching live outbound texting on for more tenants, give inbound replies somewhere to land.** Two-way messaging is out of scope in the provisioning slice, so today a customer replying to an on-the-way text reaches no one. See the Customer Communication Completeness lane.
4. **PERF Slice 3** and the **Documentation consolidation Phase 2+** are safe, well-scoped parallel work that does not touch product runtime behavior.

Anything not in the Active lanes list is deferred or runbook-gated — do not start it without an explicit owner decision.

---

## Active lanes

### ECC Lane — Close the CHEERS Loop ◀ DESIGNATED FOCUS (2026-08-09)

- **Status:** Not started. Gated on an external answer, not on engineering capacity.
- **The gap, in the product's own words:** the ECC test system captures every diagnostic result, applies the rules engine (`lib/ecc/test-applicability.ts`, `scenario-resolver.ts`, `rule-profiles.ts`) to decide which tests apply, and then produces a **printable "CHEERS Entry Summary" described as "compact saved values for end-of-day CHEERS entry."** The rater retypes it into the registry. We take them to the doorstep and hand them a transcription sheet.
- **Why it is the flagship:** double entry is the daily time sink for the exact user we own, and a transcription error becomes a compliance error on a certificate that follows the property permanently. Closing it turns the ECC system from record keeping into compliance filing. No FSM competitor can follow us here — none of them model ECC at all.
- **Next safe slice:** **email CHEERS about EDDS access for an ECC-Rater Company's software.** CHEERS is CEC-approved to provide an external digital data source; no public API documentation exists, so their answer decides the build. If an API exists, build filing. If not, the fallback is a structured export shaped to their import format, which still removes most of the retyping. **Do not scope engineering before that answer.**
- **Guardrails:** the registry is the authority for filed compliance state — EveryStep must never present an unfiled result as filed, and must never imply registry acceptance it has not received. Same posture as QBO: downstream system, verified rather than assumed. Filing is a financial/compliance-grade action and belongs behind the same fail-closed discipline as payment truth.

### ECC Lane — supporting depth (after the CHEERS answer)

- Work-sharing is the acquisition channel, not just a feature: a rater's HVAC contractor customers can send work cross-account, which no competitor offers. Prod smoke first, then consider how a non-EveryStep sender requests a rater.
- Being demonstrably current on the 2025 Energy Code and ECC vocabulary is a sales asset with raters living the transition. Keep it current.


### Customer Communication Completeness ◀ NEW LANE (owner decision 2026-08-17)

- **Status:** Not started. Opened by the core-parity audit ([Core_Feature_Parity_and_Go_Live_Audit_2026-08-17.md](./ACTIVE/Core_Feature_Parity_and_Go_Live_Audit_2026-08-17.md)); the owner confirmed both halves belong in the app.
- **Why it is a lane and not polish:** the SMS pipeline is finished and A2P-approved, but only **one** of the eight declared message classes has an intent creator. `SMS_ALLOWED_MESSAGE_CLASSES` declares `scheduling`, `on_the_way`, `appointment_reminder`, `access_coordination`, `follow_up_no_answer`, `completion_notice`, `invoice_ready_notice`, `marketing_promotional`; only `sms-on-the-way-intent-create.ts` exists. Consent, suppression, quiet hours, delivery, status callback and audit are all already built for every class. This is the cheapest large competitive win available — buyer guidance ranks reminders as the single most-cited must-have in the category.
- **A. Two-way messaging — highest priority in this lane.** Inbound handling today covers STOP/HELP only (`twilio-inbound-processor.ts`); there is no conversation thread anywhere (`sms_conversation` / `message_thread`: zero hits), and two-way conversation is explicitly **out of scope** in the Lane 7 provisioning slice, so merging that lane does not close this. The moment outbound texting is live, customers reply "can you come later?" and nothing surfaces it to the office. **Sequencing rule: a landing surface for inbound non-STOP messages should exist before live outbound is switched on for additional tenants** — replies vanishing is a trust and liability problem, not a missing feature. Owner direction: this belongs fully inside the app, not in a third-party inbox.
- **B. Appointment confirmation text at booking.** Owner direction 2026-08-17: when an appointment is made, send a text **alongside the existing email**. The trigger already exists and is the right seam — `customer_job_scheduled_email` in `lib/actions/job-actions-shared.ts` fires on schedule with a schedule-signature dedupe key (a reschedule re-sends, a re-save does not) and queued→sent delivery tracking. Reuse that trigger and dedupe pattern; the matching message class is **`scheduling`**, already in the allowed enum.
- **C. Appointment reminder before the visit — distinct from B.** The `appointment_reminder` class is a day-before / morning-of nudge and is the actual no-show reducer. Confirmation-at-booking and reminder-before-visit are two different message classes and both are already declared. Do not let B be mistaken for C.
- **D. Invoice-sent and completion notices**, plus automated **invoice payment reminders** — no dunning of any kind exists today, so receivables chase is fully manual while `/reports/attention` surfaces the problem without acting on it. Same pipeline, `invoice_ready_notice` and `completion_notice` classes.
- **Next safe slice:** A landing surface for inbound non-STOP replies (A), then the `scheduling` confirmation text on the existing scheduled-email trigger (B).
- **Guardrails:** every new class inherits the existing consent/suppression/quiet-hours gates without exception — a new message class must never introduce its own send path or its own consent shortcut. `sms_message_intents` remains decision/audit truth and `sms_provider_deliveries` remains provider submission/callback truth for every class. Marketing/review-request classes stay a separate registration class with express opt-in and are **not** part of this lane. Reminder and confirmation sends must be idempotent per schedule signature so a reschedule storm cannot text a customer repeatedly.

### Invoice Work Final Closeout ◀ NEXT ACTIVE LANE

- **Status:** Active. Contractor saved-card C0-A foundation is the first owner-directed slice.
- **Scope:** C0 contractor saved-card self-service; I1 production proof; I2 delivery and customer payment-receipt closeout; I3 final field/desk guided-action, add-on/duplicate, responsive, and exception acceptance.
- **Next safe slice:** apply and validate the additive C0-A contractor-owned saved-method migration, then implement hosted setup/webhook completion as C0-B.
- **Closure boundary:** ACH, refunds/disputes, broad customer portal history, and recurring-payment expansion remain separate Payments V2 lanes and do not block invoice closure.
- **Plan:** [Invoice_Work_Final_Closeout_Plan_2026-07.md](./ACTIVE/Invoice_Work_Final_Closeout_Plan_2026-07.md).

### Lane 4 — SMS to Toggle-Ready ◀ NEXT NON-INVOICE LANE
- **Status:** Spec-complete, implementation in progress. The `SMS_*` spec family is locked:
  - Twilio / provider readiness
  - sender identity + provider configuration
  - message intent + provider delivery (audit truth boundaries)
  - On-the-Way template governance + editing/review actions
  - compliance / consent + recipient/contact role model
  F6D webhooks are DONE (Aug 2026): status callback + inbound STOP/HELP routes with Twilio signature validation, forward-only idempotent status mapping, and STOP → suppression writes. The intent → delivery → sandbox-submit pipeline is fully wired with admin UI (`/ops/admin/communications`: provider setup CRUD, sandbox send gate, verified test recipients, sandbox send queue), and tenant-generic consent capture lives on the customer page. Live SMS remains blocked behind activation gates; A2P campaign approval pending.
- **Goal:** finish the remaining slices so flipping the activation flag turns SMS on — with no active provider cost until toggled. This is a valid competitive selling point once toggle-ready.
- **Next safe slice:** LANE COMPLETE to live-capable (Aug 2026). A2P campaign approved; sandbox smoke passed in prod (submit → delivered 2.2s, STOP suppression verified). Live activation shipped: quiet-hours gate (8am–9pm account time zone), attested activate/deactivate flow in Admin Communications, auto-send on Mark On The Way when active, suppression lift UI, and one-step consent capture in the add-contact forms.
- **Reclassified 2026-08-17 (owner decision):** what this entry previously called "remaining niceties" — appointment reminders and invoice-sent notifications — are **not niceties**. They are table-stakes customer communication and have been promoted to their own lane, together with two-way messaging. See **Customer Communication Completeness** in the Active lanes above. Still genuinely optional here: per-recipient time zone and the review-request second campaign (parked until filed).
- **Guardrails:** Mark On The Way remains lifecycle/status truth first; SMS intent creation anchors to a successful `on_my_way` `job_events` row; `sms_message_intents` is decision/audit truth; `sms_provider_deliveries` is provider submission/callback truth; `job_events` is never provider-delivery truth. Twilio secrets stay server-only. No live send until legal/provider/A2P/STOP/HELP and explicit activation are complete.
- **Session size:** medium; well-scoped from prior spec work.

### ECC/HERS Account Work-Sharing (P1) + Partner Network — MERGED, awaiting owner prod smoke
- **Status:** Merged to `main`; awaiting owner prod smoke. Company-to-company ECC/HERS work sharing — a sender/contractor account sends an ECC/HERS testing request to a connected rater/receiver account. Snapshot-based: customer/location/scope values are frozen at send time; the receiver never reads the sender's live jobs or customers. Management UI is consolidated at `/ops/admin/connections`; the receiver's incoming queue is at `/ops/workshare/incoming`.
- **The full loop is now built and merged (July 12, 2026):**
  - **P1-C send ported to the v2 job layout** — the send control lives in `app/jobs/[id]/v2/page.tsx` (the classic job page is retired; the section existed only there before). Send/cancel actions carry a `return_to` so they land back on v2.
  - **P1-D2 decline** — receiver declines with a required reason (`sent→declined`), atomic RPC `decline_account_workshare_request`; requests leave the incoming queue for a new `/ops/workshare/decided` history. Migration `20260712120000`.
  - **P1-D2 accept → P1-E receiver job creation** — one-click "Accept & create job" creates an ECC job in the rater's account from the snapshot (reuse-first customer/location), stamps the `receiving_job_id` back-link, applies the rater's operational entitlement gate, and soft-deletes the job if the flip loses the `sent→` race. Migration `20260712130000`.
  - **Cross-account notifications, both directions** — the first cross-account notifications in the app: arrival (sender sends → rater notified) and outcome (rater accepts/declines → sender notified), in-app + best-effort email. A new audit table `account_workshare_request_events` records accept/decline/receiver-job events (no job exists at decline time).
  - **P1-F return loop** — the rater's ECC result flows back to the contractor, **rater-controlled** (nothing auto-fires — the rater sends the pass/fail when ready, with an optional note). Cross-account **retest loop**: contractor requests a retest with a corrections note → rater retests → result returns; the outcome is matched by `service_case_id` so retest child jobs still resolve to the original request. Installed **equipment ports** with the request (`job_systems`+`job_equipment` snapshot rebuilt on the rater's job). Migrations `20260712140000` (outcome), `150000` (retest loop), `160000` (equipment), `170000` (outcome-ack).
  - **Returned-work surfacing** — a sender-side **"Returned Work" chip** on `/ops` + queue at `/ops/workshare/returned` (persist-until-handled: a pass clears on "Mark handled", a fail on retest), so a returned result can't fall through when the source job is off-board. The legacy `/ops` handoff rail + `/ops/handoffs`/`/ops/connected-handoffs` routes were retired (routes-only).
- **Migrations applied to production July 12, 2026:** `20260712120000`–`20260712170000` (the six workshare migrations) are live in prod (applied alongside the two previously-pending QBO migrations `20260710120000`/`120100`, which db push carried along; QBO schema is additive and, at the time, its feature was gated on Intuit approval — **that gate cleared on 2026-08-03; QBO is live in production**, see Lane 5 below).
- **Remaining before Closed:** owner prod smoke of the full loop.
- **Parked cleanup (post-Close):** full decommission of the legacy handoff subsystem — its dormant backing (read models/actions, the handoff functions still entangled in the shared workflow-milestones `lib/workflows/actions.ts`, the retired-classic job panel, and the 4 `*_handoff_*` tables) — best done together with the classic v1 job-page retirement tracked in the PERF Slice 3 lane below.
- **Guardrails:** both tables RLS-scoped by `current_internal_account_owner_id()`; a request can only be sent on an `active` connection; the transition trigger permits only `sent→cancelled|declined|accepted` plus accepted-row outcome/retest/acknowledge updates, and fires even under the service-role client; decline/accept/outcome/retest RPCs are `service_role`-only. Cross-account name lookups + notification writes use the service-role client (the request row proves the active connection). To smoke a populated queue, first send a request from a sender account holding an active connection.

### Company Profile — Sectioned Settings Console (P0–P7) — CLOSED
- **Status:** **Closed (corrected 2026-08-09).** Previously carried as "awaiting owner prod smoke"; the owner exercised the console repeatedly against live production on 2026-08-09, running QuickBooks sync and reconciliation from the Integrations section and acting on the results. That is production smoke. `/ops/admin/company-profile` restructured from one long scroll into a sectioned settings console — Overview · Identity & Branding · Billing & Payments · ECC/HERS · Team & Roles. Per-section save model unchanged; ECC/HERS stays a link-out to the Partner Network; Team & Roles links out to People & Access.
- **Next safe slice:** sturdier SVG logo handling (restrictive CSP / `Content-Disposition` / rasterize on upload) is backlogged; the shared readiness/profile DB-boundary `any` types were left as-is.
- **Guardrails:** logo uploads are restricted server-side by MIME and extension, SVGs script-scanned and rejected before storage; all reads/mutations remain admin-gated and account-scoped server-side. No billing/payment/connection behavior change.

### QuickBooks Online Integration (Lane 5) — LIVE in production
- **Status:** Intuit production approval granted and the integration is live and syncing in production (owner-confirmed 2026-08-03). Available when the account owner has configured and authorized the integration. `lib/qbo/` (api client, connection, encryption, env, OAuth client, invoice sync, payment sync, void sync + tests), the OAuth callback at `app/api/qbo/callback/route.ts`, `qbo-connection-actions.ts` / `qbo-sync-actions.ts`, and the `QboIntegrationSection` in Company Profile are on `main`. Migrations `20260710120000`, `20260710120100`, and `20260809140000` (void columns) are applied to production.
- **Scope:** one-way EveryStep-to-QBO synchronization of eligible customers/invoice context, invoices and line items, recorded payments, and — since 2026-08-09 — invoice voids. After Stripe or an authorized internal workflow confirms payment and EveryStep records payment truth, EveryStep attempts to create and apply the related QBO Payment to the matched QBO invoice. Nothing is read back from QBO to drive EveryStep state. `intuit-oauth` only (node-quickbooks rejected).
- **Payment-controls hardening (2026-08-09):** void propagation, refund/dispute handling, and a scheduled three-way reconciliation shipped. Full detail, including the production root cause and one reverted wrong fix, in [Payment_Controls_Hardening_Closeout_2026-08-09.md](./ACTIVE/Payment_Controls_Hardening_Closeout_2026-08-09.md).
- **Next safe slice:** apply the verify-after-write pattern to `createQboInvoice` and the QBO payment sync. Both still treat a 2xx as proof the record landed, which is exactly how the void bug stayed invisible for six days; the void path now re-reads and confirms, and these two do not.
- **Guardrails:** Stripe remains processor truth; EveryStep remains operational source of truth for all job, customer, invoice, payment, and closeout data; QBO remains optional downstream accounting state. Synchronization is best effort and depends on connection, authorization, provider/API availability, and record matching. Intuit secrets stay server-only; the callback runs through the `proxy.ts` bypass; `realmId` is read from the callback URL, not the token body. **The void operation parameter is `?operation=void`, not `?operate=void`** — QBO ignores an unrecognized query parameter silently, so the wrong spelling surfaces as an unrelated "Required parameter Line is missing" validation error. Never add `Line` to a void body to satisfy that error: it makes QBO perform a full update that rewrites the invoice instead of voiding it. Reconciliation is report-only by design and must never be given write access to money.

### App Store Wrap — Capacitor (Lane 6) — shell scaffolded + validated, store distribution deferred
- **Status:** Deliberately last, but the groundwork exists earlier than the sequence implies: a Capacitor 8 remote-URL Android shell is scaffolded and validated (`capacitor.config.ts`, the `android/` project, and `@capacitor/core` `^8.4.1` + `@capacitor/geolocation` `^8.2.0` in `package.json`). Stopgap splash in place; **no local Android toolchain yet and no store submission.**
- **Next safe slice:** none scheduled — store distribution stays parked until everything above Lane 6 is solid. Local Android toolchain build + `assetlinks` / `/.well-known/` proxy allow are the first steps when the lane opens.
- **Guardrails:** Web/PWA remains the baseline; web-layer changes keep deploying instantly. No store-review cycle entered without an explicit owner decision.

### Admin Center Restructure
- **Status:** Active / next, continuing the sectioned-console direction. First-owner acceptance now routes into the Admin Center readiness setup at `/ops/admin`; the Company Profile console established the sectioned-settings pattern to extend.
- **Next safe slice:** continue extracting admin / onboarding / readiness surfaces into the sectioned model (Launch Room / Training Room / readiness surfaces as proposed).
- **Guardrails:** the locked Company Profile §2A UX model in [ACTIVE/Startup_Maturity_Lane_Model_Lock.md](./ACTIVE/Startup_Maturity_Lane_Model_Lock.md) governs page/field ordering and the primary/Advanced split (provider/Stripe internals stay behind Advanced). Keep account scoping + admin authz server-side; no settings removed without owner sign-off.

### Documentation Audit / Consolidation
- **Status:** Active. Full documentation audit complete. Phase 0 (safe deletes + archive scaffolding) and Phase 1 (create PROJECT_TRUTH, CURRENT_ROADMAP, SESSION_CONTEXT_TEMPLATE; retire the Active Spine to a redirect stub) are being executed. Control-plane authority: [ACTIVE/Documentation_Authority_Map.md](./ACTIVE/Documentation_Authority_Map.md) and [ACTIVE/Documentation_Consolidation_Audit.md](./ACTIVE/Documentation_Consolidation_Audit.md).
- **Next safe slice:** Phase 2+ — de-dup merges (invite-flow docs, GTM docs, launch-readiness cluster), trim control-plane/roadmap docs to their lanes, archive historical closeouts to `docs/ARCHIVE/closeouts/`, add an SMS documentation index.
- **Guardrails:** documentation-only. No schema, Supabase, RLS, Stripe/payment, server-action, component, or `.github/instructions`/`.github/prompt` changes. Anything carrying a locked decision, production-protection rule, or owner-approved boundary is flagged for owner review, never blind-deleted.

### Performance — Identity Resolution fast-path (Slice 3)
- **Status:** Slices 1 and 2 are merged to `main` (request-scoped identity dedup + shared memoized `getRequestUser()` + v2 job-detail timing). Slice 3 is open and unstarted.
- **Next safe slice:** finish the `getRequestUser()` migration across remaining routes, retire the dead v1 job-detail route, then the separate `revalidatePath` / `getClaims` / build-tooling sub-lanes. Backlog: [PERF_IDENTITY_RESOLUTION_SLICE3_BACKLOG.md](./ACTIVE/PERF_IDENTITY_RESOLUTION_SLICE3_BACKLOG.md).
- **Guardrails:** behavior-preserving only. No revalidation trimming without dependency mapping; billing paths off-limits; no source-of-truth changes without a dedicated audit.

---

## Recently closed lanes

One-liner per lane (detail lives in the ledgers):

- **Lane 1 — Field Invoice Flow V1** — CLOSED (July 9, 2026). Non-technical user on a phone goes from job complete to invoice sent without re-entry (pricebook price carry-through, mobile invoice compression, quick-add with optional pricebook save).
- **Lane 2 — Landing Page Polish** — CLOSED (July 9, 2026). Warm, crafted landing/login + signup funnel (off-white `#faf7f2`, navy, terracotta accent); front-end only. Note: the landing page IS the login page — no separate marketing route.
- **Lane 3 — Google Review Ask** — CLOSED (July 9, 2026). One-tap Google review ask on `field_complete` jobs via device-intent `mailto:`/`sms:`; per-account `google_review_url`; no SMS provider dependency.
- **Field Invoice charge-form progressive disclosure** — CLOSED (July 9, 2026). Two-tier charge entry on desktop + manual-add (Item Name + Unit Price + live subtotal; Type/Qty/Description collapsed). (Branch mislabeled "lane3"; it is a Field Invoice Flow follow-on, not roadmap Lane 3.)
- **Service model buildout (milestone 1)** — CLOSED. Service Contract V1, relationship-aware intake V1, Visit Scope, Waiting State V1, Service Case reconciliation.
- **Payments P1 foundation** — CLOSED at current baseline. Payment tracking + manual payment ledger + collected-payment reporting; Stripe Platform Subscription V1 live-smoke confirmed.
- **Operational entitlement mutation guard** — CLOSED, production-promoted. Expired/invalid entitlement blocks operational mutations server-side (see PROJECT_TRUTH §16).
- **True App / PWA V1** — CLOSED for controlled tester use. `proxy.ts` is the correct Next.js 16 routing convention; native-store distribution deferred.
- **Reporting / analytics (milestone 3)** — substantially complete for current scope.
- **Estimates AI and proposal delivery** — CLOSED in code (July 20, 2026); owner-controlled production testing continues. Includes concise Estimate Coach/line rewrite support, owner-only $25 monthly AI budget tracking, repository-backed Trainer with durable help-gap logging, estimate photos with explicit customer visibility, combined Finalize & Send Proposal, and comparison proposals that require two populated choices with an optional third.

---

## Deferred items (intentional, not missing)

These are future/business-layer modules, not spine failures. Each stays parked unless an explicit owner decision reopens it.

**Product-surface deferrals**
- **Customer portal / client hub** — **sequenced behind the ECC lane, not abandoned (owner decision 2026-08-09).** Verified 2026-08-09 as the largest genuine competitive gap for the HVAC-service side: Jobber's Client Hub, Housecall Pro's self-serve portal with booking/cancel/reschedule, and ServiceTitan all sell it hard, and it partially unlocks online booking and customer self-service payment too. It is deferred because the ECC lane is the strategy, **not** because it is unimportant — the owner intends to close this gap when service-side work resumes. Today only the *contractor* portal exists (`app/portal`), authorized by frozen billing identity. *Unlock:* owner reopens the HVAC-service parity lane.
- **Bulk customer / location import** — **newly named gap (2026-08-17).** Pricebook has CSV import (`lib/business/pricebook-import.ts`, `PricebookImportPanel.tsx`); customers have **export only** (`/customers/export`) and no import path, and QBO sync is one-way push so customers cannot be pulled from QuickBooks either. An HVAC company switching in with thousands of existing customers has no supported way to bring them. This is an **adoption blocker disproportionate to its build cost** — it gates every migrate-from-a-competitor deal — and the Pricebook importer is a working in-repo pattern to follow. *Unlock:* owner decision; recommended alongside the customer portal when service-side work resumes.
- **Reviews / marketing suite beyond the Google review ask** — out of scope. *Unlock:* owner decision.
- **Online booking; AI receptionist / call tracking** — out of current product scope. *Unlock:* owner decision.
- ~~**Route Builder / Schedule Assist** — nice-to-have, not operationally urgent.~~ **BUILT — no longer deferred (corrected 2026-08-09).** Route planning shipped 2026-08-08: `lib/routing/` (geocoding, geometry, area clustering, day-fit, route plan engine, route links) with test coverage, a plan view at `/calendar?view=plan`, and migrations backfilled on both databases. Documented in [Route_Planning_V1_Current_State.md](./ACTIVE/Route_Planning_V1_Current_State.md). *Next slice:* live drive times via the Google Routes API (`geometry.ts` is the single seam) and per-job duration entry — every unknown job is currently planned as 120 minutes.
- **GPS / location timers** — **partly built (corrected 2026-08-09).** The *timer* half shipped: `lib/time-clock/` holds mutations, read model, and settings controls with test coverage. The *GPS/location* half does not exist — nothing in `lib/time-clock/` captures coordinates. Still deferred: attaching location to clock events. *Unlock:* owner decision; the QBO/app-wrap sequencing note is obsolete now that Lane 5 is live.
- **Additional dispatch UX micro-polish** — core scheduling is complete (PROJECT_TRUTH §10); this is UX-only and opportunistic.

**Payments / billing deferrals**
- **Deeper Payments V2** — **only ACH is still deferred (corrected 2026-08-09).** *Unlock:* owner decision; the "after Lane 5 (QBO) posture is set" condition is met, since QBO went live 2026-08-03. The rest of this entry has shipped and should not be re-planned:
  - **Autopay** — scheduled autopay attempt submission and failed-autopay manual retry are implemented with test coverage (`lib/business/tenant-saved-method-payment-attempts.ts`).
  - **Saved-method self-service** — pulled into active implementation 2026-07-16 (PROJECT_TRUTH §Payments).
  - **Refunds and disputes** — inbound Stripe handling shipped 2026-08-09: a full refund reverses the payment, a partial refund is raised for manual allocation, a dispute reverses only when lost. Still deferred *within* this: operator-initiated refunds from inside EveryStep, and pushing a reversal into QuickBooks rather than surfacing it for manual removal. See [Payment_Controls_Hardening_Closeout_2026-08-09.md](./ACTIVE/Payment_Controls_Hardening_Closeout_2026-08-09.md).
- **Service Plan billing / autopay / generated-invoice expansion** — beyond the current maintenance-agreement baseline. *Unlock:* owner decision + Payments V2 sequencing.
- **Controlled production money-flow / deposit proof** — COMPLETE; live gross/fee/net, detail/CSV, and payout/bank explanation smoke passed.

**Platform / packaging deferrals**
- **Native app-store wrapper ahead of Lane 6** — **the shell already exists (corrected 2026-08-09).** A Capacitor 8 remote-URL Android shell is scaffolded and validated: `capacitor.config.ts` and the `android/` project are in the repo. What is deferred is *store distribution*, not the wrapper. Outstanding: a local Android toolchain build, replacing the stopgap splash, and a `/.well-known/` proxy allow for `assetlinks`. Web/PWA remains the baseline and the wrap stays deliberately last. *Unlock:* everything above Lane 6 solid.
- **Deeper offline mode** — not operationally urgent. *Unlock:* owner decision.
- **Full support-system buildout beyond runbook-gated posture** — see runbook-gated items.

**Field-workflow deferrals**
- **Checklist Phase 2 — Field Mode** — target surface `MobileJobDetailV2Preview`; not part of Field Invoice Flow V1. *Unlock:* separate mobile-surface audit + explicit owner sign-off.
- **Tech dispatch phone notifications** (PROJECT_TRUTH §11.9 backlog) — **partly built; this entry was wrong (corrected 2026-08-17).** The previous wording said "nothing fires on assignment." Assignment **does** notify: `notifyJobAssignmentCreated` (`lib/actions/job-actions-shared.ts:431`) is called from `job-assignment-actions.ts:497`, `job-actions.ts:3852` and `job-actions-shared.ts:581`, writes an `internal_job_assigned` notification through `insertTargetedInternalNotification`, which invokes account-scoped web push, and `internal_job_assigned` has its own push template (`web-push-delivery.ts:76`). So assignment → in-app + web push is live. What is genuinely missing: an **SMS/phone** notification to the tech (web push requires the PWA installed and permission granted), and a **per-user on/off preference**. *Unlock:* owner decision.
- **Inventory, job costing, payroll, financing, mileage / expense capture, broad customer-specific pricing complexity** — out of current product scope. *Unlock:* owner decision.

---

## Runbook-gated items (gate must pass first)

Built or partially built, but held behind an explicit flag/runbook and owner approval before production enablement.

- **Live SMS send** — Gate: toggle-ready slices + webhook/signature validation + STOP/HELP/opt-out + legal/provider/A2P + explicit activation. Owner doc: the `SMS_*` spec family (`SMS_Provider_Twilio_Readiness_Spec.md` and related).
- **QuickBooks Online sync (Lane 5)** — Optional/account-configured. Code is on `main` and both migrations are applied to production. Eligible invoice and recorded-payment synchronization remains downstream and best effort. Owner doc: the QBO integration detail above.
- **Estimates production** — Code and required schema are deployed for owner-controlled production testing; the owner confirmed `20260720150000_estimate_photos.sql` applied on July 20, 2026. Runtime capabilities remain independently environment-gated, including Estimates, AI coaching/Trainer, and real proposal email delivery. Owner doc: [ACTIVE/Estimates_Production_Enablement_Runbook.md](./ACTIVE/Estimates_Production_Enablement_Runbook.md).
- **Support Console** — Gate: `ENABLE_SUPPORT_CONSOLE` (fail-closed, unset in prod); sessions are read-only, account-owner scoped, audited. Owner doc: [ACTIVE/Support_Console_Production_Enablement_Runbook.md](./ACTIVE/Support_Console_Production_Enablement_Runbook.md).
- **Owner-Scoped Permit Workflow** — Gate: `ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS` allowlist (owner/operator only; internal Permits visibility, contractor Request Permit exposure, and permit mutations all fail closed outside the allowlist). Owner doc: [ACTIVE/Owner_Scoped_Permit_Workflow_V1_Model_Spec.md](./ACTIVE/Owner_Scoped_Permit_Workflow_V1_Model_Spec.md).
- **Automatic deposit settlement sync** — COMPLETE for new webhook-recorded Stripe payments; controlled manual refresh remains the late-payout and historical fallback.
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
4. **Lane 4 — SMS to Toggle-Ready** — ACTIVE (next). Reach flip-the-flag readiness; no provider cost until toggled.
5. **Lane 5 — QuickBooks Online Integration** — **BUILT; optional and account-configured.** Full `lib/qbo/` module, OAuth callback (`app/api/qbo/callback/route.ts`), connection/sync server actions, and Company Profile integration controls are on `main`; both migrations (`20260710120000` connections foundation + `20260710120100` internal-invoice sync columns) are applied to production. Current scope is one-way EveryStep-to-QBO synchronization of eligible invoice information and recorded payments. Locked boundary: Stripe is processor truth, EveryStep is operational invoice/payment truth, and QBO is downstream accounting state. Synchronization is best effort and provider-dependent.
6. **Lane 6 — App Store Wrap (Capacitor)** — **shell scaffolded + validated; store distribution deferred (deliberately last).** A Capacitor 8 remote-URL Android shell exists (`capacitor.config.ts`, `android/`, `@capacitor/core` + `@capacitor/geolocation` in `package.json`) and has been validated; no local Android toolchain yet and no store submission. Web/PWA remains the baseline and everything above should be solid before entering App Store review cycles. Apple targets an Unlisted App Store app; Android direct-install/sideload or Play Store. Web-layer changes keep deploying instantly after the wrap is live.
7. **Lane 7 — SMS Self-Serve Tenant Provisioning (automated)** — **BUILT AND GREEN; awaiting merge (corrected 2026-08-17).** The "Enable texting" wizard is implemented end to end on `slice-04-twilio-provisioning`: 9 commits, ~5,938 insertions across 30 files, zero commits behind `main` and cleanly mergeable. Verified 2026-08-17: typecheck clean, 663 test files / 6,396 tests passing (+8 files, +127 tests over `main`, nothing broken).
   - **What is on `main` already:** only the Slice 04 schema foundation, migration `20260813120000_sms_self_serve_provisioning_foundation.sql` (`sms_provisioning_registrations`, `sms_provider_subaccount_credentials`, activation-attestation columns).
   - **What is on the branch:** `twilio-provisioning-client.ts` (TrustHub, subaccounts, numbers, Messaging Services, brands, campaigns), `sms-provisioning-orchestrator.ts` (step state machine), `sms-provisioning-poller.ts`, the tenant wizard at `app/ops/admin/communications/provisioning/`, `sms-provisioning-actions.ts`, `sms-self-serve-gate.ts`, `sms-credentials-encryption.ts`, `sms-account-resolution.ts`, `sms-activation-state.ts`, per-tenant webhook signature validation on both Twilio routes, and live send restricted to the governed current template version.
   - **Architecture (locked by the slice's decision record):** one Twilio subaccount per tenant (brands cannot move across accounts later); subaccount auth tokens stored AES-256-GCM encrypted in a no-tenant-policy table, because subaccount status callbacks are signed with that subaccount's token; A2P Low-Volume Standard primary with sole-proprietor fallback for no-EIN tenants; polling cron rather than Event Streams; system-written verification replacing the honor-system checkbox for wizard-provisioned tenants; mock mode so the state machine is exercisable in sandbox without TCR spend. **Provisioning ends at `ready_for_activation` and never flips `activation_status`** — the three-attestation live activation step is unchanged.
   - **Merge prerequisites:** `SMS_CREDENTIALS_ENCRYPTION_KEY` (32-byte hex, same validation as `QBO_ENCRYPTION_KEY`), `ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS`, optionally `ENABLE_SMS_ADVANCED_CONSOLE_ACCOUNT_OWNER_IDS` and `SMS_PROVISIONING_ENVIRONMENT`, and the new `/api/cron/sms-provisioning-poll` 10-minute cron in `vercel.json`. **Sandbox mode still purchases a real subaccount and number (~$1.15/mo until deleted)** — mock avoids TCR registration fees, not number cost.
   - **Entitlement is an owner allowlist in v1**, so this is self-serve *for tenants the owner switches on*; concierge cost drops sharply but does not vanish until a billing add-on replaces the allowlist. Named follow-ups from the slice: toll-free verification · Event Streams sinks · billing add-on · Compliance Embeddable · additional campaign classes (review-request, marketing) · **two-way conversations** · migrating the platform owner's own manual setup into a subaccount.
   - Owner docs: `docs/ACTIVE/SMS_Tenant_Self_Serve_Provisioning_Lane_Spec.md` (product authority) and `docs/SLICES/SLICE-04-twilio-self-serve-provisioning.md` (implementation contract, on the branch).

Interleaved with the numbered lanes: finish the MERGED-awaiting-smoke tracks (ECC/HERS Work-Sharing — the full loop through P1-F, both notification directions, and the returned-work chip are built and merged, pending production migrations `20260712120000`–`20260712170000` + owner smoke; Company Profile console owner smoke), continue the Admin Center restructure, complete the Documentation consolidation, and land the PERF identity-resolution Slice 3.

Underlying product-track checkpoint (recommended emphasis order): service model buildout (milestone 1 closed) → billing/invoice workflow (milestone 2) → reporting/analytics (milestone 3, substantially complete) → RLS completion / permission hardening → Payment P1 closeout (closed) → out-of-box readiness / business identity / settings packaging → Pricebook V1 continuation → smaller service-model / service-workflow refinements.

---

## Related documents

- [PROJECT_TRUTH.md](./PROJECT_TRUTH.md) — stable product facts, locked architecture, standing constraints.
- [SESSION_CONTEXT_TEMPLATE.md](./SESSION_CONTEXT_TEMPLATE.md) — paste-at-start session briefing.
- [ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md](./ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md) — deeper strategic sequencing / deferred-lane authority.
- [ACTIVE/Tactical_Punch_List_Closeout_Ledger.md](./ACTIVE/Tactical_Punch_List_Closeout_Ledger.md) — tactical closeout evidence (commits/smoke).
- [ACTIVE/Domain_Model_Closeout_Evidence_Ledger.md](./ACTIVE/Domain_Model_Closeout_Evidence_Ledger.md) and [ACTIVE/Service_Plan_Model_Closeout_Evidence_Ledger.md](./ACTIVE/Service_Plan_Model_Closeout_Evidence_Ledger.md) — durable closeout evidence.
- [ACTIVE/Documentation_Authority_Map.md](./ACTIVE/Documentation_Authority_Map.md) — which doc owns what.

Last updated: 2026-08-17 — core-parity audit pass. Lane 7 corrected from "not started" to built-and-green-awaiting-merge; Customer Communication Completeness opened as a new lane (two-way messaging, confirmation text at booking, reminder before visit, invoice notices/dunning); bulk customer import named as a deferred gap; the tech-dispatch-notification entry corrected (assignment does fire in-app + web push). Prior revision: July 2026 (created during the documentation consolidation, Phase 1).
