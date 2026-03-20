# Internal Operational Email Template Inventory

**Date**: March 20, 2026  
**Status**: Active Inventory (Operational Phase 1)  
**Scope**: Current server-side email subjects, template bodies, file locations, and delivery format

---

## Standardized Template Record

Use this record format for every new email template:

- Template ID:
- Flow/Event Owner:
- Trigger Function:
- Subject Source:
- Body Template Source:
- Delivery Transport:
- Format:
- Recipients:
- Dedupe Strategy:
- Failure Behavior:
- Notes:

---

## Phase 1 Operational Templates

### 1) Contractor Scheduled Email

- Template ID: `contractor_job_scheduled_email`
- Flow/Event Owner: Job scheduling (create + schedule update path)
- Trigger Function: `sendContractorScheduledEmailForJob(...)`
- Subject Source:
  - File: `lib/actions/job-actions.ts`
  - Subject line: `Compliance Matters Schedule – ${customerName} – ${subjectDate}`
- Body Template Source:
  - File: `lib/actions/job-actions.ts`
  - Builder: `buildContractorScheduledEmailHtml(...)`
  - Title: `Compliance Matters Schedule`
  - Core body copy:
    - `A job has been scheduled or updated.`
    - `Please ensure someone can provide access to the property and equipment if needed.`
    - `For questions or changes, please contact us directly.`
  - Includes details list for customer, address, date, time window, optional customer contact, service type, company, permit number, and optional portal link.
- Delivery Transport:
  - `sendEmail(...)` via Resend API lane
- Format:
  - HTML only
- Recipients:
  - Assigned contractor email
- Dedupe Strategy:
  - Notifications ledger key: `contractor_job_scheduled_email:${jobId}:${scheduledDate|windowStart|windowEnd}`
  - Stored in `notifications.payload.dedupe_key`
- Failure Behavior:
  - Logged and marked as failed in notifications ledger; scheduling action continues
- Notes:
  - Schedule updates only re-send when schedule fields materially change and prior contractor schedule email history exists.

### 2) Customer Scheduled Email

- Template ID: `customer_job_scheduled_email`
- Flow/Event Owner: Job scheduling (create + schedule transition to scheduled)
- Trigger Function: `sendCustomerScheduledEmailForJob(...)`
- Subject Source:
  - File: `lib/actions/job-actions.ts`
  - Subject line: `Job Scheduled – ${customerName} – ${subjectDate}`
- Body Template Source:
  - File: `lib/actions/job-actions.ts`
  - Builder: `buildCustomerScheduledEmailHtml(...)`
  - Title: `Your Job Is Scheduled`
  - Core body copy:
    - `Your upcoming service has been scheduled.`
    - `Please ensure someone can provide access to the service location during the scheduled time window.`
    - `If you need to make changes, please contact us as soon as possible.`
  - Includes details list for customer, address, date, time window, optional service type, optional service company, customer email, optional customer phone.
- Delivery Transport:
  - `sendEmail(...)` via Resend API lane
- Format:
  - HTML only
- Recipients:
  - Customer email on the job
- Dedupe Strategy:
  - Notifications ledger key: `customer_job_scheduled_email:${jobId}:${scheduledDate|windowStart|windowEnd}`
  - Stored in `notifications.payload.dedupe_key`
- Failure Behavior:
  - Logged and marked as failed in notifications ledger; scheduling action continues
- Notes:
  - Missing customer email skips send gracefully.

### 3) Contractor Intake Alert (Internal Ops/Admin)

- Template ID: `internal_contractor_job_intake_email`
- Flow/Event Owner: Contractor portal new job submission
- Trigger Function: `sendInternalContractorIntakeAlertEmail(...)`
- Subject Source:
  - File: `lib/actions/job-actions.ts`
  - Subject line: `New Contractor Job Intake - ${customerName} - ${serviceAddress}`
- Body Template Source:
  - File: `lib/actions/job-actions.ts`
  - Builder: `buildContractorIntakeAlertEmailHtml(...)`
  - Title: `New Contractor Intake Job`
  - Core body copy:
    - `A contractor submitted a new job that needs office/admin review.`
    - `Please review scheduling and next steps in Ops.`
  - Includes details list for contractor, customer, address, service/test type, created timestamp, optional internal job link.
- Delivery Transport:
  - `sendEmail(...)` via Resend API lane
- Format:
  - HTML only
- Recipients:
  - Active internal users with role admin/office for the account owner
- Dedupe Strategy:
  - Notifications ledger key: `internal_contractor_job_intake_email:${jobId}:initial_submission`
  - Stored in `notifications.payload.dedupe_key`
- Failure Behavior:
  - Logged and marked as failed in notifications ledger; job create path catches error and continues
- Notes:
  - Designed for one-time initial submission alert.

---

## Shared Layout / Transport Source of Truth

- Shared HTML layout wrapper:
  - File: `lib/email/layout.ts`
  - Function: `renderSystemEmailLayout(...)`
- Primary transport used by Phase 1 operational emails:
  - File: `lib/email/sendEmail.ts`
  - Function: `sendEmail(...)`
  - Provider: Resend API
  - Supports: `html` only

---

## Other Existing Templates (Out of Phase 1 Scope)

### A) Contractor Report Email

- Subject:
  - `Compliance Matters Report – ${customerName} – ${jobAddress}`
- Body:
  - Built from report text and optional portal link in `buildContractorReportEmailHtml(...)`
- Location:
  - `lib/actions/job-ops-actions.ts`
- Format:
  - HTML via `sendEmail(...)` path in current code
  - Legacy SMTP helper supports text + html in `lib/email/smtp.ts`

### B) Invite/Recovery Emails (Auth/Onboarding)

- Subject examples:
  - `You've been invited to Compliance Matters`
- Body:
  - Inline HTML strings in auth/invite action files
- Locations:
  - `lib/actions/contractor-invite-actions.ts`
  - `lib/actions/admin-user-actions.ts`
- Format:
  - HTML via `sendInviteEmail(...)` wrapper (which forwards to `sendEmail(...)`)

---

## Current Format Summary

- Phase 1 operational emails: HTML only
- Current primary app transport for these: Resend API via `lib/email/sendEmail.ts`
- No dedicated plain-text templates currently defined for the 3 Phase 1 operational events
