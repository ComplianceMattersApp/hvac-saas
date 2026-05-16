# Compliance Matters Software — Business Layer Expansion Roadmap

**Status:** DRAFT SUPPORTING PLANNING DOC  
**Authority:** Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`  
**Purpose:** Define the future business/commercial layer that expands the current operational platform without regressing the live workflow or conflicting with the active spine.

---

## 1. Document role

This document is a **future-state business-layer planning doc**, not the operational source of truth.

It exists to plan the next commercial/business modules on top of the existing platform, while staying aligned with the active spine.

### Locked authority rule
If any planning detail in this document conflicts with either of the following:

- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

the spine and payments roadmap win.

---

## 2. Current platform baseline

The current operational platform remains valid and live.

This roadmap does not replace that foundation.  
It extends it.

### Existing truths remain intact
- `job_events` = narrative / operational truth
- `ecc_test_runs` = technical truth
- `jobs.ops_status` = operational projection
- `jobs` = visit execution truth
- `service_cases` = continuity truth

### Locked relationship rules
- **Job** = work / visit record
- **Visit Scope** = operational work scope for a specific visit/job
- **Service Case** = problem / continuity container
- **Estimate** = proposed commercial scope
- **Invoice** = billed commercial scope
- **Payment** = money collected against an internal invoice, when payment capability exists

Maintenance agreements closeout note (May 2026):
- Group 9A-10B Service Plan Count Eligibility projection is now documented as read-only visibility on `/service-plans`.
- Visit Count Review labels (`No linked visits`, `Linked`, `Eligible for count review`, `Counted`, `Excluded`, `Reversed`, `Not eligible`) are display-only in this slice.
- Group 9A-10C Manual Mark Visit Counted on Job Detail is now implemented in commit `1b69336` with visibility closure fix in `2ae1a4b`.
- `Mark Visit Counted` remains manual/operator-confirmed, updates only the targeted `maintenance_agreement_visits` row count fields, and does not mutate agreement or advance `next_due_date`.
- Group 9A-11A Service Plan Due Window / Next Due Model planning is now documented as docs/model-only with two future cadence tracks: interval cadence and seasonal service-window cadence.
- Group 9A-11B Read-Only Suggested Next Due projection is implemented in commit `d627b91` and browser-validated on counted maintenance-job detail.
- 9A-11B suggestion block remains read-only and explicitly non-mutating: no `Confirm Next Due Date` action, no agreement `next_due_date` write, no automatic due-date advancement, and no invoice/payment behavior.
- 9A-11B projection supports interval frequencies (`monthly`, `quarterly`, `semi_annual`, `annual`) with cadence-preserving roll-forward from current `next_due_date`; `custom`/missing next due falls back to `Manual scheduling required.`
- Group 9A-11C-A Confirm Next Due Date planning audit is now documented as docs/model-only (no implementation in this slice).
- 9A-11C-A records job-detail-first confirm placement (under/near suggestion block), with customer profile and `/service-plans` confirm surfaces parked until V1 is proven.
- 9A-11C-A locks explicit preconditions for future confirm writes: active internal user, active agreement, counted/counts-toward link, interval suggestion present, full account/customer scope match, and stale-state guard requiring unchanged baseline `next_due_date`.
- 9A-11C-A mutation contract is narrow: future confirm may update only agreement `next_due_date` + `updated_by_user_id` (with normal `updated_at` behavior) and must not mutate links/jobs/service cases or create calendar/invoice/payment records.
- 9A-11C-A keeps seasonal-window confirm behavior parked until template/window schema exists; custom/manual remains no-confirm with manual scheduling guidance.
- Group 9A-11C-B Confirm Next Due Date action on job detail is now implemented and pushed in commit `c30cbac`.
- 9A-11C-B adds explicit operator-confirmed `Confirm Next Due Date` action on job detail for counted Service Plans with interval-based suggested due dates.
- 9A-11C-B action renders only for: active agreements, counted links with `counts_toward_visit_balance=true`, interval frequencies (`monthly`, `quarterly`, `semi_annual`, `annual`), and feature-flag enabled.
- 9A-11C-B action is blocked/hidden for: custom/manual frequencies, inactive agreements, non-counted links, stale baseline (optimistic concurrency guard), disabled feature flag, out-of-scope records.
- 9A-11C-B confirmation copy is explicit: "This will update the Service Plan next due date to [date]. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?"
- 9A-11C-B stale-state protection compares current `maintenance_agreements.next_due_date` to `baselineNextDueDate` passed from form; fails with `confirm_next_due_stale_state` banner if values diverge.
- 9A-11C-B mutation contract is narrow: updates only `maintenance_agreements.next_due_date` and `updated_by_user_id`; does not mutate links/jobs/service cases or create calendar/invoice/payment records.
- 9A-11C-B test coverage includes 6 scenarios: success update, stale-state protection, custom frequency blocking, inactive agreement blocking, non-counted link blocking, feature flag enforcement.
- 9A-11C-B validation: 67/67 unit tests passing, tsc clean, git diff clean, working tree clean, commit pushed to origin/main.
- 9A-11C-B browser smoke deferred: unit test coverage sufficient (stale-state guard + all preconditions + side-effect isolation tested); browser click-through should be performed later in staging.
- Group 9A-13A Service Plan Work Items Prefill Structured Validation Fix is implemented in commit `a116c1e` and browser-smoke validated.
- 9A-13A root cause: legacy/default Service Plan Work Item shapes (`item_name`, `description`, `pricebook_item_id`, `default_unit_price`) could degrade prefill into blank/Untitled Work Item behavior and trip structured Work Item submit validation on `/jobs/new`.
- 9A-13A fix: normalize legacy/default Work Item shapes in the Service Plan prefill read path before sanitization so valid data survives into canonical Work Item fields.
- 9A-13A browser smoke recorded successful no-reselect submit from prefilled Service Plan fixture, persisted canonical `visit_scope_items`, no invoice/payment side effects, unchanged agreement `next_due_date`, and new link row remaining `linked` (not counted).
- 9A-13A validation: targeted tests 35/35 passed, `npx.cmd tsc --noEmit` clean, `git diff --check` clean, working tree clean.
- 9A-13A boundaries preserved: no visit-counting mutation, no next-due mutation, no invoice/payment behavior change, no schema/migration/flag changes, and no recurrence/job-generation changes.
- Group 9A-13B-A Next Due Idempotency Model Docs is documented as docs/model-only (no implementation in this slice).
- 9A-13B-A core problem: current Suggested Next Due/Confirm visibility is banner-gated plus counted-link-gated; persistent confirm without durable link-level confirmation metadata could allow repeated advancement from the same counted visit.
- 9A-13B-A model decision: use `maintenance_agreement_visits` as idempotency surface and add durable next-due confirmation metadata fields (`next_due_confirmed_at`, `next_due_confirmed_by_user_id`, `confirmed_next_due_date`, `baseline_next_due_date`).
- 9A-13B-A future confirm rule: update agreement next due and link confirmation metadata together as one logical operation; if link already has confirmation metadata, do not advance again.
- 9A-13B-A persistent UI rule: allow persistent read-only next-due context for counted links, render confirm only when link is not yet next-due-confirmed, and show read-only confirmation context after confirm.
- 9A-13B-A stale-state rule remains required: agreement `next_due_date` must match `baseline_next_due_date` at confirm time or fail safely with refresh/review guidance.
- 9A-13B-A recommended sequence: 13B-B schema/read-model/test foundation, 13B-C safe confirm write of agreement plus link metadata, 13B-D persistent read-only context plus post-confirm hide of action, then browser smoke in sandbox.
- 9A-13B-A boundaries preserved: no automatic advancement, no recurring generation, no seasonal-window implementation, no invoice/payment behavior, no portal/SMS/QBO behavior, no reversal/adjustment UI, and no broad event-log expansion in this slice.
- Group 9A-13B-B Next Due Confirmation Metadata Foundation is implemented and pushed in commit `91d900a`.
- 9A-13B-B migration added four nullable metadata columns to `maintenance_agreement_visits`: `next_due_confirmed_at`, `next_due_confirmed_by_user_id`, `confirmed_next_due_date`, `baseline_next_due_date`.
- 9A-13B-B `next_due_confirmed_by_user_id` FK references `auth.users(id)` ON DELETE SET NULL; all four columns are nullable with no backfill.
- 9A-13B-B read model exposes all four fields and exports `hasMaintenanceAgreementVisitConfirmedNextDue(link)` helper for confirmed/unconfirmed projection.
- 9A-13B-B added tests for metadata field mapping, confirmed state, and unconfirmed state without changing count/used-visit projections or confirm action behavior.
- 9A-13B-B validation: 70/70 tests passed, `npx.cmd tsc --noEmit` clean, `git diff --check` clean, working tree clean.
- 9A-13B-B boundaries: no UI behavior changes, no confirm action expansion, no agreement mutation, no count_status changes, no feature-flag changes, no production migration apply, and no production writes.
- Group 9A-13B-B1 sandbox migration apply and Docker-backed schema verification is complete.
- 9A-13B-B1 sandbox ref `kvpesjdukqwwlgpkzfjm` (CMTest); production ref `ornrnvxtwwtulohqwxop` not targeted.
- 9A-13B-B1 Docker-backed schema dump confirmed: all four metadata columns present and nullable, FK with ON DELETE SET NULL verified, RLS enabled, SELECT/INSERT/UPDATE policies confirmed, no DELETE policy found.
- 9A-13B-B1 post-apply data check: 8 existing rows, non-null count for all four new fields is 0, no backfill, no data mutations in either verification pass.
- 9A-13B-B1 production migration not applied.
- Group 9A-13B-C Safe Confirm Write (agreement + link metadata) is implemented and pushed in commit `3e8c769`.
- 9A-13B-C confirm now writes both surfaces together on success: `maintenance_agreements.next_due_date` plus link metadata (`baseline_next_due_date`, `confirmed_next_due_date`, `next_due_confirmed_at`, `next_due_confirmed_by_user_id`).
- 9A-13B-C link metadata is now the idempotency truth: a counted link can confirm once; repeat confirm from the same link is blocked with `confirm_next_due_already_confirmed`.
- 9A-13B-C keeps stale-state guard intact and keeps confirm surface job-detail-only (no customer profile confirm, no `/service-plans` confirm, no persistent next-due expansion in this slice).
- Group 9A-13B-C1 browser smoke validated idempotent behavior on fixture `job_id=f6600de6-63d9-4551-94c1-a0b3a8db9a5c` / `agreement_id=454b3737-fa39-46be-8925-45131a571693` / `link_row_id=307cc7d6-5ef2-4d06-bf8c-25fa828b4d66`.
- 9A-13B-C1 first confirm redirected with `confirm_next_due_saved`, advanced agreement `next_due_date` from `2026-07-15` to `2026-08-15`, wrote all four link metadata fields, and kept link/job/invoice side effects unchanged (`count_status=counted`, `counts_toward_visit_balance=true`, job `completed/invoice_required`, invoices `0`).
- 9A-13B-C1 repeat confirm redirected with `confirm_next_due_already_confirmed`.
- Display-only follow-up fix is pushed in commit `fb621c7`: confirm dialog now formats date-only `YYYY-MM-DD` directly as `MM/DD/YYYY` (example `2026-08-15` -> `08/15/2026`) without timezone shifting.
- Display fix boundaries: stored values and hidden form values remain `YYYY-MM-DD`; no date calculation changes; no server action behavior changes.
- 13B-C/C1 validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` 71/71 passed, `npx.cmd tsc --noEmit` clean, `git diff --check` clean, working tree clean after push.
- Group 9A-13B-D1 Persistent Next Due Context on Job Detail is implemented and pushed in commit `ba18ff3`.
- 9A-13B-D1 job detail now derives Service Plan next-due context from durable counted-link state, not transient banner state.
- 9A-13B-D1 counted unconfirmed link behavior: shows `Suggested next due date` and `Confirm Next Due Date`.
- 9A-13B-D1 counted confirmed link behavior: shows read-only confirmed context and hides `Confirm Next Due Date`.
- 9A-13B-D1 confirmed read-only copy:
  - `Next due date already confirmed for this counted visit.`
  - `Confirmed: MM/DD/YYYY`
  - `Previous due date: MM/DD/YYYY`
- 9A-13B-D1 preserves `Mark Visit Counted` behavior for eligible uncounted links and does not duplicate/compete with that panel.
- 9A-13B-D1 validation recorded: `npx.cmd tsc --noEmit` clean, `git diff --check` clean, browser smoke passed for confirmed and unconfirmed counted job states.
- Group 9A-13B-D2 Confirm Next Due Banner Mapping + Date Display Consistency is implemented and pushed in commit `b5f7bd8`.
- 9A-13B-D2 adds explicit `confirm_next_due_*` banner mappings on job detail:
  - `confirm_next_due_saved`: `Service Plan next due date updated.`
  - `confirm_next_due_already_confirmed`: `This visit has already confirmed the Service Plan next due date.`
  - `confirm_next_due_stale_state`: `This suggestion is out of date. Refresh and review the latest next due date before confirming.`
  - `confirm_next_due_not_counted`: `This visit must be counted before confirming the next due date.`
  - `confirm_next_due_unavailable`: `Service Plan next due confirmation is currently unavailable.`
  - `confirm_next_due_update_failed`: `Could not update the Service Plan next due date. Please try again.`
- 9A-13B-D2 unifies job-detail next-due display formatting to `MM/DD/YYYY` using date-only parsing for suggestion and confirm dialog display text.
- 9A-13B-D2 keeps stored values and hidden form values as `YYYY-MM-DD`; no date calculation logic changed; no server action behavior changed.
- 9A-13B-D2 validation recorded: `npx.cmd tsc --noEmit` clean, `git diff --check` clean, browser smoke confirmed `MM/DD/YYYY` display and banner copy.
- 9A-11A keeps the core rule that counting does not auto-advance `next_due_date`; suggestion-first (read-only) is preferred before any future explicit confirm-write action.
- Seasonal due language is planned as `Upcoming`, `In Service Window`, `Overdue`, and `Manual scheduling required` instead of date-only messaging.
- Boundaries remain: no automatic counting, no due-date advancement, no visit-balance deduction automation, and no invoice/payment behavior.
- Group 9A-14B Service Plans Drilldown Navigation Polish is complete in commit `f05bc29`.
- 9A-14B keeps `/service-plans` read-only, adds focused customer-card deep-links (`/customers/{customerId}?maFocus={agreementId}#maintenance-agreement-{agreementId}`), and adds `Manage on Customer` row links without adding mutation controls.
- 9A-14B also records stable customer-card anchors plus focused-card highlight and helper copy clarifying that edit/create-work-order/default-Work-Items actions live on customer profile.
- Group 9A-14C Service Plan Detail Snapshot on Customer Profile is complete in commit `eefae0b`.
- 9A-14C adds summary-first, read-only customer-card context (`Plan Snapshot` and `What's Included`) before edit controls, with empty-state copy: `No default Work Items saved for this plan yet.`
- 9A-14C preserves interaction hierarchy: `Create Work Order` remains prominent; `Edit Details` remains secondary/collapsed.
- 9A-14B/14C validations recorded: `npx.cmd tsc --noEmit` clean, `git diff --check` clean, and browser smoke passed for deep-link focus/highlight, snapshot visibility, included-items visibility, and `/service-plans` read-only behavior.
- Service Plans / Maintenance Agreements status is now closed for this pass after 9A-14A, 9A-14B, and 9A-14C; reopen only for real workflow bugs or strongly validated user feedback.
- Planning guardrail for next pass: do not add additional Service Plan capability unless explicitly reopened.

SMS Slice E2 closeout note (May 2026):
- Slice E2 Message Intent + Provider Delivery Audit Foundation is complete in commit `b90c9ea` with migration `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql`.
- E2 created `sms_message_intents` and `sms_provider_deliveries` as neutral tenant/account-scoped communication audit infrastructure.
- E2 did not add live SMS, send endpoint, webhook, provider integration, provider delivery write path, `job_events` provider summary behavior, backfill, production migration apply, or production writes.
- Validation recorded: `npx.cmd tsc --noEmit`, helper tests (`16/16` and `4/4`), `git diff --check`, and `supabase db reset --local --no-seed --yes` with full local migration chain including E2.
- Real SMS remains deferred pending quiet-hours/timezone, admin template governance, sender identity/provider readiness, provider/Twilio sandbox readiness, legal/provider review, and explicit activation decision.
- Quiet-hours/timezone is scoped to future conservative fail-closed SMS pre-send eligibility only; Mark On The Way and job lifecycle/status transitions remain direct workflow and are not blocked.
- No quiet-hours settings UI is approved for V1 direct job workflows.

SMS Slice F1 closeout note (May 2026):
- Slice F1 Provider/Twilio Readiness Spec is complete in docs/model-only mode at `docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md`.
- F1 records Twilio as likely provider direction while locking provider-neutral internal model and status semantics.
- F1 records sender strategy, A2P/registration checklist, On-The-Way classification/template constraints, opt-in/opt-out/help expectations, callback/webhook signature-validation readiness, status mapping, env/secrets planning posture, settings implications, and marketplace guardrails.
- F1 does not implement provider setup, Twilio API calls, send endpoint, webhook route, sandbox send, live SMS, env/secrets changes, schema/migration/Supabase changes, feature flags, or production writes.
- Real SMS remains deferred pending later implementation slices and explicit activation approval.

SMS Slice F2A closeout note (May 2026):
- Slice F2A Sender Identity + Provider Configuration Model Lock is complete in docs/model-only mode at `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md`.
- F2A locks a two-table model (`sms_provider_configurations`, `sms_sender_identities`) and parks separate registration-evidence table design unless explicitly required later.
- F2A locks provider-neutral/Twilio-aware field semantics, no-secret DB rule, readiness/verification/activation status values, sandbox-vs-production data semantics, and account-scoped RLS/mutation boundaries.
- F2A keeps E2 tables unchanged in this slice and parks optional sender/provider FK linkage for later explicit approval.
- F2A does not implement schema/migrations, provider setup, Twilio API calls, send endpoint, webhook route, sandbox send, live SMS, env/secrets changes, feature flags, or production writes.
- Real SMS remains deferred pending F2B migration foundation and later gated implementation slices with legal/provider approval.

SMS Slice F2B closeout note (May 2026):
- Slice F2B Provider Configuration + Sender Identity Schema Foundation is complete in commit `f093bdd` with migration `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`.
- F2B created `sms_provider_configurations` and `sms_sender_identities` as neutral tenant/account-scoped provider-readiness and sender-identity metadata foundations.
- F2B preserves provider-neutral/Twilio-aware reference semantics, no-secret DB posture, readiness/activation separation, and sandbox-vs-production data modeling.
- F2B enables account-scoped SELECT RLS in V1 and intentionally omits INSERT/UPDATE/DELETE policies pending admin/owner-gated mutation contract.
- F2B does not alter E2 tables and does not implement send endpoint, webhook route, provider/Twilio API behavior, sandbox/live SMS, env/secrets changes, feature flags, payment/QBO/portal behavior, marketplace behavior, production migration apply, or production writes.
- Validation recorded: `npx.cmd tsc --noEmit`, helper tests (`16/16` and `4/4`), `git diff --check`, and `supabase db reset --local --no-seed --yes` all passed, including full local migration chain with F2B.
- Provider readiness is structurally closer but remains deferred/not active pending Settings UI planning, sender registration/provider review, webhook/signature validation planning, sandbox planning, legal/provider review, and explicit activation decision.

SMS Slice F3A closeout note (May 2026):
- Slice F3A Settings Communications Readiness UI Model Lock is complete in docs/model-only mode at `docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md`.
- F3A locks future route/IA (`/ops/admin/communications`, `Communications`), admin-only access posture, first read-only section layout, and no-go control list.
- F3A locks browser-safe/no-secret rendering posture, provider-ref masking/safe-label strategy, sender phone masking, status mapping contract, and activation-effective-state wording.
- F3A locks sequencing: docs/model lock first, then F3B read-model helper, then F3C read-only route/page.
- F3A does not implement code/UI/schema/migrations, provider setup, send endpoint, webhook, sandbox/live SMS, env/secrets changes, feature flags, payment/QBO/portal behavior, marketplace behavior, production migration apply, or production writes.
- Real SMS remains deferred pending later gated implementation slices and explicit legal/provider activation approval.

SMS Slice F3B closeout note (May 2026):
- Slice F3B Provider Readiness Read-Model Helper is complete in commit `d370e56`.
- F3B added helper file: `lib/communications/sms-provider-readiness-read.ts` and test file: `lib/communications/__tests__/sms-provider-readiness-read.test.ts`.
- F3B helper API: `getSmsProviderReadinessForAccount({ supabase, accountOwnerUserId })`.
- F3B helper scope: account-scoped by `account_owner_user_id`, reads only `sms_provider_configurations` and `sms_sender_identities` tables.
- F3B helper output: safe-empty on missing scope or rows, browser-safe readiness data for future Settings → Communications UI, masks sender phone using `phone_last4`, does not return secrets/full provider refs/full phone/canSend/send eligibility.
- F3B helper always returns: `smsEnabled: false`, `liveSendsEnabled: false`, `statusLabel: "SMS is not enabled"`.
- F3B helper posture: does not imply live SMS is active even if DB readiness/activation rows are active.
- F3B validation recorded: new provider readiness helper tests 16/16 passed, SMS eligibility helper tests 16/16 passed, contact recipient helper tests 4/4 passed, `npx.cmd tsc --noEmit` passed, `git diff --check` passed.
- F3B does not implement route/page, provider setup, send endpoint, webhook, sandbox/live SMS, env/secrets changes, feature flags, payment/QBO/portal behavior, marketplace behavior, production migration apply, or production writes.
- UI implementation and routing remain deferred to F3C read-only Admin Center route/page implementation.
- Real SMS remains deferred pending later gated activation slices and explicit legal/provider approval.

SMS Slice F3C closeout note (May 2026):
- Slice F3C Read-Only Admin Communications Page is complete in commit `994e79c`.
- F3C added route: `/ops/admin/communications` (admin-only, read-only).
- F3C added Admin Center card: `Communications` with description "Review SMS/provider readiness. SMS is not enabled and live sends are disabled."
- F3C page displays:
  - Communications Status: always shows SMS not enabled and live sends disabled
  - SMS Provider Readiness: provider configurations with account/messaging-service/callback/opt-out status
  - Sender Identity: sender identities with type/verification/activation/registration status, masked phone (last 4 only)
  - On-The-Way Notification: "Planned only. Mark On The Way does not send SMS."
  - Compliance Readiness: checklist of readiness items (recipient registry, consent/suppression, eligibility helper, audit tables, provider config/sender schema complete; quiet-hours, template governance, webhook, sandbox, legal/provider, explicit activation deferred or disabled)
  - Activation Status: always shows SMS not enabled and live sends disabled
- F3C page uses F3B helper: `getSmsProviderReadinessForAccount({ supabase, accountOwnerUserId })`
- F3C page scope: admin-only, no forms/mutations, no send/test/sandbox/activation/template/provider controls
- F3C page safety: does not render provider refs, secrets, full phone numbers; only renders safe helper output with masked sender display
- F3C page empty states: "Provider setup has not been configured" / "No sender identity is configured"
- F3C validation recorded: `npx.cmd tsc --noEmit` passed, provider readiness helper 16/16 passed, SMS eligibility helper 16/16 passed, contact recipient helper 4/4 passed, `git diff --check` passed.
- F3C does not implement provider setup, send endpoint, webhook, sandbox/live SMS, env/secrets changes, feature flags, payment/QBO/portal behavior, marketplace behavior, production migration apply, or production writes.
- Communications readiness is now visible in Admin Center as read-only status/readiness.
- Real SMS remains deferred pending template governance planning, webhook/status callback planning, provider/Twilio sandbox planning, legal/provider review, and explicit activation decision.

SMS Slice F4A closeout note (May 2026):
- Slice F4A On-The-Way Template Governance Model Lock is complete in docs/model-only mode at `docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md`.
- F4A locks governance location in `/ops/admin/communications` as `On-The-Way Template Governance` section, with no template sub-page in first posture.
- F4A locks admin-only posture and no field-user free-text editing or job-detail template preview/editor posture.
- F4A locks two-table future model (`sms_message_templates` as account-scoped container/current pointer and `sms_message_template_versions` as durable immutable wording/version record).
- F4A explicitly rejects single-table `sms_templates` for this lane.
- F4A locks statuses/review states, token allowlist and unknown-token block behavior, mandatory STOP language, prohibited wording, sample-preview-only posture, and future mutation/RLS boundaries.
- F4A does not implement schema/migrations/read-model/UI editing/provider setup/send behavior/webhook/sandbox/live SMS/env-secret-flag/payment/QBO/portal behavior.
- Real SMS remains deferred; safe next sequence is F4B schema foundation, then F4C read-only template status/sample preview, then later edit/review actions.

