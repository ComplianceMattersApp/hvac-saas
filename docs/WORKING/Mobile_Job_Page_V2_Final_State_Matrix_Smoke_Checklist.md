# Mobile Job Page V2 Final State-Matrix Smoke Checklist

Status: READINESS MONITORING CHECKLIST - RECOMMENDED / NOT LAUNCH-BLOCKING
Date: 2026-07-06
Scope: internal mobile `/jobs/[id]` canonical V2 default with current-mobile fallback

## Purpose

This checklist captures recommended Mobile Job V2 state-matrix monitoring evidence. Mobile Job V2 is **launch-ready / monitoring** and **accepted for controlled owner-led launch use** with fallback retained. Full fixture state-matrix screenshots are still recommended, but they are not a launch blocker for controlled owner-led use.

No Mobile V2 source-truth blocker was found in the final source/test smoke review. The owner is actively using the V2 default mobile job page with no reported issues. This checklist must not be read as proof that every possible fixture screenshot was captured.

Current source truth:

- canonical mobile `/jobs/[id]` defaults to `MobileJobDetailV2Preview`;
- `mobileLayout=current` and `mobileLayout=classic` force `MobileJobDetailCurrent`;
- Standard View / current-mobile exits from V2 must preserve `mobileLayout=current`;
- desktop rendering remains separate;
- this checklist is docs/readiness only and does not authorize product code, schema, Supabase, provider, env, feature-flag, production, or behavior changes.

## Smoke Rules

- Use representative existing fixtures when available.
- Do not create, mutate, repair, or delete production data for this checklist.
- Prefer local or safe non-production browser smoke unless a separate production smoke window is explicitly approved.
- Record route, job state, viewport, observed primary action, fallback behavior, and pass/fail.
- Any failed action, misleading active UI, broken fallback, or source-of-truth mismatch becomes a separate implementation decision, not an automatic fix in this checklist.

## Required Viewports

| Viewport | Required coverage |
| --- | --- |
| 360px | One active state, one exception/final state, one fallback/current-view exit |
| 390px | Full representative matrix where fixtures exist |
| 430px | One active state, one billing/closeout state, one read-only/final state |

## Final/Read-Only States

| State | Expected V2 posture | Fallback check | Result |
| --- | --- | --- | --- |
| Closed job | Read-only/history posture; no misleading active/pulsing field UI | Standard View exits include `mobileLayout=current` | Not run |
| Cancelled job | Cancelled/read-only language; no active lifecycle primary action | `mobileLayout=current` renders current mobile | Not run |
| Archived/deleted job | Archived/read-only or redirect posture matches existing route behavior | `mobileLayout=classic` renders current mobile where route permits | Not run |
| Completed but closeout reviewable | Completion/closeout review only; no field-active implication | Billing/history exits remain safe | Not run |

## ECC Failed / Retest / Correction States

| State | Expected V2 posture | Fallback check | Result |
| --- | --- | --- | --- |
| ECC failed | Correction-needed/review language; not normal active work | Current action/history surfaces reachable | Not run |
| Pending office review | Review-needed language; correction/retest controls preserve current truth | Standard View action exits include `mobileLayout=current` when used | Not run |
| Confirm Retest Ready available | Single clear action surface; no duplicate lower CTA confusion | Return path remains valid after action | Not run |
| Retest scheduling needed | Retest/scheduling responsibility clear; no generic service return wording | Current retest form/action reachable if not native | Not run |
| Linked retest parent | Parent reads passive/historical; linked child carries active work | Child/current-view links do not imply parent is active | Not run |
| Linked retest child | Child appears as active work according to existing schedule/assignment gates | No parent-history bounce-back confusion | Not run |

## Permit States

| State | Expected V2 posture | Fallback check | Result |
| --- | --- | --- | --- |
| Permit needed blocks closeout | Permit responsibility leads when current gates say it should | Permit action/current surface reachable | Not run |
| Permit info/edit available | Permit data and edit route/form preserve schedule-action payload truth | Return target remains valid | Not run |
| Permit not required / already added | Status is read-only or low-priority as appropriate | No fake missing-permit blocker | Not run |

