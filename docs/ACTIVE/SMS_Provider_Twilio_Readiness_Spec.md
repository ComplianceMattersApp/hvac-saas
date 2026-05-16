# Compliance Matters - SMS Provider/Twilio Readiness Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## F3B Completion Cross-Reference (May 2026)

Slice F3B Provider Readiness Read-Model Helper is complete in commit `d370e56`:
- Implementation: `lib/communications/sms-provider-readiness-read.ts` and `lib/communications/__tests__/sms-provider-readiness-read.test.ts`
- Helper API: `getSmsProviderReadinessForAccount({ supabase, accountOwnerUserId })`
- This spec (F1) defines the provider/Twilio readiness planning; F3B delivers a safe read-model helper for browser display.

## F4B Completion Cross-Reference (May 2026)

Slice F4B Template Governance Schema Foundation is complete in commit `b676736` with migration `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`.

- F4B implemented the safer two-table governance model: `sms_message_templates` (account-scoped template container/current pointer) and `sms_message_template_versions` (durable governed wording/version record).
- single-table `sms_templates` remains rejected for this lane.
- template rows are account-scoped with RLS enabled and SELECT-only policy posture for authenticated active internal users in the same account.
- no INSERT/UPDATE/DELETE policies were added in V1; future writes remain deferred to admin-only server actions.
- F4B does not enable template editing, preview, rendering, sending, provider setup, webhook, or Twilio behavior.
- F4B does not alter `sms_message_intents`; `sms_message_intents.message_body_snapshot` remains the future attempted-message audit record.
- validation recorded: TypeScript passed, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, `git diff --check` passed, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F4B.
- no production migration apply and no production writes.
- F4C read-only template status/sample preview remains deferred; real SMS remains deferred.

## F4C-A Completion Cross-Reference (May 2026)

Slice F4C-A Template Governance Read Model Helper is complete in commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`.

- helper file: `lib/communications/sms-template-governance-read.ts`
- test file: `lib/communications/__tests__/sms-template-governance-read.test.ts`
- helper API: `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`
- helper reads only `sms_message_templates` and `sms_message_template_versions`, account-scoped by `account_owner_user_id`
- helper returns safe-empty output when scope is missing or templates are not configured
- helper returns browser-safe readiness/status output only, always keeps SMS disabled/live sends disabled, and does not return `canSend`
- helper does not call provider/Twilio APIs, does not read customer/job/contact data, and does not read `sms_message_intents` or `sms_provider_deliveries`
- helper supports sample-data preview only, detects allowed/unknown tokens, blocks approval readiness for unknown tokens/missing STOP language, and keeps approval-readiness separate from send-readiness
- validation recorded: template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed
- no UI/route/schema/migration/Supabase/provider/send behavior changes in F4C-A
- F4C-B read-only template status/sample preview remains deferred; real SMS remains deferred

## F4C-B Completion Cross-Reference (May 2026)

Slice F4C-B Read-Only On-The-Way Template Governance Section is complete.

- implementation commit: `05475929cc69704b1fb22f3dabbde10ff83aed90`
- stabilization commit: `1ffa475e2167eeb60a206358a4e7032a407bdd0f`
- page changed: `app/ops/admin/communications/page.tsx`
- route: `/ops/admin/communications`
- section added: `On-The-Way Template Governance`
- section posture: admin-only, read-only, sample-preview/status only; no send/test/sandbox/activation/edit/provider controls
- section uses `getSmsOnTheWayTemplateGovernanceForAccount` and includes required non-sending copy
- section shows governance/version/token/preview summaries and STOP/unknown-token warnings
- section does not expose raw provider refs/secrets/full phone/customer/job data or raw JSON dump
- stabilization added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions
- browser smoke passed after stabilization
- validation recorded: TypeScript passed, template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, and `git diff --check` passed
- no Twilio/provider integration, credentials, webhook, sandbox send, or live SMS behavior was enabled
- real SMS remains deferred

## F4D-A Model Lock Cross-Reference (May 2026)

Slice F4D-A Template Editing + Review Actions Model Lock is complete in `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`.

- F4D-A does not approve Twilio/provider setup, sandbox sends, status callbacks, webhook behavior, activation, or live SMS.
- Template approval/readiness is product governance only and must not be interpreted as provider readiness or send enablement.
- Future provider/legal review actions remain postponed until provider/Twilio and production activation planning starts.
- Future `approved_for_activation` semantics must require legal and provider approval; sandbox approval remains separate and non-sending.

## F4D-B Completion Cross-Reference (May 2026)

Slice F4D-B Template Governance Validation Helper is complete.

- implementation commit: `418172e`
- helper file: `lib/communications/sms-template-governance-validation.ts`
- test file: `lib/communications/__tests__/sms-template-governance-validation.test.ts`
- helper API: `validateOnTheWayTemplateBody(bodyTemplate: string)`
- helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags
- helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments
- helper warns for multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content
- helper has no Supabase/database/provider dependencies and no UI/server-action behavior; it does not enable SMS or imply `canSend`
- review-request SMS remains a future separate message class and is prohibited in On-The-Way operational template wording
- validation recorded: template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed
- create/save draft server actions and review actions are complete; create/save draft UI is complete; review/reject UI remains deferred unless team-review workflow is reopened; real SMS remains deferred

## F4D-E1 Completion Cross-Reference (May 2026)

Slice F4D-E1 Create/Save Draft UI is complete in commit `1b8b671`.

- page changed: `app/ops/admin/communications/page.tsx`
- server-action compatibility touched: `lib/actions/sms-template-actions.ts`
- UI adds local notice rendering, `Draft Wording` card, create-draft button/form, and latest-draft-only textarea/save form
- UI wires only create/save draft actions and intentionally does not add review/activation/provider/send/webhook controls
- browser smoke passed after local runtime target alignment (`draft_created`, `draft_saved`)
- initial `template_create_failed` was caused by runtime target mismatch (local reset target vs remote app runtime target), not a code defect
- real SMS remains deferred

## F4D-E3B Completion Cross-Reference (May 2026)

Slice F4D-E3B Admin Readiness UI Wiring is complete in commit `c998d0e`.

- page changed: `app/ops/admin/communications/page.tsx`
- existing `On-The-Way Template Governance` section now includes visible `Mark wording ready for sandbox` UI
- button appears only when the latest wording is eligible, posts only `version_id`, and uses `markOnTheWayTemplateReadyForSandboxFromForm`
- visible V1 copy stays readiness/testing oriented and does not imply provider activation, send enablement, or Twilio readiness
- UI avoids queue-shaped submit/review/reject workflow; review/reject UI remains parked unless team-review workflow is intentionally reopened
- browser smoke passed with `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, and browser-safe rendering confirmed
- targeted validation passed (`94/94`), TypeScript passed, `git diff --check` passed, working tree clean
- template readiness does not enable SMS, sandbox readiness does not send SMS, Mark On The Way still does not send SMS, and real SMS remains deferred until later provider setup, webhook/signature validation, send path, and explicit activation work

