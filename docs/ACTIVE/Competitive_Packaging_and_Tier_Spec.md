# Compliance Matters — Competitive Packaging and Tier Spec

Status: ACTIVE planning spec  
Authority: Subordinate to [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md), [Product_Mode_Signup_Spec.md](./Product_Mode_Signup_Spec.md), [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md), and [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)  
Mode: Documentation/spec only (no implementation in this slice)  
Date: 2026-05-09

## 1. Purpose

Define a clear, competitive packaging strategy for Compliance Matters that separates:

- product mode
- plan tier
- feature add-ons / entitlements
- billing mode
- platform subscription billing
- tenant customer payment execution

This spec establishes placement guidance for ECC/HERS and HVAC Service packaging without implementing schema, entitlements, billing, or product behavior.

## 2. Concept Separation

Definitions are locked and must stay separate:

- `product_mode`: identity of the company workflow posture (`ecc_hers`, `hvac_service`, future `hybrid` only if explicitly designed)
- `plan_tier`: commercial package level (`Standard`, `Growth`, `Pro`)
- `feature_addons` / entitlements: capability switches on top of tier
- `billing_mode`: pricing/billing configuration concept (not product identity)
- platform subscription billing: how the platform charges the tenant account for Compliance Matters access
- tenant customer payment execution: payment rail used by tenant to collect customer invoice payments

Separation rule: `product_mode` and `plan_tier` are orthogonal; neither should be reused as the other.

Product Mode V2 decision alignment:

- Product mode lives in dedicated account-level settings (likely `account_settings`), not in billing/tier/entitlement/profile display fields.
- `product_mode` is nullable for first rollout to keep migration/rollout risk low.
- Resolver order is:
	1. real account setting
	2. temporary Slice 1 override
	3. signal fallback
	4. safe default
- Product mode controls workflow relevance/defaults only.
- Product mode does **not** control billing, payments, RLS/security, source-of-truth behavior, contractor authority, report datasets/calculations, tier/add-on enforcement, or feature flags.

Implementation closeout snapshot (2026-05-09):

- Product Mode V2 Slice 1 is implemented in commit `c42f4a2`.
- ECC Naming Phase 1 is implemented in commit `6680ba8`.
- Resolver read precedence is now live in code as documented:
	1. real account setting
	2. temporary Slice 1 override
	3. signal fallback
	4. safe default
- Mapping remains unchanged:
	- `hybrid` -> ECC default
	- `ecc_hers` -> ECC default
	- `hvac_service` -> Service default
- Contractor mode remains unchanged.
- Draft `jobType` still wins.
- ECC and Service remain selectable.
- Customer-facing/product wording should prefer "ECC" where visible copy has been updated in Phase 1.
- Internal storage/type values remain intentionally unchanged (`ecc_hers` remains valid and in use).
- Internal enum/data migration is deferred to future Phase 2.
- Product Mode production schema migration is now applied for `20260509120000_account_settings_product_mode_v1.sql` on production ref `ornrnvxtwwtulohqwxop`.
- Apply used an isolated worktree with final dry-run targeting only `20260509120000`.
- Verification confirmed `public.account_settings` schema objects (columns, PK/FKs/check, RLS, policy, trigger) and migration history are correct, with row count `0`.
- No backfill or provisioning occurred in the migration window.

## 3. Product Modes

Compliance Matters supports two primary product modes on one shared engine:

1. ECC/HERS Compliance Testing
2. HVAC Service Company

Hybrid is future-only and must not be assumed until explicitly designed.

## 4. Tier Names

Packaging tier names:

1. Standard
2. Growth
3. Pro

Important mapping rule:

- Do not blindly reuse existing internal plan keys such as `starter`, `professional`, or `enterprise`.
- Any mapping/migration to user-facing tier names must be deliberate and explicitly documented in a later implementation slice.

## 5. ECC/HERS Tier Model

### ECC/HERS Standard

Included baseline:

- customers/locations
- internal ECC job creation and management
- dispatch/calendar
- ECC tests
- pass/fail tracking
- basic reports
- invoice/payment tracking (tracking truth)
- basic pricebook where applicable

Contractor portal/intake posture at this tier:

- relevant to ECC mode
- not automatically required in Standard
- can be packaged at Pro or sold via add-on entitlement strategy

### ECC/HERS Growth

