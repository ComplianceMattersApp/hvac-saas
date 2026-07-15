# Documentation Authority Map

Status: ACTIVE DOCUMENTATION WORKFLOW LOCK
Scope: docs governance only. This file does not authorize product code, schema, migration, Supabase, Stripe, payment, ECC, portal, SMS, QBO, support, or env changes.

## Purpose

This map defines where current truth, roadmap intent, launch gates, domain contracts, runbook evidence, and tactical closeouts belong.

Use this file to prevent ACTIVE docs from carrying duplicate versions of the same story.

The June 2026 consolidation assessment is preserved in [Documentation_Consolidation_Audit.md](./Documentation_Consolidation_Audit.md) as historical audit evidence. The July 2026 control plane supersedes its earlier Active Spine recommendation.

Current control-plane authority:

- [PROJECT_TRUTH.md](../PROJECT_TRUTH.md): stable product truth, locked architecture, and standing operational constraints.
- [CURRENT_ROADMAP.md](../CURRENT_ROADMAP.md): active lane status, sequencing, and next safe slices.
- [SESSION_CONTEXT_TEMPLATE.md](../SESSION_CONTEXT_TEMPLATE.md): session-start context and execution discipline.

## Authority Roles

| Doc family | Role | Should contain | Should not contain |
| --- | --- | --- | --- |
| Project Truth | Stable current product truth | Current operating posture, durable source-of-truth boundaries, locked architecture, links to canonical specs | Chronological punch-list logs, full implementation closeouts, detailed roadmap backlog |
| Release Scope / Roadmap | Strategic sequencing | Locked release scope, deferred/gated lanes, unlock criteria, roadmap order | Minor tactical fixes, UI polish logs, repeated model-spec detail |
| Prelaunch Checklist | Launch readiness / operator gates | Launch-blocking checks, operator readiness, runbook-gated launch steps | Full feature history, tactical closeout details, domain model contracts |
| Domain model specs | Durable domain contracts | Source-of-truth model, invariants, domain boundaries, approved model decisions | Global roadmap tracking, unrelated punch-list completions |
| Domain model closeout evidence ledgers | Historical domain evidence | Duplicated phase closeout proof, smoke evidence, implementation closeout summaries that support domain specs, including domain-specific ledgers such as Service Plan evidence | Durable model contracts, current-state master truth, roadmap sequencing |
| Runbooks | Execution-controlled procedure and evidence | Approved execution steps, production enablement evidence, rollback/no-go criteria | General product current-state summaries, unrelated roadmap items |
| Tactical punch-list ledger | Minor fix closeout record | Low-risk UI polish, small regressions, duplicate-submit guards, tactical performance fixes, verified commit evidence | Durable domain model contracts, strategic roadmap decisions |
| Historical closeout docs | Supporting evidence | Lane-specific completion evidence and validation history | Current-state master truth unless explicitly linked by a canonical doc |

## Update Rules

1. A completed feature that changes durable product truth may update the relevant domain spec and the Active Spine with a short current-state summary and backlink.
2. A minor fix or tactical polish should be recorded in the tactical punch-list ledger, not copied into the Spine or Roadmap.
3. Deferred or gated work belongs in the Roadmap with unlock criteria.
4. Launch-blocking operator work belongs in the Prelaunch Checklist.
5. Runbooks remain procedure/evidence docs for their domain and should receive backlinks rather than duplicated current-state narratives.
6. Historical closeout docs remain evidence/supporting records unless a cleanup pass explicitly archives or consolidates them.
7. Do not copy full closeout blocks, smoke evidence, commit logs, or model contracts into control-plane docs. Use a one-line status summary plus a backlink to the owner doc.
8. If a future prompt asks to "update docs" without naming an authority target, stop and identify the intended target before editing.

## Control-Plane Lock

The control-plane docs are:

- [PROJECT_TRUTH.md](../PROJECT_TRUTH.md): stable current product truth and locked constraints.
- [CURRENT_ROADMAP.md](../CURRENT_ROADMAP.md): active sequence, deferred lanes, and unlock criteria.
- [SESSION_CONTEXT_TEMPLATE.md](../SESSION_CONTEXT_TEMPLATE.md): session-start execution context.
- [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md): launch gates and operator readiness.
- [Tactical_Punch_List_Closeout_Ledger.md](./Tactical_Punch_List_Closeout_Ledger.md): minor fix and low-risk tactical evidence.

[Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md) is a retirement pointer only and must not be cited as current authority.

Supporting strategic docs such as the Business Layer Roadmap, Payments Roadmap, and Workflow Modernization Plan may remain ACTIVE, but they should not override the control-plane docs or duplicate historical closeout detail.

## Prompting Guidance

Future docs prompts should name the intended authority target:

- "Update product truth" means update `docs/PROJECT_TRUTH.md` with durable current truth only.
- "Update the Roadmap" means strategic sequencing, deferred lanes, and unlock criteria only.
- "Update Prelaunch" means launch-readiness gates only.
- "Update a domain spec" means durable model/source-of-truth contract only.
- "Record a tactical closeout" means add to the tactical punch-list ledger with commit evidence and guardrails.

## Current Companion Docs

- Tactical closeouts: [Tactical_Punch_List_Closeout_Ledger.md](./Tactical_Punch_List_Closeout_Ledger.md)
- Domain model closeout evidence: [Domain_Model_Closeout_Evidence_Ledger.md](./Domain_Model_Closeout_Evidence_Ledger.md)
- Service Plan model closeout evidence: [Service_Plan_Model_Closeout_Evidence_Ledger.md](./Service_Plan_Model_Closeout_Evidence_Ledger.md)
- Current product truth: [PROJECT_TRUTH.md](../PROJECT_TRUTH.md)
- Release/deferred order: [CURRENT_ROADMAP.md](../CURRENT_ROADMAP.md)
- Launch gates: [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md)
