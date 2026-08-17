# Core Feature Parity and Go-Live Readiness Audit — 2026-08-17

Status: ACTIVE AUDIT REPORT
Mode: documentation/audit only — no product code, schema, migration, Supabase, Stripe, QBO, SMS/provider,
production, or feature-flag changes were made by this audit.
Authority: subordinate to [PROJECT_TRUTH.md](../PROJECT_TRUTH.md) and [CURRENT_ROADMAP.md](../CURRENT_ROADMAP.md).
Supersedes the competitor half of [Current_App_Baseline_and_Competitive_Audit_2026-07-06.md](./Current_App_Baseline_and_Competitive_Audit_2026-07-06.md).

## 1. Purpose and method

Question asked: is the product as it stands ready to go, does it cover the core features of comparable
field-service platforms, what is built right, and what belongs in core vs. next-stage.

This audit differs from the 2026-07-06 baseline in one way that matters: **every claim below was checked
against the code, not against the control-plane docs.** Where a doc and the code disagreed, the code won
and the disagreement is recorded in §7.

Method:
- Full route/module inventory (`app/`, `lib/`, `components/`, `supabase/migrations/`).
- Feature-presence greps for each competitor table-stakes capability, then manual reading of every
  ambiguous hit (an enum value is not an implementation).
- Engineering health run locally: build, typecheck, unit suite, lint.
- Branch/deploy state compared against `main`.
- Market check refreshed 2026-08-17 against current HVAC FSM buyer guidance (see §9).

Standing assumption, per owner instruction: **the Twilio provisioning wizard is assumed to work as
expected.** §2 records where it lives and what it does and does not cover.

> **Correction notice (same-day).** The first version of this audit reported that the wizard did not exist
> and that a 39-commit delta was unmerged. Both were wrong, caused by comparing against a **stale local
> `main` ref without fetching first**. `origin/main` is current, the branch delta is zero, sales tax is
> deployed, and the wizard is fully built on `slice-04-twilio-provisioning`. §2 and §4 below are the
> corrected findings. Nothing in §3 or §5–§9 depended on the error.

## 2. The Twilio self-serve provisioning wizard — where it lives and what it covers

**The wizard is built.** It lives on `origin/slice-04-twilio-provisioning`: **9 commits, ~5,938
insertions across 30 files**, dated 2026-08-13 through 2026-08-17. The branch is **zero commits behind
`main`**, so it is cleanly mergeable. What is on `main` today is only the Slice 04 schema foundation
(migration `20260813120000`, committed `2189b42`); the engine and UI are on the branch awaiting merge.

| Component | File | Size |
|---|---|---|
| Twilio provisioning API client (TrustHub, subaccounts, numbers, Messaging Services, brands, campaigns) | `lib/communications/twilio-provisioning-client.ts` | 953 lines |
| Step orchestrator / state machine | `lib/communications/sms-provisioning-orchestrator.ts` | 904 lines |
| Registration status poller | `lib/communications/sms-provisioning-poller.ts` | 471 lines |
| Tenant-facing wizard UI | `app/ops/admin/communications/provisioning/page.tsx` | 376 lines |
| Server actions | `lib/actions/sms-provisioning-actions.ts` | 194 lines |
| Per-tenant account resolution (webhook validation + live send) | `lib/communications/sms-account-resolution.ts` | 183 lines |
| Self-serve entitlement gate | `lib/communications/sms-self-serve-gate.ts` | 109 lines |
| Subaccount credential encryption | `lib/communications/sms-credentials-encryption.ts` | 59 lines |
| Activation state derivation | `lib/communications/sms-activation-state.ts` | 70 lines |
| Test coverage added | 10 new/expanded spec files | ~2,000 lines |

Also changed: multi-account webhook signature validation on both Twilio routes, live-send restricted to
the governed current template version, admin Communications console reworked with an audience split, and
a 10-minute poller cron added to `vercel.json`.

Architecture, per the slice's own decision record (`docs/SLICES/SLICE-04-twilio-self-serve-provisioning.md`):
one Twilio subaccount per tenant (brands cannot be moved across accounts later); encrypted subaccount
auth tokens in a dedicated no-tenant-policy table, because subaccount status callbacks are signed with
that subaccount's token; A2P Low-Volume Standard as the primary path with a sole-proprietor fallback for
tenants with no EIN; entitlement gate v1 as an owner allowlist env var; polling rather than Event Streams;
real system-written verification replacing the honor-system checkbox for wizard-provisioned tenants; and
mock mode so the whole state machine is exercisable in sandbox without TCR spend.

