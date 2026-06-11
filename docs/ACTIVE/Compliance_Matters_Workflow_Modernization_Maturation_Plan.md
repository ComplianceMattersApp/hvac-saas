# Compliance Matters Software — Workflow Modernization / Real-World Operations Maturation Plan

Status: ACTIVE PLANNING / MODEL LOCK CANDIDATE  
Recommended destination: `docs/ACTIVE/Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`  
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md`, `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`, and existing payment/ECC/service-case/source-of-truth specs.  
Mode: Audit-first planning document. No implementation, schema, migration, Supabase, Stripe, QBO, SMS, production, or feature-flag changes are authorized by this document by itself.

---

## 1. Purpose

This document captures the newly clarified real-world workflow direction for Compliance Matters Software.

The app is moving from a set of strong working surfaces into a more mature guided operating system where field work, office review, exceptions, callbacks, return visits, ECC cert closeout, invoice creation, field charges, payment collection, and office verification work together as one process.

This is not a cosmetic polish pass. It is a workflow modernization program.

The goal is to improve the app from field intake through closeout without weakening the existing truth model. Large modifications, visual changes, and refactors are acceptable if audits prove they are necessary, but the work must be done in stages and controlled slices to reduce drift.

---

## 2. North Star

The product should behave like this:

> Field users do field work, capture evidence naturally, and submit simple outcomes. The system organizes the context and routes the next responsibility. Office/admin resolves exceptions, callbacks, returns, billing, and verification. Financial truth stays protected. Job and service history remains connected and honest.

Plain-language operating rules:

- Techs and raters should not manage company backlog from `My Work`.
- `My Work` should mean scheduled/actionable assigned field work.
- Field users should not be forced into heavy repetitive finish forms.
- Notes/photos/diagnostics should be captured naturally during the job.
- Final outcome should be a lightweight routing action, not a full re-documentation burden.
- Office/admin/dispatch should own exceptions, return scheduling, callback review, on-hold work, and billing decisions.
- ECC/rater users should retain technical/cert closeout responsibility where assigned.
- Billing/payment truth should remain role-gated and verification-backed.
- Pricebook should help standardize charges but must not block startup usage or field payment collection.
- Every workflow improvement must preserve or improve perceived performance.

---

## 3. Current source-of-truth alignment

This plan should build on the current architecture rather than replace it casually.

Known source-of-truth concepts to preserve:

- `service_cases` act as the continuity/history container.
- `jobs` represent visit/work execution units.
- `job_events` remain narrative/timeline truth.
- ECC/test truth remains in ECC-specific test records and test outcomes.
- `jobs.ops_status` and related fields are projection/routing/display truth, not free-for-all status sprawl.
- Work Items / Visit Scope are operational work truth.
- Invoice line items are billed/commercial truth snapshots.
- Pricebook items are reusable catalog/default data.
- Stripe/card payment truth comes from verified processor/webhook paths.
- Check/cash/other field collection needs office verification before becoming final collected-money truth.

The modernization effort should improve workflow and user experience while protecting these boundaries.

---

## 4. Role and responsibility model

### 4.1 Field users

Field users include technicians, raters, installers, cleaners, and other dispatched workers.

They should see:

- scheduled jobs assigned to them
- active/started jobs assigned to them
- scheduled return visits or callbacks assigned to them
- ECC cert closeout where they are responsible
- field payment or field charge actions only when allowed by company/user permission

They should not automatically see:

- unscheduled return-needed backlog
- generic office exception backlog
- waiting/on-hold items that office must resolve
- billing-needed queues
- payment verification queues
- failed jobs waiting for dispatch or office decision
- company-level closeout backlog

### 4.2 Office / dispatch / admin

Office, dispatcher, admin, or owner users should own:

- exception review
- callback intake/review
- return visit scheduling
- waiting/on-hold monitoring
- customer contact needs
- contractor/rater handoff visibility
- queue ownership and dispatch decisions

### 4.3 Billing / AR / owner / admin

Financially authorized users should own:

- invoice creation/issue/review where required
- payment verification for check/cash/other
- manual payment recording/finalization
- financial correction/reversal/void/refund authority where supported
- payment register/reporting/export visibility

### 4.4 ECC / rater role

ECC/rater users should retain responsibility for ECC technical/paperwork work where assigned, including cert closeout actions such as certs sent.

Important distinction:

- Cert closeout is technical/paperwork responsibility.
- Invoice/payment closeout is financial responsibility.

Admin/Owner can see both.

### 4.5 ECC guided workflow separation

ECC guided workflow is locked separately in `docs/ACTIVE/ECC_Guided_Workflow_Separation_Model_Lock.md`.
The current service/ECC guided maturation pass is closed in `docs/ACTIVE/Guided_Workflow_Maturation_Closeout.md`.

Service follow-up and ECC workflow must not be blended:

- Service uses Materials Needed / Approval Needed / Other.
- Service continuation happens through linked return visits.
- Parent service visits become historical/continued after child continuation exists.
- Service follow-up progress uses Part Ordered / Part Arrived for Materials Needed and Approval Received for Approval Needed.
- Ready service follow-ups can Add to Scheduling Queue or Schedule Return Visit Now.
- ECC uses Permit Needed, Failed / Correction Required, Corrections Submitted / Under Review, Retest Ready, linked retest jobs, ECC handoff, and cert closeout blockers.
- ECC retests are not service return visits.
- ECC failed state comes from ECC test truth, not broad service exception routing.
- Retest Ready Requested is contractor/event signal only; Retest Ready is internal confirmation.
- Move to Needs Scheduling creates the linked retest child and makes the original failed/correction job historical/passive.
- Invoice/payment/no-charge truth is separate from ECC cert closeout truth.
- Invoice send may remain allowed while Permit Needed, Failed / Correction Required, Corrections Submitted / Under Review, or Retest Ready blocks cert closeout.

---

## 5. Core workflow language

### 5.1 Failed

Use `Failed` narrowly.

Recommended meaning:

> A real ECC/test failure occurred.

Examples:

- duct leakage failed
- refrigerant charge test failed
- airflow test failed
- other formal ECC/HERS/test failure

Do not turn `Failed` into the broad junk-drawer status for every job problem.

### 5.2 Exception

Use `Exception` broadly but intelligently.

Recommended meaning:

> Normal workflow was interrupted and office/dispatch/admin needs to decide what happens next.

Examples:

- parts needed
- customer not home
- access issue
- unsafe condition
- wrong equipment/location
- extra work discovered
- unable to complete
- customer approval needed
- office review needed

User-facing cards should usually show the real reason, not only the generic word `Exception`.

Examples:

- `Parts Needed`
- `Waiting on Customer`
- `Access Issue`
- `Approval Needed`
- `Office Review Needed`

### 5.3 Return Needed

Recommended meaning:

> The original work is not fully resolved yet and another visit is needed to continue or complete it.

Examples:

- part must be ordered
- access issue prevented completion
- original scope still incomplete
- customer approval is needed before return
- another visit is required to finish the current job/service case

Important rule:

> Return Needed should not appear in a technician's My Work until dispatch schedules and assigns the return visit.

### 5.4 Callback

Recommended meaning:

> The prior work was believed complete or already closed, then the customer reported the same/related problem later.

The original job should remain historically complete. The callback should become a linked callback visit or linked callback job under the same service history/service case.

Callback outcomes may include:

- same issue returned
- different/new issue found
- unable to reproduce
- parts needed
- repaired same visit
- estimate needed
- warranty/no-charge/courtesy/billable decision pending

Office/admin should decide final business posture.

### 5.5 On Hold / Waiting

Recommended meaning:

> The job/service case is intentionally paused because something external must happen.

Examples:

- waiting on part
- waiting on customer approval
- waiting on access
- waiting on permit/info
- waiting on contractor correction
- waiting on office/billing decision

On-hold/waiting should be visible to office/admin queues and should not clutter field My Work unless a scheduled action is assigned.

---

## 6. Field finish flow principle

The finish step should be lightweight.

Recommended user-facing question:

> What happened today?

Possible outcome buttons:

- Complete
- Parts Needed
- Customer / Access Issue
- Unable to Complete
- Need Return Visit
- Different Issue Found
- Failed Test (ECC/test only)
- Other Exception

The finish flow should not require the tech to re-enter diagnostics/photos/notes already captured during the visit.

Recommended behavior:

- show a quick summary of already-captured context when useful
- allow optional final note
- route to office/dispatch/admin based on outcome
- remove from tech My Work when field responsibility is done
- only return to tech My Work if dispatch schedules/assigns additional work

---

## 7. Parts-needed workflow

Scenario: Tech diagnoses a service issue and a part must be ordered.

Recommended workflow:

1. Tech captures notes/photos/diagnostics during the visit.
2. Tech finishes visit with `Parts Needed`.
3. Job leaves tech My Work.
4. Office sees `Parts Needed` or `Exception — Parts Needed` queue/card.
5. Office decides:
   - order part
   - customer approval needed
   - estimate needed
   - return visit needed
   - no return needed / close differently
6. If part is ordered, job becomes `On Hold — Waiting on Part`.
7. When part is available, dispatch schedules a return visit.
8. Only then does the assigned tech see it again in My Work.

---

## 8. Return visit workflow

Return visit is for continuation of unresolved work, not a completed job that later failed.

Recommended workflow:

1. Field outcome indicates return may be needed.
2. Job enters office/dispatch queue, not technician backlog.
3. Office reviews context and decides whether a return is required.
4. If return required, office schedules a linked return visit under the same service case/history.
5. Assigned tech sees it only after it is scheduled.
6. Timeline shows original visit, return need, scheduled return, return outcome, and closeout.

---

## 9. Callback workflow

Callback is separate from return visit.

Recommended workflow:

1. Customer calls back after work was believed complete.
2. Office opens original customer/job/service case.
3. Office creates a related callback.
4. If appointment is added during intake, system treats it as scheduled callback visit.
5. If no appointment is added, system treats it as callback reported / needs review or scheduling.
6. Original job remains historically complete.
7. Callback visit links to original job/service history.
8. Tech sees callback only once scheduled/assigned.
9. Tech performs callback and selects lightweight outcome.
10. Office decides final posture:
    - warranty / no charge
    - billable new issue
    - courtesy / goodwill
    - estimate needed
    - return needed
    - close

Important rule:

> A callback should not rewrite the original job history. It should create a linked follow-up in the same service history.

---

## 10. Callback scenario: different issue found

Scenario: Customer calls back after a completed repair. Tech returns and finds a different issue not covered by the original repair.

Recommended workflow:

1. Original job stays completed.
2. Callback visit remains linked to original history.
3. Tech documents finding.
4. Tech chooses `Different Issue Found` or `New Issue Found`.
5. If repair is not completed, route to office/admin as billing/estimate review.
6. If tech has part and repairs same visit, mark `Different Issue — Repaired Today`.
7. Office/admin decides final business posture:
   - billable
   - estimate needed
   - courtesy/no-charge
   - warranty override if chosen
8. Do not treat the original job as failed by default.

---

## 11. Contractor ⇄ rater handoff lens

This modernization must include contractor/rater handoff as an audit lens.

Two handoff postures matter:

### 11.1 One-sided contractor/rater visibility

Contractor submits work/request or correction signals. Internal queues retain action ownership. Contractor receives contractor-safe visibility.

### 11.2 Both contractor and rater use the platform

Closed-loop chain:

1. Contractor completes install.
2. Contractor sends/queues work to rater for ECC testing.
3. Rater schedules/performs test.
4. Rater sends result/status back to contractor.
5. If passed/certs handled, contractor is guided to final inspection/next closeout step.
6. If failed, contractor receives correction guidance.
7. Contractor completes correction and signals retest-ready.
8. Rater/office schedules retest.

Audit questions:

- Does contractor My Work clear after handoff?
- Does rater queue receive the right actionable item?
- Does failed ECC route correction responsibility to contractor safely?
- Does retest-ready become scheduling/office queue rather than immediate rater My Work clutter?
- Does passed/certs-sent status guide contractor to final inspection?
- Does the shared timeline show the full chain?

---

## 12. Field charges, invoice creation, and payment collection

### 12.1 Invoice creation principle

Invoice/charge creation is the bridge between field work and payment truth.

Recommended rule:

> Field work creates billing context. Invoice/charge creation creates billable truth. Payment follows billable truth.

### 12.2 Pricebook cannot be a startup dependency

Pricebook should help standardize charges but should not block field payment or field charge capture.

New customers often will not have a complete Pricebook. Field users may also run into unit-specific or unusual scenarios not covered by Pricebook.

### 12.3 Normal tech capability

Normal techs should be able to:

- select approved Pricebook items at locked/default pricing
- accept payment on an existing approved/issued invoice or approved charge
- launch card payment where allowed
- report check/cash/other collected
- submit non-card field payment for office verification

Normal techs should not be able to:

- modify Pricebook cost/price
- add manual/custom charges
- materially modify charge descriptions
- discount
- verify non-card money received
- void/reverse/refund/export financial data

### 12.4 Field Billing Enabled

`Field Billing Enabled` should be a per-user capability/permission, not a whole separate role.

A user with Field Billing Enabled can:

- modify descriptions/quantities/pricing where allowed
- add custom/manual charges
- enter phone-approved pricing
- use Pricebook plus custom charges
- collect payment after charge creation/approval

Still restricted:

- final verification of check/cash/other belongs to office/admin/billing
- refunds, reversals, voids, exports, corrections remain higher-authority financial actions

### 12.5 Payment method behavior

Card / Stripe:

- launch Stripe/payment flow
- app updates from processor/webhook truth
- tech does not manually mark card as paid

Check / cash / other:

- tech reports payment collected
- capture amount, method, reference/check number if relevant, note/photo if useful
- route to `Field Payment Verification Needed`
- office/admin/billing confirms receipt before final financial closeout

Important rule:

> A tech-reported check/cash payment should not disappear into a fully closed job until office verifies the money was received.

---

## 13. Field line-item / field charge UX priority

Adding line items/charges in the field is a major weak point to audit and redesign.

Goal:

> Make field charge entry fast, obvious, and mobile-friendly.

The field experience should feel like:

> What did you do or sell today?

Not:

> Build a complicated invoice while standing in a customer driveway.

Future audit should challenge:

- Pricebook search speed and clarity
- manual/custom charge entry
- quantity/description/price editing rules
- selected-item confirmation
- mobile layout and one-handed use
- Work Items vs Invoice Charges understanding
- how line items connect to payment
- whether the current form should be visually redesigned or refactored

---

## 14. Performance guardrails

Workflow maturity must not slow the app down.

Every slice should check:

- Does this add extra parent-page reads?
- Does this slow `My Work`, job detail, intake, Ops, or queues?
- Can this be a derived read model/projection instead of repeated heavy live computation?
- Can secondary details stream/defer until opened?
- Can queue cards use compact summaries?
- Can timeline/history remain deferred?
- Can forms use progressive disclosure instead of rendering everything?

Rule:

> Improve workflow experience boldly, but protect source-of-truth and performance carefully.

---

## 15. Form and UI autonomy

Intake, finish-visit forms, field charge forms, callback/return creation flows, and queue cards may be changed visually or refactored when needed.

Every touched form should be challenged:

- Is this field needed at this step?
- Can the system infer it?
- Can it become optional?
- Should it be office-owned instead of field-owned?
- Is this a dropdown when it should be a button/card?
- Is this repeating information already captured elsewhere?
- Does it help the guided workflow or create friction?

Avoid lipstick-on-a-pig fixes. If old form structure fights the new workflow, redesign the form.

---

## 16. Staged audit and implementation plan

### Stage 1 — Current workflow audit

Audit current behavior before implementation.

Questions:

- What puts a job in My Work today?
- What removes it?
- What statuses exist for failed, waiting, pending, blocked, incomplete, and closeout?
- What happens when a tech completes work but something is still needed?
- What queues currently see it?
- What queues should see it?

Deliverable:

- current-state map
- gap list
- no implementation

### Stage 2 — Exception / waiting / on-hold audit

Audit current exception-like states and waiting behavior.

Deliverable:

- recommendation to reuse existing fields, add exception metadata, or create a new exception model

### Stage 3 — Return visit and callback audit

Audit current linked-job, reschedule, return, callback, and service-case continuity behavior.

Deliverable:

- target return/callback model
- smallest implementation path

### Stage 4 — My Work / queue ownership cleanup

Separate field actionable work from office backlog.

Deliverable:

- role-aware visibility rules
- queue ownership model

### Stage 5 — Finish visit guided outcome flow

Redesign finish visit as a lightweight routing action.

Deliverable:

- guided outcome UI model
- smart context summary model

### Stage 6 — Office exception/return/callback queues

Create or refine office/admin queue surfaces.

Deliverable:

- compact queue cards
- clear reason labels
- role-aware visibility

### Stage 7 — ECC cert closeout visibility

Preserve ECC/rater cert action while keeping billing higher-authority.

Deliverable:

- certs-needed/certs-sent visibility and action model

### Stage 8 — Contractor ⇄ rater handoff audit/protection

Validate the internal/external handoff chain against the new queue model.

Deliverable:

- handoff protection plan or targeted improvements

### Stage 9 — Invoice creation / field charge audit

Audit current field-to-invoice and line-item experience.

Deliverable:

- field charge authority model
- Field Billing Enabled requirements
- Pricebook/manual charge path recommendation

### Stage 10 — Field line-item UX redesign

Redesign field charge/line-item entry for speed and clarity.

Deliverable:

- mobile-first field line-item UX plan

### Stage 11 — Field payment + office verification

Implement field payment collection safely.

Deliverable:

- card payment path
- non-card field payment reporting
- office verification queue

### Stage 12 — Timeline/history polish and final workflow smoke

Ensure all workflows leave clean history.

Deliverable:

- timeline visibility validation
- end-to-end smoke matrix
- docs closeout

---

## 17. First audit slice recommendation

Start with the safest and highest-leverage audit:

**Workflow Modernization Audit Slice A — My Work, Closeout, Exception, Return/Callback Current-State Map**

This slice should be audit-only.

It should not modify code, schema, data, env, Supabase, Stripe, QBO, SMS, feature flags, or production.

Expected output:

- how current `My Work` is populated
- how jobs leave `My Work`
- current closeout/exception/waiting/failed behavior
- current return/reschedule/callback behavior
- current service-case/linkage/timeline behavior
- current queue visibility by role
- current performance risks in these areas
- recommended implementation slices after audit

---

## 18. First agent prompt

Use the following prompt to begin the audit.

```text
We are starting Compliance Matters Software Workflow Modernization Audit Slice A.

