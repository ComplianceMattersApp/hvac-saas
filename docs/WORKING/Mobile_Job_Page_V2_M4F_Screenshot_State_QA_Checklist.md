# Mobile Job Page V2 M4-F Screenshot / State QA Checklist

Status: Phase M4-F QA checklist only  
Date: 2026-06-26  
Scope: preview-only internal mobile `/jobs/[id]?mobileLayout=v2`

## Purpose

Use this checklist for owner screenshot review before any env-flagged default rollout of Mobile Job Page V2.

This document does not authorize promotion. Default `/jobs/[id]` must continue to render `MobileJobDetailCurrent`, and desktop must remain unchanged.

## Capture Setup

Capture each selected fixture at:

- 360px mobile width
- 390px mobile width
- 430px mobile width

Use the preview URL:

```text
/jobs/{job_id}?mobileLayout=v2
```

For any CTA that intentionally exits preview to a current mobile anchor, confirm the destination URL omits `mobileLayout=v2`, for example:

```text
/jobs/{job_id}?tab=ops#mobile-next-service-action
```

## Core Invariants For Every Screenshot

Check every screenshot against these invariants:

- [ ] Hero title is readable.
- [ ] Hero title does not repeat a redundant city suffix when the address already shows the city, for example `ECC alteration`, not `ECC alteration - Stockton`.
- [ ] Photo/address area loads or fails gracefully.
- [ ] Customer remains visible.
- [ ] Contractor remains visible when present.
- [ ] Schedule remains visible.
- [ ] Call, Text, and Navigate remain visible or disabled honestly when unavailable.
- [ ] Lifecycle rail is readable.
- [ ] Lifecycle rail uses checkmarks, active dot/ring, and empty circles, not letters.
- [ ] There is one dominant Next Step.
- [ ] Closed, cancelled, archived, linked-parent, and other read-only jobs do not show active field action language.
- [ ] Work/Compliance context appears before Billing / Closeout.
- [ ] Evidence & Notes rows are readable, full-width, and tappable.
- [ ] Note badges/signals are grounded in loaded note signals only.
- [ ] More Details / Tools is collapsed by default.
- [ ] More Details / Tools expands into direct grouped tool rows.
- [ ] Service Plan appears inside expanded More Details / Tools.
- [ ] Behavior-heavy CTAs use real routes/workspaces or standard-current-view anchors that omit `mobileLayout=v2`.
- [ ] No CTA points to a missing in-preview anchor while staying on the preview route.
- [ ] No horizontal overflow at 360px, 390px, or 430px.

## CTA Safety Targets

Real routes/workspaces that may remain direct:

- `/jobs/{id}/info?f=equipment`
- `/jobs/{id}/tests`
- `/jobs/{id}/attachments`
- `/customers/{id}?tab=service-plans`
- Existing estimate/customer/location routes when present

Standard-current-view anchors that should omit `mobileLayout=v2`:

- `mobile-work-scope`
- `mobile-tools`
- `mobile-internal-notes`
- `mobile-shared-notes`
- `mobile-invoice-summary-card`
- `mobile-next-service-action`
- `mobile-follow-up-job`
- `mobile-permit-info`
- `mobile-ecc-permit-needed-action`
- `mobile-tools-timeline`

## ECC QA Matrix

