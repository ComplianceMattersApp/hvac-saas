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

---

## 2) Future Field Workflow

Future intended flow (planning only):

1. Tech/operator presses Mark On The Way.
2. Job lifecycle/status transition remains primary and must not depend on SMS.
3. Future SMS send evaluation runs after lifecycle transition as background/event-driven workflow.
4. If all gates pass, future provider SMS may be sent.
5. If any gate fails, no SMS is sent and lifecycle transition remains successful.

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
- consume on-the-way lifecycle signal/event as background trigger
- provider failure must not roll back job status

This is a control contract only. No automation is added in this slice.

---

## 4) Required Future Gates Before Any Background Send

All gates below must pass before any future background send is allowed:

- recipient exists in contact_recipients
- recipient role explicit
- recipient active
- recipient phone present
- consent exists and is opted in for on_the_way
- no active recipient-level suppression
- no active phone-level suppression
- quiet-hours/timezone gate passes
- admin-approved template exists
- sender identity/provider registration ready
- SMS message intent/provider delivery audit tables exist
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

- no SMS send attempt
- no customer-facing sent/delivered claim
- no fake delivery status
- no automatic manual contact log creation
- optional internal-only note/event may be added later only after that event model is designed
- Mark On The Way remains successful when lifecycle action itself succeeded
- quiet-hours/timezone blocked-send outcomes are SMS-only and do not change lifecycle success

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
D. SMS message intent/provider delivery audit schema planning.
E. Quiet-hours/timezone gate planning.
F. Provider/Twilio readiness and A2P sandbox planning.
G. Non-sending background evaluator.
H. Sandbox provider send only after all gates.
I. Production activation only after legal/provider review and explicit approval.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
