# Estimates Internal-Only Production Enablement Runbook

Status: ACTIVE EXECUTION-CONTROLLED PLANNING ARTIFACT  
Authority: Subordinate to `docs/ACTIVE/Active Spine V4.0 Current.md` and `docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md`  
Scope: Production enablement procedure for Estimates V1 internal-only slice. No execution has occurred.

---

## 1. Executive summary

This runbook defines how internal-only production Estimates enablement must be executed through strict, auditable gates.

### Current locked status

- Estimates V1A-V1J is implemented to the current guarded internal baseline.
- Production estimates are not live.
- Production estimate migrations are not applied.
- Production `ENABLE_ESTIMATES` remains unset/false.
- Production `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
- All estimate routes redirect to `/ops?notice=estimates_unavailable` in production.
- Estimates nav remains hidden in production while `ENABLE_ESTIMATES` is disabled.
- The sole pre-production code blocker (missing `createEstimateDraft` fail-closed flag check) is now resolved and committed.

### Locked internal-only boundaries for this runbook

This runbook covers **internal-only visibility only**.

The following are explicitly out of scope for this runbook and must not be enabled:
- real outbound estimate email (`ENABLE_ESTIMATE_EMAIL_SEND` must remain false)
- PDF generation or storage
- persistent revision storage
- customer approval or e-signature
- customer portal estimate visibility
- public estimate links or tokens
- contractor visibility or authority
- estimate-to-job conversion
- estimate-to-invoice conversion
- payment or deposit
- Stripe tenant payment behavior
- QBO behavior

### Execution rule

Production enablement is allowed only after explicit gate approval at each phase, evidence capture, rollback readiness, and final sign-off. Each gate is a hard stop.

---

## 2. Owner / responsibility table

| Role | Owner | Responsibility | Authority |
|---|---|---|---|
| Release coordinator | RELEASE_OWNER | Runs checklist, tracks gates, records timestamps and evidence | Recommends go/no-go |
| Engineering lead | ENG_LEAD | Validates technical readiness and rollback feasibility | Joint approver |
| Data owner | DB_OWNER | Validates migration readiness and post-apply checks | Joint approver |
| Security/compliance owner | SEC_COMP_OWNER | Validates RLS, least privilege, tenant boundaries, and auditability | Joint approver |
| QA/validation owner | QA_OWNER | Executes or witnesses smoke evidence steps | Recommends |
| Incident commander | IC_OWNER | Owns rollback command decision during an incident | Rollback authority |
| Product/final approver | PRODUCT_OWNER | Final launch authorization | Final approver |

---

## 3. Required placeholders / inputs

Do not hardcode production secrets or project IDs in this document. Use placeholders:
- `PRODUCTION_PROJECT_REF` — Supabase project reference for production (`ornrnvxtwwtulohqwxop`)
- `SANDBOX_PROJECT_REF` — Supabase project reference for sandbox (`kvpesjdukqwwlgpkzfjm`)
- `RELEASE_OPERATOR` — person executing the runbook
- `CHANGE_WINDOW` — approved datetime range and timezone
- `DEPLOYMENT_ID` — the production build/commit hash being enabled against
- `EVIDENCE_LOCATION` — agreed storage path for screenshots and logs

Additional required inputs before any phase begins:
- Approved change window and timezone
- Named live decision channel
- Evidence storage location
- Rollback on-call roster
- Confirmation that sandbox end-to-end smoke was completed and signed off

### 3.1 Hard stop gates

Before any production action begins, every gate below must pass. A single failure is a hard stop; do not proceed until it is resolved and re-confirmed.

| # | Gate | Verification command / action | Required result |
|---|---|---|---|
| G-1 | Branch is `main` | `git branch --show-current` | `main` |
| G-2 | Working tree is clean | `git status` | `nothing to commit, working tree clean` |
| G-3 | Source docs committed | `git log --oneline -3` | All estimate doc and code changes visible in log |
| G-4 | Production project ref | Confirm linked project in Supabase CLI (`supabase status` or `supabase projects list`) | `ornrnvxtwwtulohqwxop` |
| G-5 | Sandbox project ref | Confirm sandbox project ref | `kvpesjdukqwwlgpkzfjm` |
| G-6 | Email send flag | Confirm `ENABLE_ESTIMATE_EMAIL_SEND` is unset or false in production env | unset / `false` |
| G-7 | Secrets hygiene | No project refs, passwords, or API keys appear in shared logs, screenshots, or chat | All clear |

Do not proceed past hard stop gates. Record gate verification evidence before advancing to Phase A.

---

## 4. Phase A — governance preflight

All checks must pass before any production action. This phase is read-only.

1. Confirm `DEPLOYMENT_ID` is deployed and traceable to the estimates V1A-V1J baseline plus the production readiness hardening guard.
2. Confirm `createEstimateDraft` fail-closed guard is present: function must return `{ success: false, error: "Estimates are currently unavailable." }` when `ENABLE_ESTIMATES` is false or unset.
3. Confirm production is still disabled (`ENABLE_ESTIMATES` unset/false) pre-change.
4. Confirm production `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false and is not changed in this runbook.
5. Reconfirm locked internal-only boundaries with all approvers (see Section 1).
6. Confirm no additional estimate features are bundled into this rollout beyond the internal-only slice.
7. Confirm rollback owner and trigger authority.
8. Confirm evidence templates are prepared before the first action.
9. Confirm all required approvers are present or formally delegated.
10. Confirm that sandbox two-migration end-to-end smoke has been completed and evidence is recorded.
11. Record preflight completion timestamp and names.