## SMS On-The-Way V1 Workflow Simplification (May 2026)

Provider planning remains subordinate to the simple V1 product goal:

- User presses Mark On The Way.
- Future SMS is a background operational/customer-care notification after that lifecycle event.
- Provider failure must not roll back Mark On The Way.
- Admin controls the wording before provider send behavior is connected.
- Visible V1 UI should use admin readiness language, not activation or approval-queue language.
- Sandbox readiness does not send SMS.
- Template readiness does not enable provider/Twilio behavior.
- Real SMS remains deferred until provider setup, webhook/signature validation, consent/suppression gates, legal/provider review, and explicit activation are approved later.

## F5A Cross-Reference (May 2026)

Slice F5A Background On-The-Way Intent Handoff Model Lock is complete in docs/model-only mode.

- future On-The-Way SMS intent creation must anchor to a successful `on_my_way` `job_events` row before any provider path exists
- `sms_message_intents` is the first future SMS decision/audit truth after that handoff
- `sms_provider_deliveries` remains later provider submission/callback truth only
- current implementation constraint is explicit: current `insertJobEvent` does not return inserted event id and the current breadcrumb write is best-effort after the status update
- future provider/Twilio work must remain outside the synchronous Mark On The Way action
- preferred future direction is explicit event-id anchoring before non-sending intent creation; latest-event lookup is fallback-only
- Mark On The Way still does not send SMS; real SMS remains deferred

## F5B Cross-Reference (May 2026)

SMS Slice F5B Non-Sending On-The-Way Intent Eligibility Helper is complete in implementation commit `9814340`.

- Added `lib/communications/sms-on-the-way-intent-eligibility.ts` and `lib/communications/__tests__/sms-on-the-way-intent-eligibility.test.ts`.
- Helper API: `evaluateOnTheWayIntentEligibility(params): Promise<OnTheWayIntentEligibilityResult>`.
- The helper is read-only and non-sending; it composes existing recipient, eligibility, template-governance, and provider-readiness helpers and adds F5B-specific job plus durable `on_my_way` event-anchor checks.
- It validates durable `on_my_way` anchor readiness, separates structural blocks from deferred live-send warnings, returns `liveSendEnabled` false, and does not return `canSend`.
- No `sms_message_intents` rows are written yet, no provider delivery rows are written, and no provider/Twilio send, webhook/status callback, or activation behavior is introduced here.
- Mark On The Way still does not send SMS; real SMS remains deferred.
- F5C should be planned/audited before implementation; likely next is non-sending `sms_message_intents` creation from eligible durable `on_my_way` anchors, while provider send/webhook/activation remain deferred.

## F5C-A Model Lock (May 2026)

SMS Slice F5C-A On-The-Way Intent Creation Model Lock is complete in docs/model-only mode.

- F5C writes non-sending `sms_message_intents` only and does not create `sms_provider_deliveries`.
- F5C does not call provider/Twilio and does not send SMS.
- F5C writes only when required recipient/template/version/body snapshot fields exist from truth.
- Missing required fields for blocked/skipped outcomes returns no-insert/write-skipped; no fake recipient/template/snapshot values.
- Preferred anchor remains explicit event-id handoff from successful `on_my_way` event insert; query-latest remains fallback-only.
- Mark On The Way remains lifecycle-first and unchanged; intent creation failure does not roll back lifecycle success.
- Forward sequence: F5C-B helper only, F5C-C event-id handoff support, F5C-D best-effort Mark On The Way integration; provider/webhook/activation remain deferred.

## F6A Provider/Twilio Sandbox Send Model Lock (May 2026)

Slice F6A closes the provider/Twilio sandbox send model in documentation only.

Locked boundary:

- F6A is docs/model lock only.
- The first sandbox send must be manual/admin-only.
- Sandbox send must consume existing `sms_message_intents` only.
- Sandbox send must require `decision_outcome = ready_for_provider`.
- Sandbox send must not be triggered from Mark On The Way yet.
- Mark On The Way remains lifecycle-first and intent/audit-only.
- No Twilio helper, provider-delivery helper, env var, send action, webhook, sandbox SMS, or live SMS is approved in F6A.
- Real SMS remains deferred.

Required gates before any future sandbox submit:

Intent gates:

- same-account intent lookup
- `message_class = on_the_way`
- `decision_outcome = ready_for_provider`
- no existing `sms_provider_deliveries` row for that intent
- durable `job_event_id` exists
- recipient snapshot, template key/version, and `message_body_snapshot` are present

Template gates:

- current sandbox template/version should match the intent template/body snapshot before sandbox send unless a later slice explicitly approves accepting frozen intent snapshots without a current sandbox-template match
- template readiness and sandbox wording readiness do not equal SMS activation

Recipient and consent gates:

- contact recipient still exists and remains active
- phone remains present
- consent remains opted in for the On-The-Way message class
- no active recipient-level or phone-level suppression exists
- quiet-hours remains deferred, so manual sandbox send must either block until quiet-hours is implemented or be limited to verified sandbox/test recipients under an explicit server-only sandbox gate

Provider and sender gates:

- sandbox provider configuration exists
- provider environment is `sandbox`
- readiness state supports `sandbox_only`, `ready_for_sandbox`, or stronger
- sender identity exists and is verified/active for sandbox
- Messaging Service ref is configured
- provider refs and secrets remain server-only and must not render in browser data

Activation and legal gates:

- a server-only sandbox enablement gate is required later before any sandbox submit path exists
- STOP/HELP readiness is required before sandbox send work proceeds beyond controlled test-recipient smoke
- live send requires provider/legal review and explicit activation

Provider delivery write model:

- create the `sms_provider_deliveries` row before the provider call as the durable submit reservation
- initial row starts with `provider_status = not_submitted`
- initial row includes `account_owner_user_id`, `sms_message_intent_id`, and `provider_name = twilio`
- after a later Twilio response, store Twilio `MessageSid` in `provider_message_id`
- map the initial Twilio status to normalized `provider_status`
- store raw Twilio status in `provider_raw_status`
- set `submitted_at` when provider handoff is accepted/attempted
- on immediate failure, set `failed_at`, `provider_error_code`, and `provider_error_message`
- provider delivery failure must not update job status
- provider delivery failure must not create job timeline delivery claims

Twilio integration boundary:

- later Twilio send should use the Messages API
- prefer `MessagingServiceSid` over direct `From`
- `To` comes from the intent recipient phone snapshot
- `Body` comes from the intent message body snapshot
- likely future server-only secrets/config include `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` or API key/secret, `TWILIO_MESSAGING_SERVICE_SID`, callback base URL, and signature-validation config
- no Twilio secrets or raw provider refs belong in browser HTML, browser JSON, logs intended for support users, or `NEXT_PUBLIC_*`

Webhook/status callback lock:

- webhook/status callback implementation can wait for a tightly controlled manual sandbox smoke only if the UI makes no delivery claim beyond immediate `submitted`/`queued`/`sandbox submit attempted` style language
- live send must not proceed until Twilio request signature validation, status callback route, inbound/opt-out route or confirmed Advanced Opt-Out handling, provider-message-id idempotency, duplicate/out-of-order callback handling, safe payload retention, and STOP/HELP state recording are implemented or explicitly approved
- if Twilio/provider Advanced Opt-Out is used, local suppression state still must be reconciled without double-replying

Risk lock:

- compliance risk remains high until A2P/STOP/HELP/legal/provider review is complete
- duplicate send risk requires the unique intent/delivery guard and one delivery row per intent
- tenant leakage risk requires same-account lookups and server-only provider refs
- lifecycle rollback must remain impossible
- UI/reporting must avoid false sent/delivered claims; use `sandbox submit attempted` language until callback truth exists

Forward sequence:

A. F6A docs/model lock.
B. F6B provider delivery preflight/helper only, no Twilio call.
C. F6C-A manual sandbox send model lock.
D. F6C-B server-only provider config resolver, no sends.
E. F6C-C manual admin-only sandbox send action, server-only gated and only after explicit Twilio sandbox/env/test-recipient setup approval.
F. F6D status callback planning/implementation before live send.
G. Later sandbox SMS only after explicit approval.
H. Later live SMS only after provider/legal review, webhook readiness, STOP/HELP readiness, and explicit activation.

## F6B Completion Cross-Reference (May 2026)

SMS Slice F6B Provider Delivery Preflight Helper is complete in implementation commit `f1214ae`.

- Added `lib/communications/sms-provider-delivery-preflight.ts` and `lib/communications/__tests__/sms-provider-delivery-preflight.test.ts`.
- Helper API: `prepareSmsProviderDeliveryPreflight(params): Promise<PrepareSmsProviderDeliveryPreflightResult>`.
- Helper reads scoped `sms_message_intents` row by id and account scope, validates `message_class = on_the_way` and `decision_outcome = ready_for_provider`, and checks all required fields present (message_body_snapshot, recipient_phone_snapshot, template_version, job_event_id).
- Ready behavior: writes one `sms_provider_deliveries` row with `provider_name = twilio` and `provider_status = not_submitted` when all required truth exists and no delivery conflict.
- Deduped behavior: existing delivery or insert unique conflict treated as deduped success (created false, deduped true, returns existing delivery id).
- Blocked behavior: invalid intent or missing required fields returns blocked reasons array and no row insert.
- Non-sending infrastructure: helper does not call Twilio/provider, does not send SMS, does not set `provider_message_id`, does not set `submitted_at`, does not mark sent/delivered/failed, and does not mutate jobs, job_events, or sms_message_intents.
- Account scope enforced: missing `account_owner_user_id` or `sms_message_intent_id` blocks operation.
- Helper returns `liveSendEnabled` false always and does not return `canSend`; provider submission eligibility is deferred to F6C/later layers.
- Validation recorded: new preflight helper tests `17/17`, existing SMS intent create tests `12/12`, SMS eligibility tests `12/12`, template governance tests `15/15`, template validation tests `19/19`, provider readiness tests `16/16`, eligibility inputs tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed. Total: `52/52` tests passed.
- No `sms_provider_deliveries` rows actually created (non-sending audit infrastructure/preflight only); no production writes.
- Future F6C-C manual admin-only sandbox send action can query for `sms_provider_deliveries` rows with `provider_status = not_submitted` and proceed with Twilio submission only after F6C-A/F6C-B gates and explicit Twilio sandbox/env/test-recipient setup approval.
- Mark On The Way still does not send SMS; real SMS remains deferred.

