# Compliance Matters - SMS Template Editing and Review Actions Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-15

---

## 1) Current Decision

Slice F4D-A locks the future admin template editing and review action model in documentation only.

This slice does not implement any mutation path. It records the semantics required before future server actions or editable UI exist.

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

Template approval does not enable SMS sending.

Template readiness does not enable SMS sending.

Real SMS remains deferred.

---

## 2) Implementation Sequence Lock

Future sequence:

A. F4D-A docs/model lock.
B. F4D-B validation helper. ✓ Complete (`418172e`)
C. F4D-C create/save draft server actions. ✓ Complete (`f7cf8c0`)
D. F4D-D review actions. ✓ Complete (`f5995d7`)
E. F4D-E1 create/save draft UI. ✓ Complete (`1b8b671`)
F. F4D-E2 safe version-id/action-eligibility read-model support. ✓ Complete (`fededec`)
G. F4D-E3A combined admin readiness action. ✓ Complete (`8cfa814`)
H. F4D-E3B mark-ready UI wiring. ✓ Complete (`c998d0e`)
I. Later provider/legal review operations.
J. Later sandbox/provider work.
K. Later production activation only after explicit approval.

Do not skip from this docs lock directly to full editable UI or review/approval controls.

---

## 3) Server Action Architecture

Future server action file:

- `lib/actions/sms-template-actions.ts`

Future server action posture:

- use authenticated session/client for user context
- use `requireInternalRole("admin")`
- use `createAdminClient()` for actual writes because F4B intentionally has SELECT-only RLS
- derive `account_owner_user_id` from authenticated internal user context
- never trust account owner id from client input
- never trust template id, version id, or status from client input without scoped lookup
- always scope writes by `account_owner_user_id`
- always revalidate `/ops/admin/communications`
- optionally revalidate `/ops/admin`

Normal authenticated write policies remain absent. Future writes use admin-only server actions after explicit role and account-scope validation.

---

## 4) Planned Action Names

Initial future action names:

- `createOnTheWayTemplateDraftFromDefaultFromForm`
- `saveOnTheWayTemplateDraftFromForm`

Later future action names:

- `submitOnTheWayTemplateVersionForReviewFromForm`
- `approveOnTheWayTemplateVersionForSandboxFromForm`
- `rejectOnTheWayTemplateVersionFromForm`
- `pauseOnTheWayTemplateFromForm`
- `retireOnTheWayTemplateVersionFromForm`

Postponed actions:

- approve for activation
- provider/legal approval actions
- activation actions
- sandbox send
- any provider/Twilio calls

---

## 5) Validation Helper Design

Future validation helper file:

- `lib/communications/sms-template-governance-validation.ts`

Recommended API:

```ts
validateOnTheWayTemplateBody(bodyTemplate: string): {
  normalizedBodyTemplate: string;
  bodyHash: string;
  detectedTokens: string[];
  unknownTokens: string[];
  stopLanguagePresent: boolean;
  prohibitedContentHits: string[];
  contentClassification: "operational";
  samplePreview: string;
  characterCount: number;
  estimatedSegments: number;
  canSaveDraft: boolean;
  canSubmitForReview: boolean;
  canApproveForSandbox: boolean;
  blockingReasons: string[];
  warnings: string[];
}
```

The validation helper should own:

- allowed tokens
- planning default body
- sample token values
- STOP-language regex
- token policy version
- segment estimate
- prohibited wording rules

Validation rules:

- empty body blocks save
- body hash is calculated server-side with SHA-256
- detected tokens are calculated server-side
- unknown tokens are calculated server-side
- unknown tokens block submit/review/sandbox approval
- missing `Reply STOP to opt out` blocks submit/review/sandbox approval
- content classification remains `operational`
- prohibited promotional wording blocks submit/review/sandbox approval
- segment estimate warns above 1 segment
- approval should block above 2 estimated segments until provider/legal review says otherwise
- draft save can allow warnings, but not blank or nonsensical body

Initial allowed tokens:

- `recipient_first_name`
- `operator_or_tech_name`
- `company_name`
- `appointment_or_job_context`

