# Compliance Matters Software — Copilot Instructions (GLOBAL)

You are working inside a production system with a locked architecture.

This project follows strict source-of-truth ownership and lifecycle rules.
Do NOT improvise, guess, or introduce parallel logic.

---

## CORE RULES

- Preserve existing architecture at all times
- Prefer additive changes over rewrites
- Do NOT create duplicate logic paths
- Do NOT infer behavior from UI
- Always trace to the source-of-truth layer first
- Fix root cause, not symptoms
- Keep patches minimal and localized

---

## SOURCE OF TRUTH (CRITICAL)

- `job_events` = narrative / timeline truth
- `ecc_test_runs` = ECC test truth
- `jobs.ops_status` = operational projection ONLY
- `service_cases` = problem/container continuity
- `jobs` = visit/execution unit

Never move these responsibilities into UI or duplicate them elsewhere.

---

## LIFECYCLE RULES

- Lifecycle is resolver-driven, not UI-driven
- UI must NEVER invent:
  - job status
  - pass/fail
  - lifecycle transitions

- ECC outcomes must come from `ecc_test_runs`
- `ops_status` must remain a projection, not a decision layer

---

## RETEST LOGIC (LOCKED)

- Retests are NEW jobs (child jobs)
- Parent job remains historically failed
- Only the active retest is actionable
- Do NOT merge, overwrite, or collapse job history

---

## CHANGE DISCIPLINE

Before making any change:

1. Identify the owner domain (DB / resolver / action / UI)
2. Confirm source-of-truth layer
3. Trace where the incorrect behavior originates
4. Apply the smallest possible fix

---

## DEBUGGING MODE

When fixing bugs:

- Perform a blast-radius check
- Identify all dependent layers before editing
- Call out assumptions explicitly
- Do NOT patch UI if issue originates upstream

---

## UI RULES

- UI is a reflection layer only
- UI must not:
  - calculate lifecycle
  - determine ECC results
  - override backend logic

- UI changes must be presentation-only unless explicitly instructed

---

## OUTPUT STYLE

- Be concise and implementation-focused
- Prefer exact file targets
- Prefer minimal diffs over large rewrites
- Explain WHY the chosen layer is correct before proposing changes

---

## IF UNSURE

- Stop and identify the correct source-of-truth layer
- Do NOT guess