## F6C-A Manual Admin Sandbox Send Model Lock (May 2026)

Slice F6C-A closes the manual admin sandbox send model in documentation only.

Locked boundary:

- F6C-A is docs/model lock only.
- The first sandbox send must be manual/admin-only.
- The first sandbox send must consume an existing `sms_provider_deliveries` row created by the F6B preflight path.
- Required starting state is `provider_status = not_submitted`.
- The action must not be triggered by Mark On The Way.
- The action must not live on job pages.
- Mark On The Way remains lifecycle + non-sending intent/preflight only.
- No Twilio helper, provider config resolver, env var, provider call, send action, webhook, sandbox SMS, or live SMS is approved in F6C-A.
- Real SMS remains deferred.

## F6C-B Completion Cross-Reference (May 2026)

SMS Slice F6C-B Server-Only Provider Config Resolver is complete in implementation commit `e292c34`.

- Added `lib/communications/sms-provider-config-resolver.ts` and `lib/communications/__tests__/sms-provider-config-resolver.test.ts`.
- Helper API: `resolveSmsSandboxProviderConfig(params): Promise<ResolveSmsSandboxProviderConfigResult>`.
- Resolver is server-only readiness infrastructure; no provider submit behavior is implemented.
- Resolver reads only `sms_provider_configurations` and `sms_sender_identities` under account scope.
- Resolver requires `provider_name = twilio`, `provider_environment = sandbox`, sandbox-capable provider readiness, verified/active sender identity, and Messaging Service configuration.
- Resolver enforces server-only sandbox send gate and fails closed with `sandbox_send_gate_missing_or_disabled` when gate is missing or disabled.
- Resolver does not read env secrets, does not call Twilio/provider, does not send SMS, and does not mutate provider config/sender identity rows.
- Resolver output is safe-readiness only and does not expose Account SID/Auth Token/API keys/Messaging Service SID or raw provider refs/secrets.
- Resolver does not return `canSend` and always returns `liveSendEnabled = false`.
- Validation recorded: new resolver tests `15/15`, provider delivery preflight tests `17/17`, provider readiness tests `16/16`, intent create tests `12/12`, `npx.cmd tsc --noEmit` passed, and `git diff --check` passed.
- Mark On The Way still does not send SMS; real SMS remains deferred.

## F6C-C1 Manual Sandbox Send Gate + Resolver Model Lock (May 2026)

F6C-C1 is docs/model lock only.

Locked decisions:

- Manual sandbox send remains deferred in F6C-C1.
- Twilio/provider calls remain deferred in F6C-C1.
- Dry-run/reservation action remains deferred until after this model lock.
- Mark On The Way still does not send SMS.
- Real SMS remains deferred.

Sandbox send gate model lock:

- A schema-backed or otherwise deterministic server-only sandbox send gate is required before F6C-C2/F6C-C3.
- Current resolver fail-closed behavior is correct when gate is missing (`sandbox_send_gate_missing_or_disabled`).
- Future implementation must not bypass the gate failure.
- Gate must be server-only/admin-controlled, must not be client-trusted, and must not enable live SMS.
- Gate authorizes manual sandbox test submission only.

Preferred future gate location:

- Preferred model: explicit field on `sms_provider_configurations` (for example `sandbox_send_enabled boolean default false`).
- Alternative model: separate account-level SMS send gate table/setting.
- If preferred field is chosen, schema work belongs to a future slice and is not included in F6C-C1.
- Resolver should eventually check the schema-backed gate directly.

Provider config disambiguation lock:

- Resolver must explicitly select `provider_name = twilio` and `provider_environment = sandbox`.
- Resolver must not rely on ambiguous account-only provider configuration lookup.
- If multiple rows exist, sandbox row is chosen only by account + provider + environment.
- Production provider rows must never satisfy sandbox send readiness.

Test-recipient gate lock:

- First manual sandbox send must be limited to verified sandbox/test recipients.
- Current model does not yet provide a complete test-recipient allowlist.
- Conservative lock: fail closed for real sandbox send action until verified sandbox/test-recipient policy exists.
- Quiet-hours remains deferred only for verified test recipients; otherwise sandbox sends fail closed.

Dry-run/reservation lock for F6C-C2:

- F6C-C2 should be dry-run/manual reservation readiness action only, no Twilio call.
- Action input remains `delivery_id` only.
- It evaluates account scope, delivery, intent, provider config resolver, test-recipient gate, and status eligibility.
- It returns safe notice codes/readiness output only.
- It does not mutate delivery rows unless explicitly approved in that slice; if any mutation is approved, it must not call Twilio and must not imply sent.

Notice-code category lock:

- `sandbox_provider_not_ready`
- `sandbox_send_gate_missing_or_disabled`
- `sandbox_test_recipient_required`
- `sandbox_delivery_missing`
- `sandbox_delivery_not_ready`
- `sandbox_delivery_already_submitted`
- `sandbox_delivery_reserved`
- `sandbox_provider_submit_attempted`
- `sandbox_provider_immediate_failure`
- `sandbox_internal_error`

Crash/reconciliation lock:

