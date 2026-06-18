# Compliance Matters - Owner-Scoped Permit Workflow V1 Model Spec

Status: ACTIVE current-scope model spec  
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`  
Mode: Documentation/model only  
Date: 2026-06-17

---

## 1. Purpose

This document records the current permit-workflow contract implemented in commit `4c5398d`.

Current scope is intentionally narrow:
- Permit Workflow V1 is for the Compliance Matters owner/operator production account only.
- It supports Eddie/Compliance Matters tracking permit requests that originate from contractors through contracts, photos, texts, calls, emails, or direct internal intake.
- It is not a general tenant-wide feature.
- It must remain owner-scoped until a later explicit rollout review approves broader exposure.

---

## 2. Activation and Access Gate

Activation env:
- `ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS`

Current activation contract:
- The workflow is disabled by default.
- If `ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS` is missing or empty, permit workflow access remains off.
- The workflow becomes available only when the current `account_owner_user_id` is present in the env allowlist.
- Internal Ops shows `Permits` only for allowlisted owner accounts.
- Contractors tied to an allowlisted owner account can see `Request Permit`.
- Other tenant/customer accounts should not see or use this workflow.
- Server actions are allowlist-gated and fail closed; this is not a UI-only visibility rule.

---

## 3. Workflow Summary

Current V1 workflow:
- Contractor portal can submit a permit request with file upload plus an optional note.
- Internal users can manually create permit requests from text, phone, email, photo, or similar off-platform intake.
- Ops `Permits` queue tracks active permit paperwork.
- Internal users can edit intake details and view submitted files.

Active queue states:
- `Permit Request`
- `Accepted / In Process`
- `On Hold - Additional Information Needed`

Terminal state:
- `Permit Created`

Post-permit routing:
- `Ready for Testing` creates or routes an ECC alteration job to Scheduling with `jobs.ops_status = need_to_schedule`.
- `Pending Install` creates or routes an ECC alteration job to Waiting with `jobs.ops_status = on_hold` and `on_hold_reason = Pending Install`.
- Contractor submission alone does not create a job.
- Jobs are created only after an explicit internal permit-created action selects a post-permit route.

---

## 4. Source-of-Truth Boundaries

Permit workflow truth:
- `permit_requests` is the permit paperwork workflow truth.
- `permit_request_events` is the permit workflow evidence and transition trail.
- `attachments` rows with `entity_type = "permit_request"` are the submitted file evidence.

Job linkage boundary:
- `jobs` are created only through explicit internal action, not automatically from contractor upload.
- Contractor upload/intake does not mutate job truth by itself.
- When a permit request is completed into a linked or newly created job, `job_events` receive permit-created timeline evidence for that linkage.

Projection/read-model boundary:
- The Ops `Permits` queue is a read-model/workspace surface over active `permit_requests`; it does not become a separate workflow truth source.

---

## 5. Explicit Non-Goals for V1

This workflow does not add:
- automatic job creation from contractor upload
- OCR or PDF parsing
- permit API filing
- SMS or email automation
- invoice or payment behavior changes
- QBO behavior
- customer portal permit-management behavior beyond contractor submission/status visibility already scoped to the allowlisted owner lane
- contractor scheduling authority
- contractor lifecycle authority over jobs

This workflow is paperwork intake/tracking plus explicit internal routing only.

---

## 6. Future Tenant-Wide Rollout Is Deferred

Broader rollout is parked for later review.

Before any tenant-wide enablement, explicitly review:
- tenant permissions
- contractor portal exposure
- support burden
- product-mode fit
- onboarding and training
- whether permit tracking is broadly useful for customer accounts

Future rollout must not be inferred from current V1 implementation. The current implementation solves a Compliance Matters owner/operator need first and does not establish default cross-tenant product posture.

---

## 7. Validation and Operational Posture

Current repo-backed posture:
- Sandbox migrations were applied and smoked during implementation validation.
- Current implementation is protected by the owner allowlist gate, so non-allowlisted owner accounts remain dark by default.
- Current repo evidence for this docs closeout does not establish a broad production smoke completion claim for Permit Workflow V1.

Migration scope for this feature:
- `supabase/migrations/20260616143000_permit_requests_foundation.sql`
- `supabase/migrations/20260616160000_permit_request_intake_fields.sql`

Production note:
- This docs closeout does not run production commands.
- If production promotion is performed later under explicit approval, migration scope should remain limited to the two permit migrations above and any production smoke should be documented separately.

---

## 8. Summary Contract

Permit Workflow V1 is a controlled, owner-scoped Compliance Matters operational lane.

Locked V1 posture:
- disabled by default
- enabled only by owner allowlist
- fail-closed outside the allowlisted owner account
- permit paperwork truth stays in `permit_requests`
- contractor intake alone never creates jobs
- broader tenant rollout remains deferred