Gate decision:
- Go only if all preflight checks are complete and signed.
- No-go if any owner, approval, environment confirmation, or artifact is missing.

### 4.1 Preflight read-only verification commands

Run these commands during Phase A to verify environment state. These are **read-only**. Do not run migration or apply commands in this phase.

```sh
# G-1: Confirm branch
git branch --show-current
# Expected: main

# G-2: Confirm clean working tree
git status
# Expected: nothing to commit, working tree clean

# G-3: Show recent commits to confirm estimate baseline is present
git log --oneline -5
# Expected: commits covering estimates V1A-V1J, production readiness guard, and doc alignment

# G-4: Confirm production project is linked (Supabase CLI)
supabase status
# Or: supabase projects list
# Confirm the linked project ref is ornrnvxtwwtulohqwxop

# G-5: Review production migration history (read-only)
supabase migration list --linked
# Confirm the two estimate migrations are NOT yet listed for production:
#   20260501140000  (estimates_v1a_schema_domain)
#   20260502120000  (estimate_communications_v1h)
# Any unexpected migrations in the list are a no-go.

# G-6: Inspect current production env flag values (Vercel CLI example)
vercel env pull --environment=production
# Or inspect via Vercel dashboard: Project → Settings → Environment Variables
# Confirm ENABLE_ESTIMATES is unset or false
# Confirm ENABLE_ESTIMATE_EMAIL_SEND is unset or false
# WARNING: Do not commit or screenshot env files containing secrets.
```

> **Vercel / hosting note:** Production environment variables are managed in the hosting provider (Vercel) and are NOT reflected in `.env.local`. Always verify flag values from the Vercel dashboard or `vercel env pull` output rather than relying on local files.

---

## 5. Phase B — sandbox pre-validation (must precede any production migration)

This phase confirms that the sandbox environment is healthy and that both migrations produce the expected schema before production is touched.

### 5.1 Sandbox migration inventory

Two migrations cover the V1 estimate schema. Both must be applied in order:
1. `20260501140000_estimates_v1a_schema_domain.sql` — core estimate schema (estimates, estimate_line_items, estimate_events)
2. `20260502120000_estimate_communications_v1h.sql` — estimate_communications table

Both migrations are already applied to sandbox (`SANDBOX_PROJECT_REF`).

### 5.2 Sandbox validation checklist

Confirm that sandbox is in a healthy baseline state before proceeding:

1. `estimates` table exists and has expected columns: `id`, `account_owner_user_id`, `estimate_number`, `customer_id`, `location_id`, `service_case_id`, `origin_job_id`, `status`, `title`, `notes`, `subtotal_cents`, `total_cents`, `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`, and status timestamp fields (`sent_at`, `approved_at`, `declined_at`, `expired_at`, `cancelled_at`).
2. `estimate_line_items` table exists and has expected provenance/snapshot columns.
3. `estimate_events` table exists.
4. `estimate_communications` table exists.
5. `ENABLE_ESTIMATES=true` sandbox smoke passed: `/estimates` loads, create draft succeeds, add line item succeeds, Pricebook picker available, status transitions available, communication history renders, blocked send copy is present, no email/PDF/customer-facing controls exposed.
6. `ENABLE_ESTIMATES=false` sandbox disabled-state smoke passed: `/estimates` redirects to `/ops?notice=estimates_unavailable`, estimates nav is hidden.
7. `createEstimateDraft` returns unavailable when `ENABLE_ESTIMATES` is unset/false (confirmed by test suite: `npx vitest run lib/estimates` = `127/127`).
8. `npx tsc --noEmit` passes cleanly with no estimate-related errors.
9. Record sandbox validation evidence with operator name and timestamp.

Gate decision:
- Go only if sandbox validation evidence is recorded and signed.
- No-go on any missing table, schema drift, test failure, or smoke anomaly.

---

## 6. Phase C — production migration readiness and apply

### 6.1 Pre-apply confirmation

Before applying either migration to production:
1. Confirm target production project is `PRODUCTION_PROJECT_REF` and not sandbox.
2. Confirm current production schema does not already contain the estimate tables (guard against double-apply).
3. Confirm migration history in `schema_migrations` for `PRODUCTION_PROJECT_REF` does not already include the estimate migration timestamps.
4. Confirm both migration files are present and unmodified in the repo at the `DEPLOYMENT_ID` baseline.
5. Confirm the migration apply window is within `CHANGE_WINDOW`.
6. Confirm DB_OWNER and SEC_COMP_OWNER are present for the apply.

### 6.2 Migration apply sequence

Apply in order. Do not skip or reverse:
1. Apply `20260501140000_estimates_v1a_schema_domain.sql` to `PRODUCTION_PROJECT_REF`.
2. Verify post-apply: `estimates`, `estimate_line_items`, and `estimate_events` tables exist in production with expected columns.
3. Apply `20260502120000_estimate_communications_v1h.sql` to `PRODUCTION_PROJECT_REF`.
4. Verify post-apply: `estimate_communications` table exists in production.

### 6.3 Post-migration verification checklist

1. All four expected tables exist in production.
2. No unexpected schema drift is detected.
3. Existing non-estimate production critical paths remain healthy (jobs, invoices, calendar, ops queue).
4. `ENABLE_ESTIMATES` remains unset/false in production environment at this point.
5. Record post-migration verification evidence with operator name and timestamp.

Gate decision:
- Go only if all four tables are verified and existing paths are healthy.
- No-go on any schema anomaly, migration error, or unexpected drift.
- If migration apply fails or produces unexpected results: halt, do not proceed to Phase D, escalate to DB_OWNER and IC_OWNER.

### 6.4 Schema rollback note

There is **no casual schema rollback path** for applied migrations.

If a migration must be undone, it requires a deliberate reverse migration authored, reviewed, and applied under a separate controlled window. Do not treat disabling `ENABLE_ESTIMATES` as a schema rollback — that is feature flag rollback only.

---

## 7. Phase D — disabled-state smoke (with migration applied, flag still off)

Before enabling `ENABLE_ESTIMATES`, confirm that production is correctly fail-closed with the schema applied but the flag still off.

Checklist:
1. `ENABLE_ESTIMATES` remains unset/false in `PRODUCTION_PROJECT_REF` environment.
2. Navigate to production `/estimates` — confirm redirect to `/ops?notice=estimates_unavailable`.
3. Confirm estimates nav link is not visible in production nav.
4. Confirm no estimate rows were created or mutated during this check.
5. Record evidence with screenshots, operator name, and timestamp.

Gate decision:
- Go only if the disabled-state is confirmed clean.
- No-go if any estimate UI surface is accessible without the flag, or if any unexpected data mutation occurred.