- Current schema still lacks a true in-flight/reservation status.
- Using `submitted` as reservation remains acceptable only for controlled sandbox smoke.
- Crash after reservation before provider response remains a known risk.
- Reconciliation/retry strategy remains later work unless schema change is intentionally chosen first.

Webhook/live-send deferral lock:

- Webhook/status callback remains deferred for tightly controlled manual sandbox smoke only.
- Webhook/status callback is required before live SMS.
- Live SMS requires legal/provider/A2P/STOP/HELP review plus explicit activation approval.

Forward sequence lock:

- F6C-C1 docs/model lock.
- F6C-C2 dry-run/manual reservation action, no Twilio call.
- F6C-C3 real manual sandbox send action only after explicit Twilio sandbox/env/test-recipient setup approval.
- F6D webhook/status callback planning/implementation before live SMS.
- Live SMS later only after legal/provider/activation approval.

## F6C-C2 Dry-Run Sandbox Delivery Reservation Action Closeout (May 2026)

SMS Slice F6C-C2 is complete in implementation commit `8d6043e`.

- Added `lib/actions/sms-sandbox-send-actions.ts` and `lib/actions/__tests__/sms-sandbox-send-actions.test.ts`.
- Action API: `reserveSmsSandboxDeliveryDryRunFromForm(formData: FormData): Promise<void>`.
- Action is admin-only and accepts `delivery_id` only.
- Action derives account scope from authenticated internal user context.
- Action re-reads same-account delivery and linked intent server-side.
- Action re-checks delivery readiness (`provider_name = twilio`, `provider_status = not_submitted`, no `provider_message_id`).
- Action re-checks linked intent readiness (`message_class = on_the_way`, `decision_outcome = ready_for_provider`, durable `job_event_id`, recipient/body/template snapshots present).
- Action uses `resolveSmsSandboxProviderConfig` and fails closed when sandbox send gate is missing/disabled.
- Action remains evaluation-only/dry-run infrastructure and does not reserve/consume delivery rows.
- Action does not call Twilio/provider, does not send SMS, and does not submit to provider.
- Action does not mutate `sms_provider_deliveries`, does not set `submitted_at`, does not set `provider_message_id`, and does not change provider status.
- Action does not mutate `jobs` or `job_events` and does not create provider timeline claims.
- Action returns safe redirect notice codes only and remains fail-closed.
- Current expected dry-run end-state is `sandbox_test_recipient_required` until verified sandbox test-recipient policy is modeled.
- Mark On The Way still does not send SMS; real SMS remains deferred.

F6C-C2 validation recorded:

- `npx.cmd vitest run lib/actions/__tests__/sms-sandbox-send-actions.test.ts` passed (`16/16`).
- `npx.cmd vitest run lib/communications/__tests__/sms-provider-config-resolver.test.ts` passed (`15/15`).
- `npx.cmd vitest run lib/communications/__tests__/sms-provider-delivery-preflight.test.ts` passed (`17/17`).
- `npx.cmd vitest run lib/communications/__tests__/sms-on-the-way-intent-create.test.ts` passed (`12/12`).
- `npx.cmd tsc --noEmit` passed.
- `git diff --check` passed.

Forward sequence update:

- F6C-C2 docs closeout complete.
- Next: model/implement verified sandbox test-recipient gate and/or schema-backed sandbox send gate as explicitly approved.
- F6C-C3 real manual sandbox send action remains deferred until explicit Twilio sandbox/env/test-recipient approval.
- F6D webhook/status callback planning/implementation remains required before live SMS.
- Live SMS remains deferred until legal/provider/activation approval.

## F6C-C3A Sandbox Test Recipient + Send Gate Model Lock (May 2026)

F6C-C3A is docs/model lock only.

- Real sandbox SMS send remains deferred.
- Twilio/provider calls remain deferred.
- Live SMS remains deferred.
- Mark On The Way still does not send SMS.

Verified sandbox/test-recipient gate lock:

- First real sandbox send must be limited to verified sandbox/test recipients.
- Current dry-run blocker `sandbox_test_recipient_required` remains correct until this gate is modeled.
- Client input must not be trusted to mark a recipient as test-approved.
- Test-recipient approval must be account-scoped and admin-controlled.
- The gate must prevent accidental live/customer sends.
- Future verification must require same account, recipient tied to the target intent/delivery, phone snapshot matching an approved test-recipient record (or approved admin-only test value), active recipient posture, and acceptable consent/suppression posture.
- Quiet-hours may remain deferred only for verified sandbox/test recipients.
- If recipient is not verified as sandbox/test-approved, sandbox send must fail closed.

Preferred future test-recipient model:

- Preferred model is account-scoped `sms_sandbox_test_recipients` table or equivalent account-level server setting.
- Minimum fields likely needed: `account_owner_user_id`, normalized `phone_e164` (or safe phone hash), `display_label`, `is_active`, `verified_at`, `verified_by_user_id`, `created_at`, and `updated_at`.
- No customer/job dependency is required for test-recipient approval records.
- Test-recipient approval does not imply broad customer communication permission.
- Test-recipient approval does not imply live-send approval.
- Schema work is deferred to future slice and is not part of F6C-C3A.

Sandbox send gate lock:

- Current resolver gate requirement and fail-closed behavior remain correct (`sandbox_send_gate_missing_or_disabled`).
- Preferred model remains explicit account-scoped/server-only gate on `sms_provider_configurations` (for example `sandbox_send_enabled boolean default false`), or an intentionally chosen dedicated account-level gate.
- Gate must be account-scoped, admin/server controlled, and manual-sandbox-only.
- Gate must not enable live SMS.
- Schema work remains deferred beyond F6C-C3A.

Resolver disambiguation lock:

- Resolver must explicitly select by account + `provider_name = twilio` + `provider_environment = sandbox`.
- Production provider configuration must never satisfy sandbox readiness.
- Future resolver patch should be surgical and fully tested before real sandbox send.

No-go boundaries:

- No job-page send button.
- No Mark On The Way trigger for sandbox send.
- No live send.
- No SMS enabled language.
- No delivered claims without callback truth.
- No provider credentials in browser.
- No `NEXT_PUBLIC_*` secrets.

Future sequence lock:

- F6C-C3A docs/model lock.
- F6C-C3B schema/model implementation for sandbox send gate + sandbox test-recipient gate if approved.
- F6C-C3C resolver update to use schema-backed gate and explicit sandbox provider selection.
- F6C-C3D dry-run action update to pass only when test-recipient and sandbox gate are configured.
- F6C-C4 real manual sandbox send action only after explicit Twilio sandbox/env/test-recipient approval.
- F6D webhook/status callback planning/implementation before live SMS.
- Live SMS only after legal/provider/A2P/STOP/HELP/activation approval.

Forward sequence update:

- F6C-B docs closeout complete.
- F6C-C manual admin-only sandbox send action is deferred until explicit Twilio sandbox/env/test-recipient setup approval.
- Webhook/status callback remains deferred.
- Live SMS remains deferred pending legal/provider/activation approval.

Recommended F6C sequence:

A. F6C-A docs/model lock.
B. F6C-B server-only provider config resolver, no sends.
C. F6C-C manual admin sandbox send action only after explicit Twilio sandbox/env/test-recipient setup approval.
D. F6D status callback/webhook planning and implementation before live send.
E. Live SMS only after legal/provider/activation approval.

Required gates before a future manual sandbox submit:

- admin actor only
- same-account `sms_provider_deliveries` row
- `provider_name = twilio`
- `provider_status = not_submitted`
- no `provider_message_id`
- linked same-account intent exists
- intent has `message_class = on_the_way`
- intent has `decision_outcome = ready_for_provider`
- intent has durable `job_event_id`
- intent has `recipient_phone_snapshot`, `message_body_snapshot`, `template_key = on_the_way`, and `template_version`
- current recipient still active, opted in, and unsuppressed
- sandbox-approved template still matches the intent snapshot unless later explicitly changed
- sandbox provider configuration exists
- provider environment is `sandbox`
- sender identity is verified/active for sandbox
- Messaging Service ref is configured
- server-only sandbox send gate is enabled
- first manual sandbox send is limited to verified sandbox/test recipients

Quiet-hours posture:

- Quiet-hours must not block Mark On The Way lifecycle behavior.
- For manual sandbox sends, the safest path is verified sandbox/test recipients only or fail closed until quiet-hours exists.
- No UI or status copy may imply live customer send readiness until quiet-hours, callback, legal, provider, and activation gates are complete.

Provider delivery state transition lock:

- Start: `not_submitted`.
- Immediately before a future Twilio call, reserve the row with a guarded update from `not_submitted` to `submitted`, setting `submitted_at`.
- The guarded update must require same account, same delivery id, `provider_status = not_submitted`, and no `provider_message_id`.
- If the guarded update affects zero rows, return a dedupe/stale notice and do not call Twilio.
- On a future Twilio response, store Twilio `MessageSid` in `provider_message_id`, store raw Twilio status in `provider_raw_status`, and normalize the initial status to `queued` or `submitted` depending on the provider response.
- On immediate provider error, set `provider_status = failed`, `failed_at`, `provider_error_code`, and `provider_error_message`.
- Never set `sent` or `delivered` without callback truth.
- Never update job status.
- Never create job timeline delivery claims.

Reservation risk:

- The current schema has no true in-flight/reservation status.
- Using `submitted` as the reservation state is acceptable only for tightly controlled manual sandbox smoke.
- A crash after reservation but before provider response is an acknowledged risk.
- A stronger retry/in-flight model may require a later schema decision and remains parked unless explicitly chosen.

Twilio/server-only boundary:

- Future send request should use Twilio Messages API.
- Prefer `MessagingServiceSid` over direct `From`.
- `To` comes from `sms_message_intents.recipient_phone_snapshot`.
- `Body` comes from `sms_message_intents.message_body_snapshot`.
- No browser data may include credentials, raw provider refs, Account SID, Auth Token, API secret, full phone numbers beyond approved admin-safe display needs, or raw request/response dumps.
- Secrets remain server-only and must not use `NEXT_PUBLIC_*`.

Duplicate/idempotency strategy:

- Existing one-delivery-per-intent uniqueness remains primary.
- Future action accepts only `delivery_id`.
- Server resolves account, delivery, intent, recipient, template, provider config, and sender identity.
- Client must not provide account ids or provider refs.
- Guarded reservation update prevents duplicate provider submissions.
- If delivery is already reserved/submitted or has provider id, the action must not call Twilio.

UI posture:

- No F6C UI is approved yet.
- Later UI should live only in Admin Communications or an internal-only admin test surface.
- Later UI must be hidden from Mark On The Way and job pages.
- Allowed wording: `Submit sandbox SMS test`, `Sandbox submit attempted`, `Queued by provider`, and `Accepted by provider` only when returned by provider.
- Avoid: `Send to customer`, `Delivered`, `SMS enabled`, `Live SMS`, and job-detail send buttons.

Webhook/live-send deferral:

- Missing webhook is acceptable only for tightly controlled manual sandbox smoke.
- Before live send, the system must have a status callback route, Twilio signature validation, inbound/opt-out handling or confirmed Advanced Opt-Out handling, callback idempotency, duplicate/out-of-order callback handling, safe payload retention policy, legal/provider/A2P/STOP/HELP review, and explicit activation approval.