## Billing / Closeout States

| State | Expected V2 posture | Fallback check | Result |
| --- | --- | --- | --- |
| Draft invoice exists | Billing summary/open action reflects draft truth | Invoice workspace/current fallback opens correctly | Not run |
| Issued invoice exists | Read/open/send/payment wording matches current invoice truth | No draft-edit implication if read-only | Not run |
| Paid invoice / closeout satisfied | Billing does not present unpaid blocker | Payment truth remains display-only from existing records | Not run |
| External billing required | External billing wording stays distinct from internal invoice/payment | Completion action route/current surface reachable | Not run |
| Certs required | Cert closeout action remains in existing shared status surface | No duplicate cert action outside approved surface | Not run |
| No billing action needed | Billing / Closeout stays quiet and does not lead active field work | No unnecessary current fallback needed | Not run |

## Waiting / Release / Exception States

| State | Expected V2 posture | Fallback check | Result |
| --- | --- | --- | --- |
| Waiting on info | Waiting label/reason visible; no normal active-work implication | Release/status tools reachable | Not run |
| Waiting on part/material | Part/material status clear; progress actions preserve current semantics | Current/native progress controls return correctly | Not run |
| Approval needed | Approval blocker clear; no invoice-first misprioritization | Approval progress/release path reachable | Not run |
| On hold | Hold reason clear; release/re-evaluate follows current permissions | Standard/current fallback remains available | Not run |
| Unable to complete / follow-up | Follow-up wording and return-visit action match service flow | Return visit path preserves payload/return behavior | Not run |

## Service Plan Actions

| State | Expected V2 posture | Fallback check | Result |
| --- | --- | --- | --- |
| Visit count action available | Visit-count action appears only under current gates | Return target remains V2/current-safe | Not run |
| Suggested next due date | Confirm action appears only when allowed | No payment/billing-period truth confusion | Not run |
| Confirmed next due date | Displays confirmed context without repeat action | Customer service-plan route remains reachable | Not run |
| No service plan linked | Service Plan row invites service-plan context without implying active agreement | Standard/current fallback remains available | Not run |

## Fallback / Routing Behavior

| Check | Expected behavior | Result |
| --- | --- | --- |
| `/jobs/{id}` on mobile | Renders `MobileJobDetailV2Preview` | Not run |
| `/jobs/{id}?mobileLayout=current` | Renders `MobileJobDetailCurrent` | Not run |
| `/jobs/{id}?mobileLayout=classic` | Renders `MobileJobDetailCurrent` | Not run |
| V2 Standard View exits | Include `mobileLayout=current` | Not run |
| V2 real workspace links | Equipment, ECC Tests, Completion Report, Attachments, invoice/customer routes open real workspaces | Not run |
| Desktop `/jobs/{id}` | Remains desktop branch; not affected by mobile V2 selection | Not run |

## Go / No-Go Interpretation

Controlled owner-led launch use is accepted while this checklist remains monitoring evidence. Go for stronger universal fixture-complete wording only when:

- all required available fixtures pass;
- no closed/cancelled/archived job shows misleading active field UI;
- ECC failed/retest/permit states preserve existing truth and action hierarchy;
- billing/closeout states do not distort invoice/payment/cert truth;
- waiting/release and service-plan actions preserve existing payload/return behavior;
- `mobileLayout=current` / `classic` fallback remains intact;
- Standard View exits keep `mobileLayout=current`;
- desktop remains separate.

No-go if any item fails in a way that affects action availability, source-of-truth boundaries, return paths, auth/role gates, financial truth, ECC truth, or final-state read-only posture.

Fallback must remain regardless of monitoring status. This checklist does not authorize fallback removal.

## Explicit Non-Actions

This checklist did not perform:

- product code changes;
- schema or migration changes;
- Supabase commands;
- Stripe, SMS, QBO, env, feature-flag, provider, or production changes;
- runtime behavior changes;
- fallback removal;
- Mobile V2 promotion behavior changes.