Goal:
Perform an audit-only current-state map of how the app currently handles My Work, field completion, closeout, failed states, exception-like states, waiting/on-hold states, return visits, callback-like flows, service-case/job linkage, and queue visibility. This is preparation for a staged workflow modernization pass. Do not implement changes in this slice.

Context / north star:
We are maturing the app from isolated working surfaces into a guided real-world workflow system. Field users should see scheduled/actionable assigned field work, not office backlog. Techs and raters should capture notes/photos/diagnostics naturally during the visit, then submit lightweight outcomes. Office/admin/dispatch should own exceptions, waiting, return scheduling, callback review, billing, and payment verification. ECC/rater users should still own technical/cert closeout where assigned. Admin/Owner should see everything. Performance must not regress.

Required source docs to read first:
- docs/ACTIVE/Active Spine V4.0 Current.md
- docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md
- docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md
- docs/ACTIVE/Financial_Ledger_Payments_Register_V1_Model_Spec.md
- docs/ACTIVE/Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md
- Any existing service-case/job workflow docs that define service_cases, jobs, job_events, closeout queue, My Work, waiting states, contractor handoff, ECC test/failed behavior, callback, return visit, or linked job chains.

Audit scope:
1. Find the current code paths/components/helpers/actions that populate field user My Work or equivalent assigned-work surfaces.
2. Identify what job statuses/fields/events make work visible to a technician/rater today.
3. Identify what removes work from the field user's My Work today.
4. Map the current closeout queue and Ops queue logic.
5. Map current failed behavior, especially ECC failed test behavior.
6. Map current exception-like behavior, including blocked, pending, need info, on hold, waiting, unable to complete, or similar terms.
7. Map current return visit/reschedule/follow-up behavior.
8. Map current callback-like behavior, if any exists; distinguish from return-needed continuation work.
9. Map current service_case/job/job_events linkage and timeline behavior for multi-visit history.
10. Map contractor-to-rater and rater-to-contractor handoff paths where they touch failed tests, retest-ready, corrections, certs, contractor visibility, and guided next actions.
11. Identify which pages/forms/cards will likely need UX or guided-workflow review later.
12. Identify performance-sensitive areas where adding routing/queue logic could make the app slower.

