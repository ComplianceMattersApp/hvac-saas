# Compliance Matters — SMS Recipient, Consent, and Suppression Schema Design Plan

Status: ACTIVE planning/schema design
Authority: Subordinate to docs/ACTIVE/Active Spine V4.0 Current.md and docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
Mode: Documentation/schema design planning only (no implementation)
Date: 2026-05-14

---

## Slice A Closeout Status (2026-05-15)

SMS Slice A Recipient Registry Foundation is complete.

- Implementation commit: `afddb9c`
- Migration timestamp hygiene fix commit: `02aee5a`
- Final migration filename: `supabase/migrations/20260515120000_contact_recipients_slice_a_foundation.sql`

Timestamp correction note:
- The original filename `supabase/migrations/20260514120000_contact_recipients_slice_a_foundation.sql` was renamed because timestamp prefix `20260514120000` was already used by `supabase/migrations/20260514120000_maintenance_agreement_visits_next_due_confirmation_metadata.sql`.
- Rename was a 100% file rename with no SQL body behavior change.

What Slice A includes:
- `contact_recipients` foundation only
- account-scoped RLS policies
- read-only helper: `lib/communications/contact-recipients-read.ts`
- targeted tests: `lib/communications/__tests__/contact-recipients-read.test.ts`

What Slice A explicitly does not include:
- no consent table
- no suppression table
- no SMS intent table
- no provider delivery table
- no backfill
- no provider/Twilio behavior
- no live SMS activation
- no env/secret/feature-flag/payment/QBO/portal behavior change

Validation recorded:
- `npx.cmd tsc --noEmit` passed
- `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed
- `git diff --check` passed
- no migration apply, no Supabase production command, no production writes

Marketplace guardrail framing:
- Slice A is neutral communication-recipient infrastructure preserving tenant/account/recipient-role boundaries for future marketplace-style evolution.

Live-SMS status:
- Real SMS remains deferred pending future consent/suppression/provider delivery model completion plus legal/provider activation gates.

---

## Slice B1 Closeout Status (2026-05-15)

SMS Slice B1 Consent + Suppression Foundation is complete.

- Implementation commit: `39a2963`
- Migration filename: `supabase/migrations/20260515123000_contact_recipient_consent_suppression_foundation.sql`

What Slice B1 creates:
- `contact_recipient_consents`
- `contact_recipient_suppressions`

Locked behavior posture from this foundation:
- consent defaults to `unknown`
- missing/unknown consent remains fail-closed by design
- active suppression is the future hard-stop override and must win over consent at send decision time

What Slice B1 explicitly does not add:
- no SMS message intent table
- no provider delivery table
- no send endpoint
- no provider webhook
- no Twilio/provider code
- no live SMS sends
- no backfill
- no env/secret/feature-flag/payment/QBO/portal behavior changes

Local validation recorded:
- local Studio port `54323` was held by VS Code (`Code.exe`); plain `supabase start` failed on that local bind
- local workaround only: `supabase start -x studio` succeeded (no process kill)
- `supabase db reset --local` passed
- local reset applied Slice A and Slice B1 migrations:
   - `20260515120000_contact_recipients_slice_a_foundation.sql`
   - `20260515123000_contact_recipient_consent_suppression_foundation.sql`
- no blocking migration SQL issues found (non-fatal NOTICE messages only)
- `npx.cmd tsc --noEmit` passed
- `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed
- `git diff --check` passed

Deployment/write boundary confirmation:
- no remote/sandbox/production migration apply
- no production writes

Live-SMS status:
- Real SMS remains deferred pending future read/decision helpers, non-sending recipient picker/template preview, message intent/provider delivery audit tables, provider/Twilio registration + sandbox send, legal/provider review, and explicit activation decision.

Marketplace guardrail framing:
- Slice B1 is neutral tenant/account-scoped consent and suppression infrastructure for future communication readiness. It does not imply live SMS, marketplace behavior, or provider integration activation.

---

## Slice B2 Closeout Status (2026-05-15)

