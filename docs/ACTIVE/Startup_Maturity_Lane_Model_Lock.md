# Compliance Matters Startup Maturity Lane Model Lock

Status: ACTIVE PLANNING / MODEL LOCK CANDIDATE
Mode: Documentation/model/audit only
Date: 2026-06-21
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`, `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`, and current payment, support, product-mode, workflow, and financial-access model specs.

This document audits the current startup/admin/onboarding/training/help surfaces and proposes the next model for company readiness, role-based training, contextual help, and help-gap learning. It does not authorize runtime behavior changes.

## 1. Executive Summary

North star:

> A new company can run one real job from customer intake to closeout and invoice without Eddie on the phone, and each user understands only the parts of the day they are responsible for.

The current product already has useful startup ingredients: Admin Center Day 1 setup, Company Profile essentials, product-mode presentation, entitlement display, team invite surfaces, device setup, support V0 docs, Support Case V1, payment readiness helpers, and role-gated financial authority.

The current startup experience is not yet customer-ready for general new users because it reads like a hybrid of setup checklist, technical diagnostics, and owner/support visibility. It also overuses trial copy after account state may no longer be trial, treats online invoice payments as optional/can-wait even though they are a high-priority business setup item for invoice-using accounts, and exposes Stripe/connected-account details directly in the primary Company Profile payment card.

Recommended model:

- Admin Center startup becomes the **Launch Room**: "Get your company ready, run your first job, and park the rest until later."
- A dedicated **Training Room** answers: "Do my people know how to run the day?"
- **Ask Compliance Matters** guides from Launch Room and Training Room, initially read-only and local/contextual.
- **Help Gap Logging** captures unanswered/confusing help interactions as reviewable product/support intelligence, not automatic model training.
- Online invoice payments become a prioritized business setup item named **Accept Online Invoice Payments**, with Stripe-specific facts collapsed into an Advanced / Technical section for appropriate owner/admin/billing users.

## 2. Current-State Audit Findings

### 2A. Company Profile / Account Center UX Maturity Lock

Status: CLOSED / MODEL LOCKED
Date: 2026-06-22

This addendum records the completed Company Profile cleanup lane and locks the current owner/admin UX model for `/ops/admin/company-profile`.

Completed slices:

- CP-A: owner-friendly copy and label cleanup.
- CP-B: collapsed advanced/provider/ECC clutter.
- CP-B2: made Company Details the primary landing experience.
- CP-C: clarified Invoice Settings vs Online Payments.
- CP-D: final owner-friendly readability/layout polish.

Primary route and anchors:

- `/ops/admin/company-profile`
- `#company-details`
- `#invoice-settings`
- `#account-billing`
- `#accept-payments`

Company Profile purpose:

- Business identity.
- Customer-facing identity.
- Business contact info.
- Operating preferences.
- Subscription/payment readiness summaries.
- ECC/HERS handoff summaries when relevant.

Locked page order:

1. Hero.
2. Customer-facing identity plus Company Details.
3. Setup attention only when required setup items are incomplete.
4. Compact First Job Training / Training Room card.
5. Compliance Matters Subscription.
6. Invoice Settings.
7. Online Payments.
8. ECC/HERS summaries.
9. Advanced details collapsed.

Intentionally primary:

- Company Details.
- Customer-facing identity.
- Business email and phone.
- Invoice workflow preference.
- Online payment readiness and action.
- Subscription status and action summary.

Intentionally secondary / Advanced:

- Subscription diagnostics.
- Seat/payment-method diagnostics.
- Payment provider internals.
- ECC/HERS handoff IDs.
- Empty/pending/active handoff lists.
- Manual rater/handoff management details.
- Provider troubleshooting fields.

Preserved behavior:

- All primary anchors are preserved.
- All Company Profile form actions are preserved.
- Payment setup/manage/refresh actions are preserved.
- Invoice Settings are preserved.
- ECC/HERS rater and handoff actions are preserved.
- Auth and account scoping are preserved.

Locked UX principles:

- Company Profile should not feel like onboarding before profile.
- Training Room owns first-job education.
- Setup attention appears only when required items are incomplete.
- Healthy/ready states should be quiet.
- Broken/incomplete states should be actionable.
- Provider/system diagnostics belong behind Advanced.
- Online Payments is customer payment collection and remains separate from the Invoice Settings workflow choice.

Deferred items:

