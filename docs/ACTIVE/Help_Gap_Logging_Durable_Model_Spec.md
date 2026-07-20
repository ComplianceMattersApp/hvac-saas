# Help Gap Logging Durable Model Spec

Status: ACTIVE MODEL LOCK / G5 REVIEW QUEUE MATURITY MILESTONE CLOSED

Mode: Documentation/model/audit plus implementation closeout notes through G5-F. This document authorizes no new runtime behavior, Supabase write path, provider call, support case creation, Support Console enablement, impersonation, permission change, or user-facing product change by itself.

Authority: Subordinate to:
- `docs/ACTIVE/Active Spine V4.0 Current.md`
- `docs/ACTIVE/Startup_Maturity_Lane_Model_Lock.md`
- `docs/ACTIVE/Support_V0_Operational_Readiness_Pack.md`
- `docs/ACTIVE/Support_Case_Call_Log_V1_Model_Spec.md`
- `docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md`
- `docs/ACTIVE/Owner_Led_Go_Live_Readiness_Addendum.md`
- `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md`

## 1. Executive Summary

Durable Help Gap Logging should turn Ask Compliance Matters unanswered questions, not-helpful feedback, and "still need help" signals into safe product/support intelligence.

The recommended model is a dedicated durable help-gap table, introduced later behind explicit flags, not Support Case V1 as the first persistence target.

Rationale:
- Help gaps are product intelligence and training/support-content feedback.
- Support cases are active support work with owner/support-internal notes and status.
- `still_need_help` is a support-intent signal, not a support case by itself.
- Durable logging must not become automatic model training, automatic support intake, tenant operational mutation, Support Console enablement, or provider/AI wiring.

Recommended first durable storage target after approval:

- `assistant_help_gap_events`

Alternative acceptable name:

- `help_gap_events`

This spec prefers `assistant_help_gap_events` because it makes the source and scope explicit while leaving room for future non-assistant product-intelligence signals.

## 2. Current Baseline

Ask Compliance Matters and Help Gap Logging currently have:

- local/mock help and setup coach shell
- feature flag: `ENABLE_ASK_COMPLIANCE_MATTERS`
- mounted only on approved surfaces:
  - `/ops/admin`
  - `/training`
- Admin Center Launch Room and `/training` Training Room content as the approved contextual sources
- expanded curated local knowledge coverage
- polished assistant panel
- durable Help Gap event contract behind `ENABLE_HELP_GAP_LOGGING`
- durable event creation for:
  - `unknown_answer`
  - `not_helpful`
  - `still_need_help`
- writes only to `assistant_help_gap_events`
- owner/admin Help Gap Review queue at `/ops/admin/help-gaps` behind `ENABLE_HELP_GAP_REVIEW_QUEUE`
- Admin Center link appears only when `ENABLE_HELP_GAP_REVIEW_QUEUE` is enabled
- row-level review status update controls for owner/admin reviewers
- reporting/pattern summaries for sanitized help-gap rows
- no support case creation
- no support case linking
- no Support Console dependency
- no provider/LLM/OpenAI calls
- safe context only:
  - sanitized pathname
  - page family
  - coarse internal role/category
  - role label
  - product mode
  - coarse capability booleans

Current code references:

- `lib/help-assistant/help-gap-events.ts`
- `lib/help-assistant/help-gap-classification.ts`
- `lib/help-assistant/help-assistant-context.ts`
- `lib/help-assistant/help-gap-persistence.ts`
- `lib/actions/help-gap-actions.ts`
- `lib/help-assistant/help-gap-review-read-model.ts`
- `lib/help-assistant/help-gap-review-status.ts`
- `lib/actions/help-gap-review-actions.ts`
- `app/ops/admin/help-gaps/page.tsx`

The durable table is the review queue source of truth for captured help gaps. Assistant knowledge remains curated/local and does not use provider-generated answers in this lane.

## 3. Recommended Storage Model

Recommendation: use a dedicated `assistant_help_gap_events` table later.

Do not use Support Case V1 as the first persistence target.

Recommended posture:

1. Durable help gaps are stored separately as product/support intelligence.
2. Help gaps may later link to support cases after explicit user/support/admin action.
3. `still_need_help` may later offer support guidance or an explicit create/link support-case flow, but it must not create a support case automatically in V1.
4. Support Case V1 remains the durable record for active support work, not passive help-feedback telemetry.
5. Support Console remains separate, parked, and runbook-gated.

Rejected for V1:

- Writing help gaps directly into `support_cases`
- Writing help-gap feedback as `support_case_notes`
- Auto-creating cases from `still_need_help`
- Adding support-console sessions/grants/audit events from help-gap interactions
- Storing full assistant transcripts or broad page payloads
- Sending help gaps to analytics providers
- Using help gaps for automatic model training

## 4. Durable Event Field Contract

Recommended V1 fields for `assistant_help_gap_events`:

| Field | Type direction | Required | Notes |
|---|---|---:|---|
| `id` | uuid | yes | Server-generated primary key. |
| `account_owner_user_id` | uuid | yes | Tenant/account scope. Required for RLS and review grouping. |
| `internal_user_id` | uuid nullable | no | Current internal user id if safely available. Avoid if actor is not an internal user. |
| `event_type` | text/check enum | yes | `unknown_answer`, `not_helpful`, `still_need_help`. |
| `assistant_mode` | text/check enum | yes | `help_chat`, `setup_coach`. |
| `help_gap_category` | text/check enum | yes | See categories below. |
| `route_pathname` | text | yes | Sanitized pathname only, no query/hash. Prefer route pattern when practical. |
| `page_family` | text/check enum | yes | `launch_room`, `training_room`, `operations`, `today`, `admin`, `other`. |
| `role_category` | text | yes | Coarse role only: `owner`, `admin`, `office`, `tech`, `billing`, `unknown`. |
| `role_label` | text | yes | User-facing coarse role label. |
| `product_mode` | text | yes | Safe product mode value or `unknown`. |
| `can_view_financial_register` | boolean | yes | Coarse capability only. |
| `can_collect_field_payment` | boolean | yes | Coarse capability only. |
| `question_text_sanitized` | text nullable | yes | Trimmed, whitespace-normalized, length-limited. See Section 5. |
| `question_summary` | text nullable | no | Optional later operator-generated or deterministic summary. Do not use provider-generated summaries in V1. |
| `answer_key` | text | yes | Curated answer key or fallback key such as `fallback_unknown`. |
| `feedback_value` | text nullable | no | `not_helpful`, `still_need_help`, or null. |
| `setup_step_key` | text nullable | no | Safe setup step key if applicable. |
| `training_mission_key` | text nullable | no | Safe training mission key if applicable. |
| `review_status` | text/check enum | yes | Default `new`. See Section 8. |
| `reviewed_at` | timestamptz nullable | no | Set only by review action. |
| `reviewed_by_user_id` | uuid nullable | no | Reviewer id when reviewed. |
| `linked_support_case_id` | uuid nullable | no | Later explicit link only. Must not be set by default. |
| `created_at` | timestamptz | yes | Server timestamp. |
| `updated_at` | timestamptz | yes | Server timestamp if review status changes. |

Help gap categories:

- `guidance_training`
- `setup_data_issue`
- `ux_confusion`
- `possible_product_bug`
- `future_feature_request`
- `missing_help_article`
- `unknown`

Event types:

- `unknown_answer`
- `not_helpful`
- `still_need_help`

Assistant modes:

- `help_chat`
- `setup_coach`

Question storage decision for V1:

- Store `question_text_sanitized` with strict limits.
- Do not store full raw question text.
- Do not store full transcript.
- Do not store assistant answer body unless separately approved; use `answer_key`.
- Keep `question_summary` nullable/deferred unless a reviewed deterministic summarizer exists.

Rationale:

- Sanitized question text is useful for pattern review and help-article planning.
- Summary-only would lose important early signals and can be misleading without a reviewed summarizer.
- Both sanitized question and summary may be useful later, but summary generation should not introduce provider/AI behavior in the first durable slice.

## 5. Privacy and Sanitization Policy

Durable help-gap logging must use a fail-closed privacy posture.

Never persist:

- auth tokens
- secrets/env values
- service-role data
- raw Stripe/customer/payment method/subscription ids
- payment details
- full invoice details
- full customer/job notes
- private timeline bodies
- uploaded file contents
- support-console session/grant internals
- raw query strings or hashes
- broad customer/job/invoice payloads
- unrelated personal/private information
- browser storage payloads
- provider payloads
- full page context
- full assistant transcripts

Required sanitization rules:

- Trim question text.
- Collapse whitespace.
- Remove null characters.
- Length-limit question text. V1 recommendation: 240 characters, matching the current non-durable helper.
- Drop query string and hash from route values.
- Store route pattern where practical. Examples:
  - `/ops/admin`
  - `/training`
  - `/jobs/[id]` only if a route-pattern helper is approved later
- Avoid raw IDs in route storage. If route patterning is not available, use only approved static surfaces for V1 persistence.
- Store answer keys, not answer bodies.
- Store coarse role/capability flags, not full permission payloads.
- Fail closed when context cannot be safely sanitized.

V1 route allowlist recommendation:

- `/ops/admin`
- `/training`

Historical first-persistence rule: Ask Compliance Matters was initially mounted only on Admin Center and Training Room. The launcher is now available across approved authenticated internal route families; persistence canonicalizes those routes to safe base paths, strips record ids/query data, and continues to reject portal/public routes.

Do not attempt broad PII extraction in V1 unless a reviewed helper exists. Length limits and context boundaries are the V1 safety control.

## 6. User-Facing Trust and Copy Policy

Before durable logging:

- Use local-only copy:
  - `Marked locally for this session.`
  - `No support case was created.`

After durable logging is implemented and enabled:

- The assistant should explicitly tell users when feedback is saved.
- Copy must distinguish product feedback from support cases.
- Copy must not imply automatic support follow-up unless support-case creation is implemented and user-confirmed.

Allowed future copy examples:

- `Thanks - this helps us improve support and training.`
- `This was sent as product feedback, not a support case.`
- `No support case was created.`
- `Choose Still need help if you want support guidance.`
- `Contact support if this is blocking your work.`

Required trust rules:

- If durable logging is off, do not say feedback was saved.
- If durable logging is on, do not hide that feedback is saved.
- If a support case is not created, say so plainly.
- If a support case flow is later introduced, it must be an explicit action, not a side effect of feedback.
- Do not claim AI learning, model training, or automatic improvement.

## 7. Access and Review Model

Implemented V1 review access:

- Tenant structural owner and tenant admin may review account-scoped help-gap rows through `/ops/admin/help-gaps`.
- Review queue exposure is controlled by `ENABLE_HELP_GAP_REVIEW_QUEUE`.
- Review status updates are owner/admin only and same-account scoped.
- Billing/AR should not have review access in V1.
- Technicians and field users should not have review access in V1.
- Contractor/portal users should not have review access in V1.
- Portal, contractor, customer-facing, unauthenticated, and non-internal users are blocked.

Rationale:

- Help gaps can contain user confusion, support-sensitive context, and product-quality signals.
- Owner/admin account-scoped review fits the Launch Room/Training Room maturity lane and keeps the queue out of Support Console.
- Platform-wide or support-side review remains deferred to a separately approved owner-support route or reporting model.

Access boundaries:

- No Support Console dependency.
- No impersonation.
- No support-side tenant mutation.
- No customer-facing exposure.
- No tenant operational record edits.
- No payment, invoice, customer, job, team, or company-profile mutation.

Future platform/support review may be considered only after a separate access model and copy/trust review.

## 8. Review Workflow

Recommended review statuses:

- `new`
- `reviewed`
- `converted_to_help_article`
- `linked_to_support_case`
- `dismissed`
- `product_backlog`
- `bug_candidate`

Implemented V1 allowed review actions:

- View sanitized rows.
- Filter by safe review dimensions.
- Mark reviewed.
- Mark product backlog candidate.
- Mark bug candidate.
- Mark converted to help article.
- Dismiss.

Deferred actions:

- Create support case from item.
- Link to existing support case.
- Create help article automatically.
- Create product backlog item.
- Create bug ticket.
- Add internal support note.
- Notify user.

Implemented write action mutates only:

- `review_status`
- `reviewed_at`
- `reviewed_by_user_id`

The table trigger may update `updated_at`. No other help-gap payload fields, tenant operational records, or support-case tables are mutated.

## 9. Retention Recommendation

Recommended V1 retention:

- Keep raw sanitized question text for 180 days.
- Keep aggregated/reporting counts longer if they contain no question text and no user id.
- After review, allow anonymization or redaction of `question_text_sanitized` while preserving category/route/answer/event counts.
- Do not retain raw sanitized question text indefinitely without explicit approval.

Alternative lower-risk policy:

- 90-day retention for `question_text_sanitized`.

Recommended default:

- 180 days for controlled rollout, because early help gaps may be sparse and useful for onboarding/training improvements.

Required future implementation detail:

- Define an operator runbook or scheduled job before any automatic deletion/anonymization.
- Do not add background deletion behavior in the first table-only slice unless explicitly approved.

## 10. Reporting Model

Implemented review queue summaries:

- Top cards:
  - New
  - Unknown answers
  - Not helpful
  - Still need help
- Patterns section:
  - top categories
  - top places users got stuck / page families
  - roles asking for help
  - training signals
  - setup signals
  - event type mix
  - review status mix
- Filters:
  - review status
  - help-gap category
  - event type
  - page family
  - role category
  - product mode
  - recent days
  - limit

Reporting should use aggregated, sanitized data only.

Reporting must not expose:

- raw IDs,
- full notes,
- invoice/customer/job payloads,
- support-console internals,
- user secrets,
- payment details,
- broad per-user behavioral timelines.

## 11. Separation From Support Case and Support Console

Help gaps are not support cases by default.

Support Case V1:

- Is implemented and production-smoke-passed.
- Mutates only `support_cases` and `support_case_notes`.
- Is owner/support-internal only.
- Is for real support work and call/issue logging.

Help Gap Logging:

- Is product/support intelligence.
- Captures unanswered/confusing assistant interactions and feedback.
- Should help identify missing help content, confusing UI, setup friction, role-training gaps, and possible bug candidates.
- Must not replace Support V0 intake or Support Case V1.

`still_need_help`:

- Indicates support intent.
- Must not automatically create a support case in V1.
- May later show support guidance.
- May later allow an explicit "Create support case" or "Request help" action only after separate approval.

Support Console:

- Remains parked and runbook-gated.
- This model does not enable `ENABLE_SUPPORT_CONSOLE`.
- This model does not create support users, grants, sessions, or support access audit events.
- This model does not allow impersonation or support-side tenant mutation.

## 12. Feature Flag Model

Implemented flags:

- `ENABLE_ASK_COMPLIANCE_MATTERS`
  - Controls assistant visibility/runtime shell.