Included or expected upgrades:

- advanced reports
- stronger pricebook capabilities
- SMS/status updates when built
- tenant Stripe customer payments when built (if packaged here or sold as add-on)
- optional contractor portal add-on path if commercial strategy uses add-ons before Pro

### ECC/HERS Pro

Included premium ECC workflow:

- contractor portal
- contractor job-add/intake
- contractor correction submissions
- retest-ready workflow
- contractor-facing status visibility
- contractor signals/reporting

## 6. HVAC Service Tier Model

### HVAC Service Standard

Included baseline (real service-company operating tier):

- customers/locations
- work orders/jobs
- service cases
- calendar/dispatch
- Work Items / Visit Scope
- invoice/payment tracking (tracking truth)
- basic reports
- basic pricebook
- estimates/quoting once production-ready

### HVAC Service Growth

Included or expected upgrades:

- SMS reminders and on-my-way messaging
- tenant Stripe customer payments
- stronger pricebook capabilities
- stronger team dispatch/multi-user coordination
- recurring maintenance tools when built

### HVAC Service Pro

Included premium service operations:

- advanced reporting
- advanced recurring/maintenance tooling
- deeper automations
- customer portal only if explicitly reopened later
- premium support/support-console capability if sold
- QBO remains later/downstream (not required for Pro launch)

## 7. Add-On Recommendations

Recommended classification by capability:

| Add-on capability | Recommendation |
|---|---|
| `contractor_portal` | ECC/HERS Pro included by default, optionally sellable add-on for ECC/HERS Growth |
| `contractor_intake` | ECC/HERS Pro included by default, optionally add-on for ECC/HERS Growth |
| `contractor_correction_submissions` | ECC/HERS Pro included by default, optionally add-on for ECC/HERS Growth |
| `estimates` | HVAC Service Standard+ when production-ready; optional ECC add-on later |
| `advanced_pricebook` | Growth+ candidate in both modes |
| `recurring_services` | HVAC Growth/Pro; parked until built |
| `sms_texting` | Growth+ candidate in both modes when provider/setup exists |
| `tenant_stripe_payments` | Growth+ candidate in both modes when execution is enabled |
| `multi_user_dispatch` | Growth+ candidate, especially HVAC |
| `support_console_readonly` | Optional premium/support add-on (internal governance still runbook-gated) |
| `customer_portal` | Parked/future add-on only if reopened with separate design |
| `qbo_sync` | Later/downstream add-on only |

## 8. Feature Placement Summary

| Feature | ECC/HERS placement | HVAC Service placement | Status (`included` / `add-on` / `parked` / `later`) | Notes |
|---|---|---|---|---|
| Customers/Locations | Standard included | Standard included | included | Shared engine core |
| Internal jobs/work orders | Standard included | Standard included | included | ECC defaults to compliance jobs; HVAC defaults to service work orders |
| Calendar/dispatch | Standard included | Standard included | included | Shared scheduling surface |
| ECC tests + pass/fail | Standard included | Not primary | included (ECC) / later or hidden (HVAC) | Relevance controlled by product mode |
| Service cases + Work Items | Included (shared continuity) | Standard included | included | HVAC emphasis; ECC can still use shared continuity model |
| Basic reports | Standard included | Standard included | included | Mode-aware presets later |
| Advanced reports | Growth+ | Pro | included by tier | Packaging decision; no implementation in this slice |
| Contractor portal | Pro included; optional Growth add-on | Hidden by default | included (ECC Pro) / add-on (ECC Growth) / parked (HVAC default) | Product-mode relevance first |
| Contractor intake/job-add | Pro included; optional Growth add-on | Hidden by default | included/add-on (ECC) / parked (HVAC default) | Not core to HVAC V0 |
| Contractor correction submissions | Pro included; optional Growth add-on | Hidden by default | included/add-on (ECC) / parked (HVAC default) | ECC retest chain feature |
| Retest-ready workflow | Pro included | Hidden/de-emphasized by default | included (ECC Pro) / parked (HVAC default) | HVAC uses return-visit/follow-up model |
| Related Companies (internal tracking) | Not primary | HVAC Service V1 candidate | included (HVAC baseline candidate) / later (ECC, if explicitly expanded) | Separate from `contractor_id`; no portal/authority/billing behavior in V1 |
| Estimates/quoting | Optional add-on later | Standard+ when production-ready | later | Enablement remains separately gated |
| Advanced pricebook | Growth+ | Growth+ | included by tier | Shared commercial enhancement |
| Recurring services | Later; optional | Growth/Pro target | later | Built later, not active now |
| SMS texting | Growth+ or add-on | Growth+ or add-on | later | Competitive expectation; provider setup separate |
| Tenant Stripe payments | Growth+ or add-on | Growth+ or add-on | later | Competitive expectation; execution separately gated |
| Multi-user dispatch | Growth+ | Growth+ | included by tier | Single-operator remains supported |
| Support console read-only | Optional premium add-on | Optional premium add-on | later | Runbook-gated operationally |
| Customer portal | Future add-on only | Future add-on only | parked | Separate customer/location visibility design required |
| QBO sync | Future add-on only | Future add-on only | later | Downstream integration only |