**Assessment.** This is the most carefully built lane in the repo, and the three self-review commits on
2026-08-17 are the reason. They caught, among others: a Mock/sandbox completion that would overwrite
`provider_account_ref` on a live tenant's config and reroute real customer texts into an unregistered
lane; two concurrent clicks both passing the adopt check and **buying a second phone number**; brand and
campaign steps creating instead of adopting, exposing a non-refundable double-fee path; status writes in
Twilio's hyphenated vocabulary violating the migration's underscored CHECK constraint on the first real
review cycle; a completion-time DB error stamping the row complete and stranding the account permanently
unable to activate; and unstamped poll rows sorting `NULLS FIRST` so unentitled registrations would starve
entitled tenants out of the poll window. Money-spending steps are now serialized by a conditional flip
with a two-minute takeover window, `twilioRequest` has a 90-second deadline so a hung purchase cannot
outlive that window, and the registration path locks once a TrustHub bundle exists. The lane spec's
"failure states are first-class with retry/edit" lock is honoured in the UI — rejection maps to
`twilio_rejected` with `last_error`, the step re-runs in place with operator corrections, and reservation
losers get a distinct "already running" notice rather than copy claiming a carrier review that never
happened.

**What the slice deliberately does not cover** (named follow-ups in its §4): toll-free verification ·
Event Streams sinks · a billing add-on replacing the owner allowlist · Twilio Compliance Embeddable ·
additional campaign classes for review-requests and marketing · **two-way conversations** · migrating the
platform owner's own existing manual setup into a subaccount.

Two consequences worth holding onto. First, entitlement v1 is an **owner allowlist**
(`ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS`), so this is self-serve *for tenants the owner switches on* —
the concierge cost does not fully disappear until the billing add-on replaces the allowlist. Second,
two-way conversation is explicitly out of scope here, which reinforces §6.1 gap 2 rather than resolving it.

**Merge and deploy prerequisites** (from the branch itself): apply migration `20260813120000` to the target
database, set `SMS_CREDENTIALS_ENCRYPTION_KEY` (32-byte hex, same validation as `QBO_ENCRYPTION_KEY`),
set `ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS` and optionally
`ENABLE_SMS_ADVANCED_CONSOLE_ACCOUNT_OWNER_IDS` and `SMS_PROVISIONING_ENVIRONMENT`, and confirm the new
`/api/cron/sms-provisioning-poll` cron is live. Note the sandbox path still purchases a **real** subaccount
and number (~$1.15/mo until deleted) — mock mode avoids TCR registration fees, not number cost.

## 3. Engineering health — measured, not asserted

Run 2026-08-17 with dependencies installed, on `main` and again on the unmerged provisioning branch:

| Check | `main` (`dc14216`) | `slice-04-twilio-provisioning` |
|---|---|---|
| `npm run build` (Next 16.2) | **PASS** — full route manifest | not re-run |
| `npx tsc --noEmit` | **PASS** — zero errors | **PASS** — zero errors |
| `npm test` (vitest) | **PASS** — 655 files, 6,269 tests, 0 failures, 126s | **PASS** — 663 files, **6,396 tests**, 0 failures, 109s |
| `npm run lint` | 3,205 errors / 327 warnings — see note | not re-run |
| Migrations | 170 files | 170 (its migration is already on `main`) |
| E2E (Playwright) | 2 spec files (`authenticated.spec.ts`, `public-pages.spec.ts`) | unchanged |

The provisioning branch adds 8 test files and 127 tests and breaks nothing — a clean bill of health on the
largest slice in the repo.

Lint note: the error count looks alarming and mostly is not. It is dominated by
`@typescript-eslint/no-explicit-any` at DB boundaries plus `no-require-imports` in root-level helper
scripts (`smoke.js`, `test_billing.js`, `scripts/*-debug.ts`). Next does not fail the build on lint here,
and typecheck is clean. This is accumulated debt with a real cost — `any` at a Supabase boundary is
exactly where a schema drift slips through unnoticed — but it is not a launch blocker. Worth a
scoped cleanup lane, not a hold.

