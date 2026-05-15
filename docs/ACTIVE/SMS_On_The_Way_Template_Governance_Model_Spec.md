# Compliance Matters - SMS On-The-Way Template Governance Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## 1) Current Decision

Slice F4A closes On-The-Way template governance model lock in documentation only.

Locked boundary for this slice:

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
- no On-The-Way automation
- no invoice/payment behavior changes
- no tenant Stripe payment execution
- no QBO behavior changes
- no portal expansion
- no marketplace feature implementation

F4A locks template governance semantics before schema, read model, preview UI, editing/review actions, sandbox, webhook, provider setup, or send behavior.

Real SMS remains deferred.

---

## F4B Completion Cross-Reference (May 2026)

SMS Slice F4B Template Governance Schema Foundation is complete.

- Implementation commit: `b676736`
- Migration: `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`
- Created tables:
  - `sms_message_templates`
  - `sms_message_template_versions`

Closeout semantics recorded:

- the safer two-table template governance model is now implemented
- `sms_message_templates` is the account-scoped template container/current pointer
- `sms_message_template_versions` is the durable governed wording/version record
- single-table `sms_templates` remains rejected for this lane
- template rows are account-scoped with RLS enabled
- SELECT-only RLS is available for authenticated active internal users in the same account
- no INSERT/UPDATE/DELETE policies were added in V1
- future writes remain deferred to admin-only server actions
- F4B does not enable template editing, preview, rendering, or sending
- F4B does not alter `sms_message_intents`
- `sms_message_intents.message_body_snapshot` remains the future audit record of what was attempted
- real SMS remains deferred

Validation recorded:

- `npx.cmd tsc --noEmit` passed
- `npx.cmd vitest run lib/communications/__tests__/sms-provider-readiness-read.test.ts` passed (`16/16`)
- `npx.cmd vitest run lib/communications/__tests__/sms-eligibility-inputs-read.test.ts` passed (`16/16`)
- `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed (`4/4`)
- `git diff --check` passed
- `supabase db reset --local --no-seed --yes` passed
- full local migration chain applied successfully, including F4B
- no production migration apply
- no production writes

State after F4B:

- template governance schema foundation exists
- template read-model/helper remains deferred
- template status/sample preview remains deferred to F4C
- template editing/review actions remain deferred
- provider setup remains deferred
- sandbox/live SMS remains deferred

## F4C-A Completion Cross-Reference (May 2026)

SMS Slice F4C-A Template Governance Read Model Helper is complete.

- implementation commit: `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`
- helper file: `lib/communications/sms-template-governance-read.ts`
- test file: `lib/communications/__tests__/sms-template-governance-read.test.ts`
- helper API: `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`

F4C-A read-model posture:

- reads only `sms_message_templates` and `sms_message_template_versions`
- account-scoped by `account_owner_user_id`
- safe-empty output for missing scope or no configured template rows
- browser-safe readiness/status output only
- always keeps SMS disabled and live sends disabled
- does not return `canSend`
- does not call provider/Twilio APIs
- does not read customer/job/contact data
- does not read `sms_message_intents` or `sms_provider_deliveries`
- supports sample-data preview only
- detects allowed and unknown `{{token_name}}` tokens
- unknown tokens block approval readiness
- missing STOP opt-out language blocks approval readiness
- approval readiness does not equal send readiness
- real SMS remains deferred

Validation recorded:

- template governance helper tests passed (`15/15`)
- provider readiness helper tests passed (`16/16`)
- SMS eligibility helper tests passed (`16/16`)
- contact recipient helper tests passed (`4/4`)
- TypeScript passed
- `git diff --check` passed

State after F4C-A:

- template governance schema foundation exists
- template governance read model exists
- template status/sample preview UI remains deferred to F4C-B
- template editing/review actions remain deferred
- provider setup remains deferred
- sandbox/live SMS remains deferred

## F4C-B Completion Cross-Reference (May 2026)

SMS Slice F4C-B Read-Only On-The-Way Template Governance Section is complete.

- implementation commit: `05475929cc69704b1fb22f3dabbde10ff83aed90`
- stabilization commit: `1ffa475e2167eeb60a206358a4e7032a407bdd0f`
- page changed: `app/ops/admin/communications/page.tsx`
- route: `/ops/admin/communications`
- section added: `On-The-Way Template Governance`
- section remains admin-only through existing Communications page access posture
- section is read-only and status/sample-preview only
- section uses `getSmsOnTheWayTemplateGovernanceForAccount`

Section summary:

- shows template governance status, template display name/lifecycle, current/sandbox/latest version summaries when present
- shows detected/unknown tokens, sample preview only, character count, estimated SMS segments, and STOP/unknown-token warnings
- includes required non-sending copy: `Sample preview only.`, `SMS is not enabled and live sends are disabled.`, `Mark On The Way does not send SMS.`, `Template readiness does not enable sending.`
- includes no send/test/sandbox/activation/edit/approval/provider setup controls
- exposes no raw provider refs, secrets, full phone numbers, customer data, job data, or raw JSON dump

Stabilization and smoke:

- stabilization added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions
- local missing-table behavior now degrades to safe-empty readiness state instead of page crash
- browser smoke passed after stabilization

Validation recorded:

- TypeScript passed
- template governance helper tests passed (`15/15`)
- provider readiness helper tests passed (`16/16`)
- SMS eligibility helper tests passed (`16/16`)
- contact recipient helper tests passed (`4/4`)
- `git diff --check` passed
- browser smoke passed after stabilization

State after F4C-B:

- template governance schema exists
- template governance read model exists
- template governance read-only UI section exists
- template editing/review actions remain deferred
- provider setup remains deferred
- sandbox/live SMS remains deferred
- webhook/status callback planning remains deferred

## F4D-A Model Lock Cross-Reference (May 2026)

SMS Slice F4D-A Template Editing + Review Actions Model Lock is complete in `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`.

F4D-A locks future admin edit/review mutation semantics before any write path exists:

- future action file: `lib/actions/sms-template-actions.ts`
- future validation helper file: `lib/communications/sms-template-governance-validation.ts`
- first implementation after docs should be validation helper only
- future create/save draft actions precede review actions and editable UI
- `createAdminClient()` writes are allowed only after `requireInternalRole("admin")` and explicit account-scope validation because F4B SELECT-only RLS remains intentional
- normal authenticated INSERT/UPDATE/DELETE policies remain absent
- approved/current template text is immutable; meaningful edits create a new draft version
- `sandbox_version_id` is set only by approve-for-sandbox
- `current_version_id` is not set by draft save or sandbox approval
- approving a template does not enable SMS send
- review-request SMS remains parked as a separate future message class and is not part of On-The-Way operational template wording
- real SMS remains deferred

## F4D-B Completion Cross-Reference (May 2026)

SMS Slice F4D-B Template Governance Validation Helper is complete.

- implementation commit: `418172e`
- helper file: `lib/communications/sms-template-governance-validation.ts`
- test file: `lib/communications/__tests__/sms-template-governance-validation.test.ts`
- helper API: `validateOnTheWayTemplateBody(bodyTemplate: string)`
- helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags
- helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments
- helper warns for multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content
- helper does not enable SMS, does not imply `canSend`, has no Supabase/database/provider dependencies, and has no UI/server-action behavior
- review-request SMS remains prohibited inside On-The-Way operational wording and is parked as a future separate message class

Validation recorded:

- template validation helper tests passed (`19/19`)
- template governance read tests passed (`15/15`)
- provider readiness tests passed (`16/16`)
- SMS eligibility tests passed (`16/16`)
- contact recipient tests passed (`4/4`)
- TypeScript passed
- `git diff --check` passed

State after F4D-B:

- template governance validation helper exists
- template create/save draft server actions remain deferred to F4D-C
- review actions remain deferred
- editable UI remains deferred
- real SMS remains deferred
## F4D-E3A Completion Cross-Reference (May 2026)

SMS Slice F4D-E3A Combined Admin Readiness Action is complete in commit `8cfa814`.

- action file: `lib/actions/sms-template-actions.ts`
- test file: `lib/actions/__tests__/sms-template-actions.test.ts`
- new action: `markOnTheWayTemplateReadyForSandboxFromForm`
- allows latest draft or latest pending_review version to be marked ready for sandbox testing
- simplified V1 workflow: no visible submit/approve/reject queue
- admin-only, account-scoped, accepts only version_id from form
- validates body to sandbox-approval standard with `validateOnTheWayTemplateBody()`
- sets version_status = approved_for_sandbox, internal_review_status = approved, sandbox_version_id only
- does not set current_version_id, does not activate, does not enable SMS, does not call provider
- uses rollback posture on pointer failure
- all tests passed (54/54 sms-template-actions, 19/19 validation, 21/21 read-model, etc.)
- visible mark-ready UI wiring remains deferred to F4D-E3B
- review/reject UI remains parked unless team-review workflow reopened
- real SMS remains deferred
## F4D-E1 Completion Cross-Reference (May 2026)

SMS Slice F4D-E1 Create/Save Draft UI is complete in commit `1b8b671`.

- page changed: `app/ops/admin/communications/page.tsx`
- server-action compatibility touched: `lib/actions/sms-template-actions.ts`
- UI adds local notice rendering, `Draft Wording` card, create-draft form, and latest-draft-only save form
- UI wires only `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm`
- review controls remain intentionally hidden in this slice
- required non-sending copy remains visible (`SMS is not enabled`, `Live sends are disabled`, `Template approval does not enable sending`, `Sample preview only`, `Mark On The Way does not send SMS`, legal/provider reminder)
- browser smoke passed after local runtime target alignment (`draft_created`, `draft_saved`)
- initial `template_create_failed` was runtime-target mismatch, not a template-governance code defect
- real SMS remains deferred

## SMS On-The-Way V1 Workflow Simplification (May 2026)

The V1 product direction is intentionally simple:

- Job users press Mark On The Way.
- Mark On The Way remains lifecycle-first and does not send SMS yet.
- Future provider SMS, when approved later, should run as a background notification after the lifecycle event and must not roll back the lifecycle transition on provider failure.
- Admin controls the On-The-Way wording; field users do not write or freely edit SMS wording.
- Job/customer-level custom SMS text is not part of V1.
- Admin is the V1 wording owner and effective approver.

The governed V1 wording remains simple operational/customer-care text, for example:

`Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.`

Visible V1 UI should stay admin-readiness oriented:

- Create draft from default.
- Edit/save draft wording.
- Later, mark wording ready for sandbox/readiness.
- Do not expose `Reject version` unless a larger-company/team-review workflow is intentionally reopened.
- Do not make `Submit for review` feel required for owner-led/admin-owned V1 unless explicitly reopened.
- Prefer `Mark wording ready for sandbox` or `Wording ready for future SMS testing` over approval-queue language.

Template governance remains admin/settings governance, not job timeline truth. `job_events` and manual contact logs are not provider delivery truth, and `sms_message_intents.message_body_snapshot` remains the future audit record of attempted SMS wording.

---

## 2) Governance Location

Locked location posture:

- template governance belongs inside `/ops/admin/communications`
- start as a section on the existing Communications page
- do not create a template sub-page until multiple templates, review artifacts, and version-history browsing justify expansion
- recommended section label: `On-The-Way Template Governance`
- Company Profile remains separate

Product language lock:

- use `On-The-Way Notification` or `On-The-Way SMS` for product UI
- use `campaign` only for provider/A2P terminology

---

## 3) Access Posture

Locked access posture:

- admin-only
- reuse existing Communications guard pattern: `requireInternalRole("admin", { supabase, userId })`
- no field-user editing
- no job-detail template preview
- no job-detail SMS editor
- no operator/tech free-text SMS wording
- field users remain lifecycle-only
- future SMS evaluation remains background/event-driven

---

## 4) Template Data Model Decision

Locked future model is a two-table model:

- `sms_message_templates`
- `sms_message_template_versions`

Decision semantics:

- `sms_message_templates` is the account-scoped template container/current pointer
- `sms_message_template_versions` is the durable immutable wording/version record
- approved historical body text must not be mutated
- do not use a single `sms_templates` table for this lane

F4B schema scope lock:

- add only these two core tables in first schema slice
- park a separate template event/ledger table unless review workflow later requires full state-transition history

---

## 5) `sms_message_templates` Recommended Fields

Recommended future fields:

- `id`
- `account_owner_user_id`
- `template_key`
- `message_class`
- `display_name`
- `lifecycle_status`
- `current_version_id`
- `sandbox_version_id`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Default/first values:

- `template_key`: `on_the_way`
- `message_class`: `on_the_way`

Unique recommendation:

- unique `(account_owner_user_id, template_key)`

---

## 6) `sms_message_template_versions` Recommended Fields

Recommended future fields:

- `id`
- `account_owner_user_id`
- `sms_message_template_id`
- `template_key`
- `message_class`
- `version_number`
- `version_label`
- `body_template`
- `body_hash`
- `detected_tokens`
- `unknown_tokens`
- `token_policy_version`
- `content_classification`
- `version_status`
- `internal_review_status`
- `legal_review_status`
- `provider_review_status`
- `approved_by_user_id`
- `approved_at`
- `rejected_by_user_id`
- `rejected_at`
- `rejected_reason`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Version record immutability lock:

- meaningful body changes create a new version row
- approved version body text is immutable
- superseded/retired versions remain durable for audit

---

## 7) Parked Fields and Features

Parked until explicit later approval:

- separate `sms_message_template_events`
- locale support
- multi-language templates
- per-location overrides
- per-business-unit overrides
- rich template-variable snapshot table
- provider registration evidence links
- public/customer-facing template preview
- job-detail template preview
- editable UI in F4C
- activation controls in F4C

---

## 8) Template Lifecycle Statuses

Locked planning values for `sms_message_templates.lifecycle_status`:

- `draft`
- `active`
- `paused`
- `archived`

---

## 9) Template Version Statuses

Locked planning values for `sms_message_template_versions.version_status`:

- `draft`
- `pending_review`
- `approved_for_sandbox`
- `approved_for_activation`
- `active`
- `rejected`
- `superseded`
- `retired`

---

## 10) Review States

Locked review-state values:

- `not_requested`
- `pending`
- `approved`
- `rejected`

Review-separation lock:

- internal approval, legal review, and provider review are separate controls
- internal admin approval does not imply legal/provider approval
- activation requires approved/active version state plus future legal/provider and activation gates

---

## 11) Token Model

Initial allowed tokens:

- `recipient_first_name`
- `operator_or_tech_name`
- `company_name`
- `appointment_or_job_context`

Parked tokens:

- `window_start_local`
- `window_end_local`
- `service_city`
- `assigned_tech_phone`
- `job_address`
- `arrival_eta`

Token rules:

- unknown tokens block approval
- unknown tokens block activation
- unknown tokens block future send rendering
- tokens are rendered server-side only
- browser preview may show safe server-generated sample output; browser interpolation is not authoritative
- avoid tokens that expose uncontrolled notes, full addresses, payment links, invoice amounts, raw phone numbers, or job snapshot fields

---

## 12) Default Planning Wording

Planning-only default body:

Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.

Wording lock:

- this is not final legal/provider-approved production copy
- `Reply STOP to opt out` is mandatory for the first governed On-The-Way template
- HELP behavior remains part of provider/opt-out readiness planning

---

## 13) Prohibited Wording and Content

Prohibited content for On-The-Way operational SMS:

- discounts
- upsells
- review requests
- referral requests
- promotional offers
- payment execution claims
- pressure/urgency language
- mixed operational and marketing wording
- uncontrolled free-text notes

---

## 14) Preview Posture

Locked preview posture:

- preview belongs only in Admin Communications
- no job-detail preview
- no field-user preview
- V1 preview uses sample data only until live send exists

Suggested sample data:

- recipient: `Taylor`
- operator: `Alex`
- company: current company display name or `Your company`
- context: `your service appointment`

Preview safety copy:

- `Sample preview only. SMS is not enabled and live sends are disabled.`

Locked exclusions:

- no send button
- no sandbox send button

---

## 15) Mutation and RLS Boundaries

Future F4B/F4 editing posture:

- account-scoped SELECT for active internal users
- no customer/portal access
- no public access
- no direct authenticated delete
- prefer no direct authenticated INSERT/UPDATE in first schema slice
- future edits require admin-only server actions
- future edit scope must be bound by `account_owner_user_id`
- meaningful body changes create a new version
- approved historical body text is immutable
- future edit/review actions should be audit logged
- future mutation actions should revalidate `/ops/admin/communications`

Locked exclusions:

- no provider calls
- no send behavior

---

## 16) Relationship to `sms_message_intents`

Locked F4 relationship posture:

- keep current E2 tables unchanged for F4
- future send decision should copy:
  - `template_key`
  - `template_version`
  - rendered `message_body_snapshot`
- `sms_message_intents.message_body_snapshot` remains the audit record of what was attempted

Parked E2 linkage note:

- nullable `sms_message_template_version_id` may be considered later
- do not alter E2 in F4 unless explicitly approved
- text `template_version` remains acceptable while no send path exists

---

## 17) Settings -> Communications Implications

Future Communications page should eventually show:

- template governance status (`Deferred`, `Draft`, `Pending review`, `Approved for sandbox`, `Approved for activation`, `Active`)
- active/current template version if present
- sample preview
- review status
- clear copy that SMS is not enabled

Still hidden/absent in F4C:

- activation toggle
- send controls
- template editor
- provider setup
- provider refs
- credentials/secrets

---

## 18) Risk Assessment

Compliance risk:

- wording can drift into marketing unless classification and prohibited-content checks are explicit

Wording drift risk:

- risk remains high without versioning
- approved text must be immutable after approval

Provider review risk:

- Twilio/A2P sample wording may require review
- internal approval is not enough

Token/privacy risk:

- tokens may leak notes, addresses, phone numbers, or uncontrolled context if not allowlisted

Tenant leakage risk:

- all template rows must be account-scoped and never shared implicitly

Operational UX risk:

- editable-looking UI can imply SMS is live; keep F4C read-only

---

## 19) Future Sequence

A. F4A docs/model lock closeout. ✓ Complete
B. F4B template schema foundation with `sms_message_templates` and `sms_message_template_versions`. ✓ Complete (`b676736`)
C. F4C-A template governance read-model helper (`lib/communications/sms-template-governance-read.ts`). ✓ Complete (`0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`)
D. F4C-B read-only template status/sample preview in `/ops/admin/communications`. ✓ Complete (`05475929cc69704b1fb22f3dabbde10ff83aed90`, stabilized by `1ffa475e2167eeb60a206358a4e7032a407bdd0f`)
E. F4D-A template editing/review actions model lock. Complete.
F. F4D-B validation helper. ✓ Complete (`418172e`)
G. F4D-C create/save draft server actions.
H. F4D-D review actions.
I. F4D-E1 create/save draft UI. ✓ Complete (`1b8b671`)
J. F4D-E2 safe version-id/action-eligibility read-model support for admin readiness. ✓ Complete (`fededec`)
K. F4D-E3A combined admin readiness action. ✓ Complete (`8cfa814`)
L. F4D-E3B mark-ready UI wiring (deferred pending team-review workflow determination).
M. Later webhook/status callback contract planning.
N. Later sandbox/provider planning.
O. Later production activation only after legal/provider review and explicit approval.

---

## 20) F4B Closeout Validation

F4B scope and boundary confirmation:

- create only template-governance schema foundation
- no send behavior
- no provider behavior
- no webhook
- no sandbox send
- no activation
- no UI edit controls
- no E2 alteration unless separately approved
- account-scoped RLS
- no customer/portal access
- no direct delete policy

F4B implementation and validation confirmation:

- implementation commit: `b676736`
- migration: `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`
- created `sms_message_templates` and `sms_message_template_versions`
- TypeScript passed
- provider readiness helper tests passed (`16/16`)
- SMS eligibility helper tests passed (`16/16`)
- contact recipient helper tests passed (`4/4`)
- `git diff --check` passed
- `supabase db reset --local --no-seed --yes` passed
- full local migration chain applied successfully, including F4B
- no production migration apply and no production writes

Documentation acceptance criteria:

- ACTIVE docs lock template governance location
- ACTIVE docs lock admin-only/no field-edit posture
- ACTIVE docs lock two-table future model
- ACTIVE docs lock statuses/review states
- ACTIVE docs lock allowed tokens and parked tokens
- ACTIVE docs lock default planning wording and mandatory STOP language
- ACTIVE docs lock prohibited wording
- ACTIVE docs lock preview posture
- ACTIVE docs lock mutation/RLS boundaries
- ACTIVE docs lock relationship to `sms_message_intents`
- real SMS remains deferred
- no code/schema/migration files changed for F4A

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md
- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md
- docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md
- docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md
- docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
