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

Slice F2B closeout cross-reference:

- Provider configuration + sender identity schema foundation is complete in commit `f093bdd` via `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`.
- F2B created `sms_provider_configurations` and `sms_sender_identities` with account-scoped SELECT RLS only in V1 and no authenticated write policies.
- F2B did not add settings UI, send route, webhook, sandbox send, live SMS, env/secret changes, or activation behavior.

Slice F3A model lock cross-reference:

- Settings -> Communications readiness UI model lock is captured in `docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md`.
- F3A locks route/IA posture (`/ops/admin/communications`), admin-only access guard, read-only first implementation sections, no-secret browser posture, status mapping, and no-go controls.
- F3A remains docs/model-only and does not add route implementation, read-model helper, send route, webhook, sandbox send, live SMS, or activation behavior.

Slice F3B completion cross-reference (May 2026):

- Provider Readiness Read-Model Helper is complete in commit `d370e56`.
- F3B implementation: `lib/communications/sms-provider-readiness-read.ts` with test file `lib/communications/__tests__/sms-provider-readiness-read.test.ts`.
- F3B helper API: `getSmsProviderReadinessForAccount({ supabase, accountOwnerUserId })`.
- F3B helper delivers safe account-scoped readiness data for future Communications UI per F3A model contract.
- F3B validates: new provider readiness tests 16/16 passed, SMS eligibility tests 16/16 passed, contact recipient tests 4/4 passed, TypeScript clean.

Slice F3C completion cross-reference (May 2026):

- Read-Only Admin Communications Page is complete in commit `994e79c`.
- F3C route: `/ops/admin/communications` (admin-only, read-only, readiness/status only).
- F3C Admin Center card: `Communications` with description "Review SMS/provider readiness. SMS is not enabled and live sends are disabled."
- F3C page sections: Communications Status, SMS Provider Readiness, Sender Identity, On-The-Way Notification, Compliance Readiness, Activation Status.
- F3C page uses F3B helper and implements F3A output contract: no send/activation/template/provider controls, no secrets/refs/full phone rendered, masked sender display.
- F3C validation: TypeScript clean, provider readiness tests 16/16 passed, SMS eligibility tests 16/16 passed, contact recipient tests 4/4 passed.
- Communications readiness is now visible in Admin Center as read-only status/readiness.
- Real SMS remains deferred.

Slice F4A completion cross-reference (May 2026):

- On-The-Way Template Governance Model Lock is complete in `docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md`.
- F4A locks a two-table future model: `sms_message_templates` (account-scoped container/current pointer) and `sms_message_template_versions` (durable immutable wording/version record).
- F4A explicitly rejects single-table `sms_templates` for this lane.
- F4A locks admin-only governance posture, token allowlist, mandatory STOP language, prohibited wording, sample-preview-only posture, and separate internal/legal/provider review states.
- F4A remains docs/model-only and does not add schema/migrations, read-model/UI editing, provider setup, send route, webhook, sandbox send, live SMS, or activation behavior.

Slice F4B completion cross-reference (May 2026):

- Template Governance Schema Foundation is complete in commit `b676736` via `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`.
- F4B implemented the safer two-table model by creating `sms_message_templates` (account-scoped template container/current pointer) and `sms_message_template_versions` (durable governed wording/version record).
- single-table `sms_templates` remains rejected for this lane.
- template rows are account-scoped with RLS enabled and SELECT-only policy posture for authenticated active internal users in the same account.
- no INSERT/UPDATE/DELETE policies were added in V1; future writes remain deferred to admin-only server actions.
- F4B does not enable template editing, preview, rendering, sending, or On-The-Way automation.
- F4B does not alter `sms_message_intents`; `sms_message_intents.message_body_snapshot` remains the future attempted-message audit record.
- F4B validation recorded: TypeScript passed, provider readiness helper tests `16/16`, SMS eligibility helper tests `16/16`, contact recipient helper tests `4/4`, `git diff --check` passed, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F4B.
- no production migration apply and no production writes.
- F4C read-only template status/sample preview remains deferred; real SMS remains deferred.

