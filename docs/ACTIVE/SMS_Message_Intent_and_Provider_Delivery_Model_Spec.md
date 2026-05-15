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
E. Admin template governance implementation planning.
F. Provider/Twilio sandbox readiness.
G. Provider webhook/send implementation only after all gates.
H. Production activation only after legal/provider review and explicit approval.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md
- docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