SMS Slice B2 Non-Sending Eligibility Inputs Helper is complete.

- Implementation commit: `c0247af`
- Files added:
   - `lib/communications/sms-eligibility-inputs-read.ts`
   - `lib/communications/__tests__/sms-eligibility-inputs-read.test.ts`

What Slice B2 adds:
- read-only non-sending eligibility-input evaluation for recipient + message class
- recipient existence/status checks
- recipient phone presence checks
- consent existence/status checks
- active recipient-level suppression checks
- active phone-level suppression checks
- deterministic non-sending blocked-reason output ordering (suppression before consent)

Read/write and source boundaries:
- helper reads only:
   - `contact_recipients`
   - `contact_recipient_consents`
   - `contact_recipient_suppressions`
- helper does not read:
   - `jobs`
   - `customers`
   - `locations`
   - `job_events`
- helper returns non-sending eligibility input state only
- helper does not return `canSend`
- `eligible_inputs_present` means B2 recipient/consent/suppression inputs are present; it does not imply live SMS can send

Locked behavior posture from B2:
- missing/unknown consent remains fail-closed
- active suppression blocks regardless of consent
- suppression is prioritized before consent in blocked reason ordering
- job snapshot phone/email remains blocked from SMS recipient truth

Validation recorded:
- `npx.cmd vitest run lib/communications/__tests__/sms-eligibility-inputs-read.test.ts` passed (`16/16`)
- `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed (`4/4`)
- `npx.cmd tsc --noEmit` passed
- `git diff --check` passed

Deployment/write boundary confirmation:
- no schema/migration change
- no Supabase commands
- no production writes

Live-SMS status:
- Real SMS remains deferred pending future non-sending recipient picker/template preview, quiet-hours/timezone decision gate, sender identity/provider registration, SMS intent/provider delivery audit tables, Twilio/provider sandbox send, legal/provider review, and explicit activation decision.

Marketplace guardrail framing:
- Slice B2 is neutral tenant/account-scoped communication-readiness infrastructure. It does not imply marketplace behavior, Twilio/provider behavior, or live SMS activation.

---

## 1) Current Non-Implementation Boundary

This document is a **design contract**, not an implementation or migration.

### Explicit constraints:
- **Recipient + consent/suppression foundations now exist** (`contact_recipients`, `contact_recipient_consents`, `contact_recipient_suppressions`; Slice A + Slice B1). SMS intent and provider delivery schema remain deferred.
- **Non-sending eligibility input helper now exists** (Slice B2) and remains read-only.
- **This pass does not create schema files, migrations, or Supabase changes.**
- **This pass does not enable SMS, change any behavior, or activate any feature flag.**
- **This pass exists solely to define a future additive schema proposal** that will be reviewed, refined, and eventually implemented in a separate schema design review + migration slice.

### Current SMS boundary:
- Manual contact logging works via `job_events.customer_attempt` type.
- Device-intent SMS links work via `sms:` scheme on canonical customer phone.
- Job snapshot phone/email fields (`jobs.customer_phone`, `jobs.customer_email`, etc.) are operational convenience only.
- No provider delivery truth exists.
- Recipient/consent/suppression foundations now exist (`contact_recipients`, `contact_recipient_consents`, `contact_recipient_suppressions`).
- Non-sending eligibility-input helper now exists and reads only recipient/consent/suppression sources with fail-closed posture.
- Provider delivery audit truth remains deferred.
- Real SMS remains deferred pending schema, provider setup, and legal approval gates.

---

## 2) Future Table/Domain Candidates

The following table concepts are proposed at a planning level. Table names, column names, and exact structure are **not final** and will be reviewed during a future schema design slice.

### A. Contact Recipient Registry

**Purpose:** First-class tenant/account-scoped contact records that can be selected for future communications.

**Candidate table name:** `contact_recipients` or `account_contact_recipients`

**Rationale for name options:**
- `contact_recipients` — simpler, scoped via `account_owner_user_id` FK
- `account_contact_recipients` — explicitly signals account scoping; enables future `platform_contact_recipients` if needed for multi-tenant scenarios

**Future field concepts (planning-only; names/types not locked):**

| Field | Type/Concept | Notes |
|---|---|---|
| `id` | UUID PK | Unique recipient record identifier |
| `account_owner_user_id` | UUID FK → `auth_users` | Account owner; enables RLS; no cross-tenant access |
| `linked_entity_type` | enum | `customer`, `contractor`, `internal_user`, `third_party`, `account_admin` |
| `linked_entity_id` | UUID | FK to the entity row; e.g., `customer.id` or contractor user id |
| `display_name` | text | Human-readable name for this contact entry |
| `phone_e164` | text | Fully formatted phone number in E.164 standard; enables comparison |
| `email` | text | Email address for contact entry |
| `recipient_role` | enum | See Section 3 role taxonomy |
| `status` | enum | `active`, `inactive`, `archived`; defaults to `active` |
| `preferred_contact_method` | enum | `sms`, `email`, `sms_then_email`, `none` |
| `notes` | text | Internal staff context; not sent to contact |
| `created_by_user_id` | UUID FK | Actor who created the record; audit trail |
| `updated_by_user_id` | UUID FK | Actor who last updated the record; audit trail |
| `created_at` | timestamp | Audit timestamp |
| `updated_at` | timestamp | Audit timestamp |

**Future RLS/security:** Enable RLS to enforce `account_owner_user_id = current_user_id()` for SELECT, INSERT, UPDATE.

---

### B. Consent Records

**Purpose:** Auditable recipient-level, message-class-scoped consent that can be checked at send time.

**Candidate table name:** `contact_recipient_consents`

**Rationale:**
- Separate from recipient registry to enable 1:many recipient-to-consents relationship (a single phone may have different consents for different message classes).
- Scoped by recipient + message class + account.

**Future field concepts (planning-only; names/types not locked):**

| Field | Type/Concept | Notes |
|---|---|---|
| `id` | UUID PK | Unique consent record identifier |
| `account_owner_user_id` | UUID FK → `auth_users` | Account owner; enables RLS; matches recipient |
| `contact_recipient_id` | UUID FK → `contact_recipients` | Which recipient this consent covers |
| `message_class` | enum | Which purpose class this consent covers (see Section 3) |
| `consent_status` | enum | `unknown`, `opted_in`, `opted_out`, `revoked`; defaults to `unknown` |
| `consent_source` | enum | `form_signup`, `imported_list`, `api`, `manual_admin`, `implicit_unconfirmed` |
| `consent_text_version` | text | Which version of consent language was accepted; enables audit of what user saw |
| `consent_captured_at` | timestamp | When consent was captured or decision made |
| `consent_captured_by_user_id` | UUID FK | Which user/system captured this consent; audit trail |
| `revoked_at` | timestamp NULL | If revoked, when; otherwise NULL |
| `revoked_source` | enum NULL | If revoked: `stop_keyword`, `manual_revocation`, `compliance_hold`, `provider_request` |
| `notes` | text | Additional context about this consent |
| `created_at` | timestamp | Audit timestamp |
| `updated_at` | timestamp | Audit timestamp |

**Future RLS/security:** Enable RLS to enforce `account_owner_user_id = current_user_id()`.

**Future send-time rule:** Before sending a message of class X to recipient R, query `contact_recipient_consents` where `contact_recipient_id = R.id` AND `message_class = X` AND `consent_status != 'unknown'`. If no record exists or consent_status is `opted_out` or `revoked`, send is blocked.

---

### C. Suppression / Opt-Out Records

**Purpose:** Fail-closed do-not-text / STOP / suppression state that takes precedence over every send path.

**Candidate table name:** `contact_recipient_suppressions`

**Rationale:**
- Separate from consent to enable explicit precedence rule: suppression always blocks, regardless of consent state.
- Tracks source (STOP keyword, manual, provider block) to enable administrative review and potential appeal workflows in future.

**Future field concepts (planning-only; names/types not locked):**

| Field | Type/Concept | Notes |
|---|---|---|
| `id` | UUID PK | Unique suppression record identifier |
| `account_owner_user_id` | UUID FK → `auth_users` | Account owner; enables RLS |
| `contact_recipient_id` | UUID FK → `contact_recipients` | Scoped to recipient |
| `phone_e164` | text | Denormalized phone for reference; enables outbound validation |
| `suppression_type` | enum | `do_not_text`, `stop_keyword`, `manual_suppression`, `provider_block`, `compliance_hold` |
| `suppression_reason` | text | Why suppressed; e.g., "STOP reply received 2026-05-10" or "Compliance audit hold" |
| `source` | enum | `inbound_stop`, `manual_admin`, `provider_list`, `compliance_request`, `data_import` |
| `provider_message_id` | text NULL | If source is inbound STOP, store provider's message ID |
| `received_keyword` | text NULL | If source is inbound STOP, store the keyword received; e.g., "STOP", "OPT-OUT" |
| `suppressed_at` | timestamp | When suppression became active; not necessarily when captured |
| `created_at` | timestamp | Audit timestamp |

**Future RLS/security:** Enable RLS to enforce `account_owner_user_id = current_user_id()`.

**Future send-time rule:** Before any send to recipient R, check `contact_recipient_suppressions` where `contact_recipient_id = R.id` AND `suppression_type != 'unknown'`. If record exists, send is blocked. No exceptions, no overrides.

---

### D. Message Intent / Delivery Audit Records

**Purpose:** Separate operator intent, consent/suppression decision checkpoint, provider submit response, provider delivery/failure truth, and timeline summary.

**Candidate table names (explore both during design review):**
- Option 1: Single combined table `sms_message_audit` (simpler for single sends, harder for bulk operations)
- Option 2: Two tables: `sms_message_intents` (intent + decision) and `sms_provider_deliveries` (provider response + status)
- **Recommended design direction: Option 2** — clearer separation of intent/decision checkpoint from provider response; enables deferred sends and retry scenarios

**Table B1: sms_message_intents (future proposal)**

**Purpose:** Record operator intent and decision checkpoint before provider submit.

| Field | Type/Concept | Notes |
|---|---|---|
| `id` | UUID PK | Unique message intent identifier |
| `account_owner_user_id` | UUID FK → `auth_users` | Account owner; enables RLS |
| `job_id` | UUID FK → `jobs` NULL | Linked job, if any; NULL for standalone contact attempts |
| `service_case_id` | UUID FK → `service_cases` NULL | Linked service case, if any |
| `contact_recipient_id` | UUID FK → `contact_recipients` | Which recipient intended |
| `message_class` | enum | Purpose of message (see Section 3) |
| `template_key` | text | E.g., `appointment_reminder_24h`, `on_the_way_dispatch`; enables consistent content |
| `template_version` | int | Which version of this template was used |
| `message_body_snapshot` | text | Complete rendered message body; immutable record of what was sent or attempted |
| `send_requested_by_user_id` | UUID FK | Which user requested this send |
| `send_requested_at` | timestamp | When send was requested |
| `consent_status_at_decision` | enum | Consent status at the moment of decision; audit of decision context |
| `suppression_status_at_decision` | enum | Suppression status at decision; audit of decision context |
| `quiet_hours_status_at_decision` | enum | Quiet hours check at decision; audit of decision context |
| `decision_outcome` | enum | `approved_submit`, `blocked_no_consent`, `blocked_suppressed`, `blocked_quiet_hours`, `blocked_other_reason` |
| `decision_reason_detail` | text NULL | If blocked, additional context; e.g., "Consent revoked 2026-05-10" |
| `created_at` | timestamp | Audit timestamp |
| `updated_at` | timestamp | Audit timestamp |

**Table B2: sms_provider_deliveries (future proposal)**

**Purpose:** Provider response and delivery status timeline.

| Field | Type/Concept | Notes |
|---|---|---|
| `id` | UUID PK | Unique provider delivery record identifier |
| `account_owner_user_id` | UUID FK → `auth_users` | Account owner; enables RLS |
| `sms_message_intent_id` | UUID FK → `sms_message_intents` | Links back to intent |
| `provider_name` | text | E.g., `twilio`, `nexmo`, `pinpoint` (future-proof for provider changes) |
| `provider_message_id` | text | Provider's unique message ID; enables provider support lookups |
| `provider_request_body_snapshot` | jsonb NULL | Snapshot of what was sent to provider; immutable audit record |
| `provider_status` | enum | `not_submitted`, `queued`, `submitted`, `sent`, `delivered`, `failed`, `undelivered`, `blocked`, `unknown` |
| `provider_error_code` | text NULL | Provider error code if applicable |
| `provider_error_message` | text NULL | Provider error message if applicable |
| `submitted_at` | timestamp NULL | When submitted to provider |
| `delivered_at` | timestamp NULL | When provider confirmed delivery to device |
| `failed_at` | timestamp NULL | When provider reported failure |
| `created_at` | timestamp | Audit timestamp |
| `updated_at` | timestamp | Audit timestamp |

**Future RLS/security:** Enable RLS on both tables to enforce `account_owner_user_id = current_user_id()`.

**Future workflow:**
1. Operator requests send of message class X to recipient R.
2. System creates `sms_message_intents` record with decision checkpoint (consent/suppression/quiet hours checked).
3. If decision = `approved_submit`, system submits to provider and creates `sms_provider_deliveries` record.
4. Provider webhooks update `sms_provider_deliveries` with delivery status.
5. Neither table replaces `job_events` manual logs; they coexist. Manual logs + provider intents + provider deliveries together form the full audit trail.

---

## 3) Enumerations / Allowed Values (Planning-Only)

The following enum values are proposed at a planning level. They will be reviewed and finalized during future schema design.

### Recipient Roles (12 roles from SMS_Recipient_and_Contact_Role_Model_Spec.md)

```
customer_primary
customer_alt
homeowner
tenant_or_occupant
responsible_party
site_access_contact
billing_contact
contractor_contact
third_party_oversight
internal_user
account_owner
future_marketplace_participant
```

### Message Classes (8 classes)

```
scheduling
on_the_way
appointment_reminder
access_coordination
follow_up_no_answer
completion_notice
invoice_ready_notice
marketing_promotional
```

### Recipient Status

```
active
inactive
archived
```

### Preferred Contact Method

```
sms
email
sms_then_email
none
```

### Linked Entity Type

```
customer
contractor
internal_user
third_party
account_admin
```

### Consent Status

```
unknown
opted_in
opted_out
revoked
```

### Consent Source

```
form_signup
imported_list
api
manual_admin
implicit_unconfirmed
```

### Suppression Type

```
do_not_text
stop_keyword
manual_suppression
provider_block
compliance_hold
```

### Suppression Source

```
inbound_stop
manual_admin
provider_list
compliance_request
data_import
```

### Message Intent Decision Outcome

```
approved_submit
blocked_no_consent
blocked_suppressed
blocked_quiet_hours
blocked_other_reason
```

### Provider Status (compatible with Twilio, Nexmo, Pinpoint concepts)

```
not_submitted
queued
submitted
sent
delivered
failed
undelivered
blocked
unknown
```

---

## 4) Account / Tenant Scoping Rules

Every future SMS table must enforce strict account/tenant boundaries.

| Rule | Requirement |
|---|---|
| Scoping pattern | Every table has `account_owner_user_id` FK to `auth_users` or similar tenant identifier |
| RLS enforcement | Every table has RLS policy: users can only access rows where `account_owner_user_id = current_user_id()` |
| No cross-tenant lookup | Queries must filter by `account_owner_user_id` at query time, not application level |
| Shared tenants (future) | If Compliance Matters enables shared/team tenant accounts later, RLS must evolve to `account_id` and `user_account_access` join; SMS tables will be retroactively scoped to `account_id` |
| Marketplace sender/recipient | If Compliance Matters becomes multi-tenant marketplace later, no recipient from account A can send to account B; every send validates `sender_account_owner_user_id != recipient_account_owner_user_id` or explicit cross-account approval |
| Internal/support tooling | Support staff accessing SMS state for troubleshooting must use separate customer-service schema with audit logging, not direct table access |
| No backdoors | No `SELECT * FROM contact_recipients LIMIT 1000` without account scope; query builders and ORMs must enforce scoping |

---

## 5) Source-of-Truth Rules

These rules preserve the existing Strategy B boundary and extend it for SMS.

| Entity | Current Authority | Future SMS Authority | Rule |
|---|---|---|---|
| Customer identity / contact | `customers.id`, `customers.phone`, `customers.email` | Same; no change to canonical customer data | No SMS changes customer canonical state |
| Site / address | `locations.id`, `locations.address_*` fields | Same; no change to canonical location data | No SMS changes location state |
| Job snapshot phone/email | Operational convenience, synced on customer edit | **Must not be used as SMS recipient source** | Job snapshots are display context only; never selectable as recipient for live SMS |
| Job manual contact log | `job_events.type = 'customer_attempt'` | Same; no change to manual logs | Manual logs remain separate from provider intents/deliveries |
| Provider delivery truth | Does not exist yet | `sms_message_intents` + `sms_provider_deliveries` (future) | Provider delivery truth lives only in new audit tables, never in `job_events` or snapshots |
| Job_events summary | Manual contact attempt history | May create future `sms_sent` or `sms_delivered` summary event **if explicitly designed**, but must never retroactively claim provider delivery from manual logs | Future `job_events` SMS entries are summaries only; provider truth is immutable in audit tables |

---

## 6) Future Selection Rules (Live Send UI)

Any future live SMS send UI must enforce these rules:

1. **Never pre-select the recipient.** Even if a job has a `customer_phone`, the UI must show an empty/placeholder selection state until the user explicitly selects from the recipient picker.

2. **Recipient picker source:** Fetch from `contact_recipients` WHERE `account_owner_user_id = current_user_id()` AND `status = 'active'` only. Do not include archived or inactive recipients.

3. **Display recipient context:** For each recipient in the picker, show:
   - Display name
   - Phone (E.164 or masked for privacy if needed)
   - Recipient role (e.g., "customer_primary", "site_access_contact")
   - Consent status for the selected message class (e.g., "consent unknown" in yellow, "opted out" in red)
   - Suppression state (e.g., "SUPPRESSED — do not text" in bold red)

4. **Selection decision:** Once user selects a recipient, run a pre-send decision checkpoint:
   - Does a consent record exist with `consent_status != 'unknown'` for this message class?
   - If yes, is consent_status `opted_out` or `revoked`?
   - Does a suppression record exist?
   - Are we in quiet hours for this recipient's timezone?
   - If any gate fails, block the send UI button and show a clear reason (e.g., "Cannot send: contact has opted out of appointment reminders").

5. **If no eligible recipient exists,** show a message such as "No active contacts available for this message class. To send, create a contact or update consent preferences."

6. **Job snapshot phone context:** If the job has a `customer_phone`, it MAY be shown in the recipient picker as read-only context (e.g., "Primary number on file: (555) 123-4567"), but it must **not be selectable as a provider recipient** unless that phone is also tied to an actual `contact_recipients` record with valid consent.

7. **Never auto-select or bypass:** No silent fallback to job snapshot phone if the user hasn't explicitly selected a recipient. No "try to send anyway" button without explicit user override confirmation.

---

## 7) Provider-Neutral but Twilio-Aware Design

This schema design is provider-aware but not provider-locked.

### Twilio as likely direction:
- Twilio is the probable future SMS provider for Compliance Matters.
- Twilio offers A2P SMS, inbound webhook webhooks for delivery confirmation and STOP replies, and strong compliance/audit tooling.
- Twilio concepts to preserve: SID (Twilio's unique message ID), delivery callbacks, inbound message parsing for STOP detection.

### Provider-neutral schema approach:
- `sms_provider_deliveries.provider_name` is a flexible enum, not a Twilio-only constant.
- `provider_message_id` is a text field, not a Twilio SID-specific field.
- `provider_error_code` and `provider_error_message` are generic text fields that can hold any provider's response.
- `provider_request_body_snapshot` is a jsonb field that can store the raw request to any provider (Twilio, Nexmo, Pinpoint, etc.).
- `received_keyword` in suppressions table can capture any inbound keyword standard (STOP, END, QUIT, etc.) without assuming Twilio's specific handling.

### Twilio integration requirements (future implementation):
- Webhook receiver for Twilio delivery callbacks (`MessageStatus` webhooks).
- Webhook receiver for Twilio inbound messages (`Message` webhooks) to detect STOP/OPT-OUT replies.
- Webhook signature verification to confirm authenticity.
- Mapping between Twilio SID and our `provider_message_id`.
- Mapping between Twilio `MessageStatus` values (`sent`, `delivered`, `failed`, `undelivered`) and our `provider_status` enum.

### No provider lock-in:
- If a future requirements change necessitates swapping to Nexmo or Pinpoint, the schema supports it without fundamental redesign.
- `provider_name` switch; update webhook handlers; map provider-specific fields to our generic columns.
- No table is named `twilio_*` or `twilio_message_*`.

---

## 8) Migration Strategy Recommendation (Future)

This is a planning-level recommendation for the future migration slice that will implement the schema.

### Migration principles:
- **Additive only:** No deletion or renaming of existing tables; no destructive changes to `customers`, `jobs`, `job_events`, or existing snapshots.
- **Nullable-safe rollout:** All new columns default to NULL; no NOT NULL constraints on new fields unless explicitly designed and tested.
- **No consent backfill:** Do not run a migration that marks existing customers/phones as "consented" or "opted in" simply because they exist in the app. Default all consent records to `unknown` or omit them.
- **No live send enablement:** Migration does not flip any feature flag, does not enable sending, and does not create any UI for sending. A separate implementation slice enables send UI after schema, testing, and provider setup are complete.
- **Fail-closed defaults:** Consent defaults to `unknown`. Suppression rules fail if a check fails (block, don't guess). Quiet hours block by default if timezone is unknown.

### Recommended migration stages (planning-only):

**Stage 1 — Recipient Registry Foundation**
- Create `contact_recipients` table.
- Create initial RLS policies.
- Create indexes on `account_owner_user_id`, `linked_entity_type`, `linked_entity_id`, `phone_e164`, `recipient_role`.
- Do not populate; wait for future read model.

**Stage 2 — Consent / Suppression Foundation**
- Create `contact_recipient_consents` table (consent defaults to `unknown`).
- Create `contact_recipient_suppressions` table (starts empty; first suppressions come from inbound STOP after provider is live).
- Create RLS policies.
- Create indexes.

**Stage 3 — Intent / Audit Foundation**
- Create `sms_message_intents` table.
- Create `sms_provider_deliveries` table.
- Create RLS policies.
- Create indexes on `account_owner_user_id`, `contact_recipient_id`, `provider_status`, `submitted_at`.

**Stage 4 — Seed Recipient Candidates (Optional)**
- If approved in explicit design review, seed `contact_recipients` from existing `customers` + `contractors` tables.
- Seed with `recipient_role = 'customer_primary'` or `'contractor_contact'` only if entity already exists.
- Mark all seeded records as `status = 'inactive'` initially; ops team can activate during readiness testing.
- **Important:** Do NOT create consent records automatically. Each seeded recipient starts with `consent_status = 'unknown'`.

**Stage 5 — Read Model and Tests**
- Implement typed read models (e.g., `findContactRecipients()`, `checkConsent()`, `checkSuppression()`).
- Write tests for tenant scoping, consent precedence, suppression precedence.
- No send functionality yet.

---

## 9) Testing Strategy Recommendation (Future)

Comprehensive testing prevents silent regressions and ensures compliance.

### Unit tests:
- **Recipient role normalization:** Ensure all 12 roles normalize correctly; no typos or case sensitivity issues.
- **Account/tenant scope enforcement:** Verify that a user's query for recipients never returns recipients from another account.
- **Consent allow/deny decisions:** Test matrix of (consent_status, message_class, decision) combinations; ensure `unknown` and `revoked` both block.
- **Suppression precedence:** Test that suppression blocks regardless of consent status.
- **Quiet hours blocking:** Test timezone-based quiet hours; verify block at send time.
- **Provider status transitions:** Test valid state transitions (`not_submitted` → `submitted` → `sent` → `delivered`); reject invalid transitions.

### Integration tests:
- **End-to-end pre-send checkpoint:** Create a test recipient with `consent = unknown`, attempt to send, verify blocked with correct reason.
- **End-to-end post-send audit:** Create intent record, submit to mock provider, capture delivery callback, verify audit trail is immutable.
- **Inbound STOP handling:** Simulate Twilio inbound STOP webhook, verify suppression record created, verify next send attempt is blocked.
- **Job_events does not replace provider truth:** Verify that creating a `sms_sent` job_event summary does not overwrite provider delivery status in audit tables.
- **Recipient picker population:** Test that UI picker correctly filters inactive recipients and shows consent/suppression context.

### Compliance tests:
- **No consent-by-default:** Verify migration does not mark anyone as consented; all seeders must default to `unknown`.
- **No silent failures:** If a send is blocked, verify the block reason is captured and audit-logged.
- **Fail-closed default:** If a provider response is unparseable, mark status as `unknown`, do not assume success.
- **Audit trail immutability:** Verify that `created_at`, `updated_at`, actor fields are not updatable after creation; use triggers if needed.
- **No cross-tenant leakage:** Load tests with thousands of recipients across multiple accounts; verify no tenant bleed.

---

## 10) Future Implementation Sequence (Recommendation)

This recommends the expected order of future slices after the current schema design plan.

| Step | Work Item | Dependency |
|---|---|---|
| A | Schema design review and finalization | Completion of this planning doc; design review meeting with eng + compliance |
| B | Schema migration foundation (stages 1–3 above) | Approved design; migration testing in staging |
| C | Read models and decision helpers (consent, suppression, quiet hours) | Stage B migration applied |
| D | Recipient picker UI and non-sending template preview | Stage B migration; read models from C |
| E | Unit tests + integration tests + compliance tests | Read models and helpers in place |
| F | Provider selection and A2P registration (Twilio) | Design approved; legal/compliance review |
| G | Webhook receiver implementation for provider callbacks | A2P registration; sandbox credentials |
| H | Sandbox provider send with full audit trail | Provider registered; webhook receiver ready; all tests passing |
| I | Production activation | Sandbox testing complete; final legal/provider review and explicit owner approval |

Each step must be completed and validated before proceeding to the next. No step may be skipped.

---

## 11) Explicit Non-Goals for This Slice

This schema design planning doc does not perform or authorize:

- live SMS sends
- provider setup or registration (Twilio or otherwise)
- any schema file creation or modification
- any migration or Supabase command
- any environment variable or secret changes
- any feature flag changes
- On-The-Way automation
- invoice/payment/QBO behavior changes
- tenant Stripe payment execution
- portal expansion
- marketplace feature implementation
- any code changes
- any runtime behavior changes

This is documentation only. It defines what must be built; it does not build it.

---

## 12) Related ACTIVE References

- docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md (model and role taxonomy that informs schema)
- docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md (compliance gates that schema must satisfy)
- docs/ACTIVE/source-of-truth-strategy.md (canonical source rules that SMS schema must respect)
- docs/ACTIVE/Active Spine V4.0 Current.md (project spine and SMS 9B entry)
- docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md (Group 9B roadmap entry)
- docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
- docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md