- `ENABLE_HELP_GAP_LOGGING`
  - Controls persistence of sanitized help-gap events.
  - Default false.
  - If false, local-only event behavior remains.

- `ENABLE_HELP_GAP_REVIEW_QUEUE`
  - Controls review UI exposure.
  - Default false.
  - Must not imply Support Console enablement.

Optional later flag:

- `ENABLE_HELP_GAP_SUPPORT_CASE_LINKING`
  - Controls explicit support-case create/link actions from help gaps.
  - Default false.
  - Must require separate approval and tests.

Flag rules:

- Persistence must fail closed when `ENABLE_HELP_GAP_LOGGING` is false.
- Review UI must fail closed when `ENABLE_HELP_GAP_REVIEW_QUEUE` is false.
- Support-case linking must fail closed unless explicitly enabled.
- Flags must not bypass access controls or RLS.
- Flags must not enable provider/AI behavior.

## 13. Recommended Implementation Sequence

G1: Docs/model lock only

- This document.
- No runtime behavior.
- No schema.
- No migrations.

G2: Additive table and RLS model

- Add `assistant_help_gap_events` table.
- Add check constraints for event type/category/status.
- Enable RLS.
- Add strict policies.
- Add migration tests or schema assertions.
- No UI wiring.
- No persistence from assistant yet.

G3: Server helper/action for sanitized persistence

- Add server-only helper to accept current local event shape plus authenticated account/user context.
- Re-sanitize server-side.
- Enforce route allowlist.
- Enforce flag.
- Insert only into help-gap table.
- No support-case writes.
- No provider calls.

G4: Wire assistant feedback to persistence behind flag

- If `ENABLE_HELP_GAP_LOGGING` is true, call server action for:
  - `unknown_answer`
  - `not_helpful`
  - `still_need_help`
- Preserve local-only behavior when flag is false.
- Update user copy so saved feedback is truthful.

G5: Owner/support review surface

- Add review queue behind `ENABLE_HELP_GAP_REVIEW_QUEUE`.
- Platform owner/support-internal only.
- Start with read-only list/detail plus mark reviewed/dismiss if approved.
- No Support Console dependency.

G6: Optional support-case link/create flow

- Only after explicit approval.
- User/support/admin action must be intentional.
- No automatic support case creation from `still_need_help`.
- Writes to `support_cases`/`support_case_notes` only through existing support-case boundaries.

G7: Reporting summaries

- Add aggregate summaries for categories, routes, roles, answer keys, setup steps, and training missions.
- Avoid raw question export unless separately approved.

## 14. Future Acceptance Criteria

Before any durable persistence is implemented:

- Schema is additive only.
- Migration is reviewed independently.
- RLS is enabled and strict.
- Account scope is enforced by `account_owner_user_id`.
- No sensitive raw data is stored.
- Question text is sanitized, trimmed, and length-limited.
- Raw query/hash is dropped.
- Route values are allowlisted or patternized.
- Server action re-sanitizes and fails closed.
- Feature flag defaults off.
- No support case is created by default.
- No Support Console is enabled.
- No impersonation is introduced.
- No provider/AI/OpenAI wiring is introduced.
- No analytics provider is introduced.
- No tenant operational mutation is introduced.
- No payment/Stripe/subscription/billing behavior changes.
- Tests cover sanitization, forbidden fields, flag-off no-op behavior, RLS policy expectations, access model, and no support-case writes.

Before review UI is implemented:

- Review access model is approved.
- Review surface is behind `ENABLE_HELP_GAP_REVIEW_QUEUE`.
- Review UI does not expose forbidden data.
- Review actions mutate only the help-gap table unless separately approved.

Before support-case linking is implemented:

- Separate explicit approval exists.
- User/support/admin intent is explicit.
- Copy says whether a support case was created.
- Support Case V1 boundaries are preserved.
- Support Console remains separate.

## 15. Explicit Non-Actions

This model lock does not authorize or perform:

- product code changes
- schema changes
- migrations
- Supabase reads/writes
- service-role usage
- AI provider wiring
- OpenAI/API calls
- analytics provider wiring
- support case creation
- support case linking
- Support Console enablement
- support user/grant/session creation
- impersonation
- role/permission behavior changes
- payment/Stripe/subscription/billing behavior changes
- durable logging implementation
- user-facing runtime changes
- automatic setup
- automatic user invites
- automatic customer/job/contractor creation
- automatic payment onboarding
- customer portal assistant
- contractor portal assistant
- automatic model training

## 16. First Recommended Implementation Slice After Review

First implementation slice after this model lock should be:

`Help Gap Logging G2 - Additive Schema Foundation`

Scope:

- Create `assistant_help_gap_events`.
- Add check constraints.
- Add indexes for account/date/category/event type/review status.
- Enable RLS.
- Add strict policies.
- Add schema/RLS tests.
- Do not wire assistant persistence yet.
- Do not add review UI yet.
- Do not create support cases.

Recommended minimum indexes:

- `(account_owner_user_id, created_at desc)`
- `(review_status, created_at desc)`
- `(event_type, created_at desc)`
- `(help_gap_category, created_at desc)`
- `(page_family, created_at desc)`

Recommended G2 closeout proof:

- migration diff reviewed,
- RLS enabled,
- policies fail closed,
- tests pass,
- no runtime files changed except schema/test files,
- no assistant persistence path exists yet.

## 17. G2 / G2-A Closeout Status

G2 additive schema foundation is implemented as a dormant database foundation:

- Migration: `supabase/migrations/20260621100000_assistant_help_gap_events_foundation.sql`
- Table: `public.assistant_help_gap_events`
- Focused schema test: `lib/help-assistant/__tests__/help-gap-schema-foundation.test.ts`

Implemented G2 schema posture:

- additive table only
- account-scoped `account_owner_user_id`
- optional same-account `internal_user_id`
- constrained event types, assistant modes, help-gap categories, page families, product modes, and review statuses
- sanitized route path constraint with no query/hash
- short sanitized question and key length constraints
- optional future `linked_support_case_id` reference only, with no support-case creation behavior
- account-scoped RLS enabled
- authenticated same-account select/insert policy
- owner/admin same-account review update policy
- no delete policy
- reporting/review indexes for account/date/status/category/event/page/setup/training slices

G2 remains intentionally dormant:

- no assistant persistence wiring
- no server action
- no review UI
- no Support Console enablement
- no support-case creation
- no support-case note creation
- no provider/LLM/OpenAI wiring
- no analytics provider wiring
- no tenant operational mutation
- no payment, Stripe, QBO, portal, entitlement, role, or permission behavior change

G2-A local verification status:

- Focused Help Assistant/schema tests passed.
- `npx.cmd tsc --noEmit` passed.
- Local-only Supabase reset was attempted with `supabase db reset --local --no-seed --yes`, but did not complete because Docker Desktop's Linux engine pipe was unavailable in the local environment.
- No production Supabase command was run.

G2-A remains pending for full local migration-chain validation until Docker Desktop/local Supabase is available, then rerun:

```powershell
supabase db reset --local --no-seed --yes
```

Recommended next slice after local migration validation passes:

- G3 sanitized persistence helper/server action behind `ENABLE_HELP_GAP_LOGGING`.
- Server-side re-sanitization and route allowlist.
- Insert only into `assistant_help_gap_events`.
- No support-case writes.
- No provider calls.
- No review UI.

## 18. G5 Review Surface Planning

Status: ACTIVE MODEL LOCK / PLANNING ONLY

This section plans the future Help Gap Review surface after CMTest proved durable persistence for `unknown_answer`, `not_helpful`, and `still_need_help` rows. It does not authorize runtime behavior, review UI implementation, schema changes, migrations, Supabase writes, support-case creation, Support Console enablement, provider calls, analytics, payment behavior, or tenant operational mutation.

### 18.1 Executive Summary

Help Gap Review should be a small internal owner/admin/support-safe review surface for sanitized Ask Compliance Matters feedback.

Recommended V1 location:

- `/ops/admin/help-gaps`

Recommended posture:

- gated behind a new `ENABLE_HELP_GAP_REVIEW_QUEUE` flag
- internal authenticated route only
- owner/admin first for tenant-scoped review, with platform-owner/support-safe visibility only through separately approved owner-support surfaces
- not Training Room
- not the assistant panel
- not Support Console
- not Reports V1 unless later aggregate reporting is added

The surface should answer where users are getting stuck and which help/training/product areas need attention. It must not become support intake, impersonation, tenant browsing, or operational record mutation.

### 18.2 Current Confirmed Baseline

Confirmed after G4-Fix-C in CMTest sandbox `kvpesjdukqwwlgpkzfjm`:

- `public.assistant_help_gap_events` exists.
- RLS is enabled.
- Account-scoped select, insert, and owner/admin update policies are present.
- `authenticated` has `SELECT`, `INSERT`, and `UPDATE` table privileges.
- `authenticated` does not have `DELETE`.
- `anon` has no table access.
- PostgREST schema cache was reloaded after targeted apply.
- G4-QA confirmed durable rows for:
  - `unknown_answer`
  - `not_helpful`
  - `still_need_help`
- Persisted rows used `review_status = 'new'`.
- Persisted rows used `linked_support_case_id = null`.
- No support cases or support case notes were created.
- No Support Console behavior changed.

Current runtime persistence remains limited to:

- `ENABLE_ASK_COMPLIANCE_MATTERS`
- `ENABLE_HELP_GAP_LOGGING`
- routes allowed by the server helper: `/ops/admin` and `/training`
- writes only to `assistant_help_gap_events`

### 18.3 Recommended Review Surface Location

Preferred V1 route:

- `/ops/admin/help-gaps`

Rationale:

- Admin Center already owns Launch Room, setup readiness, and owner/admin operational controls.
- Help gaps are operational onboarding/training/product-intelligence signals, not user training content.
- The route can be explicitly feature-flagged and access-gated without expanding the assistant panel.
- It keeps review close to owner/admin readiness work while avoiding Support Console.

