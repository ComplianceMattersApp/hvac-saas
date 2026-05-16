# Compliance Matters - SMS Background On-The-Way Workflow Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## Slice E2 Cross-Reference Closeout (2026-05-15)

SMS Slice E2 Message Intent + Provider Delivery Audit Foundation is complete in commit `b90c9ea` with migration `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql`.

Recorded boundary for this workflow spec:

- intent and provider-delivery audit schema foundation now exists (`sms_message_intents`, `sms_provider_deliveries`)
- this does not add On-The-Way automation
- this does not add send endpoint, webhook, provider integration, or live SMS behavior
- no `job_events` provider summary behavior was added
- real SMS remains deferred until quiet-hours/timezone, template governance, sender identity/provider readiness, sandbox validation, legal/provider review, and explicit activation approval are complete
- quiet-hours/timezone remains future SMS pre-send gate planning only and is not a direct field workflow blocker
- Slice F1 Provider/Twilio readiness planning closeout is documented in `docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md` and does not approve provider setup, send route, webhook, sandbox send, or live SMS
- Slice F2B provider configuration + sender identity schema foundation is complete in commit `f093bdd` via `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql` and does not approve send endpoint, webhook, sandbox/live SMS, or activation behavior
- Slice F2A sender identity/provider configuration model lock is documented in `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md` and does not approve provider setup, send route, webhook, sandbox send, live SMS, or activation behavior
- Slice F3A Settings Communications readiness UI model lock is documented in `docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md` and does not approve send controls, activation toggle, sandbox/live sends, provider setup, or template editing
- Slice F4A On-The-Way Template Governance model lock is documented in `docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md` and locks the two-table future template model (`sms_message_templates`, `sms_message_template_versions`) with immutable approved wording versions and no implementation changes in this slice
- Slice F4B Template Governance Schema Foundation is complete in commit `b676736` via `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`; `sms_message_templates` (account-scoped container/current pointer) and `sms_message_template_versions` (durable governed wording/version record) now exist with account-scoped RLS and SELECT-only policy posture for authenticated active internal users in the same account; no insert/update/delete policies were added in V1
- F4B keeps single-table `sms_templates` rejected for this lane, does not alter `sms_message_intents` (`message_body_snapshot` remains future attempted-message audit record), does not enable template editing/preview/rendering/sending, and does not add provider/send/webhook behavior
- F4B validation recorded: TypeScript passed, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, `git diff --check` passed, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F4B
- no production migration apply and no production writes; F4C read-only template status/sample preview remains deferred and real SMS remains deferred
- Slice F4C-A Template Governance Read Model Helper is complete in commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a` with helper `lib/communications/sms-template-governance-read.ts` and tests `lib/communications/__tests__/sms-template-governance-read.test.ts`
- F4C-A helper API is `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`, reads only `sms_message_templates` and `sms_message_template_versions`, and applies account scope by `account_owner_user_id`
- F4C-A helper keeps non-sending posture: safe-empty output on missing scope/no template rows, browser-safe readiness/status output only, SMS disabled/live sends disabled always, no `canSend`, no provider/Twilio calls, no customer/job/contact reads, and no `sms_message_intents`/`sms_provider_deliveries` reads
- F4C-A helper supports sample-data preview only, detects `{{token_name}}` tokens, blocks approval readiness for unknown tokens or missing STOP language, and keeps approval readiness separate from send readiness
- F4C-A validation recorded: template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed
- no UI/route/schema/migration/Supabase/provider/send behavior changes in F4C-A; F4C-B read-only template status/sample preview remains deferred and real SMS remains deferred
- Slice F4C-B Read-Only On-The-Way Template Governance Section is complete in implementation commit `05475929cc69704b1fb22f3dabbde10ff83aed90` and stabilization commit `1ffa475e2167eeb60a206358a4e7032a407bdd0f`.
- F4C-B changed `app/ops/admin/communications/page.tsx` and added `On-The-Way Template Governance` on `/ops/admin/communications` as admin-only read-only status/sample-preview-only surface using `getSmsOnTheWayTemplateGovernanceForAccount`.
- F4C-B section includes required non-sending copy (`Sample preview only.`, `SMS is not enabled and live sends are disabled.`, `Mark On The Way does not send SMS.`, `Template readiness does not enable sending.`), shows governance/version/token/preview summaries, and avoids send/test/sandbox/activation/edit/provider controls.
- F4C-B section exposes no raw provider refs/secrets/full phone/customer/job data or raw JSON dump.
- stabilization added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions so local errors degrade to safe-empty readiness instead of crashing page.
- browser smoke passed after stabilization; real SMS remains deferred.
- F4C-B validation recorded: TypeScript passed, template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, and `git diff --check` passed.
- Slice F4D-A Template Editing + Review Actions Model Lock is complete in `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`.
- F4D-A keeps this workflow boundary intact: template create/save/review semantics are admin settings governance only, do not send SMS, do not create provider delivery truth, do not add webhook behavior, and do not change Mark On The Way lifecycle behavior.
- Future template validation and admin draft/review actions must preserve background/event-driven send planning and must not run inline inside Mark On The Way.
- Slice F4D-B Template Governance Validation Helper is complete in commit `418172e` with helper `lib/communications/sms-template-governance-validation.ts` and tests `lib/communications/__tests__/sms-template-governance-validation.test.ts`.
- F4D-B helper API is `validateOnTheWayTemplateBody(bodyTemplate: string)` and it owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags.
- F4D-B helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments; it warns for multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content.
- F4D-B does not enable SMS, does not imply `canSend`, has no Supabase/database/provider dependencies, and has no UI/server-action behavior.
- review-request SMS remains a future separate message class and is prohibited in On-The-Way operational template wording.
- F4D-B validation recorded: template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed.
- create/save draft server actions and review actions are complete; create/save draft UI is complete; review/reject UI remains deferred unless team-review workflow is reopened; real SMS remains deferred.

- Slice F4D-E1 Create/Save Draft UI is complete in commit `1b8b671`.
- F4D-E1 changed `app/ops/admin/communications/page.tsx` and touched server-action compatibility in `lib/actions/sms-template-actions.ts`.
- F4D-E1 adds local notice rendering, `Draft Wording` card, create-draft form, and latest-draft-only save form while preserving required non-sending copy.
- F4D-E1 wires only create/save draft actions and intentionally does not add review controls, activation controls, provider setup, send endpoint, webhook, or automation behavior.
- Browser smoke passed after local runtime target alignment (`draft_created`, `draft_saved`); initial `template_create_failed` was runtime-target mismatch and not a code defect.
- Slice F4D-E3B Admin Readiness UI Wiring is complete in commit `c998d0e`.
- F4D-E3B keeps all behavior inside `app/ops/admin/communications/page.tsx`; it adds visible `Mark wording ready for sandbox` UI to the existing `On-The-Way Template Governance` section and uses `markOnTheWayTemplateReadyForSandboxFromForm`.
- the button appears only when latest wording is eligible, posts only `version_id`, avoids queue-shaped submit/review/reject UI, and keeps readiness/testing language instead of activation language.
- browser smoke passed end-to-end with `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, and browser-safe rendering confirmed.
- F4D-E3B does not add On-The-Way automation, provider calls, send endpoint, webhook behavior, sandbox SMS sends, or live SMS sends; Mark On The Way still does not send SMS and real SMS remains deferred.
- targeted validation passed (`94/94`), TypeScript passed, `git diff --check` passed, and working tree was clean.

## Slice F5A Cross-Reference Closeout (2026-05-15)

SMS Slice F5A Background On-The-Way Intent Handoff Model Lock is complete in documentation/model-only mode.

Recorded boundary for this workflow spec:

- Mark On The Way remains the user-facing operational trigger and the lifecycle/status update must happen first.
- Future SMS remains background/event-driven only; Mark On The Way still does not send SMS today.
- Future SMS intent creation must be anchored to a successful `on_my_way` `job_events` row.
- `job_events` remains lifecycle breadcrumb truth and is not provider delivery truth.
- `sms_message_intents` is the first future SMS decision/audit truth; `sms_provider_deliveries` remains provider submission/callback truth and remains deferred for this lane.
- Current implementation constraint is now explicit: the current `insertJobEvent` helper does not return the inserted event id, and the current `on_my_way` breadcrumb write is best-effort after the `jobs.status` update.
- Future F5B/F5C work must not rely on provider work inside the synchronous Mark On The Way action.
- Preferred future direction is explicit event-id anchoring before non-sending intent creation; background query/recovery of the latest matching `on_my_way` event is a fallback option, not the preferred contract.
- Recipient truth must continue to come from `contact_recipients`; job snapshot phone/email must not become SMS recipient truth.
- Lifecycle success remains success even when SMS evaluation is blocked, skipped, or fails; SMS/provider failures must not roll back job status.
- real SMS remains deferred.

## Slice F5B Cross-Reference Closeout (2026-05-15)

SMS Slice F5B Non-Sending On-The-Way Intent Eligibility Helper is complete in implementation commit `9814340`.

- Added `lib/communications/sms-on-the-way-intent-eligibility.ts` and `lib/communications/__tests__/sms-on-the-way-intent-eligibility.test.ts`.
- Helper API: `evaluateOnTheWayIntentEligibility(params): Promise<OnTheWayIntentEligibilityResult>`.
- The helper is read-only and non-sending; it composes existing recipient, eligibility, template-governance, and provider-readiness helpers and adds F5B-specific job plus durable `on_my_way` event-anchor checks.
- It validates durable `on_my_way` event-anchor readiness, separates structural `blockedReasons` from deferred live-send `warnings`, returns `liveSendEnabled` false, and does not return `canSend`.
- No `sms_message_intents` rows are written yet, no `sms_provider_deliveries` rows are written, and no Mark On The Way behavior changed.
- Mark On The Way still does not send SMS, and real SMS remains deferred.
- F5C should be planned/audited before implementation; likely next is non-sending `sms_message_intents` creation from eligible durable `on_my_way` anchors, while provider send/webhook/status callback/activation remain deferred.

## Slice F5C-A Model Lock (2026-05-15)

SMS Slice F5C-A On-The-Way Intent Creation Model Lock is complete in docs/model-only mode.

