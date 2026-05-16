# Compliance Matters - SMS Message Intent and Provider Delivery Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## Slice E2 Closeout Status (2026-05-15)

SMS Slice E2 Message Intent + Provider Delivery Audit Foundation is complete.

- Implementation commit: `b90c9ea`
- Migration: `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql`
- Created tables:
  - `sms_message_intents`
  - `sms_provider_deliveries`

Closeout semantics recorded:

- `sms_message_intents` stores future send-request and pre-provider decision audit context; it is not provider delivery truth.
- `sms_provider_deliveries` stores future provider submission/callback truth; it is not a manual contact log.
- V1 cardinality is enforced as one current delivery row per intent.
- Account-scoped idempotency foundation exists for intents.
- Provider status foundation is provider-neutral and Twilio-aware, not Twilio-specific.
- No provider delivery write path was added in this slice.
- No send endpoint, webhook, provider integration, or live SMS behavior was added.
- No `job_events` provider summary behavior was added; `job_events` remains non-authoritative for provider truth.
- Manual contact logs remain separate from provider audit truth.
- Quiet-hours/timezone is future conservative fail-closed send-eligibility policy only; it must not block Mark On The Way or lifecycle/status transitions.

Validation recorded:

- `npx.cmd tsc --noEmit` passed.
- `npx.cmd vitest run lib/communications/__tests__/sms-eligibility-inputs-read.test.ts` passed (`16/16`).
- `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed (`4/4`).
- `git diff --check` passed.
- `supabase db reset --local --no-seed --yes` passed.
- Full local migration chain applied successfully, including E2.

Boundary confirmation:

- no data backfill
- no production migration apply
- no production writes
- real SMS remains deferred pending remaining activation gates
- marketplace guardrail preserved: this is neutral tenant/account-scoped communication audit infrastructure

Slice F1 planning cross-reference (docs/model-only):

- Provider/Twilio readiness planning is now captured in `docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md`.
- F1 confirms Twilio likely direction with provider-neutral internal model lock.
- F1 does not approve provider setup, credentials, send endpoint, webhook, sandbox send, or live SMS.

Slice F2A planning cross-reference (docs/model-only):

- Sender identity/provider configuration model lock is now captured in `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md`.
- F2A keeps E2 tables unchanged in this slice, allows parked `sender_identity_ref` text posture while no send path exists, and parks FK additions (`sender_identity_id` / `provider_configuration_id`) for later explicit approval.
- F2A does not approve send endpoint, webhook, provider callbacks, sandbox send, or live SMS.

Slice F2B closeout cross-reference (schema foundation only):

- Provider configuration + sender identity schema foundation is complete in commit `f093bdd` via `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`.
- F2B created `sms_provider_configurations` and `sms_sender_identities` with no-secret metadata posture and account-scoped SELECT RLS only in V1.
- F2B did not alter `sms_message_intents` or `sms_provider_deliveries` in this slice.
- Real SMS remains deferred.

Slice F3A model lock cross-reference (settings readiness UI posture):

- Settings -> Communications readiness UI model lock is captured in `docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md`.
- F3A locks read-only/admin-only readiness display posture and status mapping without introducing send eligibility semantics.
- F3A does not add send endpoint, webhook, provider callbacks, sandbox send, live SMS, or E2 table changes.

Slice F4A model lock cross-reference (On-The-Way template governance posture):

- F4A model lock is documented in `docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md`.
- F4A locks a two-table future template-governance model (`sms_message_templates`, `sms_message_template_versions`) and immutable approved historical body text.
- F4A keeps E2 unchanged in this slice and confirms `template_key` + `template_version` + `message_body_snapshot` posture remains valid until explicit E2 linkage is later approved.

Slice F4B completion cross-reference (On-The-Way template governance schema foundation):

- F4B is complete in commit `b676736` via migration `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`.
- F4B implemented the safer two-table governance foundation by creating `sms_message_templates` (account-scoped template container/current pointer) and `sms_message_template_versions` (durable governed wording/version record).
- single-table `sms_templates` remains rejected for this lane.
- template rows are account-scoped with RLS enabled and SELECT-only policy posture for authenticated active internal users in the same account; no INSERT/UPDATE/DELETE policies were added in V1.
- E2 relationship boundary is preserved: F4B does not alter `sms_message_intents` and `sms_message_intents.message_body_snapshot` remains the future attempted-message audit record.
- F4B does not enable template editing, preview, rendering, provider behavior, or sending.
- validation recorded: TypeScript passed, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, `git diff --check` passed, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F4B.
- no production migration apply and no production writes; real SMS remains deferred.

Slice F4C-A completion cross-reference (On-The-Way template governance read model):

- F4C-A is complete in commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`.
- F4C-A added helper `lib/communications/sms-template-governance-read.ts` and tests `lib/communications/__tests__/sms-template-governance-read.test.ts`.
- helper API is `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`.
- helper reads only `sms_message_templates` and `sms_message_template_versions`, scoped by `account_owner_user_id`.
- helper returns safe-empty output on missing scope/no template rows and browser-safe readiness/status output only.
- helper always keeps SMS disabled/live sends disabled, does not return `canSend`, does not call provider/Twilio APIs, and does not read customer/job/contact data.
- E2 boundary preserved: helper does not read `sms_message_intents` or `sms_provider_deliveries`; `sms_message_intents.message_body_snapshot` remains the future attempted-message audit record.
- helper supports sample-data preview only, token detection, unknown-token blocking for approval readiness, STOP-language blocking for approval readiness, and approval-readiness-not-send-readiness posture.
- validation recorded: template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed.
- no UI/route/schema/migration/Supabase/provider/send behavior changes; real SMS remains deferred.