Risk lock:

- Compliance risk remains high until STOP/HELP, A2P/provider/legal review are complete.
- Accidental live-send risk is high unless sandbox env/config/test-recipient gates are strict and server-only.
- Duplicate-send risk is medium with the current schema and is controlled by guarded reservation.
- Tenant leakage risk is medium/high unless all lookups are account-scoped and client never supplies account ids.
- False delivered-claim risk is high unless UI only says submit/queued/accepted before callback truth.
- Missing-webhook risk is acceptable only for manual sandbox smoke, not live.

---

## 1) Current Decision

Slice F1 closes the Provider/Twilio readiness planning contract only.

Locked decision for this slice:

- Twilio is the likely V1 SMS provider direction.
- Internal data model and product logic remain provider-neutral.
- No Twilio/provider implementation is approved in this slice.
- No provider setup, credentials, environment variables, sandbox sends, or live sends are approved in this slice.
- Sender identity/provider configuration model lock is now documented in `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md` (F2A docs/model-only).
- Real SMS remains deferred.

Explicit non-implementation boundary for this slice:

- no code changes
- no behavior changes
- no schema changes
- no migrations
- no Supabase commands
- no production writes
- no provider setup
- no Twilio account changes
- no Twilio API calls
- no sandbox SMS sends
- no live SMS sends
- no environment/secret changes
- no feature flag changes
- no send endpoint
- no webhook route

---

## 2) Provider Strategy

Preferred V1 planning direction: Twilio Messaging Service.

Rationale:

- centralizes sender pool and sender-selection configuration
- supports service-level status callback configuration
- supports opt-out management / Advanced Opt-Out controls
- better multi-sender and scaling fit than raw per-request `From`-only logic

Provider-neutral model lock remains mandatory:

- `provider_name`
- `provider_message_id`
- `provider_status`
- `provider_raw_status`

Do not introduce Twilio-specific table names or column names.

---

## 3) Sender Type and Registration Strategy

U.S. application-to-person SMS requires carrier/provider compliance planning before any send implementation.

Planning posture:

- A2P 10DLC is likely required for local long-code operational SMS.
- Toll-free verification is a comparison path and must be evaluated intentionally, not selected by default.
- First-owner/business rollout planning assumes direct business sender posture unless an ISV/multi-tenant sender strategy is explicitly selected.
- Marketplace future requires sender identity to be tenant/account scoped.

---

## 4) A2P and Registration Checklist (Planning)

Future registration-readiness information required before sender setup and sandbox send:

- business legal identity and business details
- EIN/tax/business registration data where applicable
- business address and contact details
- customer type / brand type and campaign use case
- message samples by use case
- opt-in method and auditable evidence
- opt-out handling posture
- help behavior posture
- privacy policy and terms links if provider/compliance process requires them
- message volume and throughput expectations
- sender-number and/or Messaging Service sender configuration plan
- approval/review timeline and delay risk treatment

---

## 5) On-The-Way Campaign Classification

On-The-Way classification remains strictly operational/customer-care/service-logistics.

Do not mix into On-The-Way SMS:

- promotional language
- discounts
- upsell language
- review solicitation/incentive
- referral or sales wording

Mixed operational + promotional content must be classified as marketing/promotional and parked for separate consent/compliance/legal/provider approval.

---

## 6) Planning-Only Sample Template

Planning-only template sample:

Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.

Template boundary lock:

- this is not final legal/provider-approved production wording
- final wording requires legal/provider review before live activation
- field users cannot edit this message
- admin template governance remains future Settings -> Communications work

---

## 7) Opt-In, Opt-Out, and Help Expectations

Future live-send posture must enforce:

- consent/opt-in exists before send
- STOP/opt-out handling is enforced
- HELP behavior is planned and implemented

Planning requirement:

- Twilio Messaging Service opt-out management and Advanced Opt-Out behavior must be evaluated for selected sender strategy

Internal authority boundary:

- local suppression (`contact_recipient_suppressions`) remains app-side hard-stop source
- future provider opt-out events must map back into local suppression state

---

## 8) Webhook and Status Callback Readiness (Planning)

Future route planning examples (not implemented in this slice):

- `/api/sms/twilio/status-callback`
- `/api/sms/twilio/inbound`

No webhook route is implemented in this slice.

Future callback requirements:

- validate Twilio request signatures
- accept evolving callback parameter sets without brittle allowlists
- map provider statuses to normalized internal status
- store raw provider status alongside normalized status
- handle duplicate and out-of-order callbacks idempotently
- use trusted server-side/service-role write path for provider-delivery updates
- never trust arbitrary client-supplied account identifiers
- resolve account scope via provider message id and internal mapping

---

## 9) Callback and Status Mapping (Planning)

Future mapping contract:

- Twilio `MessageSid` -> `sms_provider_deliveries.provider_message_id`
- Twilio `MessageStatus` -> `provider_raw_status` and normalized `provider_status`
- Twilio `ErrorCode` -> `provider_error_code`
- provider error text/message (if available) -> `provider_error_message`
- callback payload -> `provider_callback_payload_snapshot`
- callback received time -> `provider_last_event_at`
- delivered/failed outcomes -> delivery timestamp fields when applicable

---

## 10) Environment and Secrets Planning