| State | Example job URL / fixture | 360 screenshot pass | 390 screenshot pass | 430 screenshot pass | Next Step copy expected | Primary CTA expected | Work/Compliance section expected | Billing/Closeout expected | More Details expected | Notes / issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ECC scheduled/open | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | Normal lifecycle progression such as `Head to the job`; not tests unless required-test truth is active. | Inline lifecycle action or safe standard-view fallback. | `Compliance Work` visible with Equipment, ECC Tests, Permit Information. | Quiet: `No billing action needed yet.` | Collapsed by default; expanded rows include Service Plan, Permit Information, Job Status Tools, Timeline / History. | Confirm billing does not lead. |
| ECC on the way | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Start the visit` / Mark In Progress posture. | Inline lifecycle action if safe; Undo On the Way remains standard/current tooling. | Compliance Work visible as supporting context. | Quiet unless a real gate says otherwise. | Collapsed by default; expanded direct tool rows. | Confirm tests do not outrank lifecycle unless required. |
| ECC in progress | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Finish field visit` unless required tests are active. | `Mark Field Work Complete` when generic completion branch applies, or tests workspace if required. | Compliance Work prominent. | Quiet while field/compliance work is active. | Collapsed by default. | Confirm no invoice-led active ECC work. |
| ECC required tests active | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Complete required tests`. | `Open tests` to `/jobs/{id}/tests`. | ECC Tests row available; Equipment and Permit Information remain available. | Quiet. | Collapsed by default. | Confirm required-test truth is grounded, not just test surface availability. |
| ECC permit needed after tests complete | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Permit needed`. Helper should read `Add or review permit details before closeout.` | `Review permit info`, routed to standard current permit action/area. | Compliance Work visible; Permit Information row shows needed/status posture. | Quiet or closeout-aware, but permit remains the current blocker. | Expanded tools include Permit Information. | Do not duplicate permit form in preview. |
| ECC failed / pending office review | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Correction or retest needed` or `Office review needed`, depending on existing state. | Safe standard-current-view action area link. | Compliance Work available without implying normal active work. | Not invoice-led unless existing gates require billing after review. | Tools/history reachable. | Capture failed reason banner/detail if present. |
| ECC retest needed | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Retest needed`. | `Open retest actions` or current retest scheduling action area. | Compliance Work available. | Quiet unless closeout/billing truth says otherwise. | Tools/history reachable. | Do not imply original failed job is a normal active visit. |
| ECC linked retest parent | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | Linked/passive wording such as `Linked retest job exists`. | Review retest history or linked/current standard view target. | Compliance Work may remain visible but should not imply active parent work. | Review/history posture. | Tools/history reachable. | Confirm active child context if existing props expose it. |
| ECC field complete / closeout pending | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Review compliance closeout`, `Finish certification items`, `Closeout review`, or blocker-specific copy from existing gates. | Standard current closeout action area. | Compliance Work remains before Billing / Closeout. | Closeout review only when existing gates require it. | Tools/history reachable. | Confirm certs, permit, and billing order is not contradictory. |
| ECC closed/cancelled/archived | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | Read-only/history language such as `Job closed`, `Job cancelled`, or `Archived`. | `Review job history` or standard tools/history link. | Compliance Work not presented as active field work. | Read-only review/history posture. | Tools/history reachable. | Use if a non-redirecting fixture exists. |

## Service QA Matrix

| State | Example job URL / fixture | 360 screenshot pass | 390 screenshot pass | 430 screenshot pass | Next Step copy expected | Primary CTA expected | Work/Compliance section expected | Billing/Closeout expected | More Details expected | Notes / issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Service scheduled/open with Work to Do | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | Normal lifecycle progression such as `Head to the job`. | Inline lifecycle action or safe standard-view fallback. | `Work to Do` prominent with Visit Scope / Work Items. | Quiet unless existing gates say otherwise. | Collapsed by default; Service Plan inside expanded tools. | Confirm Work Items do not read as invoice charges. |
| Service in progress | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Finish field visit`. Helper: `When the field work is done, mark this visit complete.` | `Mark Field Work Complete` if generic field-completion branch applies. | Work to Do remains before Billing / Closeout. | Quiet unless field-complete/billing gates apply. | Collapsed by default. | Confirm no FieldOutcomePanel form is duplicated. |
| Service waiting / pending info | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Waiting on info`, `Waiting`, or grounded waiting label. | `Open waiting tools` or standard current action area. | Work lane remains visible for context. | Quiet unless separately gated. | Tools/history reachable. | Do not show normal Mark On the Way / Start Visit if blocked. |
| Service parts needed / approval needed | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Waiting on part` or `Approval needed` when existing state supports it. | Standard current waiting/tools action area. | Work lane remains visible for context. | Quiet unless separately gated. | Tools/history reachable. | Use if fixture exists. |
| Service unable to complete / follow-up needed | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | Service follow-up wording from existing progress state. | Standard current follow-up action area. | Work lane remains visible. | Quiet unless closeout/billing gates apply. | Create Return Visit appears in expanded tools when gated. | Do not imply normal active field progression. |
| Service field complete / billing needed | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `Billing review`, `Review invoice`, or `Review service closeout` depending on existing gates. | Standard invoice/current billing area; do not duplicate invoice form. | `Work Performed` visible before Billing / Closeout. | Prominent enough to identify invoice/closeout responsibility. | Tools/history reachable. | Confirm Work Items remain operational truth, not invoice charges. |
| Service external billing | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | `External billing review`. Helper: `Confirm external billing before closeout.` | `Review external billing`, routed to standard current action area. | Work Performed remains visible before Billing / Closeout. | External billing review prominent. | Tools/history reachable. | Do not change external billing truth. |
| Service closed/cancelled/archived | `TODO: /jobs/{id}?mobileLayout=v2` | [ ] | [ ] | [ ] | Read-only/history language such as `Job closed`, `Job cancelled`, or `Archived`. | `Review job history` or tools/history link. | Work lane should not imply active field work. | Read-only review/history posture. | Tools/history reachable. | Use if a non-redirecting fixture exists. |