---

## 8. Phase E — internal-only feature flag enablement

This phase enables `ENABLE_ESTIMATES=true` in the production environment for internal users only.

### 8.1 Pre-enable checklist

1. Confirm Phase D disabled-state smoke evidence is recorded and signed.
2. Confirm all Phase A-D gates are closed.
3. Confirm `ENABLE_ESTIMATE_EMAIL_SEND` will remain unset/false after this enable.
4. Confirm the enable is scoped to `ENABLE_ESTIMATES=true` only. No other flags change.
5. Confirm ENG_LEAD, DB_OWNER, and PRODUCT_OWNER are present or delegated.

### 8.2 Enable step

Set `ENABLE_ESTIMATES=true` in the production environment for `PRODUCTION_PROJECT_REF`.

Verify the deployment picks up the new value (may require a redeploy depending on environment variable strategy).

---

## 9. Phase F — internal-only production smoke

After enabling `ENABLE_ESTIMATES=true`, execute the following smoke checklist. All steps are internal-only. No customer-facing, email, PDF, or payment-related actions are performed.

### 9.1 Estimates list

- [ ] Navigate to `/estimates` as an internal user.
- [ ] Confirm the estimates list loads without error.
- [ ] Confirm no customer-facing controls are exposed.

### 9.2 Create draft estimate

- [ ] Navigate to `/estimates/new`.
- [ ] Create a draft estimate with a valid customer, location, and title.
- [ ] Confirm draft estimate is created and an estimate number is assigned (`EST-YYYYMMDD-XXXXXXXX` format).
- [ ] Confirm redirect to `/estimates/[id]` for the new draft.
- [ ] Confirm draft detail renders: estimate number, status badge, customer/location context, empty line items, totals at $0.

### 9.3 Add line items

- [ ] Add at least one manual line item (item name, type, quantity, unit price).
- [ ] Confirm line item appears in the draft with correct subtotal computation.
- [ ] Add at least one Pricebook-backed line item using the picker.
- [ ] Confirm Pricebook-backed item snapshot fields are populated correctly.
- [ ] Confirm subtotal and total recompute after each add.

### 9.4 Remove line item

- [ ] Remove one line item from the draft.
- [ ] Confirm line item is removed and totals recompute.

### 9.5 Status transitions

- [ ] Transition draft to sent. Confirm status badge updates.
- [ ] Confirm send-attempt UI renders with blocked-send copy (no email/PDF is sent).
- [ ] Confirm communication history shows a blocked-attempt record.
- [ ] Confirm line-edit controls are hidden after sent.
- [ ] Transition sent to approved. Confirm status badge updates and approved timestamp renders.
- [ ] Confirm no job, invoice, payment, conversion, or customer approval record was created.

### 9.6 Boundary confirmations

- [ ] Confirm no estimate email was sent during any step.
- [ ] Confirm no PDF was generated or stored.
- [ ] Confirm no customer portal or public-link controls are exposed.
- [ ] Confirm no contractor controls are exposed.
- [ ] Confirm `ENABLE_ESTIMATE_EMAIL_SEND` remains unset/false.
- [ ] Confirm no payment, Stripe, or QBO behavior was triggered.

### 9.7 Disabled-state regression

- [ ] Confirm that if `ENABLE_ESTIMATES` were set to false, the redirect behavior would still fire (review code guard or run a quick sandbox toggle smoke if policy allows).

### 9.8 Evidence and sign-off

- Record evidence for each step: screenshot/log, operator name, timestamp.
- File evidence at `EVIDENCE_LOCATION`.
- RELEASE_OWNER signs off that smoke is complete.
- PRODUCT_OWNER gives final authorization.

Gate decision:
- Go only if all smoke steps pass and evidence is recorded.
- No-go on any unexpected estimate behavior, email, PDF, customer exposure, payment trigger, or boundary failure.

---

## 10. Phase G — rollback plan

### 10.1 Feature flag rollback (primary path)

If smoke reveals an issue after `ENABLE_ESTIMATES=true`, the primary rollback is:

1. Set `ENABLE_ESTIMATES` to unset/false in `PRODUCTION_PROJECT_REF`.
2. Verify production reverts to disabled state: `/estimates` redirects, nav is hidden.
3. Record rollback timestamp, operator, and reason.
4. Do not attempt further estimate operations until root cause is identified and a new enablement window is approved.

Feature flag rollback does **not** undo the applied schema migrations. The estimate tables remain in the production schema after flag rollback; they will simply be inaccessible through the application.

### 10.2 Schema rollback (non-casual path)

Schema rollback is not a casual recovery option. If the estimate migrations must be reversed, this requires:
- A deliberate reverse migration authored, reviewed, tested in sandbox, and approved.
- A separate controlled change window.
- DB_OWNER and SEC_COMP_OWNER joint authorization.
- Do not attempt a schema rollback without that full process.

### 10.3 Rollback authority

IC_OWNER holds rollback command authority during an active incident. IC_OWNER may unilaterally execute Phase G.1 (feature flag rollback) without waiting for full approver quorum if the incident warrants immediate action.

---

## 11. Explicit non-goals for this runbook

The following are explicitly deferred beyond this runbook's scope. They must not be implemented during or after this enablement without a separate design pass and a new runbook:

- real outbound production estimate email (requires `ENABLE_ESTIMATE_EMAIL_SEND=true` and a separate email-enablement runbook)
- PDF generation or storage
- persistent revision storage
- customer approval or e-signature flows
- customer portal estimate visibility
- public estimate links or tokens
- contractor estimate visibility or authority
- estimate-to-job conversion
- estimate-to-invoice conversion
- payment or deposit flows
- Stripe tenant customer payment behavior
- QBO behavior or accounting sync

---

## 12. Post-enablement monitoring

After a successful internal-only enablement:
- Monitor application error logs for any unexpected estimate-related errors.
- Monitor for any accidental email send attempts (should appear as blocked-attempt records only in `estimate_communications`).
- Confirm no customer-facing estimate surfaces have appeared in production.
- Schedule a 24-hour follow-up check.
- Record monitoring results at `EVIDENCE_LOCATION`.

---

## 14. No-go conditions

The following conditions are hard stops at any phase. If any of these arise, halt immediately, do not proceed to the next phase, and notify all approvers.

| Condition | Reason |
|---|---|
| Branch is not `main` | Uncommitted or branch-specific code could be deployed instead of the locked baseline |
| Working tree is dirty | Uncommitted changes could be silently included in the deployed build |
| Production project ref is not `ornrnvxtwwtulohqwxop` | Risk of applying migrations or enabling flags against the wrong project |
| Pending uncommitted docs or code | Source of truth is not closed; proceed only from a clean committed baseline |
| Production migration list contains unexpected items | Schema may have drifted from the expected baseline |
| `ENABLE_ESTIMATE_EMAIL_SEND` is true or set | Internal-only slice must not send real email |
| Any customer/public/contractor estimate surface appears | Scope boundary violation |
| Any real outbound email is sent | Immediate rollback required |
| Any PDF or storage object is created | Scope boundary violation |
| Any payment, Stripe, or QBO behavior is triggered | Scope boundary violation |
| Any estimate-to-job or estimate-to-invoice conversion occurs | Scope boundary violation |
| Any customer approval record is created | Scope boundary violation |
| Smoke step fails or produces unexpected output | Do not advance; root-cause before retrying |
| Operator confidence is uncertain | Do not proceed on doubt; pause and review |
| Rollback owner unavailable | Do not proceed without confirmed rollback authority |
| Evidence storage is unavailable | Do not proceed without a place to record evidence |

Any single condition above requires a halt, a documented reason, and a re-approval before resuming.

---

## 15. Post-execution documentation requirements

After a successful internal-only enablement run, the following documentation updates are required **before** the execution window is considered closed.

### 15.1 Required doc updates

