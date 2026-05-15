# Compliance Matters - SMS Settings Communications Readiness UI Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## F3B Completion Cross-Reference (May 2026)

Slice F3B Provider Readiness Read-Model Helper is complete in commit `d370e56`:
- Implementation: `lib/communications/sms-provider-readiness-read.ts` and `lib/communications/__tests__/sms-provider-readiness-read.test.ts`
- Helper API: `getSmsProviderReadinessForAccount({ supabase, accountOwnerUserId })`
- This spec (F3A) defined the browser-safe output contract; F3B delivers the implementation.

## F3C Completion Cross-Reference (May 2026)

Slice F3C Read-Only Admin Communications Page is complete in commit `994e79c`:
- Route: `/ops/admin/communications` (admin-only, read-only)
- Admin Center card: `Communications` with description "Review SMS/provider readiness. SMS is not enabled and live sends are disabled."
- Page displays 6 sections: Communications Status, SMS Provider Readiness, Sender Identity, On-The-Way Notification, Compliance Readiness, Activation Status
- Page uses F3B helper and implements this spec's browser-safe/no-secret/no-send output contract
- Real SMS remains deferred

## F4A Cross-Reference (May 2026)

On-The-Way Template Governance model lock is complete in `docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md`.

F4A planning lock impact for this readiness model:

- future template governance section label is `On-The-Way Template Governance`
- future template model is locked as two-table (`sms_message_templates`, `sms_message_template_versions`)
- future template sample preview remains admin-only and read-only in Communications
- no editable template controls are approved in this slice
- real SMS remains deferred

## F4B Completion Cross-Reference (May 2026)

Slice F4B Template Governance Schema Foundation is complete in commit `b676736` with migration `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`.

- F4B implemented the safer two-table governance model (`sms_message_templates`, `sms_message_template_versions`) as account-scoped foundation with RLS enabled and SELECT-only policy posture for authenticated active internal users in the same account.
- `sms_message_templates` is the account-scoped template container/current pointer.
- `sms_message_template_versions` is the durable governed wording/version record.
- single-table `sms_templates` remains rejected for this lane.
- no INSERT/UPDATE/DELETE policies were added in V1; future writes remain deferred to admin-only server actions.
- this slice does not enable template editing, preview, rendering, or sending.
- this slice does not alter `sms_message_intents`; `sms_message_intents.message_body_snapshot` remains the future attempted-message audit record.
- validation recorded: TypeScript passed, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, `git diff --check` passed, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F4B.
- no production migration apply and no production writes.
- F4C read-only template status/sample preview remains deferred; real SMS remains deferred.

## F4C-A Completion Cross-Reference (May 2026)

Slice F4C-A Template Governance Read Model Helper is complete in commit `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`.

- helper file: `lib/communications/sms-template-governance-read.ts`
- test file: `lib/communications/__tests__/sms-template-governance-read.test.ts`
- helper API: `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`
- helper reads only `sms_message_templates` and `sms_message_template_versions`, scoped by `account_owner_user_id`
- helper returns safe-empty output for missing scope or no configured template rows
- helper returns browser-safe readiness/status output only and always keeps SMS disabled/live sends disabled
- helper does not return `canSend`, does not call provider/Twilio APIs, does not read customer/job/contact data, and does not read `sms_message_intents` or `sms_provider_deliveries`
- helper supports sample-data preview only, token detection, unknown-token approval blocking, STOP-language approval blocking, and approval-readiness-only semantics
- validation recorded: template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed
- no UI/route/schema/migration/Supabase/provider/send behavior changes in this slice
- F4C-B read-only template status/sample preview UI remains deferred; real SMS remains deferred

## F4C-B Completion Cross-Reference (May 2026)

Slice F4C-B Read-Only On-The-Way Template Governance Section is complete.

