# Archive — historical evidence, not current truth

**Nothing in this folder describes how the system works today.** These are finished records: lane closeouts, phase evidence, and audits whose recommendations were either adopted long ago or abandoned. They are kept because they explain *why* decisions were made, and because git history alone is a poor place to look that up.

## If you are an agent reading this

Do not cite anything here as current behavior, current status, or current direction. If a document here contradicts the code, the code is right. If it contradicts a document in `docs/ACTIVE/`, ACTIVE is right.

Current truth lives in exactly three places:

- [`docs/PROJECT_TRUTH.md`](../PROJECT_TRUTH.md) — what the system is, locked architecture, standing constraints
- [`docs/CURRENT_ROADMAP.md`](../CURRENT_ROADMAP.md) — lane status, what is deferred, next safe slices
- [`docs/ACTIVE/`](../ACTIVE/) — durable model specs, roadmaps, runbooks, and evidence ledgers still in force

The full rules are in [`docs/ACTIVE/Documentation_Authority_Map.md`](../ACTIVE/Documentation_Authority_Map.md).

## Why these were moved (2026-08-09)

`docs/ACTIVE/` held 95 files against 5 archived. Since "ACTIVE" is the folder an agent trusts, a label that covers almost everything carries no information — and several of these documents were actively misleading, describing shipped work as pending or unstarted.

Thirty documents were moved on evidence rather than guesswork: each one either declares itself CLOSED / COMPLETE / SUPERSEDED in its own status line, or belongs to a lane that has since shipped.

Two groups moved:

- **The Workflow Modernization B-series (20 docs, B1 through B8C).** Field-billing work that shipped and closed as Field Invoice Flow V1. Moved as a unit so the dense cross-links between them stayed valid. This includes the "model lock candidate" audits, which were never promoted to locks and whose subject matter shipped without them — several declare authority subordinate to `Active Spine V4.0 Current.md`, which is itself retired.
- **Ten standalone closeouts**, including the Pass 2D-C series, the schema stabilization and service-plan cleanup closeouts, the Stripe auto-reconciliation closeout, and the ECC/guided-workflow maturity closeouts.

Every inbound link from a document that stayed was repointed in the same commit. Nothing was deleted, reworded, or rewritten — `git mv` only, so history follows the file.

## What deliberately did NOT move

Some documents look archivable by their status line but were kept because live docs depend on them:

- `Documentation_Consolidation_Audit` — referenced by `CURRENT_ROADMAP` and six other current docs.
- `Current_App_Baseline_and_Competitive_Audit_2026-07-06` — cited by the live Release Scope roadmap.
- `Payment_Controls_Hardening_Closeout_2026-08-09` — still the current record of recently shipped work.
- Evidence ledgers (`Domain_Model_Closeout_Evidence_Ledger`, `Service_Plan_Model_Closeout_Evidence_Ledger`) — append-only and still written to.