Tokens remain server-rendered only. Browser preview may display server-generated sample output, but browser interpolation is not authoritative.

## F4D-B Completion Cross-Reference (May 2026)

SMS Slice F4D-B Template Governance Validation Helper is complete.

- implementation commit: `418172e`
- helper file: `lib/communications/sms-template-governance-validation.ts`
- test file: `lib/communications/__tests__/sms-template-governance-validation.test.ts`
- helper API: `validateOnTheWayTemplateBody(bodyTemplate: string)`
- helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, deterministic SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags
- helper returns blocking reason codes and warning codes for validation-only governance posture
- helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments
- helper warns for multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content
- helper does not enable SMS, does not imply `canSend`, has no Supabase/database/provider dependencies, and has no UI or server-action behavior
- review-request SMS is parked as a future separate message class and remains prohibited inside On-The-Way operational template wording

Validation recorded:

- template validation helper tests passed (`19/19`)
- template governance read tests passed (`15/15`)
- provider readiness tests passed (`16/16`)
- SMS eligibility tests passed (`16/16`)
- contact recipient tests passed (`4/4`)
- TypeScript passed
- `git diff --check` passed

State after F4D-B:

- validation helper exists and is locked non-sending
- create/save draft server actions remain deferred to F4D-C
- review actions remain deferred
- editable UI remains deferred
- real SMS remains deferred

---

## F4D-C Completion Cross-Reference (May 2026)

SMS Slice F4D-C Create/Save On-The-Way Template Draft Actions is complete.

- implementation commit: `f7cf8c0`
- action file: `lib/actions/sms-template-actions.ts`
- test file: `lib/actions/__tests__/sms-template-actions.test.ts`
- actions added: `createOnTheWayTemplateDraftFromDefaultFromForm`, `saveOnTheWayTemplateDraftFromForm`
- pure helpers exported for testability: `resolveNextVersionNumber`, `isVersionMutable`
- actions are admin-only via `requireInternalRole("admin")`
- actions use `createAdminClient()` for all writes because F4B intentionally has SELECT-only RLS
- actions derive `account_owner_user_id` from authenticated internal-user context; form input for owner is ignored
- `createOnTheWayTemplateDraftFromDefaultFromForm` ensures/reuses the parent template container; reuses an existing mutable draft if one exists; creates a new draft version at `max(version_number) + 1` when the latest is immutable
- `saveOnTheWayTemplateDraftFromForm` validates the submitted body with `validateOnTheWayTemplateBody`; blocks blank body; updates a mutable draft in place; creates a new draft version when the latest is immutable
- both actions persist all validation metadata: `body_template` (normalized), `body_hash`, `detected_tokens`, `unknown_tokens`, `token_policy_version = "v1"`, `content_classification = "operational"`
- both actions revalidate `/ops/admin/communications` and `/ops/admin` on success
- notice/redirect outcomes: `admin_required`, `body_blank`, `draft_created`, `draft_available`, `draft_saved`, `draft_validation_warning`
- `current_version_id` is never set by these actions
- `sandbox_version_id` is never set by these actions
- no UI is wired yet

Validation recorded:

- template action tests passed (`20/20`)
- template validation helper tests passed (`19/19`)
- template governance read tests passed (`15/15`)
- provider readiness tests passed (`16/16`)
- SMS eligibility tests passed (`16/16`)
- contact recipient tests passed (`4/4`)
- TypeScript passed
- `git diff --check` passed
- total: `90/90`

State after F4D-C:

- template governance schema exists
- template governance read model exists
- template governance read-only UI exists
- template validation helper exists
- create/save draft server actions exist
- review actions remain deferred (F4D-D)
- editable UI remains deferred (F4D-E)
- provider setup remains deferred
- sandbox/live SMS remains deferred
- real SMS remains deferred

---

## F4D-D Completion Cross-Reference (May 2026)

SMS Slice F4D-D Template Review Actions is complete.

