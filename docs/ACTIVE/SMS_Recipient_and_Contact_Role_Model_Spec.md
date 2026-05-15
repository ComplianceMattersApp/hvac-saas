# Compliance Matters — SMS Recipient and Contact Role Model Spec

Status: ACTIVE planning/model spec
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/model only (no implementation)
Date: 2026-05-14

---

## 1) Purpose

This document defines the recipient and contact role model that must exist before any provider-powered SMS or programmatic messaging is activated in Compliance Matters.

This is not legal advice. It is a product design and compliance-readiness specification.

This spec is a required predecessor to any live SMS send. Nothing in this document activates a send, registers a provider, or changes any schema. It records what must be designed and built before the activation gates in `docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md` can be satisfied.

Provider direction note: Twilio is the likely future SMS provider direction, but nothing in this spec locks schema or behavior to Twilio. The model must remain provider-neutral so that Twilio or any compliant A2P provider can be supported cleanly.

---

## 2) Audit Decision (From 2026-05-14 Contact Model Audit)

A contact model audit was completed on 2026-05-14. Decision: **C — A first-class recipient/contact role model is required before provider-powered SMS.**

### Current fields are sufficient for:
- Manual contact-attempt logging (`job_events.customer_attempt`)
- Device-intent SMS links (`sms:` scheme links that open the native app)

### Current fields are NOT sufficient for:
- Provider-powered SMS recipient selection
- Live SMS send with delivery truth
- Consent/suppression enforcement at send time
- Role-aware message routing

### Key findings:
- `customers.phone` is the canonical customer contact phone. It is sufficient for manual ops context, but it is not role-tagged, not consent-scoped, and not suppression-aware.
- `jobs.customer_phone`, `jobs.customer_email`, `jobs.customer_first_name`, `jobs.customer_last_name`, `jobs.job_address` are operational snapshots stamped at job creation and synced on customer edit. These are convenience fields for Ops display speed. They are **not canonical** and must never become SMS recipient truth.
- `job_events.customer_attempt` records manual contact-attempt history. It is **not** provider delivery truth.
- `jobs.billing_recipient` indicates billing party role only. It is not a communication-consent signal.
- No recipient role, no consent provenance, no opt-out/suppression state, and no delivery audit trail exist anywhere in the current model.

---

## 3) Current Source-of-Truth Boundaries

This section is a cross-reference with `docs/ACTIVE/source-of-truth-strategy.md` and adds communication-specific constraints.

| Field / Table | Current Role | SMS Authority |
|---|---|---|
| `customers.phone` | Canonical customer contact phone | Ops context only; not consent-scoped |
| `customers.email` | Canonical customer contact email | Ops context only; not consent-scoped |
| `customers.first_name / last_name` | Canonical customer identity | Display only |
| `locations.*` | Canonical service site address | Address context; no phone; no role |
| `jobs.customer_phone` | Snapshot convenience field | **Must not be selectable as provider SMS truth** |
| `jobs.customer_email` | Snapshot convenience field | **Must not be selectable as provider SMS truth** |
| `jobs.job_address / city` | Snapshot convenience field | Address context only |
| `jobs.billing_recipient` | Billing party designation | Billing only; not communication consent |
| `job_events.customer_attempt` | Manual contact-attempt history | **Not provider delivery truth** |
| future provider delivery record | Does not exist yet | Must be separate from `job_events` |

---

## 4) Future Recipient / Contact Domain Concept

A first-class recipient domain is required before live SMS. This section describes the domain need without prescribing exact table names, column names, or migrations. Schema design is a future separate slice.

### Domain name candidates (planning-only; not locked):
- `contact_recipients`
- `account_contact_recipients`
- `job_contact_parties`

The domain should eventually support the following per-record fields:

