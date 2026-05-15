# Compliance Matters - SMS Sender Identity and Provider Configuration Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## Slice F2B Closeout Status (2026-05-15)

SMS Slice F2B Provider Configuration + Sender Identity Schema Foundation is complete.

- Implementation commit: `f093bdd`
- Migration filename: `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`
- Created tables:
  - `sms_provider_configurations`
  - `sms_sender_identities`

Locked F2B interpretation:

- `sms_provider_configurations` stores account-scoped provider readiness/configuration metadata only.
- `sms_sender_identities` stores account-scoped sender identity metadata only.
- neither table stores provider secrets.
- neither table enables live SMS.
- neither table sends messages.
- provider references are Twilio-aware but provider-neutral.
- sandbox vs production is represented as data.
- readiness and activation remain separate.
- account-scoped RLS is enabled with SELECT policy only.
- no INSERT/UPDATE/DELETE policies were added in V1.
- future writes remain deferred to admin/owner-gated server actions or approved service-role/server-side paths.
- one-active-production sender-identity enforcement is intentionally parked for a future helper/server-action or follow-up migration decision.
- no E2 table was altered in this slice.
- real SMS remains deferred.

Validation recorded:

- `npx.cmd tsc --noEmit` passed.
- `npx.cmd vitest run lib/communications/__tests__/sms-eligibility-inputs-read.test.ts` passed (`16/16`).
- `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed (`4/4`).
- `git diff --check` passed.
- `supabase db reset --local --no-seed --yes` passed.
- full local migration chain applied successfully, including F2B.

Deployment/write boundary confirmation:

- no production migration apply.
- no production writes.

Provider-readiness posture after F2B:

- provider readiness is structurally closer but not active.
- Settings -> Communications remains the future home for provider readiness display/control.
- Twilio/provider setup remains deferred.
- provider credentials/environment variables remain deferred.
- webhook/status callback implementation remains deferred.
- sender registration/A2P/provider review remains deferred.
- sandbox send remains deferred.
- production activation remains deferred.

Future gates still required:

- admin Settings -> Communications provider readiness UI planning
- admin template governance implementation planning
- webhook/signature-validation contract planning
- provider/Twilio sandbox implementation planning
- opt-out/help inbound mapping implementation planning
- explicit sender registration/provider review
- legal/provider review
- explicit activation decision

Marketplace guardrail framing:

- F2B is neutral tenant/account-scoped provider-readiness infrastructure.
- this does not imply marketplace behavior exists.
- this does not approve shared production sender identity.

---

## 1) Current Decision

Slice F2A closes the sender identity/provider configuration model lock in documentation only.

Locked posture for this slice:

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
- no provider webhook
- no activation behavior changes

Real SMS remains deferred.

---

## 2) Two-Table Model Decision

Locked model decision:

- use two core future tables
  - `sms_provider_configurations`
  - `sms_sender_identities`
- do not combine them

Rationale:

- provider configuration answers which external provider/environment/resource set an account is configured against
- sender identity answers which sender identity an account is allowed to send as
- lifecycle and cardinality are different
- marketplace/multi-tenant implications are different

---

## 3) Parked Registration Records

A separate registration evidence table is parked for now:

- candidate: `sms_provider_registration_records`

Planning lock:

- this table may be needed later if registration evidence requires multiple rows per sender/provider
- F2B should avoid adding this table unless registration-evidence requirements are explicitly approved

---

## 4) `sms_provider_configurations` Purpose

Purpose:

- account-scoped external provider resource/readiness configuration
- does not store secrets
- does not activate live SMS by itself
- does not send messages

Recommended future fields:

- `id`
- `account_owner_user_id`
- `provider_name`
- `provider_environment`
- `provider_account_ref`
- `default_messaging_service_ref`
- `readiness_status`
- `activation_status`
- `callback_status_readiness`
- `inbound_webhook_readiness`
- `status_callback_readiness`
- `advanced_opt_out_readiness`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

---

## 5) Provider Configuration Field Semantics

Locked semantics:

- `provider_name` stays provider-neutral
- `provider_environment` distinguishes sandbox vs production
- `provider_account_ref` stores provider account/subaccount reference only, never credentials
- `default_messaging_service_ref` stores provider messaging-service reference only, never credentials
- Twilio Account SID maps to `provider_account_ref`
- Twilio Messaging Service SID maps to `default_messaging_service_ref`

Naming lock:

- do not use Twilio-specific column names such as `twilio_account_sid` or `twilio_messaging_service_sid`

---

## 6) `sms_sender_identities` Purpose

Purpose:

- account-scoped sender identity/resource that future sends reference
- represents what sender the account is allowed to send as
- does not activate live SMS by itself
- does not store secrets

Recommended future fields:

- `id`
- `account_owner_user_id`
- `provider_configuration_id`
- `sender_type`
- `sender_display_label`
- `phone_e164`
- `phone_last4`
- `provider_sender_ref`
- `messaging_service_ref`
- `registration_type`
- `provider_brand_ref`
- `provider_campaign_ref`
- `provider_registration_ref`
- `verification_status`
- `activation_status`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

---

## 7) Sender Identity Field Semantics

Locked semantics:

- `provider_sender_ref` may map to a provider phone SID or equivalent sender identifier
- `messaging_service_ref` may map to Twilio Messaging Service SID, but column naming remains provider-neutral
- `provider_brand_ref`, `provider_campaign_ref`, and `provider_registration_ref` are provider registration references
- use campaign terminology only in provider/A2P context, not product terminology

Product language lock:

- use product wording such as `On-The-Way Notification` and `On-The-Way SMS`
- do not use provider campaign terminology as product UI labels

---

## 8) No-Secret DB Rule (Locked)

Never store provider secrets in database rows:

- auth token
- API secret
- webhook secret
- private key
- full environment variable value
- browser-exposed `NEXT_PUBLIC_*` secrets

Credentials posture:

- credentials belong only in server-side environment variables or approved secret manager
- DB rows may reference provider resources but must not contain provider credentials
- secrets must never be exposed to client/browser code

---

## 9) Provider Readiness Status Values

Locked planning values for `sms_provider_configurations.readiness_status`:

- `draft`
- `sandbox_only`
- `registration_required`
- `registration_pending`
- `provider_review_required`
- `ready_for_sandbox`
- `ready_for_activation`
- `active`
- `paused`
- `rejected`

`not_configured` representation rule:

- prefer no row (or explicit placeholder row) over treating `not_configured` as an always-present active config row

---

## 10) Sender Verification and Status Values

Locked planning values for sender verification/lifecycle:

- `draft`
- `pending_verification`
- `verified`
- `rejected`
- `active`
- `paused`

---

## 11) Activation Status Values

Locked planning values:

- `disabled`
- `pending_activation`
- `active`
- `paused`

Lock:

- readiness and activation are separate
- a provider can be technically configured while activation remains disabled

Live send gate reminder:

- live sends require DB readiness + activation state + server env availability + callback readiness + template approval + consent/suppression + legal/provider approval

---

## 12) Sender Type Values

Locked planning values:

- `messaging_service`
- `long_code`
- `toll_free`
- `short_code`
- `alphanumeric`
- `sandbox`

---

## 13) Registration Type Values

Locked planning values:

- `a2p_10dlc`
- `toll_free_verification`
- `short_code`
- `none`
- `provider_other`

---

## 14) Initial Cardinality

Initial production rule (planning lock):

- allow one active production sender identity per account/provider/environment

Future lock:

- do not hard-code one forever
- future multiple sender identities per account may be allowed
- F2B may enforce one active production row with partial unique index when migration proceeds

---

## 15) Sandbox vs Production Semantics

Lock:

- represent sandbox/production as data, not feature flag only
- use `provider_environment`
- prefer separate provider-configuration rows for sandbox vs production
- prefer separate sender identities for sandbox vs production
- sandbox readiness is status, not activation

Blocked-send boundary:

- sandbox sends remain blocked until audit tables, sender identity, provider configuration, template governance, callback/signature validation, opt-out mapping, and explicit approval are ready

---

## 16) RLS and Account-Scope Expectations

Future RLS expectations:

- internal users may read account-scoped provider/sender readiness
- no customer/portal access
- no public access
- no delete policy initially
- account scope enforced by `account_owner_user_id`
- provider/sender rows must never leak across tenants/accounts

---

## 17) Mutation Boundaries

Mutation posture:

- admins/owners only for future settings mutations
- prefer server actions with internal admin/owner role checks
- for F2B migration, consider no direct authenticated insert/update policy until UI/server-action mutation contract is approved
- provider delivery/callback state remains service-role/server-only
- no client-side secrets

---

## 18) Settings -> Communications Implications

Future display fields:

- provider name
- sandbox/live readiness
- sender label
- masked sender phone
- registration/readiness status
- callback readiness
- opt-out/help readiness
- activation status

Future editable fields:

- display label
- intended sender mode
- admin readiness notes
- explicit activation request/confirmation only after all gates

Future hidden fields:

- credentials
- auth tokens
- webhook secrets
- full provider account refs when not needed
- raw provider payloads
- callback signature material

Future disabled-until-review fields/actions:

- live activation
- template send controls
- sandbox sends
- webhook-dependent status claims

---

## 19) E2 Table Relationship Posture

Lock for this slice:

- keep current E2 tables as-is in F2A
- `sms_message_intents.sender_identity_ref` remains acceptable as parked text reference while no send path exists

Future consideration before provider implementation:

- nullable FK additions may be considered later
  - `sms_message_intents.sender_identity_id`
  - `sms_provider_deliveries.sender_identity_id`
  - optionally `sms_provider_deliveries.provider_configuration_id`

Boundary:

- do not alter E2 in F2A
- avoid altering E2 in F2B unless sender/provider tables are created and FK semantics are explicitly locked

---

## 20) Marketplace and Multi-Tenant Guardrails

Lock:

- future marketplace tenants should have tenant-scoped sender identity and provider readiness
- shared production sender identity is forbidden unless separately approved
- sending for many businesses from one sender identity introduces brand confusion, opt-out scope confusion, A2P registration mismatch, and tenant accountability risks
- future ISV/subaccount model may be required before broad tenant onboarding
- no Eddie-specific assumptions

---

## 21) Future F2B Migration Acceptance Criteria

Future F2B migration should:

- create only provider configuration and sender identity foundation tables
- store no secrets
- add account-scoped RLS
- avoid customer/portal access
- avoid send/webhook/provider behavior
- avoid activation behavior
- avoid environment variable changes
- avoid production migration apply
- preserve real SMS as deferred

---

## 22) Future Sequence

A. F2A model lock closeout (this document).
B. F2B schema migration foundation for provider configurations + sender identities.
C. Local migration validation and docs closeout.
D. F3A Settings Communications readiness UI model lock closeout (`docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md`).
E. F3B read-model helper implementation planning (`lib/communications/sms-provider-readiness-read.ts`).
F. F3C read-only Admin Center route/page implementation planning (`/ops/admin/communications`).
G. Webhook/signature-validation contract planning.
H. Template governance implementation planning.
I. Provider/Twilio sandbox implementation only after all gates.
J. Production activation only after provider/legal review and explicit approval.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md
- docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md
- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