- implementation commit: `f5995d7`
- action file: `lib/actions/sms-template-actions.ts`
- test file: `lib/actions/__tests__/sms-template-actions.test.ts`
- actions added: `submitOnTheWayTemplateVersionForReviewFromForm`, `approveOnTheWayTemplateVersionForSandboxFromForm`, `rejectOnTheWayTemplateVersionFromForm`
- actions are admin-only via `requireInternalRole("admin")`
- actions are account-scoped from authenticated internal-user context and never trust `account_owner_user_id` from form input
- actions use `createAdminClient()` for writes because template governance tables remain SELECT-only for authenticated users
- submit action requires scoped/latest draft + `validateOnTheWayTemplateBody(...).canSubmitForReview`, then moves version to `pending_review` with internal review `pending` only
- approve-for-sandbox action requires scoped/latest pending-review + internal review `pending` + `validateOnTheWayTemplateBody(...).canApproveForSandbox`, then moves version to `approved_for_sandbox` and sets parent `sandbox_version_id` only
- reject action requires scoped pending-review version and non-blank reason, normalizes reason and bounds to 500 chars, then moves version to `rejected`
- approve-for-sandbox includes best-effort rollback when parent sandbox pointer update fails
- `current_version_id` remains untouched
- no activation behavior exists
- no provider/Twilio/send/webhook behavior exists
- template approval/readiness still does not enable SMS sending
- real SMS remains deferred

Validation recorded:

- template action tests passed (`40/40`)
- template validation helper tests passed (`19/19`)
- template governance read tests passed (`15/15`)
- provider readiness tests passed (`16/16`)
- SMS eligibility tests passed (`16/16`)
- contact recipient tests passed (`4/4`)
- TypeScript passed
- `git diff --check` passed
- total: `110/110`

State after F4D-D:

- template governance schema exists
- template governance read model exists
- template governance read-only UI exists
- template validation helper exists
- create/save draft actions exist
- submit/approve-for-sandbox/reject review actions exist
- create/save draft UI exists (F4D-E1 complete)
- admin-readiness read-model support exists (F4D-E2 complete)
- review/reject UI remains deferred unless team-review workflow is reopened
- approve-for-activation remains deferred
- provider/legal approval actions remain deferred
- provider setup remains deferred
- sandbox/live SMS remains deferred
- real SMS remains deferred

---

## F4D-E3A Completion Cross-Reference (May 2026)

SMS Slice F4D-E3A Combined Admin Readiness Action is complete.

- implementation commit: `8cfa814`
- action file: `lib/actions/sms-template-actions.ts`
- test file: `lib/actions/__tests__/sms-template-actions.test.ts`
- new action: `markOnTheWayTemplateReadyForSandboxFromForm`
- this action supports the simplified V1 admin-owned workflow and avoids exposing a queue-shaped submit/approve/reject workflow
- allows the latest draft or latest pending_review template version to be marked ready for sandbox testing
- admin-only enforcement via `requireInternalRole("admin")` + account scope from authenticated context
- accepts only `version_id` from form; re-validates all data server-side
- validates body with `validateOnTheWayTemplateBody()` — requires sandbox-readiness standard
- sets sandbox readiness only: `version_status = approved_for_sandbox`, `internal_review_status = approved`, `sandbox_version_id = version.id`
- does not set `current_version_id`
- does not activate SMS or set `lifecycle_status`
- does not enable SMS, does not send SMS, does not call Twilio/provider/webhook behavior
- uses pointer-failure rollback posture if parent `sandbox_version_id` update fails
- revalidates `/ops/admin/communications` on success

Validation recorded:

- sms-template-actions.test.ts: 54/54 passed
- sms-template-governance-validation.test.ts: 19/19 passed
- sms-template-governance-read.test.ts: 21/21 passed
- sms-provider-readiness-read.test.ts: 16/16 passed
- sms-eligibility-inputs-read.test.ts: 16/16 passed
- contact-recipients-read.test.ts: 4/4 passed
- TypeScript passed
- `git diff --check` passed

State after F4D-E3A:

- template governance schema exists
- template governance read model exists with safe version IDs and admin readiness fields
- template governance read-only UI exists
- template validation helper exists
- create/save draft actions exist
- submit/approve-for-sandbox/reject review actions exist
- create/save draft UI exists
- combined admin readiness action exists for V1 workflow simplification
- visible mark-ready UI wiring is complete in F4D-E3B
- review/reject UI remains parked unless team-review workflow is reopened
- approve-for-activation remains deferred
- provider/legal approval actions remain deferred
- provider setup remains deferred
- sandbox/live SMS remains deferred
- real SMS remains deferred

