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
D. SMS message intent/provider delivery audit schema planning. ✓ Complete
E. F4A On-The-Way template governance model lock closeout. ✓ Complete
F. F4B template schema foundation (`sms_message_templates`, `sms_message_template_versions`). ✓ Complete (`b676736`)
G. F4C-A template governance read-model helper (`lib/communications/sms-template-governance-read.ts`). ✓ Complete (`0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`)
H. F4C-B read-only template status/sample preview in Admin Communications. ✓ Complete (`05475929cc69704b1fb22f3dabbde10ff83aed90`, stabilized by `1ffa475e2167eeb60a206358a4e7032a407bdd0f`)
I. Quiet-hours/timezone gate planning.
J. Provider/Twilio readiness and A2P sandbox planning.
K. Non-sending background evaluator.
L. Sandbox provider send only after all gates.
M. Production activation only after legal/provider review and explicit approval.

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
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