**6,269 passing tests with a clean typecheck is a genuinely strong signal** and well above what a product
at this stage usually carries. The thin E2E layer is the real coverage gap: the money paths (Checkout,
signed payment links, portal scope) are covered by unit tests and by the manual prelaunch checklist, not
by automated browser runs.

## 4. Deploy state — verified against `origin/main`, no divergence

`origin/main` is at `dc14216` (2026-08-16). The audit working branch shares that commit exactly:
**0 commits behind, and ahead only by this audit document.** Migration file lists are **identical at 170
files** on both. Invoice sales tax is on `main` — migration `20260812180000_invoice_sales_tax_foundation.sql`
plus tax surfaces in the invoice line-items table, the invoice page, the public payment page, Pricebook,
Company Profile and customer edit — which matches the owner's report of seeing tax in the app today.

So all of the following **is** in production code: invoice sales tax, QBO per-line item mapping and
verify-after-write, offline ECC test-form drafts, the job-actions decomposition, the server-action
export-surface reduction, and the 2026-08-16 Ops workspace refactor.

**Method note, recorded because it changed a conclusion.** The first pass of this audit compared against
the *local* `main` ref, which the session clone had left at `bb4f2d0` (2026-08-12), and reported a
false 39-commit unmerged delta including sales tax. `git fetch origin --prune` resolved local `main` to
`dc14216` and the delta to zero. **Any future audit that compares branches must fetch first and compare
against `origin/*`, never a local ref inherited from a clone.**

The genuine release-state item is narrower: **`slice-04-twilio-provisioning` is unmerged** (§2), along with
a number of other unmerged feature branches on the remote. That branch is up to date with `main` and
carries its own migration plus new env and cron requirements.

## 5. What is built right

Verified present and coherent, roughly in order of how much competitive strength it carries.

**The differentiated core — nobody else has this**
- **ECC/HERS test system** (`lib/ecc/`: test registry, applicability rules, scenario resolver, rule
  profiles, AHRI verification, fan watt draw, QII/insulation, refrigerant charge with non-numeric failure
  reasons). No FSM competitor models energy-code compliance testing at all. This is the moat and it is
  real code, not a wrapper on a form builder.
- **Cross-account ECC/HERS work-sharing** (`app/ops/workshare`, `lib/workflows`): a contractor account
  sends a testing request to a rater account, snapshot-frozen, with accept/decline, receiver job creation,
  equipment porting, a rater-controlled return loop, a cross-account retest loop, and bidirectional
  notifications. This is an acquisition channel disguised as a feature — no competitor offers it.
- **Compliance-grade discipline applied to money.** QBO void propagation re-reads the record rather than
  trusting a 2xx, and a scheduled **three-way reconciliation** compares EveryStep against QuickBooks *and*
  Stripe independently of the sync engine, report-only. Most FSM tools push to QuickBooks; very few verify
  the push landed, and almost none detect drift they didn't cause. This is a legitimate trust
  differentiator against every competitor named in §9.

**Core FSM spine — at or above category parity**
- Job / visit / service-case model with a canonical `job_events` ledger and `ops_status` as a strict
  projection. A better-disciplined data model than most SMB FSM products, which conflate "job" and "visit."
- Ops command center with an enforced queue-membership parity contract (counts, rows, focused routes,
  filters and exports all share one classifier) and active-leaf exclusivity on retest chains.
- Calendar/dispatch: day/week/month/list, drag-and-drop, assignment-aware, tech filter, historical
  visibility of closed/cancelled jobs.
- **Route planning** (`lib/routing`) with area clustering, day-fit scoring, drive-order sequencing,
  arrival windows, and **live Google Routes drive times** passed into a pure engine as data. Surfaced as
  the Call Worksheet at `/calendar?view=plan`. Ahead of Jobber/Housecall Pro's basic map view.
- Customers / locations / equipment with address autocomplete + geocode capture, equipment role vocabulary
  with server-side field sanitization, system filters, lifecycle replacement/retirement.
- Estimates and multi-option proposals with an AI coach (budget-capped, fails closed to a deterministic
  coach), photos with explicit customer visibility, token-based customer approval, and estimate→job/invoice
  conversion.
