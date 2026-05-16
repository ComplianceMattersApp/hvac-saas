# Compliance Matters - SMS Compliance and Consent Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-14

---

## 1) Purpose

This document defines the product-control contract that must be satisfied before any provider-powered SMS is implemented or activated.

This is not legal advice. It is a product readiness, compliance-risk, and operational control specification.

---

## 2) Current Locked Boundary

Current in-product text behavior is limited to:
- manual contact-attempt logging
- device-intent sms links (opens native SMS app)

Current truth constraints:
- no provider-powered SMS is live
- no platform delivery confirmation exists
- manual text logs are not delivery truth
- customer_attempt events remain communication-attempt history only

Reference closeouts:
- manual wording implementation: commit 36460b8
- docs closeout: commit 4c03c0c
- Slice A foundation implementation: commits `afddb9c`, `02aee5a`; migration `supabase/migrations/20260515120000_contact_recipients_slice_a_foundation.sql`
- Slice B1 consent + suppression foundation implementation: commit `39a2963`; migration `supabase/migrations/20260515123000_contact_recipient_consent_suppression_foundation.sql`
- Slice B1 added tables: `contact_recipient_consents`, `contact_recipient_suppressions`
- Slice B1 locked posture: consent defaults to `unknown`; missing/unknown consent remains fail-closed; active suppression is the future hard-stop override over consent
- Slice B1 local validation: `supabase start -x studio`, `supabase db reset --local`, local reset applied Slice A and Slice B1 migrations, `npx.cmd tsc --noEmit`, `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts`, `git diff --check`
- local caveat: Studio port `54323` was held by VS Code, so Studio was excluded via `-x studio` for local validation only
- no remote/sandbox/production migration apply and no production writes
- no SMS intent/provider delivery tables, no send endpoint/webhook, no Twilio/provider code, no live SMS, no backfill
- Slice B2 non-sending eligibility inputs helper implementation: commit `c0247af`
- Slice B2 files added: `lib/communications/sms-eligibility-inputs-read.ts`, `lib/communications/__tests__/sms-eligibility-inputs-read.test.ts`
- Slice B2 read boundary: helper reads only `contact_recipients`, `contact_recipient_consents`, `contact_recipient_suppressions`; it does not read `jobs`, `customers`, `locations`, or `job_events`
- Slice B2 output boundary: non-sending input state only (`nonSendingStatus`, `blockedReasons`), no `canSend` output
- Slice B2 locked posture: `eligible_inputs_present` does not imply live-send approval; missing/unknown consent remains fail-closed; active suppression blocks regardless of consent and is surfaced before consent blocks
- Slice B2 validation: `npx.cmd vitest run lib/communications/__tests__/sms-eligibility-inputs-read.test.ts` passed (`16/16`), `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed (`4/4`), `npx.cmd tsc --noEmit` passed, `git diff --check` passed
- Slice C docs/model closeout: `docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md` records no job-detail preview card for V1, no field free-text editor, admin-only future template governance, background/event-driven future On-The-Way evaluation after lifecycle transition, and gate/failure control contracts. No code/schema/migration/Supabase/provider behavior changed.
- Slice D docs/model closeout: `docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md` records Settings -> Communications as the future home for messaging governance, with Company Profile boundary separation, future section IA, visibility constraints, and activation-gate ownership posture. No code/schema/migration/Supabase/provider behavior changed.
- Slice E1 docs/model closeout: `docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md` records the frozen intent/delivery model semantics, including V1 cardinality, retry posture, idempotency shape, callback write path, and RLS expectations. No code/schema/migration/Supabase/provider behavior changed.
- Slice E2 migration closeout: commit `b90c9ea`; migration `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql`; created `sms_message_intents` and `sms_provider_deliveries` as account-scoped audit foundations.
- Slice E2 locked posture: `sms_message_intents` is send-request/decision audit context (not provider delivery truth); `sms_provider_deliveries` is provider submission/callback truth (not manual contact log); one current delivery row per intent; account-scoped intent idempotency foundation exists.
- Slice E2 validation: `npx.cmd tsc --noEmit`, B2 helper tests (`16/16`), recipient helper tests (`4/4`), `git diff --check`, and `supabase db reset --local --no-seed --yes` all passed with full local migration chain including E2.
- Slice E2 boundary confirmation: no provider delivery write path, no send endpoint/webhook/provider integration/live SMS behavior, no `job_events` provider summary behavior, no backfill, no production migration apply, and no production writes.
- Slice F1 docs/model closeout: `docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md` captures Twilio-likely provider readiness requirements while preserving provider-neutral internal model lock and no-implementation boundaries.
- Slice F2A docs/model closeout: `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md` locks sender identity + provider configuration semantics (two-table model, no-secret DB rule, status model, sandbox/production semantics, and account-scope mutation boundaries) before migration.
- Slice F2B migration closeout: commit `f093bdd`; migration `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`; created `sms_provider_configurations` and `sms_sender_identities` as account-scoped provider-readiness/sender-identity metadata foundations with SELECT-only RLS in V1 and no authenticated write policies.
- Slice F2B validation: `npx.cmd tsc --noEmit`, B2 helper tests (`16/16`), recipient helper tests (`4/4`), `git diff --check`, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F2B.
- Slice F2B boundary confirmation: no app code/UI changes, no E2 table changes, no send endpoint/webhook/provider integration/sandbox-live SMS behavior, no env/secret/feature-flag changes, no production migration apply, and no production writes.
- Slice F3A docs/model closeout: `docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md` locks admin-only/read-only Settings -> Communications readiness UI posture, route decision (`/ops/admin/communications`), browser-safe/no-secret rendering posture, status mapping contract, and no-go UI controls before any helper/route implementation.
- Slice F4B migration closeout: commit `b676736`; migration `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`; created `sms_message_templates` and `sms_message_template_versions` as account-scoped template governance schema foundation.
- Slice F4B locked posture: safer two-table model is implemented; `sms_message_templates` is account-scoped template container/current pointer, `sms_message_template_versions` is durable governed wording/version record; single-table `sms_templates` remains rejected; RLS enabled with SELECT-only policy posture for authenticated active internal users in the same account; no authenticated insert/update/delete policies in V1; writes remain deferred to future admin-only server actions.
- Slice F4B validation: `npx.cmd tsc --noEmit`, provider readiness helper tests (`16/16`), SMS eligibility helper tests (`16/16`), recipient helper tests (`4/4`), `git diff --check`, and `supabase db reset --local --no-seed --yes` all passed with full local migration chain including F4B.
- Slice F4B boundary confirmation: no template editing/preview/render/send behavior, no E2 table alteration, no provider setup/Twilio behavior, no production migration apply, and no production writes.
- Slice F4C-A read-model closeout: commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`; helper `lib/communications/sms-template-governance-read.ts`; tests `lib/communications/__tests__/sms-template-governance-read.test.ts`; API `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`.
- Slice F4C-A locked posture: helper reads only `sms_message_templates` and `sms_message_template_versions`, is account-scoped by `account_owner_user_id`, returns safe-empty output for missing scope/no template rows, and returns browser-safe readiness/status output only with SMS disabled/live sends disabled always and no `canSend`.
- Slice F4C-A boundary confirmation: no provider/Twilio calls, no customer/job/contact reads, no `sms_message_intents`/`sms_provider_deliveries` reads, no UI/route/schema/migration/Supabase/send behavior changes, no production writes; approval readiness remains distinct from send readiness and real SMS remains deferred.
- Slice F4C-A validation: template governance tests (`15/15`), provider readiness helper tests (`16/16`), SMS eligibility helper tests (`16/16`), recipient helper tests (`4/4`), `npx.cmd tsc --noEmit`, and `git diff --check` all passed.
- Slice F4C-B read-only UI closeout: implementation commit `05475929cc69704b1fb22f3dabbde10ff83aed90` added `On-The-Way Template Governance` section on `/ops/admin/communications` in `app/ops/admin/communications/page.tsx`; section is admin-only/read-only/status-sample-preview only and includes required non-sending copy with no send/test/sandbox/activation/edit/provider controls.
- Slice F4C-B stabilization closeout: commit `1ffa475e2167eeb60a206358a4e7032a407bdd0f` added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions so missing local SMS tables degrade to safe-empty readiness state instead of page crash.
- Slice F4C-B validation: template governance tests (`15/15`), provider readiness helper tests (`16/16`), SMS eligibility helper tests (`16/16`), recipient helper tests (`4/4`), `npx.cmd tsc --noEmit`, `git diff --check`, and browser smoke after stabilization all passed.
- Slice F4C-B boundary confirmation: no send endpoint, webhook, provider/Twilio integration, sandbox/live SMS activation, or compliance gate bypass behavior changed; real SMS remains deferred.
- Slice F4D-A docs/model closeout: `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md` locks future admin template editing/review action semantics before any mutation path exists.
- Slice F4D-A compliance boundary: template approval/readiness does not enable sending; future validation must block unknown tokens, missing STOP language, and prohibited promotional wording before submit/review/sandbox approval; provider/legal approval and activation remain deferred.
- Slice F4D-A write boundary: future writes stay admin-only, account-scoped, and server-side after role validation; normal authenticated template INSERT/UPDATE/DELETE policies remain absent, and `job_events` is not used for template governance.
- Slice F4D-B implementation closeout: commit `418172e`; helper `lib/communications/sms-template-governance-validation.ts`; tests `lib/communications/__tests__/sms-template-governance-validation.test.ts`; API `validateOnTheWayTemplateBody(bodyTemplate: string)`.
- Slice F4D-B compliance boundary: helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags; it blocks blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments before submit/sandbox approval.
- Slice F4D-B warning posture: multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content warn while non-blank drafts may still be saved.
- Slice F4D-B marketing boundary: review-request SMS remains a future separate message class and is prohibited inside On-The-Way operational template wording.
- Slice F4D-B validation: template validation helper tests (`19/19`), template governance read tests (`15/15`), provider readiness helper tests (`16/16`), SMS eligibility helper tests (`16/16`), recipient helper tests (`4/4`), `npx.cmd tsc --noEmit`, and `git diff --check` all passed.
- Slice F4D-B boundary confirmation: no send endpoint, webhook, provider/Twilio integration, sandbox/live SMS enablement, UI/server-action behavior, or compliance gate bypass behavior changed; real SMS remains deferred.
- Slice F4D-E1 implementation closeout: commit `1b8b671`; page `app/ops/admin/communications/page.tsx`; server-action compatibility touched in `lib/actions/sms-template-actions.ts`.
- Slice F4D-E1 boundary: UI wires only create/save draft actions and remains non-sending; submit/review/approve/reject/activation/provider/send/webhook controls are not wired in this slice.
- Slice F4D-E1 copy posture: UI continues to show `SMS is not enabled`, `Live sends are disabled`, `Template approval does not enable sending`, `Sample preview only`, `Mark On The Way does not send SMS`, and legal/provider review reminder.
- Slice F4D-E1 smoke/validation posture: browser smoke passed with `draft_created` and `draft_saved` after local runtime target alignment; initial `template_create_failed` was runtime-target mismatch (not code defect); post-smoke validation matrix remained green.
- Slice F4D-E2 implementation closeout: commit `fededec`; read-model file `lib/communications/sms-template-governance-read.ts`; test file `lib/communications/__tests__/sms-template-governance-read.test.ts`.
- Slice F4D-E2 boundary: read model exposes safe versionId, removes accountOwnerUserId, adds latest-version admin readiness fields (`canSaveDraft`, `canMarkReadyForSandbox`, `markReadyBlockingReasons`, `markReadyWarnings`), reuses validation for readiness calculations, keeps readiness latest-only, does not return `canSend`, does not expose account owner ids/raw user ids/provider refs/customer-job data/raw JSON dumps.
- Slice F4D-E2 validation/compliance posture: no UI/route/schema/migration/docs/Supabase production/provider/send/env/payment/QBO/portal/automation changes; no UI controls added; review/reject UI remains deferred unless team-review workflow reopened; template readiness does not enable SMS; real SMS remains deferred.
- Slice F4D-E3A implementation closeout: commit `8cfa814`; action file `lib/actions/sms-template-actions.ts`; new action `markOnTheWayTemplateReadyForSandboxFromForm`; admin-only, account-scoped, accepts only version_id; allows latest draft or latest pending_review to be marked ready for sandbox; validates to sandbox-approval standard; sets sandbox readiness only (version_status = approved_for_sandbox, internal_review_status = approved, sandbox_version_id only); does not set current_version_id, does not activate, does not enable SMS, does not call provider/Twilio/webhook; uses pointer-failure rollback posture; all tests passed (54/54 sms-template-actions, 19/19 validation, 21/21 read-model, etc.); visible mark-ready UI wiring is complete in F4D-E3B; review/reject UI remains parked unless team-review workflow reopened.
- Slice F4D-E3B implementation closeout: commit `c998d0e`; page `app/ops/admin/communications/page.tsx`; existing `On-The-Way Template Governance` section now shows visible `Mark wording ready for sandbox` UI when latest wording is eligible; the form posts only `version_id` and uses `markOnTheWayTemplateReadyForSandboxFromForm`; visible V1 UI avoids queue-shaped submit/review/reject workflow and keeps readiness/testing language instead of activation language.
- Slice F4D-E3B smoke/validation posture: browser smoke passed with `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, and browser-safe rendering confirmed; targeted tests `94/94`, `npx.cmd tsc --noEmit`, `git diff --check`, and clean working tree all passed.
- Slice F4D-E3B compliance boundary: template readiness does not enable SMS, sandbox readiness does not send SMS, Mark On The Way still does not send SMS, provider/Twilio sandbox setup/send endpoint/webhook/activation remain deferred, and real SMS remains deferred.
- Slice F5A docs/model closeout: future On-The-Way SMS intent creation must anchor to a successful `on_my_way` `job_events` row; `sms_message_intents` becomes the first SMS decision/audit truth after that lifecycle breadcrumb; `sms_provider_deliveries` remains later provider submission/callback truth.
- Slice F5A implementation constraint: current `insertJobEvent` does not return inserted event id and the current `on_my_way` breadcrumb write is best-effort after the job status update, so future F5B/F5C work must explicitly solve event-id anchoring without introducing provider work into synchronous Mark On The Way.
- Slice F5A failure/compliance posture: recipient truth remains `contact_recipients`; no durable `on_my_way` event means fail closed and no intent; blocked/skipped/failed intent outcomes belong in `sms_message_intents`; no job status rollback is allowed; real SMS remains deferred.
- Slice F5B implementation closeout: commit `9814340`; files `lib/communications/sms-on-the-way-intent-eligibility.ts` and `lib/communications/__tests__/sms-on-the-way-intent-eligibility.test.ts`; helper API `evaluateOnTheWayIntentEligibility(params): Promise<OnTheWayIntentEligibilityResult>`.
- Slice F5B compliance posture: helper is read-only/non-sending, validates durable `on_my_way` anchor readiness, composes existing recipient/eligibility/template-governance/provider-readiness helpers, separates structural `blockedReasons` from deferred live-send `warnings`, returns `liveSendEnabled` false, and does not return `canSend`.
- Slice F5B preserves boundaries: no `sms_message_intents` rows written yet, no `sms_provider_deliveries` rows written, no job status rollback, no Mark On The Way behavior change, Mark On The Way still does not send SMS, and real SMS remains deferred.
- Slice F5C-A model lock: F5C creates non-sending `sms_message_intents` only; no provider/Twilio calls, no `sms_provider_deliveries` rows, and no SMS sends.
- Slice F5C-A write policy: write rows only when required schema fields can be populated from truth (durable `on_my_way` event, recipient truth, governed template/version/body snapshot); otherwise return write-skipped/no-insert without fake data.
- Slice F5C-A outcome policy: `ready` maps to `ready_for_provider`; `blocked` maps to `blocked` only when required fields exist; non-target/skipped events are no-insert/no-op in F5C-A.
- Slice F5C-A idempotency lock: `${accountOwnerUserId}:${jobEventId}:on_the_way:${contactRecipientId}`; idempotency conflicts are deduped success.
- Slice F5C-A failure posture: intent creation remains best-effort and must not roll back job status or job event; Mark On The Way still does not send SMS; real SMS remains deferred.
- Forward sequence lock: F5C-B helper only, F5C-C event-id handoff support, F5C-D best-effort Mark On The Way integration, later provider send/webhook/activation deferred.
- Slice F6A provider/Twilio sandbox send model lock is complete in docs/model-only mode.
- F6A compliance posture: first sandbox send must be manual/admin-only, consume existing `sms_message_intents` only, require `decision_outcome = ready_for_provider`, and must not be triggered by Mark On The Way.
- F6A gate posture: sandbox send remains blocked unless same-account intent, On-The-Way message class, no existing delivery row, durable event anchor, required snapshots, sandbox template match, active recipient, opted-in consent, no suppression, sandbox provider configuration, verified/active sandbox sender identity, Messaging Service ref, server-only sandbox enablement, and STOP/HELP readiness are satisfied or explicitly bounded for verified sandbox/test recipients.
- F6A provider posture: `sms_provider_deliveries` should be created before the provider call with `provider_status = not_submitted`; Twilio `MessageSid` later maps to `provider_message_id`; failures remain provider-delivery truth and must not roll back jobs or create job timeline delivery claims.
- F6A live-send posture: live send remains blocked until request signature validation, status callback route, inbound/opt-out or confirmed Advanced Opt-Out handling, callback idempotency, duplicate/out-of-order handling, safe payload retention, legal/provider review, and explicit activation exist.
- Slice F6C-A manual sandbox send model lock is complete in docs/model-only mode.
- F6C-A compliance posture: first sandbox send still must be manual/admin-only, consume an existing `sms_provider_deliveries` row with `provider_status = not_submitted`, never be triggered by Mark On The Way, and never live on job pages.
- F6C-A gate posture: future manual sandbox submit remains blocked unless admin actor, same-account delivery, `provider_name = twilio`, no provider message id, linked same-account ready On-The-Way intent, durable event anchor, required snapshots, current active opted-in unsuppressed recipient, sandbox template match, sandbox provider config, verified/active sandbox sender identity, Messaging Service ref, server-only sandbox gate, and verified sandbox/test recipient gates all pass.
- F6C-A quiet-hours posture: quiet-hours must not block lifecycle behavior; manual sandbox sends should stay verified-test-recipient-only or fail closed until quiet-hours exists.
- F6C-A provider posture: immediately before any future provider call, reserve with a guarded update from `not_submitted` to `submitted`; never set `sent` or `delivered` without callback truth; provider errors remain provider-delivery truth and must not roll back jobs or create job timeline delivery claims.
- F6C-A live-send posture: missing webhook is acceptable only for tightly controlled manual sandbox smoke, not live; live send remains blocked until callback/signature validation, inbound opt-out or Advanced Opt-Out handling, idempotency, duplicate/out-of-order handling, payload retention, legal/provider/A2P/STOP/HELP review, and explicit activation are complete.
- Slice F6C-C1 model lock is complete in docs/model-only mode: manual sandbox send, Twilio/provider calls, and dry-run/reservation action remain deferred until gate/refinement decisions are locked.
- F6C-C1 gate lock: deterministic server-only sandbox send gate is required before F6C-C2/F6C-C3; fail-closed behavior on missing/disabled gate remains required and must not be bypassed.
- F6C-C1 preferred future gate model is explicit `sms_provider_configurations` boolean gate field (for example `sandbox_send_enabled`), with alternative account-level gate surface allowed only if deterministic/server-only; no schema work occurs in F6C-C1.
- F6C-C1 resolver disambiguation lock: readiness lookup must be account + provider_name + provider_environment (`twilio` + `sandbox`) and must not use ambiguous account-only provider selection.
- F6C-C1 test-recipient lock: first manual sandbox send remains verified sandbox/test-recipient only; conservative posture is fail closed for real sandbox send until policy is modeled.
- F6C-C1 quiet-hours lock: quiet-hours remains deferred only for verified test recipients; otherwise sandbox send fails closed.
- F6C-C1 notice-code category lock for future actions includes provider-not-ready, gate-missing-or-disabled, test-recipient-required, delivery-missing/not-ready/already-submitted/reserved, provider-submit-attempted, provider-immediate-failure, and internal-error categories.
- F6C-C1 crash/reconciliation lock: absence of true in-flight status remains known risk; `submitted` reservation remains sandbox-only controlled posture; reconciliation/retry remains later work unless schema change is explicitly chosen first.
- F6C-C1 sequence lock: F6C-C2 dry-run/manual reservation action only (no Twilio call), then F6C-C3 real manual sandbox send only after explicit Twilio sandbox/env/test-recipient setup approval, then F6D callback/webhook readiness before live SMS.
- Slice F6C-C2 closeout is complete in implementation commit `8d6043e` with `lib/actions/sms-sandbox-send-actions.ts` and `lib/actions/__tests__/sms-sandbox-send-actions.test.ts`.
- F6C-C2 action API is `reserveSmsSandboxDeliveryDryRunFromForm(formData: FormData): Promise<void>` and is admin-only.
- F6C-C2 accepts only `delivery_id`, derives account scope from authenticated internal user context, and re-checks delivery/intent/provider-readiness server-side.
- F6C-C2 remains evaluation-only/dry-run and does not mutate `sms_provider_deliveries`.
- F6C-C2 does not set `submitted_at`, does not set `provider_message_id`, and does not change provider status.
- F6C-C2 does not call Twilio/provider, does not send SMS, and does not attempt provider submit.
- F6C-C2 does not mutate `jobs` or `job_events`.
- F6C-C2 keeps fail-closed notice posture, including explicit gate mapping for `sandbox_send_gate_missing_or_disabled` and current expected end-state `sandbox_test_recipient_required` until verified sandbox test-recipient policy is modeled.
- Slice F6C-C3A model lock is complete in docs/model-only mode: real sandbox send, Twilio/provider calls, and live send all remain deferred.
- F6C-C3A verified test-recipient gate lock: first real sandbox send is test-recipient-limited only; current `sandbox_test_recipient_required` blocker remains correct until modeled; client cannot self-mark approval.
- F6C-C3A test-recipient approvals must be account-scoped/admin-controlled and should verify same account, recipient linkage to intent/delivery, snapshot-phone match to approved record (or approved admin-only test value), active recipient state, and acceptable consent/suppression posture.
- F6C-C3A allows quiet-hours deferral only for verified sandbox/test recipients; otherwise sandbox send must fail closed.
- F6C-C3A preferred future test-recipient model is account-scoped `sms_sandbox_test_recipients` (or equivalent account setting) with normalized phone (or safe hash), display label, active flag, verification actor/time, and timestamps; no customer/job dependency; no live-send approval implied.
- F6C-C3A send-gate lock: account-scoped/server-only/admin-controlled gate remains required; preferred model remains explicit `sms_provider_configurations` field (for example `sandbox_send_enabled`) or intentionally chosen account-level gate; gate is manual-sandbox-only and cannot enable live SMS.
- F6C-C3A resolver disambiguation lock remains required: account + `provider_name = twilio` + `provider_environment = sandbox`; production config must never satisfy sandbox readiness.
- F6C-C3A sequence lock: C3A docs/model lock, C3B gate schema/model implementation if approved, C3C resolver update, C3D dry-run update to pass with configured gates, C4 real manual sandbox send only after explicit Twilio sandbox/env/test-recipient approval, F6D callback/webhook before live, and live send only after legal/provider/A2P/STOP/HELP/activation approval.
- F6C-C3A no-go boundaries remain: no job-page send button, no Mark On The Way trigger, no SMS enabled language, no delivered claims without callback truth, no browser credentials, and no `NEXT_PUBLIC_*` secrets.
- Mark On The Way still does not send SMS; real SMS remains deferred.
- SMS On-The-Way V1 simplification: Mark On The Way is the operational trigger; future SMS is a background operational/customer-care notification after that lifecycle event; admin owns the wording in V1; field users do not write custom SMS; visible V1 UI should not become a multi-person approval/rejection queue unless explicitly reopened.
- V1 compliance posture: the sample On-The-Way wording remains operational only (`Reply STOP to opt out` required); review-request SMS is a separate future message class; template readiness and sandbox readiness do not enable sending.
- Quiet-hours scope lock: quiet-hours/timezone remains future conservative fail-closed SMS pre-send gate planning only; it must not block Mark On The Way or job lifecycle/status transitions.

---

## 3) Message Classification Model (Future SMS)

Any future live SMS must be classified before send.

Allowed classification families:
1. operational or transactional
2. appointment reminder
3. on-the-way
4. follow-up or no-answer
5. completion or invoice-ready notice (non-payment-execution wording only)
6. marketing or promotional (parked unless separately approved)

Locked classification rule:
- If content includes promotional, upsell, discount, review-incentive, referral, offer language, or mixed commercial language, classify as marketing or promotional and require separate consent and review.

Implementation guardrail (future):
- classification must be explicit and durable for each template/send decision.
- unknown or mixed content must fail closed to non-send.

---

## 4) Consent Model Requirements (Future Live SMS)

Before any provider-powered SMS activation, the system must support:

1. Consent capture provenance
- who consented
- when consent was captured
- where consent was captured (surface/channel)
- exact consent language/version in effect
- message class scope covered by consent

2. Consent scope boundaries
- consent must be scoped to recipient identity and phone number
- consent scope must distinguish operational classes from marketing class
- consent must not be inferred from unrelated product actions

3. Revocation handling
- revocation must be accepted through defined reasonable channels
- revocation must update suppression state without manual ambiguity
- revocation must be audit-visible and enforceable before next send

4. Fail-safe behavior
- if consent evidence is missing, stale, out-of-scope, or ambiguous, do not send

---

## 5) Opt-Out and Do-Not-Text Requirements

Before activation, future SMS must include:
- deterministic stop handling and suppression updates
- explicit do-not-text suppression precedence over send intent
- prevention of accidental reactivation without explicit new consent
- audit history of suppression add/remove events, actor, and timestamp

No-go rule:
- no live SMS if stop or suppression cannot be enforced at send time.

---

## 6) Quiet Hours and Timezone Controls

Before activation, future SMS must support:
- recipient-local timezone resolution policy
- quiet-hours guardrails by message class
- deterministic behavior when timezone confidence is low

Workflow-scope lock:

- quiet-hours/timezone applies only to future SMS send eligibility
- quiet-hours/timezone is not a direct field workflow control in V1
- quiet-hours/timezone blocked-send outcomes must not block lifecycle/status transitions
- no quiet-hours settings UI is approved for V1 direct job workflows

No-go rule:
- no live SMS if quiet-hours controls are undefined or unenforced.

---

## 7) Content, Template, and Safety Controls

Before activation, future SMS must provide:
- template governance by message class
- prohibited-content checks for class mismatch
- safe wording for completion or invoice-ready notices that does not imply payment execution where none exists

Locked wording boundary:
- payment execution claims must remain aligned to actual product capability.

---

## 8) Delivery and Audit Trail Requirements

Before activation, future SMS must define a delivery-truth model including:
- outbound attempt identity
- provider response mapping
- delivery-state and failure-state recording
- retry/escalation policy
- immutable audit timestamps and actor/system traceability

Current boundary reminder:
- customer_attempt timeline events are not provider delivery truth.

---

## 9) Actor and Recipient Boundary Guardrails

The model must remain neutral and marketplace-ready.

Future SMS controls must preserve clear boundaries across:
- customers and responsible parties
- contractors
- internal users
- account owners
- future marketplace participants

No-go rule:
- no activation that mixes recipient classes or crosses account/tenant boundaries without explicit scoped controls.

---

## 10) Activation Gates (Required Before Any Live Send)

All of the following must be complete before activation:
1. message classification model finalized and enforced
2. consent capture/provenance model finalized and enforceable
3. opt-out/do-not-text suppression model finalized and enforceable
4. quiet-hours/timezone controls finalized and enforceable
5. provider registration/configuration readiness complete
6. delivery/failure audit model finalized and testable
7. legal and provider review complete
8. explicit activation decision approved

If any gate is incomplete, live provider-powered SMS remains deferred.

---

## 11) Explicit Non-Goals for This Slice

This planning slice does not perform:
- code changes
- behavior changes
- schema changes
- migrations
- Supabase commands
- production writes
- provider setup
- live SMS sends
- env/secret changes
- feature flag changes
- on-the-way automation
- payment/Stripe/QBO behavior changes
- portal expansion
- marketplace feature implementation

---

## 12) Related ACTIVE References

- docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md (recipient/contact role model — required before live SMS; see Section 10 activation gates)
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md (schema design contract; Slice A, Slice B1, and Slice B2 closeout recorded with migrations `supabase/migrations/20260515120000_contact_recipients_slice_a_foundation.sql` and `supabase/migrations/20260515123000_contact_recipient_consent_suppression_foundation.sql`, commits `afddb9c`, `02aee5a`, `39a2963`, `c0247af`)
- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md (Slice C docs/model workflow contract for future background On-The-Way evaluation, admin-only template governance, required pre-send gates, and fail-closed blocked-send behavior)
- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md (Slice D docs/model IA contract for Settings -> Communications ownership, section design, and activation-control posture)
- docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md (Slice E1 docs/model lock for intent/delivery audit semantics, callback path, and provider-neutral status design)
- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md (Slice F1 docs/model lock for provider readiness, sender strategy, A2P/registration checklist, callback/webhook readiness planning, and activation boundaries)
- docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md (Slice F2A docs/model lock for sender identity/provider configuration semantics, no-secret DB rule, and migration acceptance boundaries)
- docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md (Slice F3A docs/model lock for admin-only read-only Settings -> Communications readiness UI posture)
- docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md (Slice F4A docs/model lock for admin-only On-The-Way template governance, two-table template model, token allowlist, immutable approved wording versions, preview posture, and review-state separation)
- docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md (Slice F4D-A docs/model lock for admin template editing/review action semantics, validation helper contract, draft/review sequencing, and non-sending approval posture)
- docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md
- docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
