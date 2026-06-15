# Job Detail Desktop Workbench V2 Blueprint

Date: 2026-06-13
Branch: `feature/job-detail-desktop-visual-lab`
Source audit: `docs/WORKING/Job_Detail_Desktop_Visual_Lab_Audit.md`
Scope: documentation-only desktop V2 placement contract for internal `/jobs/[id]`

## 1. Executive summary

Desktop V2 should treat `/jobs/[id]` as a job workbench, not as a generic detail page. The page is where office users, dispatch, field leads, billing, and compliance work from the same record. The redesign should make the current work easier to scan and act on, while preserving every existing tool, hidden panel, action, role gate, state gate, record, note surface, and mobile dependency.

The first implementation slice should be view-layer placement only. It may move and regroup existing desktop surfaces, but it must not change route data reads, server actions, helper/source-of-truth logic, permissions, schemas, redirects, form field names, mobile UI, or shared component behavior.

The V2 contract is:

- Put alerts and action feedback in a global strip above the workbench.
- Make the header a dispatch-grade command header with identity, status, schedule, and primary lifecycle actions.
- Promote Visit Reason into a Job Brief while keeping Visit Reason, Customer Concern, Intake Notes, Work Summary, Service Details, and Work Items distinct.
- Promote notes into Job Memory, not archive. Keep internal notes, shared notes, contractor/correction notes, contact attempts, note banners, and timeline events.
- Group responsibility, place, work, billing, compliance, service chain, records, and admin tools into clear desktop zones.
- Replace the current visual records pill/grid with grouped records sections, while preserving current hash target IDs and target panels unless a later slice provides safe redirects/backward compatibility.

## 2. Scope lock and non-actions

In scope:

- Desktop internal `/jobs/[id]` placement blueprint.
- V2 zone definitions and exact inventory placement.
- Mobile protection rules.
- Implementation sequencing recommendation.
- Acceptance checklist.

Out of scope:

- Product code changes.
- JSX extraction.
- Component refactors.
- Behavior changes.
- Server action changes.
- Helper/source-of-truth changes.
- Schema, migration, env, Supabase, Stripe, QBO, SMS, RLS/auth, permission, or data changes.
- Removing, deleting, hiding permanently, or dropping any tool, card, action, field, drawer, tab, collapsible, note surface, record, or hidden panel.

The implementation contract for the next code slice should be: desktop-only visual placement, behind a preview switch if needed, using existing data and existing components.

## 3. Design thesis: Desktop Job Workbench, not generic Job Detail

The desktop page has to support active work. It is not merely a read-only record and it is not a marketing-style page. The layout should optimize for repeated operational use:

- What is this job, who owns it, and what is blocking it?
- What does the customer need and what work is supposed to happen?
- Who is responsible, who can be contacted, and who has been contacted?
- Where is the work, and what address/location controls are safe?
- What work has been captured and what should be billed?
- Is billing, closeout, permit/certs, ECC, service-plan, or service-chain work still open?
- What memory, notes, history, files, and previous visits explain the job?

This means notes, visit reason, work items, billing, compliance, and service chain all deserve first-class areas. V2 should reduce visual scatter without flattening distinct records into one vague blob.

## 4. Desktop V2 zones

### Global alert strip

Purpose: all route-level action feedback and attention banners that should be seen before work begins.

Contains:

- All `FlashBanner` messages driven by `banner`, `notice`, note-scope, workflow guidance, schedule, status, closeout, service-plan, invoice, and On the Way undo query params.
- Critical validation prompts such as ECC missing-test blocker when used as page-level action feedback.

Rules:

- Keep above the desktop workbench.
- Do not bury action feedback inside the zone that triggered it unless the current behavior already has a local banner and the global message is preserved.
- Preserve current banner query-param handling.

### Header and primary action bar

Purpose: command header for job identity, lifecycle state, schedule state, and primary field/status actions.

Contains:

- Header job identity.
- Job reference/display number.
- Status chips and lifecycle summaries.
- Schedule summary and schedule-required attention.
- Field status actions including On the Way and Undo On the Way.
- Field outcome/finish flow entry points when they are the next primary action.
- Closeout readiness headline when closeout blocks primary completion.

Rules:

- Keep primary action controls visible near the top on desktop.
- Do not move admin/destructive actions into the primary action bar.
- Keep ECC missing-test gating attached to field completion.

### Job Brief

Purpose: the human-readable reason the job exists and what the team should understand before touching tools.

Contains:

- Visit Reason.
- Customer Concern.
- Intake Notes.
- Work Summary.
- Service Details read/edit entry.
- Link/anchor to Work Items.