Rejected or deferred locations:

- Training Room: users go there to learn, not to inspect other users' confusion.
- Assistant panel: feedback capture belongs there, review workflow does not.
- Reports: useful later for aggregate summaries, but V1 needs row review and triage.
- Support Console: parked, runbook-gated, and not required for help-gap review.
- Normal Support area: risks implying support-case creation or active support intake.
- Platform-owner-only route as the only V1 surface: useful later for cross-account product review, but tenant account RLS already supports account-scoped owner/admin review.

### 18.4 Reviewer Access Model

Recommended V1 reviewers:

- tenant structural owner
- tenant admin
- platform owner/support-safe reviewer only through a separately approved owner-support route or platform-owner route

Do not grant V1 review access to:

- billing/AR by default
- office/dispatcher unless they are also admin
- technicians/field users
- contractor/portal users
- customer-facing users
- Support Console users merely because Support Console exists

Access rules:

- Route must fail closed when `ENABLE_HELP_GAP_REVIEW_QUEUE` is false.
- Route must require authenticated internal access.
- Reads must remain account-scoped through existing RLS and server-side access checks.
- V1 should avoid broad cross-tenant browsing.
- Any future platform-owner aggregate review needs a separate platform-owner access model and copy review.

### 18.5 Review Surface Purpose

The review surface should help reviewers answer:

- What questions did Ask Compliance Matters not know?
- Which curated answers were marked not helpful?
- Which users clicked Still need help?
- Which Launch Room or Training Room surfaces cause confusion?
- Which categories repeat?
- Which product modes, roles, routes, missions, or setup steps generate the most friction?
- Which items look like missing help articles?
- Which items look like bug candidates or product-backlog candidates?

The surface should not be used to:

- monitor individual workers as a performance tool
- inspect private job/customer/invoice details
- start support sessions
- create or mutate tenant operational records
- train an AI model automatically
- export raw feedback payloads

### 18.6 V1 Row Display Model

Show per row:

- created time
- event type
- help-gap category
- page family
- sanitized route pathname
- role category and role label
- product mode
- sanitized question text, capped by existing storage limits
- answer key or fallback key
- feedback value
- setup step key, if present
- training mission key, if present
- review status

Show in secondary/detail context only:

- coarse capability booleans such as financial-register visibility and field-payment collection
- reviewer timestamp and reviewer label after review actions exist
- dormant linked support-case status as `none` while `linked_support_case_id` is null

Do not show as primary UI:

- raw UUIDs
- raw payload dumps
- support-console internals
- payment/provider internals
- Stripe/customer/payment method identifiers
- private customer/job/invoice details
- raw query strings or hashes
- support-case notes
- full assistant transcripts

### 18.7 Filters and Summary Cards

Recommended first filters:

- review status
- help-gap category
- event type
- page family
- role category
- product mode
- date range
- training mission key
- setup step key
- answer key

Recommended first summary cards:

- New help gaps
- Unknown answers
- Not helpful answers
- Still need help
- Top categories
- Top page families/routes
- Top training missions
- Top setup steps

Summary cards should be derived from sanitized help-gap rows only. They should not join into customer/job/invoice/payment payloads in V1.

### 18.8 Safe Review Actions

Recommended V1 actions:

- mark reviewed
- mark product backlog
- mark bug candidate
- mark converted to help article
- dismiss
- copy sanitized summary

First implementation can be read-only list/detail before adding actions. If status updates are included, they must update only:

- `review_status`
- `reviewed_at`
- `reviewed_by_user_id`
- `updated_at` via trigger

Status actions must preserve the existing account-scoped owner/admin update policy and must not use a service-role runtime path.

### 18.9 Deferred Actions

Defer:

- create support case
- link support case
- create support-case note
- create help article automatically
- create product backlog ticket automatically
- create bug ticket automatically
- send message to user
- notify support automatically
- train AI automatically
- export raw data
- broaden route capture beyond the approved assistant surfaces
- support-side tenant mutation

Any future support-case create/link flow must be separately approved and feature-flagged.

### 18.10 Support Case and Support Console Boundary

Help gaps are not support cases.

`still_need_help` is support intent, not support-case creation.

V1 review surface must preserve:

- no automatic support case creation
- no automatic support case linking
- no support-case notes
- no Support Console enablement
- no support users, grants, sessions, or support access audit events
- no impersonation
- no tenant operational mutation

A future explicit "Create support case from help gap" or "Link support case" action may be planned later, but it is outside G5 V1 review-surface implementation unless separately approved.

### 18.11 Retention and Review Status Recommendation

Review-only is enough for the first review surface if the first implementation is read-only.

Recommended first write action:

- status update only, after read-only list/detail is proven

Recommended retention posture:

- keep `question_text_sanitized` for 180 days during controlled rollout
- keep aggregate counts longer if they contain no question text and no user id
- plan future anonymization/redaction after review
- do not add automatic deletion/anonymization in the first review UI slice

Review statuses remain:

- `new`
- `reviewed`
- `converted_to_help_article`
- `linked_to_support_case`
- `dismissed`
- `product_backlog`
- `bug_candidate`