SMS Slice F4B closeout note (May 2026):
- Slice F4B Template Governance Schema Foundation is complete in commit `b676736` with migration `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`.
- F4B created `sms_message_templates` and `sms_message_template_versions`.
- `sms_message_templates` is the account-scoped template container/current pointer.
- `sms_message_template_versions` is the durable governed wording/version record.
- safer two-table model is now implemented; single-table `sms_templates` remains rejected for this lane.
- template rows are account-scoped with RLS enabled and SELECT-only policy posture for authenticated active internal users in the same account.
- no INSERT/UPDATE/DELETE policies were added in V1; future writes remain deferred to admin-only server actions.
- F4B does not enable template editing, preview, rendering, sending, provider setup, webhook, or On-The-Way automation.
- F4B does not alter `sms_message_intents`; `sms_message_intents.message_body_snapshot` remains the future attempted-message audit record.
- validation recorded: TypeScript passed, provider readiness helper tests `16/16`, SMS eligibility helper tests `16/16`, contact recipient helper tests `4/4`, `git diff --check` passed, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F4B.
- no production migration apply and no production writes.
- state after F4B: template governance schema foundation exists; template read-model/helper remains deferred; F4C read-only template status/sample preview remains deferred; template editing/review actions remain deferred; provider setup remains deferred; sandbox/live SMS remains deferred.
- safe forward sequence: F4B docs closeout, then F4C read-only template status/sample preview planning/implementation, then later admin edit/review server actions, later webhook/status callback planning, later provider/Twilio sandbox planning, and later production activation only after legal/provider review and explicit approval.
- real SMS remains deferred.

SMS Slice F4C-A closeout note (May 2026):
- Slice F4C-A Template Governance Read Model Helper is complete in commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`.
- F4C-A added helper file `lib/communications/sms-template-governance-read.ts` and test file `lib/communications/__tests__/sms-template-governance-read.test.ts`.
- F4C-A helper API is `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`.
- helper reads only `sms_message_templates` and `sms_message_template_versions`, account-scoped by `account_owner_user_id`.
- helper returns safe-empty output for missing scope or no configured template rows.
- helper returns browser-safe readiness/status output only, always keeps SMS disabled/live sends disabled, and does not return `canSend`.
- helper does not call provider/Twilio APIs, does not read customer/job/contact data, and does not read `sms_message_intents` or `sms_provider_deliveries`.
- helper supports sample-data preview only, token detection, unknown-token approval blocking, STOP-language approval blocking, and approval-readiness-not-send-readiness posture.
- validation recorded: template governance helper tests `15/15`, provider readiness helper tests `16/16`, SMS eligibility helper tests `16/16`, contact recipient helper tests `4/4`, TypeScript passed, and `git diff --check` passed.
- state after F4C-A: template governance schema foundation exists; template governance read model exists; F4C-B read-only template status/sample preview UI remains deferred; template editing/review actions remain deferred; provider setup remains deferred; sandbox/live SMS remains deferred.
- safe forward sequence after F4C-A: F4C-B read-only On-The-Way Template Governance section on `/ops/admin/communications`, then later admin edit/review server actions, later webhook/status callback planning, later provider/Twilio sandbox planning, and later production activation only after legal/provider review and explicit approval.
- real SMS remains deferred.

SMS Slice F4C-B closeout note (May 2026):
- Slice F4C-B Read-Only On-The-Way Template Governance Section is complete in implementation commit `05475929cc69704b1fb22f3dabbde10ff83aed90` and stabilization commit `1ffa475e2167eeb60a206358a4e7032a407bdd0f`.
- F4C-B changed `app/ops/admin/communications/page.tsx` and added `On-The-Way Template Governance` section on `/ops/admin/communications`.
- section posture is admin-only/read-only/status-sample-preview only and includes required non-sending copy: `Sample preview only.`, `SMS is not enabled and live sends are disabled.`, `Mark On The Way does not send SMS.`, `Template readiness does not enable sending.`.
- section includes no send/test/sandbox/activation/edit/approval/provider controls and exposes no raw provider refs/secrets/full phone/customer/job data or raw JSON dump.
- stabilization addressed local schema-cache missing-table errors (`PGRST205`) with fail-closed provider-readiness handling so local missing tables degrade to safe-empty readiness state instead of page crash.
- validation recorded: template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit`, `git diff --check`, and browser smoke after stabilization all passed.
- state after F4C-B: template governance schema foundation exists, template governance read model exists, template governance read-only UI section exists, admin edit/review actions remain deferred, webhook/status callback planning remains deferred, provider/Twilio sandbox planning remains deferred, and real SMS remains deferred.
- conservative next-lane recommendation: proceed with admin edit/review server-action planning before any provider/webhook/send activation implementation.

SMS Slice F4D-A closeout note (May 2026):
- Slice F4D-A Template Editing + Review Actions Model Lock is complete in docs/model-only mode at `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`.
- F4D-A locks future action sequence: validation helper, create/save draft server actions, review actions, editable UI, later provider/legal review operations, later sandbox/provider work, and later production activation only after explicit approval.
- F4D-A locks future server-action architecture: `lib/actions/sms-template-actions.ts`, authenticated internal context, `requireInternalRole("admin")`, account owner derived from internal-user context, scoped lookups, `createAdminClient()` writes after validation, and `/ops/admin/communications` revalidation.
- F4D-A locks first future actions as `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm`; submit/approve/reject/pause/retire actions remain later.
- F4D-A locks future validation helper `lib/communications/sms-template-governance-validation.ts`, token allowlist, STOP-language requirement, prohibited promotional wording block, SHA-256 body hash, sample-only preview, and segment estimate posture.
- F4D-A locks versioning: drafts may be mutable, approved/active/superseded/retired body text is immutable, edits to approved/current wording create new draft versions, and activation/current pointer behavior remains deferred.
- F4D-A keeps F4B SELECT-only RLS intentional, normal authenticated template write policies absent, delete actions absent, and `job_events` excluded from template governance logging.
- F4D-A does not implement server actions, editable UI, code behavior, schema/migration changes, Supabase commands, provider/Twilio calls, send endpoint, webhook, sandbox/live SMS, activation, env/secret/feature-flag changes, payment/QBO/portal behavior, marketplace behavior, or production writes.
- state after F4D-A at that time: mutation semantics were locked; validation helper was the next implementation slice; create/save draft actions, review actions, editable UI, provider/legal review, sandbox sends, and production activation remained deferred.
- real SMS remains deferred.

SMS Slice F4D-B closeout note (May 2026):
- Slice F4D-B Template Governance Validation Helper is complete in commit `418172e`.
- F4D-B added helper `lib/communications/sms-template-governance-validation.ts` and test file `lib/communications/__tests__/sms-template-governance-validation.test.ts`.
- F4D-B helper API is `validateOnTheWayTemplateBody(bodyTemplate: string)`.
- helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags.
- helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments.
- helper warns for multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content.
- helper does not enable SMS, does not imply `canSend`, has no Supabase/database/provider dependencies, and has no UI/server-action behavior.
- review-request SMS remains parked as a future separate message class and remains prohibited inside On-The-Way operational template wording.
- validation recorded: template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit`, and `git diff --check` all passed.
- state after F4D-B: validation helper exists; create/save draft server actions remain deferred to F4D-C; review actions remain deferred; editable UI remains deferred; later provider/legal/sandbox/activation work remains deferred; real SMS remains deferred.
- conservative next-lane recommendation: proceed with F4D-C create/save draft server actions before review actions or editable UI.

SMS Slice F4D-C closeout note (May 2026):
- Slice F4D-C Create/Save On-The-Way Template Draft Actions is complete in commit `f7cf8c0`.
- F4D-C added action file `lib/actions/sms-template-actions.ts` and test file `lib/actions/__tests__/sms-template-actions.test.ts`.
- actions added: `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm`.
- pure helpers exported for testability: `resolveNextVersionNumber` and `isVersionMutable`.
- actions are admin-only; use `createAdminClient()` for writes; derive `account_owner_user_id` from auth context; never trust owner/template/version ids from form input without scoped lookup; revalidate `/ops/admin/communications` and `/ops/admin`.
- create action ensures/reuses parent template container, reuses mutable draft, creates new draft at `max(version_number) + 1` when latest is immutable.
- save action validates with `validateOnTheWayTemplateBody`, blocks blank body, updates mutable draft in place, creates new draft when latest is immutable.
- both actions persist all validation metadata fields and never set `current_version_id` or `sandbox_version_id`.
- no UI wired; no review/approve/reject actions; no send endpoint; no provider/Twilio calls; no webhook; no schema/migration/env/flag/payment/QBO/portal changes; no production writes.
- validation recorded: template action tests `20/20`, template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit`, and `git diff --check` all passed; total `90/90`.
- state after F4D-C: template governance schema exists; read model exists; read-only UI exists; validation helper exists; create/save draft actions exist; review actions remain deferred (F4D-D); editable UI remains deferred (F4D-E); provider setup, sandbox sends, and live SMS remain deferred; real SMS remains deferred.

SMS Slice F4D-D closeout note (May 2026):
- Slice F4D-D Template Review Actions is complete in commit `f5995d7`.
- F4D-D changed action file `lib/actions/sms-template-actions.ts` and test file `lib/actions/__tests__/sms-template-actions.test.ts`.
- actions added: `submitOnTheWayTemplateVersionForReviewFromForm`, `approveOnTheWayTemplateVersionForSandboxFromForm`, and `rejectOnTheWayTemplateVersionFromForm`.
- actions are admin-only, scoped by authenticated internal-user account context, and use `validateOnTheWayTemplateBody` as review gate.
- submit transitions only `draft -> pending_review` for scoped latest version.
- approve-for-sandbox transitions only `pending_review -> approved_for_sandbox` for scoped latest version and sets parent `sandbox_version_id` only.
- reject transitions only `pending_review -> rejected` and requires non-blank normalized/bounded `rejected_reason` (max 500).
- pointer behavior remains safe: `current_version_id` untouched; submit/reject do not modify template pointers.
- no activation behavior, no provider/Twilio/send/webhook behavior, and no SMS send readiness implied by template approval/readiness.
- validation recorded: template action tests `40/40`; template validation helper tests `19/19`; template governance read tests `15/15`; provider readiness tests `16/16`; SMS eligibility tests `16/16`; contact recipient tests `4/4`; `npx.cmd tsc --noEmit`; `git diff --check`; total `110/110` passed.
- state after F4D-D: schema/read-model/read-only UI/validation helper/create-save draft/review actions exist; editable UI remains deferred (F4D-E); approve-for-activation remains deferred; provider/legal approval actions remain deferred; provider setup remains deferred; sandbox/live SMS remains deferred; real SMS remains deferred.
- safe forward sequence: F4D-D docs closeout, then F4D-E1 create/save draft UI, then F4D-E2 safe version-id/action-eligibility read-model support for admin readiness, then F4D-E3A combined admin readiness action (complete), then F4D-E3B mark-ready UI wiring (complete), then planning/audit for the actual background On-The-Way send path, then later provider/legal review workflow, later webhook/status callback contract planning, later provider/Twilio sandbox planning, and later production activation only after legal/provider review and explicit approval.

SMS Slice F4D-E1 closeout note (May 2026):
- Slice F4D-E1 Create/Save Draft UI is complete in commit `1b8b671`.
- F4D-E1 changed `app/ops/admin/communications/page.tsx` and touched server-action compatibility in `lib/actions/sms-template-actions.ts`.
- UI added local notice rendering, `Draft Wording` card, `Create draft from default` form, and latest-draft-only draft textarea/save form.
- UI wires only `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm`.
- UI does not wire submit/review/approve/reject/activation controls and does not add provider setup/send/webhook controls.
- UI preserves explicit non-live copy: `SMS is not enabled`, `Live sends are disabled`, `Template approval does not enable sending`, `Sample preview only`, `Mark On The Way does not send SMS`, and legal/provider review reminder.
- browser smoke passed after local runtime target alignment with `draft_created` and `draft_saved`.
- runtime mismatch finding recorded: initial `template_create_failed` came from local reset target vs remote app runtime target mismatch (missing template tables in remote PostgREST schema cache), not a code defect.
- validation recorded post-smoke: template action tests `40/40`, template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipients tests `4/4`, `npx.cmd tsc --noEmit`, `git diff --check`, and clean working tree.
- state after F4D-E1: schema/read-model/read-only UI/validation helper/create-save draft/review actions/create-save draft UI exist; review/reject UI remains deferred unless team-review workflow is reopened; approve-for-activation/provider-legal actions/provider setup/sandbox-live SMS remain deferred; real SMS remains deferred.

SMS Slice F4D-E2 closeout note (May 2026):
- Slice F4D-E2 Admin Readiness Read-Model Support is complete in commit `fededec`.
- F4D-E2 touched `lib/communications/sms-template-governance-read.ts` and tests in `lib/communications/__tests__/sms-template-governance-read.test.ts`.
- F4D-E2 read-model enhancements: safe versionId exposure on latest/current/sandbox version summaries, accountOwnerUserId removed, latest-version admin readiness fields added (`canSaveDraft`, `canMarkReadyForSandbox`, `markReadyBlockingReasons`, `markReadyWarnings`).
- F4D-E2 reuses `validateOnTheWayTemplateBody` for token, STOP, prohibited-content, segment, preview, and readiness calculations.
- F4D-E2 readiness semantics: latest-version-only; historical current/sandbox versions do not become action-eligible unless they are also latest.
- F4D-E2 safety posture: no `canSend` returned; no account owner ids, raw user ids, provider refs, customer/job data, or raw JSON dumps exposed.
- F4D-E2 validation recorded: sms-template-governance-read tests passed; sms-template-governance-validation `19/19` passed; sms-template-actions `40/40` passed; sms-provider-readiness-read `16/16` passed; sms-eligibility-inputs-read `16/16` passed; contact-recipients-read `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed.
- F4D-E2 boundaries preserved: no UI/route/schema/migration changes, no Supabase production commands, no provider/Twilio/send/webhook behavior, no env/flag/payment/QBO/portal changes, no production writes.
- F4D-E2 forward state: admin readiness support is ready for future F4D-E3 UI planning; review/reject UI remains deferred unless team-review workflow is reopened; real provider-powered SMS remains deferred.

SMS Slice F4D-E3A closeout note (May 2026):

- Slice F4D-E3A Combined Admin Readiness Action is complete in commit `8cfa814`.
- F4D-E3A touched `lib/actions/sms-template-actions.ts` adding `markOnTheWayTemplateReadyForSandboxFromForm` action and expanded tests in `lib/actions/__tests__/sms-template-actions.test.ts`.
- F4D-E3A action supports simplified V1 admin-owned workflow: accepts latest draft or latest pending_review, validates to sandbox-approval standard, sets sandbox readiness only (version_status = approved_for_sandbox, internal_review_status = approved, sandbox_version_id only), does not set current_version_id or activate, does not enable SMS, does not call provider/Twilio/webhook.
- F4D-E3A action safety: admin-only, account-scoped from authenticated context, accepts only version_id from form, re-validates server-side, uses pointer-failure rollback posture.
- F4D-E3A validation recorded: sms-template-actions `54/54` passed, sms-template-governance-validation `19/19` passed, sms-template-governance-read `21/21` passed, sms-provider-readiness-read `16/16` passed, sms-eligibility-inputs-read `16/16` passed, contact-recipients-read `4/4` passed, `npx.cmd tsc --noEmit` passed, `git diff --check` passed.
- F4D-E3A boundaries preserved: no UI/route/schema/migration changes, no Supabase production commands, no provider/Twilio/send/webhook behavior, no env/flag/payment/QBO/portal changes, no production writes.
- F4D-E3A forward state: visible mark-ready UI wiring is complete in F4D-E3B; review/reject UI remains parked unless team-review workflow is reopened; real provider-powered SMS remains deferred.

SMS Slice F4D-E3B closeout note (May 2026):

- Slice F4D-E3B Admin Readiness UI Wiring is complete in commit `c998d0e`.
- F4D-E3B changed `app/ops/admin/communications/page.tsx`.
- Existing `On-The-Way Template Governance` UI now includes visible `Mark wording ready for sandbox` UI.
- The button appears only when the latest wording is eligible, posts only `version_id`, and uses `markOnTheWayTemplateReadyForSandboxFromForm`.
- Visible V1 UI stays intentionally simple: no queue-shaped submit/review/reject workflow, no activation language, and review/reject UI remains parked unless a larger team-review workflow is intentionally reopened.
- Smoke recorded: `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, browser-safe rendering confirmed.
- Validation recorded: targeted tests `94/94`, `npx.cmd tsc --noEmit`, `git diff --check`, clean working tree.
- F4D-E3B boundaries preserved: template readiness does not enable SMS, sandbox readiness does not send SMS, Mark On The Way still does not send SMS, no provider/Twilio/send/webhook/activation behavior changed, and real provider-powered SMS remains deferred.

SMS On-The-Way V1 workflow simplification note (May 2026):
- V1 product goal is simple: job users press Mark On The Way, and future provider SMS is a background operational/customer-care notification after that lifecycle event.
- Mark On The Way remains lifecycle-first; provider failure must not roll back the lifecycle transition.
- Admin controls the V1 On-The-Way wording and is the effective wording owner/approver.
- Field users do not write, preview, or freely edit SMS wording; job/customer-level custom SMS text is not V1.
- Existing submit/approve/reject server actions remain future-compatible infrastructure, but visible V1 UI should not become a multi-person approval/rejection queue.
- `Reject version` UI remains deferred unless a larger-company/team-review workflow is intentionally reopened.
- Future UI should prefer readiness language like `Mark wording ready for sandbox` or `Wording ready for future SMS testing`, not `Approve SMS`, `Activate SMS`, or `Enable SMS`.
- Template readiness and sandbox readiness do not send SMS; real SMS remains deferred.
- `job_events` and manual contact logs are not provider delivery truth; `sms_message_intents.message_body_snapshot` remains the future audit record of attempted SMS wording.

---

## 3. Product Mode Matrix — ECC/HERS Version vs HVAC Service Version

### 3.1. Product-mode principle

The Compliance Matters platform operates as **one shared platform engine** with **two product configurations/versions**:

1. **ECC/HERS / Compliance Testing Version** — emphasizes contractor intake, testing, and compliance closeout
2. **HVAC Service Version** — emphasizes service case continuity, dispatch, and technician workflows

**Architecture decision:**
- No codebase split is planned or required.
- Product-mode separation is **presentation/configuration** at the UI/UX level, not a source-of-truth rewrite.
- Both versions share the same operational platform, data model, and core business logic.
- Mode identity is implicit in feature availability and UI/navigation styling, not explicit in a schema-level mode flag yet (future parked work).
- Mode separation guides future development to prevent buyer-story drift and ensures each version receives intentional UX/navigation tuning.

Packaging guardrail:

- Product mode and plan tier are separate concepts.
- Product mode answers workflow relevance; plan tier/add-ons answer commercial availability.
- See [Competitive_Packaging_and_Tier_Spec.md](./Competitive_Packaging_and_Tier_Spec.md) for Standard/Growth/Pro and add-on placement guidance.

### 3.2. Shared platform engine

The following foundations are **shared across both product versions**:

**Core Entities:**
- customers (account-owning organizations)
- locations (facility/address records)
- jobs / visits / work records (core operational unit)
- service cases (multi-visit problem/continuity container)
- contractors (external intake parties in ECC/HERS mode; not exposed in Service mode by default)

**Operational Surfaces:**
- scheduling / calendar / dispatch
- internal users / team assignments / field lifecycle
- Work Items / Visit Scope (operational work scope for each visit)
- notes / timeline / contact attempts
- attachments / photo galleries
- operational reporting and queue management

**Commercial Surfaces:**
- invoices (billed truth)
- payment tracking (collected truth; no payment execution in current scope)
- pricebook (reusable pricing/service catalog)
- estimates (proposed commercial scope; parked for production enablement)

**Platform Services:**
- notifications / signals
- admin / company profile / users
- mobile / PWA shell
- source-of-truth models:
  - `job_events` = narrative / operational truth
  - `jobs.ops_status` = operational projection
  - `ecc_test_runs` = ECC test truth (ECC mode only)
  - `service_cases` = continuity truth
  - `invoices` + `payments` = billing and collected truth

### 3.3. ECC/HERS / Compliance Testing mode

**This version emphasizes:**

Current shipped ECC verification baseline note (May 2026):
- ECC verification expansion baseline now includes shipped selected/add-on workflows for:
  - AHRI Matched System Verification (office-side)
  - Local Mechanical Exhaust Verification
  - QII / ENV-22 Insulation Verification
  - Fan Efficacy / Watt Verification
  - Air Filter Device Verification
- Applicability and scope behavior now explicitly preserve:
  - mini split ductless applicability trigger on `Mini-Split Indoor Head`
  - package-system refrigerant-charge exclusion
  - per-run editable Duct Leakage and Air Flow targets without mutating global defaults
- Report/output baseline preserves scope hygiene:
  - optional unselected test sections are suppressed unless required, selected, or backed by a run
  - redundant Equipment Reference presentation was removed where Equipment Summary already serves the Results card
  - AHRI helper/readiness guidance is scoped to AHRI workflow only
- Source-of-truth and closeout boundaries remain unchanged:
  - `ecc_test_runs` remains ECC verification truth
  - `jobs.ops_status` remains operational projection
  - AHRI and QII remain non-gating documentation/office flows unless explicitly redesigned in a future pass

- **Contractor Intake / Workflow**
  - Contractor portal for submission of new work requests (proposal intake)
  - Contractor users invited per-job (limited role; no schedule authority)
  - Contractor visibility into job status, test scheduling, and failed-test correction

- **ECC Test Execution**
  - ECC test runs capture technical results (baseline, measured values, pass/fail)
  - Test types: HVAC charge, airflow, duct leakage, refrigerant, asbestos, and other compliance checks
  - Failed tests generate contractor correction evidence requirements
  - Contractor retest-ready requests are reviewed by internal users

- **Compliance & Certification**
  - Failed ECC test correction evidence (photos, notes, work details)
  - Retest review workflow
  - Compliance paperwork closeout
  - Contractor reports (failed tests, next steps, corrective action guidance)
  - Certification sign-off (internal authority)

- **Contractor Portal Features**
  - Job status visibility (proposal, intake, testing, corrections, closeout)
  - Failed test details and corrective action requirements
  - Retest readiness submission
  - Attachment upload (evidence of corrections)
  - Timeline of contractor events and internal communications
  - Contractor-focused reports

- **ECC-Specific Ops Queues**
  - "Needs Attention" (new contractor requests, pending internal finalization)
  - "Failed" (jobs with failed ECC tests requiring correction)
  - "Retest Needed" (contractors have submitted evidence; retest is pending)
  - "Retest Ready" (retest completed; closeout pending)

**Contractor Authority Boundary (Locked):**
- Contractors **can**: submit proposals, respond to requests, upload evidence, request retest review
- Contractors **cannot**: schedule, modify tests, finalize closeout, issue certifications, modify billing
- **Internal users** retain control of: scheduling, test truth, closeout decisions, certifications, billing truth, final status

### 3.4. HVAC Service mode

**This version emphasizes:**

- **Customers & Locations**
  - Customer (account-owning organization) view
  - Location (facility/address) records
  - Customer/location job history
  - Service case continuity across multiple visits

- **Service Cases & Continuity**
  - Service cases capture multi-visit problems or maintenance agreements (future)
  - Each visit creates a job linked to a service case
  - Service-chain continuation: create next visit for the same problem/service case
  - Per-visit Work Items (no automatic copy-forward between visits)

- **Internal Job/Work-Order Creation**
  - Internal users (technicians, dispatchers, managers) create jobs directly
  - No contractor intake lane
  - Work-order-first operational flow
  - Proposal phase is internal planning, not contractor submission

- **Dispatch & Calendar**
  - Scheduling and assignment of technicians
  - Calendar view for dispatch and resource planning
  - Field technician mobile access
  - Unassigned work visibility
  - Preferred technician/team routing

- **Work Items & Operational Scope**
  - Work Items define the operational scope for each visit
  - Waiting reasons: parts on order, approval pending, access issues, missing information
  - Waiting state pauses work without deleting the Work Item scope
  - Work Items are not automatically copied to follow-up visits (per-visit intentionality)

- **Technicians & Team**
  - Internal user roles for technicians, supervisors, dispatch, and management
  - Assignment history and availability tracking
  - Contact/attempt tracking for field coordination

- **Service-Oriented Reporting**
  - Service case aging and continuity
  - Technician productivity and assignment metrics
  - Invoice and payment tracking by job and service case
  - Service case status and next-action visibility
  - Future: estimates and recurring agreements (parked)

- **Future (Parked)**
  - Estimates for service cases (service company quotes before work)
  - Recurring service agreements / maintenance contracts
  - Time-and-materials vs fixed-price billing

**Service Mode Positioning (Locked):**
- Contractor intake and contractor portal **are not** visible by default
- Contractor intake **should be hidden or de-emphasized** in Service mode configuration when product-mode switching is implemented
- Service companies operate in internal work-order/dispatch lane, not contractor-intake lane
- Contractor portal remains available only for ECC/HERS mode or explicitly invited contractors (future)

### 3.5. Navigation and label matrix

**Recommended navigation labels and naming by version:**

| Feature/Route | ECC/HERS Version | HVAC Service Version |
|---|---|---|
| Job creation | "New Job" or "New Work Request" | "New Work Order" |
| Intake lane | "Contractor Intake" | (hidden/not applicable) |
| Contractor management | "Contractors" | (hidden by default) |
| Job detail panels | ECC permit, tests, compliance closeout | Service details, service chain, work items |
| Test management | "Tests / Retests / Compliance Closeout" | (not applicable) |
| Dispatch | (optional) | "Dispatch" or "Calendar" |
| User management | (internal) | "Technicians" / "Team" |
| Customer section | (not applicable) | "Customers" |
| Service case tracking | (not applicable) | "Service Cases" |
| Invoicing & Billing | "Invoices" (ECC-oriented reports) | "Invoices" / "Billing" (service-oriented reports) |
| Reports | Compliance-oriented (failed tests, closeout, contractor status) | Service-oriented (cases, technician, billing) |

### 3.6. Intake/workspace/report/admin differences

**Product-mode-specific surface behavior:**

**Intake Path:**
- ECC/HERS: `/app/jobs/new` defaults to contractor-intake flow (proposal submission)
- HVAC Service: `/app/jobs/new` defaults to internal job/work-order creation

**Job Workspace (`/app/jobs/[id]`):**
- ECC/HERS: Emphasizes permit panel, ECC tests workspace, failed-test evidence collection, retest review, contractor portal visibility
- HVAC Service: Emphasizes service details, service-chain continuation, per-visit Work Items, technician assignment, dispatch coordination

**Ops Queue (`/app/ops`):**
- ECC/HERS: Prioritizes ECC-specific queues ("Failed", "Retest Needed", "Retest Ready") alongside universal "Needs Attention"
- HVAC Service: Prioritizes dispatch-ready work, unassigned assignments, work-item scope visibility

**Reporting:**
- ECC/HERS: Default presets for compliance/closeout reports, contractor status reports, failed-test aggregation
- HVAC Service: Default presets for service-case aging, technician productivity, billing/invoice status

**Admin & Company Profile (Future Parked Work):**
- Future product-mode setting (schema field or tenant settings UI) will control:
  - which version the company operates as
  - which features are visible/enabled
  - which intake lanes are active
  - which navigation labels and queues render

### 3.7. Parked future configuration work

The following product-configuration work is **explicitly parked** and **not in current release scope**:

**Schema & Settings:**
- `product_mode` schema field (if needed) or tenant-settings flag
- Tenant settings UI for product-mode configuration/switching
- Starter kits / onboarding templates by mode

**Navigation & Rendering:**
- Full mode-aware navigation rendering (future)
- Dynamic feature-flag or role-based visibility for intake lanes, menu items, and report presets
- Mode-aware form defaults and button labels

**Reporting & Analytics:**
- Mode-aware report presets in dashboard (future)
- Dashboard card exposure (show/hide by mode)
- Compliance-vs-service reporting toggle (future)

