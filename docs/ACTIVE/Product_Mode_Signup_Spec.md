# Compliance Matters Software — Product Mode Signup Spec

Status: ACTIVE planning spec  
Authority: Subordinate to [Active Spine V4.0 Current.md](./Active%20Spine%20V4.0%20Current.md), [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md), and [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)  
Mode: Documentation/spec only (no implementation in this slice)  
Date: 2026-05-08

## 1. Purpose

This spec defines two signup/onboarding versions on one shared Compliance Matters platform engine:

1. ECC/HERS Compliance Testing version
2. HVAC Service Company version

This is not a second app and not a codebase split.

This spec is a planning contract for future product-mode/account setup work and does not implement signup behavior in this slice.

## 2. Signup Versions

The product supports two onboarding choices for new companies:

1. ECC/HERS Compliance Testing
2. HVAC Service Company

Both choices provision into the same shared platform with different defaults and presentation emphasis.

## 3. Shared Foundation

Both versions share the same core foundation:

- accounts/tenants
- users/internal roles
- customers
- locations
- jobs
- service cases
- scheduling/calendar
- Work Items / Visit Scope
- notes/timeline
- attachments
- reports
- invoices/payment tracking
- pricebook
- notifications
- admin/company profile
- mobile/PWA shell
- source-of-truth model

Source-of-truth ownership remains unchanged:

- `job_events` = narrative/operational truth
- `ecc_test_runs` = ECC test truth
- `jobs.ops_status` = operational projection
- `service_cases` = continuity truth
- `jobs` = visit/execution truth

## 4. ECC/HERS Signup Defaults

When a company signs up as ECC/HERS Compliance Testing, default posture should be:

- product mode: ECC/HERS Compliance Testing
- job creation default: ECC/compliance job
- contractor intake/review is relevant/available in ECC mode
- contractor portal is relevant/available in ECC mode
- contractor admin visible
- ECC tests visible
- failed-test correction evidence visible
- retest review/request workflows visible
- cert/paperwork closeout emphasized
- contractor reports/signals visible
- compliance-oriented reporting emphasized
- ECC/compliance starter kit when starter kits become mode-aware

Tier/add-on clarification (future implementation):

- ECC/HERS Standard supports internal ECC job creation and ECC workflow management.
- Contractor portal/intake/correction flows should be enabled by tier/add-on/entitlement policy (for example Pro tier or explicit add-on), not by product mode alone.

## 5. HVAC Service Signup Defaults

When a company signs up as HVAC Service Company, default posture should be:

- product mode: HVAC Service
- job creation default: Service / Work Order
- contractor intake hidden/de-emphasized by default
- contractor portal hidden/de-emphasized by default
- ECC job creation hidden/de-emphasized by default
- customers/locations emphasized
- calendar/dispatch emphasized
- service cases emphasized
- Work Items emphasized
- internal users/technicians emphasized
- waiting reasons emphasized
- invoice/payment tracking emphasized
- service reports emphasized
- estimates/quoting positioned as service-first future module
- recurring services positioned as future service-side module
- service starter kit when starter kits become mode-aware

Tier/add-on clarification (future implementation):

- HVAC Service should hide contractor portal/intake by default unless a future entitlement explicitly enables a compatible workflow.
- Estimates, SMS, tenant customer payments, and recurring-service capabilities should be controlled by tier/add-on policy rather than product mode identity alone.

## 6. Future Account-Level Product Mode

Future implementation can introduce an account-level identity setting concept such as:

- `product_mode = "ecc_hers" | "hvac_service" | "hybrid"`

Clarifications:

- This is a future implementation concept only.
- Do not implement schema in this slice.
- Do not reuse `billing_mode` for product identity.
- `billing_mode` and `product_mode` are separate concepts and must remain separate.

## 7. Signup Flow Concepts

Possible future signup approaches:

1. One signup page with an explicit choice:
   - "I run a compliance testing/HERS business"
   - "I run an HVAC service company"
2. Separate signup routes, for example:
   - `/signup/ecc`
   - `/signup/service`

Clarifications:

- Actual routes are not implemented now.
- Final route names can be decided later.

## 8. Setup Checklist Differences

Future onboarding/setup should emphasize different priorities by version.

ECC/HERS setup emphasis:

- company profile
- contractors
- contractor users
- test workflows
- permit/cert closeout
- compliance reports

HVAC Service setup emphasis:

- company profile
- internal team/technicians
- customers/locations
- pricebook/work items
- calendar/dispatch
- invoice/payment tracking
- service reports

## 9. Navigation/Admin/Report Implications

Future mode-aware behavior should follow these rules:

- ECC/HERS keeps Contractors / Contractor Intake / Tests / Retests / Compliance Closeout emphasis
- HVAC Service favors Team / Technicians / Dispatch / Work Orders / Service Cases / Work Items
- reports should eventually provide mode-aware presets
- admin should eventually hide/de-emphasize mode-irrelevant cards

This is a future presentation/configuration pass, not a current implementation requirement.

## 10. Portal Boundary

Current portal model is contractor-focused.

Rules:

- ECC/HERS version treats contractor portal/intake as relevant workflows, with final enablement controlled by tier/add-on/entitlement policy.
- HVAC Service version should not show contractor portal/intake by default.
- No customer portal is included in current scope.
- Any future customer portal requires customer/location-scoped visibility and separate design.

## 11. Relationship to Upcoming Estimates / Quoting

Estimates / Quoting V1 can proceed before full signup/product_mode implementation.

Planning rules:

- Estimates should be planned as shared/service-first while respecting product separation rules.
- HVAC Service likely uses estimates as a core workflow.
- ECC/HERS may use estimates optionally for service/add-on/commercial work.

This preserves current release-scope boundaries while enabling forward planning.

## 12. Implementation Sequence Recommendation

Recommended future implementation order:

1. Product Mode Signup Spec (this document)
2. Add account-level `product_mode` field later
3. Apply safe defaults such as `/jobs/new` default by product mode
4. Add signup choice/routes
5. Add mode-aware navigation/admin/report/starter-kit behavior
6. Add hybrid mode only if needed later

## 13. Non-Goals

Out of scope for this slice:

- no schema changes
- no signup route implementation
- no `product_mode` field implementation
- no navigation rewrite
- no contractor portal removal
- no customer portal work
- no Estimates production enablement
- no payment/SMS/QBO work
- no codebase split

## Cross-Reference Notes

This spec aligns with:

- [Compliance_Matters_Business_Layer_Roadmap.md](./Compliance_Matters_Business_Layer_Roadmap.md)
- [Owner_Led_Go_Live_Readiness_Addendum.md](./Owner_Led_Go_Live_Readiness_Addendum.md)
- [Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md)
- [Competitive_Packaging_and_Tier_Spec.md](./Competitive_Packaging_and_Tier_Spec.md)

These references are for planning alignment only and do not activate implementation changes.