Rules:

- Rename the visual surface to Job Brief.
- Keep the underlying source fields distinct.
- Do not merge Visit Reason, Customer Concern, Intake Notes, Work Summary, or Service Details into one saved value.
- Keep edit controls wired to existing actions.

### Job Memory / Notes Hub

Purpose: current working memory and communication context, not a low-priority archive.

Contains:

- Latest internal/shared/correction note preview.
- Internal note composer and internal notes history.
- Shared note composer and shared/contractor/correction note history.
- Note save/mention banners.
- Contact logging summary and latest contact attempt indicator.
- Clear links/anchors to full timeline and follow-up history.

Rules:

- Keep notes visually high in the layout, near Job Brief and People.
- Keep internal notes and shared notes separated by audience.
- Keep contractor/correction notes visible as compliance/job memory.
- Timeline remains full activity history in Records Workspace; the top Notes Hub is a curated preview and working composer area.

### People & Responsibility

Purpose: who the job belongs to, who can be contacted, and who is responsible for work.

Contains:

- Customer/account card.
- Customer/account phone, text, email links.
- Billing recipient/access/role contacts.
- Contractor assignment/relationship context.
- Team assignment list.
- Add assignee.
- Set primary assignee.
- Remove assignee.
- Contact logging quick actions.

Rules:

- Keep contact tools near the people they contact.
- Keep contact attempt history in Records Workspace but surface latest attempt in the people/notes area.
- Keep role contacts read-only unless a current edit surface exists.

### Place & Work

Purpose: where the work happens and safe controls for location changes.

Contains:

- Service location preview.
- Address display.
- Directions/search links.
- Correct address link.
- Add new location link.
- Change Service Location form.
- Invoice-history warning for changing service location.

Rules:

- Keep map/address high enough for dispatch and field context.
- Keep "correct saved address" and "change job location" distinct.
- Preserve invoice snapshot warning exactly in the location-change flow.

### Primary Work

Purpose: the actual work to perform and capture for the visit.

Contains:

- Work Items editor.
- Primary work items.
- Companion service items.
- Promoted service job links.
- Create Service Follow-Up action.
- Add/Update Work collapsible.
- Work item pricing chips where currently shown.
- Ready-to-invoice total summary when internal invoicing is active.

Rules:

- Use existing `VisitScopeJobDetailForm` and visit scope source of truth.
- Keep Work Items separate from Job Brief prose.
- Keep companion service items visible and actionable.
- Do not make billing charge lines the same thing as work items.

### Billing / Closeout

Purpose: billing state, invoice actions, payment actions, closeout blockers, and charge proposal workflow.

Contains:

- Closeout readiness messaging and field/certs/invoice blockers.
- External billing data-entry prompt and complete action.
- Internal invoice summary.
- Draft invoice create.
- Replacement invoice prompt.
- Invoice charges.
- Issue invoice.
- Send/resend invoice.
- Void invoice.
- Payment tracking.
- Delivery history.
- Field billing proposal entry and review controls.
- Supplemental invoice family summary and links.
- No-charge and externally-billed disposition controls.

Rules:

- Keep billing authority controls gated by existing capabilities.
- Keep payment controls with issued invoice/payment state.
- Keep external billing separate from internal invoice workflow.
- Keep closeout blockers visible near billing but do not hide field/certs blockers.

### ECC / Compliance

Purpose: compliance-specific quick reference, status, testing, permits, certs, retest, and correction review.

Contains:

- Permit Quick Ref.
- Permit Details.
- ECC Summary latest run/result/date.
- ECC tests link paths.
- ECC missing-test blocker.
- Certs complete control.
- Permit available/permit blocker control.
- Retest ready.
- Retest scheduling.
- Linked retest continuation.
- Correction review resolution.
- Contractor Report Panel for failed/pending-info contractor correction context.
- ECC workflow milestones/handoff controls when part of service chain.

Rules:

- Show ECC/compliance only when current gates allow it.
- Keep compliance evidence and correction history discoverable.
- Do not mix ECC retest controls into generic service return visit controls without preserving labels and gates.

### Follow-up / Service Chain

Purpose: follow-up ownership, return/callback visits, service case workflow, service-plan effects, and multi-visit continuity.

Contains:

- Next Service Action.
- Create Return Visit.
- Create Callback Visit.
- Ready to continue this work.
- Part ordered/part arrived/approval received progress actions.
- Follow Up edit fields.
- Follow-Up History.
- Service Chain empty state.
- Workflow Guidance.
- Milestones.
- Linked visits.
- Handoff/rater controls.
- Maintenance agreement visit count.
- Suggested/confirmed next due date controls.