- implementation commit: `05475929cc69704b1fb22f3dabbde10ff83aed90`
- stabilization commit: `1ffa475e2167eeb60a206358a4e7032a407bdd0f`
- page changed: `app/ops/admin/communications/page.tsx`
- route: `/ops/admin/communications`
- section added: `On-The-Way Template Governance`
- section is admin-only via existing Communications page access posture
- section is read-only and status/sample-preview only
- section uses `getSmsOnTheWayTemplateGovernanceForAccount`
- section shows governance status, display name/lifecycle, current/sandbox/latest summaries when present, token summaries, sample preview only, character count/segment estimate, and STOP/unknown-token warnings
- section includes required non-sending copy and no send/test/sandbox/activation/edit/provider controls
- section does not expose raw provider refs, secrets, full phone numbers, customer/job data, or raw JSON dump
- stabilization added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions
- browser smoke passed after stabilization
- validation recorded: TypeScript passed, template governance tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, and `git diff --check` passed
- real SMS remains deferred

## F4D-A Model Lock Cross-Reference (May 2026)

Slice F4D-A Template Editing + Review Actions Model Lock is complete in `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`.

- F4D-A is docs/model-only and does not implement mutation paths, server actions, editable UI, schema changes, provider calls, or SMS sends.
- Future validation helper location is locked as `lib/communications/sms-template-governance-validation.ts`.
- Future mutation file is locked as `lib/actions/sms-template-actions.ts`, with `requireInternalRole("admin")`, account scope derived from authenticated internal-user context, explicit scoped lookups, and admin-client writes only after validation.
- First future action posture is create/save draft only; review actions and editable UI remain later slices.
- Template approval/readiness does not enable SMS sending, sandbox sends, provider setup, webhook behavior, activation, or Mark On The Way automation.
- Communications UI copy must continue to state that SMS is not enabled, live sends are disabled, template approval does not enable sending, and previews are sample-only.

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
- review-request SMS remains parked as a future separate message class and is prohibited in On-The-Way operational template wording
- validation recorded: template validation helper tests `19/19`, template governance read tests `15/15`, provider readiness tests `16/16`, SMS eligibility tests `16/16`, contact recipient tests `4/4`, TypeScript passed, and `git diff --check` passed
- real SMS remains deferred; create/save draft server actions and review actions are complete, create/save draft UI is complete, and review controls UI remains deferred

## F4D-E1 Completion Cross-Reference (May 2026)

Slice F4D-E1 Create/Save Draft UI is complete in commit `1b8b671`.

- page updated: `app/ops/admin/communications/page.tsx`
- server-action compatibility touched: `lib/actions/sms-template-actions.ts`
- UI adds local notice rendering, `Draft Wording` card, create-draft form, and latest-draft-only textarea/save form
- UI wires only `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm`
- UI does not wire submit/review/approve/reject/activation controls
- non-live copy remains explicit (`SMS is not enabled`, `Live sends are disabled`, `Template approval does not enable sending`, `Sample preview only`, `Mark On The Way does not send SMS`, legal/provider review reminder)
- browser smoke passed after local runtime target alignment with `draft_created` and `draft_saved`
- runtime mismatch finding recorded: initial `template_create_failed` came from local-reset vs runtime-target mismatch, not a code defect
- real SMS remains deferred

---

## 1) Current Decision

Slice F3A closes Settings -> Communications readiness UI posture in documentation only.

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
- no activation toggle
- no template editor

Real SMS remains deferred.

---

## 2) Route and IA Decision

Locked route and IA posture:

- future route: `/ops/admin/communications`
- future nav/admin label: `Communications`
- do not use `/ops/admin/settings/communications` unless a broader nested settings IA is introduced later
- do not call V1 route `SMS Settings` because it implies live/editable behavior
- do not call V1 route `Notifications` because that scope is broader than SMS readiness
- Company Profile remains separate and does not own SMS provider/sender/template controls

---

## 3) Admin Center Card Posture

Future Admin Center card content:

- title: `Communications`
- description: `Review SMS/provider readiness. SMS is not enabled and live sends are disabled.`
- CTA: `Review readiness`