---

## F4D-E3B Completion Cross-Reference (May 2026)

SMS Slice F4D-E3B Admin Readiness UI Wiring is complete.

- implementation commit: `c998d0e`
- UI file: `app/ops/admin/communications/page.tsx`
- the existing `On-The-Way Template Governance` section on `/ops/admin/communications` now includes visible `Mark wording ready for sandbox` UI
- the button appears only when the latest wording is eligible
- the form posts only `version_id`
- the UI uses the combined admin readiness action `markOnTheWayTemplateReadyForSandboxFromForm`
- the visible V1 UI avoids queue-shaped submit/review/reject workflow
- review/reject UI remains parked unless a larger team-review workflow is intentionally reopened
- button language stays readiness/testing oriented, not activation language
- template readiness does not enable SMS
- sandbox readiness does not send SMS
- Mark On The Way on a job still does not send SMS
- real SMS remains deferred

Smoke recorded:

- create draft from default: `draft_created`
- save draft: `draft_saved`
- mark wording ready for sandbox: `template_marked_ready_for_sandbox`
- sandbox version displayed as `Approved for sandbox`
- forbidden controls absent: submit for review, reject, approve for activation, send/test/sandbox send, activation toggle, provider/Twilio/webhook, job-detail preview, field-user editor
- browser-safe rendering confirmed: no raw provider refs, secrets, full phone numbers, customer/job data, account owner ids, or raw JSON dumps

Validation recorded:

- targeted smoke-validation subset passed (`94/94`)
- TypeScript passed
- `git diff --check` passed
- working tree clean

State after F4D-E3B:

- visible admin readiness UI wiring exists on the Communications page
- create/save draft UI and combined mark-ready action now complete the intended V1 admin-owned readiness flow
- review/reject UI remains parked unless team-review workflow is intentionally reopened
- provider/Twilio sandbox setup, send endpoint, webhook/status callback, and activation remain deferred
- next natural lane is planning/audit for the future background On-The-Way SMS send path; send behavior remains unimplemented

---

## F4D-E2 Completion Cross-Reference (May 2026)

SMS Slice F4D-E2 Admin Readiness Read-Model Support is complete.

- implementation commit: `fededec`
- read-model file: `lib/communications/sms-template-governance-read.ts`
- test file: `lib/communications/__tests__/sms-template-governance-read.test.ts`
- safe versionId is now exposed on latest/current/sandbox version summaries
- accountOwnerUserId is no longer returned by the read model
- latest-version admin readiness fields added: `canSaveDraft`, `canMarkReadyForSandbox`, `markReadyBlockingReasons`, `markReadyWarnings`
- readiness reuses `validateOnTheWayTemplateBody` for token, STOP, prohibited-content, segment, preview, and readiness calculations
- readiness is latest-version-only; historical current/sandbox versions do not become action-eligible unless they are also latest
- read model does not return `canSend`
- read model does not expose account owner ids, raw user ids, provider refs, customer/job data, or raw JSON dumps
- no UI/route/schema/migration/docs/Supabase production/provider/send/env/payment/QBO/portal/automation changes
- no UI controls were added in F4D-E2
- review/reject UI remains deferred unless team-review workflow is reopened

Validation recorded:

- sms-template-governance-read.test.ts passed
- sms-template-governance-validation.test.ts passed
- sms-template-actions.test.ts passed (`40/40`)
- sms-provider-readiness-read.test.ts passed (`16/16`)
- sms-eligibility-inputs-read.test.ts passed (`16/16`)
- contact-recipients-read.test.ts passed (`4/4`)
- TypeScript passed
- `git diff --check` passed

State after F4D-E2:

- template governance schema exists
- template governance read model exists with safe version IDs and admin readiness fields
- template governance read-only UI exists
- template validation helper exists
- create/save draft actions exist
- submit/approve-for-sandbox/reject review actions exist
- create/save draft UI exists
- combined admin readiness action exists (F4D-E3A complete)
- admin readiness support is available for future F4D-E3B mark-ready UI wiring
- review/reject UI remains deferred unless team-review workflow is reopened
- mark-ready UI wiring remains deferred to F4D-E3B
- approve-for-activation remains deferred
- provider/legal approval actions remain deferred
- provider setup remains deferred
- sandbox/live SMS remains deferred
- real SMS remains deferred

Future sequence after this docs closeout:

- F4D-E1 create/save draft UI
- F4D-E2 safe version-id/action-eligibility read-model support for admin readiness
- F4D-E3A combined admin readiness action (complete, `8cfa814`)
- F4D-E3B mark-ready UI wiring. ✓ Complete (`c998d0e`)
- later provider/legal review workflow
- later webhook/status callback contract planning
- later provider/Twilio sandbox planning
- later production activation only after legal/provider review and explicit approval

---

## F4D-E1 Completion Cross-Reference (May 2026)

SMS Slice F4D-E1 Create/Save Draft UI is complete.

- implementation commit: `1b8b671`
- UI file: `app/ops/admin/communications/page.tsx`
- server-action compatibility touched: `lib/actions/sms-template-actions.ts`
- UI added local notice rendering and a `Draft Wording` card
- UI added `Create draft from default` button/form
- UI added draft textarea/save form for latest draft only
- UI uses only: `createOnTheWayTemplateDraftFromDefaultFromForm`, `saveOnTheWayTemplateDraftFromForm`
- UI does not wire: submit for review, approve for sandbox, reject, approve for activation
- UI preserves non-live posture copy: `SMS is not enabled`, `Live sends are disabled`, `Template approval does not enable sending`, `Sample preview only`, `Mark On The Way does not send SMS`, and `Final wording may still require legal/provider review`
- browser smoke passed after local runtime target alignment: create produced `draft_created`; save produced `draft_saved`
- runtime mismatch finding: initial `template_create_failed` was caused by local reset target vs remote app runtime target mismatch (missing template tables in remote PostgREST schema cache), not a code defect; local retarget smoke passed

Validation after smoke:

- template action tests passed (`40/40`)
- template validation helper tests passed (`19/19`)
- template governance read tests passed (`15/15`)
- provider readiness tests passed (`16/16`)
- SMS eligibility tests passed (`16/16`)
- contact recipient tests passed (`4/4`)
- TypeScript passed
- `git diff --check` passed
- `git status --short` clean

State after F4D-E1:

- template governance schema exists
- template governance read model exists
- template governance read-only UI exists
- template validation helper exists
- create/save draft actions exist
- submit/approve-for-sandbox/reject review actions exist
- create/save draft UI exists
- review/reject UI remains deferred unless a larger-company/team-review workflow is reopened
- approve-for-activation remains deferred
- provider/legal approval actions remain deferred
- provider setup remains deferred
- sandbox/live SMS remains deferred
- real SMS remains deferred

---

## SMS On-The-Way V1 Workflow Simplification (May 2026)

V1 product goal:

- Mark On The Way is the user-facing operational action.
- The job lifecycle/status update remains primary and succeeds or fails on its own operational rules.
- Future provider-powered SMS is a background notification triggered after the Mark On The Way lifecycle event.
- Provider failure must not roll back the Mark On The Way lifecycle transition.
- The V1 message remains simple operational/customer-care wording only.

Planning example:

`Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.`

V1 wording ownership:

- Admin controls the On-The-Way message wording.
- Admin is the V1 wording owner and effective approver.
- Field users do not write, preview, or freely edit SMS wording.
- Customer/job-level custom SMS text is not part of V1.
- Job users should only press Mark On The Way.

Visible V1 UI simplification:

- Existing submit/approve/reject server actions remain future-compatible infrastructure.
- Visible V1 UI should not behave like a multi-person approval queue.
- Do not expose `Reject version` in V1 UI unless a larger-company/team-review workflow is intentionally reopened.
- Do not present `Submit for review` as required for owner-led/admin-owned V1 unless explicitly reopened.
- Prefer readiness wording such as `Mark wording ready for sandbox` or `Wording ready for future SMS testing`.
- Avoid UI language such as `Approve SMS`, `Activate SMS`, or `Enable SMS`.
- F4D-E2 should support safe action eligibility/read-model data around admin-controlled readiness.
- F4D-E3 should be reconsidered as mark-wording-ready-for-sandbox/readiness UI rather than review-controls UI.

Non-live boundaries:

- Template readiness does not enable SMS.
- Sandbox readiness does not send SMS.
- Real SMS remains deferred.
- No provider/Twilio/send/webhook behavior exists.
- No activation toggle exists.
- No sandbox/live SMS exists.
- Mark On The Way does not send SMS yet.

Source-of-truth boundaries:

- `job_events` is not provider delivery truth.
- Manual contact logs are not provider delivery truth.
- `sms_message_intents.message_body_snapshot` remains the future audit record of attempted SMS wording.
- Template governance remains admin/settings governance, not job timeline truth.

---

## 6) Versioning Behavior

Draft versions may be mutable before approval.

Approved, active, superseded, and retired body text is immutable.

Meaningful edits to approved/current text create a new draft version.

Version number rules:

- first version is `1`
- new version is `max(version_number) + 1` within account/template
- create/save draft should reuse an existing mutable draft only if it is still mutable
- if latest version is approved, rejected, retired, or superseded, create a new draft

Rejected, superseded, and retired versions remain visible in the read model but are not editable.

---

## 7) Pointer Behavior

Pointer rules:

- `sandbox_version_id` is set only by approve-for-sandbox
- `current_version_id` is not set by draft save
- `current_version_id` is not set by sandbox approval
- activation/current pointer waits until legal/provider review and activation planning are complete
- only one sandbox pointer per template is enough for now

Template approval must not set live-send state or activation state.

---

## 8) Review Workflow

First review transitions:

Draft save:

- `version_status = draft`
- all review statuses `not_requested`

Submit:

- `version_status = pending_review`
- `internal_review_status = pending`

Approve for sandbox:

- `version_status = approved_for_sandbox`
- `internal_review_status = approved`
- set `approved_by_user_id`
- set `approved_at`
- update parent `sandbox_version_id`

Reject:

- `version_status = rejected`
- `internal_review_status = rejected`
- set `rejected_by_user_id`
- set `rejected_at`
- set `rejected_reason`

Review deferrals:

- do not implement `approved_for_activation` yet
- `approved_for_activation` should require legal and provider approval
- provider/legal review stays `not_requested` until provider/Twilio and production activation planning starts
- approving for activation remains blocked until provider/legal approval model exists

---

## 9) Audit Posture

Use existing fields first:

- `created_by_user_id`
- `updated_by_user_id`
- `approved_by_user_id`
- `approved_at`
- `rejected_by_user_id`
- `rejected_at`
- `rejected_reason`
- `created_at`
- `updated_at`

Do not use `job_events` for template governance.

Template governance is account/admin settings truth, not job timeline truth.

Keep `sms_message_template_events` parked.

Add an event table only when review workflows need transition history beyond row actor/timestamp fields.

---

## 10) RLS And Write Path

F4B SELECT-only RLS remains intentional.

Write path lock:

- normal authenticated INSERT/UPDATE policies should remain absent
- DELETE policy remains absent
- future writes use admin-only server actions with explicit account-scope checks
- actual writes may use service/admin client after role/account validation
- no customer/portal/public mutation access

---

## 11) UI Posture

F4D does not start with full editable UI.

Future UI sequence:

1. Read-only stays as-is while validation helper lands.
2. Add Create draft from default only.
3. Add draft textarea/save after create/save actions are tested.
4. Add submit/approve/reject controls later.

Preview remains sample-only.

No job-detail preview.

Required future editing UI copy:

- `SMS is not enabled.`
- `Live sends are disabled.`
- `Template approval does not enable sending.`
- `Sample preview only.`
- `Final wording may still require legal/provider review.`

---

## 12) Relationship To Send/Provider

Template approval does not enable SMS send.

Template activation/readiness does not enable SMS send.

