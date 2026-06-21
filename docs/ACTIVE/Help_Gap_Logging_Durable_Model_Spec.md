# Help Gap Logging Durable Model Spec

Status: ACTIVE PLANNING / MODEL LOCK ONLY

Mode: Documentation/model/audit only. This document authorizes no runtime behavior, schema, migration, Supabase write, provider call, support case creation, Support Console enablement, impersonation, permission change, or user-facing product change by itself.

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

Ask Compliance Matters currently has:

- local/mock help and setup coach shell
- feature flag: `ENABLE_ASK_COMPLIANCE_MATTERS`
- mounted only on `/ops/admin` and `/training`
- expanded curated local knowledge coverage
- polished assistant panel
- pure non-durable Help Gap event contract
- local-only event creation for:
  - `unknown_answer`
  - `not_helpful`
  - `still_need_help`
- no database persistence
- no Supabase writes
- no support case creation
- no Support Console dependency
- no provider/LLM/OpenAI calls
- safe context only:
  - sanitized pathname
  - page family
  - coarse internal role/category
  - role label
  - product mode
  - coarse capability booleans

Current pure code reference:

- `lib/help-assistant/help-gap-events.ts`
- `lib/help-assistant/help-gap-classification.ts`
- `lib/help-assistant/help-assistant-context.ts`

The current local event shape is a contract prototype only. It is not durable truth.

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

Because Ask Compliance Matters is currently mounted only on those routes, first persistence should reject or no-op any other route unless the mounting scope is explicitly expanded.

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

Recommended V1 review access:

- Platform owner/support-internal review first.
- Tenant owner/admin review should be deferred until a separate privacy and trust review decides whether customers should see their own help-gap events.
- Billing/AR should not have review access in V1.
- Technicians and field users should not have review access in V1.
- Contractor/portal users should not have review access in V1.

Rationale:

- Help gaps can contain user confusion, support-sensitive context, and product-quality signals.
- Tenant-visible review could chill user feedback or expose worker uncertainty.
- Platform owner/support-internal review fits current Support V0 and owner-led rollout posture.

Access boundaries:

- No Support Console dependency.
- No impersonation.
- No support-side tenant mutation.
- No customer-facing exposure.
- No tenant operational record edits.
- No payment, invoice, customer, job, team, or company-profile mutation.

Future tenant owner/admin review may be considered only after:

- copy/trust policy is approved,
- sensitive text handling is proven,
- role visibility is reviewed,
- and review actions are limited to product-feedback visibility, not support mutation.

## 8. Review Workflow

Recommended review statuses:

- `new`
- `reviewed`
- `converted_to_help_article`
- `linked_to_support_case`
- `dismissed`
- `product_backlog`
- `bug_candidate`

Recommended V1 allowed actions:

- View sanitized item.
- Mark reviewed.
- Dismiss.
- Mark product backlog candidate.
- Mark bug candidate.
- Copy sanitized summary manually.

Deferred actions:

- Create support case from item.
- Link to existing support case.
- Create help article.
- Create product backlog item.
- Create bug ticket.
- Add internal support note.
- Notify user.

V1 safest review surface:

- Read-only list/detail plus `mark reviewed` and `dismiss`.

If write actions are added, they must mutate only the help-gap table and must not touch tenant operational records or support-case tables unless separately approved.

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

First useful summaries:

- Top unknown questions.
- Top not-helpful answer keys.
- Top `still_need_help` routes.
- Most confusing routes.
- Most confusing training missions.
- Most confusing setup steps.
- Category counts over time.
- Role-based confusion patterns.
- Repeated payment/setup questions.
- Repeated bug-like questions.
- Fallback rate by page family.
- Feedback rate by answer key.

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

Existing flag:

- `ENABLE_ASK_COMPLIANCE_MATTERS`
  - Controls assistant visibility/runtime shell.

Recommended future flags:

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
