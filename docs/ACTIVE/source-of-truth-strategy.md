# Source-of-Truth Strategy (LOCKED) — Phase 2 Closeout

**Project:** Compliance Matters Software (Next.js App Router + Supabase)  
**Status:** LOCKED (Strategy B)  
**Effective Date:** 2026-02-24 (Phase 2 Closeout)

## Purpose

This document defines the authoritative data sources for customer/location/job display fields and for ECC/HERS operational status resolution.

This is locked to prevent drift, regressions, and “snapshot vs normalized” confusion.

---

## Strategy B: Hybrid Snapshots + Normalized Sources (LOCKED)

### Canonical Sources
- **Customers:** `customers` table is the canonical source of customer identity + contact details.
- **Locations:** `locations` table is the canonical source of job site address details.

### Snapshot Fields (Operational Convenience)
Some screens still read snapshot fields from `jobs` (e.g., `customer_phone`, `job_address`, `city`).  
These snapshot columns are allowed as a *performance/operational convenience layer* (fast Ops display, minimal joins), but are **NOT** canonical.

**Rule:** If snapshot fields exist, they must be kept in sync at defined sync points.

---

## ECC/HERS Outcome Source of Truth (Operational Resolution)

### Canonical Test Outcomes
ECC test outcomes are canonical in:

- `ecc_test_runs`
  - `computed_pass` (derived from saved readings and rules)
  - `override_pass` (manual decision; used for smoke tests, exemptions, etc.)
  - `is_completed` (controls whether a run counts toward job resolution)
  - `data` and `computed` (audit + CHEERS reporting support)

### Job-Level Operational Projection
Job operational state is a projection derived via:

- `evaluateEccOpsStatus(jobId)`  
  - derives `jobs.ops_status` transitions for ECC jobs based on completed runs

**Rule:** UI must not “guess” job ECC resolution. It should rely on `jobs.ops_status` (projection) which is derived from `ecc_test_runs` (canonical).

---

## Required Sync Points (Snapshots)

Snapshot sync exists to support legacy reads and keep the Ops UI stable until normalization is complete.

### Sync Points (Must Trigger Snapshot Sync + Revalidate)
1) **Customer Edit**
   - Updates `customers` and optionally related snapshot fields on `jobs` for existing jobs.
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]` (where relevant)

2) **Location Edit**
   - Updates `locations`
   - Updates snapshot address fields on `jobs` where relevant
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]`