**Future Commercial Features (Parked):**
- Customer portal (separate customer-scoped visibility; not in current external access scope)
- Estimates production enablement (capability exists; not in release scope)
  - Estimates V1A schema-domain production migration execution is complete for `20260501140000_estimates_v1a_schema_domain.sql` on production ref `ornrnvxtwwtulohqwxop`, using an isolated artifact from commit `a200a17` with dry-run and explicit approval before apply.
  - Feature remains runbook-gated for boundary-controlled expansion; internal-only production enablement is now complete.
  - Estimate Communications V1H production migration execution is complete for `20260502120000_estimate_communications_v1h.sql` on production ref `ornrnvxtwwtulohqwxop`, using an isolated artifact from commit `e5a8e8e` with dry-run and explicit approval before apply; `20260509120000` excluded and confirmed absent from production migration history.
  - `ENABLE_ESTIMATES=true` is enabled in Vercel Production only; `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
  - Production internal smoke passed for `/estimates` and `/estimates/new`, including smart customer picker behavior (commit `235d0ce`) and location scoping after customer selection.
  - Controlled smoke estimate created and verified: `8796f8fc-04fb-4c53-bb05-15ab98ab31b4` (`EST-20260510-414FB343`) with one manual line item and total `$123.45`.
  - Boundaries remained intact: no outbound email/PDF/public links/contractor-customer exposure/conversion/payment/Stripe-tenant/QBO/Product Mode/Support Console changes.
  - Warning/watch item: intermittent `net::ERR_ABORTED` browser-log events appeared during navigation/action transitions; required smoke outcomes persisted successfully.
- Recurring maintenance agreements / service subscriptions (capability exists; not in release scope).
  - Group 9A-2 backend foundation is committed (`b126ff6`).
  - Group 9A-3 customer profile read-only display is committed (`09edc9f`).
  - Group 9A-4 customer profile create/edit V1 is committed (`9f81d6f`) and sandbox-ready behind feature gating.
  - Group 9A-5B service plan due/overdue summary read model is implemented, committed, and pushed (`summarizeMaintenanceAgreementsForAccount` in `lib/maintenance-agreements/read-model.ts` with targeted test expansion in `lib/maintenance-agreements/__tests__/read-model.test.ts`).
  - Group 9A-6 ops read-only Service Plans summary card is implemented and pushed (`1776042`) in `app/ops/page.tsx`, feature-gated by `ENABLE_MAINTENANCE_AGREEMENTS`, and fail-safe when the read model call fails.
  - Group 9A-7B manual Create Work Order from Service Plan prefill V1 is implemented and pushed (`3c186e5`) with:
    - compact agreement-card entry point on customer profile
    - lightweight URL params only (`customer_id`, `maintenance_agreement_id`)
    - server-side scoped prefill resolution on `/jobs/new`
    - sanitized summary/work-item defaults copied into editable job intake form state
    - non-blocking safe fallback when agreement prefill is invalid/unavailable
    - existing normal create flow preserved (no job/agreement persisted linkage)
  - Group 9A-8B Service Plans read-only drilldown page + ops link is implemented and pushed with:
    - new internal/account-scoped read-only `/service-plans` route
    - feature-gated `View Service Plans` link in the existing `/ops` Service Plans summary card
    - `/ops` kept summary-only (no full drilldown query added there)
    - account-scoped, capped drilldown helper in `lib/maintenance-agreements/read-model.ts`
    - read-only row shape for customer/location/status/type/frequency/next due/due state
    - customer name links to existing customer detail pages
    - filters: all, active, overdue, due today, due 1-7 days, due 8-30 days, not scheduled, inactive
  - Group 9A-9E Service Plan Work Items prefill + link-creation runtime fix is implemented and pushed (`c4a08d9`) with:
    - agreement default Work Items persisted on create/update
    - agreement create/edit forms now supporting default Visit Scope / Work Items
    - `/jobs/new` Step 5 prefill of summary + Work Items from agreement defaults
    - service-plan-origin job persistence of `job_type=service`, `service_visit_type=maintenance`, `visit_scope_summary`, and `visit_scope_items`
    - runtime ordering fix: link creation now executes before `postCreate(...)` redirect
    - link row created as `link_source=service_plan_prefill`, `count_status=linked`, `counts_toward_visit_balance=false`
    - boundaries preserved: no automatic counting, no due-date advancement, no visit-balance deduction, no invoice/payment behavior
  - Group 9A-10B Service Plan count eligibility read-only projection is implemented and pushed (`0588a26`) with `/service-plans` Visit Count Review labels and no mutation actions in that slice.
  - Group 9A-10C Manual Mark Visit Counted on Job Detail is implemented and pushed (`1b69336`) with visibility closure fix (`2ae1a4b`) moving the action surface into always-visible job-detail scope.
    - action is manual/operator-confirmed and shown only for eligible linked maintenance jobs
    - action mutates only `maintenance_agreement_visits` (`count_status=counted`, `counts_toward_visit_balance=true`, counted audit fields)
    - agreement remains unchanged, `next_due_date` is not advanced, and no invoice/payment behavior is added
  - Summary output includes status counts, due buckets, `total_count`, and `as_of_date` with strict account scoping and active-only due queue semantics.
  - Service Plan counts and due/overdue summary logic are implemented in the repo/read model and exposed on `/ops` as a read-only card, and the internal read-only `/service-plans` drilldown is now available behind feature gating.
  - Group 9A-9A docs/model decisions are recorded for future implementation:
    - preferred linkage shape is separate `maintenance_agreement_visits` table, not direct `jobs.maintenance_agreement_id` as long-term primary truth
    - visit counts only after linked maintenance work is completed/closed as valid maintenance work
    - V1 visit-balance projection should be derived from counted link rows (not mutable remaining counters)
    - `next_due_date` remains manual for current scope; future advancement requires explicit operator confirmation or a clearly designed completion flow
    - full visit-balance ledger is parked for V2 unless real reversal/adjustment/renewal pressure requires first-class ledger events
  - Maintenance Agreements create/edit is implemented in repo and sandbox-ready behind feature gating, but production remains inactive until migration apply and flag enablement are intentionally approved.
  - Browser smoke confirmation: flag off hides Service Plans link and `/service-plans` fails closed, flag on shows the `/ops` link and renders `/service-plans` rows/customer links, all filter chips manually tested successfully, and `/ops` continuity remained intact.
- Tenant payment execution (Stripe subscription/checkout; parked)
- QBO integration (optional downstream; parked)
- Support Console production enablement (parked)

QBO parking rule:
- QBO remains last-last optional downstream accounting sync/export only.
- QBO is not the invoice source of truth, the customer source of truth, or the operational lifecycle system.
- QBO must never override app-owned billed truth or collected-payment truth.
- one-way Compliance Matters to QBO is the safest first sync shape; two-way authoritative sync remains deferred.

### 3.7.1 Product Mode V2 implementation decision (approved)

Product Mode V2 should be implemented as a dedicated account-level settings read path.

Data/model decision:

- Product mode should live in a dedicated account-level settings table, likely `account_settings`.
- `product_mode` values:
  - `hybrid`

### 3.7.2 Smart-entry closeout snapshot (May 2026)

The Work Items / Visit Scope and Estimate Line Item smart-entry slices are complete and closed at the current quality bar.

Work Items / Visit Scope closeout:
- `/jobs/new` Step 5 supports smarter Pricebook-assisted Work Item entry.
- Users can search/select active Pricebook items or add manual Work Items.
- Pricebook selection can prefill Work Item title, description, expected/default price, unit label, item type, and category.
- Work Items remain editable after selection.
- Manual Work Items remain supported.
- Work Items remain operational visit scope and are not billing records.
- Expected Work Item price remains a planning/default value only and does not auto-bill.

`/jobs/new` flow clarification closeout:
- Step 3 is classification/setup.
- Step 5 owns Reason for Visit / Dispatch Notes and Work Items.
- Page flow polish reduced duplicate entry and form fatigue.

`/jobs/[id]` polish closeout:
- Visit Scope summary is compacted into an operational summary.
- Top job-detail header/work-needed area no longer repeats visit reason multiple times.
- Shared Notes follows final implemented visibility rule: hidden for `hvac_service`, visible for non-HVAC internal modes (ECC/Hybrid/Master).
- Timeline, Internal Notes / Team Notes, and Visit Scope remain active narrative/work-summary surfaces.

Estimate Line Item smart-entry closeout:
- Draft estimate line-item entry now uses one unified smart-entry surface.
- Users can search/select Pricebook items or manually type estimate lines from one entry surface.
- Pricebook selection can prefill estimate line name, description, type, category, unit label, quantity, and unit price.
- Manual estimate lines remain supported.
- Estimate Lines remain proposed commercial scope.
- Estimate Lines are not Work Items and are not Invoice Charges.
- No estimate email, PDF, customer approval, customer portal estimate visibility, estimate-to-job conversion, estimate-to-invoice conversion, payment execution, Stripe tenant payment behavior, or QBO behavior was added.

Boundary confirmation for this closeout:
- no schema changes
- no migrations
- no invoice import behavior change from Work Items
- no payment execution changes
- no ECC behavior changes
- no contractor authority changes
- no RLS/auth/permission changes
- no Support Console behavior changes
  - `hvac_service`
  - `ecc_hers`
- `product_mode` should remain nullable in first implementation for safe rollout.

Separation decision:

- Do not store product mode in `billing_mode`.
- Do not store/infer product mode from `plan_tier`.
- Do not store/infer product mode from entitlements/add-ons.
- Do not store/infer product mode from business-profile display fields.

Resolver order decision:

1. Read real account setting first
2. Read temporary Slice 1 override second
3. Read signal fallback third
4. Apply safe default last

Authority boundary decision:

- Product mode controls workflow relevance/defaults only.
- Product mode does not control:
  - billing or payments
  - RLS/security/auth boundaries
  - source-of-truth ownership
  - contractor authority
  - report datasets/calculations
  - tier/add-on enforcement
  - feature-flag rollout

Rollout decision:

- first implementation is additive and reversible
- admin display starts read-only
- admin mutation/edit UI is later
- signup mode capture is later
- tier/add-on enforcement is later
- full mode-aware navigation/report rewrites are later

### 3.7.2 Product Mode V2 Slice 1 and ECC naming Phase 1 closeout (implemented)

Implementation references:

- Product Mode V2 Slice 1: `c42f4a2`
- ECC Naming Phase 1: `6680ba8`

Confirmed implementation facts:

- `account_settings` migration file was added for account-level settings.
- Nullable `product_mode` was added with allowed values unchanged: `hybrid`, `hvac_service`, `ecc_hers`.
- Resolver reads `account_settings.product_mode` first.
- Resolver fallback order is now:
  1. real account setting
  2. temporary Slice 1 override
  3. signal fallback
  4. safe default
- `/jobs/new` default mapping remains:
  - `hybrid` -> ECC default
  - `ecc_hers` -> ECC default
  - `hvac_service` -> Service default
- Contractor mode behavior is unchanged.
- Draft `jobType` still wins over defaults.
- ECC and Service remain selectable.

ECC naming Phase 1 boundary:

- Visible user-facing copy should prefer "ECC" where this phase applied.
- Internal storage/type naming remains intentionally unchanged (`ecc_hers` still exists and is valid).
- Resolver behavior is unchanged by naming cleanup.
- Internal enum/data migration is deferred to a future Phase 2.

Explicit non-actions for this closeout:

- No production migration was applied.
- No Supabase db push was run.
- No backfill or provisioning occurred.
- Product mode is not documented here as admin-editable yet.
- Signup product-mode capture is still later.

Product Mode Surface Hints V0 closeout note:

- Product Mode Surface Hints V0 is complete as a presentation-only slice.
- HVAC Service copy is now slightly more service/work-order oriented on approved shell, admin, and `/jobs/new` surfaces.
- ECC/HERS and Hybrid preserve current contractor/ECC relevance, and Hybrid remains owner All-in-One.
- Product mode continues to control workflow relevance/defaults only.
- No security/RLS/role/entitlement/report/billing/payment/QBO/contractor-authority behavior changed.
- No route blocking or manual ECC/Service selection removal was introduced.

HVAC Service Surface Cleanup V1 closeout note:

- HVAC Service Surface Cleanup V1 is complete as a presentation-only cleanup slice.
- HVAC Service mode now hides/de-emphasizes ECC/compliance-first breadcrumbs and keeps service/work-order language primary on approved admin and `/jobs/new` surfaces.
- Contractor/subcontractor collaboration tools were moved out of the HVAC primary admin grid into a secondary collapsed optional collaboration section.
- No functionality was deleted; optional collaboration tools remain reachable.
- ECC/HERS and Hybrid visibility behavior is preserved.
- No permissions/security/RLS/contractor-authority/billing/report/data behavior changed.

HVAC Service Ops First Impression + Shared Notes De-Emphasis V1 closeout note:

- Completed as a presentation-focused HVAC Service-first polish for `/ops` and `/jobs/[id]`.
- In `hvac_service` mode, `/ops` now presents Team Work Snapshot + Work by Technician in place of the primary contractor filter/search block, with existing job search still available.
- HVAC Service operational framing now reads as team/work oriented where applicable.
- ECC/HERS contractor filter/search, contractor links, and contractor query-param behavior remain preserved.
- Hybrid / Master / All-in-One broad visibility behavior remains preserved, including contractor visibility.
- `/jobs/[id]` keeps Timeline and Internal Notes / Team Notes visible.
- Shared Notes remains available and was only de-emphasized/optional for HVAC Service mode; it was not removed from the shared platform.
- Source-of-truth boundaries remain intact (`job_events` unchanged; no lifecycle/test-truth authority changes).
- Validation recorded: TypeScript passed (`npx.cmd tsc --noEmit`), browser smoke passed across HVAC Service + ECC/HERS + Hybrid coverage, and no console/hydration issues were reported.
- Non-change boundaries remain explicit: no schema/migration/Supabase command work, no auth/RLS/authority changes, no billing/payment/Stripe/QBO changes, and no report-calculation changes.

`/jobs/new` Product-Mode Family Visibility Tightening V1 closeout note:

- Completed as a presentation/defaulting tightening slice for internal intake on `/jobs/new`.
- Normal product accounts now show only their relevant family lane:
  - `hvac_service` -> Service / Work Order only
  - `ecc_hers` -> ECC / Compliance Test only
- Hybrid / Master / All-in-One remains the explicit all-in-one exception and continues to show both lanes.
- Hidden-field safety and server-side intake normalization were tightened so stale draft/query/form state does not flip family for non-hybrid internal accounts.
- No tier/add-on unlock behavior was introduced in this slice; future ECC-plus-Service unlock remains roadmap/backlog only.
- Boundaries preserved: no schema/migrations/Supabase command/RLS/auth/security/source-of-truth/contractor-authority/billing/payment/report-calculation behavior change, and no codebase split.

`/jobs/new` HVAC Service Contractor-Control Visibility Tightening V1 closeout note:

- Completed as a presentation/form-state safety slice for HVAC Service internal intake only.
- `hvac_service` hides contractor assignment selector and contractor billing option on `/jobs/new`.
- Hidden-field safety clamps stale `contractor_id` and stale contractor billing selection in HVAC Service mode.
- `ecc_hers` and `hybrid` are intentionally unchanged.
- Future service-side external-company/source/bill-to modeling remains separate backlog and was not introduced in this slice.
- Boundaries preserved: no schema/migrations/Supabase/RLS/auth/security/contractor-authority/portal-rule/notification/billing-engine/report/source-of-truth changes.

Related Companies V1 (future HVAC Service feature) planning note:

- Naming: `Related Companies`.
- Decision: Service-side third-party company/source tracking must not reuse `jobs.contractor_id`.
- Rationale: contractor model is authority-coupled and behavior-coupled (portal visibility, contractor workflows, email paths, duplicate matching, billing defaults).
- Product scope: HVAC Service mode only unless explicitly expanded later.
- Explicit non-change scope: ECC/HERS contractor behavior unchanged; Hybrid/Master/All-in-One unchanged.
- V1 recommended scope:
  - internal tracking only
  - account-scoped reusable related-company directory
  - job/work-order-level relationship link
  - relationship types: Home Warranty Company, Property Manager, Builder, Realtor, Insurance, Referral Source, Other
  - optional contact details and notes
- V1 hard exclusions:
  - no portal access
  - no authority model changes
  - no contractor_id writes
  - no billing behavior changes (`billing_recipient` and billing truth unchanged)
  - no invoice/payment behavior changes
  - no notification behavior changes
- Deferred phases:
  - service-case/customer/location defaults
  - billing responsibility workflows
  - estimate/invoice sharing
  - portal access
  - approval workflows
  - notifications
  - external party accounts
- Planning-only guardrail: no schema changes, no migrations, no Supabase commands, no auth/RLS changes in this planning pass.

Owner Signup Visibility V1 closeout note:

- Owner Signup Visibility V1 is implemented as a read-only allowlisted observability slice.
- Self-serve signup now performs a best-effort owner notification only after successful provisioning, product-specific mode validation where applicable, and invite orchestration attempt.
- Notification delivery failure is warning-only and does not block signup success/neutral submitted behavior.
- New route `/ops/owner-console` provides platform-wide account/user/product-mode summaries and is intentionally separate from Support Console.
- Access authority is explicit env allowlist only (`PLATFORM_OWNER_EMAILS`, optional `PLATFORM_OWNER_USER_IDS`) and fails closed when allowlists are empty/missing.
- Access is not granted by `product_mode` (including `hybrid`), tenant admin role, billing mode, entitlement status, or company profile metadata.
- Scope boundaries remain intact: no impersonation, no support-side mutation, no tenant data edit actions, no product-mode editing, no billing/Stripe admin actions, and no security/RLS behavior changes.

Product Choice Signup Landing V1 closeout note:

- Public `/signup` now renders a product-choice landing with two cards: SERVICE and ECC.
- SERVICE routes to `/signup/service` and ECC routes to `/signup/ecc`.
- Existing `/signup/service` and `/signup/ecc` product-mode behavior is unchanged.
- Hybrid remains manual/operator-only and has no public signup path.
- No tier/add-on, billing/payment/QBO, security/RLS, or contractor-authority behavior changed.

Owner Console UI Polish + Admin Link V1 closeout note:

- Owner Console now defaults to a Current view that emphasizes active/trial/grace accounts in headline metrics.
- Inactive/cancelled accounts are available through a separate read-only filter (`Inactive / Cancelled`) and `All` view remains available.
- Owner Console table readability was improved (column priority/truncation and de-emphasized UUID placement) without adding mutation controls.
- Admin Center now shows an `Owner Console` card only when `isPlatformOwnerActor` allowlist authority passes.
- Link visibility is not granted by product mode (`hybrid` included), tenant admin role, billing mode, entitlement status, or profile metadata.
- Scope boundaries remain unchanged: no impersonation, no support-console enablement, no tenant mutation actions, and no security/RLS behavior changes.

Owner Console Hidden Test Accounts V1 closeout note:

- Known internal/test accounts are suppressed from default Owner Console headline counts and the Current view via `PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS` env var (comma-separated, case-insensitive).
- A new read-only `Hidden / Test` filter view exposes these accounts for inspection without adding them to normal operating metrics.
- No data deletion, archive, Stripe cleanup, auth deletion, Support Console activation, impersonation, or tenant mutation was performed.
- Logic lives entirely in `lib/business/platform-owner-dashboard.ts` (`parseHiddenAccountEmails`, `isHiddenTestAccountRow`, updated `filterPlatformOwnerDashboardRows` / `summarizePlatformOwnerDashboardRows`).
- 25/25 tests passing; TSC clean.

Owner Console Internal Account Separation + Display Polish V2 closeout note:

- Platform/internal owner accounts are separated from customer counts through env-configured display classification (`PLATFORM_OWNER_INTERNAL_ACCOUNT_EMAILS`) and exposed in a read-only `Platform / Internal` view.
- Hidden/test account suppression remains env-driven (`PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS`) for default customer counts/views, with read-only visibility in `Hidden / Test` and `All`.
- Product/billing display labels are now friendly (`HVAC Service`, `ECC`, `Hybrid`, `Not Set`, `External Billing`, `Internal Invoicing`), and null product mode renders contextually (`Platform / Internal` for internal rows or `Not Set` for customer rows).
- No product_mode mutation, no database cleanup, no Stripe cleanup, no Support Console activation, no impersonation, and no tenant mutation were performed.

- Initial guarded attempt correctly stopped when production ref `ornrnvxtwwtulohqwxop` was detected; no writes occurred in that stopped attempt.
- Corrected pass relinked to sandbox ref `kvpesjdukqwwlgpkzfjm`.
- Branch/worktree state was `main` with clean status.
- Migration `20260509120000_account_settings_product_mode_v1.sql` was pending only in sandbox before apply.
- Dependency preflight checks passed:
  - `public.set_updated_at` exists
  - `public.current_internal_account_owner_id` exists
  - `public.account_settings` did not already exist in conflicting shape
- Sandbox migration apply commands were:
  - `supabase db push --linked --dry-run`
  - `supabase db push --linked`
- Post-apply verification passed:
  - `public.account_settings` exists
  - expected columns exist
  - PK/check/FKs present
  - RLS enabled
  - SELECT policy `account_settings_select_account_scope` exists and is scoped by `current_internal_account_owner_id()`
  - `account_settings_set_updated_at` trigger exists and uses `set_updated_at`
  - migration list shows local/remote applied for `20260509120000`
- Browser smoke passed:
  - `/jobs/new` loads
  - owner/hybrid current account defaults ECC
  - Service remains manually selectable
  - switching back to ECC works
- Intentionally skipped checks:
  - optional allowed-values mutation test skipped to avoid extra mutation risk
  - cross-account HVAC/ECC fixture smoke skipped because fixture/account context switching was unavailable
- Production remained untouched:
  - no production migration
  - no production db push
  - no production writes
  - no env/feature-flag/provisioning actions

Product Mode V2 production migration execution closeout (2026-05-10):

- Applied migration: `20260509120000_account_settings_product_mode_v1.sql`.
- Production ref: `ornrnvxtwwtulohqwxop`.
- Isolated apply worktree: `C:/Users/eddie/hvac-saas-productmode-dryrun`.
- Final pre-apply dry-run targeted only `20260509120000`; apply completed with exit code `0`.
- Post-apply read-only verification passed:
  - `public.account_settings` exists
  - expected columns exist (`account_owner_user_id`, `product_mode`, `product_mode_updated_at`, `product_mode_updated_by_user_id`, `created_at`, `updated_at`)
  - PK/FKs/check/RLS/policy/trigger verified
  - row count is `0`
  - migration history confirms `20260509120000` applied
- No-write smoke passed:
  - `/jobs/new` loads for internal user
  - existing manual ECC and Service selection remains stable
  - `/estimates` behavior unchanged
  - Support/People & Access workspace unchanged
  - no admin product-mode edit UI
  - no signup product-mode capture
  - contractor admin/access flows unchanged
- Warnings/watch items:
  - expected benign idempotent trigger/policy drop notices during apply
  - intermittent `net::ERR_ABORTED` navigation requests observed; destination pages still loaded and smoke checks passed
  - Supabase CLI update notice observed
- Boundaries preserved:
  - no `account_settings` rows created
  - no backfill
  - no owner Hybrid row written
  - no customer account product-mode rows
  - no signup capture
  - no admin edit UI
  - no tier/add-on enforcement
  - no navigation/report/starter-kit behavior changes
  - no billing/payments changes
  - no contractor authority changes
  - no Estimates behavior changes
  - no Support Console behavior changes
  - no Vercel/env flag changes

### 3.8. Release-scope statement

**Current Owner Release Posture (May 2026):**

- **Primary version**: ECC/HERS / Compliance Testing (go-to-market focus)
- **Secondary foundation**: HVAC Service version (ready operationally; not primary marketing focus yet)
- **External access**: Contractor-focused (ECC/HERS contractor intake and portal only)
- **No immediate mode-switching**: Product-mode matrix documents the architectural intent; no UI mode-switch is required before next polish passes
- **No customer portal in current scope**: Customer visibility for service cases is parked; only contractors and internal users have external access currently
- **Onboarding**: Controlled-tester onboarding remains parked pending explicit owner approval (separate runbook process)

**Release scope is locked.** See [docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md) for the full decision surface: completion status matrix, locked scope, deferred/parked list, runbook-gated items, Support V0/V1/V2 model, and post-launch roadmap order.

**Development Guidance:**

- Future slices should respect both versions and prevent buyer-story drift
- Product-mode matrix should guide feature scope, navigation tuning, and reporting defaults
- No source-of-truth rewrite is needed to support both versions
- Shared engine model remains stable; mode differences are presentation/configuration only
- When implementing features, ask: "Is this ECC/HERS-specific, Service-specific, or shared?" and document accordingly

---

### Scope vs Line Items terminology alignment (completed)
- The Scope vs Line Items terminology alignment pass is complete.
- The product model remains:
  - Job = visit/work record
  - Visit Scope / Work Items = operational work scope
  - Estimate Lines = proposed commercial view
  - Invoice Charges = billed commercial view
  - Payment = collected truth only where implemented
  - Pricebook = reusable catalog/default pricing truth
- First implementation was intentionally wording-only.
- Pricebook-assisted Work Item Creation V1 is now implemented (`6145f16`) as a UI-only operational assist:
  - optional `Start from Pricebook template` control in Work Item builder
  - Work Item `title` prefill from Pricebook `item_name`
  - Work Item `details` prefill from Pricebook `default_description`
  - create-or-prefill behavior (fill blank Work Item when available, otherwise add a new row within existing limits)
  - Work Item save path remains existing `visit_scope_items_json` submission
  - assist is available in intake and job-detail Work Item edit surfaces
- Work Item Import Defaults Clarification V1 is now implemented (`8f79e07`) as UI-only invoice-panel clarification:
  - Work Item import helper copy now explicitly states the current conservative draft-charge defaults
  - exact helper copy: `Imported Work Items start as draft Invoice Charges with Qty 1.00 and Unit Price $0.00. Review and edit pricing before issuing.`
  - Work Item-first billing flow is reinforced: Work Items remain operational work scope, imported Work Items become draft Invoice Charges, and Invoice Charges remain reviewed billed copies before issue
  - existing transfer mechanics remain unchanged (`source_kind = visit_scope`, `source_visit_scope_item_id` preserved, `quantity = 1.00`, `unit_price = 0.00`)
- Invoice Panel Hierarchy Polish V1 is now implemented (`2cc5d58`) as UI-only layout/copy hierarchy refinement:
  - Work Item import now renders before `Add From Pricebook` in the draft invoice builder
  - Work Item import remains the explicit recommended path
  - `Add From Pricebook` now reads as fallback for charges not already captured as Work Items
  - manual `+ Add Charge` now reads as an exception/fallback path
  - transfer mechanics and defaults remain unchanged (`source_kind = visit_scope`, `source_visit_scope_item_id` preserved, `quantity = 1.00`, `unit_price = 0.00`)
- Work Item-first Flow Copy Density Polish V1 is now implemented as a tiny UI-only copy/layout refinement:
  - invoice/work-item helper language is trimmed and less technical
  - Work Item path remains primary, Pricebook remains fallback, manual add remains exception/fresh-charge path
  - behavior, transfer mechanics, and defaults remain unchanged
- Visit Scope / Work Items Smart-Entry + Job Detail Polish closeout is complete (2026-05-12):
  - Pricebook-assisted Work Item entry now supports prefill for title, description, expected/default price, unit label, type, and category, while manual Work Item entry remains supported.
  - Work Items remain operational visit scope; Invoice Charges remain downstream reviewed billed truth.
  - Invoice import behavior did not change; Work Item expected/default pricing does not auto-bill.
  - `/jobs/new` ownership remains explicit: Step 3 is classification/setup; Step 5 owns visit reason and Work Items.
  - `/jobs/[id]` Visit Scope and top summary/header were compacted for readability; Work Needed now summarizes Work Items only.
  - Shared Notes is now hidden from internal `/jobs/[id]` across internal modes; Timeline and Internal Notes / Team Notes remain the active narrative surfaces.
  - Estimates remain unchanged and deferred as separate scope.
- This V1 assist preserves source-of-truth boundaries:
  - Pricebook = reusable defaults/templates
  - Visit Scope / Work Items = operational work scope
  - Invoice Charges = billed commercial view
  - Estimate Lines = proposed commercial view
  - Payments = collected truth where implemented
- The import-defaults clarification preserves the same boundaries and guardrails:
  - no schema or migration change
  - no Supabase command or production data action
  - no RLS/policy/auth or feature-flag change
  - no invoice issue/send/payment behavior change
  - no Visit Scope, Pricebook, estimate, Stripe tenant payment, or QBO behavior change
  - no automatic pricing, no Pricebook text matching, and no persisted Work Item provenance
- The hierarchy-polish refinement preserves the same boundaries and guardrails:
  - no schema or migration change
  - no Supabase command or production data action
  - no RLS/policy/auth or feature-flag change
  - no invoice issue/send/payment behavior change
  - no Visit Scope, Pricebook, estimate, Stripe tenant payment, or QBO behavior change
  - no automatic pricing, no Pricebook text matching, and no persisted Work Item provenance
- The copy-density refinement preserves the same boundaries and guardrails:
  - no schema or migration change
  - no Supabase command or production data action
  - no RLS/policy/auth or feature-flag change
  - no invoice issue/send/payment behavior change
  - no Visit Scope, Pricebook, estimate, Stripe tenant payment, or QBO behavior change
  - no automatic pricing, no persisted provenance, and no truth-layer collapse
- Deferred follow-on remains explicit and unimplemented:
  - persisted Pricebook provenance on Work Items
  - smarter defaulting/pricing from Work Items to draft Invoice Charges
  - Work Item commercial fields
  - broader invoice panel density cleanup
- Future end-of-road UX review option (deferred and not current implementation): evaluate whether billing/invoice work should move into a job-owned workspace route such as `/jobs/[id]/billing` or `/jobs/[id]/invoice` only if job detail remains too dense after broader completion; do not split into disconnected invoice pages; preserve job context, Work Item import behavior, issue/send/payment boundaries, permissions, source-of-truth ownership, and existing invoice components where practical.
- Maintenance Agreements / Recurring Services V1 should be modeled as a customer-owned recurring service agreement, optionally anchored to a primary location, that plans future visits but is not itself a job, service_case, or billing record.
- Jobs remain the actual visit / work execution unit; service_cases remain continuity truth; Work Items / Visit Scope remain the operational scope for each visit; invoices remain billed truth; payments remain collected truth where implemented.
- Pricebook may assist later with agreement templates/defaults, but it must not become agreement truth.
- Dedicated model source of truth: [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md).
- Group 9A-3 (Customer Profile Read-Only Agreement Display) is implemented and pushed in commit `09edc9f`:
  - feature flag: `lib/maintenance-agreements/agreement-exposure.ts` (`ENABLE_MAINTENANCE_AGREEMENTS`, defaults `false`)
  - customer profile section: `app/customers/[id]/page.tsx`
  - tests: `lib/maintenance-agreements/__tests__/agreement-exposure.test.ts` (14 tests; 21 total)
  - validation passed: targeted Vitest (`21` tests) and `npx.cmd tsc --noEmit`
  - production guard: flag defaults `false`; production never reads `maintenance_agreements` before migration apply
  - boundaries preserved: no create/edit agreements, no job generation, no calendar, no invoices/payments, no portal
  - visual sandbox smoke with flag enabled is a watch item
- Group 9A-2 (Maintenance Agreements Schema + RLS + Read Model V1) is implemented and pushed in commit `b126ff6`:
  - migration: `supabase/migrations/20260512120000_maintenance_agreements_v1.sql`
  - read model: `lib/maintenance-agreements/read-model.ts`
  - tests: `lib/maintenance-agreements/__tests__/read-model.test.ts`
  - validation passed: targeted Vitest (`7` tests), `git diff --check`, and `npx.cmd tsc --noEmit`
  - boundaries preserved: no job linkage/generation, no calendar events, no invoices/payments, no Stripe tenant payment behavior, no QBO, no SMS, no portal, no UI mutation flow, and no production migration apply
  - activation rule: backend foundation is committed in repo and remains not production-active until the migration is intentionally applied through the appropriate environment process

### Current status note (reporting/truth separation)
- Internal invoice ledger collected-payment visibility is now implemented for internal invoicing report surfaces (including CSV export) as reporting/tracking only.
- Separation remains locked:
	- invoices = billed truth (`internal_invoices` / `internal_invoice_line_items`)
	- payments = collected truth (`internal_invoice_payments`)
	- platform entitlement = platform account truth (`platform_account_entitlements`)
- This status update does not introduce payment execution, Stripe checkout, QBO sync, or dashboard payment analytics expansion.

P1 closeout note:
- Phase P1 payment-ready foundation is now complete enough to close at the current baseline, with final closeout-quality test fidelity polish completed on collected-payment report projections.

### Launch-readiness catch-up (completed)
- Service / Visit Scope clarity pass is complete:
  - job detail now clarifies Service Details classification vs Visit Scope trip-owned work definition
  - Job Title fallback copy is clarified
  - no model, validation, billing, ECC, or RLS behavior changes were introduced in that pass
- Invoice job-detail TLC pass is complete:
  - internal invoice panel scanability is improved
  - invoice truth anchor is explicit: invoices are billed truth, payment entries are tracking-only and do not execute card charges
  - issue/send/payment/void section wording is clarified
  - external-billing lightweight path wording now emphasizes Invoice Sent tracking
  - line-item editor microcopy polish is complete
  - no live payment execution was introduced
- Internal invoice draft prefill fallback hardening is complete where source fields exist:
  - available job/customer/contractor/location fields are now used for fallback prefill
  - existing drafts are not overwritten
  - issue/send/payment behavior is unchanged
- Address state capture/wiring support is complete for relevant intake/finalization paths:
  - `locations.state` is populated where state is captured
  - contractor intake proposal state persists through `proposed_state`
  - this supports invoice billing-state prefill where source data exists
- Contractor intake production hotfix closeout is complete as a resolved incident note (not a roadmap-direction change):
  - confirmed incident: contractor request for 4137 Amberwood Cir, Pleasanton failed/disappeared and did not persist
  - confirmed production read-only sweeps found no matching durable row in `contractor_intake_submissions`, `jobs`, `customers`, `locations`, `job_events`, or `notifications`
  - confirmed 24-hour production sweep found no additional silent contractor intake failures
  - root cause was contractor `/jobs/new` form not posting `state` while server proposal validation required `address_line1`, `city`, `state`, and `zip`
  - fix is deployed: contractor form now posts `state`, required-address behavior aligns with server validation, and post-save side effects do not erase successful submissions
  - no production data repair was possible for the failed row because it never persisted
  - contractor was asked to resend; a new production contractor submission path succeeded after fix
  - contractor intake architecture/boundaries remain unchanged: proposed intake data only, no contractor scheduling/lifecycle authority, internal finalization ownership retained
  - no payment, Stripe, QBO, support-access, RLS model, or tenant-boundary behavior changed
- Contractor intake attachment resilience V1 is complete as a resolved follow-up to the missing-state incident:
  - follow-up issue: contractor intake still failed only when documents/photos were attached
  - root cause/risk: file bytes were being sent through the initial Next Server Action for contractor `/jobs/new`; large photos/PDFs could exceed the request body parser limit before `createJobFromForm` ran, leaving no durable `contractor_intake_submissions` row
  - fix shipped in `70d1ee3` (`Harden contractor intake attachments`): initial contractor proposal submit is text-only/durable-first; the proposal row persists before attachment upload; attachments upload afterward through signed-upload/finalize scoped to the saved pending proposal
  - finalize requires valid signed path shape and verifies the uploaded storage object exists before inserting attachment rows
  - server-side validation covers file count, size, MIME/type, and extension
  - attachment DB insert failure attempts storage cleanup
  - attachment failure never deletes, rolls back, or hides the saved proposal
  - notification/email side-effect failures remain best-effort and do not erase saved proposals
  - boundaries remain unchanged: proposed intake data only, no contractor scheduling/lifecycle authority, internal finalization ownership retained, and no canonical customer/location/job creation until internal finalization
  - no payment, Stripe, QBO, support-access, RLS model, or tenant-boundary behavior changed
  - validation passed: `npx.cmd tsc --noEmit`; targeted Vitest contractor intake hotfix + attachment resilience tests, 2 files / 10 tests
- Internal invoice void recovery/replacement behavior is complete:
  - voided internal invoices remain historical
  - voided invoices do not satisfy billed-truth closeout
  - replacement draft invoice can be created for the same job and becomes the active billing/closeout path
  - no payment execution was introduced
- Invoice report label polish is complete:
  - Comm State -> Send Status
  - Payments -> Payment Count
  - CSV header wording aligned where applicable
  - no invoice/payment calculations were changed

Completed production-shipped cleanup batch note (current baseline):
- Notifications/proposals: unread-awareness cleanup, card identity restoration, and proposal follow-up/internal-note preservation are complete with contractor/internal visibility boundaries intact.
- Calendar/scheduling: customer/job phone wiring fix, card identity restoration, no-tech visibility + unassigned filter, inspector default-collapsed behavior, responsive default-view behavior, and unified-surface drag/drop direction are complete.
- UI polish: date display format update (MM-DD-YYYY), login password show/hide, and Failed/Need Info aging counters are complete.
- ECC/test workflow: refrigerant Photo Taken is attestation-only (no upload-proof validation claim), and Asbestos is included as a duct-leakage override suggestion while custom reasons remain supported.
- This closeout note is baseline alignment only and does not add a new roadmap milestone.

Field-note launch-hardening closeout alignment note (current baseline):
- Completed commits in this batch:
  - Duct leakage required-result hardening (`2dd205a`)
  - Notification enrichment resilience (`381592b`)
  - Notification card polish (`38bd4e0`)
  - `/ops` New Work Requests signal alignment (`d5a31cc`)
  - Contractor portal evidence-accepted closeout wording alignment (`9d51091`)
- What was aligned:
  - duct leakage completion now requires measured result while preserving Save Draft partial behavior
  - notification awareness/presentation hardening is complete and `/ops` now exposes New Work Requests separately from narrow Contractor Updates
  - evidence-accepted failed ECC contractor projection now distinguishes final-processing vs resolved/closed contractor-safe wording
- Explicit non-changes preserved:
  - no schema changes
  - no migrations
  - no Supabase commands
  - no RLS/auth changes
  - no source-of-truth redesign
  - no queue rewrite
  - no payment/Stripe tenant execution/QBO/Estimates/Support/onboarding behavior changes
- Launch gating remains unchanged:
  - controlled tester onboarding remains parked pending explicit owner approval
  - Estimates and Support Console production enablement remain parked behind runbooks
  - tenant customer payment execution remains deferred
  - QBO remains optional/downstream only

Contractor report current-scope closeout note (completed):
- Contractor Report current-scope delivery is complete and professional enough for current launch scope.
- Failed ECC contractor reports aggregate all failed completed ECC runs for the job and include enriched contractor-actionable details (baseline, measured value, variance) with corrected duct-leakage percentage logic.
- Airflow and duct leakage failures both render when both are failed.
- Refrigerant Charge pass override/weather exception remains excluded from contractor failure issues.
- Preview is sectioned into report type, what failed, next step, and additional note.
- Next-step wording is neutral and aligned: "Review and submit your response in the portal."
- Send flow supports recipient override (default contractor email), server-side recipient validation, and recorded actual/default/overridden recipient metadata.
- Sent snapshot hardening is complete in `contractor_report_sent` metadata: `report_render_version`, `failure_details`, `reasons`, `next_step`, `body_text`, and recipient metadata.
- Professional HTML email delivery with true plain-text fallback and contractor portal CTA is implemented.
- contractor_report_sent remains audit/history truth in `job_events`; outbound contractor report send does not create internal notification-table records.
- Notification-table delivery tracking was removed from this send path because it was nonessential and could block delivery under notifications RLS.
- PDF generation/attachment remains deferred.

Branch workflow update (active discipline):
- The old `sandbox-clean-start` Git branch is retired because it became stale/diverged from current `main` and posed revert risk.
- `main` is the current production truth.
- Use short-lived feature branches from current `main`, validate, merge, and retire after use.
- Supabase sandbox remains usable; only the stale Git branch was retired.

### Launch-readiness performance and responsiveness track (active backlog, current pass closed)
- The recent speed/responsiveness batch was a necessary quality intervention, not a permanent roadmap reorder.
- Completed closeout baseline from that intervention:
  - field action timing instrumentation
  - job detail render timing instrumentation
  - internal `/jobs/[id]` route decomposition and deferred secondary bodies (attachments, follow-up history, service-chain body, add-assignee form, timeline/shared/internal narrative bodies)
  - internal invoice secondary-detail deferral: immediate billing/closeout truth remains first-paint, while full invoice detail/lines/delivery/payment/pricebook panel data streams later
  - customer-attempt summary deferral (`ab95b8b`): `customerAttemptSummary` is now `0ms` on measured first-paint renders, contact actions remain immediate, no false "0 attempts" display is shown, and Follow-Up History remains authoritative/deferred
  - timeline summary first-paint softening (`7037ad8`): blocking 200-row `job_events` parent read was removed from first paint; shared/internal notes and timeline header counts/latest-date subtitles use neutral "loads below" copy; deferred timeline/shared/internal note bodies remain authoritative and still read `job_events` after streaming; `ContractorReportPanel` generate/send behavior is unchanged
  - parent read fanout parallelization after scoped boundary and main job load
  - contact responsiveness hardening (deduped calendar revalidation, action-specific pending feedback, no stuck `Recording...`, contact-section context restoration after redirect)
  - env-gated diagnostics remain available (`CONTACT_ATTEMPT_TIMING_DEBUG`, `JOB_DETAIL_TIMING_DEBUG`)
  - measured paths have shown practical warm improvements; latest local `/jobs/[id]` smoke showed steady-state renders commonly around ~`1.45-2.47s`, `timelineSummary` usually around ~`183-384ms` after softening, and `customerAttemptSummary` stayed `0ms`, with cold/backend/Supabase variance still present
- Performance remains active launch-readiness backlog and should continue as measured, surgical slices across:
  - `/ops`
  - `/jobs/[id]` first load/recomposition
  - `mainJobRead`/`eccPayloadReads` spike risk
  - `assignmentDisplaySummary` spike risk
  - `serviceChainSummary` spike risk
  - invoice truth/detail split monitoring
  - broader backend/read variance audit territory
  - lifecycle actions
  - contact actions
  - `/jobs/new`
  - calendar
  - reports
  - safe partial-settle opportunities
- Performance should no longer own the entire roadmap unless a specific speed defect is actively harming usability.
- Speed guardrails remain locked:
  - do not chase speed by weakening truth boundaries
  - do not weaken auth/scope/source-of-truth/event/audit/revalidation just to chase speed
  - no optimistic final-state UI without explicit approval
  - do not trim revalidation without dependency mapping
  - do not casually alter invoice/billing/payment paths for speed
  - maintain audit -> small slice -> benchmark -> commit -> docs update

Ops First Impression (`/ops`) closeout alignment note (current pass complete):
- `/ops` first-impression pass is closed for this current pass and should not be treated as an always-on blocker.
- Real behavior improvements completed:
  - removed unused Upcoming read path from blocking render (`0e0b05e`)
  - switched contractor-update awareness to narrow helper instead of rich notification enrichment (`67163ec`)
- Diagnostics coverage now includes request actor context, primary queues, secondary signals, assignment display, notifications, and closeout projection under `OPS_TIMING_DEBUG` (`86d6e02`, `c256153`, `3c5d261`, `277e898`, `1f978a6`, `54708a8`, `bfcf72337cb1d9ce3afc2408b4db62eaa1e2fe55`, `64ce273`, `44d63e1`, `c07745c`).
- Findings remain consistent with a shared-variance profile:
  - Field Work is fetch-side and not uniquely slower than Call List
  - assignment display cost centers on assignment fetch + profile display map
  - closeout projection is not a deterministic bottleneck
  - request actor context variance is lookup-driven, not assembly
  - residual large spikes appear more consistent with backend/network/Supabase variance than a single local loop
- Explicit non-changes preserved:
  - no schema/migration/Supabase-command/RLS-auth/queue-semantics/event-revalidation/billing-payment/Estimates-Support-QBO-onboarding behavior changes
- Future performance work remains optional and measured only:
  - deeper auth/request-actor review with high caution
  - optional Ops-specific lightweight assignment helper only if future timing data justifies it
  - broader shared backend/read variance investigation
  - continue surgical performance slices only when a concrete usability issue is observed

### Resumed pre-launch sequence (post-speed-batch)
- The planned launch-readiness order is resumed as:
  1. Performance/responsiveness batch closeout and documentation (closed for the current pass)
  2. Support Console production readiness planning
  3. Estimates production readiness planning
  4. Field-ready installable/PWA access readiness (V1 Slice 1 baseline hardening complete; V1B-1 Proxy Verification + Portal Loading Polish complete)
  5. Final launch confirmation sweep
  6. First-owner/operator handoff dry-run
  7. Controlled tester onboarding
- Tester pressure must not trigger roadmap panic; controlled tester onboarding remains intentionally queued after readiness checkpoints are acceptably complete.
- Support Console and Estimates production enablement remain parked behind their runbooks.
- Tenant customer payment execution remains deferred.
- QBO remains optional downstream/last-last.
- Resume broader launch-readiness sequencing after this docs closeout.

### Future notifications/signals backlog
- Future feature: tech dispatch phone notifications.
- When a tech is assigned/dispatched to a job, the tech should receive a phone notification.
- Include a later user-facing preference/toggle so techs can turn dispatch notifications on/off.
- This is not part of the current performance closeout and was not implemented in this thread.

### Execution discipline and coordination guardrails
- Preserve truth boundaries while optimizing:
  - `jobs.ops_status` operational projection truth
  - `job_events` audit truth
  - billing/invoice/payment truth boundaries
  - contractor/internal authority boundaries
- Keep implementation discipline:
  - Codex: higher-risk dependency mapping and diff-risk review
  - VS Agent: surgical implementation and docs updates
  - ChatGPT: sequencing, guardrails, prompt strategy, and review coordination

### Priority ordering update (pre-launch)
- Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed in production for the platform account subscription slice.
- Live confirmation includes deployed env, live webhook handling, successful non-owner checkout completion, entitlement sync, and Manage billing availability.
- This onboarding priority remains separate from tenant customer invoice payment execution.
- Tenant customer invoice payment execution remains deferred unless explicitly pulled forward.
- Live Pay Now/Charge Card/checkout/refunds/disputes/payout execution remains deferred.
- Invoice/payment language remains tracking-only until processor-backed execution exists.

### Service workflow refinement V1 baseline (completed)
- Service Case Reconciliation V1 is complete: centralized `reconcileServiceCaseStatusAfterJobChange` helper is wired into closeout and next-visit write paths; active linked visit keeps/reopens case open; all-terminal linked visits resolve case; `job_events` write intentionally deferred.
- Interrupt/Waiting State V1 is complete: Pending Info, On Hold, and Waiting states with explicit clear actions; waiting reasons are V1-defined; job-level only; no auto-clear on Create Next Service Visit.
- Create Next Service Visit is complete: foundation-only; internal users can create a next visit under the same service case; no auto-release, no parts inventory, no estimate automation, no Visit Scope copy-forward.
- Reporting cleanup is complete: dashboard/report drilldown alignment done; Jobs Report assignment filter (All/Unassigned/specific user) is complete; Jobs Report now includes `contractor_id = null` same-account customer-owned jobs while cross-account null-contractor jobs remain excluded; contractor filter remains contractor-only for safety; Service Cases Report Latest Visit display is clarity-only polish; remaining work is visual/card polish, not data alignment.
- Next planned product track after this baseline: estimates/quoting.
- Stripe tenant customer payment execution remains deferred.
- Confirmed: no schema changes, no migrations, no Supabase commands, no production data actions, no payment/Stripe/QBO/ECC/retest/Visit Scope/contractor/assignment/scheduling behavior changes were part of this baseline.

### Locked rule
Business-layer modules must not collapse, overwrite, or blur operational ownership boundaries.

Visit Scope is an operational layer under the job/visit model, not a billing record.
Invoice line items remain billed truth and must not be treated as the primary visit/work-definition layer.

---

## 3. Business-layer scope

This roadmap covers future planning for:

- Pricebook
- Estimates
- Internal invoicing
- Billing/reporting structure
- Company billing modes
- Business-layer rollout rules
- Optional accounting sync context

This roadmap does **not** own payment-execution architecture.

Payment-execution direction is governed by:

- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

### Payment expectation (locked)
Yes — **Stripe is now the future payment expectation**.

That means:
- future payment acceptance should follow the Stripe-first direction defined in the payments roadmap
- QBO remains optional and downstream only
- this document should not redefine payment architecture independently

---

## 4. Company billing modes (locked)

A company must operate in one of two billing modes:

### 4.1 External Billing
The company uses Compliance Matters for operations, but bills outside the platform.

Supported behavior:
- current `Invoice Sent` workflow remains valid
- no internal invoice records
- no internal payment records
- billing is tracked only at the lightweight action level

### 4.2 Internal Invoicing
The company uses Compliance Matters as its billing system.

Supported behavior:
- internal invoice records
- invoice line items
- invoice/reporting workflows
- later payment support when that capability is introduced under the payments roadmap

### 4.3 Locked rule
A company is either **in** or **out** of internal invoicing.

Do not support half-use inside one live company workflow, because it corrupts reporting meaning.

---

## 5. Current starter closeout layer (locked clarification)

The current system already supports lightweight billing-action tracking through the existing **Invoice Sent** behavior.

This is a valid and supported live workflow.

### Meaning
- `Invoice Sent` is a lightweight billing-action tracker
- it does **not** mean a full internal invoice record exists
- it remains first-class for **external-billing** companies

### Locked rule
Current invoice-sent behavior remains the lightweight billing-action layer.

Future internal invoicing is a richer optional module layered on top, not a replacement that invalidates the current workflow.

### Implemented repo truth clarification
Current implemented repo truth includes both billing-mode paths:
- external-billing companies still use job-level closeout and lightweight invoice-action tracking
- internal-invoicing companies now use the internal invoice domain as billed truth
- manual collected-payment truth exists for issued internal invoices through `internal_invoice_payments`
- collected-payment reporting/visibility exists in the internal invoice ledger and CSV export
- live payment execution still does not exist

For current live workflows:
- `Invoice Sent` remains the lightweight billing-action path for external-billing companies
- `jobs.invoice_complete` remains an operational closeout marker
- neither `Invoice Sent` nor `jobs.invoice_complete` should be treated as internal-invoice-domain truth for internal-invoicing companies

Completed billing hardening slices for the current stabilized baseline:
- the external-billing split-brain closeout seam was corrected narrowly
- the supported `Mark Invoice Sent -> Closed` path now writes the lightweight billed-truth marker before supported closeout
- billing-truth read-side normalization is complete for current closeout/report/dashboard/ops surfaces: internal-invoicing readers derive billed truth from the internal invoice domain, while external-billing readers preserve lightweight job-level invoice-action meaning
- invoice-required counter/label normalization is complete for the current stabilized surfaces: invoice-required metrics and messaging now derive from billing-aware invoice-needed truth rather than raw `jobs.ops_status = invoice_required`
- external-billing secondary-field unification is complete for the supported lightweight completion paths: `data_entry_completed_at` is aligned across those supported paths, while `invoice_number` remains intentionally owned by the explicit data-entry path rather than being invented by lightweight action buttons
- internal-invoicing workflow and invoice-record truth ownership were intentionally left unchanged

Intentionally deferred after these completed slices:
- any broader dashboard/report expansion beyond the completed billing-aware normalization already shipped
- any payment-execution behavior

### Locked seam rule
- jobs remain operational closeout truth
- invoices become billed truth for internal-invoicing companies
- payments are collected truth (materially implemented for issued internal invoices) and must not become job billing truth

---

## 6. Company profile / business identity

Company profile / internal business identity is considered complete enough to support business-layer planning.

This means future:
- pricebook
- estimates
- invoices
- templates
- reporting

may rely on company context as the business-facing identity foundation.

### Locked rule
Company profile is not the next unresolved model decision in this roadmap.

### 6.1 First owner onboarding / account provisioning V1 (implemented — complete)

**Status: V1 complete.**

For the current validated baseline, onboarding now includes public self-serve signup at `/signup` for standard account creation, while invite-only platform-admin/operator provisioning remains supported as a controlled/manual fallback path.

Implemented files:
- `lib/business/first-owner-provisioning.ts` — idempotent provisioning helper; resolves/creates auth user → profile → `internal_users` → `internal_business_profiles` → `platform_account_entitlements`; dry-run / apply modes
- `scripts/provision-first-owner.ts` — operator script wrapper; defaults to dry-run; hosted `.supabase.co` targets require both allow flags for dry-run and apply as explicit remote-target confirmation
- `lib/auth/first-owner-routing.ts` — first-owner marker detection; routes to `/ops/admin` when all anchor rows confirmed; fails closed if any row is missing
- `app/set-password/page.tsx` — updated to call routing seam; routes first-owner to `/ops/admin`, normal internal to `/ops`, contractor to `/portal`
- `lib/business/pricebook-seeding.ts` — starter seed helper with V1 starter definitions and idempotent dry-run/apply behavior by `seed_key`

Tenant identity boundaries (unchanged):
- `internal_users` / `account_owner_user_id` = tenant/account anchor; owner row self-anchors (user_id = account_owner_user_id)
- `internal_business_profiles` = tenant operational identity
- `platform_account_entitlements` = platform account status context
- readiness = derived setup state; not a new source-of-truth table

V1 confirmed sequence:
- operator runs provisioning script (dry-run first, then apply with explicit allow flags)
- provisioning confirms/creates all required tenant rows
- provisioning dry-run/apply now includes Pricebook starter seeding through the helper
- first-owner marker is durably written to user metadata before invite send
- first owner accepts invite and sets password
- routing seam confirms all anchor rows before routing to `/ops/admin`; fails closed otherwise
- first owner lands in Admin Center readiness setup flow

Self-Serve Onboarding V1 confirmed sequence:
- public `/signup` collects owner email, owner display name, and business display name
- submit reuses existing first-owner provisioning helper and shared first-owner invite orchestration
- secure setup/invite email delivery is confirmed in functional smoke
- set-password/login flow is confirmed in functional smoke
- duplicate/existing email behavior intentionally returns neutral public messaging

Production dry-run smoke confirmation for D2C-3/D2C-4:
- top-level output `mode` is `dry_run`
- structured `pricebookSeeding` appears in operator output
- dry-run preview confirmed V1 starter set (`inserted_count = 12`, `skipped_count = 0`)
- no errors returned, no invite sent, and no apply/write action executed during smoke

Operator flag note: hosted Supabase projects use `.supabase.co` and are classified as production-like remote targets by the provisioning script. `ALLOW_FIRST_OWNER_PROVISIONING=true` enables the tool. `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` is also required for any hosted Supabase project (including sandbox) as explicit remote-target confirmation. Operators must verify the intended project before running apply. Dry-run should always be run first.

Why this direction:
- avoids orphaned tenant/company records
- supports controlled standard self-serve onboarding without exposing account-existence details
- keeps account-owner boundaries controlled around `account_owner_user_id`
- keeps support/onboarding quality intentional

Operator/manual path clarification:
- operator runbook path remains active and required for controlled/manual fallback needs
- internal/comped owner provisioning remains operator-controlled and is not exposed as public self-serve

Packaged-app note:
- if Compliance Matters is later packaged as an app, authentication still relies on the same server-side account provisioning/auth model; app shell packaging does not replace tenant onboarding or ownership setup.

### 6.2 Admin readiness / setup checklist V1 (completed)

Admin Readiness / Setup Checklist V1 is complete as a read-only packaging layer on current admin surfaces.

Boundary clarification:
- tenant operational identity remains sourced from `internal_business_profiles`
- platform account entitlement/status remains sourced from `platform_account_entitlements`
- readiness is derived state for setup packaging/visibility only, not a new source-of-truth table

This completion does not introduce a new tenant settings system and does not alter onboarding implementation boundaries.

Readiness behavior confirmation:
- `internal_business_profiles.profile_reviewed_at` and `internal_business_profiles.team_reviewed_at` are the setup-progress timestamps for user-completed onboarding steps.
- Newly provisioned standard accounts now show `0 of 5 complete` on first login until the admin actually reviews company profile and team setup.
- Saving company profile completes the profile-related readiness steps; confirming team setup completes the team step.
- This fixed the misleading first-login `5 of 5 complete` state without creating a new readiness truth table.

### 6.3 Closeout status for this roadmap area (current baseline)

Out-of-box readiness / business identity / settings packaging is complete enough to close at the current baseline with:
- Admin Readiness / Setup Checklist V1 complete as a read-only derived packaging layer
- First owner onboarding/account provisioning V1 complete as invite-only platform-admin/operator provisioning
- first-owner runbook documented and referenced for pre-launch operations

Boundaries remain unchanged:
- `internal_business_profiles` remains tenant operational identity
- `platform_account_entitlements` remains platform entitlement/status context
- readiness remains derived packaging state, not a new source-of-truth table
- public self-serve signup is implemented and functionally smoked for standard onboarding
- operator first-owner runbook path remains active/manual fallback
- initial signup-page first-impression polish is complete and acceptable for current baseline; deeper public-brand polish remains deferred
- platform subscription billing for onboarding is live-smoke confirmed for the platform account subscription slice
- internal/comped owner protection is complete; comped owner/internal accounts remain outside Stripe checkout and surface as Internal / Comped with no billing-customer or subscription requirement
- `/ops/admin/internal-users` normal launch UI no longer exposes the Link existing auth user panel; invite teammate, team setup confirmation, and team member management remain intact
- tenant customer invoice payment execution remains deferred
- live Stripe/customer checkout remains deferred

---

## 7. Pricebook v1 (implemented baseline; active continuation)

### Current status
Pricebook V1 is no longer fully deferred.

Current baseline state is:
- implemented in production from prior work: Pricebook admin surface, starter catalog rows, controlled Category/Unit Label options, and server-side validation of controlled Pricebook values
- production-promoted for C1B/C1C: invoice-line provenance/snapshot plumbing and draft internal invoice picker wiring are now production-complete and production-smoke confirmed
- production includes seed identity/versioning foundation: `seed_key` and `starter_version` (migration `20260427170000_pricebook_seed_identity_v1`)
- D2C-3 seed helper is production-promoted and matches original V1 starter seed definitions
- D2C-4 first-owner provisioning integration is production-promoted and uses helper dry-run/apply paths
- operator script now surfaces structured `pricebookSeeding` output for first-owner dry-run/apply visibility
- V2A/V2B are production-promoted on `main` (commits `7bf9867`, `51ce27c`)
- Starter Kit V2 seed definitions are implemented in code (`23` rows total: `21` active, `2` inactive/deferred)
- Starter Kit V3 is production-promoted on `main` and is now the default starter kit for new first-owner provisioning
- Starter Kit V3 supersedes V2 as the intended default starter catalog for newly provisioned accounts
- Starter Kit V3 catalog totals `97` rows (`91` active, `6` inactive/deferred)
- Starter Kit V3 includes modern refrigerant rows: `R-410A`, `R-454B`, and `R-32`
- Starter Kit `v1` and `v2` remain explicitly selectable legacy-supported options; `v3` is also explicitly selectable
- invalid selector values remain rejected before provisioning execution
- dry-run output now includes selected starter kit metadata (`starter_kit_version`, `seed_count`, `active_seed_count`, `inactive_seed_count`)
- safe-equivalent existing-account backfill behavior is production-promoted on `main`:
  - exact active legacy/different-seed-key equivalents are safely skipped
  - unsafe/ambiguous collisions remain blocking by default
  - existing rows are never updated or mutated
- controlled sandbox existing-account V3 backfill validation is complete for this phase:
  - pre-apply dry-run: `would_insert_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - apply result: `inserted_count = 96`, `skipped_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - post-apply dry-run: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - existing V1 `R-410A` row was not duplicated
  - sandbox Pricebook UI now shows `109` items
- existing-account backfill remains operator-controlled and dry-run-first
- controlled production existing-account Starter Kit V3 verification is complete for owner account `93dd810e-3c0c-4b69-9dae-edfa0e481dbb` on host `ornrnvxtwwtulohqwxop.supabase.co`:
  - production owner-account terminal dry-run state is verified: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
  - production owner-account Pricebook count is verified: `108`
  - existing V1 `R-410A` remains non-duplicated and is still treated as safe equivalent skip
- Pricebook V3 rollout/verification is closed for the current scope after this docs closeout.
- Pricebook/Admin Polish P3 is complete and production-promoted on `main`:
  - Search Pricebook
  - category filter from existing account rows
  - clear filters
  - filtered counts
  - empty filtered state guidance
- admin UI backfill controls remain future work
- batch backfill remains future work
- automatic backfill remains prohibited
- negative/default-credit behavior remains deferred

### Purpose
Pricebook is the reusable catalog of billable items.

It feeds:
- estimates
- invoices (draft internal invoice Pricebook picker flow is production-promoted)
- future reporting by item/category

Estimate/quoting expansion remains planned/deferred follow-on work after current Pricebook continuation and does not change the locked backfill boundaries above.

Shared Pricebook Entry UI Primitive V1 is complete for current internal estimate/invoice drafting continuity:
- estimate draft line entry and draft invoice line entry now follow the same Pricebook-style entry pattern for reusable selection and manual entry
- this is a UI/presentation consolidation only and does not change schema, provenance ownership, RLS/policy, invoice immutability, payment behavior, Visit Scope ownership, or production estimate gating
- targeted validation passed; current guardrails remain intact

### Pricebook item ownership
Pricebook owns reusable definitions, not transactional history.

### Required fields
- item_name
- item_type
- category
- default_description
- default_unit_price
- is_active

### v1 item types
- service
- material
- diagnostic
- adjustment

### Starter catalog rule
Pricebook launches with a starter/default set of common items.

Each company must be able to:
- add items
- expand categories
- deactivate items
- customize its own working catalog over time

Current D2C continuation clarifications:
- seeding is idempotent by `seed_key`
- dry-run previews starter seeding before apply
- existing accounts are not auto-backfilled in D2C-3/D2C-4
- V2C-1/V2C-2/V2C-3 existing-account Starter Kit V2 backfill operator tooling is production-promoted on `main` (commit `4ead046`):
  - V2C-1 dry-run planner helper (`planExistingAccountStarterKitBackfill`) is production-promoted
  - V2C-2 apply helper (`applyExistingAccountStarterKitBackfill`) is production-promoted; requires explicit `confirmApply: true`; collision-blocking is the default
  - V2C-3 CLI wrapper (`scripts/backfill-pricebook-starter-kit.ts`) is production-promoted; dry-run is the default mode; apply requires explicit `--apply`; `--allow-collisions` is required to override collision blocking
  - backfill default remains `v2`; explicit `--starter-kit-version v3` is supported where needed for controlled runs
  - backfill is single-account only, insert-only, and never mutates existing or customized rows
  - hosted targets require both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` before dry-run or apply
  - controlled production owner-account V3 backfill verification is complete for `93dd810e-3c0c-4b69-9dae-edfa0e481dbb` with terminal post-apply state (`would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`, account count `108`)
  - operator must always run dry-run first and review output before any apply
  - admin UI backfill controls remain future work
  - batch backfill remains future work
  - automatic backfill remains prohibited
  - negative/default-credit adjustment behavior remains deferred
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by V2C-1/V2C-2/V2C-3
- Pricebook/Admin Polish P1 is production-promoted on `main` (commit `aecb735`):
  - admin Pricebook visibility polish is complete for normal operator workflows
  - user-facing clarity now centers on Starter, Custom, Active, Inactive, and Deferred placeholder where applicable
  - V1/V2 terminology is intentionally hidden from normal admin page labels while internal `starter_version`/`seed_key` data remains available for tooling
  - no behavior expansion was introduced (no new backfill action, no new seed mutation behavior, no billing/payment behavior changes)
  - admin UI backfill controls remain future work
  - batch backfill remains future work
  - automatic backfill remains prohibited
  - negative/default-credit adjustment behavior remains deferred
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by Pricebook/Admin Polish P1
- Pricebook/Admin Polish P2 is production-promoted on `main` (commit `a97c764`):
  - catalog management usability improved: add item form now explains reusable catalog purpose and clarifies that changes affect future selections only (existing invoices unchanged)
  - edit fields disclosure now clearly labeled with improved form layout and spacing
  - price/unit display now grouped in single column for easier scanning of pricing information
  - activate/deactivate buttons now color-coded (red/green) with helper text clarifying operational intent:
    - deactivation prevents future selection and does not mutate historical invoice lines
    - activation enables item in future selections
  - empty state messaging clarified with actionable guidance when no items match filters
  - P1 clarity fully preserved: Starter, Custom, Active, Inactive, and Deferred placeholder status remain for normal operators
  - V1/V2 terminology remains hidden from normal admin-facing page and labels
  - no admin UI backfill button/control was added
  - admin UI backfill controls remain future work
  - batch backfill remains future work
  - automatic backfill remains prohibited
  - negative/default-credit adjustment behavior remains deferred
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by Pricebook/Admin Polish P2
- no business logic, seed definitions, or backfill behavior changed by Pricebook/Admin Polish P2
- D3B controlled-options refinement is production-promoted on `main` (merge `58dcb31`, change `3084906`):
  - code/test-only option refinement in `lib/business/pricebook-options.ts` and `lib/business/__tests__/pricebook-options.test.ts`
  - categories added: `Electrical`, `Compliance Docs`
  - unit labels added: `trip`, `doc`
  - Pricebook controlled unit label removed: `cfm` (CFM remains in ECC/airflow/testing contexts)
  - no schema migration, Supabase command, or DB write action was part of this promotion