Card placement/meaning:

- card belongs in Admin Center organization/admin area
- card must not imply SMS can send
- first read-only implementation must not expose provider setup controls

---

## 4) Access and Role Guard

V1 access posture:

- admin-only route
- use existing admin guard pattern: `requireInternalRole("admin", { supabase, userId })`
- contractors redirect to `/portal`
- non-admin internal users redirect to `/ops`
- do not render read-only unavailable state to non-admin users in V1

Future mutation boundary:

- edits remain admin/owner-only through server actions

---

## 5) First Page Sections (Read-Only V1)

### A. Communications Status

- `SMS is not enabled.`
- `Live sends are disabled.`
- `This page is readiness/status only.`

### B. SMS Provider Readiness

Read-only fields:

- provider name
- environment
- readiness status
- activation status
- callback readiness

Empty state:

- `Provider setup has not been configured.`

### C. Sender Identity

Read-only fields:

- sender label
- sender type
- masked phone/sender
- verification status
- activation status

Empty state:

- `No sender identity is configured.`

### D. On-The-Way Notification

- `Planned only. Mark On The Way does not send SMS.`

### E. Compliance Readiness

Status-only checklist posture:

- recipient registry: structurally complete
- consent/suppression: structurally complete
- eligibility input helper: structurally complete
- intent/delivery audit tables: structurally complete
- provider config/sender identity schema: structurally complete
- quiet-hours send gate: deferred
- template governance: deferred
- provider webhook/signature validation: deferred
- sandbox validation: deferred
- legal/provider review: deferred
- explicit activation: disabled/deferred

### F. Activation Status

Always show effective send state:

- `Live sends are disabled.`

If DB activation state is active before send path exists, use wording such as:

- `Configured active; send path unavailable in this build.`

---

## 6) Read-Only First Implementation Posture

Locked implementation posture:

- first implementation is read-only
- no editable fields in F3
- no activation toggle
- no template editor
- no provider credential form
- no provider setup form
- no test/SMS/sandbox send controls

---

## 7) Secrets and Provider Reference Safety

No-secret browser posture:

- no secrets in browser HTML
- never display auth tokens, API secrets, webhook secrets, private keys, or env var values

Provider-reference display safety:

- do not expose full refs by default:
  - `provider_account_ref`
  - `default_messaging_service_ref`
  - `provider_sender_ref`
  - `messaging_service_ref`
  - `provider_brand_ref`
  - `provider_campaign_ref`
  - `provider_registration_ref`
- future read model should map these to safe labels/booleans such as `Configured`/`Not configured`
- sender phone display should be masked using `phone_last4`

---

## 8) Future Read-Model Helper Decision

Locked next implementation target:

- `lib/communications/sms-provider-readiness-read.ts`

Inputs:

- `supabase`
- `accountOwnerUserId`

Reads:

- `sms_provider_configurations`
- `sms_sender_identities`

Behavior:

- account-scoped by `account_owner_user_id`
- safe empty result when no rows exist
- no provider calls
- no secrets
- no full raw provider refs in browser output
- mask sender phone using `phone_last4`
- convert provider refs to safe booleans/labels

---

## 9) Read Model Output Posture

Likely read-model outputs:

- communications status summary
- provider readiness summary
- sender identity summary
- compliance checklist summary
- activation effective state
- safe-empty state
- deferred-items list

Locked exclusions:

- should not return send eligibility
- should not return `canSend`
- should not return secrets or full provider refs

---

## 10) Status Mapping (UI Labels)

Provider readiness mapping:

- `draft` -> `Setup required`
- `sandbox_only` -> `Sandbox only`
- `registration_required` -> `Registration required`
- `registration_pending` -> `Registration pending`
- `provider_review_required` -> `Provider review required`
- `ready_for_sandbox` -> `Ready for sandbox`
- `ready_for_activation` -> `Ready for activation`
- `active` -> `Provider ready`
- `paused` -> `Paused`
- `rejected` -> `Rejected`
- no row -> `Not configured`