Even though `linked_to_support_case` exists in the schema for future compatibility, V1 must not set it unless explicit support-case linking is separately approved.

### 18.12 Feature Flag Recommendation

Existing flags:

- `ENABLE_ASK_COMPLIANCE_MATTERS`
- `ENABLE_HELP_GAP_LOGGING`

Recommended new flag:

- `ENABLE_HELP_GAP_REVIEW_QUEUE`

Flag rules:

- Review route hidden/fail-closed when `ENABLE_HELP_GAP_REVIEW_QUEUE` is false.
- Review route must not imply assistant visibility.
- Review route must not imply help-gap persistence.
- Review route must not imply Support Console enablement.
- Review actions must still enforce server-side role and account scope.

Optional later flag:

- `ENABLE_HELP_GAP_SUPPORT_CASE_LINKING`

This later flag would require a separate model lock and tests.

### 18.13 Pending Migration Caution

CMTest had unrelated pending migrations during G4-Fix-C. Normal `supabase db push` was unsafe because it would have applied unrelated pending migrations.

Future migration/apply work must:

- confirm the target ref before any command
- avoid production unless explicitly approved
- avoid normal `db push` when unrelated migrations are pending
- use targeted SQL or isolated migration artifacts when applying a narrow sandbox/production fix
- document whether migration history was repaired after targeted SQL apply
- never bundle Help Gap Review with unrelated schema, payment, support, product-mode, or operational migrations

Known caution from G4-Fix-C:

- CMTest target ref: `kvpesjdukqwwlgpkzfjm`
- production ref to avoid unless explicitly approved: `ornrnvxtwwtulohqwxop`
- unrelated pending CMTest migrations remained pending after targeted Help Gap apply

### 18.14 G5 Implementation Sequence and Closeout Status

G5-A: docs/model only - complete

- This section.
- No runtime behavior.
- No schema.
- No Supabase commands.

G5-B: read model for help gaps - complete

- Add a server-only read helper for `assistant_help_gap_events`.
- Enforce account scope and owner/admin access.
- Support filters and summary counts.
- Read only.
- Implemented in `lib/help-assistant/help-gap-review-read-model.ts`.

G5-C: review route UI read-only - complete

- Add `/ops/admin/help-gaps` behind `ENABLE_HELP_GAP_REVIEW_QUEUE`.
- Render summary cards, filters, and sanitized list/detail.
- No support-case actions.
- Admin Center link is flag-gated.

G5-D: review status update action - complete

- Add narrow server action for approved status transitions.
- Mutate only the help-gap row's review fields.
- Preserve RLS and owner/admin scope.
- No service-role runtime path.
- Passed CMTest owner/admin smoke for `reviewed`, `bug_candidate`, and `dismissed`.

G5-E: reporting and summary polish - complete

- Added patterns and review summary polish.
- Verified filters, summaries, desktop/mobile layout, and support-case boundary.

G5-F: docs closeout and maturity lane lock - complete

- This closeout section.
- No runtime behavior.
- No schema.
- No Supabase commands.

Future optional support-case link/create planning is not part of G5 and requires a separate model lock, separate flag, explicit user/support/admin intent, and preservation of Support Case V1 and Support Console boundaries.

### 18.15 Explicit Non-Actions

G5 planning does not perform or authorize:

- product/runtime code changes
- schema changes
- migrations
- Supabase writes
- production Supabase commands
- normal `db push`
- review UI implementation
- review status update implementation
- support case creation
- support case linking
- support-case note creation
- Support Console enablement
- support-user/grant/session creation
- impersonation
- AI provider/OpenAI calls
- analytics provider behavior
- payment, Stripe, billing, subscription, or entitlement behavior changes
- customer/job/invoice/payment operational mutation
- customer-facing visibility
- contractor/portal visibility

## 19. G5-F Closeout / Stable Maturity Milestone

Status: G5 HELP GAP REVIEW QUEUE CLOSED AS STABLE MATURITY MILESTONE

This closeout records the implemented Help Gap Logging and Help Gap Review Queue lane after G5-D CMTest smoke and G5-E reporting polish.

### 19.1 Completed Runtime Surfaces

Completed startup maturity surfaces:

- Launch Room exists in Admin Center at `/ops/admin`.
- Training Room exists at `/training`.
- Ask Compliance Matters exists as a local/mock assistant on approved surfaces.
- Durable Help Gap Logging exists behind flags.
- Help Gap Review exists at `/ops/admin/help-gaps`.
- Admin Center links to Help Gap Review only when `ENABLE_HELP_GAP_REVIEW_QUEUE` is enabled.

Assistant launcher surfaces:

- `/ops/admin`
- `/training`

No customer portal, contractor portal, Support Console, payment, billing, job, invoice, or customer route is added to the assistant or review queue by this lane.

### 19.2 Feature Flags

Implemented flags:

- `ENABLE_ASK_COMPLIANCE_MATTERS`
  - Controls Ask Compliance Matters launcher visibility and local assistant runtime shell.