- broader category/unit rollout remains future work
- no new starter seed rows were introduced by D2C-3/D2C-4
- Starter Kit V2 content was not implemented by D3B (it was implemented later by V2A/V2B)
- no negative credit/adjustment implementation was introduced
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by D2C-3/D2C-4
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by D3B
- no invoice/payment/Stripe/QBO/Visit Scope/service workflow behavior changed by V2A/V2B

### Production-complete C1B/C1C closeout (production-promoted)
- nullable invoice-line provenance/snapshot fields are production-migrated: `source_kind`, `source_pricebook_item_id`, `category_snapshot`, `unit_label_snapshot`
- server-side Pricebook-to-invoice-line frozen snapshot mapping exists for draft internal invoice adds
- draft internal invoice UI Add From Pricebook picker is production-promoted
- manual invoice line flow remains intact alongside Pricebook-backed adds
- issued/void invoice behavior remains immutable (no editable add controls)
- inactive Pricebook items are not selectable
- negative/default-credit items are blocked/deferred from picker selection
- no payment, Stripe, QBO, Visit Scope, or service workflow behavior changed by C1B/C1C
- production smoke is confirmed for C1B/C1C with no payment-execution language drift observed

### Historical integrity rule
Changing pricebook later must not mutate historical estimates or invoices.

Inactive items remain visible historically where already used, but cannot be newly selected.

---

## 8. Service V1 baseline

Service Contract V1 is already implemented and remains subordinate to the active spine.

Milestone-1 closeout status:
Service model buildout is now closed as prerequisite foundation.

The current baseline for Service is:
- `service_cases.case_kind` is structured case classification
- `jobs.service_visit_type`, `jobs.service_visit_reason`, and `jobs.service_visit_outcome` are the current visit-level Service fields
- follow-up continuity is carried through shared `service_case_id`
- parent/child lineage must remain inside one service case

Closed milestone-1 baseline also includes:
- relationship-aware internal intake V1
- Visit Scope as the job-owned operational scope layer
- ECC optional vs Service required Visit Scope behavior
- ECC companion-scope promotion into real Service jobs
- promoted-companion read-only visibility on internal scan surfaces
- Service intake title ownership clarified:
  - Service visit creation now treats **Job Title** as the explicit short human-facing headline for the visit.
  - Visit Scope remains the operational work-definition layer under the job/visit model.
  - If Job Title is blank and exactly one work item exists, the first work item may provide the derived title fallback to reduce duplicate entry.
  - `service_visit_reason` should align to the title layer rather than a separate fuzzy summary layer.
  - This preserves the locked business-layer distinction:
    - Job / visit title = visit headline
    - Visit Scope = operational work performed on the visit
    - invoice line items = downstream billed/commercial truth
- Practical intake rule:
  - Service intake should not force duplicate typing when one work item already clearly expresses the visit.
  - Preferred behavior is:
    - user-entered Job Title when provided
    - first-work-item-derived fallback when title is blank and one work item exists
    - Visit Scope work items remain the detailed execution layer either way
- milestone-1 write-path reliability cleanup for the live `jobs.updated_at` mismatch

### ECC rule
ECC / Title 24 intake may remain defaulted/standardized as its own structured workflow family.

### Locked rule
This roadmap does not reopen Service Contract V1 design.

Future business-layer planning in this document must build on the existing Service baseline for commercial workflows, reporting, and consistency.

Billing / invoice workflow is now complete enough to move forward for the current milestone-2 scope.

That achieved milestone-2 baseline includes:
- job-linked internal invoice workflow
- reviewable draft invoice behavior
- issue/send invoice behavior
- resend as a communication action on the same invoice record
- operator-facing invoice communication tracking/history

Bare-bones invoice email content/presentation is acceptable for this milestone boundary; email formatting/content polish remains deferred refinement work.

Reporting / analytics is no longer the active incomplete milestone.