- Invoicing: draft/issue/send/void, consolidated and supplemental invoice families, PDF and print, Visit
  Scope → invoice provenance, Pricebook with CSV import, and sales tax (pending merge per §4).
- Payments: Stripe Connect Checkout, public signed invoice links requiring no account, saved cards,
  scheduled autopay with failed-retry, inbound refund/dispute handling, payment allocations, deposits and
  payout reconciliation with fee/net explanation and CSV export.
- Reporting: ~20 report routes with CSV exports — payments register, invoice ledger, deposits, failed
  payments, job-visit ledger, service cases, time clock, KPIs, monthly owner overview, and an attention
  center that concentrates stalled/failed financial workflows in one place.
- Time clock with admin review/correction, history and export.
- Service plans / maintenance agreements with templates, billing periods, visit linkage, next-due
  confirmation.
- Notifications: in-app ledger, email, and account-scoped web push — **including push on job assignment**
  (see §7).
- Contractor portal scoped by frozen billing identity rather than job assignment, with invoices, jobs,
  intake submissions and permit requests all repeating the same boundary check.
- Operational entitlement guard blocking mutations for expired/missing entitlement, server-side.
- PWA install + push + device setup; validated Capacitor 8 Android shell.
- Roles: `admin` / `office` / `tech` / `billing`, with a separate financial-access policy layer.

**What "built right" means here beyond the feature list:** the source-of-truth boundaries are enforced
rather than documented, the additive-migration discipline held across 170 migrations, and payment truth is
webhook-confirmed rather than optimistic. That is the part that is hard to retrofit, and it is done.

## 6. Gaps — core vs. next stage

### 6.1 Core gaps (table stakes for an HVAC service company; ranked by ratio of value to build cost)

**1. Automated appointment reminders and confirmations — highest priority.**
`SMS_ALLOWED_MESSAGE_CLASSES` declares eight classes (`scheduling`, `on_the_way`, `appointment_reminder`,
`access_coordination`, `follow_up_no_answer`, `completion_notice`, `invoice_ready_notice`,
`marketing_promotional`) and the consent/suppression schema already accepts all of them. **Only
`on_the_way` has an intent creator** (`sms-on-the-way-intent-create.ts` is the sole `*-intent-create` file).
Reminders are the single most-cited must-have in current buyer guidance, they directly reduce no-shows,
and the entire pipeline — consent, suppression, quiet hours, delivery, status callback, audit — is already
built and A2P-approved. This is a message-class and scheduler slice on finished rails, not a new
subsystem. It is the cheapest large competitive win available.

**2. Customers who reply to a text hit a void.** Inbound handling exists only for STOP/HELP
(`twilio-inbound-processor.ts`); there is no conversation thread anywhere (`sms_conversation` /
`message_thread`: zero hits). The moment on-my-way texting is activated, some customers will reply
"can you come later?" — and nothing surfaces it to the office. This is a trust and liability problem
rather than a missing feature, and it is coupled to the activation the roadmap is about to press. At
minimum, inbound non-STOP messages should land somewhere a human sees them before live send is switched on.

**3. Customer portal / client hub.** Confirmed absent: `app/portal` is contractor-only, authorized by
`contractor_users` and frozen billing identity. Customer self-service today is exactly two unauthenticated
token surfaces — `/proposals/[token]` and `/payments/invoice/[token]`. No customer login, no service
history, no invoice list, no reschedule. Every competitor sells this hard, and current buyer guidance
treats it as standard. Correctly sequenced behind the ECC lane by owner decision, but it is the largest
genuine gap on the HVAC-service side and should not drift.

**4. No bulk customer/location import.** Pricebook has CSV import (`lib/business/pricebook-import.ts`,
`PricebookImportPanel.tsx`); customers have export only (`/customers/export`) and no import. QBO sync is
one-way push, so customers cannot be pulled from QuickBooks either. An HVAC company switching from
another platform with 2,000 customers currently has no supported path in. This is an **adoption blocker
disproportionate to its build cost** — it gates every migration-in deal.

**5. Online booking / customer self-scheduling.** Zero hits. Lead capture and after-hours request intake
go uncovered; internal and contractor intake exist, customer-initiated does not.