Future server-only configuration likely required:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN` or API key/secret pair
- `TWILIO_MESSAGING_SERVICE_SID`
- provider name/config value
- webhook validation credential/token as applicable
- canonical public callback base URL

Locked boundary for this slice:

- no environment variables are added
- no secrets are changed

Secret handling posture:

- secrets must never be exposed in `NEXT_PUBLIC_*`
- sandbox/staging/production credentials must be separated

---

## 11) Existing Schema Fit and Missing Pre-Sandbox Pieces

Current audit-first foundation supports provider readiness planning:

- `contact_recipients`
- `contact_recipient_consents`
- `contact_recipient_suppressions`
- `sms_message_intents`
- `sms_provider_deliveries`

Missing before any sandbox-send implementation:

- sender identity / provider configuration implementation wiring and mutation contract
- Settings -> Communications readiness route/read-model implementation
- admin template governance/storage model
- webhook route + signature-validation implementation
- provider status normalization implementation layer
- activation/readiness settings implementation

F2B closeout cross-reference:

- Sender identity/provider configuration schema foundation is now complete in commit `f093bdd` via `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`.
- F2B created `sms_provider_configurations` and `sms_sender_identities` as account-scoped metadata foundations with select-only RLS in V1.
- F2B did not add provider setup, webhook/send behavior, sandbox/live SMS behavior, env/secret changes, or activation behavior.

No sandbox send should occur until these gaps are resolved.

---

## 12) Settings -> Communications Implications

Future Settings -> Communications planning sections:

- provider status
- sender identity
- A2P/registration readiness
- opt-out/help readiness
- template governance status
- sandbox readiness
- activation gate status

Locked boundary in this slice:

- planning only
- no settings UI implementation
- activation remains disabled until all gates complete

---

## 13) Marketplace and Multi-Tenant Guardrails

Sender identity and provider readiness must remain tenant/account scoped.

Guardrails:

- no cross-tenant sender/recipient leakage
- avoid shared sender identity unless intentionally designed and legally/provider reviewed
- future marketplace may require per-tenant subaccounts, Messaging Services, and/or registration flows
- no Eddie-specific sender assumptions

---

## 14) Risk Assessment

Primary risks before implementation:

- A2P/registration rejection or approval delays
- weak or non-auditable opt-in/opt-out evidence
- webhook spoofing risk if signature validation is weak
- duplicate/out-of-order callback reconciliation errors
- tenant leakage via shared provider configuration
- template content drift into disallowed or mixed classification
- user confusion if settings imply activation before readiness

---

## 15) Recommended Next Sequence

A. F1 Provider/Twilio readiness spec closeout (this document). ✓ Complete
B. F2A sender identity/provider configuration model lock closeout (`docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md`). ✓ Complete
C. F2B provider configuration + sender identity schema foundation closeout (`supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`, commit `f093bdd`). ✓ Complete
D. F3A Settings Communications readiness UI model lock closeout (`docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md`). ✓ Complete
E. F3B read-model helper implementation (`lib/communications/sms-provider-readiness-read.ts`). ✓ Complete (commit `d370e56`)
F. F3C read-only Admin Center route/page implementation (`/ops/admin/communications`). ✓ Complete (commit `994e79c`)
G. F4A On-The-Way Template Governance model lock closeout (`docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md`). ✓ Complete
H. F4B template schema foundation (`sms_message_templates`, `sms_message_template_versions`) with no send/provider behavior. ✓ Complete (`b676736`)
I. F4C-A template governance read-model helper (`lib/communications/sms-template-governance-read.ts`). ✓ Complete (`0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`)
J. F4C-B read-only template status/sample preview in `/ops/admin/communications`. ✓ Complete (`05475929cc69704b1fb22f3dabbde10ff83aed90`, stabilized by `1ffa475e2167eeb60a206358a4e7032a407bdd0f`)
K. F4D-A template editing/review actions model lock. Complete.
L. F4D-B validation helper only; no writes, no UI. ✓ Complete (`418172e`)
M. F4D-C create/save draft server actions.
N. F4D-D review actions.
O. F4D-E1 create/save draft UI. ✓ Complete (`1b8b671`)
P. F4D-E2 safe version-id/action-eligibility read-model support for admin readiness. ✓ Complete (`fededec`)
Q. F4D-E3A combined admin readiness action. ✓ Complete (`8cfa814`)
R. F4D-E3B mark-ready UI wiring. ✓ Complete (`c998d0e`)
S. F6A provider/Twilio sandbox send model lock. Complete.
T. F6B provider delivery preflight/helper only, no Twilio call.
U. F6C-A manual sandbox send model lock. Complete.
V. F6C-B server-only provider config resolver, no sends.
W. F6C-C manual admin-only sandbox send action, server-only gated and only after explicit Twilio sandbox/env/test-recipient setup approval.
X. F6D status callback planning/implementation before live send.
Y. Sandbox send only after sender identity, template governance, consent/suppression, audit model, server-only sandbox gates, and explicit approval are ready.
Z. Production activation only after provider/legal review and explicit approval.

---

## Official Twilio Reference Notes

Primary official references used for this planning slice:

- Twilio Docs: Programmable Messaging and A2P 10DLC
  - https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- Twilio Docs: Messaging Services
  - https://www.twilio.com/docs/messaging/services
- Twilio Docs: Messages Resource (status values, status callback request shape, sender and MessagingServiceSid behavior)
  - https://www.twilio.com/docs/messaging/api/message-resource
- Twilio Docs: Security - Validating requests are coming from Twilio
  - https://www.twilio.com/docs/usage/security#validating-requests
- Twilio Docs: Twilio's request to your incoming message Webhook URL (webhook parameter evolution guidance)
  - https://www.twilio.com/docs/messaging/guides/webhook-request
- Twilio Docs: Customize users' opt-in and opt-out experience with Advanced Opt-Out
  - https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out
- Twilio Docs: Toll-free verification console onboarding guide
  - https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding
- Twilio Docs: Get started with toll-free verification using the API
  - https://www.twilio.com/docs/messaging/compliance/toll-free/api-onboarding

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md
- docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md
- docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md
- docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