Slice F4C-B completion cross-reference (On-The-Way template governance read-only UI):

- F4C-B is complete in implementation commit `05475929cc69704b1fb22f3dabbde10ff83aed90` and stabilization commit `1ffa475e2167eeb60a206358a4e7032a407bdd0f`.
- F4C-B changed `app/ops/admin/communications/page.tsx` and added `On-The-Way Template Governance` section on `/ops/admin/communications`.
- section is admin-only via existing Communications access posture, read-only, and sample-preview/status only.
- section uses `getSmsOnTheWayTemplateGovernanceForAccount` and shows governance/version/token/preview summaries and STOP/unknown-token warnings.
- section includes required non-sending copy and does not introduce send/test/sandbox/activation/edit/provider controls.
- E2 boundary remains preserved: no send endpoint, webhook, provider callbacks, or delivery write behavior were added.
- section exposes no raw provider refs/secrets/full phone/customer/job data and no raw JSON dump.
- stabilization added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions.
- validation recorded: TypeScript passed, template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, and `git diff --check` passed.
- browser smoke passed after stabilization; real SMS remains deferred.

Slice F4D-A model lock cross-reference (Template editing/review actions):

- F4D-A is documented in `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`.
- F4D-A locks that draft/save/review semantics are template governance only and do not create `sms_message_intents`, `sms_provider_deliveries`, provider calls, provider callbacks, or send attempts.
- Future draft and review actions must not write provider-delivery truth; `sms_message_intents.message_body_snapshot` remains the future attempted-message body snapshot only when an actual approved send path exists later.
- Template approval/readiness must not be recorded as provider delivery truth and must not summarize into `job_events`.

Slice F4D-B completion cross-reference (Template governance validation helper):

- F4D-B is complete in commit `418172e`.
- F4D-B added helper `lib/communications/sms-template-governance-validation.ts` and tests `lib/communications/__tests__/sms-template-governance-validation.test.ts`.
- helper API is `validateOnTheWayTemplateBody(bodyTemplate: string)`.
- helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags.
- helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments.
- helper warns for multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content.
- helper has no Supabase/database/provider dependencies, no UI/server-action behavior, does not enable SMS, and does not imply `canSend`.
- review-request SMS remains parked as a future separate message class and is prohibited in On-The-Way operational template wording.
- validation recorded: template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed.
- create/save draft server actions and review actions are complete; create/save draft UI is complete; review/reject UI remains deferred unless team-review workflow is reopened; real SMS remains deferred.

Slice F4D-E1 completion cross-reference (Create/Save Draft UI):

- F4D-E1 is complete in commit `1b8b671`.
- F4D-E1 changed `app/ops/admin/communications/page.tsx` and touched server-action compatibility in `lib/actions/sms-template-actions.ts`.
- F4D-E1 wires only create/save draft actions and does not wire review/activation/provider/send/webhook behavior.
- E2 boundary remains preserved: no `sms_message_intents` or `sms_provider_deliveries` writes are added by F4D-E1.
- browser smoke passed after local runtime target alignment (`draft_created`, `draft_saved`); initial `template_create_failed` was runtime-target mismatch, not a code defect.