Payment P1 foundation is closed at the current baseline.
Out-of-box readiness / business identity / settings packaging is also closed at the current baseline.
The next natural roadmap area is smaller service-model revisions / service workflow refinement.
Estimates/quoting V1A-V1J is now implemented to the current guarded internal baseline.
Estimates is internal-only production-live: V1A and V1H migrations are applied in production, `ENABLE_ESTIMATES=true` is enabled in Vercel Production only, and `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
The earlier enabled-mode render error is now a watch item only for planning purposes: clean captured smoke did not reproduce the `TypeError: Cannot read properties of undefined (reading 'call')`, and `/estimates` plus multiple `/estimates/[id]` routes returned `200` without a real stack trace.
Estimates internal-only production enablement execution is complete and documented in the runbook closeout.
V1E internal-only status transitions are complete (`draft -> sent`, `sent -> approved|declined|expired|cancelled`, and `draft -> cancelled`).
V1E transition events write `previous_status` and `next_status`; status timestamps are set on transition.
V1E keeps line editing draft-only and hides line-edit controls after `sent`.
V1F internal-only hardening/operator polish is complete: confirmation UX is clearer, terminal actions use stronger confirmation copy, status wording is more explicit, activity feed readability is improved, operator-facing non-goals are stated directly in the UI, and the disabled-environment notice is clearer on `/ops`.
V1G internal-only presentation and print-readiness polish is complete on estimate detail: scan hierarchy/readability is improved for estimate number, status, customer/location context, totals, and line-item presentation; print-friendly browser layout is added for internal document review; explicit commercial boundary wording is reinforced; and read-only placeholders for future send/communication history are present without live behavior.
V1H internal-only estimate communication/send-attempt foundation is complete: migration `20260502120000_estimate_communications_v1h.sql` is applied to sandbox only, fail-closed `ENABLE_ESTIMATE_EMAIL_SEND` is implemented, blocked attempts are recorded when send is disabled, draft/sent detail supports send-attempt UI, communication history reads from `estimate_communications`, activity readability includes `estimate_send_attempted`, and terminal estimate statuses do not expose send action.
V1I decision artifact is complete as planning-only (no implementation changes): Option B first (generated document/PDF strategy planning before real provider send), Option A later (sandbox-only real provider enablement after document/wording gates are satisfied).
V1I future email-enable go/no-go gates are documented: approved document wording, approved branding/header/footer, recipient confirmation UX reviewed, communication history wording approved, sandbox-only send smoke plan written, and fail-closed rollback behavior validated.
V1I future PDF generation/storage go/no-go gates are documented: canonical content model, freeze/version semantics, generation trigger, internal access boundaries, retention/storage policy, and no portal/public exposure.
V1J internal document-template/readiness implementation is complete (commit `ad5d735`): canonical estimate document view model/helper, centralized disclaimer package, revision semantics planning constants (future freeze at send-attempt creation, immutable historical revisions, post-freeze edits require new revision), estimate detail readiness section wired to shared document helper, and print/readiness wording consistency from the shared model.
Estimate Detail Wording + Internal Scaffolding Collapse closeout is complete on the guarded internal baseline: readiness/disclaimer content now sits under collapsed-by-default `Internal Readiness Notes`, `Mark Sent` is now `Mark Sent Manually` with explicit lifecycle-only helper copy, `Send Estimate` remains communication-attempt wording only with explicit lifecycle-nontransition helper copy, and page hierarchy is cleaner while preserving internal boundaries.
Estimate Pricebook Editable Defaults V1 closeout is complete on the guarded internal baseline: draft estimate Add from Pricebook now prefills editable defaults (item name, description, item type, category, unit label, quantity, unit price), users can edit before add, added estimate line snapshots reflect edited submitted values, and `source_pricebook_item_id` provenance remains preserved.
Estimate New Customer Assist V1 closeout is complete on the guarded internal baseline: `/estimates/new` keeps the existing smart customer picker unchanged for existing customers and now adds inline `+ Add Customer` for internal-only customer/location creation inside the estimate flow.
Estimate New Customer Assist V1 preserves canonical ownership and estimate linkage: customer rows remain canonical in `customers`, location rows remain canonical in `locations`, estimate draft creation still links only by `customer_id` and `location_id`, and no estimate is created until the user clicks `Create Draft Estimate`.
Estimate New Customer Assist V1 preserves locked boundaries: the full job intake path was not reused, no job/service_case/job_event is created by the assist, and no schema/migration/RLS/feature-flag/email/PDF/public-link/customer-approval/conversion/payment/QBO/Product-Mode/Support behavior changed.
V1J does not add persistent revision storage.
V1J did not add real outbound production estimate email, PDF generation/storage, persistent revision storage, customer approval/e-signature, customer portal estimate visibility, public estimate links/tokens, contractor visibility/authority, estimate-to-job conversion, estimate-to-invoice conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, or production estimate enablement.
V1J validation status: `npx vitest run lib/estimates` passed (`123/123`), `npx tsc --noEmit` passed (`TSC_OK`), sent/approved detail smoke passed, and draft-detail smoke is now completed/closed using sandbox draft `EST-20260502-9D58499B` (`/estimates/43aeaa8e-e60e-47d4-8c26-2570600b24df`) with document readiness/disclaimer rendering, draft manual-line editing, draft pricebook picker availability, blocked send copy, communication history rendering, and no email/PDF/customer approval/public link/conversion/payment/customer portal/contractor controls exposed.
Estimate detail wording/internal scaffolding collapse validation: `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `131` tests); authenticated smoke confirmed collapsed readiness notes default state, preserved blocked send-attempt communication truth without lifecycle transition, and preserved `Draft -> Sent` lifecycle transition via `Mark Sent Manually`.
Estimate Pricebook Editable Defaults V1 validation: `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `131` tests); authenticated sandbox smoke confirmed editable field prefill on Pricebook selection, edited item name/description/quantity/unit price persisted on add, manual add/remove still worked in draft, sent estimate remained locked, and no invoice/payment/conversion/approval/PDF/live-email behavior changed.
Estimate New Customer Assist V1 validation: authenticated local smoke passed; `+ Add Customer` opens, `Cancel` closes, saving a new customer/location selects both customer and location automatically, draft creation redirects to estimate detail, estimate detail shows expected customer/location, `npx.cmd tsc --noEmit` passed, targeted Vitest passed (`54/54`) in `lib/estimates/__tests__/estimate-actions.test.ts`, browser smoke found and fixed the location auto-select issue in commit `56a5fcc`, and smoke-created estimate/customer/location were sandbox-only test data.
Work Item-first Invoice Builder Clarity V1 is complete on the guarded internal baseline (commit `5dc89c2`): draft invoice panel now explicitly presents Work Item import as recommended when Work Items are available, helper copy now clarifies imported Work Items become draft Invoice Charges for review/edit before issue, boundary copy now explicitly separates operational Work Items from billed Invoice Charges, and Pricebook add remains visible as secondary/fallback.
Work Item-first Invoice Builder Clarity V1 is copy/UX-only and does not change behavior: Work Item import action/payload are unchanged (`quantity = 1.00`, `unit_price = 0.00`, `source_kind = visit_scope`, `source_visit_scope_item_id` preserved), manual line behavior is unchanged, and no schema/migration/Supabase/production-data/RLS/policy/auth/feature-flag/issue-send-payment/Visit-Scope/Pricebook/estimate/Stripe-tenant-payment/QBO behavior changed.
Work Item-first Invoice Builder Clarity V1 validation: `npx.cmd tsc --noEmit` passed; targeted tests passed (`2` files / `24` tests); browser smoke confirmed create draft invoice, add selected Work Items, imported visibility + `Already added`, Pricebook add, manual add/edit/remove, save charge, and remove charge all worked with no persistent feature breakage observed.
Production readiness hardening guard is complete and committed: `createEstimateDraft` in `lib/estimates/estimate-actions.ts` now returns `{ success: false, error: "Estimates are currently unavailable." }` as the first statement when `ENABLE_ESTIMATES` is false or unset, running before `createClient`/auth/DB work. This was the sole identified pre-production code blocker from the readiness audit. Validated: `npx vitest run lib/estimates` = `131/131`, `npx tsc --noEmit` = `TSC_OK`. No migrations, Supabase commands, production data, email sends, feature flag enables, RLS/policy changes, or PDF/storage/customer/public/payment/conversion behavior were introduced.
- Estimates Guard Parity + Send Wording Polish closeout is complete on the guarded internal baseline (commit `edf5022`): `addEstimateLineItem` and `removeEstimateLineItem` now fail-close when `ENABLE_ESTIMATES` is false/unset, mutator tests assert unavailable response and no `requireInternalUser` call when gated off, and send wording is now `Record Send Attempt` for operator safety without changing estimate lifecycle behavior.
- Shared Pricebook Entry UI Primitive V1 closeout should be treated as a supporting baseline for the estimate track, not as a production-enablement milestone.
- Future estimate/customer-facing roadmap notes after this closeout:
  - the contractor report current-scope closeout is the current quality benchmark for future estimate presentation polish and customer-facing document tone
  - completed in current baseline: workflow wording now makes `Send Estimate` and `Mark Sent Manually` clearly distinct actions so communication attempts do not read as lifecycle transitions
  - completed in current baseline: draft estimate Pricebook add now behaves as editable defaults before add while preserving provenance
  - Customer Estimate Profile Entry V1 is now complete on the guarded internal baseline (commits `bcfa9f7`, `b977c89`): `/customers/[id]` now shows an internal-only Estimates section when `ENABLE_ESTIMATES=true`; customer profile header includes `Create Estimate` for internal users when enabled; `Create Estimate` routes to `/estimates/new?customer_id=<id>`; `/estimates/new` validates the UUID and preselects the customer; customer estimates appear in the customer profile history/list; `/estimates/[id]` includes `Back to Customer` when `estimate.customer_id` is set; section CTA behavior was cleaned up (no duplicate always-visible CTA; empty state keeps `Create First Estimate`); contractors do not see estimate controls; existing feature gates remain intact; production estimates remain disabled unless explicitly enabled under runbook gates.
  - Customer Estimate Profile Entry V1 is guarded internal baseline only: no real outbound email, PDF generation/storage, customer approval/decline/request-change, public/customer portal links, contractor visibility, estimate-to-job conversion, estimate-to-invoice conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, schema changes, migrations, RLS changes, or production data actions were introduced.
  - Customer Estimate Profile Entry V1 validation: `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `131` tests); user browser smoke passed.
  - Job-context Estimate Entry Wiring V1 is now complete on the guarded internal baseline (commit `92df487`): job detail workspace (`/jobs/[id]`) now shows an internal-only `Create Estimate` CTA when `ENABLE_ESTIMATES=true` and `customer_id`, `location_id`, and `job.id` are all present; CTA URL carries `customer_id`, `location_id`, `origin_job_id`, and `service_case_id` (when available); `/estimates/new` now parses and UUID-validates all four prefill params via `resolveEstimateNewPrefillQuery`; `resolveEstimateNewInitialSelection` safely derives initial customer/location selection and rejects mismatched or invalid params; `NewEstimateForm` initializes location selection from `initialLocationId` and passes `origin_job_id` and `service_case_id` through `buildEstimateDraftCreatePayload` into `createEstimateDraft`; new pure helper module `lib/estimates/estimate-new-entry.ts` holds all UUID validation, query parsing, selection resolution, and payload-building logic with no Next.js/Supabase imports; two new test files cover prefill query parsing and payload building.
  - Job-context Estimate Entry Wiring V1 is guarded internal baseline only: no real outbound email, PDF generation/storage, customer approval/decline/request-change, public/customer portal links, contractor visibility, estimate-to-job conversion, estimate-to-invoice conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, schema changes, migrations, RLS changes, or production data actions were introduced.
  - Job-context Estimate Entry Wiring V1 validation: `npx tsc --noEmit` passed; `npx vitest run lib/estimates` passed (`9` files / `143` tests); browser smokes passed: job detail CTA includes all context params, `/estimates/new` preselects customer and location, draft creation succeeds, customer profile estimate flow remains intact, disabled-path guard covered by `estimate-route-actions-guard.test.ts`.
  - Watch item: `EST-20260511-DBC7949F` is sandbox smoke data created during Group 6B validation.
  - Group 6 status: **Monitoring / controlled-user ready for internal Estimates.** Internal operators can now initiate estimate drafts from job context, customer profile context, or the estimates list directly.
  - future customer-centered estimate entry and history should surface from customer profile/history, reporting, and standard nav only when the estimate track is intentionally promoted beyond the guarded internal baseline
  - future estimate entry should support customer email/location prefill with explicit editability
  - future response flow may include explicit customer approve/decline/request-change outcomes only after dedicated design/gates
  - future reporting/conversion work may include estimate reporting, explicit estimate-to-job/service-visit handoff, explicit later estimate-to-invoice-charge handoff, and multi-option/good-better-best quoting, but those remain deferred
  - future top-ribbon/nav estimate access should align to normal workflow once intentionally enabled beyond guarded internal use
  - future pricebook-backed estimate/invoice drafting should keep prefilling editable draft fields rather than locking transactional line detail
  - future Work Item-first billing flow remains separate audit/planning work: structured Work Items as primary operational truth, free-text notes as narrative context, and eventual Invoice Charge building from existing Work Items with review/editing rather than re-entry
  - future slices may explore Pricebook -> Work Item assisted creation, smarter defaults, and broader invoice panel polish; those are not implemented by this clarity slice
  - future payment/deposit work remains a separate deferred track and must not be implied by estimate polish or document readiness work
Stripe customer/work payment execution follows service/invoice/estimate readiness unless explicitly pulled forward.

Separate pre-launch enablement track:
- Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed in production for the platform account subscription slice.
- Live confirmation includes deployed env, live webhook handling, successful non-owner checkout completion, entitlement sync, and Manage billing availability.
- This does not move tenant customer invoice payment execution into current scope.
- Platform subscription billing must remain separate from future tenant customer/work payment execution.

Roadmap guardrail:
- Payment P1 foundation is complete and closed.
- Payment execution remains deferred.
- Stripe platform subscription billing for platform account onboarding is implemented and live-smoke confirmed.
- Tenant customer invoice payment execution remains a deferred track unless explicitly pulled forward.
- This does not imply live Stripe/payment execution start unless explicitly planned.
- This does not imply QBO dependency.

Completed RLS / permission hardening slices for the current stabilized baseline:
- Operational entitlement mutation guard rollout is complete through Slice 16C and is production-promoted on `main` at commit `bf38eca`. Full validation passed: 89 test files, 1057 tests, TSC_OK. Production smoke confirmed. Two additional test-only mock repairs (`job-ops-waiting-state.test.ts`, `service-case-reconciliation-wiring.test.ts`) were committed during main validation with no product behavior change.
- Completed guarded operational mutation families include:
  - internal job creation / intake
  - job ops / scheduling / contact
  - closeout / completion
  - internal invoices / invoice lines / manual payment tracking
  - notes
  - calendar block events
  - contractor report preview / send
  - attachments
  - equipment / systems
  - ECC test-run / test-data mutations
  - staffing / assignment / contractor relink
  - remaining job-detail operational mutations
  - contractor intake adjudication
  - customer / profile mutations
  - contractor directory / admin mutations
  - Pricebook mutations
- Locked entitlement result for those mutation families:
  - active entitlement, valid trial, and internal/comped accounts are allowed
  - expired trial, null-ended trial, and missing entitlement are blocked server-side before writes and side effects
- Intentional non-operational/exempt paths remain accessible:
  - company profile
  - team setup
  - internal user/admin invite and password recovery
  - billing/setup recovery
  - notification read-state