Rules:

- Separate active follow-up actions from historical follow-up records.
- Keep service-chain records visible even when no service case exists via empty state.
- Keep service-plan count/due actions near completion/follow-up, not buried in billing.

### Records Workspace

Purpose: full record/history workspace for secondary and historical panels.

Contains:

- Timeline and job history summary.
- Attachments and full attachments link.
- Equipment list/edit/create and Manage Equipment link.
- Follow-Up History.
- Service Chain.
- Shared Notes full history.
- Internal Notes full history if not fully represented in Notes Hub.
- ECC Summary and Permit Details if not already open in Compliance.
- Job Details, Job Status, Follow Up, and other current target panels.

Rules:

- Replace the current visual pill/grid with grouped desktop record sections.
- Preserve existing hash target IDs: `#edit-job`, `#job-status`, `#job-record-equipment`, `#job-record-attachments`, `#follow-up`, `#job-record-follow-up-history`, `#job-record-timeline`, `#service-chain`, `#shared-notes`, and other current anchors.
- Preserve target panels and post-submit `return_to` anchors unless a later implementation provides explicit redirects/backward compatibility.

### Admin / Danger Zone

Purpose: destructive/admin-only operations isolated from normal work.

Contains:

- Archive job.
- Cancel job.
- Any future dangerous/admin-only controls.

Rules:

- Keep `isInternalAdmin` gate.
- Keep terminal-state gates for cancel.
- Do not place in primary work/action area.

## 5. Full placement map

| Audit do-not-lose item | V2 placement |
|---|---|
| Auth redirects and same-account scoped read boundary | Outside visual layout; keep route/auth/data boundary unchanged before V2 render |
| All flash/banner messages and banner query-param handling | Global alert strip, with local banners preserved where already local |
| Header job identity, job reference, status chips, and lifecycle summaries | Header and primary action bar |
| Field status actions including On the Way undo | Header and primary action bar |
| Field outcome/finish flow including ECC missing-test blocker | Header and primary action bar, with blockers cross-referenced in Billing / Closeout or ECC / Compliance |
| Closeout readiness messaging and field/certs/invoice blockers | Billing / Closeout, with critical blocker summary in Header and primary action bar |
| External billing data-entry prompt and complete action | Billing / Closeout |
| Internal invoice summary, draft create, replacement invoice prompt, invoice charges, issue, send/resend, void, payment tracking, delivery history | Billing / Closeout |
| Field billing proposal entry and review controls | Billing / Closeout |
| Supplemental invoice family summary and links | Billing / Closeout |
| Customer/account phone, text, email links | People & Responsibility |
| Billing recipient/access/role contact cards | People & Responsibility |
| Contractor assignment/relationship controls | People & Responsibility; ECC contractor correction context also appears in ECC / Compliance |
| Contact logging quick actions and contact attempt history | Quick actions in People & Responsibility or Job Memory / Notes Hub; full attempt history in Records Workspace |
| Team assignment list, add assignee, set primary, remove assignee | People & Responsibility |
| Service location preview, directions/search, correct address, add new location, change location form and invoice-history warning | Place & Work |
| Visit Reason, Customer Concern, Intake Notes, Work Summary | Job Brief |
| Work Items editor, primary items, companion service items, promoted service job links, Create Service Follow-Up | Primary Work |
| Permit Quick Ref and full Permit Details with number/jurisdiction/date | ECC / Compliance; full edit/details also preserved in Records Workspace/Job Details target panel |
| ECC Summary latest run/result/date and tests link paths | ECC / Compliance; full record summary preserved in Records Workspace |
| ECC retest ready, retest scheduling, linked retest continuation, correction review resolution | ECC / Compliance |
| Contractor Report Panel for failed/pending-info contractor correction context | ECC / Compliance |
| Shared Notes composer/history and internal notes composer/history | Job Memory / Notes Hub; full histories also available in Records Workspace |
| Timeline and job history summary | Records Workspace |
| Attachments launcher, attachment list, and full attachments link | Records Workspace |
| Equipment list/edit/create and Manage Equipment link | Records Workspace |
| Follow Up edit fields and Follow-Up History | Follow-up / Service Chain for active follow-up; full history in Records Workspace |
| Service Chain empty state, workflow guidance, milestones, linked visits, handoff/rater controls | Follow-up / Service Chain; full detail in Records Workspace with `#service-chain` preserved |
| Maintenance agreement visit count and suggested/confirmed next due date controls | Follow-up / Service Chain |
| Admin tools: archive and cancel | Admin / Danger Zone |
| Mobile-only sections and IDs: mobile header/actions, mobile work scope, mobile notes hub, mobile tools, mobile attention strips | Protected unchanged; excluded from desktop V2 placement except for shared dependency awareness |