Slice F4C-A completion cross-reference (May 2026):

- Template Governance Read Model Helper is complete in commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`.
- F4C-A added helper file `lib/communications/sms-template-governance-read.ts` and test file `lib/communications/__tests__/sms-template-governance-read.test.ts`.
- Helper API is `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`.
- Helper reads only `sms_message_templates` and `sms_message_template_versions`, account-scoped by `account_owner_user_id`.
- Helper returns safe-empty output when scope is missing or template rows are not configured.
- Helper returns browser-safe readiness/status output only, always keeps SMS disabled/live sends disabled, and does not return `canSend`.
- Helper does not call provider/Twilio APIs, does not read customer/job/contact data, and does not read `sms_message_intents` or `sms_provider_deliveries`.
- Helper supports sample-data preview only, detects allowed/unknown tokens, blocks approval readiness on unknown tokens or missing STOP language, and keeps approval-readiness separate from send-readiness.
- F4C-A validation recorded: template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed.
- no UI/route/schema/migration/Supabase/provider/send behavior changes in this slice.
- F4C-B read-only template status/sample preview remains deferred; real SMS remains deferred.

Slice F4C-B completion cross-reference (May 2026):

- Read-Only On-The-Way Template Governance Section is complete in implementation commit `05475929cc69704b1fb22f3dabbde10ff83aed90` and stabilization commit `1ffa475e2167eeb60a206358a4e7032a407bdd0f`.
- F4C-B changed page `app/ops/admin/communications/page.tsx` on route `/ops/admin/communications`.
- F4C-B added `On-The-Way Template Governance` as admin-only, read-only, status/sample-preview-only section using `getSmsOnTheWayTemplateGovernanceForAccount`.
- section shows template governance status, display name/lifecycle, current/sandbox/latest summaries when present, token summaries, sample preview only, character count/segment estimate, and STOP/unknown-token warnings.
- section includes required copy (`Sample preview only.`, `SMS is not enabled and live sends are disabled.`, `Mark On The Way does not send SMS.`, `Template readiness does not enable sending.`).
- section includes no send/test/sandbox/activation/edit/approval/provider controls and exposes no raw provider refs/secrets/full phone/customer/job data or raw JSON dump.
- stabilization added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions to avoid page crash and degrade to safe-empty readiness state.
- browser smoke passed after stabilization.
- F4C-B validation recorded: TypeScript passed, template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, and `git diff --check` passed.
- real SMS remains deferred.

Slice F4D-A model lock cross-reference (May 2026):

- Template Editing + Review Actions Model Lock is complete in `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`.
- F4D-A locks future admin-only editing/review semantics before any mutation path exists.
- Future editing remains inside `/ops/admin/communications` posture and must keep copy that SMS is not enabled, live sends are disabled, template approval does not enable sending, and preview is sample-only.
- Future first implementation is validation helper only, then create/save draft actions, then review actions, then editable UI; provider/legal approval, sandbox sends, and activation remain later.
- Normal authenticated template INSERT/UPDATE/DELETE policies remain absent; future writes are admin-only server actions after role and account-scope validation.

Slice F4D-B completion cross-reference (May 2026):

- Template Governance Validation Helper is complete in commit `418172e`.
- F4D-B added helper `lib/communications/sms-template-governance-validation.ts` and tests `lib/communications/__tests__/sms-template-governance-validation.test.ts`.
- helper API is `validateOnTheWayTemplateBody(bodyTemplate: string)`.
- helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags.
- helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments.
- helper warns for multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content.
- helper does not enable SMS, does not imply `canSend`, has no Supabase/database/provider dependencies, and has no UI/server-action behavior.
- review-request SMS remains a future separate message class and is prohibited in On-The-Way operational template wording.
- F4D-B validation recorded: template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed.
- create/save draft server actions and review actions are complete; create/save draft UI is complete; review/reject UI remains deferred unless team-review workflow is reopened; real SMS remains deferred.

Slice F4D-E1 completion cross-reference (May 2026):

- Create/Save Draft UI is complete in commit `1b8b671`.
- F4D-E1 changed `app/ops/admin/communications/page.tsx` and touched server-action compatibility in `lib/actions/sms-template-actions.ts`.
- F4D-E1 added local notice rendering, `Draft Wording` card, create-draft form, and latest-draft-only save textarea/form.
- F4D-E1 wires only create/save draft actions and intentionally does not render review/activation controls.
- F4D-E1 preserves required non-sending copy and browser-safe posture.
- Browser smoke passed after local runtime target alignment (`draft_created`, `draft_saved`); initial `template_create_failed` was runtime-target mismatch, not a code defect.

Slice F4D-E3B completion cross-reference (May 2026):

- Admin Readiness UI Wiring is complete in commit `c998d0e`.
- `app/ops/admin/communications/page.tsx` now keeps `On-The-Way Template Governance` as the visible admin home for `Mark wording ready for sandbox`.
- the visible button appears only when the latest wording is eligible, posts only `version_id`, and uses `markOnTheWayTemplateReadyForSandboxFromForm`.
- V1 IA stays intentionally simple: no visible submit/review/reject queue, no activation language, no job-detail preview, and no field-user editor.
- review/reject UI remains deferred unless a larger team-review workflow is intentionally reopened.
- browser smoke recorded `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, and browser-safe rendering confirmed.
- targeted validation passed (`94/94`), TypeScript passed, `git diff --check` passed, working tree clean.
- template readiness does not enable SMS, sandbox readiness does not send SMS, Mark On The Way still does not send SMS, and real SMS remains deferred.