- External contractor onboarding / invite acceptance remains outside internal operational entitlement gating.
- `createJob` remains a low-level helper only; active callers are guarded and new active callers must not be added without entitlement gating.
- `lib/actions/intake-actions.ts` remains dormant legacy and is a later cleanup/retirement candidate, not active rollout work.
- No Stripe tenant customer payment execution, no QBO behavior, and no schema migration or Supabase data change were introduced by this rollout.
- Remaining work language in the entitlement area should now be read narrowly as: final validation, source-of-truth closeout, branch-promotion decision, and later dormant-legacy cleanup, not open operational mutation gating.
- customer/location internal account-owner reconciliation is complete
- jobs and service_cases were already ahead on account-owner-aware internal read scope; customers and locations have now been reconciled to that same internal account-owner model for internal same-account teammates
- validated passed for customer list, customer detail, internal `/jobs/new` guided lookup, and location detail for non-owner internal teammates
- customer/location visibility no longer depends primarily on admin/manual scope reconstruction for those internal reads
- targeted internal same-account job/service-case mutation boundary hardening is also complete
- the hardened internal operational mutation paths now explicitly assert same-account scope before proceeding instead of relying on `user is internal` alone
- cross-account internal mutation is denied on the targeted hardened paths
- the completed targeted mutation-boundary slice covers visit scope mutation and service contract / linked service-case mutation
- internal same-account job-detail operational mutation boundary hardening is also complete
- targeted internal `/jobs/[id]` ops-lane mutations no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted ops-lane mutations proceed
- cross-account internal mutation is denied on the targeted ops-lane hardened paths
- the completed targeted ops-lane mutation-boundary slice covers resolve failure by correction review, mark certs complete, mark invoice complete, update job ops details, update job ops state, mark field complete, and customer contact attempt logging
- this was a targeted internal job-detail operational mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
- internal same-account pending-info release / re-evaluate mutation boundary hardening is also complete
- targeted internal `/jobs/[id]` release / re-evaluate form entrypoints no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted release/re-evaluate mutations proceed
- cross-account internal mutation is denied on the targeted release/re-evaluate hardened paths
- the completed targeted release/re-evaluate mutation-boundary slice covers `releasePendingInfoAndRecomputeFromForm` and `releaseAndReevaluateFromForm`
- this was a targeted release/re-evaluate ops-lane mutation-boundary slice, not a full jobs/job_events permission-model rewrite
- internal same-account service closeout mutation boundary hardening is also complete
- targeted internal `/jobs/[id]` service closeout actions no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted service closeout mutations proceed
- cross-account internal mutation is denied on the targeted service closeout hardened paths
- the completed targeted service closeout mutation-boundary slice covers `markServiceComplete` and `markInvoiceSent`
- denied targeted service closeout paths do not write `jobs`, `service_cases`, or `job_events`
- contractor authority was not expanded in this targeted service closeout slice
- this was a targeted service closeout mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
- internal same-account contractor report preview/send boundary hardening is also complete
- targeted internal contractor report preview/send paths no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before the targeted contractor report actions proceed
- cross-account internal access is denied on the targeted contractor report paths
- the completed targeted contractor-report boundary slice covers `generateContractorReportPreview` and `sendContractorReport`
- denied targeted contractor-report paths do not write `jobs` or `job_events`
- denied targeted contractor-report paths do not enqueue or send contractor-report notifications/emails
- contractor authority was not expanded in this targeted contractor-report slice
- this was a targeted contractor-report boundary hardening slice, not a full jobs/job_events permission-model rewrite
- internal job attachments / attachment-storage account-scope hardening is also complete
- the hardened internal attachment flows now explicitly assert same-account scope before proceeding instead of relying on broad internal access alone
- cross-account internal attachment/storage access is denied on the targeted hardened paths
- the completed targeted attachment/account-scope slice covers upload-token issuance, finalize upload, discard upload, and share-to-contractor
- matching attachment/storage policy reconciliation was completed for this seam
- this was a targeted internal attachment/account-scope slice, not a full attachment subsystem rewrite
- internal job attachments read/download account-scope boundary hardening is also complete
- the internal attachments read/download page no longer relies on internal auth plus implicit row filtering alone
- one explicit same-account internal scoped-job preflight is now asserted before any attachment row read proceeds on the targeted page
- one explicit same-account internal scoped-job preflight is now asserted before signed URL generation proceeds on the targeted page
- cross-account internal access is denied before attachment row read on the targeted read/download path
- cross-account internal access is denied before signed URL generation on the targeted read/download path
- non-internal access is denied before attachment row read and before signed URL generation on the targeted read/download path
- the completed targeted internal attachment read/download boundary slice covers the `app/jobs/[id]/attachments/page.tsx` route
- contractor redirect behavior to portal remains intact
- this was a targeted internal attachment read/download route-boundary slice, not a full attachment subsystem rewrite and not the end of broader RLS hardening
- internal ECC test-run account-scope hardening is also complete
- the hardened targeted ECC mutation paths now explicitly assert same-account scope before proceeding instead of relying on broad internal access alone
- cross-account internal ECC mutation is denied on the targeted hardened paths
- the completed targeted ECC truth/account-scope slice covers override update, add test run, delete test run, and a representative ECC test-save path
- matching `ecc_test_runs` policy reconciliation was completed for this seam
- this was a targeted ECC truth/account-scope slice, not a full ECC subsystem rewrite or full ECC permission-model completion
- internal job_equipment / job_systems account-scope hardening is also complete
- the hardened targeted equipment/system mutation paths now explicitly assert same-account scope before proceeding instead of relying on broad internal access alone
- cross-account internal equipment/system mutation is denied on the targeted hardened paths
- the completed targeted equipment/system account-scope slice covers add equipment, update equipment, delete equipment, and coupled system creation, reuse, and orphan delete behavior inside those flows
- matching `job_equipment` / `job_systems` policy reconciliation was completed for this seam
- this was a targeted equipment/system account-scope slice, not a full equipment/system domain rewrite or full equipment/system permission-model completion
- internal same-account lifecycle/scheduling mutation boundary hardening is also complete
- targeted lifecycle/scheduling actions no longer rely on internal-user membership alone for the hardened paths
- same-account scope is now explicitly asserted before targeted lifecycle/scheduling mutations proceed
- cross-account internal mutation is denied on the targeted lifecycle/scheduling hardened paths
- the completed targeted lifecycle/scheduling mutation-boundary slice covers `advanceJobStatusFromForm`, `revertOnTheWayFromForm`, and `updateJobScheduleFromForm`
- denied targeted lifecycle/scheduling paths do not write `jobs` or `job_events`
- denied targeted schedule paths do not enqueue or send customer/contractor scheduling emails
- contractor authority was not expanded in this targeted lifecycle/scheduling slice
- this was a targeted lifecycle/scheduling mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- contractor CRUD mutation boundary hardening is also complete
- targeted contractor mutation paths no longer rely on incomplete or inconsistent app-layer owner checks for the hardened paths
- same-account internal scope is now explicitly asserted before targeted contractor mutations proceed
- cross-account internal mutation is denied on the targeted contractor mutation paths
- the completed targeted contractor CRUD mutation-boundary slice covers `updateContractorFromForm` and legacy `createContractorFromForm`
- denied targeted contractor CRUD paths do not write contractor records
- contractor authority was not expanded in this targeted contractor CRUD slice
- this was a targeted contractor CRUD mutation-boundary slice, not a full contractor subsystem rewrite and not the end of broader RLS hardening
- staffing / job assignment mutation boundary hardening is also complete
- targeted staffing mutation paths no longer rely on internal-user membership plus plain job existence checks alone for the hardened paths
- same-account internal scope is now explicitly asserted before targeted staffing mutations proceed
- cross-account internal mutation is denied on the targeted staffing mutation paths
- the completed targeted staffing / job assignment mutation-boundary slice covers `assignJobAssigneeFromForm`, `setPrimaryJobAssigneeFromForm`, and `removeJobAssigneeFromForm`
- denied targeted staffing paths do not write `job_assignments`
- denied targeted staffing paths do not write staffing-related `job_events`
- assignable-user validation now runs inside actor account scope for the hardened staffing paths
- matching `job_assignments` account-scope reconciliation was completed for this seam
- contractor authority was not expanded in this targeted staffing slice
- this was a targeted staffing / job assignment mutation-boundary slice, not a full staffing subsystem rewrite and not the end of broader RLS hardening
- job contractor relink mutation boundary hardening is also complete
- the targeted contractor relink path no longer relies on internal-user membership plus plain job read/update flow alone for the hardened path
- same-account scope is now explicitly asserted before the targeted contractor relink mutation proceeds
- cross-account internal mutation is denied on the targeted contractor relink path
- the completed targeted job contractor relink mutation-boundary slice covers `updateJobContractorFromForm`
- denied targeted contractor relink paths do not write `jobs`
- denied targeted contractor relink paths do not write `job_events`
- forged cross-account `contractor_id` targets are denied before write on the hardened path
- contractor authority was not expanded in this targeted contractor relink slice
- this was a targeted job contractor relink mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- customer standalone mutation boundary hardening is also complete
- targeted customer standalone mutation paths no longer rely on internal-membership checks plus direct row mutation alone for the hardened paths
- same-account customer scope is now explicitly asserted before the targeted customer standalone mutations proceed
- cross-account internal mutation is denied on the targeted customer standalone paths
- the completed targeted customer standalone mutation-boundary slice covers `archiveCustomerFromForm` and `updateCustomerNotesFromForm`
- denied targeted customer standalone paths do not write `customers`
- contractor authority was not expanded in this targeted customer standalone slice
- this was a targeted customer standalone mutation-boundary slice, not a full customer subsystem rewrite and not the end of broader RLS hardening
- legacy job-detail entrypoint mutation boundary hardening is also complete
- targeted legacy job-detail mutation entrypoints no longer rely on missing or incomplete server-side actor/scope enforcement on the hardened paths
- same-account scope is now explicitly asserted before the targeted legacy job-detail mutations proceed
- cross-account internal access is denied before write on the targeted legacy job-detail paths
- non-internal access is denied before write on the targeted legacy job-detail paths
- denied targeted legacy job-detail paths do not write `jobs` or `job_events`
- the generic low-level `updateJob` helper was safely reduced to internal-only/non-exported usage
- this was a targeted legacy job-detail mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- internal invoice mutation boundary hardening is also complete
- targeted internal invoice mutation entrypoints no longer rely on internal-user membership plus implicit RLS outcome alone for the hardened paths
- explicit internal same-account scoped-job preflight is now asserted before targeted internal invoice mutation/side-effect flows proceed
- cross-account internal access is denied before write on the targeted internal invoice paths
- non-internal access is denied before write on the targeted internal invoice paths
- the completed targeted internal invoice mutation-boundary slice covers `createInternalInvoiceDraftFromForm`, `saveInternalInvoiceDraftFromForm`, `issueInternalInvoiceFromForm`, `voidInternalInvoiceFromForm`, `addInternalInvoiceLineItemFromForm`, `updateInternalInvoiceLineItemFromForm`, `removeInternalInvoiceLineItemFromForm`, and `sendInternalInvoiceEmailFromForm`
- denied targeted internal invoice paths do not write `internal_invoices`, `internal_invoice_line_items`, `jobs`, `job_events`, or `notifications`
- denied targeted internal invoice paths do not send invoice email side effects
- this was a targeted internal invoice mutation-boundary slice, not billing feature expansion, not payment execution work, and not the end of broader RLS hardening
- internal notification read-state mutation boundary hardening is also complete
- targeted internal notification read-state entrypoints no longer rely on internal membership plus `recipient_type` filtering alone for the hardened paths
- explicit same-account internal notification scope is now asserted before targeted notification read-state flows proceed
- cross-account internal access is denied/excluded on the targeted notification read-state paths
- non-internal access is denied before targeted notification read-state flows proceed
- the completed targeted internal notification read-state mutation-boundary slice covers `listInternalNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`, and `getInternalUnreadNotificationCount`
- denied targeted notification read-state mark paths do not write `notifications`
- this was a targeted internal notification read-state mutation-boundary slice, not notification UX redesign, not messaging feature expansion, and not the end of broader RLS hardening
- internal user/admin identity mutation boundary hardening is also complete
- targeted internal identity/admin entrypoints no longer rely on internal-membership checks plus downstream mutation/side-effect behavior alone for the hardened paths
- explicit same-account target preflight is now asserted before targeted internal identity/admin mutation or identity side-effect flows proceed
- cross-account internal access is denied before targeted internal identity/admin writes and identity side effects
- non-internal access is denied before targeted internal identity/admin mutation and invite/reset flows proceed
- the completed targeted internal identity/admin mutation-boundary slice covers `createInternalUserFromForm`, `updateInternalUserRoleFromForm`, `activateInternalUserFromForm`, `deactivateInternalUserFromForm`, `inviteInternalUserFromForm`, `deleteInternalUserFromForm`, `updateInternalUserProfileFromForm`, `resendInternalInviteFromForm`, `sendPasswordResetFromForm`, `resendContractorInviteFromForm`, and `inviteContractorUserFromForm`
- denied targeted internal identity/admin paths do not write `internal_users`
- denied targeted internal identity/admin paths do not trigger `inviteUserByEmail`, `resetPasswordForEmail`, or `inviteContractor` side effects
- this was a targeted internal identity/admin mutation-boundary slice, not role redesign, not support-access modeling, and not the end of broader RLS hardening
- dispatch calendar account-scope read boundary hardening is also complete
- the hardened central dispatch calendar dataset path no longer relies on broad downstream reads alone
- explicit same-account scope is now asserted before dispatch calendar dataset assembly proceeds
- cross-account jobs are excluded from the returned dispatch calendar dataset
- cross-account internal `job_events` are excluded from downstream dispatch event expansion
- cross-account assignment expansion is excluded from downstream dispatch staffing expansion
- non-internal access is denied before dispatch calendar dataset assembly proceeds
- this was a targeted dispatch calendar read-boundary slice in `calendar-actions.ts`, not a calendar UI redesign, not a calendar block mutation pass, and not the end of broader RLS hardening
- dispatch calendar block mutation boundary hardening is also complete
- targeted calendar block mutation entrypoints no longer rely on incomplete or inconsistent mutation-path checks
- one explicit same-account internal mutation boundary is now asserted before targeted calendar block writes proceed
- cross-account internal access is denied before write on the targeted calendar block paths
- non-internal access is denied before write on the targeted calendar block paths
- the hardened targeted calendar block mutation-boundary slice covers `createCalendarBlockEventFromForm`, `updateCalendarBlockEventFromForm`, and `deleteCalendarBlockEventFromForm`
- denied targeted calendar block mutation paths do not write `calendar_events`
- this was a targeted calendar block mutation-boundary slice, not a calendar UI redesign, not a dispatch dataset rewrite, and not the end of broader RLS hardening
- admin job terminal mutation boundary hardening is also complete
- targeted admin terminal job mutation entrypoints no longer rely on admin gating plus direct row mutation alone
- one explicit admin + same-account scoped-job preflight is now asserted before the targeted terminal job write phases proceed
- cross-account admin access is denied before write on the targeted terminal job paths
- non-admin internal access is denied before write on the targeted terminal job paths
- non-internal access is denied before write on the targeted terminal job paths
- the hardened targeted admin terminal job mutation-boundary slice covers `archiveJobFromForm` and `cancelJobFromForm`
- denied targeted archive paths do not write `jobs`
- denied targeted cancel paths do not write `jobs` or `job_events`
- this was a targeted admin terminal job mutation-boundary slice, not a general jobs/job_events permission-model rewrite, and not the end of broader RLS hardening
- contractor portal intake proposal visibility and collaboration boundary hardening is also complete
- live contractor-facing proposal list/detail/comment paths no longer rely on page-local contractor filtering plus elevated admin reads/writes alone for the hardened paths
- one explicit contractor-scoped proposal access boundary is now asserted before targeted elevated proposal visibility/collaboration flows proceed
- cross-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- non-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- denied targeted proposal paths do not proceed into elevated proposal row reads
- denied targeted proposal paths do not proceed into elevated proposal comment reads/writes
- denied targeted proposal paths do not proceed into elevated proposal attachment reads
- the hardened contractor portal proposal paths cover proposal list visibility, proposal detail visibility, and the contractor proposal addendum/comment collaboration path
- this was a targeted contractor portal proposal visibility/collaboration boundary slice, not a contractor portal UX redesign, not a contractor intake adjudication redesign, and not the end of broader RLS hardening
- customer profile upsert mutation boundary hardening is also complete
- `upsertCustomerProfileFromForm` no longer relies on internal-only access plus downstream update flow alone for the hardened path
- one explicit same-account customer mutation preflight is now asserted before canonical customer write or downstream job snapshot sync proceeds on the targeted upsert path
- cross-account internal access is denied before write on the targeted upsert path
- non-internal access is denied before write on the targeted upsert path
- denied targeted upsert paths do not write `customers`
- denied targeted upsert paths do not write downstream `jobs` snapshot fields
- this was a targeted customer profile upsert mutation-boundary slice, not a broader customer subsystem rewrite, not a snapshot-model rewrite, and not the end of broader RLS hardening
- contractor admin edge mutation boundary hardening is also complete
- the remaining live contractor admin edge mutation entrypoints no longer rely on partial or incomplete admin/owner checks alone for the hardened paths
- one explicit same-account contractor mutation preflight is now asserted before targeted contractor admin edge writes proceed
- cross-account internal/admin access is denied before write on the targeted edge paths
- non-internal access is denied before write on the targeted edge paths
- denied targeted edge paths do not write contractor records
- the hardened contractor admin edge entrypoints cover `updateContractorNameAndEmailFromForm` and `createQuickContractorFromForm`
- this was a targeted contractor admin edge mutation-boundary slice, not a contractor subsystem rewrite, not a contractor invite redesign, and not the end of broader RLS hardening
- contractor invite acceptance membership boundary hardening is also complete
- the live contractor invite acceptance membership path no longer relies on elevated invite/membership reads-writes plus fallback-by-email behavior alone for the hardened path
- one explicit scoped acceptance preflight is now asserted before contractor membership creation or invite-acceptance mutation proceeds on the targeted acceptance path
- preferred acceptance resolution is auth-user-first where available
- legacy fallback-by-email is now constrained to deterministic single-scope acceptance only
- ambiguous invite scope is denied before write on the hardened acceptance path
- invalid or unsafe cross-scope acceptance is denied before write on the hardened acceptance path
- denied targeted acceptance paths do not write `contractor_users`
- denied targeted acceptance paths do not write `contractor_invites`
- the hardened targeted acceptance path covers `ensureContractorMembershipFromInvite` and the live set-password acceptance handoff behavior that uses that path
- this was a targeted contractor invite acceptance membership-boundary slice, not a broader auth redesign, not a contractor invite issuance/resend redesign, and not the end of broader RLS hardening
- internal business profile mutation boundary hardening is also complete
- the live internal business profile save path no longer relies on elevated profile/storage mutation flow alone for the hardened path
- one explicit scoped business-profile mutation preflight is now asserted before profile upsert or storage mutation proceeds on the targeted path
- cross-account or invalid-scope access is denied before write on the targeted path
- non-admin/non-internal access is denied before write on the targeted path
- denied targeted business-profile paths do not write `internal_business_profiles`
- denied targeted business-profile paths do not perform storage upload/remove mutations
- the hardened targeted business-profile path covers `saveInternalBusinessProfileFromForm` and the live admin company-profile form path that uses it
- this was a targeted internal business profile mutation-boundary slice, not a broader business-identity redesign, not tenant-settings expansion, and not the end of broader RLS hardening
- internal intake create mutation boundary hardening is also complete
- `createJobFromForm` no longer relies on broad downstream create flow alone for internal intake creation on the hardened path
- one explicit owner-scoped internal intake create preflight is now asserted before canonical create/link mutation or downstream side effect proceeds on the targeted intake-create path
- cross-account or invalid-scope internal access is denied before write on the targeted intake-create path
- non-internal access is denied before write on the targeted intake-create path
- contractor-authorized intake behavior was preserved without authority expansion
- denied targeted intake-create paths do not write `customers`, `locations`, `jobs`, or `job_events`
- denied targeted intake-create paths do not trigger downstream notifications/emails tied to the blocked create flow
- this was a targeted internal intake create mutation-boundary slice, not a `/jobs/new` redesign, not a contractor intake redesign, and not the end of broader RLS hardening
- internal job-detail customer / notes / data-entry mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]` customer / notes / data-entry mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `updateJobCustomerFromForm`, `addPublicNoteFromForm`, `addInternalNoteFromForm`, and `completeDataEntryFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal scoped-job boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted cluster
- cross-account internal deny is now explicitly proven for that targeted cluster
- non-internal deny is now explicitly proven for that targeted cluster
- denied targeted cluster paths do not write `jobs` or `job_events`
- denied `completeDataEntryFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- this was a targeted internal job-detail customer / notes / data-entry seam-proof confirmation slice, not a `/jobs/[id]` redesign, not an ECC redesign, and not the end of broader RLS hardening
- internal ECC save / save-complete mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]/tests` ECC save / save-complete mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `saveRefrigerantChargeDataFromForm`, `saveAirflowDataFromForm`, `completeEccTestRunFromForm`, `saveAndCompleteDuctLeakageFromForm`, `saveAndCompleteAirflowFromForm`, and `saveAndCompleteRefrigerantChargeFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal ECC scoped boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted ECC cluster
- cross-account internal deny is now explicitly proven for that targeted ECC cluster
- non-internal deny is now explicitly proven for that targeted ECC cluster
- denied targeted ECC cluster paths do not write `ecc_test_runs`
- denied `completeEccTestRunFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- denied `completeEccTestRunFromForm` paths do not advance retest-resolution/job-event behavior where reachable on the blocked path
- this was a targeted internal ECC save / save-complete seam-proof confirmation slice, not an ECC redesign, not a `/jobs/[id]/tests` redesign, and not the end of broader RLS hardening
- contractor intake adjudication mutation boundary hardening is also complete
- targeted contractor intake adjudication entrypoints no longer rely on partial/inconsistent owner checks across adjudication flows
- one explicit same-account adjudication preflight is now asserted before the targeted adjudication write phases proceed
- cross-account internal access is denied before write on the targeted adjudication paths
- non-internal access is denied before write on the targeted adjudication paths
- the completed targeted contractor intake adjudication mutation-boundary slice covers `finalizeContractorIntakeSubmissionFromForm`, `rejectContractorIntakeSubmissionFromForm`, and `markContractorIntakeSubmissionAsDuplicateFromForm`
- denied targeted contractor intake adjudication paths do not write `contractor_intake_submissions`, `customers`, `locations`, `jobs`, or `job_events`
- this was a targeted contractor intake adjudication mutation-boundary slice, not a contractor intake UX redesign, not a contractor portal redesign, and not the end of broader RLS hardening
- contractor authority was not expanded, and this was not a full jobs/service_cases RLS rewrite
- contractor customer/location visibility remains constrained, read-only, and job-derived
- notifications internal-awareness write-path hardening is also complete
- notifications remain account-owner-scoped for internal awareness
- the generic `42501 -> service-role` fallback was removed from the internal awareness notification write path
- contractor-originated or mixed-context internal awareness notifications now use one explicit, policy-aligned write contract
- internal notification read boundaries remain internal-only; contractors still do not get direct read access to internal notifications
- Report Center account-scope read/export boundary hardening is also complete
- targeted Report Center read/export surfaces now assert explicit account-scoped data boundaries for the hardened report paths
- report jobs/KPI paths now scope job reads by account contractor IDs where applicable
- service case continuity report paths now scope service case reads by account customer IDs where applicable
- closeout follow-up report paths now apply the account-owner scope that was already accepted but not fully used
- dashboard report read model now scopes both jobs and internal invoice reads to the account boundary
- targeted CSV/export report paths were included in this Report Center boundary pass
- empty account-scope lists now use sentinel-safe behavior to prevent accidental fetch-all outcomes on hardened report reads
- focused seam coverage was added for same-account allow, cross-account exclusion/deny, empty scope behavior, and invoice billing-mode honesty
- targeted seam tests passed: 15/15
- full suite passed: 284/284
- TypeScript build passed with `npx tsc --noEmit`
- browser smoke test passed after implementation
- this was a targeted Report Center read/export boundary hardening slice, not a Report Center redesign, not a KPI logic redesign, not a billing expansion, not payment execution work, not QBO work, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
- reporting truth boundaries remain locked: `jobs` / `jobs.ops_status` = operational truth/projection, `service_cases` = continuity truth, `job_events` = audit/activity truth, `internal_invoices` = billed truth for internal-invoicing mode, and `payments` = collected truth only when materially implemented
- external-billing companies must not be treated as if internal invoice/payment records exist
- reporting remains owner-family split and must not collapse operational, billed, and collected truth
- internal job-detail read boundary hardening for `app/jobs/[id]/page.tsx` is also complete
- the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before main job-detail read assembly
- the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before attachment signed URL generation performed from that page
- cross-account internal access is denied before job-detail read assembly on the targeted path
- cross-account internal access is denied before main-page attachment signed URL generation on the targeted path
- denied signed URL paths do not call signed URL generation
- contractor enumeration used by the internal job detail page is scoped to the current internal account owner
- existing contractor/login redirect behavior was preserved
- existing mutation behavior was not changed
- focused seam tests were added for same-account allow, cross-account deny, non-internal behavior preservation, signed URL deny-before-call behavior, and contractor enumeration scoping
- targeted seam tests passed: 7/7
- full suite passed: 291/291
- TypeScript build passed with `npx tsc --noEmit`
- browser smoke test passed after implementation
- this was a targeted internal job-detail read-boundary slice, not a `/jobs/[id]` UI redesign, not a job-detail mutation rewrite, not an attachment subsystem rewrite, not a Report Center change, not a billing expansion, not payment execution work, not QBO work, not a role redesign, not a support-access model, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
- jobs / jobs.ops_status remain operational truth / operational projection
- service_cases remain continuity truth
- job_events remain audit/activity truth
- internal_invoices remain billed truth for internal-invoicing mode
- payments remain collected truth only when materially implemented
- contractor authority was not expanded
- reporting and billing boundaries remain unchanged
- no role redesign, support-access model, payment work, billing work, broader notifications UX/polish work, or broad portal/contractor authority expansion was part of these slices

- Formal closeout review completed for the RLS / permission hardening milestone against live repo evidence and the active hardening ledger.
- Required live access-surface families were reviewed across internal mutations, reads, attachments/signing, ECC flows, equipment/system, lifecycle/scheduling, contractor/customer/location surfaces, invoicing, report exports, notification read-state, identity/admin, dispatch/calendar, intake/adjudication/portal collaboration, server route handlers, and dormant app-local action cleanup.
- Targeted seam hardening coverage is confirmed complete for the milestone-defined families.
- App-local orphan cleanup is confirmed complete for the dormant job-detail action file removal.
- No concrete remaining live permission seam was proven in the closeout review.
- Broad global normalization of all admin-client/service-role usage remains intentionally deferred outside this milestone closeout scope.
- Broad global completion of every notification/email side-effect path remains intentionally deferred outside this milestone closeout scope.
- This milestone is now formally closed at the targeted seam-hardening level.
- This closeout does not imply role redesign, support-access redesign, payment execution work, billing expansion, UI redesign, or a broad cross-domain RLS rewrite.

What this completion does not mean:
- it does not mean broad global permission/security normalization is finished across every possible path
- it does not mean the full broader jobs/service-cases permission model is finished
- it does not mean the full broader jobs/service_cases/job_events operational mutation model is finished across every path
- it does not mean the full broader contractor permission model is finished across every possible path
- it does not mean the full broader staffing permission model is finished across every possible path
- it does not mean the full broader customer permission model is finished across every possible path
- it does not mean the full broader attachment permission model is finished
- it does not mean the full broader ECC permission model is finished
- it does not mean the full broader equipment/system permission model is finished
- it does not mean payment execution is live
- it does not mean checkout/processor behavior was added
- it does not mean the full broader invoice/billing permission model is finished across every possible path
- it does not mean the full broader notification/messaging permission model is finished across every possible path
- it does not mean the full broader internal identity/admin permission model is finished across every possible path
- it does not mean the full broader calendar/dispatch permission model is finished across every possible path
- it does not mean the full broader contractor intake/intake-review permission model is finished across every possible path
- it does not mean contractor portal UX redesign was done
- it does not mean contractor intake adjudication redesign was done
- it does not mean contractor portal redesign was done
- it does not mean contractor invite redesign was done
- it does not mean contractor invite issuance/resend redesign was done
- it does not mean customer/location redesign was done
- it does not mean snapshot-model rewrite was done
- it does not mean full auth/identity lifecycle redesign was done
- it does not mean the full broader auth/identity lifecycle model is finished across every possible path
- it does not mean business-identity redesign was done
- it does not mean tenant-settings expansion was done
- it does not mean the full broader intake permission model is finished across every possible path
- it does not mean `/jobs/new` workflow redesign was done
- it does not mean `/jobs/[id]` workflow redesign was done
- it does not mean `/jobs/[id]/tests` workflow redesign was done
- it does not mean ECC redesign was done
- it does not mean the full broader ECC workflow/permission model is finished across every possible path
- it does not mean contractor notifications were introduced
- it does not mean support-access modeling is complete
- it does not mean role redesign was done
- it does not mean payment/billing/security work outside this seam was done
- no contractor authority expansion happened in this targeted invoice hardening slice
- no notification UX redesign happened in this targeted internal notification read-state hardening slice

Closed milestones:
- Payment P1 foundation is closed at the current baseline.
- Out-of-box readiness / business identity / settings packaging is closed at the current baseline.
- First Owner Provisioning V1 and runbook are complete.

Next natural roadmap area:
- Smaller service-model revisions / service workflow refinement.
- Current service workflow refinement status (implemented):
  - Create Next Service Visit foundation is restored/implemented and runtime-smoked.
  - `createNextServiceVisitFromForm` remains the fast internal path for creating another Service visit under the same service case.
  - Service Waiting State V1 is implemented as a no-schema, job-level waiting-state layer using existing pending/on-hold fields and `job_events` narrative context.
  - Waiting-state labels include Waiting on part, Waiting on customer approval, Estimate needed, Waiting on access, Waiting on information, and Other.
  - Create-next in V1 does not auto-clear source waiting state; explicit/manual release remains required.
  - This refinement advances the service model without introducing parts inventory, estimate automation, service-case-level blocker orchestration, or auto-release behavior.
  - Estimates/quoting V1A-V1J is implemented to the current guarded internal baseline.
  - Production estimates remain intentionally disabled/deferred pending migration apply plus explicit feature-flag enablement.
  - V1E internal-only status transitions are complete (`draft -> sent`, `sent -> approved|declined|expired|cancelled`, and `draft -> cancelled`).
  - V1E transition events write `previous_status` and `next_status`; status timestamps are set on transition.
  - V1E keeps line editing draft-only and hides line-edit controls after `sent`.
  - V1F internal-only hardening/operator polish is complete: confirmation UX, status wording, activity feed readability, operator clarity around non-goals, and disabled-environment notice polish.
  - V1G internal-only presentation and print-readiness polish is complete: estimate detail readability is improved for estimate number/status/customer/location/totals/line items, browser print layout is improved for internal document review, commercial boundary wording is explicit, and future-send/communication-history placeholders are read-only only.
  - V1H internal-only communication/send-attempt foundation is complete: `estimate_communications` is now send-attempt truth, blocked-attempt capture is present when `ENABLE_ESTIMATE_EMAIL_SEND` is disabled, and communication history/activity are no longer placeholder-only.
- Stripe customer/work payment execution follows service/invoice/estimate readiness unless explicitly pulled forward.

Current deferral reminder:
- Stripe customer/work payment execution remains deferred and separate from this service workflow refinement.

Separate pre-launch enablement track:
- Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed in production for the platform account subscription slice.
- Live confirmation includes deployed env, live webhook handling, successful non-owner checkout completion, entitlement sync, and Manage billing availability.
- This does not move tenant customer invoice payment execution into current scope.
- Platform subscription billing must remain separate from future tenant customer/work payment execution.

Roadmap guardrail:
- Payment P1 foundation is complete and closed.
- Payment execution remains deferred.
- Stripe platform subscription billing for platform account onboarding is implemented and live-smoke confirmed.
- Tenant customer invoice payment execution remains a deferred track unless explicitly pulled forward.
- This does not imply live Stripe/payment execution start unless explicitly planned.
- This does not imply QBO dependency.

Older archived Service planning docs are historical only and remain subordinate to the active spine and this active roadmap.

---

## 9. Estimate v1 (implemented guarded baseline: V1A-V1J)

### Purpose
Estimate is the proposed commercial scope for solving a problem.