## 6. Notes strategy

Notes are first-class working context. V2 should make Job Memory a visible desktop zone near the top, not a small right-rail afterthought and not only a historical record.

Top Job Memory preview should show:

- Latest internal note activity for non-ECC jobs.
- Latest shared/internal/contractor/correction note activity for ECC jobs, matching current preview logic.
- Note count.
- Latest contact attempt summary where available.
- Internal note composer entry.
- Shared note composer entry when shared notes are available.
- Note save and mention banners.

Full records/history should preserve:

- Internal notes history through `DeferredInternalNotesBody`.
- Shared notes history through `DeferredSharedNotesBody`.
- Contractor notes and contractor correction submissions.
- Customer contact attempt history through `DeferredCustomerAttemptsHistory`.
- Timeline events through `DeferredTimelineBody`.
- Job History Summary inside timeline.
- Attachment-related timeline entries and event details.

Audience separation rules:

- Internal notes remain team-only.
- Shared notes remain contractor-visible.
- Contractor/correction notes remain distinct from internal notes.
- Contact attempts are communication history, not shared notes.
- Timeline is canonical activity history, not the working note composer.

Implementation rules:

- Do not change note event types.
- Do not change note form field names.
- Do not rename or remove note anchors without redirect/backward compatibility.
- Do not deduplicate note surfaces by deleting one; first implementation may visually group them but must keep all current functions available.

## 7. Job Brief strategy

Visit Reason becomes the visual Job Brief, but the source fields stay separate.

The Job Brief should include:

- Visit Reason as the primary readable statement.
- Customer Concern when `job.title` is distinct from Visit Reason.
- Intake Notes when `job.job_notes` is distinct from Visit Reason.
- Work Summary when `visit_scope_summary` is distinct from Visit Reason and Intake Notes.
- Service Details edit entry for service type, visit type, reason for visit, and visit outcome.
- A clear path to Primary Work / Work Items.

Preservation rules:

- Do not save multiple brief fields into one new field.
- Do not hide Customer Concern because it appears similar to Visit Reason.
- Do not hide Intake Notes because they appear similar to Work Summary.
- Do not hide Work Summary because Work Items exist.
- Do not use invoice charge lines as the work-to-perform source.
- Keep `updateJobVisitScopeFromForm` only on the surfaces where it is already used until a later source-of-truth slice.
- Keep `updateJobServiceContractFromForm` for Service Details.

## 8. Records Workspace strategy

V2 should replace the current visual pill/grid concept with grouped desktop records sections. The target outcome is a records workspace that reads like an operations file cabinet rather than a tile launcher.

Suggested grouped records sections:

- Job Controls: `#edit-job`, `#job-status`, `#follow-up`.
- Work Records: `#job-record-equipment`, `#job-record-attachments`.
- Communication Records: `#shared-notes`, `#job-record-follow-up-history`.
- Activity Records: `#job-record-timeline`.
- Service Records: `#service-chain`.
- Compliance Records: ECC Summary and Permit Details.
- Admin Records: Admin / Danger Zone, still gated.

Compatibility contract:

- Preserve existing hash target IDs and current panel IDs in the first implementation.
- Preserve `data-record-panel` behavior or provide a compatible replacement that supports current anchors.
- Preserve post-submit anchors in `return_to` hidden fields.
- Preserve direct links to `/jobs/[id]/attachments`, `/jobs/[id]/info?f=equipment`, `/jobs/[id]/invoice#invoice-workspace`, `/jobs/[id]/tests`, service jobs, customers, and locations.
- Any future rename of an anchor requires an explicit redirect/backward-compatibility plan and mobile regression pass.

## 9. Mobile protection rules

Do not edit these shared components/actions/booleans in a desktop V2 implementation slice without a mobile regression pass:

- `app/jobs/[id]/page.tsx` route-level data reads, booleans, imports, action wiring, and form field names.
- `VisitScopeJobDetailForm`.
- `VisitScopeBuilder`.
- `JobLocationPreview`.
- `ContactLoggingQuickActions`.
- `DeferredInternalNoteMentionComposer`.
- `DeferredInternalNotesBody`.
- `DeferredSharedNotesBody`.
- `DeferredTimelineBody`.
- `DeferredCustomerAttemptsHistory`.
- `FieldBillingSummary`.
- `InternalInvoiceLineItemsTable`.
- `MarkVisitCountedActionButton`.
- `ConfirmNextDueDateActionButton`.
- `RoleContactsCard`.
- `SubmitButton` and `ImmediateSubmitButton` behavior.
- `showInternalInvoicePanel`.
- `showExternalDataEntryPrompt`.
- `showSharedNotesCard`.
- `activeWaitingState`.
- `canShowWaitingReleaseQuickAction`.
- `showMobileInvoiceOpenAttention`.
- `markVisitCountedLinkId`.
- `suggestedNextDueProjection`.
- `internalInvoiceTruth`.
- `fieldBillingCapabilities`.
- `visitScopeItemsJsonForInlineEdit`.
- `narrativeScopeJobIds`.
- Current mobile IDs and anchors: `mobile-work-scope`, `mobile-visit-reason-card`, `mobile-notes-hub`, `mobile-internal-notes`, `mobile-shared-notes`, `mobile-tools`, `mobile-invoice-summary-card`.

Mobile protection acceptance rule: a desktop V2 slice passes only if mobile JSX and mobile-visible shared behavior are intentionally untouched or explicitly tested after a deliberate shared change.

## 10. Implementation sequencing recommendation

1. Commit blueprint.

   Commit this document as the agreed desktop V2 layout contract before changing product code.

2. Extract desktop legacy layout with no visual change.

   Create a desktop-only legacy layout boundary from the current inline desktop JSX. Keep rendered output, props, actions, IDs, data reads, and mobile untouched. This gives V2 a safer swap point.

3. Add desktop V2 shell behind preview switch.

   Add a desktop-only preview switch or feature flag that chooses between legacy desktop and V2 desktop shell. Keep mobile routed to the existing layout. The shell should consume existing props and components.

4. Build V2 using existing components.

   Place existing components and inline sections into V2 zones. Do not refactor server actions, helpers, source-of-truth logic, or schemas. Do not change shared components unless the slice explicitly includes mobile regression.

5. Run parity checks.

   Compare legacy desktop and V2 desktop against the do-not-lose checklist. Check anchors, forms, hidden panels, role gates, state gates, and mobile no-change. Run targeted tests only after code changes are introduced in later slices.

## 11. Desktop acceptance checklist

- Global alert strip shows every existing route-level banner/query-param outcome.
- Header includes job identity, job reference, status/lifecycle summaries, schedule context, and primary field actions.
- Field status actions and On the Way undo remain available under existing gates.
- Field outcome/finish flow remains available with ECC missing-test blocker intact.
- Job Brief shows Visit Reason, Customer Concern, Intake Notes, and Work Summary as distinct surfaces.
- Service Details edit remains available.
- Job Memory / Notes Hub includes current note previews, internal notes, shared notes, note banners, and composer entry points.
- Contact attempts are loggable and contact attempt history remains accessible.
- People & Responsibility includes customer/account links, role contacts, contractor context, and team assignment controls.
- Place & Work includes map/address, directions/search, correct address, add new location, change location, and invoice-history warning.
- Primary Work includes Work Items editor, primary items, companion service items, promoted links, and Create Service Follow-Up.
- Billing / Closeout includes external billing prompt, internal invoice summary/workspace entry, invoice lifecycle controls, payment tracking, delivery history, field charge proposals, supplemental invoices, and closeout blockers.
- ECC / Compliance includes permit quick ref, permit details, ECC summary, tests links, certs/permit blockers, retest controls, correction review, linked retest continuation, and contractor report.
- Follow-up / Service Chain includes return visit, callback visit, part/approval progress actions, release/re-evaluate, follow-up fields/history, service-chain empty state, milestones, linked visits, and handoff/rater controls.
- Records Workspace preserves all current target panels and direct links.
- Admin / Danger Zone preserves archive/cancel with existing gates.
- Existing hash target IDs and `return_to` anchors are preserved.
- No mobile layout, mobile IDs, mobile-only sections, or mobile behavior changes.
- No route data read, server action, helper, permission, schema, or source-of-truth changes in the first visual implementation.

## 12. Explicit non-actions

- This blueprint does not implement V2.
- This blueprint does not approve product code changes.
- This blueprint does not approve JSX extraction by itself.
- This blueprint does not approve component refactors.
- This blueprint does not approve behavior changes.
- This blueprint does not approve server action/helper/source-of-truth changes.
- This blueprint does not approve schema, migration, env, Supabase, Stripe, QBO, SMS, RLS/auth, permission, or data changes.
- This blueprint does not approve deleting, removing, or permanently hiding any tool, card, action, field, drawer, tab, collapsible, note, record, hidden panel, or mobile surface.
- This blueprint does not change the mobile freeze.