SMS On-The-Way V1 workflow simplification cross-reference (May 2026):

- Settings -> Communications remains the admin home for On-The-Way wording control.
- V1 does not require a visible multi-person approval queue; admin is the wording owner and effective approver.
- Field users only press Mark On The Way and do not write, preview, or freely edit SMS wording.
- Review/reject UI remains deferred unless a larger-company/team-review workflow is intentionally reopened.
- Future visible readiness language should prefer `Mark wording ready for sandbox` or `Wording ready for future SMS testing`.
- Template readiness and sandbox readiness do not send SMS or activate provider behavior.

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

A. Settings / Communications IA spec closeout. ✓ Complete
B. F3A Settings Communications readiness UI model lock closeout. ✓ Complete
C. F3B read-model helper planning/implementation (`lib/communications/sms-provider-readiness-read.ts`). ✓ Complete (commit `d370e56`)
D. F3C read-only Admin Center route/page planning/implementation (`/ops/admin/communications`). ✓ Complete (commit `994e79c`)
E. F4A On-The-Way Template Governance model lock closeout (`docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md`). ✓ Complete
F. F4B template schema foundation (`sms_message_templates`, `sms_message_template_versions`) with account-scoped RLS and no mutation/send behavior. ✓ Complete (`b676736`)
G. F4C-A template governance read-model helper (`lib/communications/sms-template-governance-read.ts`). ✓ Complete (`0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`)
H. F4C-B read-only template status/sample preview in `/ops/admin/communications`. ✓ Complete (`05475929cc69704b1fb22f3dabbde10ff83aed90`, stabilized by `1ffa475e2167eeb60a206358a4e7032a407bdd0f`)
I. F4D-A template editing/review actions model lock. Complete.
J. F4D-B validation helper only; no writes, no UI. ✓ Complete (`418172e`)
K. F4D-C create/save draft server actions.
L. F4D-D review actions.
M. F4D-E1 create/save draft UI. ✓ Complete (`1b8b671`)
N. F4D-E2 safe version-id/action-eligibility read-model support for admin readiness. ✓ Complete (`fededec`)
O. F4D-E3A combined admin readiness action. ✓ Complete (`8cfa814`)
P. F4D-E3B mark-ready UI wiring. ✓ Complete (`c998d0e`)
Q. Planning/audit for the future background On-The-Way send path.
R. Quiet-hours/timezone gate planning.
S. Provider/Twilio readiness and sandbox setup.
T. Sandbox provider send after all gates.
U. Production activation only after legal/provider review and explicit approval.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
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