Slice F4D-E3B completion cross-reference (Admin Readiness UI Wiring):

- F4D-E3B is complete in commit `c998d0e`.
- F4D-E3B changed `app/ops/admin/communications/page.tsx` only and added visible `Mark wording ready for sandbox` UI to the existing `On-The-Way Template Governance` section.
- the visible button appears only when the latest wording is eligible, posts only `version_id`, and uses `markOnTheWayTemplateReadyForSandboxFromForm`.

Slice F5C-D completion cross-reference (Mark On The Way best-effort intent integration):

- F5C-D is complete in implementation commit `67e4b32`.
- F5C-D changed `lib/actions/job-actions.ts` and added `lib/actions/__tests__/sms-on-the-way-intent-integration.test.ts`.
- Mark On The Way now calls `createOnTheWayIntentFromEvent` best-effort after lifecycle update and event insert succeed with captured `onMyWayEventId`.
- Intent creation returns `CreateOnTheWayIntentFromEventResult` with `created` (boolean), `deduped` (boolean), `intentId` (string or undefined), `decisionStatus`, `decisionOutcomeWritten` (`ready_for_provider` or `blocked`), `blockedReasons` (array), `warnings` (array), and `liveSendEnabled` (false always).
- E2 boundary preserved: Only `sms_message_intents` rows are created; no `sms_provider_deliveries` writes occur in F5C-D.
- Ready outcome writes one intent row with `decision_outcome = ready_for_provider` and `blocked_reason_codes = []`.
- Blocked outcome writes one intent row with `decision_outcome = blocked` and `blocked_reason_codes` populated only if required recipient/template/body truth exists; otherwise no-insert.
- Skipped/write-skipped outcome (non-target event or missing required fields) returns no-insert with `writeSkippedReason`; no fake data is written.
- Deduped outcome (idempotency conflict) is allowed and returns `created = false, deduped = true`.
- Error outcome (helper throws) is caught, logged, and swallowed; does not rollback job status, event, or Mark On The Way success.
- Validation recorded: 89/89 tests total (7 integration + 12 create + 12 eligibility + 4 event-id + 54 template + existing), TypeScript passed, `git diff --check` passed.
- No provider delivery write path was added in F5C-D.
- No send endpoint, webhook, provider integration, or live SMS behavior was added.
- real SMS remains deferred pending provider readiness, sandbox validation, legal/provider review, and explicit activation approval.
- visible V1 UI remains admin-owned readiness UI, not a queue-shaped review/reject workflow; activation language is intentionally avoided.
- E2 boundary remains preserved: no `sms_message_intents` or `sms_provider_deliveries` writes are added by F4D-E3B.
- browser smoke passed with `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, and browser-safe rendering confirmed.
- targeted validation passed (`94/94`), TypeScript passed, `git diff --check` passed, working tree clean.
- template readiness does not enable SMS, sandbox readiness does not send SMS, Mark On The Way still does not send SMS, and real SMS remains deferred.

Slice F6A provider/Twilio sandbox send model lock:

- F6A is docs/model-only and does not add provider delivery writes, Twilio helpers, env vars, send actions, webhook routes, sandbox SMS, or live SMS.
- First sandbox send must be manual/admin-only and must consume existing `sms_message_intents` only.
- A future sandbox submit must require same-account intent lookup, `message_class = on_the_way`, `decision_outcome = ready_for_provider`, durable `job_event_id`, required recipient/template/body snapshots, and no existing `sms_provider_deliveries` row for that intent.
- Mark On The Way remains lifecycle-first and intent/audit-only; it must not trigger sandbox send yet.
- `sms_provider_deliveries` should be created before a later provider call with `provider_status = not_submitted`, `provider_name = twilio`, `account_owner_user_id`, and `sms_message_intent_id`.
- After a later Twilio response, Twilio `MessageSid` maps to `provider_message_id`, Twilio raw status maps to `provider_raw_status`, normalized status maps to `provider_status`, and `submitted_at` records handoff timing.
- Immediate provider failure should set `failed_at`, `provider_error_code`, and `provider_error_message` without changing job status and without creating job timeline delivery claims.
- Provider failure and callback state remain provider-delivery truth only; `job_events` and manual contact logs remain non-authoritative.
- Live send remains blocked until webhook/status callback readiness, STOP/HELP handling, legal/provider review, and explicit activation are complete.

Slice F6B completion cross-reference (Provider delivery preflight helper):

- F6B is complete in implementation commit `f1214ae`.
- Files added: `lib/communications/sms-provider-delivery-preflight.ts` and `lib/communications/__tests__/sms-provider-delivery-preflight.test.ts`.
- Helper API: `prepareSmsProviderDeliveryPreflight(params): Promise<PrepareSmsProviderDeliveryPreflightResult>`.
- Helper reads scoped `sms_message_intents` row by id and account scope, validates `message_class = on_the_way` and `decision_outcome = ready_for_provider`, and checks all required fields present (message_body_snapshot, recipient_phone_snapshot, template_version, job_event_id).
- Ready behavior: writes one `sms_provider_deliveries` row with `provider_name = twilio` and `provider_status = not_submitted` when all required truth exists and no delivery conflict.
- Deduped behavior: existing delivery or insert unique conflict treated as deduped success (created false, deduped true, returns existing delivery id).
- Blocked behavior: invalid intent or missing required fields returns blocked reasons array and no row insert.
- Non-sending infrastructure: helper does not call Twilio/provider, does not send SMS, does not set `provider_message_id`, does not set `submitted_at`, does not mark sent/delivered/failed, and does not mutate jobs, job_events, or sms_message_intents.
- Account scope enforced: missing `account_owner_user_id` or `sms_message_intent_id` blocks operation.
- Helper returns `liveSendEnabled` false always and does not return `canSend`; provider submission eligibility is deferred to later layers.
- E2 boundary preserved: helper reads only `sms_message_intents`, writes only `sms_provider_deliveries` with preflight-only fields, and does not trigger provider/Twilio behavior.
- Validation recorded: new preflight helper tests `17/17`, existing SMS intent create tests `12/12`, SMS eligibility tests `12/12`, template governance tests `15/15`, template validation tests `19/19`, provider readiness tests `16/16`, eligibility inputs tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed. Total: `52/52` tests passed.
- No `sms_provider_deliveries` rows actually created (non-sending audit infrastructure/preflight only); no production writes.
- Future F6C-C manual admin-only sandbox send action can query for `sms_provider_deliveries` rows with `provider_status = not_submitted` to identify eligible intents ready for Twilio submission only after F6C-A/F6C-B gates and explicit Twilio sandbox/env/test-recipient setup approval.
- Mark On The Way still does not send SMS; real SMS remains deferred.

Slice F6C-A manual sandbox send model lock:

- F6C-A is docs/model-only and does not add Twilio helpers, provider config resolver, env vars, provider calls, send actions, webhook routes, sandbox SMS, or live SMS.
- Future manual sandbox submit must consume an existing same-account `sms_provider_deliveries` row, not create an ad hoc provider delivery row from browser input.
- Required starting delivery state is `provider_name = twilio`, `provider_status = not_submitted`, and no `provider_message_id`.
- The future action must accept only `delivery_id`; the server resolves account, delivery, intent, recipient, template, provider config, and sender identity.
- Client input must not include account ids, provider refs, phone numbers, message body, provider status, or sender identity refs.
- Required linked intent state remains `message_class = on_the_way`, `decision_outcome = ready_for_provider`, durable `job_event_id`, recipient snapshot, body snapshot, `template_key = on_the_way`, and `template_version`.
- Duplicate prevention uses the existing one-delivery-per-intent uniqueness plus a guarded reservation update from `not_submitted` to `submitted` immediately before the future provider call.
- The guarded update must require same account, same delivery id, `provider_status = not_submitted`, and no `provider_message_id`; if it affects zero rows, the future action must not call Twilio.
- `submitted` may act as the first reservation state only for tightly controlled manual sandbox smoke because the current schema has no true in-flight status.
- On future Twilio response, `MessageSid` maps to `provider_message_id`, raw Twilio status maps to `provider_raw_status`, and normalized initial status maps to `queued` or `submitted`.
- On immediate provider error, set `provider_status = failed`, `failed_at`, `provider_error_code`, and `provider_error_message`.
- Never set `sent` or `delivered` without callback truth.
- Never update `jobs`, never update `job_events`, and never create job timeline delivery claims from the manual sandbox action.
- Missing webhook is acceptable only for controlled manual sandbox smoke; live send remains blocked until status callback, signature validation, inbound/opt-out or Advanced Opt-Out handling, callback idempotency, duplicate/out-of-order handling, payload retention, legal/provider review, and explicit activation exist.

Slice F6C-B completion cross-reference (Server-only provider config resolver):

- F6C-B is complete in implementation commit `e292c34`.
- Files added: `lib/communications/sms-provider-config-resolver.ts` and `lib/communications/__tests__/sms-provider-config-resolver.test.ts`.
- Helper API: `resolveSmsSandboxProviderConfig(params): Promise<ResolveSmsSandboxProviderConfigResult>`.
- Resolver is server-only readiness infrastructure and reads only `sms_provider_configurations` plus `sms_sender_identities` under account scope.
- Resolver requires `provider_name = twilio`, `provider_environment = sandbox`, sandbox-capable provider readiness, sender identity verified/active readiness, Messaging Service configured, and sandbox send gate enabled.
- Resolver fails closed when sandbox gate is missing or disabled (`sandbox_send_gate_missing_or_disabled`).
- Resolver does not read env secrets, does not call Twilio/provider, does not send SMS, and does not mutate provider/sender rows.
- Resolver output is safe readiness only: no Account SID/Auth Token/API key/Messaging Service SID or raw provider refs/secrets are returned.
- Resolver does not return `canSend` and always returns `liveSendEnabled = false`.
- Validation recorded: resolver tests `15/15`, provider delivery preflight tests `17/17`, provider readiness tests `16/16`, intent create tests `12/12`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed.
- Mark On The Way still does not send SMS; real SMS remains deferred.

Future sequence lock:

- F6C-B docs closeout complete.
- F6C-C manual admin-only sandbox send action remains deferred until explicit Twilio sandbox/env/test-recipient setup approval.
- Webhook/status callback remains deferred.
- Live SMS remains deferred pending legal/provider/activation approval.

Slice SMS On-The-Way V1 workflow simplification cross-reference:

- Mark On The Way is the user-facing operational trigger.
- Future provider-powered SMS is a background notification after that lifecycle event, not inline send behavior.
- Template governance is admin/settings wording control only.
- Admin is the V1 wording owner and effective approver; visible V1 UI should avoid a multi-person review/rejection queue unless that product workflow is reopened.
- `job_events` remains non-authoritative for provider delivery truth.
- Manual contact logs remain non-authoritative for provider delivery truth.
- `sms_message_intents.message_body_snapshot` remains the future audit record of attempted SMS wording.

Slice F5A cross-reference (docs/model-only):

- F5A locks the future non-sending Background On-The-Way intent handoff model.
- Future On-The-Way intent creation must anchor to a successful `on_my_way` `job_events` row.
- `sms_message_intents` is the first future SMS decision/audit truth after that durable lifecycle anchor.
- `sms_provider_deliveries` remains provider submission/callback truth and stays deferred for this lane.
- Current implementation constraint is explicit: current `insertJobEvent` does not return the inserted event id, and the current `on_my_way` breadcrumb write is best-effort after the `jobs.status` update.
- Future F5B/F5C work must not rely on provider work inside synchronous Mark On The Way.
- Preferred future direction is explicit event-id anchoring before non-sending intent creation; querying for the latest matching `on_my_way` event is a fallback only.
- Mark On The Way still does not send SMS, and real SMS remains deferred.

Slice F5B cross-reference (implementation closeout):

- SMS Slice F5B Non-Sending On-The-Way Intent Eligibility Helper is complete in commit `9814340`.
- Files added: `lib/communications/sms-on-the-way-intent-eligibility.ts` and `lib/communications/__tests__/sms-on-the-way-intent-eligibility.test.ts`.
- Helper API: `evaluateOnTheWayIntentEligibility(params): Promise<OnTheWayIntentEligibilityResult>`.
- The helper is read-only and non-sending, composes existing recipient, eligibility, template-governance, and provider-readiness helpers, and adds F5B-specific job plus durable `on_my_way` event checks.
- It validates durable `on_my_way` anchor readiness, separates structural `blockedReasons` from deferred live-send `warnings`, returns `liveSendEnabled` false, and does not return `canSend`.
- No `sms_message_intents` rows are written yet, no `sms_provider_deliveries` rows are written, Mark On The Way behavior is unchanged, Mark On The Way still does not send SMS, and real SMS remains deferred.
- F5C should be planned/audited before implementation; likely next is non-sending blocked/skipped/ready `sms_message_intents` creation from eligible durable `on_my_way` anchors, while provider send/webhook/activation remain deferred.

Slice F5C-A model lock (docs/model-only):

- F5C creates non-sending `sms_message_intents` only. F5C does not create `sms_provider_deliveries`, does not send SMS, and does not call provider/Twilio.
- Intent creation runs only after lifecycle success and successful `on_my_way` event insert; lifecycle success must not be rolled back by intent creation failure.
- Preferred anchor is explicit event-id handoff from successful `on_my_way` insert; recommended support is optional returned event id from `insertJobEvent` (or equivalent minimal helper).
- Query-latest `on_my_way` fallback remains non-preferred fallback only.
- Write intent rows only when required schema fields are available from truth: durable `on_my_way` event anchor, recipient truth, and governed template/version/body snapshot.
- Do not create fake recipient/template/version/message snapshot values. Missing required fields must return no-insert with `writeSkippedReason`.
- Ready mapping lock: `decision_outcome = ready_for_provider`, `blocked_reason_codes = []`, `quiet_hours_decision = not_checked`, and required recipient/template/body snapshots populated from truth.
- Blocked mapping lock: `decision_outcome = blocked` only when required fields still exist; otherwise return no-insert/write-skipped.
- Skipped mapping lock: non-target events do not create intent rows in F5C-A; return skipped/no-op result.
- Idempotency lock: `${accountOwnerUserId}:${jobEventId}:on_the_way:${contactRecipientId}`. Account/idempotency conflict is treated as deduped success.
- Future helper lock: `lib/communications/sms-on-the-way-intent-create.ts` with `createOnTheWayIntentFromEvent(params)` returning `created`, `deduped`, optional `intentId`, `decisionStatus`, `decisionOutcomeWritten`, `blockedReasons`, `warnings`, and optional `writeSkippedReason`.
- Forward sequence lock: F5C-B helper only, F5C-C event-id handoff support, F5C-D Mark On The Way best-effort integration, later provider/webhook/activation work only after explicit approval.

Slice F5C-B completion cross-reference (On-The-Way intent creation helper):

- F5C-B is complete in implementation commit `5833a23`.
- Files added: `lib/communications/sms-on-the-way-intent-create.ts` and `lib/communications/__tests__/sms-on-the-way-intent-create.test.ts`.
- Helper API: `createOnTheWayIntentFromEvent(params): Promise<CreateOnTheWayIntentFromEventResult>`.
- The helper is non-sending and creates `sms_message_intents` rows only; it calls `evaluateOnTheWayIntentEligibility` first and uses `getSmsEligibilityInputsForRecipient` for recipient snapshots.
- Ready behavior: writes one intent row when all required truth exists with `decision_outcome = ready_for_provider` and `blocked_reason_codes = []`.
- Blocked behavior: writes one blocked intent only when required recipient/template/body truth exists with `decision_outcome = blocked` and `blocked_reason_codes` from eligibility; otherwise no-insert with `writeSkippedReason`.
- Skipped/write-skipped behavior: non-target events return skipped/no-op; missing durable event anchor/recipient/template/body/required schema fields return no-insert with `writeSkippedReason`; no fake data is inserted.
- Idempotency: uses `${accountOwnerUserId}:${jobEventId}:on_the_way:${contactRecipientId}`; unique conflict is treated as deduped success (created false, deduped true).
- Helper does not write `sms_provider_deliveries`, does not send SMS, does not call provider/Twilio, does not modify jobs/job_events, does not return `canSend`, returns `liveSendEnabled` false always, and is not yet wired into Mark On The Way.
- E2 boundary preserved: helper reads only helper-owned data and reads back the written intent rows; it does not read `sms_provider_deliveries`.
- Validation recorded: new helper tests `12/12`, existing F5B eligibility tests `12/12`, template governance read tests `15/15`, template validation tests `19/19`, provider readiness tests `16/16`, eligibility inputs tests `16/16`, contact recipient tests `4/4`, `npx.cmd tsc --noEmit` passed, `git diff --check` passed.
- No production writes; no intent/delivery rows actually inserted (non-sending audit truth only).
- Mark On The Way still does not send SMS, and real SMS remains deferred.

Slice F5C-C completion cross-reference (Durable On-The-Way Event-ID Handoff):

- F5C-C is complete in implementation commit `e7819e0`.
- Files modified/added: `lib/actions/job-actions.ts` (modified), `lib/actions/__tests__/job-event-id-handoff.test.ts` (new).
- `insertJobEvent` now returns `Promise<string>` with the inserted durable `job_events.id`.
- Return value behavior: on success, returns the Supabase-generated event id; on error, throws with error message; if id missing in response, throws clear error.
- Backward compatibility preserved: all 49 existing call sites continue to work without modification (can ignore return value or capture it).
- Mark On The Way enhancement: captures `onMyWayEventId` from the `on_my_way` event insert for future use in F5C-D intent creation.
- Event-anchor handoff boundary: captured id is not used in F5C-C; integration into intent creation is deferred to F5C-D.
- E2 boundary preserved: event-id return does not alter intent/delivery tables, read behavior, or write path decisions; intent creation remains deferred.
- Call-site audit recorded: 40 in job-actions.ts, 2 in internal-invoice-actions.ts, 1 in internal-invoice-payment-actions.ts; all previously awaiting without capturing return; all continue working.
- Validation recorded: new event-id handoff tests `4/4`, existing SMS tests passing (100/100 total across all suites), `npx.cmd tsc --noEmit` passed, `git diff --check` passed.
- No schema/migration changes; no Supabase production commands; event-id return sourced directly from standard Supabase `.select("id").single()` chain.
- No SMS intent creation in F5C-C (infrastructure only).
- No provider/Twilio/send/webhook behavior added.
- Mark On The Way still does not send SMS, and real SMS remains deferred.

---

## 1) Current Decision

Slice E is not ready for migration until this model lock is recorded.

After this model lock, the likely next implementation is a combined migration foundation for:

- `sms_message_intents`
- `sms_provider_deliveries`

Current locked boundary:

- no live SMS
- no provider setup
- no Twilio integration
- no send endpoint
- no webhook
- no provider delivery behavior

---

## 2) V1 Cardinality

Locked V1 relationship:

- one `sms_message_intent` can have zero or one current `sms_provider_delivery` row
- blocked intents have zero provider delivery rows
- provider-submitted intents have one current provider delivery row
- append-only provider event history is parked for a later slice only if callback churn or audit needs require it

This is a current-row model, not a multi-row delivery-history model.

---

## 3) Retry Semantics

Locked retry posture for V1:

- a new user/background send decision creates a new intent
- a provider status update for the same provider submission updates the existing delivery row
- provider resubmission for the same intent should update or replace the current delivery row only under a future retry policy
- do not design multi-attempt retries yet
- full retry/event-history semantics are parked

---

## 4) Idempotency Key Shape

V1 idempotency must be unique per account.

Recommended formula for lifecycle-driven On-The-Way send decisions:

- `account_owner_user_id + job_event_id + message_class + contact_recipient_id`

Locked rule:

- `job_event_id` is required for lifecycle-driven sends such as On-The-Way
- future non-lifecycle sends may need a different source event/ref, and it must be explicit
- no arbitrary job snapshot phone/email participates in idempotency

F5A handoff lock:

- preferred future direction is direct event-id anchoring from the successful `on_my_way` lifecycle breadcrumb
- if direct event-id handoff is not yet available, a background lookup for the latest matching `on_my_way` event is a fallback only and must be protected by strict idempotency plus revert/current-status checks
- future provider work must remain outside the synchronous Mark On The Way action

---

## 5) `sms_message_intents` Purpose

Purpose:

- record the send request and pre-provider decision checkpoint
- do not treat the table as provider delivery truth
- store decision inputs and rendered message snapshot for audit

Recommended future fields:

- `id`
- `account_owner_user_id`
- `job_id`
- `service_case_id`
- `job_event_id`
- `contact_recipient_id`
- `message_class`
- `template_key`
- `template_version`
- `message_body_snapshot`
- `send_requested_by_user_id`
- `send_requested_at`
- `recipient_phone_snapshot`
- `recipient_role_snapshot`
- `consent_decision`
- `suppression_decision`
- `quiet_hours_decision`
- `decision_outcome`
- `blocked_reason_codes`
- `decision_policy_version`
- `sender_identity_ref`
- `idempotency_key`
- `created_at`
- `updated_at`

Fields to park for later:

- locale / timezone snapshot fields beyond the minimum decision contract
- template variables snapshot detail beyond body rendering
- provider fields
- retry counters
- transport diagnostics

Constraints and source-of-truth behavior:

- unique account/idempotency key
- account-scoped internal reads
- no delete policy in V1 unless explicitly added later
- blocked intents are decision truth only; they do not create provider delivery truth
- `quiet_hours_decision` captures SMS send-eligibility evaluation state only and is not lifecycle control truth
- future blocked/skipped/failed On-The-Way evaluation should still record decision outcome when a durable `on_my_way` event anchor exists
- if no durable `on_my_way` event exists, fail closed and do not create an intent

---

## 6) Intent Decision Outcome Values

Locked planning values:

- `blocked`
- `ready_for_provider`
- `submitted`
- `cancelled`
- `failed_before_submit`

Locked meanings:

- `blocked` means no provider delivery row should exist
- `ready_for_provider` means all local gates passed but provider submit has not happened
- `submitted` means provider submit path has been attempted or accepted
- `failed_before_submit` means local or provider-precheck failed before provider handoff

---

## 7) `sms_provider_deliveries` Purpose

Purpose:

- record provider submit response and provider callback truth
- not a manual contact log
- current provider-state row for a submitted intent

Recommended future fields:

- `id`
- `account_owner_user_id`
- `sms_message_intent_id`
- `provider_name`
- `provider_message_id`
- `provider_status`
- `provider_raw_status`
- `provider_error_code`
- `provider_error_message`
- `provider_callback_payload_snapshot`
- `provider_last_event_at`
- `submitted_at`
- `sent_at`
- `delivered_at`
- `failed_at`
- `created_at`
- `updated_at`

Fields to park for later:

- provider attempt count
- provider error category
- delivery latency metrics
- callback verification metadata
- response headers snapshot
- append-only provider event history

---

## 8) Provider Status Values

Locked planning values:

- `not_submitted`
- `queued`
- `submitted`
- `sent`
- `delivered`
- `failed`
- `undelivered`
- `blocked`
- `unknown`

Normalization rules:

- provider-specific statuses must map into normalized provider status
- raw provider status may be retained separately

---

## 9) Provider-Neutral / Twilio-Aware Design

Locked design posture:

- Twilio remains a likely future provider direction
- schema and docs must stay provider-neutral
- use generic fields only:
  - `provider_name`
  - `provider_message_id`
  - `provider_status`
  - `provider_raw_status`
- do not use Twilio-only table or column names unless a later provider integration slice explicitly justifies it

---

## 10) Message Body Snapshot

Rendered message body should be stored on the intent row before provider submit.

Why:

- it has audit value
- it may contain personal/customer/job context
- it has retention/privacy implications

Locked boundary:

- storing the rendered body does not permit live send by itself
- retention policy must be revisited before production activation

---

## 11) Raw Callback Payload

Locked posture:

- nullable `provider_callback_payload_snapshot` on the delivery row is acceptable for V1
- full append-only callback/event history is parked
- payload retention/privacy implications must be reviewed before production activation
- callback payload must never become a customer-facing delivery claim by itself

---

## 12) Job Event / Timeline Relationship

Locked boundary:

- `job_events` is not provider delivery truth
- `job_events` remains lifecycle breadcrumb truth for the future On-The-Way intent handoff anchor
- future provider send/delivery may create summary-only timeline entries only after explicitly designed
- summary entries must never claim provider delivery unless backed by `sms_provider_deliveries`
- manual contact logs remain separate from provider delivery truth

---

## 13) Callback Write Path

Locked callback posture:

- future provider callback updates should use service-role or a carefully designed server-side path
- callback path must not trust arbitrary client-supplied account ids
- callback should resolve existing delivery/intent through trusted identifiers such as provider message id and internal mapping
- account scoping must be revalidated on callback update
- no public unauthenticated mutation path should write arbitrary SMS delivery state

---

## 14) RLS Expectations

Locked RLS posture:

- internal users may read account-scoped intent/delivery rows
- direct client/user writes should be limited or avoided for provider delivery rows
- no customer/portal direct access in V1
- no delete policy by default
- provider callback update path must be separated from normal user RLS expectations

---

## 15) Future Migration Acceptance Criteria

The future migration should:

- create only the two audit tables
- include account-scoped RLS
- include unique account/idempotency key on intents
- include unique intent-to-delivery current row
- include unique provider message id per account/provider when present
- include normalized status constraints
- not add send logic
- not add webhook
- not add provider env vars
- not add feature flags
- not apply production migration automatically

---

## 16) Future Sequence

A. Slice E1 model lock closeout.
B. Slice E2 combined migration foundation for intent + delivery audit tables.
C. Slice E3 local migration validation and docs closeout.
D. Quiet-hours/timezone gate planning.
E. F4A On-The-Way template governance model lock closeout. ✓ Complete
F. F4B template-governance schema foundation. ✓ Complete (`b676736`)
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
AC. Provider webhook/send implementation only after all gates.
AD. Production activation only after legal/provider review and explicit approval.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
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