| Field | Description |
|---|---|
| tenant / account scope | Scoped to `owner_user_id` or account; no cross-tenant leakage |
| linked party entity type | `customer`, `contractor`, `internal_user`, `third_party`, etc. |
| linked party entity id | FK to the relevant entity row |
| display name | Human-readable name for this contact entry |
| phone | The specific phone number for this contact entry |
| email | The specific email for this contact entry |
| recipient role | See Section 5 taxonomy |
| active / inactive status | Whether this contact entry is currently active |
| preferred contact method | phone, email, sms, none |
| notes / internal context | Internal staff context |
| consent references | Link to consent record(s) for this phone/role/class (see Section 6) |
| created_at / updated_at | Audit timestamps |
| created_by | Actor who created the record |

This domain does not replace `customers` or `locations`. It layers a communication-purpose record on top of canonical entity tables and adds role, consent, and suppression awareness that canonical tables do not carry.

---

## 5) Recipient Role Taxonomy (Planning-Only)

The following role taxonomy is a planning starting point. It is **not locked** and should be refined during schema design.

| Role | Description |
|---|---|
| `customer_primary` | Primary customer on the account/job |
| `customer_alt` | Alternate customer contact (e.g., spouse, business partner) |
| `homeowner` | Property owner, which may differ from the customer on record |
| `tenant_or_occupant` | Tenant or occupant at the service site if different from owner |
| `responsible_party` | Party responsible for decisions or sign-off (may not be the homeowner) |
| `site_access_contact` | Contact specifically for site access coordination |
| `billing_contact` | Party responsible for billing/invoice receipt |
| `contractor_contact` | Contractor or contractor representative |
| `third_party_oversight` | Inspector, HOA, property management, or other third-party oversight party |
| `internal_user` | Internal staff member |
| `account_owner` | The account owner/operator of the tenant |
| `future_marketplace_participant` | Reserved for future marketplace or multi-party involvement |

### Role rules:
- A given phone number may appear in multiple contact records under different roles.
- A given job may have contacts from multiple roles.
- Role must be explicit before any live send; unknown/unassigned role must block send.
- No Eddie-specific role assumptions. All roles must be modeled as tenant-scoped and marketplace-neutral.

---

## 6) Communication Purpose Taxonomy (Planning-Only)

Recipient role alone is not sufficient to determine whether a send is appropriate. The message purpose must also be explicit and consent must cover that specific class.

| Purpose Class | Description | Requires Separate Consent from Marketing |
|---|---|---|
| `scheduling` | Appointment scheduling confirmation | Yes (operational class) |
| `appointment_reminder` | Reminder before a booked appointment | Yes (operational class) |
| `on_the_way` | Real-time technician dispatch notification | Yes (operational class) |
| `access_coordination` | Coordinating site access for a visit | Yes (operational class) |
| `follow_up_no_answer` | Follow-up after an unanswered contact attempt | Yes (operational class) |
| `completion_notice` | Notice that field work is complete | Yes (operational class) |
| `invoice_ready_notice` | Invoice-ready notification (no payment execution language) | Yes (operational class) |
| `marketing_promotional` | Promotional, upsell, discount, referral, review-incentive | **Parked unless separately approved and separately consented** |

Rule: Marketing/promotional purpose must never share consent scope with operational classes. They require a separate explicit consent path if ever introduced.

---

## 7) Consent Relationship Requirements (Future)

Consent must be:

1. **Recipient-level** — scoped to the specific contact record and phone number, not the customer entity broadly
2. **Message-class scoped** — consent to receive scheduling confirmations does not imply consent for follow-up messages or invoice notices; each class should be explicit
3. **Not inferred** from:
   - customer record existence
   - job creation
   - phone number presence on a job snapshot
   - billing_recipient designation
   - any implicit product action
4. **Checked at send time** — a consent record must exist and be valid before any live provider send
5. **Revocable** — revocation must be accepted, stored, and enforced before next send
6. **Auditable** — consent capture actor, timestamp, surface, language version, and class scope must be stored

### Consent record fields (planning-only; not locked):

| Field | Description |
|---|---|
| contact recipient id | FK to recipient record |
| message class | Which purpose class this consent covers |
| consent language version | Which text/version was accepted |
| consented_at | Timestamp of consent capture |
| consent channel / surface | Where consent was captured |
| actor who captured | User or system that recorded consent |
| revoked_at | If revoked, timestamp |
| revoked_by | Actor who recorded revocation |

