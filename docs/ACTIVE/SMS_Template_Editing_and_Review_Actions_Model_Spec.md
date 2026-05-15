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
B. F4D-B validation helper.
C. F4D-C create/save draft server actions.
D. F4D-D review actions.
E. F4D-E editable UI.
F. Later provider/legal review operations.
G. Later sandbox/provider work.
H. Later production activation only after explicit approval.

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

## 15) Future F4D-B Acceptance Criteria

F4D-B should add validation helper only.

F4D-B must not add:

- writes
- server actions
- UI
- schema/migration changes
- provider behavior
- send behavior

F4D-B should include:

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