- Dedicated Invoices & Payments workspace split, if needed later.
- Dedicated ECC/HERS Handoff workspace, if needed later.
- Full Account Center redesign.
- Mobile bottom-nav overlay cleanup, which predates this cleanup lane.
- Any payment/provider behavior changes.
- Any schema changes.

Current startup/readiness surfaces:

- `app/ops/admin/page.tsx` renders Admin Center with an "Account setup" area, progress percent, required setup, optional setup, and a first-job path.
- `app/ops/admin/company-profile/page.tsx` renders Company Profile, Day 1 essentials, Success Guide, account/subscription display, invoice mode, ECC/HERS handoff setup, and tenant online payment readiness.
- `lib/business/account-readiness.ts` is the current read model for company readiness.
- `lib/business/platform-entitlement.ts` resolves trial/active/grace/suspended/cancelled, internal comped state, seats, trial end, and Stripe platform-subscription linkage without exposing raw Stripe IDs.
- `lib/business/tenant-stripe-connect-readiness.ts` resolves tenant invoice-payment readiness from internal business profile Stripe Connect columns.
- `lib/business/product-surface-profile.ts` provides product-mode surface hints for HVAC Service, ECC/HERS, Cleaning, and Hybrid.
- `lib/auth/internal-user.ts`, `lib/auth/financial-access.ts`, and `lib/auth/field-billing-access.ts` define current role/financial authority boundaries.

Current support/help/training posture:

- `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md` defines manual owner-led support, issue intake, severity, escalation, and boundaries.
- `docs/ACTIVE/Support_V0_Issue_Log_Template.md` defines slim and full support issue logging templates.
- `docs/ACTIVE/Support_Case_Call_Log_V1_Model_Spec.md` and Support Case V1 code provide durable owner/support-internal issue records, separate from Support Console.
- The in-app Training Room now exists at `/training`.
- Ask Compliance Matters now exists as a local/mock assistant on approved Launch Room and Training Room surfaces.
- Durable Help Gap Logging and the owner/admin Help Gap Review queue now exist behind explicit feature flags. See `docs/ACTIVE/Help_Gap_Logging_Durable_Model_Spec.md`.

## 3. Current File / Component / Read-Model Inventory

Admin and setup:

- `app/ops/admin/page.tsx`: Admin Center shell, readiness percent, setup links, admin cards.
- `app/ops/admin/company-profile/page.tsx`: Company Profile, Day 1 essentials, Success Guide, account billing, invoice mode, ECC/HERS handoff, online payment readiness.
- `app/ops/admin/internal-users/page.tsx`: team invite/internal user setup surface; current copy references 30-day trial jobs.
- `app/ops/admin/users/page.tsx`: People & Access recovery/invite surface.
- `app/ops/admin/communications/page.tsx`: SMS/provider readiness display.
- `app/ops/notifications/_components/DeviceInstallHelper.tsx` and related notification components: device/app and notification setup surfaces.

Read models and helpers:

- `lib/business/account-readiness.ts`: current readiness checklist source.
- `lib/business/platform-entitlement.ts`: platform account lifecycle and entitlement resolver.
- `lib/business/platform-billing-stripe.ts`: platform subscription availability helpers.
- `lib/business/tenant-stripe-connect-readiness.ts`: online invoice payment readiness helper.
- `lib/business/tenant-stripe-connect-onboarding.ts`: tenant Stripe onboarding/sync helper.
- `lib/business/product-mode-defaults.ts`: product-mode resolver.
- `lib/business/product-surface-profile.ts`: product-mode presentation profile.
- `lib/business/internal-business-profile.ts`: company profile and billing mode read/write model.
- `lib/auth/internal-user.ts`: internal role model: `admin`, `office`, `tech`, `billing`.
- `lib/auth/financial-access.ts`: Owner/Admin/Billing financial authority.
- `lib/auth/field-billing-access.ts`: field billing capability model.

Payment and entitlement schema signals:

- `supabase/migrations/20260425120000_platform_account_entitlements_v1.sql`
- `supabase/migrations/20260426160000_platform_account_entitlements_stripe_lifecycle_v1.sql`
- `supabase/migrations/202604151030_internal_business_profiles_billing_mode.sql`
- `supabase/migrations/20260519183000_internal_business_profiles_stripe_connect_readiness_v1a3a1.sql`
- `supabase/migrations/20260509120000_account_settings_product_mode_v1.sql`

Support/help:

- `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md`
- `docs/ACTIVE/Support_V0_Issue_Log_Template.md`
- `docs/ACTIVE/Support_Case_Call_Log_V1_Model_Spec.md`
- `lib/business/support-cases.ts`
- `lib/actions/support-case-actions.ts`
- `app/ops/owner-console/[accountOwnerUserId]/SupportCasesPanel.tsx`

## 4. Current Pain Points and Risk Points

1. Trial language is not lifecycle-aware enough.
   - Admin Center hardcodes "Start your 30-day trial with real work."
   - Company Profile Day 1 area uses "30-day trial" prominently.
   - Paid/active or comped/internal accounts risk seeing stale or misleading trial copy.

2. Readiness currently mixes launch guidance and diagnostics.
   - Useful facts are present, but the experience feels like a setup/status dump instead of a guided operating path.
   - Completed setup does not fully graduate into a compact "Ready for operations" state.

3. Online invoice payments are under-prioritized.
   - `account-readiness.ts` treats `accept_customer_payments` as optional/can wait.
   - Company Profile says Stripe setup "can wait until you are ready to collect invoice payments online."
   - For accounts using Compliance Matters invoices, accepting online invoice payments should be a high-priority business setup item.

4. Payment readiness copy exposes technical implementation.
   - Main UI labels include "Tenant customer invoice payments", "Stripe Connect", "connected account", "onboarding status", "charges enabled", "payouts enabled", "details submitted", and disabled reasons.
   - These are useful support/admin diagnostics, but they should not be the primary customer-facing model.

5. Setup and training are blended.
   - Current "Success Guide" is helpful but lives inside Company Profile and is not role-scoped training.
   - There is no dedicated route where a dispatcher, tech, billing user, or ECC/HERS rater can learn their day without seeing admin setup.

6. Role boundaries are strong in code but not yet reflected in training IA.
   - Financial authority is Owner/Admin/Billing.
   - Technicians should not see subscription/trial/payment setup, broad backlog, team permissions, rater IDs, or financial reports by default.
   - Training needs to mirror those boundaries.

7. Support intelligence is manual, not yet help-loop native.
   - Support V0 and Support Case V1 are good foundations.
   - Help-gap logging should add a safe structured review queue later without replacing support intake or creating automatic training behavior.

## 5. Proposed Launch Room Model

Launch Room answers:

> Is the company ready to operate?

Primary user promise:

> Get your company ready, run your first job, and park the rest until later.

Recommended location:

- Lives inside Admin Center startup area at `/ops/admin`.
- Company Profile links into Launch Room but should not duplicate the full Launch Room.
- Company Profile owns company identity, invoice mode, account/subscription details, ECC/HERS handoff configuration, and online payment detail panels.

Top card states:

| State | Headline | Subcopy | Primary action |
|---|---|---|---|
| Needs setup | Launch Room | Get your company ready, run your first job, and park the rest until later. | Continue setup |
| Almost ready | Almost ready for operations | Finish the last required items, then run the first job path. | Finish required setup |
| Ready | Ready for operations | Required setup is complete. Use this room when company settings change. | Run first job |
| Attention | Setup needs attention | Something required for normal operations needs review. | Review attention item |
| Unknown | Setup status needs refresh | We could not confirm all setup details. You can still review the steps below. | Review setup |

Setup buckets:

1. **Required Now**
   - Company name/details confirmed.
   - Support email and phone.
   - Team access: at least owner/admin plus the people needed to run first job.
   - Invoice mode.
   - App subscription/account access state.
   - Accept Online Invoice Payments when `billing_mode` is internal invoicing or the account expects Compliance Matters invoices.

2. **Recommended Next**
   - Company logo.
   - Pricebook starter items/import.
   - Device/app install and notifications for assigned users.
   - Product-mode-specific basics: service defaults, ECC/HERS handoff setup, cleaning starter tasks when relevant.

3. **Can Wait**
   - Contractor directory for Service accounts unless actually needed.
   - Deep reports.
   - Service plans/recurring billing unless used now.
   - SMS/provider readiness.
   - Advanced payment automation beyond the current invoice-payment setup.
   - Support Console/remote assistance.

4. **Advanced / Technical**
   - Stripe connected account id.
   - Charges/payouts/details flags.
   - Disabled reason codes.
   - Raw account-owner IDs.
   - Billing subscription internals.
   - Entitlement diagnostic details.
   - Support-only or platform-owner diagnostics.

Completed required setup behavior:

- Collapse Required Now into a compact "Ready for operations" summary.
- Keep a "Review setup" secondary action.
- Show only attention items if something regresses.
- Do not keep large setup cards occupying the first screen after graduation.

Optional setup behavior:

- Keep Recommended Next and Can Wait available below the fold or in collapsed groups.
- Optional items should never block the first job unless the account selected a workflow that requires them.
- Online invoice payments are not optional when the account will use Compliance Matters invoices.

Page graduation behavior:

- Before ready: Launch Room is first content in Admin Center.
- After ready: Admin Center opens with compact Ready for Operations band and normal admin workspaces.
- Training Room remains available as Training & Reference.

## 6. Proposed Account Lifecycle Display States

Account lifecycle display should derive from `resolveAccountEntitlement()` while translating technical statuses into customer-safe language.

| State | Headline | Subcopy | Setup card behavior | Trial language | Actions |
|---|---|---|---|---|---|
| trial active | Trial active | Use the trial to prove the daily routine from customer to invoice. | Show Launch Room setup and trial end date if available. | Yes, date-specific when known. | Open billing setup, manage setup, run first job |
| active/paid | Account active | Your Compliance Matters account is active. Keep operations moving. | Do not show trial-start copy. Show Ready/attention state. | No. | Manage subscription, review setup, run first job |
| comped/internal | Internal account active | This account is active and does not require app billing setup. | Show Launch Room without billing pressure. | No. | Review setup, run first job |
| past due/inactive | Account needs attention | App billing or account access needs review before normal operations continue. | Show attention banner; keep safe setup/recovery routes visible. | No. | Manage billing, contact support, review access |
| unknown/fail-safe | Account status needs review | We could not confirm account status. Review setup or contact support if blocked. | Show conservative attention state. | No. | Review account billing, contact support |

Important display rule:

- Paid/active and comped/internal accounts must never see "Start your 30-day trial" as the main Admin Center headline.

## 7. Proposed Online Invoice Payments Display States

Launch Room label:

- **Accept Online Invoice Payments**

Purpose copy:

- Let customers pay invoices online through Compliance Matters.

Plain-language display states:

| State | User-facing label | Explanation | Primary button | Secondary button | Hidden/collapsed technical details |
|---|---|---|---|---|---|
| not set up | Online invoice payments not set up | Customers cannot pay Compliance Matters invoices online yet. | Set up online payments | Learn what this enables | connected account id, onboarding status, charges, payouts, details submitted |
| setup started / needs completion | Finish online payment setup | Setup was started but is not finished yet. | Continue setup | Check payment setup status | same as above, plus disabled reason |
| needs attention | Payment setup needs attention | Online invoice payments need review before customers can pay online. | Fix payment setup | Check status | disabled reason/codes collapsed |
| ready | Online invoice payments ready | Customers can pay eligible issued invoices online. | Check payment setup status | Open invoice workflow | technical details collapsed |
| not used / external billing | Online invoice payments not used | This account tracks billing outside Compliance Matters or does not collect online invoice payments here. | Change invoice mode | Review billing setup | all Stripe details hidden by default |

Payment readiness priority:

- If `billing_mode` is internal invoicing, online invoice payment setup belongs in Required Now or Recommended Next depending on owner rollout policy.
- If `billing_mode` is external billing, show it as not used / can wait.
- Do not expose Stripe as the primary concept. Use Stripe only in Advanced / Technical or support/operator copy.

## 8. Proposed Training Room Model

Training Room answers:

> Do my people know how to run the day?

Recommended route:

- `/training`

Training should be workflow-mission based, not feature-library based.

Default mission groups:

- First Job Mission
- Start Your Day
- Office Daily Rhythm
- Field User Rhythm
- Billing Rhythm
- ECC/HERS Rhythm
- Closeout and Invoice
- Handle Waiting / Parts Needed / Approval Needed
- Tomorrow's Ops Review

Training content model:

- Mission title.
- Who this is for.
- What you need to do.
- What you need to understand.
- What is not your responsibility.
- Route links.
- Short completion/self-check status, initially local/UI-only or read-only until a separate training-completion model is approved.

Training Room should remain available after Launch Room graduation as **Training & Reference**.

## 9. Proposed Role Responsibility Matrix