| Document | Section | Required update |
|---|---|---|
| `docs/ACTIVE/Active Spine V4.0 Current.md` | Estimates section | Add bullet: migrations applied to production, `ENABLE_ESTIMATES` enabled, internal-only smoke passed, `ENABLE_ESTIMATE_EMAIL_SEND` remains false, date and `DEPLOYMENT_ID` |
| `docs/ACTIVE/Compliance_Matters_Prelaunch_Confirmation_Checklist.md` | §2.3.6 + §2.20 estimates block | Mark Phase A–G gates as executed; record migration apply result, flag state, smoke result, date |
| `docs/ACTIVE/Compliance_Matters_Business_Layer_Roadmap.md` | §9 Production rollout prerequisites | Update Phase A–G gate statuses to executed/confirmed |
| `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md` | §13 Version history | Add v1.1 entry with execution date, operator, deployment ID, and outcome |

### 15.2 Required evidence records

Each of the following must be recorded at `EVIDENCE_LOCATION` before the window closes:

- Phase A: preflight completion timestamp and approver names
- Phase B: sandbox validation evidence with operator name and timestamp
- Phase C: post-migration verification screenshots (all four tables confirmed), operator name, timestamp
- Phase D: disabled-state smoke screenshots before flag enable
- Phase E: flag enable confirmation with timestamp
- Phase F: all smoke checklist steps with screenshots/logs, operator name, timestamp
- Phase G ready state: rollback procedure reviewed and owner confirmed (whether or not rollback was executed)

### 15.3 Required explicit confirmations in the post-execution record

The post-execution record must explicitly state:
- `ENABLE_ESTIMATE_EMAIL_SEND` remained false/unset throughout and was not changed.
- No real outbound email was sent.
- No PDF was generated or stored.
- No customer/public/contractor estimate surface was exposed.
- No estimate-to-job or estimate-to-invoice conversion occurred.
- No payment, Stripe tenant payment, or QBO behavior was triggered.
- No customer approval record was created.

---

## 16. Final recommendation

### Current eligibility

The project is **eligible for a future internal-only production enablement run** based on the following confirmed baseline:

- Estimates V1A-V1J is implemented to the guarded internal baseline.
- The sole pre-production code blocker (`createEstimateDraft` missing fail-closed guard) is resolved and committed.
- `lib/estimates` test suite passes at `127/127`; `npx tsc --noEmit` is clean.
- Both estimate migrations are applied to sandbox and confirmed healthy.
- Sandbox end-to-end smoke has been completed (V1J draft-detail smoke closed).
- Source docs are committed and aligned.
- This runbook is documented and covers all required phases.

### Unresolved decisions / blockers before execution

The following items must be resolved before executing this runbook against production:

| # | Item | Status |
|---|---|---|
| 1 | Named production approver (`PRODUCT_OWNER`) confirmed and available for change window | Pending operator confirmation |
| 2 | `CHANGE_WINDOW` — approved datetime range and timezone agreed | Pending scheduling |
| 3 | `EVIDENCE_LOCATION` — agreed storage path for screenshots and logs | Pending agreement |
| 4 | Rollback on-call roster confirmed for the change window | Pending confirmation |
| 5 | Named live decision channel open during execution | Pending confirmation |
| 6 | All hard stop gates (§3.1) pass at execution time | Must be confirmed live |
| 7 | `DEPLOYMENT_ID` confirmed as the estimates V1A-V1J + guard baseline build | Must be confirmed live |

### What this runbook does NOT grant

Completing this runbook does not authorize:
- `ENABLE_ESTIMATE_EMAIL_SEND=true` — requires a separate email-enablement runbook
- PDF generation or storage
- Customer portal or public estimate visibility
- Contractor estimate access
- Estimate-to-job or estimate-to-invoice conversion
- Payment, Stripe tenant payment, or QBO behavior

---

## 13. Runbook version history

| Version | Date | Author | Notes |
|---|---|---|---|
| v1.0 | May 3, 2026 | Initial draft | Planning-only; no production execution. |
| v1.1 | May 3, 2026 | Planning pass | Added production project ref (`ornrnvxtwwtulohqwxop`), hard stop gates (§3.1), preflight commands (§4.1), no-go conditions (§14), post-execution doc requirements (§15), final recommendation (§16). No execution; planning-only. |
