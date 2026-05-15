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
L. F4D-B validation helper only; no writes, no UI.
M. F4D-C create/save draft server actions.
N. F4D-D review actions.
O. F4D-E editable UI.
P. F5 webhook/status callback contract planning.
Q. F6 provider/Twilio sandbox implementation planning.
R. Sandbox send only after sender identity, template governance, consent/suppression, audit model, webhook contract, and activation gates are ready.
S. Production activation only after provider/legal review and explicit approval.

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