- F5C creates non-sending `sms_message_intents` only. F5C does not create `sms_provider_deliveries`, does not send SMS, and does not call provider/Twilio.
- Mark On The Way remains lifecycle-first; intent creation runs only after lifecycle success and successful `on_my_way` event insert.
- Preferred anchor is explicit event-id handoff from the successful `on_my_way` insert. Recommended implementation is to enhance `insertJobEvent` with optional returned id (or equivalent minimal helper) before job-actions integration.
- Query-latest-event remains fallback-only.
- Intent row writes are allowed only when required schema fields can be populated from real truth: durable event anchor, scoped account/job/event, recipient truth from `contact_recipients`, and governed template/version/body snapshot.
- No fake data is allowed for blocked/skipped rows. Missing required fields (recipient/template/version/body snapshot) must return write-skipped/no-insert.
- For no-insert outcomes the future helper should return `created = false` with `writeSkippedReason`, no provider row, no SMS send, and no lifecycle rollback.
- Ready mapping lock: `decision_outcome = ready_for_provider`, `blocked_reason_codes = []`, `quiet_hours_decision = not_checked`, and required template/recipient snapshots populated from governed/recipient truth.
- Blocked mapping lock: `decision_outcome = blocked` only when required fields still exist; otherwise no-insert with `writeSkippedReason`.
- Skipped mapping lock: non-target events do not create intent rows in F5C-A; return skipped/no-op helper result.
- Idempotency key lock: `${accountOwnerUserId}:${jobEventId}:on_the_way:${contactRecipientId}`. Idempotency conflict is treated as deduped success.
- Failure lock: intent creation is best-effort and must not roll back job status or job event; no provider-send or SMS-sent claim is allowed.
- Forward sequence lock: F5C-B intent helper only, F5C-C event-id handoff support, F5C-D Mark On The Way best-effort integration, later provider/webhook/sandbox/activation slices only after explicit approval.

## Slice F5C-B Cross-Reference Closeout (2026-05-15)

SMS Slice F5C-B On-The-Way Intent Creation Helper is complete in implementation commit `5833a23`.

- Added `lib/communications/sms-on-the-way-intent-create.ts` and `lib/communications/__tests__/sms-on-the-way-intent-create.test.ts`.
- Helper API: `createOnTheWayIntentFromEvent(params): Promise<CreateOnTheWayIntentFromEventResult>`.
- The helper is non-sending and creates `sms_message_intents` rows only; it calls `evaluateOnTheWayIntentEligibility` first and uses `getSmsEligibilityInputsForRecipient` for recipient snapshots.
- Ready behavior: writes one `sms_message_intents` row when all required truth exists with `decision_outcome = ready_for_provider` and `blocked_reason_codes = []`.
- Blocked behavior: writes one blocked intent only when required recipient/template/body truth exists with `decision_outcome = blocked` and `blocked_reason_codes` from eligibility; otherwise no-insert with `writeSkippedReason`.
- Skipped/write-skipped behavior: non-target events return skipped/no-op; missing durable event anchor/recipient/template/body/required schema fields return no-insert with `writeSkippedReason`; no fake data is allowed.
- Idempotency key: `${accountOwnerUserId}:${jobEventId}:on_the_way:${contactRecipientId}`; unique conflict is treated as deduped success (created false, deduped true).
- Helper does not write `sms_provider_deliveries`, does not send SMS, does not call provider/Twilio, does not modify jobs or job_events, and does not wire into Mark On The Way yet.
- Helper returns `liveSendEnabled` false always and does not return `canSend`.
- Validation recorded: new helper tests `12/12`, existing eligibility tests `12/12`, template governance tests `21/15`, template validation tests `19/19`, provider readiness tests `16/16`, eligibility inputs tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed.
- No `sms_message_intents` or `sms_provider_deliveries` rows are actually inserted (non-sending audit truth only); no production writes.
- Mark On The Way still does not send SMS, and real SMS remains deferred.
- F5C-C should focus on event-id handoff support to provide explicit anchor before job-actions integration; F5C-D will add best-effort Mark On The Way integration after event-id handoff is ready.

## Slice F5C-C Cross-Reference Closeout (2026-05-15)

SMS Slice F5C-C Durable On-The-Way Event-ID Handoff Support is complete in implementation commit `e7819e0`.

- Modified `lib/actions/job-actions.ts` and added `lib/actions/__tests__/job-event-id-handoff.test.ts`.
- `insertJobEvent` now returns the inserted durable `job_events.id` (changed return type from `void` to `Promise<string>`).
- Existing callers remain backward compatible: all 49 call sites can ignore the returned value or capture it as needed.
- Mark On The Way path now captures `onMyWayEventId` from the `on_my_way` event insert for future F5C-D integration.
- Captured `onMyWayEventId` is not yet used for SMS intent creation in F5C-C; intent integration is deferred to F5C-D.
- Payload semantics unchanged: meta, userId, jobId, event_type all preserved; error handling preserved.
- Call-site audit recorded: 49 total call sites (40 in job-actions.ts, 2 in internal-invoice-actions.ts, 1 in internal-invoice-payment-actions.ts); all awaiting the helper and ignoring return value; no behavioral changes required.
- Helper behavior on error: throws original error message; if event id missing in response, throws clear error with context.
- Event-id handoff boundary preserved: E2 intent/delivery audit tables unchanged; helper only returns the Supabase-generated id from the successful insert.
- Validation recorded: new event-id handoff tests `4/4`, existing SMS intent create tests `12/12`, SMS intent eligibility tests `12/12`, template governance read tests `15/15`, template validation tests `19/19`, provider readiness tests `16/16`, eligibility inputs tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed. Total: `104/104` tests passed.
- No `sms_message_intents` or `sms_provider_deliveries` rows created in F5C-C (handoff infrastructure only).
- No provider/Twilio/send/webhook behavior added.
- No schema changes; no migrations; no Supabase production commands.
- Mark On The Way still does not send SMS, and real SMS remains deferred.
- F5C-D will integrate the captured `onMyWayEventId` into `createOnTheWayIntentFromEvent` for non-sending intent creation after lifecycle success.

## Slice F5C-D Cross-Reference Closeout (2026-05-15)

SMS Slice F5C-D Mark On The Way Best-Effort Intent Integration is complete in implementation commit `67e4b32`.

