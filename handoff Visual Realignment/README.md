# EveryStep FieldWorks — Visual Alignment Handoff

Everything the dev pass needs to implement the approved navy visual direction.
**This is a token + component pass — no functionality changes.**

## What's in here

| File | What it is |
|---|---|
| `VISUAL-ALIGNMENT-SPEC.md` | **The spec.** Tokens, component rules, per-area work, mobile rules, guardrails, build order. Drop this in your repo root — Claude Code reads it natively. |
| `Navy-vs-Slate-mockups.html` | The full mockup canvas, self-contained. Open in any browser (offline). Pan/zoom the design doc. |
| `screens/` | PNG reference of each key before/after (see below). |

## Screens

- `01-decision-navy.png` — the navy standard (1a/1b)
- `02-equipment-before-after.png` — Equipment rebuild (2b)
- `03-customers-retint.png` — Customers token swap (4a/4b)
- `04-eyebrow-tick.png` — the eyebrow tick, with vs without (5a/5b)
- `05-mobile-tests-completed.png` — mobile Tests, completed state (3f)
- `05b-mobile-tests-multi.png` — mobile Tests, multi-test 2×2 grid (3e)
- `06-testworkflows-desktop.png` — Test Workflows desktop, final system (6b)
- `07-equipment-mobile.png` — Equipment on mobile (6a)

## How to run it in Claude Code

1. Put `VISUAL-ALIGNMENT-SPEC.md` in your repo root.
2. Work one area per commit/PR, in the spec's build order.
3. When you start an area, attach its screenshot from `screens/` as the visual target.

### Kickoff prompt

> Read `VISUAL-ALIGNMENT-SPEC.md`. We're doing a visual-alignment pass on EveryStep FieldWorks — a token + component change, **no functionality changes** (see the guardrails). Start with step 1: global tokens + the eyebrow-tick component. Show me the token/theme changes and the reusable **eyebrow** and **disclosure** components before applying them broadly, then stop for review before Equipment.

### Two things to get right as you go
- Make the **eyebrow** and **disclosure** shared components — they're used on every page.
- When you swap the four status tiles for the one-line status bar, keep the count **wired to the same completion data source** — it's a presentation change, not a data change.