- `ENABLE_HELP_GAP_LOGGING`
  - Controls durable persistence of sanitized assistant help-gap events.
  - Durable persistence requires Ask Compliance Matters to be enabled.
- `ENABLE_HELP_GAP_REVIEW_QUEUE`
  - Controls `/ops/admin/help-gaps` review route exposure and Admin Center link visibility.
  - Review status actions also enforce this flag server-side and fail closed when disabled.

Flag boundaries:

- Logging flag does not imply review queue visibility.
- Review queue flag does not imply assistant visibility or persistence.
- No flag in this lane enables Support Console, support-case creation/linking, provider calls, analytics, payment behavior, or tenant operational mutation.

### 19.3 Data Model Closeout

Durable table:

- `public.assistant_help_gap_events`

Durable event types:

- `unknown_answer`
- `not_helpful`
- `still_need_help`

Review statuses:

- `new`
- `reviewed`
- `product_backlog`
- `bug_candidate`
- `converted_to_help_article`
- `dismissed`
- `linked_to_support_case`

`linked_to_support_case` is a dormant table capability only. It is not exposed as an active UI action, is rejected by the current review action helper, and is reserved for a separately approved support-case linking model.

### 19.4 Access Model Closeout

Implemented access posture:

- Durable event insert is authenticated and account-scoped.
- Review queue is owner/admin only.
- Review status update is owner/admin only.
- Review reads and writes are scoped to the same `account_owner_user_id`.
- Portal, contractor, customer-facing, unauthenticated, and non-internal users are blocked.
- Billing, office, and tech users are blocked unless they are also structural owner/admin under the existing internal-user/account-owner model.
- Runtime review actions use the normal authenticated Supabase path, not a service-role runtime path.
- Support Console is not part of the flow.

### 19.5 Safety Model Closeout

Implemented safety posture:

- Store sanitized question text only.
- Trim, normalize, and length-limit question text server-side.
- Store safe answer keys and fallback keys, not full assistant answer bodies.
- Store sanitized route pathname only.
- Strip query strings and hashes.
- Persist only approved assistant surfaces in V1.
- Review UI does not expose raw technical payloads, raw account/internal user ids, provider ids, payment ids, customer/job/invoice payloads, support-console internals, or raw JSON dumps.
- Review status is internal product/support triage only.
- Review status does not notify users, create follow-up, create support cases, link support cases, or create support-case notes.

### 19.6 Review Queue Capabilities

Implemented `/ops/admin/help-gaps` capabilities:

- Feature-flagged route.
- Disabled and unauthorized states.
- Safe read-failed state with no raw database/server errors.
- Summary cards:
  - New
  - Unknown answers
  - Not helpful
  - Still need help
- Patterns section:
  - Top categories
  - Top places users got stuck
  - Roles asking for help
  - Training signals
  - Setup signals
  - Event type mix
  - Review status mix
- Filters:
  - Review status
  - Category
  - Event type
  - Page family
  - Role
  - Product mode
  - Recent days
  - Limit
- Sanitized row list/detail.
- Row-level review status controls for the V1 active statuses:
  - `reviewed`
  - `product_backlog`
  - `bug_candidate`
  - `converted_to_help_article`
  - `dismissed`

The review route intentionally does not expose support-case creation, support-case linking, Support Console actions, exports, bulk updates, provider calls, analytics calls, or tenant operational mutations.

### 19.7 Deferred Items

Deferred outside the G5 maturity milestone:

- support-case creation from a help gap
- support-case linking from a help gap
- setting `linked_support_case_id`
- support-case note creation
- help article generation
- AI/provider answer generation
- automatic model training
- analytics provider integration
- bulk review actions
- export
- notification or user follow-up workflow
- Support Console integration
- support-side tenant mutation
- tenant-wide or platform-wide reporting beyond the owner/admin account-scoped review queue
- customer/contractor/portal review visibility
- background retention/anonymization automation

Any future support-case create/link flow must be separately model-locked, feature-flagged, explicitly intentional, and preserve Support Case V1 and Support Console boundaries.

### 19.8 Validation History

High-level validation completed through this closeout:

- G5-B read model tests passed.
- G5-C route/source tests passed.
- G5-C authenticated browser smoke passed for route, flag-off behavior, Admin Center link behavior, populated/empty route posture, filters, and mobile layout.
- G5-D review status action tests passed.
- G5-D CMTest smoke passed for owner/admin updates to `reviewed`, `bug_candidate`, and `dismissed`.
- G5-D smoke confirmed only `review_status`, `reviewed_at`, and `reviewed_by_user_id` changed.
- G5-D smoke confirmed `support_cases` and `support_case_notes` counts were unchanged.
- G5-E route/read-model/action tests passed.
- G5-E browser smoke passed for reporting/pattern summaries, filters, desktop/mobile layout, and support-case boundary.
- `npx.cmd tsc --noEmit` passed during implementation validation.
- `git diff --check` passed during implementation validation.

This G5-F docs slice performed documentation-only closeout and does not rerun Supabase, browser, or production validation.