- Modified `lib/actions/job-actions.ts` and added `lib/actions/__tests__/sms-on-the-way-intent-integration.test.ts`.
- Mark On The Way now calls `createOnTheWayIntentFromEvent` best-effort after:
  1. Job lifecycle status update succeeds (e.g., on_the_way_at timestamp written).
  2. Durable `on_my_way` job_event insert succeeds and `onMyWayEventId` is captured.
  3. Intent creation is wrapped in best-effort try/catch; failures do not rollback lifecycle.
- Intent creation passes:
  - `supabase`: Database client for audit writes.
  - `accountOwnerUserId`: From `internalUser.account_owner_user_id`.
  - `actingUserId`: Current user ID from auth.
  - `jobId`: The job being transitioned.
  - `jobEventId`: The captured durable `onMyWayEventId`.
- Intent helper behavior:
  - Ready outcome: creates `sms_message_intents` row if all required truth exists (recipient, template, body snapshot).
  - Blocked outcome: creates blocked intent row with reason codes if recipient/template/body truth exists; otherwise no-insert.
  - Skipped/write-skipped outcome: non-target events or missing required truth returns no-insert with `writeSkippedReason`.
  - Deduped outcome: idempotency conflict (same account/event/message-class/recipient) is allowed and does not fail.
  - Error outcome: logged and swallowed; does not rollback job status, event, or Mark On The Way success.
- Mark On The Way success behavior unchanged: blocked/skipped/write-skipped/deduped outcomes do not fail or change user-facing success message.
- Validation recorded: 7 new integration tests, existing SMS intent create tests `12/12`, SMS intent eligibility tests `12/12`, job event id handoff tests `4/4`, SMS template action tests `54/54`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed. Total: `89/89` tests passed.
- No `sms_provider_deliveries` rows created; intent creation is audit-only.
- No provider/Twilio/send/webhook behavior added.
- No schema changes; no migrations; no Supabase production commands.
- Mark On The Way still does not send SMS, and real SMS remains deferred.
- Forward sequence: F5C-D complete; next is provider/Twilio sandbox/send planning audit; webhook/status callback planning is future; real SMS only after explicit approval.

## Slice F6A Provider/Twilio Sandbox Send Model Lock (2026-05-15)

SMS Slice F6A is complete in documentation/model-only mode.

Workflow boundary recorded:

- The first future sandbox send must be manual/admin-only.
- Sandbox send must consume existing `sms_message_intents` only.
- Sandbox send must require `decision_outcome = ready_for_provider`.
- Sandbox send must not be triggered from Mark On The Way yet.
- Mark On The Way remains lifecycle-first and intent/audit-only.
- Mark On The Way still does not send SMS.
- Real SMS remains deferred.

Future sandbox send preconditions:

- same-account intent lookup
- `message_class = on_the_way`
- no existing `sms_provider_deliveries` row for that intent
- durable `job_event_id` exists
- recipient/template/body snapshots are present
- current sandbox template matches before sandbox send unless a later slice explicitly changes this
- contact recipient remains active, phone remains present, consent remains opted in, and no suppression exists
- quiet-hours remains deferred, so manual sandbox send must either block until quiet-hours is implemented or be limited to verified sandbox/test recipients
- sandbox provider configuration and verified/active sandbox sender identity exist with Messaging Service ref configured
- server-only sandbox enablement gate, STOP/HELP readiness, legal/provider review, and explicit activation remain later gates

Future provider delivery posture:

- create `sms_provider_deliveries` before the provider call with `provider_status = not_submitted`
- later Twilio `MessageSid` maps to `provider_message_id`
- later Twilio status maps to `provider_raw_status` and normalized `provider_status`
- immediate provider failures are recorded on `sms_provider_deliveries` and must not roll back job status
- no job timeline delivery claim is allowed unless backed by provider delivery truth and separately designed

Forward sequence:

- F6B provider delivery preflight/helper only, no Twilio call
- F6C-A manual sandbox send model lock
- F6C-B server-only provider config resolver, no sends
- F6C-C manual admin-only sandbox send action, server-only gated and only after explicit Twilio sandbox/env/test-recipient setup approval
- F6D status callback planning/implementation before live send
- later sandbox SMS only after explicit approval
- later live SMS only after legal/provider/activation approval

## Slice F6B Cross-Reference Closeout (2026-05-15)

SMS Slice F6B Provider Delivery Preflight Helper is complete in implementation commit `f1214ae`.

- Added `lib/communications/sms-provider-delivery-preflight.ts` and `lib/communications/__tests__/sms-provider-delivery-preflight.test.ts`.
- Helper API: `prepareSmsProviderDeliveryPreflight(params): Promise<PrepareSmsProviderDeliveryPreflightResult>`.
- The helper is non-sending and creates `sms_provider_deliveries` rows only when eligible intent exists.
- Helper reads scoped `sms_message_intents` row by id and account scope, validates `message_class = on_the_way` and `decision_outcome = ready_for_provider`, and checks all required fields present (message_body_snapshot, recipient_phone_snapshot, template_version, job_event_id).
- Ready behavior: writes one `sms_provider_deliveries` row with `provider_name = twilio` and `provider_status = not_submitted` when all required truth exists.
- Deduped behavior: existing delivery or insert unique conflict is treated as deduped success (created false, deduped true, returns existing delivery id).
- Blocked behavior: invalid intent or missing required fields returns blocked reasons and no row insert.
- Helper does not call Twilio/provider, does not send SMS, does not set `provider_message_id`, does not set `submitted_at`, does not mark sent/delivered/failed, and does not mutate jobs, job_events, or sms_message_intents.
- Helper returns `liveSendEnabled` false always and does not return `canSend`; canSend semantics are deferred to provider submission layer.
- Account scope validated: missing `account_owner_user_id` or `sms_message_intent_id` blocks operation.
- Validation recorded: new preflight tests `17/17`, existing SMS intent create tests `12/12`, SMS intent eligibility tests `12/12`, template governance read tests `15/15`, template validation tests `19/19`, provider readiness tests `16/16`, eligibility inputs tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed. Total: `52/52` tests passed.
- No `sms_provider_deliveries` rows actually created (non-sending audit infrastructure only); no production writes.
- Mark On The Way still does not send SMS, and real SMS remains deferred.
- Future F6C-C manual admin-only sandbox send action can query for `sms_provider_deliveries` rows with `provider_status = not_submitted` and proceed with Twilio submission only after F6C-A/F6C-B gates and explicit Twilio sandbox/env/test-recipient setup approval.