| Track | Default visible training | Required missions | Recommended missions | Optional cross-training | Hidden by default |
|---|---|---|---|---|---|
| Owner / Admin | Launch Room, company readiness, Today/Ops, first job, team, invoice mode, payment setup, reports | Launch Room, Run Your First Job, Tomorrow's Ops Review, Account & Team Setup | Billing Rhythm, ECC/HERS or Service workflow, device setup | All tracks | None, but default path should not dump every module |
| Dispatcher / Office | Today/Ops, customer/job intake, schedule/assign, waiting follow-up, closeout queue | Start Your Day, Office Daily Rhythm, Schedule and Assign, Handle Waiting | Closeout and Invoice overview, customer communication | Field User Rhythm, Billing overview | Subscription/trial, online payment setup, team permissions unless admin |
| Technician / Field User | My Work, job page, notes/photos, field context, finish outcome | Field User Rhythm, Open Job, Capture Notes/Photos, Finish Outcome | Device setup, customer communication basics | Closeout overview if permitted | Admin setup, subscription/trial, payment setup, Stripe/payment readiness, team permissions, connected rater IDs, financial reports, billing authority training, broad office backlog |
| Billing / AR | invoices, payment register, payment verification, payment attention, customer payment history | Billing Rhythm, Closeout and Invoice, Payment Review | Today money attention, service-plan billing overview if used | Office intake overview | Team permissions, product-mode admin, field-only workflow unless cross-responsibility |
| ECC / HERS Rater | ECC job rhythm, test entry, failed/correction/retest, cert closeout, contractor handoff | ECC/HERS Rhythm, Run ECC Job, Failed/Correction/Retest, Cert Closeout | Office handoff overview, contractor report overview | Billing overview only if authorized | Subscription/trial, online payment setup, financial reports, broad admin/team setup |
| Contractor / Portal User (later/deferred) | Portal intake, correction response, contractor report, retest-ready signal | Portal Intake, Respond to Failed Report, Submit Correction/Retest Ready | Handoff expectations | None initially | Internal admin, team, billing, company setup, support console |

Multiple responsibilities:

- Users with multiple roles/capabilities may see combined tracks.
- Visibility should be additive but still grouped by "Your Role Today" rather than one giant library.
- Admins may open all tracks, but their default path should be Operations / Launch / Company readiness.

## 10. First Mission: Run Your First Job

Mission promise:

> Create one real customer, run one real job, finish the outcome, invoice it, and review tomorrow's work.

Steps and route links:

| Step | Plain-language copy | Route | Primary responsibility |
|---|---|---|---|
| 1. Create first customer | Add the customer or account you are working for. | `/customers/new` | Owner/Admin, Dispatcher/Office |
| 2. Create first job | Create the work order or ECC job for that customer and service location. | `/jobs/new` | Owner/Admin, Dispatcher/Office |
| 3. Schedule and assign | Put the job on the calendar and assign the right field user. | Job scheduling/calendar routes | Dispatcher/Office |
| 4. Open job | Field user opens the assigned job from Today/My Work. | `/today`, `/jobs/[id]` | Technician/Field, ECC/HERS Rater |
| 5. Capture notes/photos/context | Add the context needed to explain what happened. | `/jobs/[id]` | Technician/Field, ECC/HERS Rater |
| 6. Finish outcome | Choose Work Completed, Materials Needed, Approval Needed, or Other. | `/jobs/[id]` finish panel | Technician/Field, ECC/HERS Rater |
| 7. Closeout | Office/admin reviews what is complete or waiting and handles next responsibility. | `/ops`, job detail closeout | Dispatcher/Office, Owner/Admin |
| 8. Invoice | Create/send/record invoice or mark external billing complete according to invoice mode. | `/jobs/[id]/invoice` | Billing/AR, Owner/Admin |
| 9. Tomorrow's Ops Review | Use Today/Ops to see what needs action tomorrow. | `/today`, `/ops` | Owner/Admin, Dispatcher/Office |

Responsibility guardrail:

- A technician's mission stops at accurate field context and finish outcome unless they also have field billing capability.
- Billing/AR owns invoice/payment review and payment verification.
- Dispatcher/Office owns scheduling and waiting follow-up.

## 11. Ask Compliance Matters Integration Model

Ask Compliance Matters should guide from the cleaned-up Launch Room and Training Room models. It should not become a second onboarding truth model or compensate for confusing UI.

Initial posture:

- Read-only.
- Contextual.
- No tenant mutations.
- No automatic setup.
- No automatic training certification.
- No provider/LLM wiring until safe surfaces and contracts exist.