## Per-State Screenshot Notes

For each state, capture:

- First viewport at 390px.
- First viewport plus Work/Compliance section at 390px when not fully visible above the fold.
- Evidence & Notes section at 360px if badges or long labels are present.
- More Details / Tools collapsed at 390px.
- More Details / Tools expanded at 390px.
- CTA destination URL for any behavior-heavy action.

## Viewport-Specific Checks

### 360px

- [ ] No horizontal scroll.
- [ ] Hero title wraps cleanly without tiny text.
- [ ] Address overlay does not hide Call/Text/Navigate.
- [ ] Lifecycle labels do not collide.
- [ ] Next Step title and CTA fit.
- [ ] Evidence & Notes badges do not overlap row labels.
- [ ] More Details / Tools summary fits without exposing nested rows while collapsed.

### 390px

- [ ] Owner-review baseline looks polished.
- [ ] First viewport hierarchy is clear: hero, lifecycle, Next Step.
- [ ] Work/Compliance appears before Billing / Closeout.
- [ ] Billing / Closeout does not visually dominate unless it is the current blocker.
- [ ] Service Plan is visible only after expanding More Details / Tools.

### 430px

- [ ] Layout does not feel sparse or reorder unexpectedly.
- [ ] Hero/address area remains framed correctly.
- [ ] Tool rows remain direct rows, not nested under an intermediate `Job Tools` launcher.
- [ ] Long customer, contractor, or address strings wrap cleanly.

## Negative Checks

The preview must not:

- [ ] Take over default `/jobs/[id]`.
- [ ] Change desktop rendering.
- [ ] Lead active ECC field/compliance work with invoice/billing.
- [ ] Show `Complete required tests` unless required-test truth is active.
- [ ] Show `Permit needed` before required tests when required tests are still active.
- [ ] Show active field language on closed/cancelled/archived/read-only jobs.
- [ ] Treat Work Items as invoice charges.
- [ ] Duplicate invoice, permit, retest, waiting, Visit Scope, Field Outcome, or Service Plan mutation forms.
- [ ] Show fabricated note unread/new state.
- [ ] Add attachment counts without already-loaded count data.
- [ ] Keep `mobileLayout=v2` in standard-current-view anchor destinations.

## Recommended Owner Screenshot Packet

Minimum packet:

- ECC scheduled/open at 390px.
- ECC in progress at 390px.
- ECC required tests active at 390px.
- ECC permit needed after tests complete at 390px.
- ECC failed / pending office review at 390px.
- ECC retest needed at 390px.
- ECC linked retest parent at 390px.
- ECC closeout pending at 390px.
- Service scheduled/open with Work to Do at 390px.
- Service in progress at 390px.
- Service waiting/pending info at 390px.
- Service field complete / billing needed at 390px.
- Service external billing at 390px.
- Closed/cancelled/archived state at 390px if fixture exists.
- One normal ECC state at 360px, 390px, and 430px.
- One Service Work Items state at 360px, 390px, and 430px.
- One exception/read-only state at 360px and 390px.
- More Details / Tools collapsed and expanded.

## Promotion Decision

After screenshot review, choose one:

### Ready For Env-Flagged Internal Default

Use only if all are true:

- [ ] Every required state has at least a 390px passing screenshot.
- [ ] At least one ECC, one Service, and one read-only/exception state pass at 360px, 390px, and 430px.
- [ ] No default route takeover.
- [ ] No desktop regression.
- [ ] No dead/missing CTAs.
- [ ] Owner accepts standard-current-view escapes for behavior-heavy forms.
- [ ] Owner accepts that some action families are not directly promoted into V2 yet.

### Needs One More Polish Slice

Use if:

- [ ] Preview is semantically safe, but spacing, copy, wrapping, CTA clarity, or screenshot polish needs another small preview-only pass.
- [ ] CTAs are safe, but owner wants clearer wording around standard-view escapes.
- [ ] A state reads correctly but not confidently enough for an internal default.

### Keep Query-Param Preview Only

Use if any are true:

- [ ] Any active state implies false workflow truth.
- [ ] Any read-only state shows active field action language.
- [ ] Any behavior-heavy CTA is dead or stays on preview while targeting a missing anchor.
- [ ] Billing leads active ECC compliance work incorrectly.
- [ ] Required tests, permit, external billing, or closeout blockers appear in the wrong order.
- [ ] Owner requires direct V2 forms before default rollout.

## Final QA Sign-Off

Reviewer:

Date:

Decision:

Notes:

