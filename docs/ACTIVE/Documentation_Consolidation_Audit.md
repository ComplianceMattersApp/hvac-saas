# Documentation Consolidation Audit

Status: ACTIVE AUDIT REPORT
Date: 2026-06-12
Scope: docs/ACTIVE/*.md only
Mode: audit/planning only. This report does not authorize product code, schema, migration, Supabase, Stripe, payment, ECC, portal, SMS, QBO, support, env, or production changes.

## Prerequisite / Working Tree State

Preflight `git status --short` showed no tracked uncommitted docs cleanup changes before this audit. The only pre-existing untracked item was `.claude/`.

This pass created this audit report only. No existing ACTIVE doc was deleted, renamed, moved, archived, or rewritten.

## 1. Verdict

Yes, the documentation issue is broader than a few duplicated closeout blocks.

Root cause is a mix of:

- document sprawl: 71 Markdown files currently live in `docs/ACTIVE`;
- unclear authority in practice: the authority map exists, but large docs still carry overlapping current truth, roadmap, model locks, launch gates, and historical closeouts;
- copied closeouts: payment, ECC, workflow, product-mode, service-plan, and tactical closeouts are repeated in the Spine, Roadmap, Prelaunch checklist, Business Layer Roadmap, and lane closeout docs;
- stale-risk docs: some planning docs still say draft/supporting while also containing implemented closeout truth;
- evidence preservation pressure: valuable smoke evidence and model decisions were copied into control-plane docs to avoid losing them.

The project already has the right intended control plane:

- `Documentation_Authority_Map.md`
- `Active Spine V4.0 Current.md`
- `Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `Compliance_Matters_Prelaunch_Confirmation_Checklist.md`
- `Tactical_Punch_List_Closeout_Ledger.md`

The cleanup should enforce those roles, not invent a new documentation philosophy.

## 2. Full docs/ACTIVE Inventory Matrix

| File name | Current apparent purpose | Recommended future role | Authority level | Topics covered | Duplicate / overlap topics | Staleness / conflict risk | Recommended action | Suggested owner doc or backlink destination |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Active Spine V4.0 Current.md | Current operational source of truth plus many copied closeouts | Concise current product truth only | Mission-control current truth | product posture, source-of-truth boundaries, payments, ECC, product mode, roadmap summaries | Roadmap, Prelaunch, Business Layer, closeout docs | Very high: enormous file mixes truth, roadmap, closeout history | Keep ACTIVE but trim to summary/backlinks later | Keep as owner for current posture; backlink evidence docs |
| Competitive_Packaging_and_Tier_Spec.md | Packaging/tier/product-mode planning | Supporting reference | Supporting reference | tiers, product modes, signup implications | Business Layer, Product Mode Signup, Roadmap | Medium: older HVAC Service wording risk | Keep ACTIVE as reference; update/backlink only if product-mode copy changes | Product_Mode_Signup_Spec.md / Business Layer Roadmap |
| Compliance_Matters_Business_Layer_Roadmap.md | Future business/commercial roadmap plus many payment closeouts | Strategic/domain roadmap hybrid | Strategic roadmap; candidate consolidation later | product mode, pricebook, estimates, invoices, payments, service plans, QBO | Spine, Payments Roadmap, Prelaunch, model specs | Very high: mixes subordinate roadmap, current truth, and historical evidence | Keep ACTIVE but split/trim later | Release roadmap for sequencing; model specs for contracts; Spine for current truth |
| Compliance_Matters_Payments_Roadmap.md | Payment roadmap and payment closeout history | Strategic payments roadmap | Strategic roadmap | Stripe, saved cards, autopay, payments, allocations, platform fees, deposits | Spine, Business Layer, Prelaunch, Financial Ledger spec | High: likely owns roadmap but also carries evidence | Keep ACTIVE but trim to roadmap/backlinks later | Financial specs and runbooks for evidence |
| Compliance_Matters_Prelaunch_Confirmation_Checklist.md | Launch-readiness checklist plus many completed closeouts | Launch gates only | Launch checklist | auth hardening, SMS activation, live payment readiness, launch smokes | Spine, Roadmap, Business Layer, runbooks | Very high: checklist is bloated with completion history | Keep ACTIVE but trim to launch gates/backlinks later | Spine, Roadmap, Tactical Ledger, runbooks |
| Compliance_Matters_Workflow_Modernization_Maturation_Plan.md | Workflow modernization program plan/model lock candidate | Strategic workflow modernization roadmap | Strategic roadmap | field finish, callbacks, return visits, queues, billing verification | B-series audits/closeouts, Spine, Roadmap | Medium-high: plan also summarizes closed lanes | Keep ACTIVE as roadmap/model candidate; trim closeouts | B-series docs as evidence; Spine for current truth |
| Documentation_Authority_Map.md | Defines docs governance | Governance source | Mission-control current truth | authority roles, update rules, prompt guidance | This audit | Low: correct but under-enforced | Keep as-is; enhance after audit approval | Itself |
| ECC_Guided_Workflow_Separation_Model_Lock.md | ECC vs service workflow model lock | Domain model spec | Domain model spec | ECC retest, correction, cert blockers, service separation | Spine, Workflow Plan, Guided Workflow closeout | Low-medium: should own ECC workflow truth | Keep ACTIVE as domain spec | Spine backlinks here |
| ECC_Test_Workflow_Maturity_Closeout.md | ECC UI/workflow maturity closeout | Historical closeout/evidence | Historical closeout/evidence | ECC test entry, mobile UX, validation | Spine, Roadmap, Prelaunch | Medium: copied current standard elsewhere | Move to archive/history later only after approval | Spine summary; ECC model spec backlink |
| Estimate_Multi_Option_Proposal_Model_Spec.md | Multi-option estimates/proposals model | Domain model spec | Domain model spec | estimate options, proposal approval, line rules | Business Layer, Estimates runbook | Low | Keep ACTIVE as domain spec | Business Layer backlink |
| Estimates_Production_Enablement_Runbook.md | Estimates rollout/runbook/evidence | Execution runbook | Execution runbook | estimates production enablement, validation, rollout | Estimate spec, Prelaunch, Business Layer | Medium | Keep ACTIVE as runbook | Estimate spec / Prelaunch gates |
| Financial_Ledger_Payments_Register_V1_Model_Spec.md | Payments register/ledger model | Domain model spec | Domain model spec | payment register, allocations, failed payments, reporting | Payments Roadmap, Business Layer, Prelaunch | Medium: also contains implementation notes | Keep ACTIVE as domain spec; trim evidence later | Payments Roadmap backlinks |
| Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md | Deposits/payout reconciliation model | Domain model spec | Domain model spec | deposits, payouts, settlement reporting | Spine, Payments Roadmap, Prelaunch | Medium | Keep ACTIVE as domain spec | Payments Roadmap / Prelaunch proof gate |
| First_Owner_Provisioning_Runbook.md | First-owner provisioning procedure | Execution runbook | Execution runbook | onboarding, provisioning, owner setup | Business Layer, Product Mode Signup, Prelaunch | Medium | Keep ACTIVE as runbook | Prelaunch checklist for gates |
| GTM_14_Day_Trial_Success_Pack.md | Go-to-market trial/customer success material | Supporting reference | Supporting reference | trial, customer success, onboarding | Owner-led guide, packaging, roadmap | Low-medium | Needs owner decision | Possible GTM folder/archive later |
| GTM_Owner_Led_Success_Guide_V1.md | Owner-led success guide | Supporting reference | Supporting reference | onboarding, owner-led launch | GTM trial pack, Owner addendum | Low-medium | Needs owner decision | Possible GTM folder/archive later |
| Guided_Workflow_Maturation_Closeout.md | Service/ECC guided workflow closeout | Historical closeout/evidence | Historical closeout/evidence | service follow-up, ECC retest, linked child jobs | Spine, Workflow Plan, ECC model lock | Medium | Move to archive/history later only after approval | Workflow Plan / ECC model lock backlinks |
| Maintenance_Agreements_V1_Model_Spec.md | Maintenance/service plan domain model | Domain model spec | Domain model spec | maintenance agreements, service plans, visit counts, next due | Service Plan Billing spec, Business Layer, Roadmap | Medium: contains closeout snippets | Keep ACTIVE as domain spec; split closeouts later | Payments V2 spec for billing |
| Owner_Led_Go_Live_Readiness_Addendum.md | Go-live readiness support doc | Launch/supporting reference | Launch checklist; supporting reference | owner-led launch, readiness, smoke evidence | Prelaunch checklist, GTM docs | Medium-high | Candidate consolidation later | Prelaunch checklist |
| Owner_Support_Read_Only_Drilldown_Audit.md | Support/owner visibility audit | Historical closeout/evidence | Candidate archive later | owner support, read-only drilldown | Support docs, platform support snapshot | Medium | Move to archive later only after approval | Support readiness pack |
| Pass_2D-C3_Production_Phone_Enrollment_Verification.md | Device/phone enrollment pass record | Historical closeout/evidence | Historical closeout/evidence | phone enrollment, notifications | PWA, Prelaunch, device notification docs | Medium | Move to archive later only after approval | Prelaunch / PWA audit |
| Pass_2D-C4_Device_Notifications_Settings_Surface.md | Device notification settings pass record | Historical closeout/evidence | Historical closeout/evidence | device notifications, settings UI | PWA audit, Prelaunch | Medium | Move to archive later only after approval | PWA audit / Prelaunch |
| Pass_2D-C5_Service_Mode_Alerts_Exposure.md | Service-mode alerts exposure pass record | Historical closeout/evidence | Historical closeout/evidence | service mode, alerts, product mode | Product mode, Prelaunch | Medium | Move to archive later only after approval | Product Mode Signup / Roadmap |
| Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md | Service plan billing foundation model | Domain model spec | Domain model spec | billing periods, service plan invoice linkage, autopay boundaries | Maintenance spec, Payments Roadmap, Business Layer | Medium | Keep ACTIVE as domain spec | Payments Roadmap / Maintenance spec |
| Platform_Seat_Billing_V1B_Audit.md | Platform seat billing audit | Candidate archive later | Historical closeout/evidence | platform billing, seats, subscriptions | Business Layer, Payments Roadmap, Prelaunch | Medium | Move to archive later only after approval | Payments Roadmap / Prelaunch |
| Platform_Support_Owner_Visibility_Snapshot.md | Support owner visibility snapshot | Historical closeout/evidence | Historical closeout/evidence | platform support, owner visibility | Support readiness, owner drilldown | Medium | Move to archive later only after approval | Support readiness pack |
| Product_Mode_Signup_Spec.md | Product mode/signup model | Domain model spec | Domain model spec | ECC/HERS vs Service mode, signup, product choice | Packaging spec, Business Layer, Roadmap, tactical label sweep | Medium: "HVAC Service" wording needs controlled distinction | Keep ACTIVE as domain spec | Spine summary; Tactical Ledger for label sweep |
| Production_Schema_Stabilization_Closeout.md | Schema stabilization closeout | Historical closeout/evidence | Historical closeout/evidence | schema stabilization | Spine, Prelaunch | Low-medium | Move to archive later only after approval | Source-of-truth strategy |
| PWA_Push_Outside_App_Alerts_Planning_Audit.md | PWA/push planning audit | Supporting reference | Supporting reference | PWA, push, outside-app alerts | Prelaunch, device pass docs | Medium | Keep ACTIVE as supporting reference or archive later | Prelaunch gates |
| Release_Scope_Lock_and_Post_Launch_Roadmap.md | Release scope and post-launch roadmap plus closeouts | Strategic roadmap | Strategic roadmap | release scope, deferred lanes, post-launch order, gates | Spine, Prelaunch, Business Layer, closeouts | Very high: should own order but carries evidence blocks | Keep ACTIVE but trim to sequencing/backlinks later | Spine for current posture; evidence docs |
| Service_Plans_Command_Center_Cleanup_Closeout.md | Service plans UI closeout | Historical closeout/evidence | Historical closeout/evidence | service plan command center, templates | Maintenance spec, Spine, Roadmap | Medium | Move to archive later only after approval | Maintenance spec |
| Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md | Financial role/capability model | Domain model spec | Domain model spec | Billing/AR role, financial access, protected actions | Prelaunch, Financial Ledger, B8B docs | Low-medium | Keep ACTIVE as domain spec | Financial Ledger spec / Prelaunch |
| SMS_Background_On_The_Way_Workflow_Spec.md | On-the-way SMS workflow model | Domain model spec | Domain model spec | on-the-way SMS, event gating, background workflow | SMS family, Prelaunch, source-of-truth | Medium | Keep ACTIVE as domain spec | SMS IA/spec index later |
| SMS_Compliance_and_Consent_Model_Spec.md | SMS compliance/consent model | Domain model spec | Domain model spec | consent, opt-out, compliance | all SMS specs, Prelaunch | Medium | Keep ACTIVE as domain spec | SMS IA/spec index later |
| SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md | SMS intent/delivery truth model | Domain model spec | Domain model spec | intents, provider deliveries, job_events boundary | SMS family, source-of-truth | Medium | Keep ACTIVE as domain spec | SMS IA/spec index later |
| SMS_On_The_Way_Template_Governance_Model_Spec.md | On-the-way template governance | Domain model spec | Domain model spec | templates, versions, approval, governance | SMS template editing spec, Prelaunch | Medium | Keep ACTIVE as domain spec | SMS IA/spec index later |
| SMS_Provider_Twilio_Readiness_Spec.md | Twilio/provider readiness model | Domain model spec | Domain model spec | Twilio readiness, provider config, sandbox/live | SMS sender identity, Prelaunch | Medium | Keep ACTIVE as domain spec | SMS IA/spec index later |
| SMS_Recipient_and_Contact_Role_Model_Spec.md | SMS recipient/contact role model | Domain model spec | Domain model spec | recipient roles, contact authority | SMS consent, source-of-truth | Medium | Keep ACTIVE as domain spec | SMS IA/spec index later |
| SMS_Recipient_Consent_Schema_Design_Plan.md | Consent schema plan | Domain model spec; candidate consolidation | Domain model spec | consent schema, suppression, recipient consent | SMS compliance spec | Medium-high: likely overlaps with compliance spec | Consolidate into another doc later | SMS_Compliance_and_Consent_Model_Spec.md |
| SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md | Sender identity/provider config model | Domain model spec | Domain model spec | sender identity, provider config | SMS provider Twilio spec | Medium | Keep ACTIVE as domain spec | SMS provider readiness spec |
| SMS_Settings_Communications_IA_Spec.md | Communications settings IA | Domain/IA spec | Domain model spec | Settings -> Communications, IA, activation posture | SMS readiness UI spec | Medium | Keep ACTIVE as domain spec | SMS family index later |
| SMS_Settings_Communications_Readiness_UI_Model_Spec.md | Readiness UI model | Domain/IA spec | Domain model spec | read-only readiness UI, admin communications | SMS IA spec | Medium | Keep ACTIVE as domain spec | SMS IA spec |
| SMS_Template_Editing_and_Review_Actions_Model_Spec.md | Template editing/review actions | Domain model spec | Domain model spec | template draft/save/review actions | SMS template governance spec | Medium | Keep ACTIVE as domain spec or consolidate later | SMS_On_The_Way_Template_Governance_Model_Spec.md |
| source-of-truth-strategy.md | Customer/location/job/ECC/SMS source-of-truth strategy | Domain model spec | Domain model spec | customers, locations, job snapshots, ECC outcomes, SMS boundaries | Spine, Workflow Plan, SMS specs | Medium: has long SMS closeout appendix | Keep ACTIVE as domain spec; split SMS closeout history later | SMS specs for SMS details |
| Support_Case_Call_Log_V1_Model_Spec.md | Support case/call log model | Domain model spec | Domain model spec | support case, call log | Support readiness pack/runbook | Low | Keep ACTIVE as domain spec | Support readiness pack |
| Support_Console_Production_Enablement_Runbook.md | Support console production procedure | Execution runbook | Execution runbook | support console enablement, production steps | Support readiness, support case spec | Medium | Keep ACTIVE as runbook | Prelaunch for gates |
| Support_V0_Issue_Log_Template.md | Issue log template | Execution/support template | Execution runbook; supporting reference | support issue logging | Support readiness pack | Low | Keep ACTIVE as template or archive later | Support readiness pack |
| Support_V0_Operational_Readiness_Pack.md | Support V0 readiness pack | Launch/supporting reference | Execution runbook; launch checklist | support readiness, support V0/V1/V2 | Roadmap, Prelaunch, support runbook | Medium | Keep ACTIVE as runbook/readiness pack | Roadmap for sequencing |
| Tactical_Punch_List_Closeout_Ledger.md | Minor fix closeout ledger | Tactical ledger | Tactical closeout ledger | label sweep, pending locks, lifecycle perf, calendar/job polish | Spine, Roadmap, Prelaunch | Low: correct destination for minor fixes | Keep as-is; append future tactical evidence | Documentation Authority Map |
| Time_Clock_V1_Model_Spec.md | Time clock model | Domain model spec | Domain model spec | time entries, admin review, reporting | Prelaunch, Business Layer | Medium | Keep ACTIVE as domain spec | Prelaunch only links gates |
| Visit_Scope_First_Model_Brief.md | Visit Scope / Work Items model brief | Domain model spec | Domain model spec | visit scope, work items, invoice sourcing | B8C, Business Layer, Pricebook | Medium | Keep ACTIVE as domain spec | Workflow Plan / Business Layer |
| Workflow_Modernization_B0_Ownership_Matrix.md | Workflow modernization ownership matrix | Supporting reference / audit | Supporting reference | role ownership, queues, workflow lanes | Workflow Plan, B-series docs | Medium | Keep ACTIVE as supporting reference or consolidate later | Workflow Plan |
| Workflow_Modernization_B1_Current_Queue_Contract_Audit.md | Current queue contract audit | Historical audit/evidence | Historical closeout/evidence | queue contract, My Work, Ops | Workflow Plan | Medium | Move to archive later only after approval | Workflow Plan |
| Workflow_Modernization_B4_Field_Finish_Flow_Closeout.md | Field finish flow closeout | Historical closeout/evidence | Historical closeout/evidence | field finish, outcomes, validation | Workflow Plan, B4B/B4D | Medium | Move to archive later only after approval | Workflow Plan |
| Workflow_Modernization_B4B_Field_Outcome_Exception_Reason_Audit.md | Field outcome reason audit | Historical audit/evidence | Historical closeout/evidence | outcome reasons, exceptions | Workflow Plan, B4 closeout | Medium | Move to archive later only after approval | Workflow Plan |
| Workflow_Modernization_B4D_Job_Detail_Finish_Flow_Placement_Audit.md | Job detail finish placement audit | Historical audit/evidence | Historical closeout/evidence | finish flow UI placement | Workflow Plan, job detail tactical docs | Medium | Move to archive later only after approval | Workflow Plan |
| Workflow_Modernization_B5_Return_Callback_Revisit_Closeout.md | Return/callback/revisit closeout | Historical closeout/evidence | Historical closeout/evidence | return visits, callbacks, linked jobs | Workflow Plan, Guided closeout | Medium | Move to archive later only after approval | Workflow Plan |
| Workflow_Modernization_B5B_Return_Callback_Model_Audit.md | Return/callback model audit | Historical audit/evidence | Historical closeout/evidence | return/callback model | Workflow Plan, B5 closeout | Medium | Move to archive later only after approval | Workflow Plan |
| Workflow_Modernization_B6_Field_Billing_Proposal_Closeout.md | Field billing proposal closeout | Historical closeout/evidence | Historical closeout/evidence | field charge proposals | B6 audits, B7/B8 billing docs | Medium | Move to archive later only after approval | Financial specs / Workflow Plan |
| Workflow_Modernization_B6A_Field_Billing_Collect_Payment_Model_Audit.md | Collect payment model audit | Historical audit/evidence | Historical closeout/evidence | collect payment, field billing | B7/B8, Financial Ledger | Medium | Move to archive later only after approval | Financial Ledger / Payments Roadmap |
| Workflow_Modernization_B6B_Field_Charge_Line_Item_Authority_Audit.md | Charge line authority audit | Historical audit/evidence | Historical closeout/evidence | charge line authority, pricebook, invoice lines | B6E/B7/B8 | Medium | Move to archive later only after approval | Visit Scope / Financial specs |
| Workflow_Modernization_B6E_Field_Charge_Proposal_Wrapper_Model_Audit.md | Charge proposal wrapper audit | Historical audit/evidence | Historical closeout/evidence | field charge proposals, wrapper model | B6/B7/B8 | Medium | Move to archive later only after approval | Workflow Plan / Financial specs |
| Workflow_Modernization_B7_Field_Billing_Payments_Reconciliation_Closeout.md | Field billing/payments closeout | Historical closeout/evidence | Historical closeout/evidence | field billing, payment collection, verification | Financial Ledger, B8B, Payments Roadmap | Medium-high | Move to archive later only after approval | Financial specs |
| Workflow_Modernization_B7A_Authorized_Field_Invoice_Mode_Audit.md | Authorized field invoice mode audit | Historical audit/evidence | Historical closeout/evidence | direct field invoice mode, permissions | B8B, Service Role spec | Medium | Move to archive later only after approval | Service Role Controls spec |
| Workflow_Modernization_B7E_Field_Payment_Collection_Reconciliation_Audit.md | Field payment reconciliation audit | Historical audit/evidence | Historical closeout/evidence | card/check/cash, reconciliation queue | Financial Ledger, B7 closeout | Medium | Move to archive later only after approval | Financial Ledger spec |
| Workflow_Modernization_B7H_Supplemental_Add_On_Invoice_Audit.md | Supplemental invoice audit | Historical audit/evidence | Historical closeout/evidence | add-on invoice, immutable original invoice | Business Layer, invoice specs | Medium | Move to archive later only after approval | Business Layer / financial specs |
| Workflow_Modernization_B8A_Invoice_Payment_Workspace_Field_First_UX_Audit.md | Invoice/payment workspace UX audit | Historical audit/evidence | Historical closeout/evidence | mobile invoice/payment UX, role display | B8B/B8C, job detail | Medium | Move to archive later only after approval | Workflow Plan / Financial specs |
| Workflow_Modernization_B8B_Field_Billing_Access_and_Payment_Workflow_Closeout.md | Field billing access/payment closeout | Historical closeout/evidence | Historical closeout/evidence | capabilities, direct invoice build, field payment | B8B1, Service Role, Financial Ledger | Medium-high | Move to archive later only after approval | Service Role / Financial specs |
| Workflow_Modernization_B8B1_Field_Billing_Capability_Persistence_Model_Lock.md | Capability persistence model lock | Domain model spec; candidate consolidation | Domain model spec | field billing capability persistence | B8B closeout, Service Role spec | Medium | Keep ACTIVE as domain spec or fold into Service Role later | Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md |
| Workflow_Modernization_B8C_D1_Invoice_Job_Detail_Cleanup_Closeout.md | B8C/D1 invoice/job detail cleanup closeout | Historical closeout/evidence | Historical closeout/evidence | invoice cleanup, job detail cleanup, mobile cleanup | B8C closeout, Tactical ledger, Spine | Medium-high | Move to archive later only after approval | Tactical Ledger for small fixes; Workflow Plan for big lane |
| Workflow_Modernization_B8C_Work_Items_to_Invoice_Flow_Simplification_Audit.md | Work Items to invoice audit | Historical audit/evidence | Historical closeout/evidence | Work Items -> invoice charges, source boundaries | Visit Scope brief, B8C closeout | Medium | Move to archive later only after approval | Visit Scope brief / Business Layer |
| Workflow_Modernization_B8C_Work_Items_to_Invoice_Flow_Simplification_Closeout.md | Work Items to invoice closeout | Historical closeout/evidence | Historical closeout/evidence | invoice flow simplification, validation | B8C audit, Spine, Roadmap | Medium-high | Move to archive later only after approval | Visit Scope brief / Tactical ledger for minor remnants |

## 3. Topic Ownership Map

| Topic | Docs where it appears | Proposed single owner doc | Docs that should backlink only |
| --- | --- | --- | --- |
| Current product/release posture | Spine, Release Roadmap, Prelaunch, Business Layer, Owner addendum | Active Spine V4.0 Current.md | Roadmap, Prelaunch, Business Layer, owner/GTM docs |
| Service vs legacy HVAC Service wording/product-mode posture | Spine, Business Layer, Product Mode Signup, Packaging, Roadmap, Prelaunch, Tactical Ledger | Product_Mode_Signup_Spec.md for model; Spine for current visible posture | Packaging, Roadmap, Prelaunch, Tactical Ledger |
| Future Service industry selection | Product Mode Signup, Business Layer, Roadmap, Tactical Ledger | Product_Mode_Signup_Spec.md | Roadmap only for sequencing; Tactical Ledger as evidence |
| Maintenance Agreements / Service Plans | Maintenance spec, Spine, Business Layer, Payments Roadmap, Prelaunch, Service Plans closeout | Maintenance_Agreements_V1_Model_Spec.md | Spine summary, Roadmap sequencing, closeout evidence |
| Service Plan Billing / Billing Periods | Payments V2 spec, Maintenance spec, Payments Roadmap, Business Layer, Prelaunch, Financial Ledger | Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md | Maintenance spec, Payments Roadmap, Prelaunch |
| Financial Ledger / Payments Register | Financial Ledger spec, Payments Roadmap, Business Layer, Spine, Prelaunch, B7/B8 docs | Financial_Ledger_Payments_Register_V1_Model_Spec.md | Spine summary, Payments Roadmap sequencing, B docs evidence |
| Tenant invoice payments / Stripe / saved card / autopay | Payments Roadmap, Business Layer, Spine, Prelaunch, Financial specs | Compliance_Matters_Payments_Roadmap.md for sequencing; relevant payment model specs for contracts | Spine, Prelaunch, Business Layer |
| Estimates / proposal flow | Estimate spec, Estimates runbook, Business Layer, Spine, Prelaunch | Estimate_Multi_Option_Proposal_Model_Spec.md | Estimates runbook for execution, Business Layer for sequencing |
| Support V0 / Support Case / Support Console | Support readiness pack, support model spec, support runbook, Spine, Roadmap, Prelaunch | Support_V0_Operational_Readiness_Pack.md for readiness; Support_Case_Call_Log_V1_Model_Spec.md for model | Roadmap/Prelaunch summaries |
| Workflow modernization / field finish / return/callback | Workflow Plan, B0-B8 docs, Spine, Roadmap, Prelaunch | Compliance_Matters_Workflow_Modernization_Maturation_Plan.md | B-series audits/closeouts as evidence |
| ECC workflow closeouts/model locks | ECC model lock, ECC closeout, Guided closeout, Spine, Roadmap, Prelaunch | ECC_Guided_Workflow_Separation_Model_Lock.md for model; ECC_Test_Workflow_Maturity_Closeout.md as evidence | Spine/Roadmap summaries |
| Calendar/job-detail tactical fixes | Tactical Ledger, Spine, Roadmap, Prelaunch, B8C D1 closeout | Tactical_Punch_List_Closeout_Ledger.md for minor fixes | Spine/Roadmap only if posture changes |
| Prelaunch gates | Prelaunch checklist, Roadmap, Spine, runbooks | Compliance_Matters_Prelaunch_Confirmation_Checklist.md | Spine/Roadmap/runbooks backlink only |
| SMS/provider messaging | SMS spec family, source-of-truth strategy, Prelaunch, Roadmap, Spine | SMS_Compliance_and_Consent_Model_Spec.md for compliance; SMS_Settings_Communications_IA_Spec.md for family index/IA if enhanced | Prelaunch for activation gates; source-of-truth only recipient boundary |
| QBO | Payments Roadmap, Business Layer, Prelaunch, many non-goal lists | Compliance_Matters_Payments_Roadmap.md | Domain specs should mention only as non-goal/backlink |
| Customer portal | Spine, Roadmap, Prelaunch, many non-goal lists | Release_Scope_Lock_and_Post_Launch_Roadmap.md for deferred scope | Spine current posture summary only |
| Performance/device/app/PWA | PWA audit, Prelaunch, Roadmap, Spine, device pass docs | PWA_Push_Outside_App_Alerts_Planning_Audit.md for planning; Prelaunch for launch gates | Device pass docs as evidence |
| Pricebook/starter kits | Business Layer, Visit Scope brief, Estimate spec, Maintenance spec, B-series docs | Compliance_Matters_Business_Layer_Roadmap.md for roadmap; Visit_Scope_First_Model_Brief.md for work/invoice boundary | Spine summary, B docs evidence |
| First-owner provisioning/onboarding | First Owner runbook, Product Mode Signup, Prelaunch, Business Layer, GTM docs | First_Owner_Provisioning_Runbook.md | Prelaunch gate, Product Mode model, GTM references |
| Source-of-truth strategy for customer/location/job/invoice/payment records | source-of-truth strategy, Spine, Business Layer, Financial specs, Workflow Plan | source-of-truth-strategy.md for customer/location/job/ECC; Financial specs for payment/invoice allocation | Spine concise summary only |

## 4. Conflict / Staleness Report

Examples found during audit:

1. Control-plane docs carry copied closeout blocks.
   - Spine, Release Roadmap, Prelaunch, and Business Layer all contain long payment/autopay/deposit/ECC closeout narratives.
   - Risk: future edits update one copy but not the others.

2. Roadmap and checklist documents are doing evidence storage.
   - `Release_Scope_Lock_and_Post_Launch_Roadmap.md` should own sequencing and deferred unlocks, but it includes detailed smoke IDs, invoice IDs, and implementation evidence.
   - `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` should own launch gates, but it contains completed feature histories and model details.

3. Business Layer Roadmap is both roadmap and model archive.
   - It declares itself subordinate, but also carries current platform baseline, product-mode matrix, payment truth, estimates, invoice source rules, and long closeout chains.
   - Risk: model truth competes with domain specs.

4. `source-of-truth-strategy.md` owns customer/location/job/ECC truth but also has a very long SMS closeout appendix.
   - Risk: SMS implementation evidence can obscure the core source-of-truth contract.

5. SMS docs are numerous and overlapping.
   - This may be justified by domain complexity, but the family lacks a single visible index/owner that says which SMS doc owns compliance, IA, provider, template, recipient, and delivery truth.

6. Historical workflow B-series docs are still ACTIVE.
   - They are valuable, but most are audit/closeout evidence, not active control-plane truth.
   - Risk: prompts may treat old audit recommendations as active instructions after implementation has moved on.

7. Product-mode wording appears in many docs.
   - Recent product copy now prefers `Service` in user-facing contexts while some specs still discuss `HVAC Service` as a product mode/internal historical label.
   - Risk: future prompts may accidentally reintroduce old user-facing wording.

8. Prelaunch checklist contains duplicated Payments Register confirmation blocks.
   - It repeats V1A/V1B and then V1A/V1B/V1C confirmations.
   - Risk: checklist readers cannot tell which one is current without reading both.

## 5. Recommended Target Documentation Architecture

### Mission-control docs to remain ACTIVE

- `Documentation_Authority_Map.md`
- `Active Spine V4.0 Current.md`
- `Release_Scope_Lock_and_Post_Launch_Roadmap.md`
- `Compliance_Matters_Prelaunch_Confirmation_Checklist.md`
- `Tactical_Punch_List_Closeout_Ledger.md`

### Strategic/domain roadmaps to remain ACTIVE

- `Compliance_Matters_Business_Layer_Roadmap.md`, after trimming to business-layer sequencing and backlinks.
- `Compliance_Matters_Payments_Roadmap.md`, after trimming to payment sequencing and backlinks.
- `Compliance_Matters_Workflow_Modernization_Maturation_Plan.md`, after trimming closeout repetition.

### Domain specs to remain ACTIVE

Keep durable model specs ACTIVE when they own model truth:

- `source-of-truth-strategy.md`
- `Product_Mode_Signup_Spec.md`
- `Maintenance_Agreements_V1_Model_Spec.md`
- `Payments_V2_Service_Plan_Billing_Foundation_Model_Spec.md`
- `Financial_Ledger_Payments_Register_V1_Model_Spec.md`
- `Financial_Trust_Lane_Deposits_Payout_Reconciliation_V1_Model_Spec.md`
- `Service_Role_Controls_and_Financial_Access_V1_Model_Spec.md`
- `Estimate_Multi_Option_Proposal_Model_Spec.md`
- `Support_Case_Call_Log_V1_Model_Spec.md`
- `Time_Clock_V1_Model_Spec.md`
- `Visit_Scope_First_Model_Brief.md`
- `ECC_Guided_Workflow_Separation_Model_Lock.md`
- SMS model specs, preferably with an index/authority note.

### Runbooks to remain ACTIVE

- `First_Owner_Provisioning_Runbook.md`
- `Estimates_Production_Enablement_Runbook.md`
- `Support_Console_Production_Enablement_Runbook.md`
- `Support_V0_Operational_Readiness_Pack.md`
- `Support_V0_Issue_Log_Template.md` if still used operationally.

### Historical closeout/evidence candidates

Candidate move later, only after approval:

- B-series workflow modernization audits/closeouts.
- ECC and guided workflow closeouts.
- Service plans command-center closeout.
- Production schema stabilization closeout.
- Device/pass docs.
- Owner/support snapshots and audits.
- Platform seat billing audit.

Recommended future destination: `docs/ARCHIVE/closeouts/` or `docs/HISTORY/closeouts/`, preserving backlinks from owner docs.

### Model truth vs closeout evidence splits needed

- Spine: split current truth from copied historical closeouts.
- Roadmap: split strategic order from completed closeout evidence.
- Prelaunch: split launch gates from completed implementation history.
- Business Layer Roadmap: split business roadmap from payment/model closeouts.
- source-of-truth strategy: split core source-of-truth contract from SMS closeout evidence.
- SMS family: add an index/authority note before consolidating any SMS specs.

## 6. Recommended Cleanup Sequence

### Slice 1: Safest control-plane cleanup

- Update `Documentation_Authority_Map.md` to include this audit report and a stricter "no copied closeout blocks in control-plane docs" rule.
- Add top-level authority banners/backlink destinations to Spine, Roadmap, Prelaunch, Business Layer, Payments Roadmap, Workflow Plan.
- Do not remove content yet unless owner approves exact sections.

### Slice 2: Tactical closeout consolidation

- Move minor UI polish/regression closeout references out of Spine/Roadmap/Prelaunch into `Tactical_Punch_List_Closeout_Ledger.md`.
- Replace copied paragraphs with one-line summaries and backlinks.
- Preserve commit evidence in the ledger.

### Slice 3: Roadmap/prelaunch/spine realignment

- Trim `Active Spine V4.0 Current.md` to current truth summaries.
- Trim `Release_Scope_Lock_and_Post_Launch_Roadmap.md` to sequencing, deferred items, gates, unlock criteria.
- Trim `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` to launch gates and operator readiness checks.
- Replace evidence blocks with links to closeout/runbook/model docs.

### Slice 4: Model spec cleanup/backlinking

- Move durable model truth into the owning domain specs.
- Add backlink sections from subordinate docs.
- Especially inspect SMS, payments, service-plan billing, source-of-truth, and workflow modernization families.

### Slice 5: Optional archive/move pass

- After approval, move historical audits/closeouts to archive/history folders.
- Preserve backlinks from owner docs.
- Do not delete historical evidence.

## 7. Owner Decisions Needed Before Cleanup

Do not touch without approval:

- `Active Spine V4.0 Current.md` large-section trimming.
- `Release_Scope_Lock_and_Post_Launch_Roadmap.md` closeout block removal.
- `Compliance_Matters_Prelaunch_Confirmation_Checklist.md` historical cleanup.
- `Compliance_Matters_Business_Layer_Roadmap.md` restructuring.
- `Compliance_Matters_Payments_Roadmap.md` restructuring.
- Any archive/move of B-series workflow docs.
- Any consolidation of SMS specs.
- Any split of source-of-truth strategy SMS appendix.

Owner decisions needed:

- Should historical evidence live under `docs/ARCHIVE/closeouts/`, `docs/HISTORY/closeouts/`, or remain in `docs/ACTIVE` with `HISTORICAL` status?
- Should SMS get a single `SMS_Documentation_Index.md` before consolidation?
- Should GTM docs remain ACTIVE or move to a GTM folder?
- Should Business Layer remain one large roadmap or split into business roadmap plus domain indexes?
- Should old "HVAC Service" terminology be preserved only as internal/product-mode history while user-facing docs say "Service"?

## 8. Proposed Locked Documentation Workflow

### Completed features

- Durable model change: update the owning domain spec.
- Current product posture change: add one concise Spine summary with backlink.
- Roadmap sequencing change: update Roadmap only if order/gating changed.
- Evidence: keep detailed closeout in lane closeout doc or history folder.

### Minor fixes

- Record in `Tactical_Punch_List_Closeout_Ledger.md`.
- Do not copy into Spine/Roadmap/Prelaunch unless it changes current operating truth or launch gates.

### Model changes

- One model truth owner only.
- Other docs backlink with "See X for canonical model."
- No copied model contracts across multiple docs.

### Production runbook executions

- Runbook owns procedure and execution evidence.
- Prelaunch checklist links to runbook status as a gate.
- Spine summarizes only if current operating posture changes.

### Deferred/gated work

- Roadmap owns deferred item, owner, unlock criteria, and sequencing.
- Prelaunch checklist owns only launch-blocking gates.
- Domain specs may note deferred non-goals but should not duplicate full roadmap.

### Future prompts

Every docs prompt should name the target authority:

- "Update Spine current truth only."
- "Update Roadmap sequencing only."
- "Update Prelaunch gate only."
- "Update domain model spec only."
- "Record tactical closeout in ledger only."
- "Create historical closeout evidence only."

Prompts should explicitly say whether evidence belongs in the owner doc or only as a backlink.

## 9. Suggested Next Implementation Prompt

Use this as the first cleanup slice prompt:

```text
Proceed with Documentation Control-Plane Cleanup Slice 1.

Use docs/ACTIVE/Documentation_Consolidation_Audit.md as the audit source.

Goal:
Enforce authority banners and backlink rules only. Do not delete, move, archive, or consolidate historical content yet.

Scope:
1. Update Documentation_Authority_Map.md to reference the audit and add a stricter no-copied-closeout rule.
2. Add or tighten top authority notes in:
   - Active Spine V4.0 Current.md
   - Release_Scope_Lock_and_Post_Launch_Roadmap.md
   - Compliance_Matters_Prelaunch_Confirmation_Checklist.md
   - Compliance_Matters_Business_Layer_Roadmap.md
   - Compliance_Matters_Payments_Roadmap.md
   - Compliance_Matters_Workflow_Modernization_Maturation_Plan.md
3. Each note should say what the doc owns, what it must not own, and where evidence/model details belong.
4. Do not remove existing content in this slice except duplicate authority-note wording if needed.

Validation:
- git diff --check
- git status --short

Return changed files, exact authority rule added, and any owner decisions still needed.
```

## 10. Final Validation

Validation command to run after saving this audit:

- `git status --short`
- `git diff --check`

Expected changed file:

- `docs/ACTIVE/Documentation_Consolidation_Audit.md`

Expected unrelated item:

- `.claude/` remains untracked if it existed before this audit.