---

## 8) Opt-Out and Suppression Requirements (Future)

Suppression must:

- Take precedence over every send path, including automated sends
- Be deterministic — no ambiguous state where suppression might or might not apply
- Prevent accidental reactivation without an explicit new consent action
- Cover all future automation paths, not just manually triggered sends
- Maintain an audit trail: when added, by whom, via what signal (STOP reply, manual, data import, etc.)

Suppression failure mode: if suppression state cannot be checked at send time, the send must fail closed (blocked), not silently proceed.

---

## 9) Recipient Selection Rule (Future Send UI)

This rule is locked for any future provider SMS send UI:

1. **SMS must never guess the recipient.** Snapshot job phone is not an acceptable send target.
2. **The send UI must require explicit recipient selection** from a recipient record with a known role and consent status.
3. **The selected recipient must display:** role, phone number, consent status for the message class, suppression state.
4. **If role is unknown, consent is missing/stale/out-of-scope, or suppression is active — the send must be blocked.** No silent fallback to a snapshot field.
5. **Snapshot job phone may be shown as context only.** It may not be selectable as a provider SMS target unless it is tied to a first-class recipient record with valid consent.

---

## 10) Marketplace and Tenant Isolation Guardrails

The model must be designed for future marketplace evolution, not single-owner assumptions.

| Guardrail | Requirement |
|---|---|
| Tenant scoping | All recipient records scoped to `owner_user_id` / account; no cross-tenant access |
| Sender identity | No shared sender identity assumed; each tenant must have clear sender identity before sends |
| Recipient leakage | No cross-tenant recipient leakage via any query path |
| Role neutrality | No Eddie-specific role assumptions; taxonomy must work for any future tenant type |
| Marketplace participants | Future multi-party or marketplace involvement requires explicit sender/recipient role assignment; no implicit inheritance |
| A2P registration | Each tenant sending live SMS may require separate provider A2P registration; model must not assume shared brand registration |

---

## 11) Recommended Future Implementation Sequence

This sequence documents the expected future build order. Nothing here is implemented in this slice.

| Step | Work Item |
|---|---|
| A | Contact/recipient schema design — finalize domain name, fields, FK structure, tenant scoping |
| B | Consent/opt-out/suppression schema design — finalize consent record structure, suppression table, audit trail design |
| C | Migration / additive schema foundation — apply migrations with no live sends, no UI wiring yet |
| D | Read-only recipient display on job/customer surfaces — show recipient entries and role/consent status context-only, no send actions |
| E | Non-sending message template preview — preview what a send would look like using selected recipient + purpose class, no live send |
| F | Provider selection and A2P readiness — select provider, complete A2P registration, test credentials in sandbox only |
| G | Sandbox provider send — first live sends in sandbox after consent/suppression/delivery model exists and is testable |
| H | Production activation — only after legal/provider review and explicit approval decision |

Each step must be completed and validated before proceeding to the next. No step may be skipped.

---

## 12) Explicit Non-Goals for This Slice

This planning/model doc does not perform or authorize:

- live SMS sends
- provider setup (Twilio or otherwise)
- schema or migration changes
- environment variable or secret changes
- feature flag changes
- On-The-Way automation
- invoice/payment/QBO behavior changes
- tenant Stripe payment execution
- portal expansion
- marketplace feature build
- any code changes
- any behavior changes

---

## 13) Related ACTIVE References

- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md (prerequisite gates)
- docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md (future schema design; builds on this model; Slice A closeout recorded with final migration `supabase/migrations/20260515120000_contact_recipients_slice_a_foundation.sql`, commits `afddb9c` and `02aee5a`)
- docs/ACTIVE/source-of-truth-strategy.md (canonical field authority)
- docs/ACTIVE/Active Spine V4.0 Current.md (project spine and SMS 9B entry)
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md (Group 9B roadmap entry)
- docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
- docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md