## Slice F6C-A Manual Admin Sandbox Send Model Lock (2026-05-15)

SMS Slice F6C-A is complete in documentation/model-only mode.

Workflow boundary recorded:

- First sandbox send remains manual/admin-only.
- Future sandbox send must consume an existing `sms_provider_deliveries` row with `provider_status = not_submitted`.
- The future action must not be triggered by Mark On The Way and must not live on job pages.
- Mark On The Way remains lifecycle + non-sending intent/preflight only.
- The future manual action must be server-gated, account-scoped, and limited to verified sandbox/test recipients until quiet-hours and live compliance gates are complete.
- Future provider submission must reserve the delivery row with a guarded update from `not_submitted` to `submitted` immediately before Twilio handoff.
- The guarded update must require same account, same delivery id, `provider_status = not_submitted`, and no `provider_message_id`; if no row is reserved, no provider call may happen.
- `submitted` as reservation state is acceptable only for tightly controlled manual sandbox smoke because the schema has no true in-flight status.
- Future provider response writes belong only to `sms_provider_deliveries`; they must not update job status or create job timeline delivery claims.
- Missing webhook is acceptable only for manual sandbox smoke; live send remains blocked until status callback, signature validation, opt-out/HELP handling, legal/provider review, and explicit activation are complete.
- No code, schema, provider, send, webhook, env, or behavior change is approved by F6C-A.
- Mark On The Way still does not send SMS, and real SMS remains deferred.

## Slice F6C-B Cross-Reference Closeout (2026-05-15)

SMS Slice F6C-B Server-Only Provider Config Resolver is complete in implementation commit `e292c34`.

- Added `lib/communications/sms-provider-config-resolver.ts` and `lib/communications/__tests__/sms-provider-config-resolver.test.ts`.
- Helper API: `resolveSmsSandboxProviderConfig(params): Promise<ResolveSmsSandboxProviderConfigResult>`.
- Resolver is server-only readiness infrastructure; no provider submit behavior is added.
- Resolver reads account-scoped `sms_provider_configurations` and `sms_sender_identities` only.
- Resolver enforces `provider_name = twilio`, `provider_environment = sandbox`, sandbox-capable provider readiness, sender identity verified/active readiness, Messaging Service configured, and sandbox send gate enabled.
- Resolver fails closed with `sandbox_send_gate_missing_or_disabled` when sandbox gate is missing or disabled.
- Resolver does not read env secrets, does not call Twilio/provider, does not send SMS, and does not mutate provider/sender rows.
- Resolver does not expose Account SID/Auth Token/API key/Messaging Service SID or raw provider refs/secrets.
- Resolver does not return `canSend` and always returns `liveSendEnabled = false`.
- Validation recorded: resolver tests `15/15`, provider delivery preflight tests `17/17`, provider readiness tests `16/16`, intent create tests `12/12`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed.
- Mark On The Way still does not send SMS, and real SMS remains deferred.

## Slice F6C-C1 Model Lock (2026-05-15)

SMS Slice F6C-C1 Manual Sandbox Send Gate + Resolver Model Lock is complete in docs/model-only mode.

- F6C-C1 does not implement send actions, Twilio/provider calls, dry-run/reservation writes, schema changes, or UI changes.
- Manual sandbox send remains deferred.
- Twilio/provider calls remain deferred.
- Dry-run/reservation action remains deferred until after this model lock.
- A deterministic server-only sandbox send gate is required before F6C-C2/F6C-C3.
- Current resolver fail-closed behavior on missing gate is correct and must not be bypassed.
- Preferred future gate model is explicit `sms_provider_configurations` field (for example `sandbox_send_enabled boolean default false`); alternative account-level gate surface remains acceptable if deterministic/server-only.
- Provider config disambiguation is locked: resolver must use account + `provider_name = twilio` + `provider_environment = sandbox`; account-only provider lookup is not acceptable.
- Production provider rows must never satisfy sandbox send readiness.
- First manual sandbox send remains limited to verified sandbox/test recipients; until policy is modeled, conservative posture is fail closed.
- Quiet-hours remains deferred only for verified test recipients; otherwise sandbox send must fail closed.
- F6C-C2 target remains dry-run/manual reservation readiness action only (`delivery_id` input only), safe notice/readiness output only, and no Twilio call.
- If any F6C-C2 mutation is later approved, it must not call Twilio and must not imply sent.
- F6C-C3 real manual sandbox send remains deferred until explicit Twilio sandbox/env/test-recipient setup approval plus server-only credentials/config and gate/disambiguation readiness.
- Future notice categories are locked for F6C actions: provider-not-ready, gate-missing-or-disabled, test-recipient-required, delivery-missing/not-ready/already-submitted/reserved, provider-submit-attempted, provider-immediate-failure, and internal-error.
- Crash/reconciliation lock remains: `submitted` reservation is acceptable only for controlled sandbox smoke while true in-flight state is absent; reconciliation/retry strategy remains later work unless schema change is intentionally chosen.
- Webhook/status callback remains deferred for manual sandbox smoke only and required before live SMS.
- Mark On The Way still does not send SMS, and real SMS remains deferred.