### Current implementation status (V1A-V1J)
- V1A schema/domain foundation is implemented (commit `a200a17`; migration `20260501140000_estimates_v1a_schema_domain.sql`).
- Estimate migrations `20260501140000_estimates_v1a_schema_domain.sql` and `20260502120000_estimate_communications_v1h.sql` are applied in sandbox and production.
- Product Mode migration `20260509120000_account_settings_product_mode_v1.sql` is applied in sandbox and production.
- V1B create/read/line server actions are implemented.
- V1C internal estimates UI is implemented (`/estimates`, `/estimates/new`, `/estimates/[id]`) with draft creation and manual line add/remove.
- V1C fail-closed `ENABLE_ESTIMATES` guard is implemented.
- Production `ENABLE_ESTIMATES=true` is enabled in Vercel Production only; unauthenticated production `/estimates` and `/estimates/new` remain login-gated.
- Production `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
- V1D draft-only Pricebook-backed line picker on estimate detail is implemented.
- V1D preserves manual line add/remove and server-owned Pricebook snapshots/provenance.
- V1E internal-only status transitions are implemented:
  - `draft -> sent`
  - `sent -> approved`
  - `sent -> declined`
  - `sent -> expired`
  - `draft -> cancelled`
  - `sent -> cancelled`
- V1E terminal statuses cannot transition further.
- V1E writes estimate transition events with `previous_status` and `next_status`.
- V1E sets status timestamps on transition (`sent_at`, `approved_at`, `declined_at`, `expired_at`, `cancelled_at`).
- V1E keeps line editing draft-only and hides line-edit controls after `sent`.
- V1F is internal-only hardening/operator polish:
  - status transition confirmation wording is added to reduce accidental clicks
  - terminal/destructive actions use stronger confirmation copy
  - detail status panels more clearly describe draft, sent, and terminal states
  - `sent` clearly states that no email/PDF is sent in V1F
  - `approved` clearly states that no job, invoice, payment, conversion, or customer approval record is created in V1F
  - activity feed labels and transition summaries are more readable (for example `Draft -> Sent`, `Sent -> Approved`)
  - detail/list return navigation is slightly clearer
  - disabled-environment notice polish is present on `/ops?notice=estimates_unavailable`
- V1G is internal-only presentation and print-readiness polish:
  - estimate detail scan hierarchy/readability is improved for estimate number, status, customer/location context, totals, and line items
  - browser print layout is improved for internal estimate document review
  - explicit commercial boundary wording is present so `sent`/`approved` do not imply email delivery, customer approval records, conversion, or payment execution
  - future-send controls are placeholder-only with explicit non-enabled wording; no email/PDF behavior is executed
  - communication history is placeholder-only/read-only with no delivery-tracking claim
- V1H is internal-only estimate communication/send-attempt foundation:
  - `estimate_communications` table is introduced as send-attempt truth
  - send-attempt action is internal-only and fail-closed by `ENABLE_ESTIMATE_EMAIL_SEND`
  - blocked attempts are recorded when send flag is disabled
  - draft/sent detail supports send-attempt UI and communication history
  - activity readability includes `estimate_send_attempted`
  - terminal estimate statuses do not expose send action
- V1I is decision/planning artifact only (no implementation changes):
  - Option B first: generated document/PDF strategy planning before real provider send
  - Option A later: sandbox-only real provider enablement after document/wording go/no-go gates
  - go/no-go gates for future sandbox-only email enablement: approved document wording, approved branding/header/footer, recipient confirmation UX reviewed, communication history wording approved, sandbox-only send smoke plan written, fail-closed rollback validated
  - go/no-go gates for future PDF generation/storage: canonical content model, freeze/version semantics, generation trigger, internal access boundaries, retention/storage policy, and no portal/public exposure
- V1J is implemented as internal document-template/readiness slice:
  - canonical estimate document view model/helper is implemented
  - centralized estimate disclaimer package is implemented
  - revision semantics planning constants are implemented (future freeze at send-attempt creation, immutable historical revisions, post-freeze edits require a new revision)
  - estimate detail readiness section is implemented and wired to the shared document helper
  - print/readiness wording now follows shared document model structure
  - no persistent revision storage yet
  - no PDF generation/storage yet
  - automated checks passed (`123/123`, `TSC_OK`), sent/approved smoke passed, and draft-detail smoke is now completed/closed using sandbox draft `EST-20260502-9D58499B` (`/estimates/43aeaa8e-e60e-47d4-8c26-2570600b24df`) with document readiness/disclaimer rendering, draft manual-line editing, draft pricebook picker availability, blocked send copy, communication history rendering, and no email/PDF/customer approval/public link/conversion/payment/customer portal/contractor controls exposed

### Implemented capabilities (current guarded internal baseline)
- estimate schema/domain foundation
- internal create/read actions
- internal list/create/detail UI
- draft estimate creation
- manual estimate line add/remove
- Pricebook-backed estimate line picker
- frozen line snapshots
- subtotal/total recomputation
- estimate events for create/line changes where implemented
- internal-only operator hardening and workflow clarity polish
- internal-only estimate communication/send-attempt foundation with blocked-attempt recording
- internal-only document-template/readiness layer driven by shared estimate document model

### Estimate ownership
Estimate belongs to:
- customer
- location
- service_case

It does not belong only to a job by default, because jobs are visits and estimates describe broader commercial scope.

### Required fields
- estimate_number
- customer_id
- location_id
- service_case_id
- status
- title_or_summary
- subtotal
- total
- created_at

### Useful early fields
- notes
- sent_at
- approved_at
- declined_at

### v1 statuses
- draft
- sent
- approved
- declined

### Estimate line item rule
Estimate line items are frozen quoted snapshots.

Required line-item fields:
- estimate_id
- sort_order
- source_pricebook_item_id optional
- item_name_snapshot
- description_snapshot
- item_type_snapshot
- quantity
- unit_price
- line_subtotal

### Locked rule
If the pricebook changes later, old estimates do not change.

### Source-of-truth boundaries (locked)
- `estimate_events` = lifecycle/operator audit truth
- `estimate_communications` = send-attempt/communication truth
- Estimate = proposed commercial scope
- Visit Scope = operational work scope
- Invoice = billed commercial scope
- Payment = collected truth only where implemented
- Pricebook = reusable catalog/default pricing truth

### Explicit non-goals still deferred
- real outbound production estimate email
- customer approval
- customer e-signature
- customer portal estimate visibility
- public estimate links/tokens
- contractor visibility/authority
- PDF generation
- PDF storage
- persistent revision storage
- estimate-to-job conversion
- estimate-to-invoice conversion
- payment/deposit
- Stripe tenant payment behavior
- QBO behavior
- production estimate feature enablement

### Production rollout prerequisites (later)

The sole pre-production code blocker (missing `createEstimateDraft` flag guard) is now resolved and committed. Remaining prerequisites for internal-only production enablement are:

- governance preflight and all-approver sign-off (Phase A of runbook)
- sandbox pre-validation with both estimate migrations confirmed healthy (Phase B)
- intentional production migration apply for both estimate migrations in order (Phase C)
- disabled-state smoke with schema applied and `ENABLE_ESTIMATES` still off (Phase D)
- production `ENABLE_ESTIMATES` enablement for internal-only slice (Phase E)
- internal-only production smoke checklist (Phase F)
- rollback by disabling `ENABLE_ESTIMATES` if needed (Phase G)

Production `ENABLE_ESTIMATE_EMAIL_SEND` must remain unset/false for the internal-only slice. Real outbound estimate email requires a separate email-enablement runbook after all V1I go/no-go gates are satisfied.

Full procedure: hardened committed production execution runbook (`df9870f`) at `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md`; this remains planning/runbook readiness only and does not itself execute production enablement.

### Next implementation direction (post-V1J)
- V1I decision remains recorded and V1J internal document-template/readiness implementation is complete.
- Any production estimate enablement remains a future explicit execution decision under the hardened runbook gates; Option A comes later as sandbox-only real provider enablement after all documented go/no-go gates are satisfied.
- draft-detail smoke caveat is closed.
- Do not enable production estimate email sending without an explicit rollout plan.
- no customer approval, customer/contractor portal authority, email/PDF, conversion, or payment behavior should be implemented without a design pass

---

## 10. Approved estimate flow (planned)

### Core rule
An approved estimate does not directly become a job by default.

Instead:
1. estimate is approved
2. approved scope becomes authorized scope under a service case
3. ops schedules one or more jobs under that case
4. jobs execute the work as visits

### Service-case behavior
- if no service case exists, approval creates one
- if a service case exists, approval updates/attaches authorized scope under it

### Locked rule
Approved estimate → service case/business scope first, then jobs/visits under it.

---

## 11. Invoice sourcing rules (implemented production baseline + planned expansion)

### Core rule
Invoice line items must come from a defined source, then become frozen billing records.

When invoice sourcing comes from job execution, the operational source is completed visit scope.
Internal invoicing remains downstream of visit execution and must not define visit scope itself.

### Current production-promoted sourcing extension (C1B/C1C)
- Pricebook-backed draft internal invoice line creation is production-complete and production-smoke confirmed
- manual and Pricebook-backed line creation coexist in the draft invoice workflow
- Pricebook item remains a mutable reusable catalog definition
- invoice line item remains a frozen billed snapshot once written
- editing/deactivating Pricebook items must not mutate existing invoice lines
- current provenance/snapshot fields used for this seam are: `source_kind`, `source_pricebook_item_id`, `category_snapshot`, `unit_label_snapshot`

### Current production-promoted Visit Scope bridge extension (A1-A5)
- Visit Scope -> draft internal invoice build flow is production-promoted and production-smoke confirmed.
- Visit Scope items now carry durable IDs for stable invoice-sourcing linkage.
- Internal invoice line provenance now supports Visit Scope linkage through:
  - `source_kind = visit_scope`
  - `source_visit_scope_item_id`
- Draft invoice panel supports selecting Visit Scope items and creating draft invoice lines from those selections.
- Visit Scope-sourced draft lines initialize as `quantity = 1.00` and `unit_price = 0.00` and are review/edit-first before issuing.
- Already-added behavior prevents duplicate addition of the same Visit Scope item to the active draft invoice.
- Service intake now enforces structured Visit Scope presence; summary-only submissions are rejected.
- ECC intake optional scope remains lightweight and companion scope remains allowed.
- Manual draft line add and Pricebook draft line add continue to coexist with Visit Scope draft build.
- Issued/void invoice behavior remains immutable.
- No payment execution, Stripe, QBO, or service lifecycle redesign was introduced by A1-A5.

### Allowed source paths
- approved estimate scope
- completed visit scope
- manual office-created billing scope

### Default sourcing hierarchy
1. approved estimate scope, if present
2. completed visit scope, if no approved estimate exists
3. manual office creation, if neither applies or override is needed

### Non-estimated additions
Office may add non-estimated items to invoices.

Those additions must not silently rewrite the estimate.

### Locked rule
Estimate = proposed scope.  
Invoice = billed scope.

They may overlap heavily, but they are not the same record.

Completed/defined visit scope can now feed draft internal invoice creation in production, but invoice line items remain frozen billed snapshots rather than the primary operational work-definition layer.

---

## 12. Internal Invoice V1 — implemented baseline and planned refinements

### Purpose
Invoice is the internal commercial billing record when a company is in internal invoicing mode.

### Default relationship rule
One job may have **one primary invoice by default**.

The architecture must not assume that is the only possible future shape forever.

### Required fields
- invoice_number
- company_id
- customer_id
- location_id
- job_id
- service_case_id optional but preferred
- status
- invoice_date
- issued_date nullable until issued
- subtotal
- total
- notes optional

### Useful early fields
- source_type (`estimate`, `job`, `manual`)
- source_estimate_id optional
- voided_at optional
- void_reason optional

### V1 workflow scope
Internal Invoice V1 explicitly includes:
- job-linked invoice first
- reviewable draft invoice before issuance
- job/customer/location prefill into the draft invoice
- issue/send invoice from the job-linked invoice record
- resend as a communication action, not a second invoice
- invoice communication tracking/history owned by the invoice workflow
- source-path compatibility for approved estimate scope, completed job/visit scope, and manual office-created billing scope
- paid-state planning in the invoice roadmap, without implying live processor execution in this phase

### Current milestone-2 baseline status
This invoice/billing workflow is now complete enough to move forward for the current milestone-2 scope.

Achieved baseline at this milestone includes:
- invoice review before issuance
- invoice issue/send behavior
- resend behavior as a communication action
- invoice communication tracking/history at the job-linked invoice layer
- closeout alignment around billed truth for internal-invoicing mode

Deferred refinement still remaining:
- invoice email content/design polish
- broader presentation refinements that do not change billed truth, closeout ownership, or payment boundaries

### Invoice communication seam
Invoice communication tracking is an invoice-owned communication seam, not payment execution.

It should support at least:
- sent
- resent
- failed
- recipient
- last sent at
- delivery/error note if available
- honest attempt tracking rather than fake guaranteed-delivery claims

This seam must not be read as introducing Stripe checkout, live card/ACH collection, refunds/disputes, contractor payouts, QBO sync, or any other live payment-execution behavior.

### v1 statuses
- draft
- issued
- void
- paid (planned later under payment tracking, not the initial invoice-closeout seam)

### Locked rule
Sourcing creates drafts.  
Issuance makes the invoice real.

For Internal Invoice V1, `issued` is the billing-satisfied boundary for operational closeout. `paid` remains part of invoice-state planning, but belongs to later payment-tracking truth rather than the initial invoice-closeout seam.

### Invoice line items
Invoice line items are frozen billing snapshots.

Required line-item fields:
- invoice_id
- sort_order
- source_kind optional (`manual` | `pricebook` | `visit_scope`)
- source_pricebook_item_id optional
- source_visit_scope_item_id optional
- source_estimate_line_item_id optional
- category_snapshot optional
- unit_label_snapshot optional
- item_name_snapshot
- description_snapshot
- item_type_snapshot
- quantity
- unit_price
- line_subtotal

### Locked rule
Once created, invoice line items do not live-sync back to estimate, job, or pricebook.

Pricebook-backed draft invoice adds are production-promoted as part of the active continuation path, and invoice line items remain frozen billed snapshots once created.

Manual invoice lines and Pricebook-backed invoice lines are both valid paths and may coexist on the same draft invoice.

### Closeout seam clarification
Internal Invoice V1 must not create a second billing truth on jobs.

For internal-invoicing companies:
- the primary job-linked invoice is billed truth
- `jobs.invoice_complete` remains an operational closeout projection
- `jobs.invoice_complete` may be satisfied by invoice issuance, but it is not itself the invoice record

For external-billing companies:
- the current lightweight `Invoice Sent` / closeout behavior remains the billing-action path
- no internal invoice record is required

---

## 13. Field invoice finalization rules (planned)

### General principle
Techs may participate in job-linked invoicing when company workflow allows it.

This is especially important for field-only or small operations without dedicated office staff.

### Techs may be allowed to
- open the draft invoice tied to their job
- review existing line items
- add job-linked invoice items in the field
- adjust quantity
- send/finalize the invoice
- later collect payment if/when live payment capability exists under the payments roadmap
- send invoice/receipt to the customer

### Guardrails
- pricebook-backed additions are the preferred/default path
- custom one-off items should be permission-controlled
- unrestricted price override should not be default
- field-added or field-modified billing items should be attributable to the acting user

### Locked rule
Field invoice finalization is allowed, but field invoice administration is not broad by default.

---

## 14. Payments relationship note (subordinate to payments roadmap)

This roadmap does not define payment processor architecture.

That direction is owned by:
- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

### Business-layer meaning of payments
For business-layer planning purposes:
- payment = money collected against an internal invoice (manual/off-platform tracking now available for issued internal invoices; live processor execution remains later)
- one invoice may have many payments
- reporting must distinguish billed truth from collected truth
- payment behavior must respect company billing mode
- collected-payment truth is now materially implemented in `public.internal_invoice_payments` for internal-invoicing companies
- tenant customer payment execution is the future processor-backed path for issued tenant internal invoices, separate from platform subscription billing
- internal invoices remain billed truth; `internal_invoice_payments` remains collected-payment truth
- manual/off-platform payment recording must continue to coexist with Stripe-sourced payment rows
- Stripe is the payment rail, not the operational source of truth

### Locked rule
Do not use this document to override:
- Stripe-first future payment direction
- QBO optional-only rule
- payment-ready-now / payment-active-later architecture
- small configurable platform-fee support

Those belong to the payments roadmap.

---

## 15. Billing permissions (planned)

### Office/Admin
- full invoice management
- create/edit draft invoices
- issue invoices
- void invoices
- manage broader billing administration
- later manage payment correction flows if/when payment capability exists

### Tech
May be allowed, depending on company workflow/settings:
- access job-linked draft invoice
- add/adjust permitted line items
- send/finalize job-linked invoice
- later collect payment if enabled by company workflow and payment capability

Techs do **not** broadly administer company-wide billing by default.

### Contractor
No ownership of internal invoice/payment records.

---

## 16. Reporting and tracking principles (planned)

### Reporting families
Reporting must be split into:
- operational reporting
- commercial reporting
- collection reporting
- continuity/service-quality reporting

### Owner discipline
- jobs / ops_status = operational truth
- service_cases = continuity truth
- estimates = quoted truth
- invoices = billed truth
- payments = collected truth when payment capability exists
- job_events = audit/activity truth

### Mode-aware reporting rule

#### External-billing companies
Valid:
- invoice action taken/not taken
- billing follow-up visibility

Not valid:
- internal invoice totals
- payment collection reports
- internal receivables reporting

#### Internal-invoicing companies
Valid:
- draft/issued/paid/void invoice reports
- outstanding balances
- payments collected when payment capability exists
- collected by tech/user
- payment method reporting when payment capability exists

### No mixed-meaning bucket rule
Do not combine these into one ambiguous metric:
- no billing action yet
- billed externally
- internal invoice drafted
- internal invoice issued
- payment outstanding
- payment complete

### Snapshot rule
Historical reporting must read frozen transactional snapshots, not today’s mutable pricebook definitions.

### Current implemented reporting baseline (achieved)

Reporting / analytics now has a real Report Center baseline and is no longer only planning-level direction.

Current implemented baseline includes:
- Dashboard as the default internal reporting entry
- Jobs Report for visit-level operational reporting
- Service Cases Report for continuity/service-quality reporting
- Closeout Report for visit-owned closeout/follow-up backlog reporting
- Invoices Report for billed-truth internal invoice reporting where internal invoicing mode is active
- CSV export support on the report-family ledgers
- dashboard drill/export behavior that reuses existing ledgers where that is the honest source
- KPI Reference retained as lower-priority internal scaffolding rather than a primary product destination

Locked boundary:
- Reporting still must stay split by family and owner truth.
- Operational truth, billed truth, and collected truth must not be collapsed into one ambiguous reporting surface.
- Invoice reporting may surface billed truth where real internal invoice records exist.
- Collection/payment reporting remains later and must not be implied before payment truth materially supports it.

---

## 17. Optional accounting sync seam (planning only)

Compliance Matters must remain usable as a standalone system.

### Locked rule
QBO remains optional and downstream.
QBO remains parked until a later accounting-export slice is explicitly approved.

### Meaning
Future accounting sync may later include:
- exported/synced customer mappings
- synced invoice mappings
- synced payment mappings
- reconciliation status / sync status fields

But:
- QBO is not required for core use
- QBO is not the payment foundation
- QBO is not the source of operational truth
- QBO must not override app-owned invoice or payment truth

For payment architecture, defer to the payments roadmap.

---

## 18. Rollout and integration guardrails (locked)

### Additive-first rule
Business-layer rollout must be additive first, not replacement first.

### Current closeout protection
Current live closeout behavior remains valid during rollout:
- Invoice Sent
- cert-complete behavior
- existing job closeout logic

Current implemented protection note:
- for external-billing companies, the supported `Invoice Sent` / `Mark Invoice Sent -> Closed` path now satisfies the same lightweight `jobs.invoice_complete` projection required by external-billing closeout before the supported closed path is reached
- for internal-invoicing companies, job-level `invoice_complete` remains only an operational closeout projection and must not compete with invoice-record billed truth
- internal-invoicing closeout/report/dashboard/ops readers must derive billed truth from the invoice record domain, not from lightweight job-level invoice-action markers
- external-billing readers must preserve the lightweight job-level invoice-action meaning and must not pretend an internal invoice record exists
- invoice-required metrics and operator messaging must derive from billing-aware invoice-needed truth, not raw `jobs.ops_status = invoice_required`
- supported lightweight external-billing completion paths now align `data_entry_completed_at`; `invoice_number` remains explicit data-entry-owned input rather than lightweight button-generated data

### Billing-mode-driven exposure
Feature exposure must follow company billing mode.

### No mixed billing truth
Do not let lightweight invoice-action tracking and internal invoice records compete inside one live company workflow.

For internal-invoicing companies, do not let job-level `invoice_complete` compete with invoice record state as separate billing truth. Job closeout may project billing-satisfied state, but the invoice record owns billed truth.

### Historical integrity
Do not fake-backfill historical invoice/payment records just to make reporting look complete.

### Mode switching rule
Switching from external billing to internal invoicing must be explicit and deliberate.

### v1 rollout focus
Internal invoicing rollout should begin with **job-linked invoices**, not broad freeform billing across the system.

### Must-not-regress list
New business modules must not regress:
- current job closeout behavior
- ECC/service distinction
- cert-completion logic
- service case / job ownership model
- operational dashboard truth
- external-billing workflow via current Invoice Sent path

### Support access rollout boundary (V1A/V1B/V1C)
- Customer Support / Remote Assistance V1A foundation is implemented, committed, and pushed on `main`.
- V1A migration is applied to sandbox only; production apply remains intentionally deferred.
- V1A support-access contract is locked to:
  - explicit `support_user` + active grant + active session
  - account-owner scoped sessions
  - required audit events
- Customer Support / Remote Assistance V1B support console shell is implemented, committed, and sandbox-smoked.
- V1C feature exposure guard is implemented and fail-closed; production `ENABLE_SUPPORT_CONSOLE` remains intentionally unset/false.
- V1B remains read-only only and intentionally does not add:
  - tenant job/customer/invoice browsing surface
  - support mutation behavior
  - impersonation/login-as-customer behavior
- No production support access is live.
- Support V1 is intentionally parked from production enablement; this is not unfinished architecture.
- Do not proceed now with production support migration apply, production support seeding, or production `ENABLE_SUPPORT_CONSOLE` enablement.
- Support Console foundation production migration readiness is now closed at **ready after listed inputs** for `20260501120000_support_access_v1a_foundation.sql` only.
- Recommended future production apply strategy is an isolated single-migration execution artifact/worktree because normal `db push` from current repo state would include later pending migrations.
- Future Support V1A schema apply remains additive/dormant only: no support-user seed, no grant/session creation, no live audit generation through use, and `ENABLE_SUPPORT_CONSOLE` remains intentionally unset/false after schema apply.
- Estimates and Product Mode migrations must not be bundled into that Support V1A migration window.
- Support Console foundation production migration execution is now complete for `20260501120000_support_access_v1a_foundation.sql` on production ref `ornrnvxtwwtulohqwxop`.
- Execution used isolated single-migration worktree strategy from commit `ab1fb34`, with dry-run and explicit approval before apply.
- Post-apply verification passed: support tables/indexes/constraints present, RLS enabled, no support-table policies, no grants for PUBLIC/anon/authenticated, and all support-table row counts remained `0`.
- Execution boundaries remained intact: `ENABLE_SUPPORT_CONSOLE` stayed false/unset; no support seeding/grants/sessions/live audit generation; no Estimates/Estimate Communications/Product Mode migration bundled.
- Current production pending set after this window was: `20260502120000_estimate_communications_v1h.sql`, `20260509120000_account_settings_product_mode_v1.sql`.
- Main workspace Supabase link remains production ref; future sandbox work must relink/verify sandbox explicitly before any sandbox operation.
- Future support rollout remains explicit and later-scoped:
  - production migration approval
  - production `support_user` seed
  - one read_only grant
  - explicit `ENABLE_SUPPORT_CONSOLE` enablement
  - controlled smoke
  - rollback by disabling `ENABLE_SUPPORT_CONSOLE`
  - tenant/customer-facing support grant visibility
  - read-only account overview
  - mutation support only as a much later explicit decision, if ever

---

## 19. Deferred / later business-layer expansion

Not part of v1 unless explicitly pulled forward:
- due dates / terms
- tax and discount breakdown
- revision/superseded estimate flow
- deposit/progress invoicing
- multiple active invoices per job
- advanced payment correction/reversal tooling
- deeper receivables aging
- membership/maintenance-linked billing
- advanced recurring-service billing
- richer accounting sync behavior

---

## 20. One-line definition

Compliance Matters’ business layer is an **internal-first, mode-aware commercial planning roadmap** built on top of the existing operational platform, where estimates define proposed scope, invoices define billed scope, payments relate to collected money when enabled, and commercial reporting stays clean by respecting ownership boundaries.

---

## 21. Controlled Onboarding Readiness � Group Closeout Summary (May 2026)

The following implementation groups have been closed as of May 2026.

### Group 1 � Sandbox / Production Mirror Audit (CLOSED)

- Production SQL verification confirmed expected migrations applied; key tables exist; RLS enabled on protected tables.
- `calendar_events` SELECT/INSERT/UPDATE/DELETE policies present.
- Support Console schema applied in production and remains operationally dormant.
- Sandbox/prod mirrored enough for sandbox-first controlled validation; data parity is intentionally not required.

### Group 2 � Signup Front Door / Product Choice (CLOSED)

- `/signup` shows SERVICE and ECC product-choice cards.
- `/signup/service` -> `hvac_service`; `/signup/ecc` -> `ecc_hers`.
- Hybrid remains manual/operator-only.
- See `docs/ACTIVE/Product_Mode_Signup_Spec.md` for full spec and implementation closeout.

### Group 3 � First HVAC Service User Onboarding (CLOSED / MONITORING)

- First HVAC Service user signed up and appears in Owner Console.
- No active blocker known.
- Future user feedback should be classified through Support V0 intake before becoming build work.

### Group 4 � Owner Console / Test Accounts (CLOSED)

- Known production test accounts are hidden from default Owner Console counts/views via `PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS` display filtering.
- No accounts deleted or archived; no Stripe-linked history touched.
- Owner Console remains read-only and platform-owner-only.

### Remaining Roadmap (Groups 6-9)

| Group | Name | Status |
|---|---|---|
| 6 | Estimates / Quoting Completion | Next planned |
| 7 | Product Mode / Packaging Completion | Planned |
| 7A | Pricing / Tiers / Seat Alignment | Planned � see Competitive_Packaging_and_Tier_Spec.md |
| 8 | Support / Owner Operations | Planned |
| 9A | Recurring Services / Maintenance Agreements | Group 9A-2/3/4/5B/6/7B/8B/9A/9B/9C/9E/10B/10C closeout is documented, including read-only count eligibility (`0588a26`) plus manual `Mark Visit Counted` (`1b69336`) with always-visible placement fix (`2ae1a4b`); boundaries remain no automatic counting/no due-date advancement/no invoice-payment behavior; production remains inactive until migration apply and flag enablement are intentionally approved - see [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md) |
| 9B | SMS / On-My-Way Messaging | Planned (staged) — Slice A (`afddb9c`, `02aee5a`), Slice B1 (`39a2963`), Slice B2 (`c0247af`), Slice C (docs/model), Slice D (docs/model), Slice E1 (docs/model), and Slice E2 migration foundation (`b90c9ea`) are complete. Slice E2 migration `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql` created `sms_message_intents` and `sms_provider_deliveries` with locked semantics: intents are send-request/decision audit context, deliveries are provider submission/callback truth, one current delivery row per intent, and account-scoped idempotency foundation on intents. Quiet-hours/timezone scope is locked as future conservative fail-closed SMS pre-send gate only; Mark On The Way and lifecycle/status transitions remain direct workflow and are not blocked; no quiet-hours settings UI is approved for V1 direct workflows. E2 validation passed (`npx.cmd tsc --noEmit`, helper tests `16/16` and `4/4`, `git diff --check`, `supabase db reset --local --no-seed --yes` with full local chain including E2). Scope remains no provider delivery write path, no send endpoint/webhook/provider integration, no live SMS, no backfill, no production migration apply, and no production writes. Marketplace guardrail remains neutral tenant/account-scoped audit infrastructure only. Live SMS remains deferred pending activation gates in `docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md`, recipient-role boundaries in `docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md`, and future gate slices documented in `docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md`, `docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md`, `docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md`, and `docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md`. |
| 9C | Tenant Customer Payments / Stripe Customer Payment Execution | Planned |
| 9D | Customer Portal | Planned |
| 9E | QBO / Accounting Sync | Last-last; optional downstream only |

### Going-Forward Execution Discipline

- Choose one lane. Audit/plan first. Implement surgically. Validate. Commit/push. Update docs at closeout.
- Do not jump lanes unless there is a real blocker, dependency, risk, or owner decision to park.
