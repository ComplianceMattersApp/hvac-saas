# Owner Support Read-Only Drilldown Audit

Status: AUDIT / PLANNING — Support Case V1 IMPLEMENTED / PRODUCTION-SMOKE-PASSED

Purpose: Define the safe path from the current Owner Console support snapshot toward practical phone-support visibility without impersonation or tenant mutation.

## Current posture

The current Owner Console snapshot is read-only and aggregate-first. It gives the owner enough account context to identify the tenant, understand readiness, review support next checks, confirm recent usage, review team/seat state, confirm company profile state, and inspect payment readiness signals.

This audit does not approve new implementation yet. It identifies what could be safely added next and what must remain forbidden.

## Non-negotiable boundaries

The owner support surface must not add:

- Login-as-customer behavior.
- Acting as the customer.
- Tenant-side mutation.
- Job/customer/invoice edits.
- Payment actions.
- Stripe refreshes.
- QBO actions.
- SMS sends.
- Customer portal access.
- File/attachment signing or download access unless separately designed and reason-logged.
- Broad record browsing without scoping, minimization, and owner-only gating.

## Existing relevant read boundaries

Existing code already includes internal job read/mutation scoping helpers that verify a job through the tenant ownership chain before returning it. In particular, `loadScopedInternalJobForMutation` checks the job, resolves its customer, and verifies the customer belongs to the account owner before returning a scoped result.

That pattern is useful for future owner-support drilldowns, but owner-support should use new read-only support-specific helpers rather than reusing mutation-named helpers directly in UI code.

## Candidate drilldowns

### 1. Customer Detail Lite

Recommended first drilldown after the current snapshot.

Safe fields could include:

- Customer display/name.
- Primary phone/email if already visible to the tenant account.
- Service address count.
- Active/recent job count.
- Last customer record activity date.
- Maintenance agreement presence/summary signal.
- Basic profile completeness signals.

Should avoid initially:

- Full notes history.
- Attachments.
- Customer private/freeform fields unless explicitly reviewed.
- Mutating customer fields.
- Customer portal/session links.

Recommended UI shape:

- Owner snapshot adds a `Customer Detail Lite` link only after a separate scoped list/read model is implemented.
- Start with a small customer list limited to account owner scope, search/filter, and a detail-lite page.

### 2. Job Detail Lite

Recommended second drilldown.

Safe fields could include:

- Job id/title/status.
- Scheduled date/window.
- Customer name and service address summary.
- Job type/product mode.
- Ops status.
- Assigned internal user display.
- Invoice status summary.
- Latest high-level activity timestamp.

Should avoid initially:

- Edit forms.
- Status advancement controls.
- Notes composers.
- Internal/freeform note bodies until reviewed.
- Attachments and signed URLs.
- Contractor/customer portal actions.
- Invoice creation/issue/send/void/record payment controls.

Recommended UI shape:

- Read-only support route, not the tenant job detail page.
- Support-specific read helper with account-owner scoping.
- No imported tenant job detail action forms.
- No server actions on the support page.

### 3. Invoice Detail Lite

Recommended third drilldown, after job/customer lite views.

Safe fields could include:

- Invoice number.
- Status.
- Issue date.
- Total/paid/balance summary.
- Payment truth projection.
- Payment link eligibility status.
- Email delivery count/status summary.

Should avoid initially:

- Creating payment links.
- Sending or resending emails.
- Manual payment entry.
- Voiding invoices.
- Showing raw Stripe identifiers.
- Refund/dispute tooling.

Recommended UI shape:

- Read-only invoice list scoped by account owner.
- Link from account snapshot or job-lite page to invoice-lite detail.

### 4. Activity / Error Visibility

Recommended audit before implementation.

Potentially useful:

- Recent job events count by type.
- Recent failed webhook/payment support-safe signals.
- Recent app errors only if already persisted in a safe support-readable table.

Should avoid initially:

- Raw logs with secrets.
- Provider payloads.
- Stack traces exposed in UI.
- User tokens/session data.

## Required architecture for future implementation

Future drilldowns should use:

- New support-specific read models/helpers.
- Platform-owner allowlist gating.
- Account-owner id as an explicit route parameter.
- Tenant ownership checks through customer/account owner relationship.
- Minimal selected columns.
- No server actions from support views.
- No tenant mutation buttons/forms.
- No shared tenant route reuse if it brings edit forms or mutation controls.
- Focused tests for cross-account isolation and forbidden mutation surfaces.

## Recommended implementation sequence

1. Add support-specific read helper for customer list/detail-lite.
2. Add owner-support customer list route under `/ops/owner-console/[accountOwnerUserId]/customers`.
3. Add customer detail-lite route under `/ops/owner-console/[accountOwnerUserId]/customers/[customerId]`.
4. Add tests proving cross-account customer IDs do not resolve.
5. Add job list/detail-lite only after customer-lite is stable.
6. Add invoice list/detail-lite only after job-lite is stable.
7. Audit error/activity visibility separately before any implementation.

## First recommended slice

First implementation slice should be:

`Owner Support Customer List Lite`

Scope:

- Read-only route.
- Account scoped.
- Customer name/contact/address summary.
- Job count and latest job date if inexpensive and safely scoped.
- Search/filter.
- No customer edit link.
- No tenant customer profile route link.
- No notes/attachments.
- No mutation.

This gives the owner a practical phone-support tool: “I can find the customer you are talking about and confirm the basic account/customer context,” without acting as the tenant.

## Explicit non-actions

Do not implement any drilldown until this audit is accepted and a focused slice is chosen.

Do not add schema, env, production Supabase commands, impersonation, tenant mutation, provider actions, or broad data browsing as part of the first drilldown slice.

---

## Support Case / Call Log V1 production closeout (May 2026)

- **Status: IMPLEMENTED / PRODUCTION-SMOKE-PASSED**
- Support Case / Call Log V1 is now implemented and owner production-smoke-passed.
- This is separate from the broader owner drilldown candidates described above (Customer Detail Lite, Job Detail Lite, Invoice Detail Lite), which remain parked as future work.
- Access: owner/support-internal only via existing platform-owner allowlist gate. No tenant users, no customer-facing portal.
- Mutation boundary: mutates only `support_cases` and `support_case_notes`. Does not mutate tenant operational records. No impersonation boundary crossed.
- Migration `202605241700_support_cases_v1.sql` applied to true production (`ornrnvxtwwtulohqwxop`).
- Owner smoke passed: Support Cases panel loaded, case creation, case detail, internal notes, status update, account snapshot counts updated.
- Parked next improvements from this V1 baseline:
  - Support cases index/list surface.
  - Related customer/job/invoice selectors on case detail.
  - Search and filter on support cases.
  - Explicit access/view reason logging.
  - Read-only job/invoice snapshots from case detail.
  - Account support workspace polish.
- Impersonation boundary preserved: V1 does not add login-as-customer, tenant-side mutation, or customer-facing portal exposure.
- Full spec and closeout record: `docs/ACTIVE/Support_Case_Call_Log_V1_Model_Spec.md`.
- Candidate drilldowns from this audit (Customer Detail Lite, Job Detail Lite, Invoice Detail Lite) remain parked as separate future planning work, unchanged from the original audit scope above.