Important boundaries:
- Audit only.
- No product code changes.
- No schema or migration changes.
- No Supabase data writes.
- No Stripe, QBO, SMS, or provider behavior changes.
- No feature flag or environment changes.
- Do not rename statuses or change behavior in this slice.
- Do not start broad refactors.

Expected deliverable:
Return a structured audit report with:
- Executive summary
- Files/components/helpers/actions reviewed
- Current My Work behavior map
- Current closeout/queue behavior map
- Current failed/exception/waiting behavior map
- Current return/callback/linkage behavior map
- Contractor/rater handoff observations
- Performance risk observations
- Gaps against the new workflow north star
- Recommended staged implementation slices, smallest safe slice first
- Explicit non-actions confirming no code/schema/data/provider/env changes were made

Validation:
Because this is audit-only, run only safe read-only commands and static searches. If you run tests or typecheck for baseline confidence, report them separately. Do not change files unless explicitly asked after the audit is reviewed.
```

---

## 19. Non-implementation confirmation

This document does not authorize implementation by itself.

Not authorized by this document alone:

- no product code changes
- no schema changes
- no migrations
- no Supabase commands or data writes
- no production changes
- no env/feature flag changes
- no Stripe/payment behavior changes
- no QBO behavior changes
- no SMS/provider behavior changes
- no customer portal behavior changes
- no role/permission implementation
- no queue/status behavior changes
- no broad refactor without audit output and explicit approval