**6. No automated invoice payment reminders.** No dunning of any kind. Receivables chase is fully manual,
while the attention center surfaces the problem without acting on it. Reuses the same pipeline as gap 1.

**7. Recurring visits are tracked, not generated.** Maintenance agreements expose `next_due_date`,
`due_for_booking`, `manual_scheduling_required` and a visit-count review — a due-tracker with manual
booking. Competitors auto-generate the visit schedule from the agreement cadence. For a plan-heavy HVAC
book this is real recurring admin load.

**8. No GPS/location capture.** Nothing in `lib/time-clock/` records coordinates; lat/lng exist only for
addresses and routing. Competitors advertise GPS tracking prominently. Lower real operational value than
its marketing weight, but it comes up in every bake-off.

### 6.2 Next-stage enhancements (correctly deferred; not parity blockers)

- **Reviews / reputation** beyond the shipped one-tap Google ask; referrals; marketing campaigns.
- **Job costing / profitability** — effectively absent (1 incidental hit). Competitors sell per-job margin.
- **Parts inventory and purchase orders** — absent. Note the equipment/filter "inventory" surfaces are
  customer-asset tracking, not stock control; do not mistake one for the other.
- **Payroll export** — thin (3 hits). Time clock data exists and export is CSV-only.
- **Payments V2 remainder** — ACH, deposits on estimates, financing, instant payouts,
  operator-initiated refunds from inside EveryStep, pushing reversals into QBO.
- **AI receptionist / call tracking / call insights** — Workiz's whole angle; absent here.
- **Change orders** and **custom fields** — both zero hits; both routinely requested in FSM.
- **Tier enforcement.** `plan_key` (`starter`/`professional`/`enterprise`) is stored and read but **gates
  nothing** — access is binary entitlement plus `seat_limit`. The Standard/Growth/Pro packaging in
  `Competitive_Packaging_and_Tier_Spec.md` is unimplemented. Fine for a single-tier launch; required before
  selling differentiated tiers.
- **E2E depth** — the money paths deserve browser coverage.
- **CHEERS EDDS filing** — the flagship ECC differentiator, correctly gated on an external answer from
  CHEERS rather than on engineering capacity. Today the rater gets a printable "CHEERS Entry Summary" and
  retypes it into the registry. Closing that loop is worth more to the designated audience than any item
  in §6.1.

## 7. Where the control-plane docs and the code disagree

Recorded for owner action; this audit does not edit authority docs.

| Doc claim | Code reality |
|---|---|
| CURRENT_ROADMAP, deferred items: "Tech dispatch phone notifications — genuinely still deferred: **nothing fires on assignment**" | **Stale.** `notifyJobAssignmentCreated` (`lib/actions/job-actions-shared.ts:431`) is called from `job-assignment-actions.ts:497`, `job-actions.ts:3852` and `job-actions-shared.ts:581`; it writes an `internal_job_assigned` notification through `insertTargetedInternalNotification`, which then invokes web-push delivery, and `internal_job_assigned` has a push template (`web-push-delivery.ts:76`). Assignment → in-app + web push **is** wired. What is genuinely missing is an *SMS/phone* notification to the tech and a per-user on/off preference. |
| CURRENT_ROADMAP Lane 7: "**COMMITTED, not started; demand-triggered**" / Lane 7 spec: "committed future lane, not started" | **Materially stale.** Lane 7 is implemented end to end on `slice-04-twilio-provisioning` — client, orchestrator, poller, wizard UI, gate, credential crypto, per-tenant webhook validation, 6,396 passing tests (§2). The roadmap still tells a reader the lane has not begun and that concierge is the plan of record. This is the single most misleading line in the control plane right now: a session picking up "what now?" from the roadmap would not learn that the biggest lane in the repo is finished and waiting to merge. **Update at merge, and record the env/cron prerequisites with it.** |
| PROJECT_TRUTH §16.1 SMS row: "live-send + inbound STOP implemented. Pending owner activation" | Accurate, and worth reading alongside §6.1 gap 2 — "inbound" here means STOP/HELP only, not conversational reply handling. |

PROJECT_TRUTH §16.1 otherwise held up well under spot-checking, which is unusual for a capability
inventory of this size and is a credit to the "if a row and the code disagree, the code wins" rule.

## 8. Verdict — is the product ready to go?