Activation mapping:

- `disabled` -> `Disabled`
- `pending_activation` -> `Pending activation`
- `active` -> `Configured active; live sends still unavailable`
- `paused` -> `Paused`

Callback readiness mapping:

- `not_configured` -> `Not configured`
- `pending` -> `Pending`
- `ready` -> `Ready`
- `failed` -> `Needs attention`
- `not_applicable` -> `Not applicable`

Sender verification mapping:

- `draft` -> `Draft`
- `pending_verification` -> `Pending verification`
- `verified` -> `Verified`
- `rejected` -> `Rejected`
- `active` -> `Active sender configuration`
- `paused` -> `Paused`

---

## 11) Provider Readiness Checklist Posture

Future checklist categories:

- Provider configuration
- Sender identity
- Registration/verification
- Opt-out/help readiness
- Status callback readiness
- Inbound callback readiness
- Template governance
- Consent/suppression model
- Audit tables
- Sandbox validation
- Legal/provider review
- Explicit activation

Structurally complete now:

- recipient registry
- consent/suppression foundation
- non-sending eligibility helper
- intent/delivery audit tables
- provider config/sender identity schema

Deferred now:

- quiet-hours send gate
- template governance
- provider webhook/signature validation
- sandbox validation
- legal/provider review
- activation

---

## 12) Marketplace and Tenant Guardrails

Normal admin UI language stays account-scoped:

- `Sender identity is configured for this account.`

Guardrails:

- do not introduce marketplace language in normal admin UI yet
- shared sender identity warnings remain docs/internal planning until marketplace onboarding is real
- provider/sender data must remain tenant/account scoped

---

## 13) No-Go UI Controls (F3)

F3 page must not include:

- send button
- test SMS button
- sandbox send button
- activation toggle
- template editor
- provider credential form
- Twilio API calls
- webhook setup
- environment/secret display
- full provider refs in HTML
- marketplace controls

---

## 14) Future Implementation Sequence

A. F3A docs/model lock closeout. ✓ Complete
B. F3B read-model helper returning safe account-scoped readiness. ✓ Complete (commit `d370e56`)
C. F3C read-only Admin Center route/page. ✓ Complete (commit `994e79c`)
D. F4A/F4B/F4C template governance model/schema/read-only UI. Complete.
E. F4D-A template editing/review actions model lock. Complete.
F. F4D-B validation helper only; no writes, no UI. ✓ Complete (`418172e`)
G. F4D-C create/save draft server actions.
H. F4D-D review actions.
I. F4D-E1 create/save draft UI. ✓ Complete (`1b8b671`)
J. F4D-E2 safe version-id/action-eligibility read-model support.
K. F4D-E3 review controls UI.
L. Later slices: provider setup mutation planning, webhook/signature validation, sandbox send planning, activation planning.

---

## 15) Future Implementation Acceptance Criteria (Read-Only First)

First read-only implementation should satisfy:

- `/ops/admin/communications` exists and is admin-only
- Admin Center links to Communications
- no-row state clearly says SMS is not enabled and provider setup is not configured
- existing provider/sender rows render only account-scoped, browser-safe status
- provider refs and phone numbers are hidden or masked
- no send, sandbox, activation, template, credential, or provider setup controls appear
- no Twilio/network/provider calls happen
- non-admin users cannot view the page

---

## 16) Future Validation Plan

Future F3 implementation validation should include:

- read-model unit tests for empty state, status mapping, masking, and account scope
- route smoke for admin access
- non-admin redirect check
- browser smoke confirming no send/activation controls
- browser/source check confirming no secrets or full provider refs render
- `npx.cmd tsc --noEmit`
- `git diff --check`
- rerun existing communications tests around recipient/eligibility helpers if touched

---

## Related ACTIVE References

- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md
- docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md
- docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md
- docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md
- docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md
- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