3) **Job Intake / Job Creation**
   - When a job is created and linked to customer + location:
     - Populate job snapshot fields from canonical tables (or directly from form if canonical records are created in the same flow)
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]`

4) **Job Relink / Customer or Location reassignment (Future)**
   - If job’s customer_id/location_id changes:
     - Re-stamp snapshot fields to match new canonical references
   - Must revalidate:
     - `/ops`
     - `/jobs`
     - `/jobs/[id]`

5) **Schedule-only update preservation rule (implemented)**
   - Schedule updates submitted through `updateJobScheduleFromForm` must preserve existing permit fields when permit values are omitted from the schedule form payload.
   - Omitted schedule-form submits must not clear `permit_number`, `jurisdiction`, or `permit_date`.
   - This is a data-preservation rule for partial updates and does not alter lifecycle ownership, queue semantics, or scheduling source-of-truth boundaries.

---

## ECC-Specific Sync / Events (Operational Log Rules)

### Timeline Source
- `job_events` is the canonical event log for:
  - status changes
  - scheduling events
  - retest chain events
  - customer attempt call logs
  - test resolution markers (job_passed/job_failed, retest_passed/retest_failed)

**Rule:** Do not add a new timeline table. Continue using `job_events`.

### Retest Resolution Loop
- Jobs may have `parent_job_id` to represent retests.
- When retest is completed:
  - child run completion can generate events
  - parent can receive `retest_passed` / `retest_failed` and ops status may resolve accordingly

**Rule:** Parent job state should be resolved via events + ops status projection, without breaking existing flows.

---

## UI Read Rules (Phase 2 Stable State)

We acknowledge the current UI is hybrid:
- Some pages read canonical (`customers`, `locations`) directly.
- Some pages still read job snapshots (`jobs.customer_phone`, `jobs.job_address`, etc.)

This is acceptable under Strategy B **only if the sync points above remain intact**.

**Phase 2 policy:** No major refactors to normalize reads across the app right now.  
Future work may normalize pages gradually, but must not break the snapshot sync safety net until complete.

---

## Guardrails (Do Not Break)

1) **Never rely on jobs snapshot fields as canonical.**
2) **If a screen reads snapshots, snapshots must be synced at the defined sync points.**
3) **ECC resolution must come from completed `ecc_test_runs` via `evaluateEccOpsStatus(jobId)`.**
4) **Do not introduce a new timeline/events table. Use `job_events`.**
5) **All redirects from tests pages must preserve `t=` and never emit blank `s=`.**
6) **Phase 2 logic is “stable.” Future changes should be additive or cleanup-only unless explicitly planned.**

---

## Notes for Future Normalization (Phase 3+)

If/when we move from Strategy B → Strategy A (fully normalized reads):
- Replace snapshot reads in `/ops`, job cards, and job overview with canonical joins
- Keep snapshot sync temporarily until all legacy reads are removed
- Remove snapshots only after:
  - all reads are normalized
  - test coverage or field validation confirms no regressions

---

## SMS Communication Authority Guardrail

Job snapshot fields (`jobs.customer_phone`, `jobs.customer_email`, `jobs.job_address`, etc.) must **never** be used as the authoritative source for provider-powered SMS recipient selection.

- Snapshots are Ops display convenience fields only.
- Canonical customer phone (`customers.phone`) is the identity reference for Ops context, but it is not role-tagged, not consent-scoped, and not suppression-aware.
- A first-class recipient/contact role model is required before live SMS. See: `docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md`.
- Future On-The-Way workflow and control-gate contract is documented in `docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md` (background/event-driven evaluation, no job-detail preview card, admin-only future template governance, fail-closed blocked-send posture).
- Future settings ownership and IA contract is documented in `docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md` (Settings -> Communications ownership; Company Profile boundary separation; activation-control posture).
- Future intent/delivery audit semantics are documented in `docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md` (job_events remains non-authoritative for provider truth; provider callback updates must be trusted/server-side and account-scoped).
- Future provider/Twilio readiness planning contract is documented in `docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md` (Twilio-likely direction, provider-neutral internal model lock, sender/registration readiness, and callback/signature-validation planning boundaries).
- Future sender identity/provider configuration model lock is documented in `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md` (two-table model, no-secret DB rule, sandbox/production semantics, account-scope RLS/mutation boundaries, and E2 relationship posture).
- Future Settings -> Communications readiness UI model lock is documented in `docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md` (admin-only route posture, read-only first implementation, browser-safe rendering, status mapping, and no-go controls).
- Future On-The-Way template governance model lock is documented in `docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md` (admin-only governance posture, two-table model using `sms_message_templates` + `sms_message_template_versions`, immutable approved wording versions, token allowlist, and sample-preview-only posture).
- Future On-The-Way template editing/review action model lock is documented in `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md` (validation helper contract, admin-only create/save draft action posture, review sequencing, immutable approved versions, and non-sending approval boundary).
- Slice F2B implementation closeout is complete in commit `f093bdd` with migration `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql` adding `sms_provider_configurations` and `sms_sender_identities` as account-scoped provider-readiness/sender-identity metadata foundations.
- Slice E2 implementation closeout is complete in commit `b90c9ea` with migration `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql` adding `sms_message_intents` and `sms_provider_deliveries` as account-scoped audit foundations.
- Slice F4B implementation closeout is complete in commit `b676736` with migration `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql` adding `sms_message_templates` and `sms_message_template_versions` as account-scoped template-governance foundations.
- Slice F4C-A implementation closeout is complete in commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a` adding `lib/communications/sms-template-governance-read.ts` and `lib/communications/__tests__/sms-template-governance-read.test.ts`.
- Slice F4C-B implementation closeout is complete in commit `05475929cc69704b1fb22f3dabbde10ff83aed90` adding read-only `On-The-Way Template Governance` section on `/ops/admin/communications` (`app/ops/admin/communications/page.tsx`), and stabilization commit `1ffa475e2167eeb60a206358a4e7032a407bdd0f` added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions.
- Slice F4D-A docs/model closeout locks future template editing/review semantics only; no server actions, editable UI, schema changes, provider calls, send endpoint, webhook, activation, or SMS sends are implemented by this slice.
- Slice F4D-B implementation closeout is complete in commit `418172e` adding validation helper `lib/communications/sms-template-governance-validation.ts` and tests `lib/communications/__tests__/sms-template-governance-validation.test.ts`.
- Slice F4D-C implementation closeout is complete in commit `f7cf8c0` adding admin-only create/save draft actions `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm` in `lib/actions/sms-template-actions.ts` with tests in `lib/actions/__tests__/sms-template-actions.test.ts`.
- Slice F4D-D implementation closeout is complete in commit `f5995d7` adding admin-only review actions `submitOnTheWayTemplateVersionForReviewFromForm`, `approveOnTheWayTemplateVersionForSandboxFromForm`, and `rejectOnTheWayTemplateVersionFromForm` in `lib/actions/sms-template-actions.ts` with expanded tests in `lib/actions/__tests__/sms-template-actions.test.ts`.
- Slice F4D-E1 implementation closeout is complete in commit `1b8b671` adding create/save draft UI wiring in `app/ops/admin/communications/page.tsx` (with server-action compatibility touch in `lib/actions/sms-template-actions.ts`).
- Slice F4D-E2 implementation closeout is complete in commit `fededec` adding safe version IDs and admin readiness fields in `lib/communications/sms-template-governance-read.ts` with tests in `lib/communications/__tests__/sms-template-governance-read.test.ts`.
- Slice F4D-E3A implementation closeout is complete in commit `8cfa814` adding combined admin readiness action `markOnTheWayTemplateReadyForSandboxFromForm` in `lib/actions/sms-template-actions.ts` with tests in `lib/actions/__tests__/sms-template-actions.test.ts`. The action supports the simplified V1 admin-owned workflow, accepts latest draft or latest pending_review versions, validates to sandbox-approval standard, sets sandbox readiness only (version_status = approved_for_sandbox, internal_review_status = approved, sandbox_version_id only), does not set current_version_id or activate, does not enable SMS, does not call provider/Twilio/webhook, uses pointer-failure rollback posture, and all tests passed. Visible mark-ready UI wiring is complete in F4D-E3B; review/reject UI remains parked unless team-review workflow reopened.
- Slice F4D-E3B implementation closeout is complete in commit `c998d0e` adding visible `Mark wording ready for sandbox` UI to the existing `On-The-Way Template Governance` section in `app/ops/admin/communications/page.tsx`. The button appears only when the latest wording is eligible, the form posts only `version_id`, the UI uses `markOnTheWayTemplateReadyForSandboxFromForm`, queue-shaped submit/review/reject UI remains parked unless intentionally reopened, and the copy stays readiness/testing oriented rather than activation oriented. Browser smoke recorded `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, and browser-safe rendering confirmed; targeted validation passed (`94/94`), TypeScript passed, `git diff --check` passed, and working tree was clean.
- Authority boundary remains locked after E2: `sms_message_intents` is send-request/decision audit context only, `sms_provider_deliveries` is provider submission/callback truth only, `job_events` remains non-authoritative for provider truth, and manual contact logs remain separate.
- Authority boundary remains locked after F4B: safer two-table template governance model is implemented (`sms_message_templates` container/current pointer + `sms_message_template_versions` durable wording/version record), single-table `sms_templates` remains rejected, template rows remain account-scoped with RLS enabled and SELECT-only policy posture for authenticated active internal users in the same account, no authenticated insert/update/delete policies were added in V1, future writes remain deferred to admin-only server actions, E2 tables were not altered, and real SMS remains deferred.
- Authority boundary remains locked after F4C-A: template governance read helper is account-scoped by `account_owner_user_id`, reads only `sms_message_templates` and `sms_message_template_versions`, returns browser-safe readiness/status output only, keeps SMS disabled/live sends disabled always, does not return `canSend`, does not read customer/job/contact data, does not read `sms_message_intents` or `sms_provider_deliveries`, and does not call provider/Twilio APIs.
- Authority boundary remains locked after F4C-B: UI remains read-only and non-sending, no send/test/sandbox/activation/edit/provider controls were added, no provider secrets/raw refs/full phone/customer/job data are exposed, no E2/provider write paths were added, and browser smoke passed after stabilization.
- Authority boundary remains locked after F4D-A: future template edits are account/admin settings truth, not job timeline truth; `job_events` must not record template governance transitions; template approval/readiness does not enable sends or provider delivery truth; future writes require admin role validation, account-scoped lookup, and server-side validation before admin-client writes.
- Authority boundary remains locked after F4D-B: helper is pure validation logic only, with no Supabase/database/provider dependencies, no UI/server-action behavior, no send enablement, no `canSend`, no SMS-enabled flags, and no provider delivery or timeline truth writes; review-request SMS remains parked as a separate future message class rather than mixed into On-The-Way operational wording.
- Authority boundary remains locked after F4D-C: create/save actions remain admin-only account-scoped template-governance writes only, persist validation metadata, never set `current_version_id`/`sandbox_version_id`, and do not add provider/send/webhook behavior.
- Authority boundary remains locked after F4D-D: submit/approve-for-sandbox/reject review actions remain admin-only and account-scoped, use validation gates, set `sandbox_version_id` only on approve-for-sandbox, keep `current_version_id` untouched, and do not add activation/provider/send/webhook behavior; template approval/readiness still does not enable SMS sending.
- Authority boundary remains locked after F4D-E1: create/save draft UI wiring remains non-sending and limited to create/save actions; review/activation/provider/send/webhook controls remain absent; required non-live copy remains explicit; initial `template_create_failed` was runtime-target mismatch and not a template-governance code defect.
- Authority boundary remains locked after F4D-E2: safe version IDs and admin readiness fields are exposed for future UI planning only; read model remains non-sending; no `canSend` is returned; no account owner ids, raw user ids, provider refs, customer-job data, or raw JSON dumps are exposed; no UI/route/schema/migration/Supabase production/provider/send/env/payment/QBO/portal/automation behavior changes; template readiness does not enable SMS.
- Authority boundary remains locked after F4D-E3B: visible admin readiness UI exists only in admin Communications settings, posts only `version_id`, remains non-sending, does not create `sms_message_intents` or `sms_provider_deliveries`, does not write `job_events`, does not expose provider refs/secrets/full phone/customer-job data/account owner ids/raw JSON, and does not change provider/send/webhook/activation behavior.
- Authority boundary remains locked after F5A: Mark On The Way remains lifecycle/status truth first, future On-The-Way SMS intent creation must anchor to a successful `on_my_way` `job_events` row second, `sms_message_intents` becomes the first SMS decision/audit truth third, and `sms_provider_deliveries` remains later provider submission/callback truth only.
- F5A implementation constraint is explicit: current `insertJobEvent` does not return inserted event id and the current `on_my_way` breadcrumb write is best-effort after the `jobs.status` update, so future F5B/F5C work must explicitly solve event-id anchoring without introducing provider work into synchronous Mark On The Way.
- Authority boundary remains locked after F5B: implementation commit `9814340` added `lib/communications/sms-on-the-way-intent-eligibility.ts` plus tests as a read-only/non-sending helper only; it composes existing recipient, eligibility, template-governance, and provider-readiness helpers, adds F5B-specific job and durable `on_my_way` anchor checks, separates structural blocks from deferred live-send warnings, returns `liveSendEnabled` false, and does not return `canSend`.
- F5B did not write `sms_message_intents`, did not write `sms_provider_deliveries`, did not change Mark On The Way behavior, and did not introduce provider send/webhook/activation work; Mark On The Way still does not send SMS and real SMS remains deferred.
- Authority boundary remains locked after F5C-A model lock: F5C writes non-sending `sms_message_intents` only and never writes `sms_provider_deliveries`; no provider/Twilio send/webhook/activation behavior is introduced.
- F5C-A requires write-skipped/no-insert when required intent fields cannot be populated from truth (recipient/template/version/body snapshot); fake values are prohibited.
- F5C-A locks skipped policy: non-target events are no-insert/no-op and are not forced into blocked.
- F5C-A locks event-anchor preference: explicit event-id handoff from successful `on_my_way` insert is preferred; query-latest remains fallback-only.
- F5C sequence is now explicit: F5C-B helper only, F5C-C event-id handoff support, F5C-D Mark On The Way best-effort integration.
- F6A provider/Twilio sandbox send model lock is complete in docs/model-only mode: first sandbox send must be manual/admin-only, consume existing `sms_message_intents` only, require `decision_outcome = ready_for_provider`, and must not be triggered from Mark On The Way.
- F6A provider-delivery boundary is locked: future sandbox submit creates `sms_provider_deliveries` before the provider call with `provider_status = not_submitted`; Twilio `MessageSid` later maps to `provider_message_id`; provider failures remain provider-delivery truth and must not roll back job status or create job timeline delivery claims.
- F6A keeps Twilio secrets and raw provider refs server-only and keeps live SMS blocked until webhook/signature validation, status callback, inbound/opt-out or Advanced Opt-Out handling, STOP/HELP readiness, legal/provider review, and explicit activation are complete.
- F6B provider-delivery preflight is complete in implementation commit `f1214ae`: it can create one same-account `sms_provider_deliveries` row with `provider_name = twilio` and `provider_status = not_submitted` for an eligible ready On-The-Way intent, but it does not call Twilio/provider, set `provider_message_id`, set `submitted_at`, mark sent/delivered/failed, mutate jobs/job_events/intents, or return `canSend`.
- F6C-A manual sandbox send model lock is complete in docs/model-only mode: future first sandbox send must consume an existing `sms_provider_deliveries` row with `provider_status = not_submitted`, be manual/admin-only, never be triggered by Mark On The Way, never live on job pages, and stay blocked until server-only sandbox/provider/sender/test-recipient gates pass.
- F6C-A provider-delivery reservation boundary is locked: future action accepts only `delivery_id`, resolves all account/delivery/intent/recipient/template/provider/sender scope server-side, uses a guarded update from `not_submitted` to `submitted` as the tightly controlled sandbox reservation, never sets `sent` or `delivered` without callback truth, and never creates job timeline delivery claims.
- F6C-A acknowledges the current schema has no true in-flight status; using `submitted` as reservation state is acceptable only for controlled manual sandbox smoke, and a stronger retry/in-flight model remains parked unless explicitly chosen.
- F6C-A keeps missing webhook acceptable only for manual sandbox smoke; live send remains blocked until callback/signature validation, inbound opt-out or Advanced Opt-Out handling, idempotency, duplicate/out-of-order handling, payload retention, legal/provider/A2P/STOP/HELP review, and explicit activation are complete.
- F6C-C1 manual sandbox send gate + resolver model lock is complete in docs/model-only mode; manual sandbox send, Twilio/provider calls, and dry-run/reservation implementation remain deferred in this slice.
- F6C-C1 locks deterministic server-only sandbox send gate requirement before F6C-C2/F6C-C3 and preserves fail-closed behavior when gate is missing/disabled.
- F6C-C1 prefers explicit `sms_provider_configurations` gate field for future schema-backed gate (for example `sandbox_send_enabled`), with alternative account-level gate accepted only if deterministic/server-only; no schema work occurs in F6C-C1.
- F6C-C1 locks resolver disambiguation to account + `provider_name = twilio` + `provider_environment = sandbox`; account-only provider config lookup is not acceptable for sandbox readiness.
- F6C-C1 locks first sandbox send to verified sandbox/test recipients and conservative fail-closed posture until test-recipient policy is modeled.
- F6C-C1 locks F6C-C2 as dry-run/manual reservation readiness action only (no Twilio call) and keeps F6C-C3 real manual sandbox send deferred until explicit Twilio sandbox/env/test-recipient setup approval.
- F6C-C1 keeps webhook/status callback deferred for manual sandbox smoke only and still required before live SMS.
- SMS On-The-Way V1 workflow simplification remains locked: Mark On The Way is the user-facing operational trigger, future SMS is a background operational/customer-care notification after that lifecycle event, admin owns the V1 wording, field users do not write custom SMS wording, and visible V1 UI should avoid multi-person approval/rejection workflow unless that product path is intentionally reopened.
- Template governance remains admin/settings governance, not job timeline truth; `job_events` and manual contact logs are not provider delivery truth, and `sms_message_intents.message_body_snapshot` remains the future audit record of attempted SMS wording.
- E2 did not add live SMS, send endpoint, webhook, provider integration, or provider delivery write path; real SMS remains deferred pending activation gates.
