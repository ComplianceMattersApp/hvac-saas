# Compliance Matters - SMS Settings Communications IA Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## Slice E2 Cross-Reference Closeout (2026-05-15)

SMS Slice E2 Message Intent + Provider Delivery Audit Foundation is complete in commit `b90c9ea` with migration `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql`.

Settings IA implications remain unchanged:

- audit tables now exist as tenant/account-scoped communication infrastructure (`sms_message_intents`, `sms_provider_deliveries`)
- no send endpoint, webhook, provider integration, or live SMS behavior was added
- no provider delivery write path was added in this slice
- no activation toggle behavior was added
- real SMS remains deferred until remaining activation gates are complete
- quiet-hours/timezone remains future pre-send gate planning only and is not a direct workflow blocker

Marketplace guardrail preserved:

- this closeout is neutral tenant/account-scoped audit infrastructure, not Eddie-specific behavior and not a live marketplace messaging implementation

Slice F1 planning cross-reference:

- Provider/Twilio readiness planning is captured in `docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md`.
- F1 defines provider readiness, A2P/registration checklist, callback/signature-validation expectations, env/secrets planning posture, and tenant sender guardrails.
- F1 is docs/model-only and does not add settings UI, provider setup, send route, webhook, sandbox send, or live SMS.

Slice F2A planning cross-reference:

- Sender identity/provider configuration model lock is captured in `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md`.
- F2A locks the two-table model (`sms_provider_configurations`, `sms_sender_identities`), no-secret DB rule, readiness/activation statuses, sandbox-vs-production semantics, and account-scope RLS/mutation boundaries.
- F2A remains docs/model-only and does not add settings UI, provider setup, send route, webhook, sandbox send, or live SMS.

---

## 1) Settings Location Decision

Future SMS/message controls belong under:

- Settings -> Communications

Locked IA posture:

- do not place full SMS controls in Company Profile
- Company Profile remains business identity/support contact scope
- Communications Settings owns template governance, provider readiness, sender identity, compliance gates, and activation controls

---

## 2) Future Settings -> Communications Sections

### A. Communications Status

Future status surface should summarize messaging readiness at account scope.

Possible future states:

- Not configured
- Setup required
- Provider pending
- Compliance review required
- Sandbox only
- Ready for activation
- Active
- Paused

### B. SMS / On-The-Way Messaging

- future On-The-Way template management
- admin-controlled only
- no field-tech free editing
- template versioning required before live activation
- preview belongs here, not job detail

### C. Sender Identity

- future provider/sender identity readiness
- Twilio likely direction, but provider-neutral model remains required
- sender identity must be tenant/account scoped
- no shared sender assumption unless explicitly designed later

### D. Compliance Readiness

- consent model status
- opt-out/suppression status
- quiet-hours/timezone status
- provider registration status
- legal/provider review status

Quiet-hours/timezone scope clarification:

- quiet-hours/timezone is a future conservative fail-closed pre-send gate only
- quiet-hours/timezone must not block Mark On The Way or other lifecycle/status transitions
- no quiet-hours settings UI is approved for V1 direct job workflows
- quiet-hours/timezone remains parked inside broader pre-send gate policy planning

### E. Activation

- disabled until all gates pass
- explicit activation decision required
- no accidental activation via migration, env var, or feature flag alone

---

## 3) What Is Visible Now vs Later

Current/near-term:

- documentation/planning only
- no runtime settings required in this slice

If a future placeholder is added, it must clearly state:

- SMS is not enabled
- live sends are not active
- provider setup is not complete
- activation remains blocked until compliance/provider gates pass

Visibility constraints:

- do not show editable SMS templates until admin governance slice is intentionally implemented
- do not show provider credential fields until provider setup slice is explicitly approved

---

## 4) Future On-The-Way Template Governance

Template governance contract:

- template key: on_the_way
- template is admin-controlled
- template is versioned
- field users cannot edit text
- template preview lives in Settings -> Communications
- final live wording requires legal/provider review

---

## 5) Future Token Governance

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

## 6) Field Workflow Relationship

Field workflow remains lifecycle-first:

- field user presses Mark On The Way
- future background SMS evaluation runs only if enabled and all gates pass
- no job-detail preview panel
- no field SMS editor
- no send-status claim without provider delivery truth
- quiet-hours/timezone must not appear as a required V1 field workflow control

---

## 7) Customer/Job Badge Relationship

Future UI may show compact badge-only status when helpful:

- Do Not Text
- Notifications Off
- Consent Needed
- Texting Not Enabled

Badge rules:

- badge state must come from first-class recipient/consent/suppression sources and B2 helper outputs
- badges are not settings
- badges are not toggles
- badges are not delivery status

---

## 8) Activation Gates (Before Any Live Send)

All gates below must pass before live activation:

- recipient/contact role model exists
- consent/suppression model exists
- quiet-hours/timezone gate exists
- provider/sender identity is ready
- template is approved/versioned
- SMS message intent/provider delivery audit tables exist
- provider/Twilio sandbox validated
- legal/provider review complete
- explicit activation decision approved

If any gate is incomplete, live SMS remains deferred.

---

## 9) Marketplace Future Guardrail

Communications Settings must preserve tenant/account boundaries:

- tenant/account scoped configuration and visibility
- no Eddie-specific assumptions
- no single-owner-only sender assumption
- no cross-tenant sender/recipient leakage
- future marketplace participants require clear sender/recipient identity boundaries

---

## 10) No-Go Areas For This Slice

This slice does not perform or authorize:

- live SMS
- provider setup
- Twilio integration
- send endpoint
- webhook
- activation toggle implementation
- job-detail preview card
- field SMS editor
- quiet-hours settings UI in direct job workflows
- fake consent/suppression toggles
- fake delivery status
- payment/QBO/portal behavior
- marketplace feature build
- code changes
- behavior changes
- schema changes
- migrations
- Supabase commands
- production writes
- env/secret/feature-flag changes

---

## 11) Future Recommended Sequence

A. Settings / Communications IA spec closeout.
B. Admin Communications settings placeholder or route planning.
C. SMS message intent/provider delivery audit schema planning.
D. Quiet-hours/timezone gate planning.
E. Admin template governance implementation.
F. Non-sending background evaluator.
G. Provider/Twilio readiness and sandbox setup.
H. Sandbox provider send after all gates.
I. Production activation only after legal/provider review and explicit approval.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md
- docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
