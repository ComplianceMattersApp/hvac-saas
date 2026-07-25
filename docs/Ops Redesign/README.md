# Ops Board Redesign — original concept handoff

Implementation status: desktop direction has been reconciled and approved.
For any new work, start with `../OPS_DESKTOP_QUEUE_CONTRACT.md`. That contract
supersedes this concept package wherever later queue-engine findings or explicit
approvals differ. Do not use this folder to restore old card logic or actions.

**Scope: the `/ops` Operations Workspace page only.** Visual change. No functionality changes.

This folder is self-contained and replaces any earlier package. If you have a `docs/Ops Redesign`
folder with files named `VISUAL-ALIGNMENT-SPEC.md`, `OPERATIONS-IMPLEMENTATION-PROMPT.md`,
`ROADMAP-BACKLOG.md`, or screenshots numbered `01`–`12`: **those are unrelated earlier passes**
(Tests, Equipment, Customers, contractor portal). Delete them from the ops folder and work only
from the four files below.

---

## Manifest — verify each file matches its label before you start

| File | What it is | First line you should see |
|---|---|---|
| `01-ops-board-spec.md` | **The spec.** The only document you implement from. | `# EveryStep FieldWorks — Ops Board Visual Spec` |
| `02-board-target.png` | **The visual target.** Ops board: navy top nav, beige canvas, white ledger with 6 job rows, sticky right rail (Queues / Queue health / Quick links). | image — badge `16a`, title "Operations Workspace" |
| `03-rail-parity.png` | Reference only. Job-page rail beside the board rail, showing which parts match and which legitimately differ. | image — badge `16b`, title "Rail parity" |
| `04-mockups.html` | Reference only. Full design canvas, self-contained, opens offline in any browser. Pan/zoom. The ops board is the **top section** (`16a`). | HTML |

If any `.md` here opens as binary, or a screenshot shows a Tests/Equipment screen, the extraction
failed — re-download this folder rather than reconciling it.

---

## Branch plan (confirmed)

```bash
git checkout main && git pull origin main
git checkout -b ui/ops-board-redesign
```

Build and test on the branch, commit per step, push the branch, open a PR, review the diff against
`main`, merge only after parity testing passes. Nothing is copied or deployed manually.

## Commit order — from §1 of the spec

1. `ui: sand canvas tokens` — **app-wide**, three fills only (§2). No layout changes. **Stop for review.**
2. `ui: ops board ledger + column headers` — §5
3. `ui: ops board right rail` — §4
4. `ui: ops sticky header band` — §3.2

Step 1 is app-wide on purpose — a half-migrated canvas is the only state that looks broken. Steps
2–4 touch `/ops` only.

## Kickoff prompt

> Read `01-ops-board-spec.md` and use `02-board-target.png` as the visual target. This is a
> visual-only pass on the `/ops` Operations Workspace — every data field, handler, and behavior
> stays (see the field-preservation matrix in §6 and the verification list in §7). Start with
> commit 1: the sand canvas tokens in §2, app-wide, three fills only, borders/ink/blue untouched.
> Show me the theme diff and the input-fill audit before touching `/ops`, then stop for review.

## Before you implement — the spec's four open questions (§8)

Age thresholds (13 / 6 days), whether the Exceptions/Waiting tick colors should be data-driven,
which columns the backend can actually sort, and whether My Work joins this pass. Ask Eddie; don't
invent answers.