## Slice F6C-C2 Closeout (2026-05-15)

SMS Slice F6C-C2 Dry-Run Sandbox Delivery Reservation Action is complete in implementation commit `8d6043e`.

- Added `lib/actions/sms-sandbox-send-actions.ts` and `lib/actions/__tests__/sms-sandbox-send-actions.test.ts`.
- Action API: `reserveSmsSandboxDeliveryDryRunFromForm(formData: FormData): Promise<void>`.
- Action is admin-only, accepts `delivery_id` only, derives account scope from authenticated internal user context, and re-reads delivery/intent/provider-readiness server-side.
- Action re-checks delivery (`twilio`, `not_submitted`, no provider message id), linked intent readiness (`on_the_way`, `ready_for_provider`, durable anchor, required snapshots), provider resolver readiness, and sandbox send gate status.
- Action remains evaluation-only/dry-run in this slice.
- Action does not call Twilio/provider, does not send SMS, and does not submit to provider.
- Action does not mutate `sms_provider_deliveries`, does not set `submitted_at`, does not set `provider_message_id`, and does not change provider status.
- Action does not mutate `jobs` or `job_events`.
- Action is fail-closed and returns safe notice codes; current expected end-state remains `sandbox_test_recipient_required` until verified sandbox test-recipient policy is modeled.
- Mark On The Way still does not send SMS, and real SMS remains deferred.

## Slice F6C-C3A Model Lock (2026-05-15)

SMS Slice F6C-C3A Sandbox Test Recipient + Send Gate Model Lock is complete in docs/model-only mode.

- F6C-C3A does not implement code, behavior, schema, migrations, sends, or provider calls.
- Real sandbox send remains deferred.
- Twilio/provider calls remain deferred.
- Live SMS remains deferred.
- Mark On The Way still does not send SMS.
- First real sandbox send must be limited to verified sandbox/test recipients.
- Current dry-run blocker `sandbox_test_recipient_required` remains correct until the verified test-recipient gate exists.
- Test-recipient approval must be account-scoped/admin-controlled and must not be client-trusted.
- Future test-recipient verification should enforce account scope, recipient linkage to intent/delivery, snapshot phone match, active recipient posture, and acceptable consent/suppression posture.
- Quiet-hours may remain deferred only for verified sandbox/test recipients; otherwise sandbox send fails closed.
- Preferred future test-recipient model is account-scoped `sms_sandbox_test_recipients` table (or equivalent account-level setting) with normalized phone (or hash), display label, active flag, verification audit fields, and timestamps.
- Resolver gate requirement remains locked: missing/disabled gate fails closed with `sandbox_send_gate_missing_or_disabled`.
- Preferred future send-gate model remains explicit account-scoped/server-only field on `sms_provider_configurations` (for example `sandbox_send_enabled`) or intentionally chosen account-level gate.
- Resolver disambiguation remains required before real sandbox send: account + `provider_name = twilio` + `provider_environment = sandbox`; production provider rows are never acceptable for sandbox readiness.
- No-go boundaries remain: no job-page send button, no Mark On The Way trigger, no SMS enabled language, no delivered claims, no browser credentials, no `NEXT_PUBLIC_*` secrets.

## Slice F6C-C3B Closeout (2026-05-15)

SMS Slice F6C-C3B Sandbox Send Gate + Test Recipient Schema is complete in implementation commit `75800d3`.

- Migration added: `supabase/migrations/20260515150000_sms_sandbox_gate_test_recipients_foundation.sql`.
- Sandbox send gate is now schema-backed on `sms_provider_configurations` with fail-closed default (`sandbox_send_enabled = false`).
- Gate remains manual-sandbox-only and does not imply live send or trigger provider send behavior by itself.
- `sms_sandbox_test_recipients` now exists as account-scoped verified sandbox/test-recipient registry foundation.
- Test-recipient schema remains independent of customer/job linkage and does not imply live communication permission.
- RLS posture remains fail-closed for writes: account-scoped authenticated select is present; authenticated insert/update/delete policies remain intentionally absent.
- Future trusted admin/service-role server paths must manage writes.
- F6C-C3C resolver follow-up is complete in commit `5af36cb`.
- Resolver now uses explicit account + twilio + sandbox selection and schema-backed `sandbox_send_enabled` gate checks.
- Production provider configuration cannot satisfy sandbox readiness.
- Missing/false gate blocks with `sandbox_send_gate_missing_or_disabled`.
- Dry-run action follow-up remains required (F6C-C3D) to pass when sandbox gate + verified test-recipient are configured.
- Real sandbox send remains deferred.
- Mark On The Way still does not send SMS, and real SMS remains deferred.

SMS Slice F6C-C3D closeout note: complete in implementation commit `e5060e9`.
- F6C-C3D dry-run action now passes only when delivery/intent gates, provider resolver, and active verified sandbox test recipient all pass.
- On success: returns `sandbox_reservation_dry_run_ready` dry-run notice (no send, no delivery mutation).
- F6C-C3D does not call Twilio, does not send SMS, and does not mutate `sms_provider_deliveries`, `jobs`, or `job_events`.
- Mark On The Way still does not send SMS; real SMS remains deferred.