**Engineering readiness: yes.** Build passes, typecheck is clean, 6,269 tests pass, 170 migrations of
additive discipline, and the source-of-truth boundaries are enforced in code. This is not a product that
needs more foundation. The 2026-07-06 characterisation — post-completion maturation, not foundation
building — is still the correct read, and the evidence for it got stronger.

**Release readiness: close, with three items outstanding, none of which is a rewrite.** The shipped
product on `main` is current and coherent — the earlier claim of a large unmerged delta was an artefact of
this audit's own method error (§4), not a fact about the product.

1. **Decide the inbound-reply story before activating live SMS (§6.1 gap 2).** This is now the top item.
   Two-way conversation is explicitly out of scope in the provisioning slice, so merging that lane brings
   more tenants onto outbound texting without giving any of them a place for replies to land. Activating
   outbound texting while replies vanish is the one item here that can damage customer trust rather than
   merely fail to impress. A minimal landing surface for inbound non-STOP messages is enough to close it.
2. **Merge and deploy `slice-04-twilio-provisioning`**, with its env and cron prerequisites (§2). It is
   green, reviewed three times, and up to date with `main`. Merging it converts tenant SMS onboarding from
   a concierge cost into a product capability for allowlisted owners.
3. **Work the 8 unchecked payment/portal smoke items** in the prelaunch checklist (signed link in a
   private browser, cancelled Checkout, one controlled Stripe payment, one manual payment, contractor
   portal scope positive and negative). These are exactly the paths the thin E2E layer does not cover.

Then close the standing SMS activation owner action, and update the Lane 7 roadmap entry (§7) so the
control plane stops describing a finished lane as unstarted.

**Then, in order, the two cheapest competitive wins:** appointment reminders (finished rails, highest
buyer-cited value) and bulk customer import (unblocks every switch-from-a-competitor deal).

**On purpose and positioning.** The ECC-first decision is the right one and this audit strengthens the
case: the ECC test system, the cross-account work-sharing loop and the verified-money discipline are three
things no competitor can copy quickly, while portal/booking/reviews would be catch-up on someone else's
terms. The caution is that two of the §6.1 core gaps — appointment reminders and inbound replies — are
**audience-neutral**. A rater scheduling a homeowner visit needs a reminder text and needs to see the
reply just as much as an HVAC service company does. Those two should not be filed under "HVAC-service
parity, deferred behind the ECC lane"; they are core to both audiences and they sit on rails that are
already built.

## 9. External sources reviewed (refreshed 2026-08-17)

- Workiz, "What is the best HVAC business software in 2026" — https://www.workiz.com/blog/hvac/best-hvac-business-software-comparison/
- ServiceTitan, HVAC software and HVAC CRM guidance — https://www.servicetitan.com/industries/hvac-software · https://www.servicetitan.com/blog/hvac-crm-software-app
- TechRadar, "How to pick HVAC field service management software" — https://www.techradar.com/pro/how-to-pick-hvac-field-service-management-software
- ContractorPlus, "Housecall Pro vs Jobber vs ServiceTitan: Tested & Compared 2026" — https://contractorplus.app/blog/housecall-pro-vs-jobber-vs-servicetitan
- MyQuoteIQ, "Best Client Portal Software For HVAC Businesses 2026" — https://myquoteiq.com/best-client-portal-software-hvac-2026/
- ZenTrades, HVAC FSM and scheduling guides 2026 — https://zentrades.pro/zenhvac/blog/hvac-field-service-management-software

Consistent themes in current buyer guidance: automated appointment reminders and confirmations, a
mobile-first customer self-serve portal, maintenance agreements managed end to end, and communication
automation (confirmations, on-the-way, follow-ups, renewal reminders). EveryStep is strong on maintenance
agreements and has on-the-way; it is short on reminders, portal, and follow-up automation.

## 10. Non-actions

No product code, schema, migration, Supabase data, Stripe, QBO, SMS/provider, production environment, or
feature-flag changes were made by this audit. `npm ci` was run locally, and a read-only git worktree was
created at a scratch path to verify the provisioning branch, to execute the verification in §3. The stale
doc claims in §7 are reported, not edited — including the Lane 7 entry, which belongs to the owner's
control plane and should be updated when that branch merges.
