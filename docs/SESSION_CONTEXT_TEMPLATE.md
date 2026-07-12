# Session Context — paste at the start of any Claude/Codex session

Copy this block, fill the [BRACKETS], and paste it to brief the agent. Delete these two lines when you paste.

---

**Product:** EveryStep JobWorks — field service management (FSM) for HVAC service companies and ECC/HERS compliance raters. Event-driven operational workflow system: scheduling, staffing, contractor collaboration, audit-backed job resolution. Not a CRUD app, not a calendar toy, not portal-first.

**Deeper context (read if you need it):**
- Stable truth, locked architecture, standing constraints → `docs/PROJECT_TRUTH.md`
- Active lanes, status, next safe slices → `docs/CURRENT_ROADMAP.md`

**This session**
- Active lane: [e.g. Lane 4 — SMS to Toggle-Ready]
- Task for this session: [the one specific thing you want done]
- Next safe slice (from CURRENT_ROADMAP): [the smallest next step; leave blank to have the agent propose one]
- Off-limits this session: [anything the agent must not touch, e.g. "no SMS live send", "docs only", "no schema"]
- Definition of done: [what "finished" looks like — tests pass, owner smoke pending, etc.]

**Standing constraints — always apply (do not violate without explicit owner approval):**
- Source of truth is locked: `job_events` = narrative truth · `ecc_test_runs` = ECC technical truth · `jobs.ops_status` = operational projection (never freeform UI state) · `service_cases` = continuity container.
- UI never owns lifecycle truth and never guesses ECC resolution. Changes are additive unless an approved change says otherwise.
- No schema / migration / Supabase / RLS change without sandbox-first discipline and confirming the target project. Sandbox = `CMTest` (`kvpesjdukqwwlgpkzfjm`); Production = `ComplianceMatters` (`ornrnvxtwwtulohqwxop`).
- No Stripe/payment behavior change; never imply live payment acceptance before it exists.
- Contractors interact only through constrained portal paths — never own lifecycle, schedule, or close jobs.
- Never work directly on `main`; branch off `sandbox-clean-start`.
- Do not modify `.github/instructions/*` or `.github/prompt/*` (operational tooling config, not docs).
- If a locked decision, production-protection rule, or owner-approved boundary is in the way: STOP and ask, don't guess.

**Your job this session:** do exactly the task above and nothing more. Work in the smallest safe slice. Verify before claiming done (typecheck/tests where relevant; note when owner smoke is still pending). Report faithfully — if something failed or was skipped, say so. Do not commit or push unless I ask; if you commit, branch first.

---
