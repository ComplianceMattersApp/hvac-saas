# Ask CM Coach Baseline V1 Audit and Knowledge Source Map

Status: implementation audit and closeout evidence
Date: 2026-07-20
Scope: guidance-only Ask Compliance Matters baseline answers; no operational mutation authority

## Documentation authority used

Current control-plane authority comes from `docs/ACTIVE/Documentation_Authority_Map.md`:

- `docs/PROJECT_TRUTH.md` for stable product truth and standing boundaries.
- `docs/CURRENT_ROADMAP.md` for current lane status only, not step-by-step workflow instructions.
- Current domain specs and completed workflow closeouts for the detailed workflow contract.
- Runtime routes, components, actions, and access helpers as the final check of what the user can actually do now.

`docs/ACTIVE/Active Spine V4.0 Current.md` is a retirement pointer and is not a current answer source. The Release Scope roadmap and Prelaunch checklist are strategic/gating records, not primary workflow instructions. Planning-only and older chronological notes were not used when a current closeout or runtime path was available.

## Existing Ask CM audit

- The launcher is globally mounted on authenticated internal app routes behind its feature flag.
- The runtime is hybrid: curated local answers are available, and the existing Trainer provider can answer broader grounded questions when enabled.
- The local matcher missed “How do I create a new job?” because it recognized narrower first-job/intake phrases, not common “new job,” “work order,” or “add job” wording.
- “How do I invoice?” reached the broad invoice/payment/billing matcher, which returned a Billing/AR responsibility summary instead of the invoice workflow.
- Unknown, Not helpful, and Still need help events have durable account-scoped storage behind Help Gap flags. Before this slice, the persistence sanitizer accepted only Admin Center and Training Room even though the launcher had become global.
- The safest baseline extension point is the pure local answer engine. It is guidance-only, has no database/provider/action imports, and can be tested independently.

## Knowledge source map

Every curated intent carries machine-reviewable `sources.docs` and `sources.code` metadata in `lib/help-assistant/ask-cm-baseline-knowledge.ts`. Tests verify that every referenced path exists.

| Answer intent | Current documentation grounding | Confirmed runtime area |
| --- | --- | --- |
| Create/schedule job | Project Truth; Visit Scope model; Mobile Job V2 blueprint | `/jobs/new`, New Job form, Calendar, job Schedule panel |
| Create/send invoice | Work Items-to-Invoice closeout; Visit Scope boundary | job detail, job invoice workspace, invoice action/access helpers |
| Record/find/report payments | B7 payment closeout; Financial Payments Register spec | job invoice payment controls, Payments report, customer Payment History |
| Close out job | Field Finish closeout; Workflow Modernization plan | job Finish Outcome and field outcome components; Closeout Operations |
| ECC retest | Guided Workflow closeout; Field Finish ECC guardrails | ECC Tests page and canonical job detail retest bridge |
| Add customer | Project Truth | Add Customer and New Job intake |
| Add equipment | Project Truth; Mobile Job V2 blueprint | job Equipment section and create form |
| Add notes/photos | Project Truth; Mobile Job V2 blueprint | job Notes composer and Photos & Files upload |
| Training Room | Startup Maturity model | Training Room route and curated training content |

## Answer and safety rules

- Curated Day 1 answers run before the broader Trainer provider so known workflows remain short and consistent.
- Answers explain what to do next, then mention permissions only where they affect the action.
- Links point only to safe internal list, report, training, calendar, and intake routes; no placeholder ids or customer/public routes are emitted.
- Ask CM remains non-mutating. It does not create jobs, invoices, payments, customers, support cases, or any other operational record.
- Unknown questions use a friendly Needs review fallback, link to Training Room and support guidance, and use the existing Help Gap path when enabled.

## Docs/code mismatches found

1. Help Gap documentation and server sanitization still described Admin Center/Training Room-only capture after the launcher became global. The sanitizer now accepts the same approved internal route families and removes record ids/query data before persistence.
2. Existing feedback help text said Not helpful was only local even though durable Help Gap persistence already exists behind flags. The answer now describes private review accurately without promising a support case or automatic model training.
3. Older local/mock wording in the Startup Maturity record no longer described the current hybrid curated-plus-grounded-Trainer posture. The closeout note now distinguishes current behavior from the historical phase.

## Recommended documentation cleanup

- Keep workflow steps in current domain closeouts/specs and code; do not copy raw long-form documentation into Ask CM.
- Gradually mark remaining chronological “future” statements in long active ledgers as historical when they conflict with current control-plane truth.
- Review this source map whenever a linked route, button label, financial permission, or workflow closeout changes.