No provider/Twilio calls in template actions.

No send endpoint in template actions.

No webhook behavior in template actions.

Mark On The Way remains lifecycle-only.

---

## 13) No-Go Areas

Still no:

- SMS send
- test SMS
- sandbox SMS
- activation toggle
- provider setup
- Twilio API call
- webhook
- provider delivery write
- job-detail SMS preview
- field-user text editing
- `job_events` template governance logging
- normal authenticated write policies
- delete actions

---

## 14) Risk Assessment

Compliance risk:

- moderate/high if promotional wording is not blocked before review

Wording drift risk:

- controlled only if approved versions are immutable and edits create new versions

Token/privacy risk:

- high if tokens expand too early; keep strict allowlist

Tenant leakage risk:

- controlled by account-scoped server actions and admin-client writes after explicit auth checks

Audit/history risk:

- acceptable for draft/save and first sandbox approval using existing fields; event table remains parked

Operational UX risk:

- high if UI suggests approval equals send readiness; keep SMS disabled copy near every action

---

## 15) F4D-B Boundary Confirmation

F4D-B added validation helper only.

F4D-B did not add:

- writes
- server actions
- UI
- schema/migration changes
- provider behavior
- send behavior

F4D-B includes:

- shared constants for allowed tokens/default body/sample values/STOP/prohibited wording
- tests for blank body
- tests for allowed tokens
- tests for unknown tokens
- tests for STOP language
- tests for prohibited wording
- tests for SHA-256 hash
- tests for sample preview
- tests for segment estimates
- tests for approval readiness flags
- warnings for unknown tokens, missing STOP language, prohibited content, and multi-segment messages
- parked future note that review-request SMS is a separate future message class and remains prohibited in On-The-Way wording

Real SMS remains deferred.

---

## 16) F4D-C Boundary Confirmation

F4D-C added admin-only create/save draft server actions only.

F4D-C did not add:

- UI
- schema/migration changes
- provider behavior
- send behavior
- submit/review/approve/reject actions
- `current_version_id` writes
- `sandbox_version_id` writes
- Twilio/provider API calls
- send endpoint
- webhook
- sandbox SMS
- live SMS
- `job_events` logging
- delete actions
- normal authenticated write policies

F4D-C includes:

- `createOnTheWayTemplateDraftFromDefaultFromForm`: creates parent template container + draft version from default body, reuses mutable draft, creates next version after immutable latest
- `saveOnTheWayTemplateDraftFromForm`: validates body, blocks blank, updates mutable draft in place, creates new draft after immutable latest
- exported pure helpers `resolveNextVersionNumber` and `isVersionMutable`
- 20 focused tests covering non-admin block, create/reuse/next-version logic, blank-body block, in-place update, immutable-version protection, validation-metadata persistence, warning notice, scope/ownership enforcement, `current_version_id`/`sandbox_version_id` absence, and revalidation

Real SMS remains deferred.

---

## 17) F4D-D Boundary Confirmation

F4D-D added admin-only review actions only.

F4D-D did not add:

- editable UI
- route changes
- schema/migration changes
- Supabase production commands
- provider/Twilio behavior
- send behavior
- webhook behavior
- approve-for-activation action
- provider/legal approval actions
- pause/retire actions
- sandbox SMS
- live SMS
- env/secret/feature-flag changes
- invoice/payment/Stripe/QBO behavior
- portal/marketplace behavior

F4D-D includes:

- `submitOnTheWayTemplateVersionForReviewFromForm`: scoped/latest draft submit only, validation-gated
- `approveOnTheWayTemplateVersionForSandboxFromForm`: scoped/latest pending-review approve only, sandbox pointer update only
- `rejectOnTheWayTemplateVersionFromForm`: pending-review reject only, required normalized/bounded reason
- continued account-scope enforcement and revalidation of `/ops/admin/communications` + `/ops/admin`
- explicit non-sending posture with no provider/send/webhook write path

Real SMS remains deferred.

---

## Related ACTIVE References

- docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md
- docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md
- docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md
- docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md
- docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md
- docs/ACTIVE/source-of-truth-strategy.md
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md