Related Companies packaging boundary note (planning):

- Related Companies V1 is positioned as internal HVAC Service tracking, not external-party access.
- V1 must remain separated from contractor authority (`contractor_id`) and from billing truth behavior.
- Advanced capabilities (billing responsibility workflows, estimate/invoice sharing, notifications, portal/external-party accounts) remain later tier/add-on roadmap work.

## 9. Competitive Positioning Summary

Market pattern summary (used as guidance, not a copycat requirement):

- low/mid tiers in service platforms usually include customers, jobs/work orders, scheduling, invoicing, quoting, and often payment collection options
- SMS, automations, recurring programs, advanced reporting, customer portals, and accounting integrations often move up-tier or become add-ons
- contractor/external-submitter portal capabilities are often a premium workflow in compliance-heavy products

Compliance Matters should follow this pattern selectively while preserving product truth boundaries and owner direction.

## 10. Product Mode vs Tier Examples

Examples to preserve conceptual separation:

- ECC/HERS mode makes contractor portal workflows relevant; Pro (or an add-on entitlement) enables them.
- HVAC Service mode makes estimates/quoting central; tier/add-on decides depth.
- `billing_mode` is not product identity.
- tenant Stripe customer payments are not platform subscription billing.

## 11. Signup Implications

Future signup and account setup should capture independently:

1. product mode
2. plan tier
3. optional add-ons

This prevents coupling mistakes such as inferring product identity from billing plan keys.

## 12. UI Visibility Implications

Visibility and access controls should follow this order:

1. `product_mode` controls feature relevance and default navigation emphasis
2. `plan_tier` plus add-ons controls capability availability
3. platform entitlements controls write access and enforcement
4. feature flags controls rollout safety

Product Mode V2 rollout boundary:

- first implementation should be additive and reversible
- admin starts with read-only display of resolved mode
- admin mutation/edit UI is later
- signup mode capture is later
- tier/add-on enforcement is later
- full mode-aware navigation/report rewrites are later
- internal enum/data rename migration is later (Phase 2)

## 13. Non-Goals

Out of scope for this slice:

- no schema changes
- no `plan_tier` implementation
- no `product_mode` implementation
- no billing changes
- no entitlement changes
- no signup routes
- no Estimates production enablement
- no SMS setup
- no tenant Stripe payment execution
- no QBO work
- no customer portal work
- no codebase split

## Cross-Reference Notes

This spec aligns with:

- [Product_Mode_Signup_Spec.md](./Product_Mode_Signup_Spec.md)
- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)

This document is planning-only and does not activate implementation.

---

## Group 7A — Pricing / Tiers / Seat Alignment: Roadmap Placement (May 2026)

Group 7A is planned and not yet started.

This spec is the primary planning artifact for Group 7A.

Group 7A scope when opened:
- Finalize tier naming alignment (Standard / Growth / Pro) and map to internal plan keys.
- Define seat count boundaries per tier for ECC/HERS and HVAC Service modes.
- Confirm add-on placement for contractor portal, estimates/quoting, SMS, customer portal, and QBO.
- Define tier enforcement model (entitlement gates, billing mode coupling, provisioning path writes).
- Plan upgrade/downgrade path and trial-to-paid conversion boundaries.

Group 7A must remain non-implementing until explicitly opened. No schema changes, no entitlement enforcement, no billing changes, and no plan_tier implementation are in scope until Group 7A is formally started.

See `docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md` section 13 for the full remaining roadmap sequence.