SMS Slice F6C-C4 closeout note (May 2026): complete in implementation commit `98b057a`.
- F6C-C4 adds `submitSmsSandboxDeliveryToProviderFromForm(formData)` as the first server-only Twilio sandbox provider call path.
- Action is admin-only, accepts only `delivery_id`, requires all gate checks (delivery, intent, resolver, sandbox gate, active verified test recipient).
- Performs guarded delivery reservation before calling Twilio; if reservation finds zero rows, returns `sandbox_delivery_reserved` without calling provider.
- On Twilio success: records `provider_message_id`, `provider_raw_status`, normalized provider status, and `provider_last_event_at`.
- On immediate Twilio error: records failed status, `failed_at`, sanitized error code/message/raw status, and `provider_last_event_at`.
- Never writes `sent_at` or `delivered_at`.
- Never mutates `jobs`, `job_events`, `sms_message_intents`, invoices, payments, QBO records, or portal records.
- Does not add webhook/status callback behavior or UI/route exposure.
- Mark On The Way still does not send SMS; Mark On The Way still does not trigger `submitSmsSandboxDeliveryToProviderFromForm`.
- Webhook/status callback remains deferred to F6D.
- Live SMS remains deferred pending legal/provider/A2P/STOP/HELP/activation approval.

Forward sequence update:

- F6C-C2 docs closeout complete.
- F6C-C3A docs/model lock complete.
- F6C-C3B schema/model implementation complete.
- F6C-C3C resolver update complete.
- F6C-C3D dry-run action test-recipient gate complete.
- F6C-C4 manual sandbox provider submit action complete.
- Next: optional controlled sandbox smoke only after explicit approval and verified env/test-recipient setup.
- F6D webhook/status callback planning/implementation required before live SMS consideration.
- Live SMS remains deferred pending legal/provider/A2P/STOP/HELP/activation approval.

---

## 1) Current Decision

Locked product decision for this lane:

- no job-detail SMS preview card for V1
- no field-tech SMS free-text editor
- no field UI template editing
- no live SMS
- no provider/Twilio behavior
- future template control belongs in admin communications settings

Current SMS remains non-sending/manual/device-intent only.

V1 workflow simplification:

- Mark On The Way is the user-facing operational trigger.
- The lifecycle/status transition remains primary.
- Future SMS is a simple background notification after that lifecycle event, not inline send behavior.
- Provider failure must not roll back Mark On The Way.
- Admin owns the On-The-Way wording in V1.
- Field users do not write, preview, or freely edit SMS wording.
- Visible V1 template UI should be admin readiness oriented, not a multi-person approval/rejection queue.

---

## 2) Future Field Workflow

Future intended flow (planning only):

1. Tech/operator presses Mark On The Way.
2. Job lifecycle/status transition remains primary and must not depend on SMS.
3. Future intent handoff must anchor to a successful `on_my_way` `job_events` row after the lifecycle transition.
4. Future non-sending SMS intent evaluation runs after that durable event handoff as background/event-driven workflow.
5. If all later gates pass in approved future slices, provider SMS may be submitted.
6. If any gate fails, no SMS is sent and lifecycle transition remains successful.

Quiet-hours/timezone clarification:

- quiet-hours/timezone must not block Mark On The Way
- quiet-hours/timezone must not block job lifecycle/status transitions
- quiet-hours/timezone applies only to future background SMS send eligibility

---

## 3) Background Architecture Recommendation

Recommended future architecture:

- prefer event-driven or queued/background workflow
- do not send directly inside Mark On The Way action
- keep Mark On The Way responsive and lifecycle-focused
- consume a durable `on_my_way` lifecycle event as the background trigger
- create `sms_message_intents` as the first non-sending decision/audit record before any provider work exists
- keep `sms_provider_deliveries` parked for later approved provider submission/callback slices
- provider failure must not roll back job status

Current implementation constraint:

- current `insertJobEvent` helper does not return the inserted event id
- current `on_my_way` breadcrumb write is best-effort after the `jobs.status` update
- preferred future direction is explicit event-id anchoring for the non-sending intent handoff
- option to query for the latest matching `on_my_way` event after status mutation remains a fallback only and requires strict idempotency/revert protection

This is a control contract only. No automation is added in this slice.

---

## 4) Required Future Gates Before Any Background Send

All gates below must pass before any future background send is allowed:

- feature/activation gate passes
- durable `on_my_way` event anchor exists
- current job still resolves as `on_the_way`
- no later revert/protective block is present for the same lifecycle movement
- recipient exists in contact_recipients
- recipient role explicit
- recipient active
- recipient phone present
- consent exists and is opted in for on_the_way
- no active recipient-level suppression
- no active phone-level suppression
- quiet-hours/timezone gate passes
- STOP/help readiness is available for the chosen provider path
- template sandbox/current readiness gate passes for the approved future send posture
- account/provider readiness gate passes
- sender identity/provider registration ready
- SMS intent audit table exists and can record decision outcome
- provider/Twilio sandbox validated
- legal/provider review complete
- explicit activation decision approved

If any gate is missing or ambiguous, send remains blocked.

Scope clarification:

- this gate is conservative and fail-closed for SMS send eligibility only
- this gate is not a required V1 field workflow control

---

## 5) Failure Behavior When Gates Block Sending

If a future background send is blocked:

- no intent is created unless a durable `on_my_way` event anchor exists
- if a durable event anchor exists, future intent evaluation should still record blocked/skipped/failed decision outcome in `sms_message_intents`
- no SMS send attempt
- no customer-facing sent/delivered claim
- no fake delivery status
- no automatic manual contact log creation
- optional internal-only note/event may be added later only after that event model is designed
- Mark On The Way remains successful when lifecycle action itself succeeded
- quiet-hours/timezone blocked-send outcomes are SMS-only and do not change lifecycle success
- provider failure later must write to provider delivery truth, not lifecycle truth

---

## 6) Template Governance

Future template governance contract:

- On-The-Way wording is admin-controlled
- field techs/operators cannot freely edit message content
- first template key is on_the_way
- template must be versioned before live activation
- template editing belongs in future admin communications settings, not job detail

---

## 7) Future Template Structure (Planning-Only)

Planning-only shape:

- greeting with recipient first name
- operator/tech identity
- company name
- simple on-the-way context
- STOP opt-out footer

Example planning-only template:

Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.

This wording is not final legal/provider-approved production copy.

---

## 8) Token Model

Initial future tokens:

- recipient_first_name
- operator_or_tech_name
- company_name
- appointment_or_job_context

Optional later tokens:

- window_start_local
- window_end_local
- service_city

---

## 9) Operator/Tech Name Source

Future name source preference:

1. primary: authenticated user who clicked Mark On The Way
2. fallback: primary assigned tech/team member
3. fallback: company/team name

Missing operator/tech name must not block job status transition.

Future policy may either:

- block SMS when no approved name source resolves, or
- use approved fallback value

---

## 10) Admin Settings Location

Future SMS template/settings location recommendation:

- canonical home: Settings -> Communications
- dedicated Admin Communications route (example: /ops/admin/communications)
- do not place full SMS template management inside Company Profile
- Company Profile continues to own business identity/support contact details
- Communications settings should eventually own template governance, provider readiness state, sender identity, and activation gates

Information architecture details for this decision are documented in:

- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md

---

## 11) Badge-Only UI Posture

Job/customer surfaces should remain preview-free.

If future status UI is needed, use compact badges only:

- Do Not Text
- Notifications Off
- Consent Needed
- Texting Not Enabled

Badge state must come from first-class recipient/consent/suppression sources and B2 helper outputs.

No fake toggles. No fake delivery status. No job/customer snapshot phone as SMS recipient truth.

---

## 12) No-Go Areas For This Slice

This slice does not perform or authorize:

- live SMS
- provider/Twilio setup
- send endpoint
- webhook
- message intent/provider delivery table implementation
- On-The-Way automation
- job-detail preview card
- field SMS editor
- quiet-hours settings UI in direct job workflows
- consent/suppression fake toggles
- customer portal work
- payment/QBO behavior
- marketplace feature build
- code changes
- behavior changes
- schema changes
- migrations
- Supabase commands
- production writes
- env/secret/feature-flag changes

---

## 13) Future Recommended Sequence

Future sequence (planning order):

A. Background On-The-Way workflow spec closeout.
B. Admin communications settings IA/spec.
C. Badge-only readiness UI planning.
D. SMS message intent/provider delivery audit schema planning. ✓ Complete
E. F4A On-The-Way template governance model lock closeout. ✓ Complete
F. F4B template schema foundation (`sms_message_templates`, `sms_message_template_versions`). ✓ Complete (`b676736`)
G. F4C-A template governance read-model helper (`lib/communications/sms-template-governance-read.ts`). ✓ Complete (`0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`)
H. F4C-B read-only template status/sample preview in Admin Communications. ✓ Complete (`05475929cc69704b1fb22f3dabbde10ff83aed90`, stabilized by `1ffa475e2167eeb60a206358a4e7032a407bdd0f`)
I. F4D-A template editing/review actions model lock. Complete.
J. F4D-B validation helper only; no writes, no UI. ✓ Complete (`418172e`)
K. F4D-C create/save draft server actions.
L. F4D-D review actions.
M. F4D-E1 create/save draft UI. ✓ Complete (`1b8b671`)
N. F4D-E2 safe version-id/action-eligibility read-model support for admin readiness. ✓ Complete (`fededec`)
O. F4D-E3A combined admin readiness action. ✓ Complete (`8cfa814`)
P. F4D-E3B mark-ready UI wiring. ✓ Complete (`c998d0e`)
Q. F5A docs/model lock for durable On-The-Way intent handoff. ✓ Complete
R. F5B non-sending event-anchor/intent eligibility helper. ✓ Complete (`9814340`)
S. F5C-A On-The-Way intent creation model lock. ✓ Complete
T. F5C-B non-sending `sms_message_intents` helper only. ✓ Complete (`5833a23`)
U. F5C-C event-id handoff support (`insertJobEvent` optional returned id or equivalent minimal helper). ✓ Complete (`e7819e0`)
V. F5C-D Mark On The Way best-effort integration (no lifecycle rollback). Complete (`67e4b32`)
W. F6A provider/Twilio sandbox send model lock. Complete.
X. F6B provider delivery preflight/helper only, no Twilio call.
Y. F6C-A manual sandbox send model lock. Complete.
Z. F6C-B server-only provider config resolver, no sends.
AA. F6C-C manual admin-only sandbox send action, server-only gated and only after explicit Twilio sandbox/env/test-recipient setup approval.
AB. F6D status callback planning/implementation before live send.
AC. Quiet-hours/timezone gate planning.
AD. Sandbox provider send only after all gates and explicit approval.
AE. Production activation only after legal/provider review and explicit approval.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md
- docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md
- docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md
- docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