Safe context it may read in early slices:

- Current route.
- Current user's internal role/capabilities.
- Product mode and product surface profile.
- Launch Room display state/readiness item labels.
- Training Room mission definitions.
- Account lifecycle display state, in customer-safe terms.
- Online invoice payment display state, in customer-safe terms.
- Help article/mission content created for this lane.

Context it must never read in first slices:

- Raw Stripe account IDs, customer IDs, subscription IDs, payment method IDs, secrets, tokens, webhook payloads.
- Raw support-console session/grant data.
- Service-role-only data.
- Cross-account data.
- Private customer/job details unless explicitly in the current page context and approved by a later privacy model.
- Attachments/photos/files.
- SMS/provider secrets, auth tokens, API keys, VAPID/private keys.
- Full browser storage/session secrets.

How it should answer setup questions:

- Point to the Launch Room bucket and route.
- Use the same display state names as Launch Room.
- Use customer language, not internal field names.
- If a question requires technical support, say what the owner/admin should review without exposing secrets or raw IDs.

How it should guide Training Room missions:

- Start from the user's role track.
- Explain what is their responsibility and what is not.
- Link to the relevant route and mission step.
- Avoid broad feature-library answers unless the user asks for a reference lookup.

## 12. Help Gap Logging Model

Help Gap Logging is product intelligence, not automatic model training.

What counts as a help gap:

- Assistant cannot answer confidently from approved help/training content.
- User marks an answer "not helpful."
- User repeatedly asks for the same setup/workflow explanation.
- User asks how to perform a task the UI should make obvious.
- User reports confusion about account/payment/training states.
- User asks about a deferred feature because the UI/copy implies it exists.

Safe metadata to capture:

- Timestamp.
- Account owner scope id only if already part of authenticated app context.
- User role/capability summary.
- Route/path pattern, not full sensitive URL query if it contains IDs/tokens.
- Product mode.
- Launch Room state bucket.
- Training mission id, if applicable.
- Help gap category.
- User feedback rating.
- Short sanitized summary of question and answer category.

Sensitive data to never capture:

- Passwords, auth tokens, secrets.
- Raw Stripe/customer/payment method IDs.
- Full card/bank/payment data.
- Full customer/job/invoice narrative content unless later explicitly approved.
- Attachments/photos/files.
- Medical, legal, or unrelated personal data.
- Private support-console session/grant internals.

Suggested categories:

- `guidance_training`
- `setup_data_issue`
- `ux_confusion`
- `possible_product_bug`
- `future_feature_request`
- `missing_help_article`
- `unknown`

Review location:

- Durable logging now writes sanitized help-gap rows to the dedicated `assistant_help_gap_events` table when `ENABLE_HELP_GAP_LOGGING` is enabled.
- Owner/admin review queue now lives at `/ops/admin/help-gaps` behind `ENABLE_HELP_GAP_REVIEW_QUEUE`.
- Reporting summaries now show patterns by category, page family, role, event type, review status, training mission, and setup step.
- Help gaps remain separate from Support Case V1; no support case is created or linked by this lane.

## 13. Proposed Information Architecture

Recommended IA:

- `/ops/admin`: Admin Center with Launch Room at top.
- `/ops/admin/company-profile`: Company identity, billing mode, account/subscription details, ECC/HERS handoff details, online invoice payment detail panel.
- `/training`: Training Room dedicated route.
- `/today`: role-aware daily entry point with Training Room links when a user is new or has incomplete required missions.
- `/ops`: operational queues with contextual training links for office/admin roles.
- Help Assistant: floating/global entry or page-level entry that can deep-link to Launch Room or Training Room.
- Company Profile: links back to Launch Room rather than duplicating every Launch Room concept.

New users vs reference:

- Launch Room should be prominent until required setup is complete.
- After graduation, Launch Room becomes compact reference/attention state.
- Training Room remains available permanently as Training & Reference.

## 14. Proposed User-Facing Naming / Copy System

Preferred names:

- Launch Room
- Training Room
- Field Guide
- Your Role Today
- First Job Mission
- Daily Rhythm
- Ready for Operations
- Required Now
- Recommended Next
- Can Wait
- Accept Online Invoice Payments
- Online Invoice Payments
- Let customers pay invoices online
- Finish online payment setup
- Check payment setup status
- Connection Code
- ECC/HERS Handoff

Avoid in primary UI:

- Academy
- Knowledge Base as primary concept
- AI Tutorial Center
- Tenant
- Entitlement
- Stripe Connect
- Connected account
- Charges enabled
- Payouts enabled
- Details submitted
- UUIDs as primary visible content
- Mutation/source-of-truth language

Recommended Launch Room headline:

- `Launch Room`

Recommended Launch Room subcopy:

- `Get your company ready, run your first job, and park the rest until later.`

Recommended ready state:

- `Ready for operations`
- `Required setup is complete. Keep this room for account changes and new-team refreshers.`

Recommended Training Room headline:

- `Training Room`

Recommended Training Room subcopy:

- `Learn the daily rhythms for your role without taking on someone else's responsibilities.`

## 15. Explicit Non-Actions

This planning pass does not authorize or perform:

- product code changes
- schema changes
- migrations
- Supabase reads/writes beyond static code/docs inspection
- service-role usage
- Stripe behavior changes
- payment behavior changes
- subscription behavior changes
- billing truth changes
- entitlement truth changes
- support-console enablement
- impersonation
- customer portal training implementation
- SMS/email/QBO/provider changes
- automatic setup
- automatic training certification
- automatic user invites
- automatic customer/job/contractor creation
- tenant operational mutation from help/training interactions
- broad UI rewrite without follow-up implementation scope

## 16. Recommended Implementation Sequence

Phase A: Launch Room display-state and copy cleanup

- Add lifecycle-aware Launch Room copy.
- Replace stale trial headlines for active/paid and comped/internal states.
- Rename current Account setup to Launch Room.
- Promote Accept Online Invoice Payments when internal invoicing is used.
- Keep Stripe details collapsed.

Phase B: Launch Room completion/collapse behavior

- Collapse completed required setup into Ready for Operations.
- Show only attention/regression items prominently after graduation.
- Keep Recommended Next and Can Wait below or collapsed.

Phase C: Training Room static workflow missions

- Add `/training` route with static mission content.
- Include First Job Mission, Start Your Day, Field User Rhythm, Office Daily Rhythm, Billing Rhythm, ECC/HERS Rhythm, and Tomorrow's Ops Review.
- No durable completion tracking yet.

Phase D: Role-scoped training visibility

- Use existing role/capability helpers to scope visible mission tracks.
- Technician default should be narrow and field-owned.
- Billing/AR should mirror financial authority boundaries.

Phase E: Ask Compliance Matters local/mock shell

- Read-only shell using Launch Room and Training Room content.
- No LLM provider.
- No mutation.
- No second source of onboarding truth.

Phase F: Help Gap Logging contract / later durable logging

- Define event shape and review categories.
- Start with mock/local or support-manual handoff.
- Propose durable storage only after safety review.

Phase G: Real LLM provider wiring

- Only after Launch Room, Training Room, safe context contract, and help-gap contract are reviewed.
- Must remain read-only in first provider-backed slice.

## 17. Validation Notes

This document was created as a docs-only planning artifact.

Validation required after edit:

- `git diff --check`
- Confirm no product/runtime/schema/env/provider files changed.

## 18. Source References Reviewed

Required docs:

- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md`
- `docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md`
- `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`
- `docs/ACTIVE/Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md`
- `docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md`

Additional docs:

- `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md`
- `docs/ACTIVE/Support_V0_Issue_Log_Template.md`
- `docs/ACTIVE/Product_Mode_Signup_Spec.md`
- `docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

Code/read-model references:

- `app/ops/admin/page.tsx`
- `app/ops/admin/company-profile/page.tsx`
- `app/ops/admin/internal-users/page.tsx`
- `app/ops/admin/users/page.tsx`
- `app/ops/admin/communications/page.tsx`
- `app/ops/notifications/_components/DeviceInstallHelper.tsx`
- `lib/business/account-readiness.ts`
- `lib/business/platform-entitlement.ts`
- `lib/business/platform-billing-stripe.ts`
- `lib/business/tenant-stripe-connect-readiness.ts`
- `lib/business/tenant-stripe-connect-onboarding.ts`
- `lib/business/product-mode-defaults.ts`
- `lib/business/product-surface-profile.ts`
- `lib/business/internal-business-profile.ts`
- `lib/auth/internal-user.ts`
- `lib/auth/financial-access.ts`
- `lib/auth/field-billing-access.ts`
- `lib/business/support-cases.ts`
- `lib/actions/support-case-actions.ts`
