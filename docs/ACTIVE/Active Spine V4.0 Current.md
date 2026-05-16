Compliance Matters Software — Spine v4.0 (Current Operational Source of Truth)

Status: ACTIVE SOURCE OF TRUTH
Purpose: Align future development, audits, and thread handoffs to the current, stabilized system state.

**Note on Product Modes:**
See [Compliance_Matters_Business_Layer_Roadmap.md § 3 Product Mode Matrix](./Compliance_Matters_Business_Layer_Roadmap.md#3-product-mode-matrix--eccherms-version-vs-hvac-service-version) for architectural guidance on the two product configurations (ECC/HERS and HVAC Service). Future development should respect product-mode separation to prevent buyer-story drift.

**Release Scope Lock (May 2026):**
Owner-release scope is locked. See [docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md) for the canonical current decision surface covering:
- Completion status matrix for all owner-release areas
- Locked release scope
- Deferred and parked items
- Runbook-gated items
- Support V0/V1/V2 model
- Post-launch roadmap order

Current posture: ECC/HERS-first with HVAC Service-ready shared foundation. No codebase split. No customer portal in current scope. Deferred and runbook-gated items remain parked unless explicitly reopened.

**Maintenance Agreements / Recurring Services V1:**
Group 9A planning source of truth is [Maintenance_Agreements_V1_Model_Spec.md](./Maintenance_Agreements_V1_Model_Spec.md). The preferred future domain/table name is `maintenance_agreements`; avoid `service_contracts` because existing service-contract language classifies service cases/jobs and is not customer-owned agreement truth.
Group 9A-9A model decisions are now documented there: future linkage should prefer separate `maintenance_agreement_visits`, counting should occur only after linked maintenance work is completed/closed as valid, V1 visit balance should be derived from counted links (not mutable remaining counters), `next_due_date` remains manual in current scope, and full ledger remains parked for V2.
Group 9A-9E closeout is now recorded there: agreement default Work Items persist on create/update, `/jobs/new` Step 5 prefill includes summary + Work Items for service-plan-origin intake, and maintenance-agreement link creation now runs before `postCreate(...)` redirect so runtime link insertion is reachable.

**Owner-Completion Cycle Closeout (May 2026):** All areas in the owner-release completion matrix are confirmed closed at current quality bar. Next work is treated as post-launch/future-roadmap work unless the owner explicitly reopens a release-scope item. See [docs/ACTIVE/Release_Scope_Lock_and_Post_Launch_Roadmap.md](./Release_Scope_Lock_and_Post_Launch_Roadmap.md) for the canonical decision surface.

Current Program Status Note (May 2026)

- Manual Text Logging Wording Clarification is complete and pushed in commit `36460b8`:
  - this pass clarified that current text-related actions are manual/device-intent/contact-attempt logging only, not provider-powered SMS delivery
  - user-facing labels were aligned to avoid delivery implication:
    - `Log Text Attempt`
    - `Text Attempt Logged`
    - `Contact attempt logged`
    - `Open SMS App`
  - helper copy now states: `Logs communication attempts only; does not confirm carrier delivery.`
  - existing behavior was preserved:
    - `job_events.customer_attempt` write truth
    - attempt counts
    - follow-up logic
    - timeline/history rendering
    - redirects and manual logging flow
  - boundaries preserved: no live SMS send, no provider integration, no consent/opt-out implementation, no delivery-tracking implementation, no schema/migration/env/secret/feature-flag changes, no payment/Stripe/QBO behavior changes, no portal expansion, no auth/RLS/entitlement behavior changes
  - this is compliance-risk-reduction wording alignment only; future real SMS remains deferred pending consent/opt-out/quiet-hours/provider/audit/legal-provider review gates and explicit activation decision
  - guardrail framing: this is neutral communication-readiness hardening designed to preserve clean actor/recipient boundaries for future marketplace-style evolution, not Eddie-specific behavior
  - model-spec pointer: `docs/ACTIVE/SMS_Compliance_and_Consent_Model_Spec.md` now defines the future provider-powered SMS control contract and activation gates
  - recipient/contact role model pointer: `docs/ACTIVE/SMS_Recipient_and_Contact_Role_Model_Spec.md` defines the required first-class recipient/contact role model (audit decision C — 2026-05-14); this model must exist before any live SMS recipient selection; job snapshot phone fields are explicitly blocked from becoming SMS recipient truth
  - schema design plan pointer: `docs/ACTIVE/SMS_Recipient_Consent_Schema_Design_Plan.md` proposes future schema tables (recipient registry, consent, suppression, audit trail) and enums; ready for schema design review
  - SMS Slice A Recipient Registry Foundation is complete and pushed in commit `afddb9c`:
    - migration created: `supabase/migrations/20260515120000_contact_recipients_slice_a_foundation.sql` (contact registry foundation only)
    - migration timestamp hygiene fix is complete and pushed in commit `02aee5a`
    - original filename `supabase/migrations/20260514120000_contact_recipients_slice_a_foundation.sql` was renamed because timestamp prefix `20260514120000` was already used by `supabase/migrations/20260514120000_maintenance_agreement_visits_next_due_confirmation_metadata.sql`
    - no SQL behavior change from rename (100% rename)
    - scope preserved: no consent/suppression/SMS intent/provider delivery tables, no data backfill, no live SMS, no provider/Twilio/env/flag/payment/QBO/portal changes
    - read helper and tests added:
      - `lib/communications/contact-recipients-read.ts`
      - `lib/communications/__tests__/contact-recipients-read.test.ts`
    - helper posture is locked: read-only, account-scoped, safe-empty on missing scope, reads only `contact_recipients`, does not infer recipients from customer/job snapshot fields, does not run consent/suppression/send logic
    - validation recorded: `npx.cmd tsc --noEmit` passed, `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed, `git diff --check` passed
    - no migration was applied and no Supabase production command or production write occurred
    - real provider-powered SMS remains deferred pending future consent/suppression/provider delivery implementation and activation-gate completion
  - SMS Slice B1 Consent + Suppression Foundation is complete and pushed in commit `39a2963`:
    - migration created: `supabase/migrations/20260515123000_contact_recipient_consent_suppression_foundation.sql`
    - scope added: `contact_recipient_consents` and `contact_recipient_suppressions` foundation tables only
    - locked defaults and guardrails: consent defaults to `unknown`, missing/unknown consent remains fail-closed, and active suppression is the future hard-stop override over consent
    - scope preserved: no SMS intent/provider delivery tables, no send endpoint, no provider webhook, no Twilio/provider code, no live SMS, and no backfill
    - local validation recorded: plain `supabase start` failed because VS Code held Studio port `54323`; safe local workaround `supabase start -x studio` succeeded; `supabase db reset --local` passed and applied Slice A + Slice B1 migrations; `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed; `git diff --check` passed
    - deployment/write boundary preserved: no remote/sandbox/production migration apply and no production writes
    - real provider-powered SMS remains deferred pending read/decision helpers, non-sending recipient picker/template preview, intent/provider-delivery audit tables, provider/Twilio registration + sandbox send, legal/provider review, and explicit activation decision
  - SMS Slice B2 Non-Sending Eligibility Inputs Helper is complete and pushed in commit `c0247af`:
    - files added:
      - `lib/communications/sms-eligibility-inputs-read.ts`
      - `lib/communications/__tests__/sms-eligibility-inputs-read.test.ts`
    - helper scope: read-only non-sending eligibility-input evaluation for recipient/consent/suppression state by message class
    - helper read boundary: reads only `contact_recipients`, `contact_recipient_consents`, `contact_recipient_suppressions`; does not read `jobs`, `customers`, `locations`, or `job_events`
    - helper output boundary: non-sending language only (`nonSendingStatus`, `blockedReasons`); no `canSend` output
    - locked posture preserved: `eligible_inputs_present` means B2 inputs are present only, missing/unknown consent remains fail-closed, active suppression blocks regardless of consent, and suppression appears before consent in blocked-reason ordering
    - validation recorded: `npx.cmd vitest run lib/communications/__tests__/sms-eligibility-inputs-read.test.ts` passed (`16/16`), `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed (`4/4`), `npx.cmd tsc --noEmit` passed, `git diff --check` passed
    - boundaries preserved: no UI/schema/migration changes, no Supabase commands, no provider/Twilio/send pipeline changes, no env/flag/payment/QBO/portal changes, no production writes
    - real provider-powered SMS remains deferred pending non-sending recipient picker/template preview, quiet-hours/timezone decision gate, sender identity/provider registration, intent/provider-delivery audit tables, Twilio/provider sandbox send, legal/provider review, and explicit activation decision
  - SMS Slice C Background On-The-Way Workflow Spec (docs/model-only) is complete:
    - spec added: `docs/ACTIVE/SMS_Background_On_The_Way_Workflow_Spec.md`
    - locked product posture recorded: no job-detail SMS preview card for V1, no field-tech free-text SMS editor, no field template editing, and no live SMS/provider behavior in this slice
    - future workflow contract recorded: lifecycle transition remains primary; future SMS evaluation occurs after Mark On The Way via background/event-driven workflow; provider failure must not roll back job status
    - required pre-send gates and blocked-send failure behavior are explicitly documented (recipient/role/consent/suppression/quiet-hours/template/provider-readiness/audit/legal-approval)
    - admin-governance posture recorded: future template control belongs in dedicated admin communications settings (not job detail; not Company Profile)
    - badge-only UI posture recorded for future surfaces (`Do Not Text`, `Notifications Off`, `Consent Needed`, `Texting Not Enabled`) sourced from first-class recipient/consent/suppression truth and B2 helper outputs
    - boundaries preserved: no code/schema/migration/Supabase/provider/send/env/flag/payment/QBO/portal changes and no production writes
    - real provider-powered SMS remains deferred pending future activation slices and explicit approval gates
  - SMS Slice D Settings / Communications IA Spec (docs/model-only) is complete:
    - spec added: `docs/ACTIVE/SMS_Settings_Communications_IA_Spec.md`
    - locked settings-home decision recorded: future SMS/message governance belongs in Settings -> Communications
    - Company Profile boundary preserved: business identity/support contact scope remains in Company Profile; full messaging governance is not placed there
    - future Communications IA sections recorded: Communications Status, SMS/On-The-Way Messaging, Sender Identity, Compliance Readiness, Activation
    - visibility controls recorded: no live SMS activation in this slice, no editable templates yet, no provider credential fields yet, and placeholder copy requirements if a future settings shell is added
    - no-preview/no-field-editor posture preserved by cross-reference to Slice C workflow spec
    - boundaries preserved: no code/schema/migration/Supabase/provider/send/env/flag/payment/QBO/portal changes and no production writes
    - real provider-powered SMS remains deferred pending future activation slices and explicit approval gates
  - SMS Slice E1 Message Intent + Provider Delivery Model Lock (docs/model-only) is complete:
    - spec added: `docs/ACTIVE/SMS_Message_Intent_and_Provider_Delivery_Model_Spec.md`
    - locked audit model recorded: one intent to zero-or-one current delivery row in V1, blocked intents have no delivery row, provider-submitted intents have one current delivery row, and append-only provider event history is parked
    - locked idempotency and retry posture recorded: account + job event + message class + recipient idempotency for lifecycle-driven sends; new send decision creates a new intent; same-submission provider updates revise the current delivery row; multi-attempt retry history is parked
    - locked provider-neutral semantics recorded: generic provider fields/status normalization only; Twilio remains likely future provider direction but not a schema dependency
    - locked callback/RLS posture recorded: provider callbacks must use trusted server-side updates with account revalidation; internal account-scoped reads are allowed; no client/public delivery-state writes
    - locked source-of-truth posture recorded: `job_events` remains non-authoritative for provider truth; timeline summaries may only be added later if explicitly designed and backed by delivery truth
    - boundaries preserved: no code/schema/migration/Supabase/provider/send/env/flag/payment/QBO/portal changes and no production writes
    - real provider-powered SMS remains deferred pending the combined migration foundation and later provider readiness slices
  - SMS Slice E2 Message Intent + Provider Delivery Audit Foundation is complete and pushed in commit `b90c9ea`:
    - migration created: `supabase/migrations/20260515130000_sms_message_intent_provider_delivery_foundation.sql`
    - tables created: `sms_message_intents` and `sms_provider_deliveries`
    - locked semantics preserved: `sms_message_intents` is send-request/decision audit context (not provider delivery truth); `sms_provider_deliveries` is provider submission/callback truth (not manual contact log)
    - locked model constraints preserved: one current delivery row per intent and account-scoped intent idempotency foundation
    - provider posture preserved: provider status foundation is provider-neutral and Twilio-aware, not Twilio-specific
    - validation recorded: `npx.cmd tsc --noEmit` passed, `npx.cmd vitest run lib/communications/__tests__/sms-eligibility-inputs-read.test.ts` passed (`16/16`), `npx.cmd vitest run lib/communications/__tests__/contact-recipients-read.test.ts` passed (`4/4`), `git diff --check` passed, `supabase db reset --local --no-seed --yes` passed with full local migration chain including E2
    - boundaries preserved: no provider delivery write path, no send endpoint/webhook/provider integration/live SMS behavior, no `job_events` provider summary behavior, no backfill, no production migration apply, and no production writes
    - quiet-hours/timezone scope clarified: future conservative fail-closed pre-send gate only; not a direct workflow/lifecycle blocker
    - Mark On The Way remains lifecycle-first and cannot be blocked by quiet-hours/timezone policy
    - quiet-hours/timezone blocked-send outcomes remain SMS-only and do not change lifecycle/status transition success
    - no quiet-hours settings UI is approved for V1 direct job workflows
    - marketplace guardrail preserved: this is neutral tenant/account-scoped communication audit infrastructure, not Eddie-specific activation behavior
    - real provider-powered SMS remains deferred pending quiet-hours/timezone gate implementation, admin template governance implementation, sender identity/provider readiness, provider/Twilio sandbox readiness, webhook/send implementation after all gates, legal/provider review, and explicit activation approval
  - SMS Slice F1 Provider/Twilio Readiness Spec (docs/model-only) is complete:
    - spec added: `docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md`
    - locked readiness posture recorded: Twilio is likely provider direction for V1 planning, while internal model and status semantics remain provider-neutral
    - planning contract recorded across sender strategy, A2P/registration checklist, On-The-Way classification/template guardrails, opt-in/opt-out/help expectations, callback/webhook signature-validation readiness, status mapping, env/secrets planning posture, and settings/marketplace guardrails
    - explicit non-implementation boundary preserved: no provider setup, no Twilio API calls, no send endpoint, no webhook route, no sandbox send, no live SMS, no env/secret/flag changes, no schema/migration/Supabase changes, and no production writes
    - real provider-powered SMS remains deferred pending later implementation slices and explicit activation approval
  - SMS Slice F2A Sender Identity + Provider Configuration Model Lock (docs/model-only) is complete:
    - spec added: `docs/ACTIVE/SMS_Sender_Identity_and_Provider_Configuration_Model_Spec.md`
    - locked two-table model recorded: `sms_provider_configurations` + `sms_sender_identities`; registration-evidence table remains parked
    - locked field semantics recorded: provider-neutral naming with Twilio-aware external refs (`provider_account_ref`, `default_messaging_service_ref`, `provider_sender_ref`, `messaging_service_ref`, provider registration refs)
    - locked no-secret DB rule recorded: credentials remain server-only env/secret-manager material and never browser-exposed
    - locked status model recorded: provider readiness + sender verification + activation separation, including sandbox/production data semantics
    - locked RLS/mutation posture recorded: account-scoped reads, admin/owner mutation contract, no customer/portal/public access, no delete policy initially
    - locked E2 relationship posture recorded: E2 remains unchanged in F2A; optional FK links are parked for later explicit approval
    - explicit non-implementation boundary preserved: no code/schema/migration/Supabase/provider/send/webhook/env/flag/payment/QBO/portal changes and no production writes
    - real provider-powered SMS remains deferred pending F2B migration foundation and later gated implementation slices
  - SMS Slice F2B Provider Configuration + Sender Identity Schema Foundation is complete and pushed in commit `f093bdd`:
    - migration created: `supabase/migrations/20260515133000_sms_provider_config_sender_identity_foundation.sql`
    - tables created: `sms_provider_configurations` and `sms_sender_identities`
    - locked semantics preserved: `sms_provider_configurations` is provider readiness/configuration metadata only; `sms_sender_identities` is sender identity metadata only
    - no-secret posture preserved: provider refs are external references only and credentials remain server-side only
    - sandbox/production data semantics preserved: provider environment is represented as data and readiness/activation remain separate
    - RLS posture preserved: account-scoped SELECT policies only in V1; no INSERT/UPDATE/DELETE policies
    - one-active-production sender enforcement intentionally parked for future helper/server-action or follow-up migration decision
    - validation recorded: `npx.cmd tsc --noEmit` passed, helper tests passed (`16/16` and `4/4`), `git diff --check` passed, and `supabase db reset --local --no-seed --yes` passed with full local migration chain including F2B
    - boundaries preserved: no app code/UI changes, no E2 table changes, no send endpoint/webhook/provider behavior, no sandbox/live SMS, no env/secret/flag changes, no production migration apply, and no production writes
    - provider readiness is structurally closer but remains deferred/not active pending later gates and explicit approval
  - SMS Slice F3A Settings Communications Readiness UI Model Lock (docs/model-only) is complete:
    - spec added: `docs/ACTIVE/SMS_Settings_Communications_Readiness_UI_Model_Spec.md`
    - locked route/IA posture recorded: future admin route is `/ops/admin/communications` with `Communications` label; Company Profile boundary remains separate
    - locked access and first implementation posture recorded: admin-only route guard and read-only first implementation with no send/sandbox/activation/template/credential controls
    - locked data-safety posture recorded: no secrets/full provider refs in browser output; masked sender phone display; provider refs mapped to safe configured/not-configured labels
    - locked status-mapping and activation-effective-state wording recorded, including `Configured active; send path unavailable in this build` when send path is unavailable
    - locked sequence recorded: F3A docs/model lock before F3B read-model helper and F3C read-only route/page implementation
    - explicit non-implementation boundary preserved: no code/schema/migration/Supabase/provider/send/webhook/env/flag/payment/QBO/portal changes and no production writes
    - real provider-powered SMS remains deferred pending later gated implementation slices and explicit approval

  - SMS Slice F3B Provider Readiness Read-Model Helper is complete in commit `d370e56`:
    - helper added: `lib/communications/sms-provider-readiness-read.ts` with test `lib/communications/__tests__/sms-provider-readiness-read.test.ts`
    - helper API: `getSmsProviderReadinessForAccount({ supabase, accountOwnerUserId })`
    - helper scope: account-scoped by `account_owner_user_id`, reads only `sms_provider_configurations` and `sms_sender_identities` tables
    - helper output: safe-empty on missing scope or rows; browser-safe readiness data for future Communications UI; masks sender phone with `phone_last4`; no secrets/full refs/full phone/canSend/send eligibility
    - helper always returns: `smsEnabled: false`, `liveSendsEnabled: false`, `statusLabel: "SMS is not enabled"` to reflect read-only status helper purpose
    - helper posture: does not imply live SMS is active even if DB readiness/activation rows are active
    - validation recorded: new provider readiness helper tests 16/16 passed; SMS eligibility helper tests 16/16 passed; contact recipient helper tests 4/4 passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed
    - explicit non-implementation boundary preserved: no route/page/UI, no provider setup, no send endpoint/webhook, no sandbox/live SMS, no env/secrets/flag changes, no production migration apply, and no production writes
    - F3C read-only Admin Center route/page implementation remains deferred
    - real provider-powered SMS remains deferred pending later gated implementation slices and explicit legal/provider approval

  - SMS Slice F3C Read-Only Admin Communications Page is complete in commit `994e79c`:
    - route added: `/ops/admin/communications` (admin-only, read-only, readiness/status only)
    - Admin Center card added: `Communications` with description "Review SMS/provider readiness. SMS is not enabled and live sends are disabled."
    - page displays: Communications Status, SMS Provider Readiness, Sender Identity, On-The-Way Notification, Compliance Readiness, Activation Status
    - page uses F3B helper: `getSmsProviderReadinessForAccount({ supabase, accountOwnerUserId })`
    - page scope: admin-only via `requireInternalRole("admin")`; contractors redirect to `/portal`; non-admin internal users redirect to `/ops`
    - page safety: renders only safe helper output (senderDisplayLabel, maskedSender, status labels); does not render provider_account_ref, provider_sender_ref, phone_e164, secrets, API keys, or credentials
    - page behavior: read-only, no forms/mutations, no send/test/sandbox/activation/template/provider setup controls
    - page empty states: "Provider setup has not been configured" / "No sender identity is configured"
    - page always shows: `SMS is not enabled` and `Live sends are disabled`
    - validation recorded: TypeScript clean, provider readiness helper 16/16 passed, SMS eligibility helper 16/16 passed, contact recipient helper 4/4 passed, `git diff --check` clean
    - explicit non-implementation boundary preserved: no provider setup, no send endpoint/webhook, no sandbox/live SMS, no env/secrets/flag changes, no production migration apply, and no production writes
    - communications readiness is now visible in Admin Center as read-only status/readiness
    - real provider-powered SMS remains deferred pending template governance planning, webhook/status callback planning, provider/Twilio sandbox planning, legal/provider review, and explicit activation decision

  - SMS Slice F4A On-The-Way Template Governance Model Lock is complete (docs/model-only):
    - spec added: `docs/ACTIVE/SMS_On_The_Way_Template_Governance_Model_Spec.md`
    - locked governance location: `/ops/admin/communications` as `On-The-Way Template Governance` section (no sub-page in first posture)
    - locked access posture: admin-only governance; no field free-text editing; no job-detail preview/editor; field actions remain lifecycle-only
    - locked model posture: two-table future schema (`sms_message_templates` + `sms_message_template_versions`); single-table `sms_templates` is explicitly rejected for this lane
    - locked safety posture: immutable approved historical wording versions, token allowlist and unknown-token block behavior, mandatory STOP language, prohibited operational-marketing mixed wording, sample-preview-only posture, and separate internal/legal/provider review states
    - locked sequencing posture: F4A docs/model lock first, then F4B schema foundation, then F4C read-only template status/sample preview, with editing/review actions later
    - boundaries preserved: no code/schema/migration changes, no provider/send/webhook/sandbox/live behavior, no env/secret/flag/payment/QBO/portal changes, and no production writes
    - real provider-powered SMS remains deferred

  - SMS Slice F4B Template Governance Schema Foundation is complete:
    - implementation commit: `b676736`
    - migration: `supabase/migrations/20260515140000_sms_message_template_governance_foundation.sql`
    - created `sms_message_templates` and `sms_message_template_versions`
    - `sms_message_templates` is the account-scoped template container/current pointer
    - `sms_message_template_versions` is the durable governed wording/version record
    - safer two-table model is now implemented; single-table `sms_templates` remains rejected for this lane
    - template rows are account-scoped with RLS enabled and SELECT-only policy posture for authenticated active internal users in the same account
    - no INSERT/UPDATE/DELETE policies were added in V1; future writes remain deferred to admin-only server actions
    - F4B does not enable template editing, preview, rendering, or sending
    - F4B does not alter `sms_message_intents`; `sms_message_intents.message_body_snapshot` remains the future attempted-message audit record
    - validation recorded: `npx.cmd tsc --noEmit` passed; provider readiness tests `16/16` passed; SMS eligibility tests `16/16` passed; contact recipient tests `4/4` passed; `git diff --check` passed; `supabase db reset --local --no-seed --yes` passed with full local migration chain including F4B
    - no production migration apply and no production writes
    - template read-model/helper and F4C read-only template status/sample preview remain deferred
    - real provider-powered SMS remains deferred

  - SMS Slice F4C-A Template Governance Read Model Helper is complete:
    - implementation commit: `0662e73c1c95f2d590048f24ebb8f9f8b23ce40a`
    - helper added: `lib/communications/sms-template-governance-read.ts`
    - tests added: `lib/communications/__tests__/sms-template-governance-read.test.ts`
    - helper API: `getSmsOnTheWayTemplateGovernanceForAccount({ supabase, accountOwnerUserId })`
    - helper reads only `sms_message_templates` and `sms_message_template_versions`
    - helper is account-scoped by `account_owner_user_id`
    - helper safe-empty behavior: missing scope or no configured template rows
    - helper output posture: browser-safe readiness/status only, `smsEnabled=false`, `liveSendsEnabled=false`, and no `canSend`
    - helper behavior: sample-data preview only; token detection; unknown-token approval blocking; STOP-language approval blocking; approval-readiness does not imply send-readiness
    - helper isolation: no provider/Twilio calls, no customer/job/contact reads, no `sms_message_intents`/`sms_provider_deliveries` reads
    - validation recorded: template governance tests `15/15` passed; provider readiness tests `16/16` passed; SMS eligibility tests `16/16` passed; contact recipient tests `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed
    - boundaries preserved: no UI/route/schema/migration/Supabase/provider/send/env/payment/QBO/portal behavior changes
    - F4C-B read-only template status/sample preview is complete in implementation commit `05475929cc69704b1fb22f3dabbde10ff83aed90`; stabilization commit `1ffa475e2167eeb60a206358a4e7032a407bdd0f` added fail-closed provider-readiness handling for local schema-cache/missing-table (`PGRST205`) conditions
    - F4C-B section details: `On-The-Way Template Governance` added to `/ops/admin/communications` (`app/ops/admin/communications/page.tsx`), admin-only/read-only/status-sample-preview-only, required non-sending copy present, no send/test/sandbox/activation/edit/provider controls, no raw provider refs/secrets/full phone/customer/job data exposure
    - F4C-B validation recorded: template governance tests `15/15` passed; provider readiness tests `16/16` passed; SMS eligibility tests `16/16` passed; contact recipient tests `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; browser smoke passed after stabilization
    - real provider-powered SMS remains deferred

  - SMS Slice F4D-A Template Editing + Review Actions Model Lock is complete (docs/model-only):
    - spec added: `docs/ACTIVE/SMS_Template_Editing_and_Review_Actions_Model_Spec.md`
    - cross-references updated across ACTIVE SMS docs, source-of-truth strategy, Active Spine, and Business Layer Roadmap
    - locked implementation sequence (updated): F4D-A docs/model lock, F4D-B validation helper, F4D-C create/save draft server actions, F4D-D review actions, F4D-E1 create/save draft UI (complete), F4D-E2 safe version-id/action-eligibility read-model support for admin readiness (complete), F4D-E3A combined admin readiness action (complete), F4D-E3B mark-ready UI wiring (complete), F5A docs/model lock for durable On-The-Way intent handoff (complete), F5B non-sending event-anchor/intent eligibility helper (complete, `9814340`), F5C-A On-The-Way intent creation model lock (complete), then F5C-B helper only, F5C-C event-id handoff support, F5C-D best-effort Mark On The Way integration, later provider/legal review, later sandbox/provider work, and later production activation only after explicit approval
    - locked future validation helper: `lib/communications/sms-template-governance-validation.ts`
    - locked future action file: `lib/actions/sms-template-actions.ts`
    - locked first future actions: `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm`
    - locked action posture: authenticated internal context, `requireInternalRole("admin")`, account owner derived from internal-user context, explicit scoped lookups, `createAdminClient()` for writes because F4B RLS remains SELECT-only, and revalidation of `/ops/admin/communications`
    - locked validation posture: strict token allowlist, server-side SHA-256 body hash, STOP-language requirement, prohibited promotional wording block, sample-only preview, segment warnings above one segment, and approval block above two estimated segments until provider/legal review says otherwise
    - locked versioning posture: draft versions may be mutable; approved/active/superseded/retired body text is immutable; edits to approved/current wording create a new draft version; `sandbox_version_id` is set only by approve-for-sandbox; `current_version_id` waits for legal/provider review and activation planning
    - locked audit/RLS posture: use existing row actor/timestamp fields first, keep `sms_message_template_events` parked, do not use `job_events`, keep normal authenticated INSERT/UPDATE/DELETE policies absent, and no DELETE actions
    - boundaries preserved: no code/server-action/UI/schema/migration/Supabase/provider/Twilio/send/webhook/activation/env/flag/payment/QBO/portal behavior changes and no production writes
    - template approval/readiness does not enable SMS sending; real provider-powered SMS remains deferred

  - SMS Slice F4D-B Template Governance Validation Helper is complete:
    - implementation commit: `418172e`
    - helper added: `lib/communications/sms-template-governance-validation.ts`
    - tests added: `lib/communications/__tests__/sms-template-governance-validation.test.ts`
    - helper API: `validateOnTheWayTemplateBody(bodyTemplate: string)`
    - helper owns allowed token constants, planning default body, sample token values, STOP-language validation, prohibited wording patterns, body normalization, SHA-256 body hashing, sample preview generation, segment estimation, and draft/review/sandbox readiness flags
    - helper blocks submit/sandbox approval for blank body, unknown tokens, missing STOP language, prohibited promotional wording, and message length above 2 estimated segments
    - helper warnings cover multi-segment messages above 1 segment, unknown tokens, missing STOP language, and prohibited content
    - helper has no Supabase/database/provider dependencies, no UI/server-action behavior, does not enable SMS, and does not imply `canSend`
    - review-request SMS remains parked as a separate future message class and is prohibited inside On-The-Way operational template wording
    - validation recorded: template validation helper tests `19/19` passed; template governance read tests `15/15` passed; provider readiness tests `16/16` passed; SMS eligibility tests `16/16` passed; contact recipient tests `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed
    - boundaries preserved: no code outside helper/tests, no server-action/UI/schema/migration/Supabase/provider/send/env/payment/QBO/portal behavior changes, and real provider-powered SMS remains deferred

  - SMS Slice F4D-C Create/Save On-The-Way Template Draft Actions is complete:
    - implementation commit: `f7cf8c0`
    - action file added: `lib/actions/sms-template-actions.ts`
    - test file added: `lib/actions/__tests__/sms-template-actions.test.ts`
    - actions added: `createOnTheWayTemplateDraftFromDefaultFromForm` and `saveOnTheWayTemplateDraftFromForm`
    - pure helpers exported: `resolveNextVersionNumber` and `isVersionMutable`
    - actions are admin-only, use `createAdminClient()` for writes, derive `account_owner_user_id` from auth context, and revalidate `/ops/admin/communications` + `/ops/admin`
    - create action ensures/reuses the parent template container, reuses an existing mutable draft, and creates a new draft version at `max(version_number) + 1` when the latest is immutable
    - save action validates with `validateOnTheWayTemplateBody`, blocks blank body, updates a mutable draft in place, and creates a new draft version when the latest is immutable
    - both actions persist all validation metadata fields (`body_template`, `body_hash`, `detected_tokens`, `unknown_tokens`, `token_policy_version`, `content_classification`) and never set `current_version_id` or `sandbox_version_id`
    - notice/redirect outcomes: `admin_required`, `body_blank`, `draft_created`, `draft_available`, `draft_saved`, `draft_validation_warning`
    - no UI wired yet; review actions remain deferred to F4D-D; editable UI remains deferred to F4D-E; provider setup, sandbox sends, and live SMS remain deferred
    - validation recorded: template action tests `20/20` passed; template validation helper tests `19/19` passed; template governance read tests `15/15` passed; provider readiness tests `16/16` passed; SMS eligibility tests `16/16` passed; contact recipient tests `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; total `90/90`
    - boundaries preserved: no UI/schema/migration/Supabase production/provider/Twilio/send/webhook/activation/env/flag/payment/QBO/portal behavior changes and no production writes
    - template approval/readiness does not enable SMS sending; real provider-powered SMS remains deferred

  - SMS Slice F4D-D Template Review Actions is complete:
    - implementation commit: `f5995d7`
    - action file: `lib/actions/sms-template-actions.ts`
    - test file: `lib/actions/__tests__/sms-template-actions.test.ts`
    - actions added: `submitOnTheWayTemplateVersionForReviewFromForm`, `approveOnTheWayTemplateVersionForSandboxFromForm`, `rejectOnTheWayTemplateVersionFromForm`
    - actions are admin-only, account-scoped from authenticated internal-user context, and validation-gated with `validateOnTheWayTemplateBody`
    - submit moves scoped latest `draft` version to `pending_review` only; approval for sandbox moves scoped latest `pending_review` version to `approved_for_sandbox` only; reject moves scoped `pending_review` version to `rejected` only with required normalized/bounded `rejected_reason`
    - pointer posture: `sandbox_version_id` is set only by approve-for-sandbox; `current_version_id` remains untouched; submit/reject do not modify template pointers
    - approve-for-sandbox includes best-effort rollback when version approval succeeds but parent sandbox pointer update fails
    - validation recorded: template action tests `40/40` passed; template validation helper tests `19/19` passed; template governance read tests `15/15` passed; provider readiness tests `16/16` passed; SMS eligibility tests `16/16` passed; contact recipient tests `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; total `110/110`
    - boundaries preserved: no UI/route/schema/migration changes, no Supabase production commands, no provider/Twilio/send/webhook/sandbox/live SMS behavior, no env/secret/flag changes, and no payment/QBO/portal/marketplace behavior changes
    - create/save draft UI is completed in F4D-E1; review/reject UI remains deferred unless team-review workflow is reopened; approve-for-activation remains deferred; provider/legal approval actions remain deferred; and real provider-powered SMS remains deferred

  - SMS Slice F4D-E1 Create/Save Draft UI is complete:
    - implementation commit: `1b8b671`
    - files touched: `app/ops/admin/communications/page.tsx` and server-action compatibility touch in `lib/actions/sms-template-actions.ts`
    - UI additions: local notice rendering, `Draft Wording` card, `Create draft from default` form, and latest-draft-only textarea/save form
    - wired actions only: `createOnTheWayTemplateDraftFromDefaultFromForm`, `saveOnTheWayTemplateDraftFromForm`
    - intentionally not wired: submit for review, approve for sandbox, reject, approve for activation, provider setup/send/webhook controls
    - required non-sending copy remains explicit: `SMS is not enabled`, `Live sends are disabled`, `Template approval does not enable sending`, `Sample preview only`, `Mark On The Way does not send SMS`, and legal/provider reminder
    - browser smoke passed after local runtime target alignment: create -> `draft_created`, save -> `draft_saved`
    - runtime finding recorded: initial `template_create_failed` was caused by local reset target vs app runtime target mismatch, not a code defect
    - validation recorded: template action tests `40/40`, template validation `19/19`, template governance read `15/15`, provider readiness `16/16`, eligibility `16/16`, recipients `4/4`, `npx.cmd tsc --noEmit`, `git diff --check`, clean status
    - review/reject UI remains deferred unless team-review workflow is reopened; real provider-powered SMS remains deferred

  - SMS Slice F4D-E2 Admin Readiness Read-Model Support is complete:
    - implementation commit: `fededec`
    - files touched: `lib/communications/sms-template-governance-read.ts` and tests in `lib/communications/__tests__/sms-template-governance-read.test.ts`
    - read-model enhancements: safe versionId exposure on latest/current/sandbox version summaries; accountOwnerUserId removal; latest-version admin readiness fields (`canSaveDraft`, `canMarkReadyForSandbox`, `markReadyBlockingReasons`, `markReadyWarnings`)
    - validation reuse: read model reuses `validateOnTheWayTemplateBody` for token, STOP, prohibited-content, segment, preview, and readiness calculations
    - readiness semantics: latest-version-only; historical current/sandbox versions do not become action-eligible unless they are also latest
    - safety posture: no `canSend` returned; no account owner ids, raw user ids, provider refs, customer/job data, or raw JSON dumps exposed
    - validation recorded: sms-template-governance-read tests passed; sms-template-governance-validation `19/19` passed; sms-template-actions `40/40` passed; sms-provider-readiness-read `16/16` passed; sms-eligibility-inputs-read `16/16` passed; contact-recipients-read `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed
    - boundaries preserved: no UI/route/schema/migration changes, no Supabase production commands, no provider/Twilio/send/webhook behavior, no env/flag/payment/QBO/portal changes, and no production writes
    - admin readiness support is ready for future F4D-E3 UI planning; review/reject UI remains deferred unless team-review workflow is reopened; real provider-powered SMS remains deferred

  - SMS Slice F4D-E3A Combined Admin Readiness Action is complete:
    - implementation commit: `8cfa814`
    - files touched: `lib/actions/sms-template-actions.ts` and tests in `lib/actions/__tests__/sms-template-actions.test.ts`
    - action added: `markOnTheWayTemplateReadyForSandboxFromForm`
    - action purpose: supports simplified V1 admin-owned workflow avoiding queue-shaped submit/approve/reject UI exposure
    - action posture: admin-only via `requireInternalRole("admin")`, account-scoped from authenticated internal-user context, accepts only `version_id` from form, re-validates all data server-side
    - action accepts: latest draft or latest pending_review versions (combined readiness allows both states)
    - action validation: runs `validateOnTheWayTemplateBody()` — requires sandbox-readiness standard (no unknown tokens, STOP language present, no prohibited wording, estimated segments <= 2, canApproveForSandbox = true)
    - action mutations: sets version_status = approved_for_sandbox, internal_review_status = approved, legal_review_status = not_requested, provider_review_status = not_requested, approved_by_user_id, approved_at; updates parent sandbox_version_id only
    - action non-mutations: does not set current_version_id, does not set lifecycle_status, does not enable SMS, does not call provider/Twilio/webhook, does not write job_events
    - action safety: uses pointer-failure rollback posture when parent sandbox_version_id update fails
    - action revalidation: revalidates `/ops/admin/communications` + `/ops/admin` on success
    - validation recorded: sms-template-actions `54/54` passed; sms-template-governance-validation `19/19` passed; sms-template-governance-read `21/21` passed; sms-provider-readiness-read `16/16` passed; sms-eligibility-inputs-read `16/16` passed; contact-recipients-read `4/4` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed
    - boundaries preserved: no UI/route/schema/migration changes, no Supabase production commands, no provider/Twilio/send/webhook behavior, no env/flag/payment/QBO/portal changes, and no production writes
    - visible mark-ready UI wiring is completed in F4D-E3B; review/reject UI remains parked unless team-review workflow is reopened; real provider-powered SMS remains deferred

  - SMS Slice F4D-E3B Admin Readiness UI Wiring is complete:
    - implementation commit: `c998d0e`
    - page changed: `app/ops/admin/communications/page.tsx`
    - existing `On-The-Way Template Governance` section now includes visible `Mark wording ready for sandbox` UI using `markOnTheWayTemplateReadyForSandboxFromForm`
    - button visibility is eligibility-gated from latest-version admin readiness fields and form input is limited to `version_id`
    - visible V1 posture avoids queue-shaped submit/review/reject workflow, keeps review/reject UI parked unless intentionally reopened, and uses readiness/testing language instead of activation language
    - browser smoke recorded `draft_created`, `draft_saved`, `template_marked_ready_for_sandbox`, sandbox version `Approved for sandbox`, forbidden controls absent, and browser-safe rendering confirmed
    - validation recorded: targeted tests `94/94` passed; `npx.cmd tsc --noEmit` passed; `git diff --check` passed; working tree clean
    - boundaries preserved: no code outside admin Communications UI, no schema/migration/provider/Twilio/send/webhook/activation behavior changes, template readiness does not enable SMS, sandbox readiness does not send SMS, Mark On The Way still does not send SMS, and real provider-powered SMS remains deferred

  - SMS On-The-Way V1 Workflow Simplification is locked:
    - Mark On The Way is the user-facing operational trigger.
    - future SMS is a simple background operational/customer-care notification after the lifecycle event, not inline send behavior.
    - provider failure must not roll back the Mark On The Way lifecycle transition.
    - admin controls the V1 On-The-Way wording and is the effective wording owner/approver.
    - field users do not write, preview, or freely edit SMS wording; customer/job-level custom SMS text is not V1.
    - visible V1 UI should not become a multi-person approval/rejection queue; `Reject version` remains deferred unless team-review workflow is reopened.
    - future UI should prefer readiness language such as `Mark wording ready for sandbox` or `Wording ready for future SMS testing`.
    - template readiness and sandbox readiness do not send SMS; real provider-powered SMS remains deferred.
    - `job_events` and manual contact logs are not provider delivery truth; `sms_message_intents.message_body_snapshot` remains the future audit record of attempted SMS wording.
    - F5A model lock adds the durable handoff contract: future On-The-Way SMS intent creation must anchor to a successful `on_my_way` `job_events` row, `sms_message_intents` becomes the first SMS decision/audit truth after that anchor, `sms_provider_deliveries` remains later provider submission/callback truth, current `insertJobEvent` does not return inserted event id, and future F5B/F5C work must explicitly solve event-id anchoring without adding provider work to synchronous Mark On The Way.
    - F5B helper implementation is complete in commit `9814340`: `lib/communications/sms-on-the-way-intent-eligibility.ts` plus tests add `evaluateOnTheWayIntentEligibility(params): Promise<OnTheWayIntentEligibilityResult>` as a read-only/non-sending helper that composes existing recipient, eligibility, template-governance, and provider-readiness helpers, adds F5B-specific job and durable `on_my_way` anchor checks, separates structural blocks from deferred live-send warnings, returns `liveSendEnabled` false, and does not return `canSend`.
    - F5B writes no `sms_message_intents` rows, writes no `sms_provider_deliveries` rows, does not change Mark On The Way behavior, preserves that Mark On The Way still does not send SMS, and keeps real SMS deferred.
    - F5C-A model lock is complete: F5C writes non-sending `sms_message_intents` only, never writes `sms_provider_deliveries`, requires real recipient/template/version/body snapshot truth for writes, enforces write-skipped/no-insert when required fields are missing, and keeps skipped non-target events as no-insert/no-op.
    - F5C-A anchor lock: preferred explicit event-id handoff from successful `on_my_way` insert, with latest-event query fallback only.
    - F5C sequence is explicit: F5C-B helper only, F5C-C event-id handoff support, F5C-D Mark On The Way best-effort integration; provider send/webhook/activation remain deferred.
    - F6A provider/Twilio sandbox send model lock is complete in docs/model-only mode.
    - F6A locks that first sandbox send must be manual/admin-only, consume existing `sms_message_intents` only, require `decision_outcome = ready_for_provider`, and must not be triggered from Mark On The Way.
    - F6A locks provider-delivery posture: future sandbox submit creates `sms_provider_deliveries` before provider call with `provider_status = not_submitted`; Twilio `MessageSid` later maps to `provider_message_id`; provider failure must not roll back job status or create job timeline delivery claims.
    - F6A keeps Twilio/provider secrets server-only and live SMS deferred until webhook/signature validation, status callback, inbound/opt-out or Advanced Opt-Out handling, STOP/HELP readiness, legal/provider review, and explicit activation are complete.
    - F6B provider-delivery preflight helper is complete in commit `f1214ae`: it can create one same-account `sms_provider_deliveries` row with `provider_name = twilio` and `provider_status = not_submitted` for an eligible ready On-The-Way intent, while still making no provider/Twilio calls, no `submitted_at` write, no provider message id write, no sent/delivered/failed status write, and no job/job_event/intent mutation.
    - F6C-A manual sandbox send model lock is complete in docs/model-only mode: future first sandbox send must consume an existing `not_submitted` provider-delivery row, be manual/admin-only, never be triggered by Mark On The Way, never live on job pages, and stay blocked until server-only provider config, sender identity, sandbox gate, and verified test-recipient gates pass.
    - F6C-A locks future reservation semantics: action accepts only `delivery_id`, resolves account/delivery/intent/recipient/template/provider/sender scope server-side, uses guarded update from `not_submitted` to `submitted` immediately before provider handoff, never sets `sent` or `delivered` without callback truth, and never creates job timeline delivery claims.
    - F6C-A acknowledges the current schema has no true in-flight status; using `submitted` as reservation is acceptable only for tightly controlled manual sandbox smoke, with stronger retry/in-flight modeling parked unless explicitly chosen.
    - F6C-A keeps missing webhook acceptable only for manual sandbox smoke; live SMS remains deferred until status callback, Twilio signature validation, inbound opt-out or Advanced Opt-Out handling, callback idempotency, duplicate/out-of-order handling, safe payload retention, legal/provider/A2P/STOP/HELP review, and explicit activation are complete.
    - F6C-B server-only provider config resolver is complete in commit `e292c34`: `resolveSmsSandboxProviderConfig(params)` in `lib/communications/sms-provider-config-resolver.ts` (with tests in `lib/communications/__tests__/sms-provider-config-resolver.test.ts`) reads only same-account provider config and sender identity readiness, enforces twilio+sandbox+sandbox-capable readiness+verified/active sender+Messaging Service+sandbox gate, fails closed when gate missing/disabled, does not read env secrets, does not call Twilio/provider, does not send SMS, does not expose raw provider refs/secrets/credentials, does not return `canSend`, and keeps `liveSendEnabled = false` always.
    - F6C-C1 manual sandbox send gate + resolver model lock is complete in docs/model-only mode: no send/dry-run implementation, no Twilio/provider call, and no schema/UI change is approved in this slice.
    - F6C-C1 locks deterministic server-only sandbox gate requirement before F6C-C2/F6C-C3 and preserves fail-closed behavior when gate is missing/disabled.
    - F6C-C1 prefers explicit `sms_provider_configurations` gate field in future schema work (for example `sandbox_send_enabled`) while allowing alternative account-level gate only if deterministic/server-only; this schema choice is deferred beyond F6C-C1.
    - F6C-C1 locks resolver disambiguation to account + `provider_name = twilio` + `provider_environment = sandbox`; account-only lookup cannot satisfy sandbox readiness.
    - F6C-C1 locks first sandbox send to verified sandbox/test recipients and conservative fail-closed behavior until test-recipient policy is modeled.
    - F6C-C1 sequence lock: F6C-C2 dry-run/manual reservation readiness action only (no Twilio call), then F6C-C3 real manual sandbox send only after explicit Twilio sandbox/env/test-recipient setup approval, then F6D callback/webhook readiness before any live-send path.
    - F6C-C2 dry-run sandbox delivery reservation action is complete in commit `8d6043e` with `lib/actions/sms-sandbox-send-actions.ts` and `lib/actions/__tests__/sms-sandbox-send-actions.test.ts`.
    - F6C-C2 action API: `reserveSmsSandboxDeliveryDryRunFromForm(formData: FormData): Promise<void>`.
    - F6C-C2 action is admin-only, accepts only `delivery_id`, derives account scope from authenticated internal user context, and re-checks delivery + linked intent + provider resolver + sandbox gate + test-recipient posture server-side.
    - F6C-C2 remains evaluation-only and does not call Twilio/provider, does not send SMS, does not submit to provider, does not mutate `sms_provider_deliveries`, does not set `submitted_at`, does not set `provider_message_id`, does not change provider status, and does not mutate `jobs` or `job_events`.
    - F6C-C2 is fail-closed by safe notice codes and currently ends with `sandbox_test_recipient_required` until verified sandbox test-recipient policy is modeled.
    - F6C-C3A sandbox test-recipient + send gate model lock is complete in docs/model-only mode; real sandbox send, provider calls, and live send remain deferred.
    - F6C-C3A locks verified sandbox/test-recipient gate as account-scoped/admin-controlled with no client-trusted approval path; non-verified recipients fail closed.
    - F6C-C3A preferred future test-recipient model is account-scoped `sms_sandbox_test_recipients` (or equivalent account setting) with normalized phone (or safe hash), display label, active flag, verification actor/time, and timestamps.
    - F6C-C3A locks sandbox send gate as account-scoped/server-only/admin-controlled, preferring explicit `sms_provider_configurations` gate field (for example `sandbox_send_enabled`) or intentionally chosen account-level gate.
    - F6C-C3A keeps resolver disambiguation requirement: account + `provider_name = twilio` + `provider_environment = sandbox`; production provider config is never sandbox-ready.
    - F6C-C3A sequence lock: C3A docs/model lock, C3B gate schema/model implementation if approved, C3C resolver update, C3D dry-run update, C4 real manual sandbox send only after explicit Twilio sandbox/env/test-recipient approval, F6D callback/webhook before live-send consideration.
    - F6C-C3A no-go boundaries remain: no job-page send button, no Mark On The Way send trigger, no SMS enabled language, no delivered claims, no browser credentials, no `NEXT_PUBLIC_*` secrets.
    - F6C-C3B schema foundation is complete in commit `75800d3` with migration `supabase/migrations/20260515150000_sms_sandbox_gate_test_recipients_foundation.sql`.
    - F6C-C3B adds schema-backed sandbox send gate fields to `sms_provider_configurations` with fail-closed default (`sandbox_send_enabled = false`) and gate audit metadata.
    - F6C-C3B adds `sms_sandbox_test_recipients` as account-scoped verified sandbox/test-recipient registry foundation (no customer/job linkage required).
    - F6C-C3B keeps gate semantics manual-sandbox-only, non-live, and non-sending by itself.
    - F6C-C3B keeps RLS/write posture fail-closed for writes (account-scoped select only; no authenticated insert/update/delete policies).
    - F6C-C3C resolver update is complete in commit `5af36cb` with explicit account + twilio + sandbox provider selection and schema-backed `sandbox_send_enabled` gating.
    - F6C-C3C keeps fail-closed gate behavior (`sandbox_send_gate_missing_or_disabled`) and retains server-only/no-secret/non-sending readiness output (`liveSendEnabled = false`, no `canSend`).
    - F6C-C3D dry-run action test-recipient gate is complete in commit `e5060e9`; dry-run now passes only when all gate checks pass (delivery, intent, resolver, active verified sandbox test recipient); remains evaluation-only with no Twilio call, no delivery mutation, no jobs/job_events mutation.
    - F6C-C4 Manual Sandbox Provider Submit Action is complete in commit `98b057a`; this is the first server-only Twilio provider call path.
    - F6C-C4 adds `submitSmsSandboxDeliveryToProviderFromForm(formData)` as admin-only, gated, test-recipient-only provider submit action.
    - F6C-C4 adds `lib/communications/twilio-messages-client.ts` as server-only Twilio Messages REST API client (credentials from server env vars only; never exposed).
    - F6C-C4 performs guarded delivery reservation before calling Twilio; zero-row reservation returns `sandbox_delivery_reserved` without calling provider.
    - F6C-C4 on Twilio success: records `provider_message_id`, `provider_raw_status`, normalized `provider_status`, and `provider_last_event_at` on `sms_provider_deliveries`; never writes `sent_at` or `delivered_at`.
    - F6C-C4 on immediate Twilio error: records `provider_status = failed`, `failed_at`, sanitized error code/message/raw status, and `provider_last_event_at`.
    - F6C-C4 never mutates `sms_message_intents`, `jobs`, `job_events`, invoices, payments, QBO records, or portal records.
    - F6C-C4 does not add webhook/status callback behavior, UI/route exposure, or Mark On The Way send trigger.
    - All F6C-C4 tests mock Twilio/provider behavior; no real Twilio calls were executed during tests (47/47 pass).
    - No sent/delivered claims until webhook/callback truth is established in F6D.
    - Mark On The Way still does not send SMS, and real SMS remains deferred.
    - Next: optional controlled sandbox smoke only after explicit approval and verified env/test-recipient setup; F6D webhook/status callback required before live SMS consideration.

- Job Detail responsiveness closeout is complete and pushed across commits `655d83b` and `4ecf127`:
  - Service Closeout Read De-Dupe (`655d83b`) removed a duplicate blocking read from `ServiceStatusActions`; `app/jobs/[id]/page.tsx` now passes already-loaded `jobType` and `opsStatus` into the panel.
  - Job Detail Location Preview Deferral (`4ecf127`) moved Street View/static map lookup behind `Suspense` around `TimedJobLocationPreview`; immediate fallback preserves address context plus `Navigate` and `Open in Maps` while map imagery resolves after first paint.
  - this is responsiveness/perceived-performance only; no source-of-truth ownership, lifecycle behavior, `/ops` queue behavior, Service Plans behavior, invoice/payment behavior, portal/SMS/QBO behavior, schema/migration state, auth/RLS, entitlement, or feature-flag behavior changed.
  - validation recorded: `npx.cmd tsc --noEmit` passed, `git diff --check` passed, browser smoke passed on service and Service Plan-linked job paths.
  - caveat: dedicated ECC-negative smoke should continue during normal ongoing testing; the location-preview deferral is job-type neutral.
  - guardrail framing: these are shared job-detail responsiveness improvements that preserve neutral actor boundaries and scalable operational truth for future marketplace-style evolution.

- Field Status Return-Anchor Continuity is complete and pushed in commit `7ac454b`:
  - job detail now has a stable `#field-status-actions` anchor positioning field status action cluster consistently.
  - field status redirects now return users near the action cluster after:
    - Mark On The Way
    - Mark In Progress
    - Mark Job Complete
    - Undo/Revert On The Way
  - existing `tab`, `banner`/`notice`, cache-bust query, mutation behavior, lifecycle event writes, and revalidation behavior were preserved.
  - banner cleanup may remove the hash from the final visible URL, but the viewport remains positioned near the field-status action area; this caveat is accepted as-is.
  - validation recorded: `npx.cmd tsc --noEmit` passed, `npx.cmd vitest run lib/actions/__tests__/job-lifecycle-scope-hardening.test.ts` passed (16/16 tests), `git diff --check` passed, browser smoke passed for covered status flow, Service Plan-linked job, `/ops` dashboard, and banner cleanup behavior.
  - boundaries preserved: no source-of-truth ownership, mutation/lifecycle/revalidation behavior, `/ops` queue behavior, Service Plans behavior, invoice/payment behavior, portal/SMS/QBO behavior, schema/migration state, auth/RLS, entitlement, or feature-flag behavior changed.
  - button/status-transition speed work is paused for the current pass. future button-speed/status-transition work should be reopened only if real usage identifies a specific slow/jittery action or repeated UX problem, not as preventative polish.
  - guardrail framing: this is shared job-detail reliability/continuity hardening that preserves neutral actor boundaries and scalable operational truth for future marketplace-style evolution, not Eddie-specific polish.

- Group 9A-14B Service Plans Drilldown Navigation Polish is complete and pushed in commit `f05bc29`:
  - `/service-plans` remains read-only
  - Service Plan names now deep-link to focused customer agreement cards using `/customers/{customerId}?maFocus={agreementId}#maintenance-agreement-{agreementId}`
  - row-level `Manage on Customer` links added
  - customer agreement cards now expose stable anchor ids and focused-card highlight styling
  - helper copy now clarifies customer-profile ownership of edit/create-work-order/default-Work-Items actions
  - no mutation controls were added to `/service-plans`

- Group 9A-14C Service Plan Detail Snapshot on Customer Profile is complete and pushed in commit `eefae0b`:
  - customer profile agreement cards now surface summary-first read-only `Plan Snapshot` before edit controls
  - snapshot includes plan name, status, frequency, start date, next due date, renewal date, primary location, and visit links/used visits where available
  - cards now include read-only `What's Included` from default Work Items with empty-state copy `No default Work Items saved for this plan yet.`
  - `Create Work Order` remains prominent and `Edit Details` remains secondary/collapsed
  - no persistence/server-action/counting/next-due/invoice-payment/calendar-recurrence behavior changed

- Validation recorded for 9A-14B / 9A-14C:
  - `npx.cmd tsc --noEmit` passed
  - `git diff --check` passed
  - browser smoke passed for `/service-plans` load, deep-link navigation, focused-card anchor/highlight, snapshot and included-items visibility, `Create Work Order` availability, `Edit Details` collapsed state, and `/service-plans` read-only posture

- Service Plans / Maintenance Agreements status:
  - closed for now after 9A-14A, 9A-14B, and 9A-14C
  - reopen only for real-world workflow bugs or strongly validated user feedback
  - do not add more Service Plan capability in the next pass unless explicitly reopened

- Group 9A-13B-C Safe Confirm Write (agreement + link metadata idempotency truth) is complete and pushed in commit `3e8c769` with 9A-13B-C1 browser smoke closeout:
  - confirm now writes both surfaces on success: `maintenance_agreements.next_due_date` and `maintenance_agreement_visits` confirmation metadata (`baseline_next_due_date`, `confirmed_next_due_date`, `next_due_confirmed_at`, `next_due_confirmed_by_user_id`)
  - link metadata is the idempotency truth: counted link can confirm once; repeat confirm from same counted link is blocked with `confirm_next_due_already_confirmed`
  - stale-state guard remains active and unchanged
  - confirm remains job-detail-only in this slice; no customer profile confirm surface, no `/service-plans` confirm surface, no persistent next-due expansion yet
  - browser smoke fixture: `job_id=f6600de6-63d9-4551-94c1-a0b3a8db9a5c`, `agreement_id=454b3737-fa39-46be-8925-45131a571693`, `link_row_id=307cc7d6-5ef2-4d06-bf8c-25fa828b4d66`
  - first confirm outcome: `confirm_next_due_saved`, agreement next due advanced `2026-07-15` -> `2026-08-15`, all four link metadata fields populated, link count flags unchanged (`count_status=counted`, `counts_toward_visit_balance=true`), job remained `completed/invoice_required`, invoices remained `0`
  - repeat confirm outcome: blocked with `confirm_next_due_already_confirmed`
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (71/71), `npx.cmd tsc --noEmit` passed, `git diff --check` passed, working tree clean after push
  - boundaries preserved: no automatic due-date advancement, no recurrence engine, no automatic job generation, no invoice/payment behavior, no customer portal/SMS/QBO behavior

- Display-only follow-up fix for confirm dialog date rendering is complete and pushed in commit `fb621c7`:
  - fixed date-only display shift by formatting `YYYY-MM-DD` directly as `MM/DD/YYYY` in confirm dialog
  - example: stored `2026-08-15` now displays `08/15/2026`
  - no stored-value changes, no hidden-form-value changes, no date-calculation changes, and no server action behavior changes
  - validation recorded: `npx.cmd tsc --noEmit` passed, `git diff --check` passed, working tree clean after push

- Group 9A-13B-D1 Persistent Next Due Context on Job Detail is complete and pushed in commit `ba18ff3`:
  - job detail now derives next-due context from durable counted-link state, not transient banner state
  - counted unconfirmed link shows `Suggested next due date` and `Confirm Next Due Date`
  - counted confirmed link shows read-only confirmed context and hides `Confirm Next Due Date`
  - confirmed read-only copy is locked as:
    - `Next due date already confirmed for this counted visit.`
    - `Confirmed: MM/DD/YYYY`
    - `Previous due date: MM/DD/YYYY`
  - `Mark Visit Counted` behavior for eligible uncounted links is preserved
  - no server action/schema/persistence/feature-flag changes
  - validation recorded: `npx.cmd tsc --noEmit` passed, `git diff --check` passed, browser smoke passed for confirmed and unconfirmed counted-job states

- Group 9A-13B-D2 Confirm Next Due Banner Mapping + Date Display Consistency is complete and pushed in commit `b5f7bd8`:
  - added explicit confirm-next-due banner mappings:
    - `confirm_next_due_saved`: `Service Plan next due date updated.`
    - `confirm_next_due_already_confirmed`: `This visit has already confirmed the Service Plan next due date.`
    - `confirm_next_due_stale_state`: `This suggestion is out of date. Refresh and review the latest next due date before confirming.`
    - `confirm_next_due_not_counted`: `This visit must be counted before confirming the next due date.`
    - `confirm_next_due_unavailable`: `Service Plan next due confirmation is currently unavailable.`
    - `confirm_next_due_update_failed`: `Could not update the Service Plan next due date. Please try again.`
  - unified job-detail next-due display to `MM/DD/YYYY` using date-only parsing for suggestion panel and confirm dialog display text
  - stored values and hidden form values remain `YYYY-MM-DD`
  - no date-calculation logic changes and no server action behavior changes
  - validation recorded: `npx.cmd tsc --noEmit` passed, `git diff --check` passed, browser smoke confirmed `MM/DD/YYYY` display and banner copy

- Group 9A-13B-B Next Due Confirmation Metadata Foundation is complete and pushed in commit `91d900a`; sandbox migration applied and Docker-verified in 9A-13B-B1:
  - migration `20260514120000_maintenance_agreement_visits_next_due_confirmation_metadata.sql` adds four nullable metadata columns to `maintenance_agreement_visits`
  - fields: `next_due_confirmed_at` (timestamptz), `next_due_confirmed_by_user_id` (uuid, FK to `auth.users(id)` ON DELETE SET NULL), `confirmed_next_due_date` (date), `baseline_next_due_date` (date)
  - no existing rows backfilled; all four fields null across 8 sandbox rows
  - read model extended: `MaintenanceAgreementVisitLinkRow` type updated, normalizer extended, `hasMaintenanceAgreementVisitConfirmedNextDue(link)` exported, fields added to all relevant visit-link `select(...)` lists
  - tests: 70/70 passed including confirmed/unconfirmed metadata helper tests; count/used-visit projections unchanged; confirm action behavior unchanged
  - Docker-backed schema dump verified: all four columns present and nullable; FK ON DELETE SET NULL confirmed; RLS enabled; `select_account_scope`, `insert_account_scope`, `update_account_scope` policies confirmed; no DELETE policy found
  - sandbox ref `kvpesjdukqwwlgpkzfjm` targeted; production ref `ornrnvxtwwtulohqwxop` not targeted; production migration not applied
  - boundaries: no UI changes, no confirm action expansion, no agreement mutation, no count_status changes, no feature-flag changes, no production writes

- Group 9A-13B-A Next Due Idempotency Model Docs is complete as docs/model-only (no implementation changes):
  - audit finding recorded: current Suggested Next Due/Confirm visibility is banner-gated plus counted-link-gated; persistent confirm without durable idempotency can allow repeated next-due advancement from the same counted link
  - recommended outcome C adopted: add durable idempotency marker before persistent confirm
  - model decision: use `maintenance_agreement_visits` as durable idempotency surface for next-due confirmation
  - planned metadata fields: `next_due_confirmed_at`, `next_due_confirmed_by_user_id`, `confirmed_next_due_date`, `baseline_next_due_date`
  - confirm rule (future implementation): agreement next due update and link confirmation metadata write occur together as one logical operation; link with existing next-due confirmation metadata must not advance again
  - persistent UI rule (future implementation): counted visit may show persistent read-only context; confirm action should render only before link-level next-due confirmation; post-confirm should show read-only confirmation context
  - stale-state rule retained: agreement `next_due_date` must match `baseline_next_due_date` before write or fail safely with refresh/review guidance
  - recommended sequence recorded: 13B-B schema/read-model/tests, 13B-C safe confirm write of agreement plus link metadata, 13B-D persistent read-only context plus post-confirm action suppression, then sandbox browser smoke
  - boundaries preserved in this model slice: no schema/migration/code changes, no automatic advancement, no recurrence generation, no invoice/payment behavior, no seasonal-window implementation, no portal/SMS/QBO behavior, no reversal/adjustment UI

- Group 9A-13A Service Plan Work Items Prefill Structured Validation Fix is complete and pushed in commit `a116c1e`:
  - root cause addressed: legacy/default Service Plan Work Item shapes (`item_name`, `description`, `pricebook_item_id`, `default_unit_price`) could degrade `/jobs/new` prefill into blank/Untitled Work Item behavior and trigger structured Work Item submit blocking
  - fix implemented in Service Plan prefill read path: normalize legacy/default Work Item shapes before sanitization so valid data survives into canonical Work Item fields
  - browser smoke recorded on sandbox fixture: customer `8e3c6860-e4c3-4a93-83cb-2e91c49f883f`, agreement `52851fbf-0e65-482d-868a-1c858521d128`, created job `99c1acff-6d38-4aa9-ade0-954a50a14998`
  - smoke outcome: meaningful Work Item title rendered (`Legacy Compressor Diagnostic`), submit succeeded without manual Pricebook reselection, persisted canonical `visit_scope_items` included populated source pricebook id and expected unit price `189`
  - side-effect checks recorded: no invoice/payment rows created, agreement `next_due_date` remained `2026-06-15`, and new link row remained `linked` and not counted
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__/read-model.test.ts lib/jobs/__tests__/new-job-defaults.test.ts` passed (`35/35`), `npx.cmd tsc --noEmit` passed, `git diff --check` passed, working tree clean
  - boundaries preserved: no visit-counting mutation, no next-due-date mutation, no invoice/payment behavior change, no schema/migration/flag changes, and no recurrence/job-generation changes
  - watch item: temporary sandbox auth user cleanup may remain due to sandbox delete error; this is sandbox cleanup scope only and not product behavior scope

- Group 9A-11C-B Confirm Next Due Date action on job detail for interval-based maintenance agreements is complete and pushed in commit `c30cbac`:
  - job detail now shows explicit blue `Confirm Next Due Date` action button for counted Service Plan visits with valid interval-based suggested next due dates
  - action appears only for: active agreements, counted links with `counts_toward_visit_balance=true`, interval frequencies (`monthly`, `quarterly`, `semi_annual`, `annual`), and feature-flag enabled
  - action is blocked/hidden for: custom/manual frequencies (manual-scheduling guidance shown instead), inactive agreements, non-counted links, stale baseline (optimistic concurrency guard), disabled feature flag, out-of-scope records
  - confirmation dialog copy is explicit: `This will update the Service Plan next due date to [date]. It will not create a job, schedule an appointment, create an invoice, collect payment, or renew the plan. Continue?`
  - stale-state protection implemented: server action compares current `maintenance_agreements.next_due_date` to `baselineNextDueDate` passed from form; fails with `confirm_next_due_stale_state` banner if values diverge, preventing race conditions in concurrent scenarios
  - mutation contract is narrow: updates only `maintenance_agreements.next_due_date` (to suggested value) and `updated_by_user_id` (to current internal user), with normal `updated_at` behavior; does not mutate links/jobs/service cases or create calendar/invoice/payment records
  - revalidates affected surfaces on success: `/jobs/{jobId}`, `/service-plans`, `/customers/{customerId}`
  - test coverage: 6 new confirm scenarios (success update, stale-state protection, custom frequency blocking, inactive agreement blocking, non-counted link blocking, feature flag enforcement) plus 61 existing suite tests, all passing (67/67 total)
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (67/67 tests), `npx.cmd tsc --noEmit` passed, `git diff --check` passed, working tree clean, commit pushed to origin/main
  - browser smoke testing deferred with justification: unit test coverage sufficient (stale-state guard, precondition validation, mutation contract verification tested); browser click-through smoke should be performed later in staging with ready authenticated fixture
  - boundaries preserved: no automatic date advancement, no recurrence engine, no automatic job generation, no calendar events, no invoice/payment behavior, no portal/SMS/QBO behavior, no renewal automation, no customer profile/service-plans confirm actions yet (parked), no seasonal-window confirm yet (parked)
  - implementation status: job-detail-first confirm action is now live; customer profile and `/service-plans` confirm actions remain parked until job-detail V1 is proven in real usage

- Group 9A-11C-A Confirm Next Due Date Model Docs is complete (docs/model-only; no implementation changes):
  - first confirm action location is job detail, directly under or near the read-only suggestion block
  - customer profile and `/service-plans` confirm actions remain parked until job-detail V1 confirm behavior is proven
  - core rule locked: suggested next due date never auto-writes; any agreement `next_due_date` change must be explicit and operator-confirmed
  - planned preconditions include: active internal user, active agreement, counted/counts-toward link row, interval suggestion present, strict account/customer scope match, and stale-state guard requiring unchanged baseline `next_due_date`
  - planned mutation contract is narrow: update only agreement `next_due_date` + `updated_by_user_id` (normal `updated_at` behavior), with no mutation of links/jobs/service cases and no calendar/invoice/payment side effects
  - stale-state behavior is fail-safe with refresh-required guidance: `This suggestion is out of date. Refresh and review the latest next due date before confirming.`
  - custom/manual frequency remains no-confirm with `Manual scheduling required.`
  - seasonal-window confirm behavior remains parked until template/window schema is approved
  - non-goals remain explicit: no automatic date advancement, no recurrence engine, no automatic job generation, no calendar events, no invoice/payment behavior, no portal/SMS/QBO behavior, no renewal automation, and no non-job-detail confirm surfaces yet

- Group 9A-11B Read-Only Suggested Next Due / Due Window Projection is complete and pushed in commit `d627b91`:
  - counted maintenance-job detail now renders a read-only `Suggested next due date` block
  - projection copy is explicit: `This is a suggestion only. Confirming next due date will be added later.`
  - no `Confirm Next Due Date` action is present in this slice
  - projection supports `monthly`, `quarterly`, `semi_annual`, and `annual` frequencies using cadence-preserving roll-forward from current agreement `next_due_date`; `custom` or missing date falls back to `Manual scheduling required.`
  - browser + DB closeout recorded on fixture `job_id=f6600de6-63d9-4551-94c1-a0b3a8db9a5c` / `agreement_id=454b3737-fa39-46be-8925-45131a571693` / `link_row_id=307cc7d6-5ef2-4d06-bf8c-25fa828b4d66`: post-count link fields updated to counted state, agreement `next_due_date` remained `2026-06-15`, invoice/payment counts remained zero
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`61` tests), `npx.cmd tsc --noEmit` passed, `git diff --check` passed, `git status --short` clean
  - boundaries preserved: no automatic next-due advancement, no confirm-write action, no invoice/payment behavior, no recurrence engine, no automatic job generation, no portal/SMS/QBO behavior

- Group 9A-11A Service Plan Due Window / Next Due Model is documented as planning-only (no implementation changes) with the following model decisions:
  - counting a service-plan visit does not auto-advance `maintenance_agreements.next_due_date`
  - future cadence supports both interval suggestions (monthly/quarterly/semi_annual/annual/custom-manual) and seasonal service windows (Spring/Fall/custom)
  - seasonal due-state language should favor `Upcoming`, `In Service Window`, `Overdue`, and `Manual scheduling required`
  - suggestion-first read model is preferred; any future due-date write remains explicit operator confirmation and active-status gated only
  - boundaries preserved: no automatic due-date advancement, no recurrence engine, no auto job generation, no invoice/payment behavior, and no portal/SMS/QBO behavior

- Group 9A-10C Manual Mark Visit Counted on Job Detail is complete and pushed in commit `1b69336`, with visibility closure fix in commit `2ae1a4b`:
  - eligible linked maintenance jobs now surface `Service Plan Visit Count Review` and `Mark Visit Counted` in always-visible job-detail scope
  - action remains manual/operator-confirmed and updates only the target `maintenance_agreement_visits` link row count fields (`count_status='counted'`, `counts_toward_visit_balance=true`, counted audit fields)
  - agreement record remains unchanged, `next_due_date` is not advanced, and no invoice/payment behavior is introduced
  - already-counted jobs do not re-show `Mark Visit Counted`
  - browser smoke recorded end-to-end on job `d39a96d9-e699-45fe-b545-2968202441b9` / link `82b44fd5-86c5-459b-a893-037b37a968a1` with before/after link-row state change (`linked` -> `counted`) and `/service-plans` projection shift from eligible to counted
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__ job-detail-operational-entitlement-hardening.test.ts` passed (`77` tests), `npx.cmd tsc --noEmit` passed, `git diff --check` passed
  - boundaries preserved: no automatic counting, no automatic due-date advancement, no recurrence engine, no invoice/payment behavior, no Stripe/QBO/SMS/customer portal behavior, no renewal automation, and no mutable remaining-visit counter

- Group 9A-10B Service Plan Count Eligibility Read-Only Projection is complete and pushed in commit `0588a26`:
  - `/service-plans` now shows a read-only `Visit Count Review` column with labels: `No linked visits`, `Linked`, `Eligible for count review`, `Counted`, `Excluded`, `Reversed`, and `Not eligible`
  - projection labels are display-only; count mutation is handled only through the explicit manual 10C job-detail action
  - used visits remain derived only from links where `count_status='counted'` and `counts_toward_visit_balance=true`
  - validation recorded: browser smoke passed (`/service-plans` render, labels/badges, no count-action UI, filters/customer links), `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`45` tests), `npx.cmd tsc --noEmit` passed, and `git diff --check` passed
  - watch items: no-show and duplicate remain defensive/non-first-class lifecycle enums; Partial Work Items still need per-item completion modeling before safe automatic counting

- Group 9A-9E Service Plan Work Items Prefill + Link Creation Runtime Fix is complete and pushed in commit `c4a08d9`:
  - agreement create/edit now persists default Work Items in addition to summary text
  - customer agreement forms now support default `Visit Scope / Work Items`
  - `/jobs/new` Step 5 now preloads service-plan summary + Work Items from agreement defaults
  - service-plan-origin job creation persists `job_type='service'`, `service_visit_type='maintenance'`, `visit_scope_summary`, and `visit_scope_items`
  - runtime root cause fixed: link creation moved before `postCreate(...)` redirect so link insertion is reachable
  - created link row remains `link_source='service_plan_prefill'`, `count_status='linked'`, `counts_toward_visit_balance=false`
  - validation recorded: `45/45` targeted tests passed, `npx.cmd tsc --noEmit` passed, `git diff --check` passed, and browser smoke passed end-to-end
  - boundaries preserved: no automatic counting, no due-date advancement, no visit-balance deduction, no invoice/payment behavior, no recurrence engine

- Group 9A-9C Link-Row Creation When Job Is Created from Service Plan is complete and pushed in commit `071915a`:
  - new action: `createMaintenanceAgreementVisitLinkFromJobCreation` in `lib/maintenance-agreements/agreement-actions.ts`
  - automatic link creation after normal job creation succeeds via three job creation paths in `lib/actions/job-actions.ts`
  - form capture of `maintenance_agreement_id` in `app/jobs/new/NewJobForm.tsx`
  - link row created with: `link_source='service_plan_prefill'`, `count_status='linked'`, `counts_toward_visit_balance=false`
  - strict scope validation: feature flag `ENABLE_MAINTENANCE_AGREEMENTS`, internal user required, account/agreement/job/customer scope matching
  - non-blocking failure: invalid scopes/flag off/missing IDs silently skipped without blocking job creation
  - agreement record unchanged, `next_due_date` not advanced, visit balance not deducted, no automatic counting
  - link creation runs after each of three job creation paths: customer follow-up, customer new location, new customer
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`40` tests; 2 new link creation tests added), `npx.cmd tsc --noEmit` passed, `git diff --check` passed
  - boundaries preserved: no automatic counting/due-date/balance logic/Supabase commands/production migration apply/production writes/feature-flag changes
  - watch items: job ownership scoping via `jobs.customer_id` linkage (will need review if model broadens); link creation runs silently after each of three job creation paths; count-state transitions and reversal tooling remain parked
  - link-row creation is committed in repo and active immediately after link-table migration is applied; runs on every job creation from service plan prefill when flag is enabled

- Group 9A-9B Maintenance Agreement Visits Link Table Foundation is complete and pushed in commit `6bf7329`:
  - new link table: `maintenance_agreement_visits` in migration `supabase/migrations/20260513110000_maintenance_agreement_visits_link_foundation.sql`
  - durable `(agreement_id, job_id)` unique link with lifecycle fields (`link_source`, `count_status`, `counted_at`, `reversed_at`, reversal audit trail)
  - link-source values: `service_plan_prefill`, `manual`, `system_future` — distinguishes prefill vs manual vs future origins
  - count-status lifecycle: `linked`, `eligible`, `counted`, `excluded`, `reversed` — enables future reversibility without V1 count mutations
  - RLS: SELECT/INSERT/UPDATE account-scoped policies; no DELETE policy
  - read helpers in `lib/maintenance-agreements/read-model.ts`: `listMaintenanceAgreementVisitsForAgreement`, `listMaintenanceAgreementLinksForJob`, `summarizeMaintenanceAgreementVisitLinksForAgreement`
  - 4 new vitest-passed link-helper tests added to `lib/maintenance-agreements/__tests__/read-model.test.ts`
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`38` tests), `npx.cmd tsc --noEmit` passed, `git diff --check` passed
  - boundaries preserved: no UI/routes/automatic counting/due-date/balance logic/Supabase commands/production migration apply/production writes/feature-flag changes
  - watch items: job-ownership scoping via customer_id linkage (will need review if model broadens); count-state transitions and reversal tooling remain parked
  - link-table foundation is committed in repo but not production-active until migration apply is intentionally executed

- Group 9A-8B Service Plans Read-Only Drilldown Page + Ops Link is complete and pushed:
  - new read-only internal/account-scoped `/service-plans` route added in `app/service-plans/page.tsx` with loading state in `app/service-plans/loading.tsx`
  - `/ops` Service Plans summary card now includes `View Service Plans` when feature-gated
  - `/ops` remains summary-only; full list read executes only on `/service-plans`
  - drilldown helper `listMaintenanceAgreementDrilldownForAccount` implemented in `lib/maintenance-agreements/read-model.ts` with targeted coverage in `lib/maintenance-agreements/__tests__/read-model.test.ts`
  - read-only row shape includes customer/location/status/type/frequency/next due/due state, and customer names link to existing customer detail pages
  - filters on `/service-plans`: `all`, `active`, `overdue`, `due_today`, `due_1_7_days`, `due_8_30_days`, `not_scheduled`, `inactive`
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`34` tests), `npx.cmd tsc --noEmit` passed, `git diff --check` passed; browser smoke: flag off: Ops hides Service Plans link; /service-plans redirects/fails closed; flag on: Ops link visible; /service-plans renders rows and customer links; all filter chips manually tested successfully; Ops continuity confirmed
  - boundaries preserved: no create/edit on drilldown, no Create Work Order action on drilldown, no job generation, no due-date advancement, no visit-balance deduction, no invoice/payment/Stripe/QBO/SMS/customer-portal behavior, and no heavier `/ops` drilldown query
  - watch item: helper bucket logic remains covered by targeted tests.

- Group 9A-7B Manual Create Work Order from Service Plan Prefill V1 is complete and pushed in commit `3c186e5`:
  - customer profile maintenance agreement cards now expose compact `Create Work Order` entry points when feature-gated
  - link payload remains lightweight: `customer_id` + `maintenance_agreement_id`
  - `/jobs/new` now performs server-side scoped agreement prefill resolution only when:
    - `ENABLE_MAINTENANCE_AGREEMENTS` is enabled
    - internal context is present
    - ids are valid UUIDs
    - account/customer scope matches
  - no Work Item JSON is passed in URL params
  - `NewJobForm` prefill includes editable customer/location/service defaults and safe agreement context banner:
    - customer preselection
    - primary location preselection when valid
    - service defaults with `service_case_kind=maintenance` and `service_visit_type=maintenance`
    - reason/dispatch notes from agreement default summary
    - sanitized default Work Items when valid
    - non-persisted agreement context line (name + due date)
  - invalid/unavailable agreement prefill fails safely with non-blocking warning and normal intake continuity
  - submit remains existing create flow (`createJobFromForm`) and creates normal job/work order
  - agreement records are not mutated by job creation
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__ lib/jobs/__tests__/new-job-defaults.test.ts` passed (`4` files / `36` tests), `npx.cmd tsc --noEmit` passed, browser smoke passed for link visibility, prefill behavior, normal create, unchanged agreement state, invalid-id fallback, and surface continuity
  - boundaries preserved: no schema/migration/Supabase/production/feature-flag change; no automatic jobs/calendar/invoice/payment/Stripe/QBO/SMS/customer portal behavior; no due-date advancement; no visit-balance deduction; no persisted job/agreement linkage
  - watch items:
    - ECC-locked product-mode UI can still show ECC-oriented presentation copy while service-plan prefill applies service/maintenance defaults
    - relationship-context logs briefly showed both ECC and Service during dev interaction transitions; final create succeeded
    - sandbox/local smoke created test job `bb30cd33-f4a4-4a02-a006-98a9319f77d6`

- Group 9A-6 Service Plans Ops Read-Only Card is complete and pushed in commit `1776042`:
  - ops surface: feature-gated read-only Service Plans summary card on `/ops` in `app/ops/page.tsx`
  - read model source: `summarizeMaintenanceAgreementsForAccount`
  - card counts: `Active Plans`, `Overdue`, `Due Today`, `Due in 1-7 Days`, `Due in 8-30 Days`, `Not Scheduled`
  - helper copy: "Service plan counts are planning visibility only. Work orders are created separately."
  - fail-safe behavior: `/ops` remains functional and card stays hidden/non-blocking if summary read fails
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`28` tests), `npx.cmd tsc --noEmit` passed, `git diff --check` passed; browser smoke passed for flag off/on visibility expectations and existing-section continuity
  - boundaries preserved: no schema/migration/Supabase/production/flag/job/calendar/invoice/payment/portal/create-edit-from-ops changes
  - implementation status statement: Service Plan counts and due/overdue summary logic are implemented in the repo/read model and exposed on `/ops` as a read-only card, but no broader user-facing Service Plans module dashboard exists yet.
  - watch items: `as_of_date` currently reflects server date resolution; due windows remain intentionally exclusive (`1-7`, `8-30`)

- Group 9A-5B Service Plan Due/Overdue Summary Read Model is complete and pushed:
  - read model: `summarizeMaintenanceAgreementsForAccount` in `lib/maintenance-agreements/read-model.ts`
  - tests: `lib/maintenance-agreements/__tests__/read-model.test.ts` expanded for mixed status counts, due boundaries, active-only due buckets, and safe empty/default scope behavior
  - summary output includes: status counts (`active`, `draft`, `paused`, `expired`, `cancelled`), due counts (`overdue`, `due_today`, `due_in_next_7_days`, `due_in_next_30_days`, `not_scheduled_active`), `total_count`, and `as_of_date`
  - rules preserved: strict `account_owner_user_id` scoping, inactive-status exclusion from due queue buckets, single as-of date resolution for consistent calculations
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`28` tests), `npx.cmd tsc --noEmit` passed, `git diff --check` passed aside from LF/CRLF warnings
  - boundaries preserved: no UI/routes/ops-card/schema/migration/Supabase/production/flag/job/calendar/invoice/payment/portal behavior changes
  - implementation status statement: Service Plan counts and due/overdue summary logic are implemented in the repo/read model, but no user-facing module dashboard or Ops card exists yet.

- Group 9A-4 Maintenance Agreement Create/Edit V1 is complete and pushed in commit `9f81d6f`:
  - server actions: `lib/maintenance-agreements/agreement-actions.ts`
  - customer profile create/edit UI: `app/customers/[id]/page.tsx`
  - tests: `lib/maintenance-agreements/__tests__/agreement-actions.test.ts`
  - internal-only create/edit preserves account/customer/location scope and mutates allowed fields only
  - recorded allowed create fields: `agreement_name`, `agreement_type`, `frequency`, `next_due_date`, `start_date`, optional `renewal_date`, optional `primary_location_id`, optional `default_visit_scope_summary`, optional `internal_notes`
  - recorded allowed edit fields: create fields plus `status`
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`26` tests), `npx.cmd tsc --noEmit` passed, browser smoke passed create/edit flow with `maSaved=created` and `maSaved=updated`
  - boundaries preserved: no delete, no customer reassignment, no preferred technician UI, no multi-location support, no job generation, no calendar events, no invoices/payments, no Stripe tenant payment behavior, no QBO, no SMS, no portal
  - implementation status statement: Maintenance Agreements create/edit is implemented in repo and sandbox-ready behind feature gating, but production remains inactive until migration apply and flag enablement are intentionally approved.

- Group 9A-3 Customer Profile Read-Only Agreement Display is complete and pushed in commit `09edc9f`:
  - feature flag: `lib/maintenance-agreements/agreement-exposure.ts` (`ENABLE_MAINTENANCE_AGREEMENTS`, defaults `false`)
  - customer profile: `app/customers/[id]/page.tsx` — guarded read + Maintenance Agreements section (internal viewer + flag on only)
  - tests: `lib/maintenance-agreements/__tests__/agreement-exposure.test.ts` (14 tests; 21 total with read-model)
  - validation recorded: `npx.cmd vitest run lib/maintenance-agreements/__tests__` passed (`21` tests), `npx.cmd tsc --noEmit` passed
  - production guard: `ENABLE_MAINTENANCE_AGREEMENTS` defaults `false`; production does not attempt reads before migration apply
  - boundaries preserved: no create/edit agreements, no job generation, no calendar events, no invoices/payments, no Stripe tenant payment behavior, no QBO, no SMS, no portal
  - visual sandbox smoke with flag enabled is a watch item (session ended before live flag-on smoke)
  - activation rule: set `ENABLE_MAINTENANCE_AGREEMENTS=true` in `.env.local` on sandbox to exercise the section

- Group 9A-2 Maintenance Agreements backend foundation is complete and pushed in repo (`b126ff6`):
  - migration: `supabase/migrations/20260512120000_maintenance_agreements_v1.sql`
  - read model: `lib/maintenance-agreements/read-model.ts`
  - tests: `lib/maintenance-agreements/__tests__/read-model.test.ts` (targeted run passed with `7` tests)
  - validation recorded: `git diff --check` passed and `npx.cmd tsc --noEmit` passed
  - boundaries preserved: no job linkage/generation, no calendar events, no invoices/payments, no Stripe tenant payment behavior, no QBO, no SMS, no portal, and no UI mutation flow
  - activation rule: backend foundation is committed in repo, but is not production-active until migration apply is intentionally executed through the appropriate environment process

- Visit Scope / Work Items and Estimate Line Item smart-entry closeout is complete and pushed (May 2026):
  - Work Items / Visit Scope smart entry:
    - `/jobs/new` Step 5 now supports smarter Pricebook-assisted Work Item entry.
    - Users can search/select active Pricebook items or add manual Work Items.
    - Pricebook selection can prefill Work Item title, description, expected/default price, unit label, item type, and category.
    - Work Items remain editable after selection and manual Work Items remain supported.
    - Work Items remain operational visit scope, not billing records.
    - Expected Work Item price remains a planning/default value only and does not auto-bill.
  - `/jobs/new` flow clarification:
    - Step 3 is classification/setup.
    - Step 5 owns Reason for Visit / Dispatch Notes and Work Items.
    - Entry flow was polished to reduce duplicate entry and form fatigue.
  - `/jobs/[id]` polish:
    - Visit Scope summary is compacted into an operational summary.
    - Top job-detail header/work-needed area no longer repeats visit reason multiple times.
    - Shared Notes visibility follows final rule: hidden for `hvac_service`; visible for non-HVAC internal modes (ECC/Hybrid/Master).
    - Timeline, Internal Notes / Team Notes, and Visit Scope remain active narrative/work-summary surfaces.
  - Estimate Line Item smart entry:
    - Draft estimate line-item entry now uses one unified smart-entry surface.
    - Users can search/select Pricebook items or manually type estimate lines from the same entry surface.
    - Pricebook selection can prefill estimate line name, description, type, category, unit label, quantity, and unit price.
    - Manual estimate lines remain supported.
    - Estimate Lines remain proposed commercial scope and are not Work Items or Invoice Charges.
    - No estimate email/PDF/customer approval/customer portal/conversion/payment/Stripe tenant payment/QBO behavior was added.
  - Boundaries preserved:
    - no schema changes
    - no migrations
    - no invoice import behavior change from Work Items
    - no payment execution
    - no ECC behavior change
    - no contractor authority change
    - no RLS/auth change
    - no Support Console behavior change

- HVAC Service Ops First Impression + Shared Notes De-Emphasis V1 is complete and pushed (May 2026):
  - Added mode-aware Ops presentation for HVAC Service accounts.
  - In `hvac_service` mode, the primary contractor filter/search area is replaced with a compact Team Work Snapshot and a Work by Technician summary.
  - HVAC Service operational scope language is now team/work oriented where applicable, while existing job search remains available.
  - ECC/HERS contractor filtering/search behavior is preserved, including contractor-related links/query params.
  - Hybrid / Master / All-in-One broad behavior is preserved, including contractor visibility.
  - Job detail behavior for HVAC Service keeps Timeline and Internal Notes / Team Notes visible.
  - Shared Notes is de-emphasized/optional for HVAC Service only and was not removed; ECC/HERS and Hybrid behavior is preserved.
  - `job_events` behavior remains unchanged.
  - Validation recorded:
    - TypeScript passed: `npx.cmd tsc --noEmit`.
    - Browser smoke passed across HVAC Service, ECC/HERS, and Hybrid / Master / All-in-One coverage for `/ops` and `/jobs/[id]` expectations.
    - No console or hydration issues were reported during smoke.
  - Explicit non-changes:
    - no schema changes
    - no migrations
    - no Supabase commands
    - no RLS/auth changes
    - no source-of-truth changes
    - no `job_events` mutation
    - no contractor authority changes
    - no billing/payment/Stripe/QBO behavior changes
    - no report calculation changes
    - no codebase split
    - no feature deletion

- `/jobs/new` Product-Mode Family Visibility Tightening V1 is complete and pushed (May 2026):
  - Normal product accounts now show only the relevant internal job-family lane on `/jobs/new`:
    - `hvac_service` shows Service / Work Order only.
    - `ecc_hers` shows ECC / Compliance Test only.
  - Hybrid / Master / All-in-One accounts intentionally preserve both ECC and Service visibility.
  - Hidden-field and stale-state safety was tightened so non-hybrid product mode wins for posted `job_type` during internal intake.
  - Product boundary remains additive/presentation/defaulting only:
    - no schema changes
    - no migrations
    - no Supabase commands
    - no RLS/auth/security changes
    - no source-of-truth ownership changes
    - no contractor authority changes
    - no billing/payment/Stripe/QBO changes
    - no report calculation changes
    - no feature deletion and no codebase split
  - Future cross-family ECC-plus-Service availability remains a tier/add-on roadmap item and is not active in this slice.

- `/jobs/new` HVAC Service Contractor-Control Visibility Tightening V1 is complete and pushed (May 2026):
  - HVAC Service internal intake now hides contractor assignment and contractor billing-recipient controls by default on `/jobs/new`.
  - Hidden-form safety now prevents stale `contractor_id` and stale `billing_recipient=contractor` submission in HVAC Service mode.
  - ECC/HERS behavior remains unchanged.
  - Hybrid / Master / All-in-One behavior remains unchanged.
  - This slice does not introduce a new Related Company / Source model; future home-warranty/property-manager/referral/bill-to modeling remains separate backlog.
  - Explicit non-changes preserved: no schema/migration/Supabase/RLS/auth/authority/portal-rule/notification/billing-engine/report-calculation/source-of-truth changes.

- Related Companies V1 (future HVAC Service feature) planning is documented (May 2026):
  - Decision: do not reuse `contractor_id` for Service-side home warranty companies, property managers, builders, realtors, insurance companies, referral sources, or third-party bill-to contacts.
  - Reason: contractor model carries authority/workflow effects (portal visibility, contractor workflows, emails, duplicate matching, billing defaults) and is not a passive related-company/source model.
  - Product scope: HVAC Service mode only unless explicitly expanded later.
  - Explicit non-changes: Hybrid / Master / All-in-One behavior unchanged; ECC/HERS contractor behavior unchanged.
  - Recommended V1 shape:
    - internal tracking only
    - account-scoped reusable related-company directory
    - job/work-order-level relationship link
    - relationship types: Home Warranty Company, Property Manager, Builder, Realtor, Insurance, Referral Source, Other
    - optional contact details and notes
  - V1 exclusions:
    - no portal access
    - no authority model
    - no contractor_id writes
    - no billing behavior change (`billing_recipient` and billing truth unchanged)
    - no invoice/payment/notification behavior change
  - Deferred to later phases: service-case/customer/location defaults, billing responsibility workflows, estimate/invoice sharing, portal access, approval workflows, notifications, external party accounts.
  - Planning-only boundary: no schema changes, no migrations, no Supabase commands, no auth/RLS changes.

- Field Bus Improvement Passes closeout is complete and pushed (May 2026):
  - New Job Alert lifecycle cleanup:
    - New job/new work alerts no longer act as active unread awareness once scheduled, finalized, rejected, or otherwise handled.
    - Manual Read remains available.
    - Contractor note/update notification scope was not changed.
  - Owner Console company-name fallback correction:
    - customer account rows now use tenant-safe company-name resolution.
    - when company name is missing, a neutral setup placeholder is shown instead of a platform fallback label.
  - Equipment fields and CHEERS/report visibility:
    - furnace labels are clarified to: Heating Input (KBTU/h), Heating Output (BTU/h), Efficiency / AFUE %.
    - Heating Input helper text is now: Enter thousands of BTU/h, for example 66 for 66,000 BTU/h.
    - saved equipment summary visibility in report surfaces includes the relevant equipment details.
    - coil manufacturer/model/serial summary coverage was verified.
    - no schema/storage/unit-conversion/test-type behavior changed.
  - Login screen signup options and copy polish:
    - login now links to HVAC Service signup and ECC / Compliance Testing signup.
    - Hybrid public signup remains intentionally not exposed.
    - invited-user admin access helper text is clarified.
  - `/jobs/new` Create New Customer shortcut:
    - Create New Customer entry is now reachable near the top of the intake flow.
    - existing customer search/reuse and server-side intake behavior remain unchanged.
  - `/ops/call-list` full page and polish:
    - dedicated full Call List page is active for larger scheduling queues.
    - `/ops` remains the command-center summary surface.
    - premium polish pass is accepted with restrained operations-software styling.
  - Schedule update permit-field preservation:
    - `updateJobScheduleFromForm` preserves omitted permit fields server-side on schedule-only updates.
    - schedule updates no longer clear `permit_number`, `jurisdiction`, or `permit_date` when those fields are omitted from the submitted schedule form.
    - no scheduling source-of-truth, lifecycle model, or queue semantics changes were introduced.
  - Calendar action responsiveness:
    - Calendar Open Job action now has improved perceived responsiveness through a dedicated responsive/prefetching button.
    - Schedule Save already shows immediate Saving feedback and remains server-confirmed.
    - `scheduledAttentionWindowJobs` now uses the requested calendar anchor date instead of today.
    - Permit preservation stayed intact.
    - No calendar engine/source-of-truth rewrite.
  - Contractor Report saved snapshot / resend workflow:
    - Contractor report sent history reuses saved report content from `job_events` metadata.
    - Saved report can be resent to another recipient without regenerating/retyping.
    - Each send creates separate `contractor_report_sent` history entry.
    - Failed sends do not create false sent history.
    - No schema/PDF/notification-table/contractor authority changes.
  - Contractor Report language + timeline polish:
    - Timeline now shows recipient inline for `contractor_report_sent` entries when available. Example: "Contractor report sent to contractor@example.com".
    - Contractor Report panel language cleaned up:
      - Report history (was: Last sent report)
      - Resend Report (was: Resend Saved Report)
      - Generate Fresh Report (was: Generate Updated Report)
      - Send Report (unified button label)
    - User-facing wording no longer exposes internal snapshot/meta/payload concepts.
  - Job detail technical chip cleanup:
    - Removed implementation-style chips:
      - DEFERRED (from Attachments section)
      - NOTES LOAD BELOW (from Shared Notes and Internal Notes sections)
      - RECENT ATTEMPTS LOADING (from Follow-Up History section)
      - HISTORY LOADS BELOW (from Timeline section)
    - Kept meaningful count/status chips:
      - visit count (Service Chain section)
      - equipment item count (Equipment section)
      - ECC run count (ECC Summary section)
    - Deferred loading behavior unchanged.

- Estimate New Customer Assist V1 is complete for `/estimates/new`:
  - Internal users can add/reuse customer + service location inline from the estimate draft form and continue without leaving the flow.
  - The assist action resolves canonical customer/location ids and auto-selects them in-form before draft creation.
  - Boundaries preserved: no schema/migration/Supabase command/production data action; no job/service_case/event/payment/public-exposure changes.

- Service Workflow / Visit Scope Field Experience V1 Slice 1 is complete:
  - Service job detail now uses clearer field-first Work Items guidance.
  - Prior "confirm the work" helper wording was replaced to avoid implying a required validation action.
  - Waiting/Interrupt State copy now clarifies that waiting explains why work is paused and does not replace Work Items / Visit Scope.
  - Create Next Service Visit copy now clarifies service-chain continuation, per-visit Work Items, and no automatic copy-forward.
  - Invoice language remains downstream: Invoice Charges are billed truth; Work Items are operational scope, not billing records.
  - No schema, RLS, lifecycle, billing, payment, estimate, support console, or contractor-authority behavior changed.

- Pricebook-assisted Work Item Creation V1 is complete (`6145f16`):
  - Work Item builder now includes optional `Start from Pricebook template` assist.
  - Template selection prefills Work Item `title` from Pricebook `item_name` and Work Item `details` from Pricebook `default_description`.
  - Prefill behavior is create-or-prefill: fills an existing blank Work Item when available; otherwise creates a new Work Item row within existing item limits.
  - Work Items remain fully editable after prefill and continue saving through existing `visit_scope_items_json` payload submission.
  - Template assist is available in both internal job intake and job-detail Work Item editing.
  - Product boundary is preserved: Pricebook starts the work record, Work Item remains operational truth for the visit, Invoice Charges remain reviewed billed copies created later.
  - Validation is complete: `npx.cmd tsc --noEmit` passed; targeted tests passed (`4` files / `76` tests); browser smoke passed for intake prefill/edit/save, job-detail assist reuse, Work Item -> draft Invoice Charge import/edit, and direct Pricebook -> draft Invoice Charge add.
  - Guardrails remain unchanged: no schema/migration/Supabase command/production data action/RLS/policy/auth/feature-flag change; no Work Item provenance fields persisted; no Pricebook id/price/category/unit label/billing type persisted to Work Items; no invoice/payment/estimate/Stripe/QBO behavior change.
  - Deferred follow-on remains explicit: persisted Pricebook provenance on Work Items, smarter downstream defaulting/pricing from Work Items to Invoice Charges, Work Item commercial fields, and broader invoice panel polish.

- Performance/responsiveness intervention batch is complete for the current pass and is now treated as closed for this pass.
- Ops First Impression performance pass for `/ops` is complete and closed for the current pass:
  - real behavior improvements delivered:
    - removed unused Upcoming read path from the blocking `/ops` server-render path (`0e0b05e`)
    - `/ops` contractor-update awareness now uses a narrow helper instead of rich notification enrichment (`67163ec`)
  - diagnostics coverage expanded under `OPS_TIMING_DEBUG` across major `/ops` phases:
    - actor/business identity split (`c256153`)
    - primary queue breakdown (`3c5d261`)
    - field-work fetch vs post-filter (`277e898`)
    - field-work vs call-list comparison (`1f978a6`)
    - secondary signal breakdown (`54708a8`)
    - unread contractor notification split (`bfcf72337cb1d9ce3afc2408b4db62eaa1e2fe55`)
    - assignment display map internals (`64ce273`)
    - closeout projection internals (`44d63e1`)
    - request actor context internals (`c07745c`)
  - measured findings for this pass:
    - Field Work latency is fetch-side, not local filtering.
    - Field Work is not uniquely slow compared with Call List.
    - unread contractor notification path was successfully slimmed.
    - assignment display cost is primarily assignment fetch + profile display map, not fallback lookup.
    - closeout projection is not a deterministic bottleneck.
    - request actor context variance is lookup-driven, not assembly.
    - largest residual spikes appear to be shared backend/network/Supabase variance, not one obvious local loop.
  - explicit non-changes for this pass:
    - no schema changes or migrations
    - no Supabase commands
    - no RLS/auth behavior changes
    - no queue semantics changes
    - no event/revalidation changes
    - no billing/payment behavior changes
    - no Estimates/Support/QBO/onboarding behavior changes
  - validation summary:
    - TypeScript checks passed during slices.
    - targeted tests passed where run.
    - authenticated `/ops` timing smoke was used repeatedly.
    - timing logs remained label/duration only with no sensitive data.
  - forward backlog remains optional/measured only:
    - deeper auth/request-actor review with high caution
    - Ops-specific lightweight assignment helper only if future timings justify it
    - broader shared backend/read variance investigation
    - continue surgical performance work only when a concrete issue harms usability
- Internal /jobs/[id] responsiveness hardening is complete for the current pass:
  - field action timing instrumentation shipped
  - job detail render timing instrumentation shipped
  - route loading/context preservation improvements were shipped
  - secondary sections were deferred from parent render where safe:
    - internal attachments
    - follow-up/customer-attempt history
    - service-chain detail/history body
    - add-assignee selector/form
    - timeline/shared/internal narrative bodies
  - internal invoice secondary-detail deferral shipped; immediate billing/closeout truth remains first-paint, while full invoice detail/lines/delivery/payment/pricebook panel data streams later
  - customer-attempt summary reads were deferred; measured first-paint `customerAttemptSummary` is now `0ms`, contact actions remain immediate, no false "0 attempts" display is shown, and Follow-Up History remains authoritative after streaming
  - timeline summary first-paint was softened; the blocking 200-row parent `job_events` read was removed, header counts/latest-date subtitles were replaced with neutral "loads below" copy, and deferred timeline/shared/internal note bodies remain authoritative after streaming
  - parent read fanout was parallelized after scoped boundary and main job load
- Contact action responsiveness hardening is complete for the current pass:
  - contact-attempt calendar revalidation dedupe shipped
  - local timing diagnostics remain available behind `CONTACT_ATTEMPT_TIMING_DEBUG` and `JOB_DETAIL_TIMING_DEBUG`
  - contact buttons no longer remain stuck on "Recording..."
  - pending feedback is action-specific for contact quick actions
  - No Answer and Sent Text return near the contact section after redirect instead of snapping to the top
  - server-confirmed truth behavior remains unchanged (event writes, redirects, banner, attempt count, `tab=ops` continuity)
- Practical baseline after this pass has improved materially: latest local `/jobs/[id]` smoke showed steady-state renders commonly around ~1.45-2.47s, `timelineSummary` usually around ~183-384ms after softening, and `customerAttemptSummary` stayed `0ms`; cold/backend/Supabase variance can still cause spikes.
- Performance remains an active launch-readiness backlog and does not own the entire roadmap unless a specific speed issue is actively damaging usability.
- Field Notes launch-hardening closeout batch is complete and pushed:
  - Duct leakage required-result validation hardening (`2dd205a`):
    - duct leakage completion now requires `measured_duct_leakage_cfm`
    - server guard blocks completion (`is_completed = true`) when measured value is missing/invalid
    - measured result input uses required behavior while Save Draft remains allowed for partial data
    - computed pass/fail and override behavior unchanged; other ECC test types unchanged
    - validation passed: `npx.cmd tsc --noEmit`, `duct-leakage-required-result.test.ts` (`3/3`), `ecc-save-complete-scope-hardening.test.ts` (`18/18`)
  - Notifications hardening and presentation/ops alignment:
    - enrichment resilience (`381592b`) and card presentation polish (`38bd4e0`) are complete
    - `/ops` New Work Requests signal family (`d5a31cc`) is complete with link `/ops/notifications?view=new_jobs&state=unread`
    - new work awareness includes canonical `contractor_intake_proposal_submitted` and `contractor_job_created`
    - email fallback rows `internal_contractor_intake_proposal_email` and `internal_contractor_job_intake_email` are deduped behind canonical rows
    - Contractor Updates remains intentionally narrow (`contractor_note`, `contractor_correction_submission`, `contractor_schedule_updated`)
    - global ribbon badge remains broad unread internal awareness
    - `contractor_report_sent` remains excluded from internal notification awareness
    - validation passed: TypeScript clean, notification/internal-awareness tests, browser smoke for `/ops`, `/ops/notifications`, `view=new_jobs`, `view=contractor_updates`, and mobile-width notification card smoke
  - Contractor portal closeout status alignment (`9d51091`):
    - evidence-accepted failed ECC jobs now project contractor-safe wording
    - accepted but not fully closed: `Final processing` / `Accepted by review. Final paperwork is being completed.`
    - accepted and fully closed: `Resolved` / `Accepted by review and closed.`
    - projection uses `failure_resolved_by_correction_review` plus `field_complete`, `certs_complete`, and `invoice_complete`
    - portal list/detail now pass required flags/events into resolver
    - historical failed-test truth remains intact; internal lifecycle/ECC truth unchanged
    - validation passed: `npx.cmd tsc --noEmit`, `resolveContractorIssues.test.ts` (`11/11`)
    - contractor-authenticated visual smoke was not completed in the internal-session scope used during the fix
- Explicit non-changes for this field-note closeout batch:
  - no schema changes
  - no migrations
  - no Supabase commands
  - no RLS/auth changes
  - no source-of-truth redesign
  - no queue rewrite
  - no payment/Stripe tenant execution/QBO/Estimates/Support/onboarding behavior changes
- Planned pre-launch spine order is now resumed after this docs closeout; Support Console and Estimates production enablement remain parked behind their runbooks, tenant customer payment execution remains deferred, QBO remains optional downstream/last-last, and controlled tester onboarding remains intentionally held until readiness work is acceptably complete and supportable.
- Contractor Report current-scope delivery is complete and accepted for current launch scope quality:
  - failed ECC contractor reports aggregate all failed completed ECC runs for the job
  - enriched contractor-actionable failure details are included (baseline, measured value, variance), including corrected duct-leakage percentage logic
  - Refrigerant Charge pass override/weather exception remains excluded from contractor failure issues
  - preview is sectioned into report, failure, next-step, and note cards
  - next-step wording is now neutral: "Review and submit your response in the portal."
  - send flow supports recipient override (default contractor email, server-side recipient validation, and recorded actual/default/overridden recipient metadata)
  - sent snapshots preserve `report_render_version`, `failure_details`, `reasons`, `next_step`, `body_text`, and recipient metadata in `contractor_report_sent`
  - professional HTML email delivery, true plain-text fallback, and contractor portal CTA are implemented
  - contractor_report_sent remains audit/history truth in `job_events` and does not create internal notification-table records for outbound contractor report sends
  - notification-table delivery tracking was removed from this send path because it was nonessential and could block delivery under RLS
  - PDF generation/attachment remains deferred
  - final smoke passed for report generation, recipient override send, and received email quality
- Branch workflow update:
  - the old `sandbox-clean-start` Git branch is retired due to stale/diverged risk
  - `main` is current production truth
  - use short-lived feature branches from current `main`, merge back only after validation, then retire the branch
  - Supabase sandbox environment remains usable; only the stale Git branch was retired

- Field Bus / ECC Verification Expansion + Closeout Queue Correction closeout is complete (May 2026):
  - Mini split / ductless applicability baseline:
    - equipment labels remain `Mini-Split Outdoor` and `Mini-Split Indoor Head`
    - `Mini-Split Indoor Head` is the ductless trigger
    - `Mini-Split Outdoor` alone does not force ductless-only behavior
    - ductless mini split systems use Refrigerant Charge only
    - Mini-Split Outdoor + Air Handler remains ducted behavior unless explicitly configured otherwise
    - multiple Mini-Split Indoor Head records can share one System Label
  - Fan Efficacy / Watt Verification V1:
    - structured Forced Air System Fan Efficacy / Watt Verification is shipped
    - captures tested watts, tested airflow from MCH-23, required efficacy, actual efficacy, and compliance statement
    - calculation remains `actual_fan_efficacy = tested_watts / tested_airflow_cfm`
    - CHEERS/report output renders values; this is not treated as volts x amps estimation
  - Air Filter Device Verification V1:
    - selectable Air Filter Device / Filter Face Area verification is shipped
    - stores entered and computed values in `ecc_test_runs` JSON
    - computed values include nominal face area, required minimum face area, and face-area compliance result
    - report output renders entered and computed values
  - All New selected-test baseline:
    - All New forced-air/split set includes Duct Leakage, Air Flow, Fan Efficacy, Air Filter Device, and Refrigerant Charge when applicable
    - Duct Leakage default target remains 5 percent unless edited per run
    - Air Flow default target remains 350 CFM/ton unless edited per run
    - package-unit refrigerant-charge exclusion remains preserved
    - mini split ductless remains Refrigerant Charge only
  - AHRI Matched System Verification V1:
    - office-side AHRI verification workflow is shipped
    - AHRI remains non-field-measured verification
    - new/empty AHRI runs can prefill model fields from captured equipment
    - saved AHRI values are not overwritten by equipment-derived defaults
    - AHRI remains stored in `ecc_test_runs` JSON with `computed_pass = null`
    - AHRI does not affect `jobs.ops_status` in V1
    - report/CHEERS output includes AHRI office verification when AHRI is in scope
    - AHRI helper/readiness guidance is scoped to AHRI workflow only
  - Local Mechanical Exhaust Verification V1:
    - selectable add-on (not default-required) is shipped
    - workspace distinguishes Field Capture inputs from HVI/AHAM Directory Research inputs
    - directory values are explicitly treated as office/directory research, not field-measured values
    - report output labels directory research values clearly
  - New Construction per-run editable targets:
    - Duct Leakage percentage target and Airflow CFM/ton target are editable per run
    - defaults remain profile-driven when not edited
    - edited values are saved on that `ecc_test_run` only and do not mutate profile defaults
    - report output shows the target used
  - QII / ENV-22 Insulation Verification V1:
    - selectable add-on (not default-required) is shipped
    - supports top-level verification fields plus repeatable insulation-area rows in `ecc_test_runs` JSON
    - completion guards are enforced (row minimum, required row fields, correction-note requirements, pass/fail consistency)
    - completed documentation-style tests now display as `Verified` rather than `Not computed`
  - ECC test workspace premium polish:
    - improved visual hierarchy, spacing, labels, status readability, report readability, and mobile usability
    - office verifications remain visually distinct from field-measured tests
    - no behavior/calculation/applicability/save-complete/report-data/ops-status changes were introduced by polish
  - ECC report scope hygiene:
    - completion/report output suppresses optional unselected tests instead of rendering `No run found`
    - optional/selectable sections appear only when required, selected/added, or backed by an existing run
    - suppressed when unselected: AHRI, Local Mechanical Exhaust, QII, Fan Efficacy, Air Filter Device
    - Add Test dropdown behavior remains unchanged
    - redundant Equipment Reference card is removed where Equipment Summary already serves the results card
    - AHRI helper/readiness language is limited to AHRI workflow scope
  - Failed ECC invoice closeout queue behavior is restored:
    - failed ECC plus invoice not sent remains in Failed bucket and Closeout Queue
    - failed ECC plus invoice sent remains Failed bucket only
    - failed ECC is not treated as certs/CHEERS-complete because invoice was sent
    - failed ECC still blocks clean certification closeout
    - external invoice tracking remains controlled by `invoice_complete`
    - fix was in closeout projection/ledger filtering, not ECC test logic or invoice execution
  - Validation snapshot for this closeout:
    - targeted implementation tests passed across applicability, Fan Efficacy, Air Filter, All New profiles, AHRI, Local Mechanical Exhaust, QII, report scope, closeout queue behavior, ECC status, and scope/entitlement hardening where applicable
    - TypeScript checks passed
    - owner-authenticated browser smoke confirmed QII completion status behavior, LME field-vs-directory distinction, report-scope hygiene, AHRI scope cleanup, Equipment Reference redundancy removal, failed-ECC closeout queue behavior, and ECC workspace visual pass
  - Explicit preserved boundaries:
    - no schema changes
    - no migrations
    - no RLS/auth changes
    - no contractor authority changes
    - no billing execution changes
    - no payment execution changes
    - no estimates/support console behavior changes
    - no ECC source-of-truth redesign (`ecc_test_runs` remains ECC truth, `jobs.ops_status` remains operational projection)
    - AHRI/QII are not closeout gates unless separately designed in a future pass
  - Parked/future items remain explicit:
    - no full AHRI website/API lookup implementation yet
    - no AHRI attachment/screenshot-specific extension yet
    - QII remains selectable/ad hoc, not universal default-required
    - any AHRI/QII closeout-gate decision is a separate future pass
    - broader ECC report/export/PDF formatting remains future polish
    - native/app-store packaging remains future/parked

1. System Identity

Compliance Matters Software is an:

event-driven operational workflow system for compliance and service work, with scheduling, staffing, contractor collaboration, and audit-backed job resolution

It is not:

a simple job tracker
a static CRUD app
a calendar-only dispatch toy
a contractor portal-first system

It is:

lifecycle-driven
event-backed
operations-first
source-of-truth disciplined
additive by design
2. Core System Model (Locked)
2.1 Operational hierarchy

Ops Command Center
↓
Customer
↓
Location
↓
Service Case
↓
Job
↓
Portal / External Interaction

2.2 Meaning of each layer
Customer = owner of the work relationship
Location = physical service anchor
Service Case = problem container / continuity layer
Job = operational visit / work execution unit
Portal = external collaboration surface only, never canonical truth
2.3 Structural principle

Service Case = the problem
Job = a visit

Visit Scope = the operational scope for this visit under the job layer.
It exists to define what work belongs to this trip without changing the locked container model:
service_cases remain continuity truth,
jobs remain visit execution truth,
invoice line items remain downstream billed/commercial truth.

Invoice line items must not become the primary operational work-definition surface.

A service case may contain multiple jobs.
A job may belong to a service case and may also reference a prior visit through parent_job_id.

3. Source-of-Truth Hierarchy (Locked)
3.1 Canonical truth layers
job_events → narrative / operational truth
ecc_test_runs → technical test truth
jobs.ops_status → operational projection
jobs → visit execution unit
service_cases → continuity container
3.2 Rules
UI does not own lifecycle truth
UI does not guess ECC resolution
all meaningful operational actions should become events
ops_status is a projection, not a freeform UI state
additive changes only unless explicitly approved
4. Lifecycle + Ops Model (Locked)
4.1 Job lifecycle

Jobs represent visits and move through operational lifecycle states without redefining the container model.

4.2 Ops projection

jobs.ops_status drives queues and operational visibility.

pending_office_review is a persisted ops state for office-owned ECC failed-job review, not a UI-derived overlay.

4.3 Queue philosophy

Ops queues are for current work visibility, not historical clutter.

4.4 Signal philosophy

Notifications are signals, not a second queue system.

Ops = action
Notifications = awareness

5. Event System (Locked)
5.1 Canonical event ledger

All meaningful operational activity is recorded in:

job_events
5.2 Examples
scheduling changes
contractor communication
correction submissions
retest requests
internal notes
attachment-added events
job pass/fail markers
follow-up / contact-attempt history where applicable
5.3 Event rule

If it materially affects operations, history, or accountability:

it should be an event

6. ECC / Test System (Locked)
6.1 ECC truth

Technical compliance/test results are canonical in:

ecc_test_runs
6.2 ECC resolution

Job ECC resolution is derived from completed test runs and projected into jobs.ops_status.

Refrigerant charge overall pass requires all active refrigerant-charge checks to pass, not just numeric subcool and superheat checks. Unless an approved charge exemption applies, overall pass also requires filter drier confirmation and applicable temperature qualification. UI surfaces must show non-numeric failure reasons from ecc_test_runs.computed.failures and must not imply that numeric check chips alone determine the final result.

Completed production-shipped ECC/test cleanup: refrigerant charge now supports a Photo Taken attestation path as an evidence-method statement only. It does not require or verify uploaded photo proof, does not claim numeric readings were entered/passed, and keeps computed_pass = null until manual/admin review or override where applicable. Existing numeric and manual override paths remain intact. Duct leakage override suggestions now include Asbestos while preserving custom/manual reason behavior.

6.3 UI discipline

ECC-specific actions and surfaces must only appear when ECC behavior actually applies.

Service jobs must not expose ECC-only workspace affordances.

7. Customer / Location / Snapshot Strategy (Locked)
7.1 Canonical entities
customers = canonical identity/contact
locations = canonical service address
7.2 Snapshot strategy

Jobs may carry convenience snapshot fields for operational display, but those fields are not canonical.

7.3 Sync-point rule

When canonical customer/location data changes, required job snapshot fields must be synced where relevant, with proper revalidation.

7.4 Current stable state

Location-edit sync and revalidation gaps identified during audit were corrected.
This area is now considered stabilized for current scope.

7.5 Customer visibility rule

/customers and /customers/[id] share one scoped visibility rule.

Internal users may search and view customers within their account-visible scope.

Contractor users may search and view only customers within their own contractor-visible scope.

Customer list and customer detail must follow the same scope rule so a contractor-visible customer in /customers does not dead-end at /customers/[id].

Customer search/index remains read-only; this rule does not expand customer mutation authority for contractors.

7.6 Customer edit boundary

/customers/[id]/edit is a customer/billing edit surface only.

Canonical service-address editing belongs to the Location domain.

Customer edit must not guess, imply, or mutate a canonical "primary" location unless the target location is made explicit.

7.7 Shared intake lock (/jobs/new)

`/jobs/new` is a shared intake surface for internal users and constrained contractor submission.

Create-time lifecycle/status rules are server-enforced:

- Create-time `status` is always intake-safe and server-forced to `open`; posted status values are ignored.
- Contractor intake is server-normalized to unscheduled:
  - `scheduled_date = null`
  - `window_start = null`
  - `window_end = null`
  - `ops_status = need_to_schedule`

Posted existing entity references must be validated before create:

- `customer_id` must belong to canonical owner scope.
- `location_id` must belong to canonical owner scope.
- `location_id` must belong to the resolved/posted customer before job creation.

Invalid posted customer/location pairings must not create jobs and must fail safely through intake error handling.

Internal intake may create or link canonical customer/location records through this shared flow, using reuse-first linking behavior.

7.7.1 Production contractor intake hotfix closeout (resolved)

Confirmed incident (production):

- A contractor submitted a new work request for 4137 Amberwood Cir, Pleasanton.
- The request showed an error/disappeared and did not durably save.

Confirmed production read-only findings:

- No matching durable row existed for the failed request in `contractor_intake_submissions`, `jobs`, `customers`, `locations`, `job_events`, or `notifications`.
- Additional 24-hour production sweep showed this failed path aligned with the only contractor/company login activity in that window; no additional silent failures were found.

Resolved root cause and production hotfix:

- Root cause: contractor `/jobs/new` form path did not post `state`, while server-side contractor proposal validation requires `address_line1`, `city`, `state`, and `zip`.
- Hotfix: contractor intake form now posts state and contractor address required behavior is aligned with server validation.
- Contractor validation/error handling remains explicit and fail-safe.
- Post-insert contractor side-effect failures do not erase a successfully saved contractor intake submission.

Closeout confirmations:

- Contractor intake boundary is unchanged:
  - contractor submissions remain proposed intake data
  - contractors do not receive scheduling/lifecycle authority
  - internal users retain finalization authority
- No production data repair was possible for the failed Amberwood row because it never persisted.
- Contractor was asked to resend; a new production contractor submission was successfully created after fix.
- No payment, Stripe, QBO, support-access, RLS model, or tenant-boundary behavior changed.

7.7.1.1 Contractor intake attachment resilience closeout (resolved)

Follow-up issue after the missing-state hotfix:

- Contractors could still see intake submission failures only when documents/photos were attached.

Resolved root cause/risk:

- File bytes were being sent through the initial Next Server Action for contractor `/jobs/new`.
- Large photos/PDFs could exceed the request body parser limit before `createJobFromForm` ran, which meant no durable `contractor_intake_submissions` row existed yet.

Fix shipped in commit `70d1ee3` (`Harden contractor intake attachments`):

- Initial contractor proposal submit is now text-only and durable-first.
- `contractor_intake_submissions` persists before attachment upload.
- Attachments upload afterward through a separate signed-upload/finalize flow scoped to the saved pending proposal.
- Finalize requires valid signed path shape and verifies the uploaded storage object exists before inserting attachment rows.
- Server-side validation covers file count, file size, MIME/type, and extension.
- Attachment DB insert failure attempts storage cleanup.
- Attachment failure never deletes, rolls back, or hides the saved proposal.
- Notification/email side-effect failures remain best-effort and do not erase saved proposals.

Boundaries unchanged:

- Contractor submissions remain proposed intake data.
- Contractors do not gain scheduling/lifecycle authority.
- Internal users retain finalization authority.
- No canonical customer/location/job creation occurs until internal finalization.
- No payment, Stripe, QBO, support-access, RLS model, or tenant-boundary behavior changed.

Validation:

- `npx.cmd tsc --noEmit` passed.
- Targeted Vitest passed for contractor intake hotfix + attachment resilience tests: 2 files / 10 tests.

7.7.2 Dispatch calendar block edit/delete hardening and production RLS object-drift closeout (resolved)

Confirmed incidents (production):

- Calendar block edit showed false success (date did not change) before app hardening.
- After app hardening commit `6aa814e`, editing a visible production calendar block showed banner "That calendar block no longer exists" instead of false success.
- Calendar block had no UI control to delete a block.

Confirmed production read-only findings:

- Direct `pg_policies` inspection of production (`ornrnvxtwwtulohqwxop`) found object drift: migration history recorded `202604041730_calendar_events_block_delete_policy.sql` as applied, but `public.calendar_events` was missing the `calendar_events_internal_update_scope` UPDATE policy.
- Production had SELECT, INSERT, and DELETE policies present; UPDATE policy object was absent despite migration history entry.
- Sandbox (`kvpesjdukqwwlgpkzfjm`) appeared aligned and did not exhibit the missing UPDATE policy.

Resolved root cause and production corrections:

- Root cause (app): update/delete server actions used `.update().eq().eq()` without `.select('id').maybeSingle()`. PostgREST returns no error and no affected-rows signal under `Prefer: return=minimal`. Zero-row updates were treated as success.
- App fix (commit `6aa814e`): `updateCalendarBlockEventFromForm` and `deleteCalendarBlockEventFromForm` now require a returned row `id`; redirect to `calendar_block_update_missing` / `calendar_block_delete_missing` banner if none returned.
- Root cause (production): `calendar_events_internal_update_scope` UPDATE RLS policy was missing from production, causing every authenticated UPDATE to be rejected with 0 rows affected regardless of row existence.
- Production fix: targeted SQL patch applied through Supabase Dashboard SQL Editor, restoring only `calendar_events_internal_update_scope`. No `supabase db push` was used. Migration history was not modified. No support/estimate deferred migrations were applied.
- Delete Block UI: `deleteCalendarBlockEventFromForm` action wired to a two-step confirmation control in the edit block panel (`components/calendar/calendar-view.tsx`). Native `<details>`/`<summary>` disclosure used for zero-JS confirmation without client component.

Closeout confirmations:

- Production post-check confirmed all four `calendar_events` policies present: SELECT, INSERT, UPDATE, DELETE.
- Production smoke passed: user deleted mistaken block, changed date on remaining block; both changes persisted.
- No schema migration, `supabase db push`, migration-history repair, or support/estimate deferred migration was applied.
- No RLS model, tenant boundary, or payment behavior changed.

Future guardrail (recorded here):

- If an RLS-protected action shows visible/readable rows but update/delete affects zero rows, verify actual `pg_policies` object state directly before assuming app code or migration history is correct. Migration history entry does not guarantee database object existence.

7.8 Internal/admin `/jobs/new` flow lock (Phase 2)

Internal/admin `/jobs/new` is a guided workflow, not a flat admin form.

Locked internal sequence:

- Customer/location resolution first.
- Then job setup/details.
- Then scheduling/billing.
- Then optional details.
- Then a concise human-facing final confidence check.

Internal customer resolution behavior is locked to reuse-first guidance:

- Live customer finder is name-first friendly.
- Results include address context for recognition, with phone/email as supporting signals.
- Create-new customer remains a fallback path and must not be the default entry state.

The confidence layer is intentional for internal intake, but must stay concise and human-facing (not technical/debug-style wording).

This internal/admin guided-flow lock does not alter or reopen contractor intake proposal architecture; contractor intake boundaries in 7.7 remain in force.

7.9 Internal/admin `/jobs/new` relationship-aware extension (V1)

Internal/admin `/jobs/new` now includes a relationship-aware decision step after customer/location resolution and after internal Job Type selection.

This is an extension of the existing guided intake model, not a replacement intake model.

V1 relationship step options:
- Open Active Job
- Create Follow-Up Visit
- Continue as New Case

Locked V1 rules:
- The relationship step is internal-only and does not alter contractor intake boundaries in 7.7.
- Job Type must be selected before relationship review.
- Relationship candidates must be scoped by selected `job_type`; ECC and Service must not be blended in actionable relationship decisions.
- Existing customer + new location remains part of location resolution, not the relationship decision step.
- Open Active Job must show only true active/current work candidates, not generic unresolved history.
- `need_to_schedule` does not belong in Open Active Job.
- Open Active Job candidate lists should suppress older chain ancestors in favor of the current operative record.
- Create Follow-Up Visit in V1 anchors to an existing job and reuses/ensures `service_case_id` continuity.
- V1 follow-up does not repurpose `parent_job_id`, because `parent_job_id` remains tied to direct visit lineage and existing retest-chain semantics elsewhere in the system.
- Continue as New Case preserves the existing root-job create path.

Implementation note:
This V1 solves relationship-aware intake and service-case continuity.
It does not yet establish full follow-up lineage semantics such as “this visit happened because of Job A” as a first-class generalized model beyond the selected anchor and shared service case.

8. Service Case Container Model (Locked)
8.1 Container rule

service_cases are additive and do not replace job operational truth.

8.2 Relationship rule
service_case_id = container membership
parent_job_id = direct visit-to-visit lineage
8.3 Failure resolution

Locked ECC failed-job model:

Original ECC failed job remains historically failed.
Any true revisit/retest is a new child job in the same chain/service case and becomes the active operational unit.
Once a child revisit exists, the failed parent drops from active failed visibility but remains historically failed in chain history.
Any "we fixed it" signal (portal, phone, text, email, photos) normalizes to pending_office_review.

Internal review from pending_office_review has exactly three outcomes:
approve by evidence
reject review / need more proof
revisit required

Approve by evidence:
original failed parent remains historically failed
ops_status moves to paperwork_required
resolution_source = correction_review
approval must be event-backed (for example: failure_resolved_by_correction_review)
closeout path is cert only
no new invoice if no revisit occurred

Reject review / need more proof:
job returns from pending_office_review to failed
rejection must be event-backed

Revisit required:
child retest job is created immediately (no intermediate limbo state)

Passed child retest behavior:
child owns successful revisit outcome and closeout
parent does not get rewritten into successful truth

Closeout matrix:
failed visit unresolved = invoice only
evidence-approved original parent = cert only
passed child retest = invoice + cert

Child retest inheritance rule:
inherit customer, location, contractor, service case, parent linkage, and core context
do not carry forward prior failed test result as child authoritative truth
prior failed result may be shown later as comparison/reference context

8.4 Narrative visibility on /jobs/[id]

The /jobs/[id] Timeline, Shared Notes, and Internal Notes sections may intentionally aggregate narrative entries across the direct retest/job chain (current job plus parent/child lineage via parent_job_id).

When chain-scoped narrative is shown, page copy should explicitly state chain scope and should not imply current-job-only history.

8.5 Retest chain clarity

Parent/child chain history must preserve failed-parent historical truth while allowing the active child revisit job to carry current operational and closeout ownership.

In /ops, active queue visibility is chain-owned, not ancestor-stacked.

Only one active operative record from a linked chain should be visible in the working queue at a time.

Current live ECC failed/retest rule:
if a failed-family record has no active retest child, it may remain the visible active queue record
if a failed-family record has an active retest child, that ancestor must be suppressed from active queue visibility
the visible active queue record should be the current operative leaf in the chain, not older failed ancestors

This is a queue-visibility ownership rule only.
Do not alter parent/child linkage.
Do not alter audit/history visibility.

This same active-chain ownership principle should apply as service chains / linked visits expand further.
Once a newer operative linked record exists, older linked ancestors must not remain as duplicate active queue items.

8.6 Service Contract V1 (Locked)

This first Service pass formalizes Service Case and Service Visit classification for later Billing/Reporting support.

This pass does not start Billing workflows or Reporting workflows.

Milestone 1 closeout status:
Service model buildout is now closed for milestone-1 scope.

Milestone-1 Service model buildout includes:
- Service Contract V1 baseline
- relationship-aware internal intake V1
- Visit Scope as the job-owned operational scope layer
- ECC optional vs Service required Visit Scope behavior
- ECC companion-scope promotion into real Service jobs
- promoted-companion read-only visibility on internal scan surfaces
- Service intake title ownership clarified:
  - Service Step 5 now uses an explicit **Job Title** concept for the visit headline.
  - Visit Scope remains the detailed operational work layer for the trip.
  - If Job Title is left blank and exactly one work item exists, the first work item may provide the derived title fallback.
  - `service_visit_reason` aligns to the title layer rather than relying on an older fuzzy summary concept.
  - This preserves the locked distinction:
    - Job Title = short visit headline
    - Visit Scope / work items = exact work on this trip
- milestone-1 write-path reliability cleanup for the live `jobs.updated_at` mismatch

Service Case v1 contract:
service_cases own complaint continuity and case-level resolution ownership.
Required case fields: problem_summary, case_kind (reactive|callback|warranty|maintenance), status, resolved_by_job_id, resolved_at, resolution_summary.

Service Visit v1 contract:
jobs remain the visit execution unit for Service.
Required visit fields: service_visit_type (diagnostic|repair|return_visit|callback|maintenance), service_visit_reason, service_visit_outcome (resolved|follow_up_required|no_issue_found).

Linkage guardrail:
For linked visit chains, parent_job_id lineage must stay inside one service_case_id.
Cross-case parent/child linkage is invalid.

Truth-boundary guardrail:
These classifications do not change source-of-truth ownership:
job_events remains narrative truth.
jobs.ops_status remains operational projection.
ecc_test_runs remains ECC technical truth.

Mixed-visit guardrail:
ECC Test and Service remain the only top-level actionable workflow families.
Do not create a hybrid third family.

Approved mixed-visit direction:
an ECC-first visit may carry same-visit companion service scope while the work remains part of the same trip,
but companion scope must promote into a real Service job once it becomes its own lifecycle thread
(for example: separate scheduling, separate assignment, return-trip work, or separate follow-up continuity).

8.6.1 Service workflow refinement - Waiting State V1 (implemented)

Status:
Service Waiting State V1 is implemented as a no-schema service workflow refinement.

Scope boundary (V1):
- waiting state is job-level V1, not service-case-level global blocker orchestration
- existing fields are reused:
  - `jobs.ops_status`
  - `jobs.pending_info_reason`
  - `jobs.on_hold_reason`
  - `jobs.action_required_by`
  - `jobs.follow_up_date`
  - `jobs.next_action_note`
- `job_events` remains audit/narrative truth for waiting-state change history

Supported waiting types (V1):
- Waiting on part
- Waiting on customer approval
- Estimate needed
- Waiting on access
- Waiting on information
- Other

Persistence rule (V1):
- waiting reasons persist in existing pending/on-hold reason fields using readable prefixed text (for example: `Waiting on part: condenser fan motor`)
- legacy unprefixed reasons remain tolerated through fallback-safe parsing

Create-next interaction rule (V1):
- creating a next service visit does not auto-clear the source job waiting state
- explicit/manual release remains required for audit safety
- event context remains the traceable service narrative path in `job_events`

Product intent:
This closes a real in-between service-state gap that common field apps often miss, while preserving locked truth boundaries.

Deferred-later service workflow items:
- parts inventory
- purchase orders/vendor tracking
- service-case-level blocker orchestration
- Visit Scope copy-forward
- estimate automation
- explicit create-next-plus-release option / auto-release on next-visit creation

8.7 Visit Scope -> Invoice Bridge (A1-A5, production-promoted)

Status:
The A1-A5 Visit Scope -> invoice bridge baseline is production-promoted on main.

Production behavior now locked:
- Visit Scope items use durable IDs for downstream selection/provenance.
- Internal invoice line provenance supports Visit Scope sourcing via:
  - `source_kind = visit_scope`
  - `source_visit_scope_item_id`
- Draft internal invoice panels can build line items from selected Visit Scope items.
- Visit Scope-sourced draft invoice lines start at `quantity = 1.00` and `unit_price = 0.00`, then require operator review/edit before issue.
- Service intake requires at least one structured Visit Scope item; summary-only Service scope is rejected.
- ECC intake keeps lightweight optional scope behavior and does not auto-seed blank structured rows.
- ECC companion scope remains allowed under the existing promotion-to-Service rule when work becomes its own lifecycle thread.
- Contractor intake remains requested/proposed work submission only; contractor canonical scope authority is unchanged.
- Issued/void invoice records remain immutable and do not expose draft build controls.

Explicit non-changes in this promotion:
- No payment execution behavior changes.
- No Stripe behavior changes.
- No QBO behavior changes.
- No Pricebook seed behavior changes.
- No service lifecycle or `jobs.ops_status` redesign.

Truth-boundary reminder (unchanged):
- Visit Scope = operational work definition.
- Invoice line item = frozen billed/commercial snapshot.
- Pricebook item = reusable mutable catalog/default definition.
- Payment = collected-truth layer only where materially implemented.

8.8 Service Workflow Refinement V1 Baseline (completed)

Status:
Service Workflow Refinement V1 is complete and closed at the current baseline.

### Service Case Reconciliation V1
- Centralized `reconcileServiceCaseStatusAfterJobChange` helper is implemented and wired into all relevant write paths.
- Write paths covered: closeout actions (mark service complete, mark invoice sent), Create Next Service Visit.
- Logic: active linked visit keeps/reopens case open; all-terminal linked visits resolve case; Create Next Service Visit can reopen a resolved case.
- `job_events` write for reconciliation events is intentionally deferred to a later service-narrative pass.
- No schema changes; no migrations; no Supabase commands; no production data actions were part of this implementation.

### Interrupt/Waiting State V1
- Pending Info (clear: Mark Info Received), On Hold (clear: Resume Job), Waiting (clear: Mark Ready to Continue) are the three interrupt/waiting states.
- Supported waiting reasons (V1): Waiting on part, Waiting on customer approval, Estimate needed, Waiting on access, Waiting on information, Other.
- Waiting state is job-level V1 only; no service-case-level global blocker orchestration.
- No auto-clear on Create Next Service Visit; release remains explicit/manual.
- Existing fields reused: `jobs.ops_status`, `jobs.pending_info_reason`, `jobs.on_hold_reason`, `jobs.action_required_by`, `jobs.follow_up_date`, `jobs.next_action_note`.

### Create Next Service Visit
- Internal users can create a next visit under the same service case from a job detail page.
- Supports diagnostic → waiting → next-visit workflow patterns.
- No auto-release of source job waiting state on next-visit creation.
- No parts inventory, no estimate automation, no Visit Scope copy-forward.

### Reporting cleanup (V1 baseline)
- Dashboard and report drilldown alignment is complete.
- Open Service Cases = open/interrupted continuity cases.
- Active Repeat Visits = cases with 2+ linked visits and at least 1 active.
- Unassigned Open Visits → Jobs Report drilldown.
- Jobs Report assignment filter: All / Unassigned / specific user.
- Jobs Report contractor-null fallback: `contractor_id = null` same-account customer-owned jobs are now included in Jobs Report scope; cross-account null-contractor jobs remain excluded; the specific-contractor filter remains contractor-only for safety.
- Service Cases Report Latest Visit display is display-only clarity polish; no model change.
- Remaining report work is visual/card polish only; data alignment is complete for this baseline.

Explicit non-changes in this baseline:
- No schema changes, migrations, or Supabase commands.
- No production data actions.
- No payment execution behavior changes.
- No Stripe, QBO, or ECC/retest behavior changes.
- No contractor authority changes.
- No assignment or scheduling behavior changes.
- No Visit Scope copy-forward behavior added.
- No parts inventory or estimate automation introduced.
- No service-case lifecycle code changed outside the reconciliation helper.
- No job creation behavior changed.

9. Staffing / Assignment System (Locked)
9.1 Source of truth

Assignments are owned by:

job_assignments
9.2 Supported model
multiple technicians per job
primary designation
assignment history preservation
internal-user eligibility rules
9.3 Human layer

Identity display must flow through the safe human-layer adapter, not raw user joins.

9.4 Principle

Role = permission
Assignment = workload

These are separate concepts.

10. Scheduling / Calendar Reality (Locked Clarification)
10.1 Current verdict

Scheduling engine is functionally complete.
Calendar system is real.
Remaining work is UX polish, not core-system completion.

10.2 What is complete
real schedule fields:
scheduled_date
window_start
window_end
scheduling / rescheduling / unscheduling backend flow
calendar route and real rendered calendar views
day / week / month / list views
assignment-aware scheduling
schedule-linked ops visibility
schedule-related event logging
technician-aware calendar filtering
unschedule capability exposed in UI
unified-surface drag/drop scheduling in day/week views (no technician-column primary calendar; assignment/no-tech remains metadata)
10.3 What is not missing

The system does not require a new calendar engine or a calendar rebuild.

10.4 What remains as UX-only
optional drag/drop micro-polish beyond the current unified scheduling baseline
optional further visual/operator refinements
optional additional filter/speed affordances
10.5 Product rule

Do not classify calendar/dispatch as “missing” unless discussing a specific UX enhancement not yet exposed.

10.6 Calendar status display rule

Calendar status dot/label is a deliberate hybrid presentation rule.

Use jobs.status for lifecycle/historical markers:
cancelled
on_the_way (displayed as On My Way)
in_progress

Otherwise derive display from jobs.ops_status for operational projection.

This rule is presentation-only and does not change source-of-truth ownership:
jobs.status remains lifecycle/historical truth
jobs.ops_status remains operational projection

10.7 Calendar historical visibility rule

Calendar is a system-of-record scheduling surface, not an active-queue-only surface.

Closed or cancelled jobs must remain visible on the calendar as historical records when they still belong to the scheduled calendar dataset.

This historical visibility rule applies across all calendar views (day / week / month / list) because they consume the same canonical scheduled calendar dataset.

These records must not disappear from calendar merely because lifecycle or ops state changed.

Removal from calendar should happen only through true record-exclusion rules such as:
- archival behavior that intentionally removes the record from active calendar visibility
- deletion / soft-delete behavior where the record is no longer part of the visible calendar dataset
- other explicitly approved full-record visibility rules

Guardrail:
Do not treat closed status alone as a reason to drop a job from calendar history.
Do not treat cancelled status alone as a reason to drop a job from calendar history.
Calendar may visually distinguish historical records, but should preserve them as record-of-truth scheduling history unless a stronger record-removal rule applies.

11. Notifications / Signals (Locked v1)
11.1 Current state

Notifications are now complete as a v1 internal visibility layer.

Completed production-shipped notifications/proposal cleanup: proposal notifications now clear from unread awareness when proposals are accepted/rejected/finalized; notification cards retain identifying context; contractor follow-up comments and internal approval/adjudication notes are preserved; contractor-visible vs internal-only note boundaries remain intact.

11.2 Includes
notification ledger/backend
read/unread state
internal notifications page
mark-as-read behavior
Ops header integration
unread badge
quiet preview surface
11.3 Signal rule

Unread notifications should represent active awareness signals.
Read items should not visually compete with active work.

11.4 Discipline

Do not turn notifications into another queue or urgency stack.

Notifications are awareness signals only and do not own ECC failed-job pending_office_review workflow decisions.

11.5 Awareness-filter rule

Internal notifications should surface awareness-worthy inbound or action-needed signals, not every event written to audit history.

Internal notification read boundaries remain internal-only.

Contractors do not receive direct read access to internal notifications through this awareness layer.

Examples of awareness-worthy internal notifications:
- contractor notes/comments received
- contractor attachments uploaded
- correction submissions
- retest-ready requests
- new intake / new job alerts
- other inbound signals that require review or response

Outbound office-originated actions may remain canonical in `job_events` and other audit/history layers without appearing in the internal notifications awareness feed.

Example:
- `contractor_report_sent` remains part of audit truth/history
- `contractor_report_sent` should not appear as an internal awareness notification

### 11.5.1 Notification family classification lock

Internal notification families must keep **new job/proposal arrival** distinct from **contractor follow-up updates**.

Locked rules:

- `contractor_intake_proposal_submitted` belongs to **New job notifications**, not **Contractor updates**.
- New proposal / new contractor-submitted intake arrival is a **new work-awareness signal**, not a follow-up update signal.
- **Contractor updates** are follow-up contractor-originated changes on an already-existing proposal/job context.

Examples of Contractor updates:
- contractor note added
- contractor files/photos uploaded
- contractor correction submission received
- contractor scheduling update received
- contractor addendum/comment added

Notification copy rule:
- Contractor update cards should use **event-type-driven wording** as the primary message.
- Do not use raw note/comment text as the primary headline for contractor updates.
- Raw submitted text, if shown at all, should remain secondary preview context only.

Meaning:
- New proposal arrival must read as a new-job/new-proposal awareness signal.
- Contractor updates must read as change/update signals.
- Notifications remain signals, not a second queue system.

11.6 Ops dashboard signal surface

The `/ops` dashboard contains one signal surface only.

Do not render separate internal/admin notice bars on `/ops`.

The `/ops` signal surface must show only current office-attention signals that affect what Ops should review or act on next.

Examples include:
- contractor notes/comments
- contractor attachment uploads
- contractor correction submissions
- retest-ready requests
- new contractor-created jobs / review-needed jobs
- contractor-provided schedule updates when they affect follow-up

Do not surface on the `/ops` dashboard:
- internal/admin notice feeds
- email-delivery/bookkeeping notices
- outbound office actions
- audit/history-only events that do not require present attention

Canonical audit/history may still exist in `job_events` and related ledgers without appearing in the `/ops` dashboard signal surface.

During transitional implementation, contractor-response signal wording/classification may be resolved at the read/surface layer without requiring immediate write-path redesign, as long as the dashboard remains a single action-needed signal surface.

11.7 Internal email awareness boundary

Internal email alerts should represent new external/inbound awareness, not echoes of internal office actions.

Rule:
- Internal users should receive new-job alert emails for contractor-originated new job submissions.
- Internal users should not receive new-job alert emails for jobs created internally by office/internal users.

Meaning:
- contractor-created intake/new-job activity may trigger internal awareness email
- internal office-created jobs remain canonical operational history, but should not generate redundant internal alert email to the same office workflow by default

Guardrail:
Do not use internal email alerts as a mirror of all job creation activity.
Use them only where the office is being informed of externally-originated work requiring awareness/review.

11.8 Contractor response classification boundary

Contractor response concepts must remain semantically distinct across narrative truth and internal awareness where safely implemented.

Locked rules:
- Plain contractor notes remain `contractor_note`.
- Contractor correction/review submissions remain `contractor_correction_submission` in canonical event history and must not be flattened into generic contractor-note awareness.
- Upload-only contractor submissions may remain on the transitional `contractor_note` path until downstream response-tracking and awareness readers are updated together to support a separate upload concept safely.

Meaning:
- correction submission is a distinct contractor response type
- it should remain distinct in both `job_events` and internal awareness/notification handling
- upload separation is deferred intentionally to avoid drifting downstream response behavior

11.9 Future notification backlog

- Future feature: tech dispatch phone notifications.
- When a tech is assigned/dispatched to a job, the tech should receive a phone notification.
- Include a later user-facing preference/toggle so techs can turn dispatch notifications on/off.
- This was not implemented in the current performance closeout.

12. Ops Workspace Principles (Locked)
12.1 Page philosophy

Ops pages should optimize for:

immediate clarity
next action recognition
readable history without burying high-value context
12.2 Information priority

High-value operational information should surface high:

notes
failure reason
schedule state
assignment context
12.3 Redundancy rule

Avoid duplicate instructional text when the status and reason already communicate the meaning.

12.4 Right-rail rule

Secondary/history/supporting information belongs in supporting zones when it improves scanability.

13. Contractor / External Interaction (Locked)
13.1 Contractors can
view assigned work
view contractor-safe reports
submit corrections / notes / retest-ready requests
upload attachments
view customer outreach attempts (customer_attempt events) in the portal timeline when internal staff are contacting the customer about that job
13.2 Contractors cannot
own lifecycle
schedule work
close jobs
access internal-only data
mutate canonical operations state directly
13.3 Ownership principle

Internal users own canonical records.
Contractors interact through constrained portal paths only.

For ECC failed jobs under pending_office_review, internal users own the review queue/actions.
Contractor-facing portal state should be plain-language "under review," and contractors may continue adding notes/photos while review is pending.

13.4 Contractor intake boundary

/jobs/new is a shared intake surface.

Internal users may create intake records directly.

Contractor users may also submit constrained intake / call-list jobs through /jobs/new.

This intake path does not grant contractors scheduling authority or lifecycle control.

Internal users remain the owners of downstream review, scheduling, and lifecycle decisions after intake submission.

Contractor-submitted customer/contact/location values are proposed intake data, not final canonical identity authority.

Intended canonical finalization model after contractor submission:

existing customer + existing location
existing customer + new location
new customer + new location

Implementation lock (finalized):

Contractor intake authority is now locked as follows:

- Contractor submissions without an explicit canonical `customer_id` + `location_id` pairing persist as contractor intake proposals for internal review/finalization.
- In this proposal path, contractor-originated intake does not directly create canonical customer/location records.
- Internal finalization resolves proposal data into canonical records through:
  - existing customer + existing location
  - existing customer + new location
  - new customer + new location
- Internal intake remains permitted to create/link canonical customer/location records directly through shared intake rules.
- Contractor intake boundaries do not grant contractors lifecycle or scheduling authority.

13.5 Contractor proposal visibility / collaboration rule

Contractor intake proposals that remain in proposal-state review must stay visible to the submitting contractor in the portal as plain-language **Under Review** until internal review/finalization resolves them.

This visibility exists for continuity and trust only. It does not grant contractors scheduling authority, lifecycle control, or canonical record ownership.

Locked proposal-state rules:
- Proposal-state submissions may surface in contractor portal waiting/read models even before final canonical job finalization.
- Proposal detail is a contractor-safe, read-only under-review surface for the original submission context.
- The original submitted note remains immutable on the proposal record.
- Contractors may append pending-only follow-up comments as additive proposal addenda while the proposal remains under review.
- Proposal addenda do not overwrite the original submission.
- Original proposal files are represented using proposal attachment persistence, but contractor-facing receipt semantics must depend only on successfully persisted proposal attachment rows.
- Proposal attachment handling is authoritative: if proposal attachment persistence fails, proposal submission must fail safely rather than silently succeeding with partial file loss.

Boundary rule:
- Proposal-state portal visibility and collaboration are trust/continuity features only.
- They do not expand contractor authority to edit canonical customer/location/job records, schedule work, or control lifecycle.

14. Repo / Environment Guardrails (Locked)
14.1 Project trees

The root repo is authoritative.
Duplicate/nested mirror tree drift has been identified and cleaned up.

14.2 Environment mapping

Production and sandbox/test Supabase environments must be explicitly distinguished.

14.3 Required rule

Before any migration operation, confirm the linked Supabase project intentionally matches the target environment.

14.4 Branch discipline
sandbox branch = build/test/validate
main = shipped production code
15. Migration Discipline (Locked Operating Rule)
15.1 Production principle

Do not blindly run db push against production when migration history and live schema may differ.

15.2 Reconciliation principle

Migration truth requires reconciliation between:

repo migration files
live production schema
schema_migrations history
15.3 Manual hotfix rule

If equivalent SQL is manually applied in production, the matching migration history must later be reconciled explicitly.

15.4 Current state

Production migration history for the current known migration set has been reconciled to match live schema reality.

15.5 Ongoing rule

Production migration operations must be deliberate, environment-verified, and history-aware.

16. What Is Complete
16.1 Core platform
lifecycle engine
ops command center
customer / location / job model
service case additive container layer
ECC test system
contractor portal
event-driven operational narrative
staffing / assignments
calendar / scheduling engine
notification visibility v1
source-of-truth stabilization
repo/tree reconciliation
migration stabilization process and guardrails
16.2 Interpretation

The core operational platform is complete enough to be considered a real working system, not a partial prototype.

16.3 Operational Entitlement Mutation Guard Rollout (Production-Promoted)

Operational entitlement mutation guard rollout is complete through Slice 16C and is promoted on `main` at commit `bf38eca`. Full validation passed: 89 test files, 1057 tests, TSC_OK. Production smoke confirmed.

Completed guarded internal operational mutation families:

- internal job creation / intake
- job ops / scheduling / contact
- closeout / completion
- internal invoices / invoice lines / manual payment tracking
- notes
- calendar block events
- contractor report preview / send
- attachments
- equipment / systems
- ECC test-run / test-data mutations
- staffing / assignment / contractor relink
- remaining job-detail operational mutations
- contractor intake adjudication
- customer / profile mutations
- contractor directory / admin mutations
- Pricebook mutations

Locked server-side entitlement result:

- active entitlement is allowed
- valid trial with future `trial_ends_at` is allowed
- internal / comped accounts are allowed
- expired trial is blocked before operational mutation writes / side effects
- trial with null `trial_ends_at` is blocked before operational mutation writes / side effects
- missing entitlement row is blocked before operational mutation writes / side effects

Intentional accessibility that remains outside internal operational entitlement gating:

- company profile
- team setup
- internal user / admin invite flows
- password recovery / billing / setup recovery paths
- notification read-state mutations

External contractor onboarding / invite acceptance remains outside internal operational entitlement gating.

`createJob` remains a low-level helper only. Active entrypoints that call it are guarded. Do not add new active callers unless the caller applies the operational entitlement gate first.

`lib/actions/intake-actions.ts` remains dormant legacy create flow and should be treated as a later cleanup / retirement candidate rather than an active mutation lane.

Rollout boundary confirmations:

- no Stripe tenant customer payment execution was introduced
- no QBO behavior was introduced
- no schema migration or Supabase data change was part of this rollout
- tenant customer / work payment execution remains deferred
- two additional test-only mock repairs were committed during main validation (`job-ops-waiting-state.test.ts`, `service-case-reconciliation-wiring.test.ts`); no product behavior change was introduced by those repairs

17. What Is Deferred (Intentional, Not Missing)

These are not currently failures of the spine. They are future/business-layer modules.

customer-facing estimate lifecycle, communication, and conversion flows beyond the current internal baseline
maintenance / agreement systems
additional dispatch UX micro-polish beyond the current unified drag/drop baseline
deeper notification prioritization/escalation layers
broader role model refinement
future branding/settings/business-profile formalization
App-store/mobile native distribution remains intentionally deferred for current launch scope; web product launch readiness is the priority baseline.
Field-ready installable/PWA access readiness V1 Slice 1 is limited to metadata/installability baseline hardening only (manifest/layout metadata coherence and home-screen launch QA checklist). Service worker/offline caching remains deferred to a separate planned slice.
Field-ready installable/PWA access readiness V1B-1 (Proxy Verification + Portal Loading Polish) is complete: `proxy.ts` is confirmed active under Next.js 16 (the correct convention; `middleware.ts` is deprecated and must not be added), protected unauthenticated deep links preserve `?next=` for tested routes, and `app/portal/loading.tsx` provides a mobile-friendly contractor portal loading skeleton. Service worker/offline caching and native app-store distribution remain deferred. No auth, session, contractor/internal separation, first-owner routing, Estimates/Support flags, or source-of-truth boundaries changed.

Note:
Payment P1 foundation is closed at the current baseline.
Tenant customer invoice payment execution and live Pay Now/Charge Card flows remain deferred.
Stripe Platform Subscription V1 is implemented and live-smoke confirmed for platform account onboarding.
Operational entitlement mutation gating for active internal operational mutation paths is complete and production-promoted on `main` (commit `bf38eca`). Dormant legacy intake cleanup remains a later candidate.
See Section 19 for current payment-ready status.

18. Internal Business Identity vs Product Brand Identity (Locked)

18.1 Internal Business Identity (tenant operational identity)

Internal Business Identity is account-owner-scoped operational identity from internal_business_profiles.

Owner scope anchor:

account_owner_user_id

Operational identity fields:

display_name
support_email
support_phone
logo_url

Operational surfaces must resolve tenant identity through the internal business identity resolver boundary in the business profile layer.

UI/action/email callers in operational flows must not carry local hardcoded tenant fallback literals.

18.2 Product Brand Identity (global platform identity)

Product Brand Identity remains global platform identity for shell/auth/default infrastructure surfaces.

Examples include:

app shell metadata
manifest
auth page branding copy
global email/platform branding defaults

Do not blur tenant operational identity into global product branding rules unless explicitly approved as a separate branding initiative.

18.3 Boundary rule

internal users remain human identities
contractors remain external business partners
tenant operational identity is resolved from internal_business_profiles
global product brand identity remains separately owned

This model does not yet own:

full billing / invoicing
broad tenant settings
business administration workflows
role / permission semantics
do not overload user profiles to represent company identity
keep the initial implementation narrow and identity-focused only

18.3.1 First Owner Onboarding / Account Provisioning V1 (Implemented — Complete)

For V1 launch readiness, standard company/account onboarding now supports public self-serve signup at `/signup`, while invite-only platform-admin/operator provisioning remains active for controlled/manual fallback and special-case onboarding.

**Implementation status: V1 complete.** Implemented across four slices:
- `lib/business/first-owner-provisioning.ts` — idempotent provisioning helper; dry-run / apply modes
- `scripts/provision-first-owner.ts` — operator script; requires explicit allow flags, and hosted `.supabase.co` targets require both allow flags for dry-run and apply
- `lib/auth/first-owner-routing.ts` — first-owner marker detection and `/ops/admin` routing seam
- `app/set-password/page.tsx` — updated to route first-owner acceptance to `/ops/admin`

Confirmed V1 sequence:
- operator runs provisioning script (dry-run first, then apply with explicit allow flags)
- provisioning confirms/creates: auth user, profile, owner-anchored `internal_users` row, `internal_business_profiles`, `platform_account_entitlements`
- provisioning now also evaluates Pricebook starter seeding through the seed helper:
  - dry-run surfaces structured `pricebookSeeding` preview output
  - apply seeds missing starter rows idempotently by `seed_key`
- first-owner marker is durably written to user metadata before invite send
- first owner receives invite
- first owner accepts invite and sets password via `/set-password?mode=invite`
- routing seam detects first-owner marker; fails closed if DB anchor rows are missing
- first owner lands in Admin Center readiness setup flow at `/ops/admin`

Confirmed Self-Serve Onboarding V1 sequence (public path):
- unauthenticated user opens `/signup`
- signup submit reuses `lib/business/first-owner-provisioning.ts` and shared invite orchestration in `lib/business/first-owner-invite.ts`
- fresh email path sends secure setup/invite email and completes `/set-password` -> login flow
- duplicate/existing email behavior is intentionally neutral in public responses and does not expose account-existence details
- tenant anchor boundary remains `account_owner_user_id` and no RLS model change was introduced

Operator flag note: because hosted Supabase projects use `.supabase.co`, the provisioning script classifies them as production-like remote targets. `ALLOW_FIRST_OWNER_PROVISIONING=true` enables the tool; `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` acts as the required explicit remote-target confirmation for hosted Supabase projects (including sandbox). Operators must verify the intended project before running apply. Dry-run should always be run first.

Public self-serve signup is now part of the active V1 onboarding baseline for standard account creation.

Operator first-owner provisioning remains active as a controlled/manual fallback path, and internal/comped owner provisioning remains operator-controlled (not public).

Initial signup-page first-impression polish is complete and acceptable for current baseline; deeper public-brand/marketing polish remains deferred.

This direction preserves controlled onboarding quality, protects `account_owner_user_id` tenant boundaries, and keeps tenant operational identity separate from global product brand identity.

If Compliance Matters is later packaged as an app, login still uses the same server-side account provisioning/auth model; app shell packaging does not replace tenant onboarding or account ownership setup.

18.4 Equipment Domain — Canonical Role Vocabulary and Field Contract

The job_equipment table uses equipment_role as the single canonical classification field.

**Canonical stored vocabulary:**

| Stored value | Physical meaning | Field group |
|---|---|---|
| outdoor_unit | Outdoor AC condenser | Cooling |
| indoor_unit | Indoor coil | Cooling |
| air_handler | Air handler | Cooling |
| heat_pump | Heat pump outdoor unit | Cooling |
| package_unit | Package unit (any fuel type) | Cooling |
| mini_split_outdoor | Mini-split outdoor unit | Cooling (design deferred) |
| mini_split_head | Mini-split indoor head | Cooling (design deferred) |
| furnace | Furnace (any fuel type) | Heating-only |
| other | Unknown / specialist | Permissive |

**Intake mapping:** The /jobs/new intake form uses detailed component sub-types (condenser_ac, furnace_gas, air_handler_electric, heat_pump_outdoor, package_gas_electric, package_heat_pump, coil) that are mapped to canonical values before persistence. The mapping is owned by lib/utils/equipment-domain.ts.

**Field contract by role:**

- Furnace (heating-only): valid fields are heating_capacity_kbtu, heating_efficiency_percent, heating_output_btu. tonnage and refrigerant_type must be NULL.
- Cooling roles (all others except furnace and other): valid fields are tonnage and refrigerant_type. All heating_* fields must be NULL.
- Other: all numeric fields are optional with no role-based filtering.

**Enforcement:** lib/utils/equipment-domain.ts exports mapToCanonicalRole() and sanitizeEquipmentFields(). Every write path (intake create, post-create add, post-create edit) uses these helpers. Filtering logic is not duplicated.

**Stability:** equipment_role is currently editable for correction. Changing role re-sanitizes incompatible fields server-side. Full immutability is a future option, not currently locked.

**Out of scope:** component_type column is not part of this contract. Mini-split full treatment is deferred.

19. Payments Module (P1 Foundation Complete + Platform Subscription V1 Live Platform Smoke Confirmed)

19.1 Current truth (locked)

Payment P1 foundation is complete.

Tenant customer invoice payment execution remains deferred to a later phase.

Current implementation truth:
- payments are currently tracking-only
- payment P1 foundation is closed at the current baseline
- Stripe Platform Subscription V1 is implemented and live-smoke confirmed in production for platform account onboarding
- live confirmation includes live Stripe Product/Price, deployed live env, live webhook processing at `/api/stripe/webhook`, successful non-owner checkout completion, billing-customer linkage, active subscription sync, populated period end, and billing portal availability
- flat account subscription with unlimited users is the V1/live launch billing decision; active user count remains visible and per-seat enforcement is deferred
- internal/comped owner protection is complete through comped-safe `platform_account_entitlements` rows (`internal_comped_v1`, no Stripe linkage, unlimited users)
- platform subscription sync writes only to `platform_account_entitlements`
- live processor-based tenant customer payment acceptance is not yet enabled
- the platform remains payment-ready by design but not yet payment-active for tenant invoice execution

19.2 Core payment direction (locked)

Payment P1 foundation is now complete.
Future payment execution will follow the direction defined in this section, without forcing redesign of the current architecture.

Locked rule:
- the platform is payment-ready by design
- the platform is not yet payment-active
- architecture supports future live payments without requiring redesign

19.3 Ownership model (locked)

- Compliance Matters = operational source of truth for payment visibility, payment-related workflow state, and operational tracking
- Stripe =
  - implemented rail for platform account subscription onboarding (V1 live platform smoke complete)
  - future preferred rail for tenant customer payment acceptance and money movement
- QBO (optional future) = accounting integration seam only

Meaning:
- operational payment state
- accounting sync
- payment execution

are separate layers and must remain separate in the architecture.

19.4 QBO rule (locked)

QuickBooks Online must not be the required foundation for payment architecture.

QBO is:
- optional
- downstream
- accounting-oriented
- a future sync/integration seam

QBO is not:
- the required basis for payment acceptance
- the payment rail
- the required merchant setup
- a prerequisite for core product usage

19.5 Stripe rule (locked)

Stripe is the preferred future payment rail.

Meaning:
- future customer payment execution should follow a Stripe-first path
- processor-backed payment handling must not depend on QBO adoption
- future contractor payout/onboarding complexity should live at the payment-rail layer, not in accounting logic

Current implementation rule:
- platform subscription onboarding V1 is implemented (admin checkout, portal access, webhook entitlement sync)
- do not treat this as tenant customer invoice payment execution
- tenant Pay Now/Charge Card/invoice checkout/refunds/disputes/payout execution remains deferred
- keep Stripe implementation additive so future tenant execution can be introduced without structural rework

19.6 Current live behavior

Supported now:
- payment tracking
- payment status visibility
- amount due / amount paid visibility where implemented
- manual/external payment reference tracking where needed
- operational awareness of payment state

Not yet supported:
- live card acceptance
- ACH acceptance
- saved payment methods
- processor-led refunds
- dispute/chargeback handling
- contractor payout onboarding
- customer self-serve payment checkout

19.7 Payment foundation requirements (build now)

19.7.1 Data-model rule

The payment domain must be built now so the system can support later payment acceptance without rework.

The architecture should be able to represent:
- payment status
- amount due
- amount paid
- balance due
- payment method type
- processor name
- processor reference
- recorded/paid date
- refund status
- refund amount
- failure/error note
- sync status

This does not require all execution flows to exist now, but the structure must anticipate them.

19.7.2 Processor abstraction rule

Payment tracking must remain processor-agnostic at the domain level.

Locked rule:
- do not hardcode payment logic around QBO-specific objects
- do not hardcode accounting-only assumptions into payment flows
- do not lock the model to one-off manual patterns that would block future Stripe rollout

The payment layer must allow:
- manual/off-platform recorded payments now
- Stripe execution later
- optional QBO sync later

19.7.3 Event rule

Payment-related operational changes should be event-capable from the start.

Examples:
- `invoice_sent`
- `payment_recorded`
- `payment_partially_paid`
- `payment_marked_paid`
- `payment_marked_failed`
- `refund_recorded`
- `payment_sync_failed`

Locked rule:
If payment state materially affects operations, history, or accountability, it should be event-backed.

19.7.4 UI rule

Current UI must reflect tracking truth only.

Allowed current language:
- Payment Status
- Amount Paid
- Balance Due
- Payment Recorded
- External Payment Reference

Disallowed current language until live processing exists:
- Pay Now
- Collect Card
- Charge Card
- Process Refund
- Card on File

The UI must not imply live processor-backed payment functionality before it is actually implemented.

19.8 Platform-fee rule (locked)

Future Stripe-based payment acceptance should support a small configurable platform fee.

Meaning:
- the architecture should allow the platform to retain a modest fee later
- the fee should help sustain the platform
- the fee must be configurable, not hardcoded as an aggressive monetization model

Current implementation rule:
- support the ability to add a platform fee later
- do not assume heavy fee extraction at launch
- do not make payment monetization the centerpiece of the current build

19.9 Roadmap phases

Phase P0 — Tracking only (current live state)

Includes:
- payment visibility
- payment status tracking
- operational payment awareness
- manual/external reference support

Phase P1 — Payment-ready foundation (closed; complete enough at current baseline)

Includes:
- payment domain model
- payment-related fields
- processor-agnostic architecture
- event-ready payment transitions
- UI wording boundaries
- future Stripe seam
- optional future QBO sync seam
- support for a later configurable platform fee

Completed slices in this phase:

1. Platform Account Entitlement / Usage Foundation V1
- Implemented as platform-account entitlement truth only (`public.platform_account_entitlements`) with account-owner scope, read-side resolver support, and read-only admin visibility in company profile.
- This slice is intentionally separate from tenant billed truth (`internal_invoices` / `internal_invoice_line_items`) and from collected-payment truth.
- Missing entitlement row resolves to safe default trial entitlement context; real DB/query errors do not silently grant access and must throw.
- Active seat count is derived live from `internal_users` and is not stored on the entitlement row.
- Stripe placeholder fields in this slice are inert schema scaffolding only.

2. Manual Payment Ledger V1
- Implemented as manual/off-platform collected-payment truth only (`public.internal_invoice_payments`) with account-owner scope, read-side resolver support, and minimal internal job-detail UI integration.
- Payment recording is for issued internal invoices only; draft and void invoices cannot receive payments.
- One invoice may have multiple payment rows; balance due is derived from invoice total minus recorded payments.
- Payment status values are: recorded, pending, failed, reversed. Only "recorded" status counts toward collected totals.
- Payment records are immutable; no payment deletion or status mutation exists.
- Internal invoices remain billed truth; payment recording does not mutate invoice totals or line items.
- Payment recording writes `payment_recorded` events to `job_events` with full metadata for auditability.
- Real DB/query errors throw; missing payment rows resolve to zero collected totals.
- Stripe and QBO fields are inert schema scaffolding only; no processor execution exists.
- This slice is intentionally separate from platform entitlement truth and remains payment-ready by design.

3. Collected Payment Reporting / Invoice Ledger Visibility V1
- Implemented as reporting/visibility only on the internal invoice ledger and CSV export surfaces.
- Internal invoice ledger rows now expose collected-payment visibility fields: Amount Paid, Balance Due, Payment Status, Last Payment, and Payment Count.
- CSV export now includes collected-payment columns: Amount Paid, Balance Due, Payment Status, Last Payment Date, and Payment Count.
- Collected totals derive from `public.internal_invoice_payments`; only "recorded" status counts toward collected totals.
- Balance due remains read-side derived from invoice total minus recorded payments; this does not mutate invoice totals or invoice line items.
- Last Payment / Last Payment Date is rendered using clean report-date formatting (not raw ISO timestamp output).
- External-billing behavior remains honest/non-fabricated and does not invent internal invoice/payment reporting.
- This slice did not introduce payment execution, Stripe checkout, QBO sync, portal payment UX, dashboard payment analytics expansion, or refund/dispute execution.

4. Final Closeout-Quality Test Fidelity Polish
- Collected-payment report tests now assert production report read-model outputs directly (`listInvoiceLedgerRows` and `buildInvoiceLedgerCsv`) instead of duplicated local aggregation logic.
- Coverage confirms production payment-column mapping (Amount Paid, Balance Due, Payment Status, Last Payment Date, Payment Count), recorded-only counting behavior, and CSV column order/value projection.
- This closeout polish did not change payment runtime behavior; it improved closeout confidence against regression in production mapping paths.

Does not include:
- live customer checkout
- contractor payout onboarding
- saved cards
- live refunds/disputes
- processor-led payment execution

Phase P2 — Customer payment acceptance (later planning phase; not immediate implementation)

Recommended first live scope:
- customer pays invoice online
- transaction outcome writes back into Compliance Matters
- payment state updates automatically
- simple Stripe-first processor path
- no payout complexity unless explicitly required

Separate future track (not part of tenant invoice/payment tracking phases above):
- Platform subscription billing execution remains a platform-billing roadmap item and must not be conflated with tenant internal invoice billed/collected tracking truth.

Phase P3 — Contractor/platform payout layer (later)

Only after customer payment acceptance is stable.

Includes:
- contractor onboarding
- payout rules
- recipient ownership logic
- refund/dispute responsibility
- optional platform fee activation if desired

Phase P4 — Optional QBO sync (later)

Accounting convenience only.

Possible scope:
- invoice sync
- payment sync
- reconciliation support
- bookkeeping-friendly exports/mappings

Locked boundary:
- QBO sync must remain optional and downstream

19.10 Launch rule (locked)

Lack of live payment acceptance does not automatically block launch.

Reason:
- payment tracking still supports operations
- the system can still manage invoice/payment visibility
- payment execution is a later convenience/collection layer
- current focus is building the architecture correctly so rollout later is clean

19.11 Non-negotiables

- do not require QBO for payment architecture
- do not couple payment readiness to accounting adoption
- do not imply live payment acceptance before it exists
- do not hardcode around QBO-specific payment structures
- do not overbuild payout complexity too early
- do support a future small configurable platform fee
- do keep payment execution additive to the operational core, not disruptive to it

20. Current Product Assessment

20.1 Honest state

Compliance Matters is now a:

stabilized, event-driven operational workflow system with working scheduling, staffing, contractor collaboration, and internal signals

20.2 Most accurate summary

The platform is no longer waiting on a missing core system.

It is now in:

refinement, extension, and business-layer planning

20.3 Current roadmap checkpoint

Roadmap order remains:

1. Service model buildout
2. Billing / invoice workflow
3. Reporting / analytics
4. RLS completion / permission hardening
5. Payment P1 foundation closeout
6. Out-of-box readiness / business identity / settings packaging closeout
7. Pricebook V1 continuation (active product track)
8. Smaller service-model revisions / service workflow refinement

Current position:
- Service model buildout is closed for milestone-1 scope.
- Billing / invoice workflow is complete enough to move forward for milestone-2 scope.
- Reporting / analytics is now substantially complete for the current milestone-3 scope.
- Payment P1 foundation is closed at the current baseline.
- Pricebook V1 is no longer fully deferred and is the active product-track continuation area.
- Pricebook V3 rollout/verification is closed for current scope after this docs closeout.
- Next product focus remains smaller service-model revisions / service workflow refinement.
- Estimates/quoting V1A-V1J is implemented to the current guarded internal baseline.
- Estimates/quoting is not production-live yet: estimate migrations are sandbox-only, production estimate migrations are not applied, production `ENABLE_ESTIMATES` remains disabled, and production `ENABLE_ESTIMATE_EMAIL_SEND` remains disabled.
- V1E internal-only status transitions are complete: `draft -> sent`, `sent -> approved|declined|expired|cancelled`, and `draft -> cancelled`.
- V1E transition events write `previous_status` and `next_status`; status timestamps are set on transition.
- V1E keeps line editing draft-only and hides line-edit controls after `sent`.
- V1F internal-only hardening/operator polish is complete: status transition confirmation wording is clearer, terminal actions use stronger confirmation copy, status panels more clearly describe editable vs terminal states, activity feed labels are more readable, and `/ops?notice=estimates_unavailable` now surfaces a small internal-safe notice.
- V1F also makes the current non-goals explicit in the operator workflow: `sent` does not send email/PDF, and `approved` does not create a job, invoice, payment, conversion, or customer approval record.
- V1G internal-only presentation and print-readiness polish is complete on estimate detail: scan hierarchy/readability is improved for estimate number, status, customer/location context, totals, and line-item presentation; print-friendly browser layout is added for internal estimate document review; explicit commercial boundary wording is reinforced; and read-only placeholders for future send/communication history are present without live behavior.
- V1H internal-only estimate communication/send-attempt foundation is complete: migration `20260502120000_estimate_communications_v1h.sql` is applied to sandbox only, fail-closed `ENABLE_ESTIMATE_EMAIL_SEND` is implemented, blocked attempts are recorded when email send is disabled, draft/sent detail includes send-attempt UI, communication history reads from `estimate_communications`, activity readability includes `estimate_send_attempted`, and terminal estimate statuses do not expose send action.
- V1I decision artifact is complete as planning-only (no implementation changes): Option B comes first (generated document/PDF strategy planning before real provider send), and Option A comes later (sandbox-only real email provider enablement after document/wording go/no-go gates are satisfied).
- V1I go/no-go gates for future sandbox-only email enablement are documented: approved document wording, approved branding/header/footer, recipient confirmation UX review, communication history wording approval, sandbox-only send smoke plan, and validated fail-closed rollback behavior.
- V1I go/no-go gates for future PDF generation/storage are documented: canonical content model, freeze/version semantics, generation trigger, internal access boundaries, retention/storage policy, and no portal/public exposure.
- V1J internal-only document-template/readiness slice is complete (commit `ad5d735`): canonical document view model/helper is implemented, centralized disclaimer package is implemented, revision semantics planning constants are defined (freeze at send-attempt creation, immutable historical revisions, post-freeze edits require new revision), estimate detail readiness section is wired to the shared document helper, print/readiness wording uses the shared document model, no persistent revision storage is introduced, and no new schema/migration was required.
- Estimate Detail Wording + Internal Scaffolding Collapse closeout is complete on the guarded internal baseline: heavy readiness/disclaimer content is now collapsed under `Internal Readiness Notes` by default, `Mark Sent` is now labeled `Mark Sent Manually`, status helper copy now explicitly states it updates lifecycle/status only (no email/PDF), `Send Estimate` remains communication-attempt wording only, and send helper copy now explicitly states communication logging does not change lifecycle status.
- This closeout is presentation/copy/information hierarchy only: no schema/migration/RLS/policy/auth/feature-flag/server-action/status-transition behavior changes; no production data actions; no real outbound email; no PDF/storage; no customer approval/e-signature/request-change; no customer portal/public links; no estimate conversion; no payment/deposit/Stripe tenant payment/QBO behavior.
- Estimate Pricebook Editable Defaults V1 closeout is complete on the guarded internal baseline: selecting a Pricebook item in draft estimate Add from Pricebook now prefills editable defaults for item name, description, item type, category, unit label, quantity, and unit price; users can edit those fields before add; added estimate line snapshots now use submitted edited values; and `source_pricebook_item_id` provenance remains preserved.
- Customer Estimate Profile Entry V1 closeout is complete on the guarded internal baseline (commits `bcfa9f7`, `b977c89`): `/customers/[id]` now shows an internal-only Estimates section when `ENABLE_ESTIMATES=true`; the customer profile header now includes `Create Estimate` for internal users when estimates are enabled; `Create Estimate` routes to `/estimates/new?customer_id=<id>`; `/estimates/new` validates the customer_id UUID and preselects the customer; customer/location context is prefilled or filtered where available but fields remain editable before draft creation; customer estimates appear in the customer profile estimate history/list; `/estimates/[id]` now includes `Back to Customer` when `estimate.customer_id` is set; section CTA behavior was cleaned up (no duplicate always-visible section button; empty state retains `Create First Estimate`); contractors do not see estimate controls; existing estimate feature gates remain intact; production estimates remain disabled unless explicitly enabled under runbook gates.
- Customer Estimate Profile Entry V1 remains guarded internal baseline only: no real outbound estimate email, PDF generation/storage, customer approval/decline/request-change, public/customer portal links, contractor visibility, estimate-to-job conversion, estimate-to-invoice conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, schema changes, migrations, RLS changes, or production data actions were introduced.
- Customer Estimate Profile Entry V1 validation: `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `127` tests); user browser smoke passed.
- Estimate Pricebook Editable Defaults V1 remains estimate-only for this slice: no post-add estimate line editor, no invoice behavior changes, no Visit Scope behavior changes, no schema/migration/RLS/policy/auth/feature-flag/server-action lifecycle behavior changes, no real outbound email/PDF/storage/customer approval/conversion/payment behavior, and no production enablement movement.
- Shared Pricebook Entry UI Primitive V1 is complete for the current internal baseline: estimate draft line entry and draft invoice line entry now use the same clean Pricebook-style entry pattern for Pricebook-backed selection and manual line entry while preserving the existing domain model.
- Shared Pricebook Entry UI Primitive V1 is UI consolidation only: no new schema, no new migration, no RLS/policy change, no server action ownership change, no pricing-source truth change, no estimate lifecycle change, no invoice immutability change, no payment behavior, no production estimate enablement, and no Support Console or Visit Scope behavior change.
- V1J did not add real outbound production estimate email, PDF generation/storage, persistent revision storage, customer approval/e-signature, customer portal estimate visibility, public estimate links/tokens, contractor visibility/authority, estimate-to-job conversion, estimate-to-invoice conversion, payment/deposit, Stripe tenant payment behavior, QBO behavior, or production estimate enablement.
- Source-of-truth boundaries remain locked: `estimate_events` = lifecycle/operator audit truth, `estimate_communications` = send-attempt/communication truth, Estimate = proposed commercial scope, Visit Scope = operational work scope, Invoice = billed commercial scope, Payment = collected truth only where implemented, Pricebook = reusable catalog/default pricing truth.
- Scope vs Line Items / Work Items terminology alignment Slice 1 is complete (wording/helper-copy pass only):
  - user-facing terminology now distinguishes:
    - Reason for Visit / Dispatch Notes = free-form dispatch/intake context explaining why the visit exists
    - Work Items = structured operational Visit Scope
    - Invoice Charges = billed commercial view
    - Pricebook Service / Charge = reusable catalog item
  - internal/source-of-truth model remains unchanged:
    - Visit Scope remains the operational work-definition layer under jobs
    - invoice line items remain billed/commercial truth
    - estimate lines remain proposed commercial truth
    - Pricebook remains reusable catalog/default pricing truth
  - no schema, behavior, migration, feature flag, Pricebook seed/backfill, Estimate, invoice, payment, support-access, or contractor-authority behavior changed
  - browser smoke and validation passed across internal `/jobs/new`, service `/jobs/[id]`, invoice panel/build-from-work-items wording, contractor `/portal/jobs`, and contractor `/jobs/new` request flow
- Work Item-first Invoice Builder Clarity V1 is complete on the guarded internal baseline (commit `5dc89c2`): draft invoice panel now presents `Build Invoice Charges from Work Items` as the recommended path when Work Items are available; helper copy now states operators should start from Work Items already captured for the visit and that imported items become draft Invoice Charges for review/edit before issue; truth-boundary copy now explicitly states Work Items remain the operational work record and Invoice Charges remain billed copy for this invoice; and `Add From Pricebook` remains available as a secondary/fallback path for charges not already captured as Work Items.
- Work Item-first Invoice Builder Clarity V1 is copy/UX emphasis only: no action/payload changes; Work Item import behavior remains unchanged (`quantity = 1.00`, `unit_price = 0.00`, `source_kind = visit_scope`, `source_visit_scope_item_id` preserved); no manual line behavior change; no schema/migration/Supabase/production data/RLS/policy/auth/feature-flag changes; no issue/send/payment behavior changes; no Visit Scope, Pricebook, estimate, Stripe tenant payment, or QBO behavior changes.
- Work Item Import Defaults Clarification V1 is complete on the guarded internal baseline (commit `8f79e07`): the draft invoice Work Item import area now explicitly states the current conservative import defaults with helper copy, `Imported Work Items start as draft Invoice Charges with Qty 1.00 and Unit Price $0.00. Review and edit pricing before issuing.`; this reinforces the Work Item-first billing flow that Work Items remain the operational work record, imported Work Items become draft Invoice Charges, and Invoice Charges remain reviewed/edited billed copies before issue.
- Work Item Import Defaults Clarification V1 is docs/copy only: no smarter pricing was introduced; no Pricebook text matching was introduced; no persisted Work Item provenance fields were added; no server-action behavior changed; no payloads or hidden fields changed; no import defaults changed; and no schema/migration/Supabase/production data/RLS/policy/auth/feature-flag/issue-send-payment/Visit Scope/Pricebook/estimate/Stripe tenant payment/QBO behavior changed.
- Invoice Panel Hierarchy Polish V1 is complete on the guarded internal baseline (commit `2cc5d58`): draft invoice entry hierarchy now matches the Work Item-first model by rendering Work Item import before `Add From Pricebook`; Work Item import remains the clear recommended path; `Add From Pricebook` now reads as a fallback path for charges not already captured as Work Items; and manual `+ Add Charge` now reads as an exception/fallback path.
- Invoice Panel Hierarchy Polish V1 is copy/layout only: no server-action changes; no payload/hidden-field/import-default/pricing changes; no schema/migration/Supabase/production-data/RLS/policy/auth/feature-flag changes; no issue/send/payment behavior changes; no Visit Scope/Pricebook/estimate/Stripe tenant payment/QBO behavior changes; no smarter pricing; no Pricebook text matching; and no persisted Work Item provenance changes.
- Work Item-first Flow Copy Density Polish V1 is complete on the guarded internal baseline: invoice/work-item helper language is now less technical and more field-service friendly while preserving the same behavior and boundaries; Work Item import remains primary, Pricebook remains fallback, and manual add remains exception/fresh-charge path.
- Work Item-first billing mini-phase is now closed unless a later visual review finds a clear issue.
- Customer approval, customer/contractor portal authority, estimate email/PDF, conversion, and payment behaviors remain deferred.
- Future estimate/customer-facing roadmap remains deferred after this closeout:
  - future estimate polish should target the same professional clarity bar already reached in Contractor Report current-scope delivery
  - completed in current baseline: workflow wording now separates `Send Estimate` (communication attempt logging) from `Mark Sent Manually` (lifecycle/status transition) without collapsing communication truth into lifecycle truth
  - completed in current baseline: draft estimate Add from Pricebook now treats selected Pricebook values as editable defaults before add while preserving `source_pricebook_item_id` provenance
  - future customer-centered access can expose estimates from customer profile/history, reporting, and normal top-nav workflow only when estimate enablement is intentionally advanced
  - future estimate entry should support customer email/location prefill with explicit editability before submit/send actions
  - future workflow should support explicit customer response outcomes (approve/decline/request-change) only after dedicated design and gated implementation
  - future conversion should remain explicit and staged: estimate -> job/service visit first, estimate -> invoice charges later
  - future Pricebook-backed estimate/invoice drafting should continue to prefill reusable defaults into editable draft transactional rows rather than turning transactional rows into live catalog pointers
  - future Work Item-first billing flow remains a separate audit/planning track: structured Work Items remain the primary operational record, free-text scope/notes remain narrative context, and Invoice Charges should eventually be buildable from existing Work Items with review/editing rather than re-entry
  - multi-option/good-better-best quoting and top-ribbon/nav workflow access remain future tracks when estimate workflow is intentionally promoted beyond guarded internal use
  - customer approval, conversion, deposits/payments, and public/customer portal delivery remain later design tracks and are not part of the current baseline
- V1J validation status: automated checks passed (`npx vitest run lib/estimates` = `123/123`, `npx tsc --noEmit` = `TSC_OK`); sent/approved estimate detail smoke passed; draft-detail smoke is now completed/closed using sandbox draft `EST-20260502-9D58499B` (`/estimates/43aeaa8e-e60e-47d4-8c26-2570600b24df`) and confirmed document readiness rendering, boundary disclaimers, draft manual-line editing, draft pricebook picker availability, blocked send-panel copy, communication history rendering, and absence of email/PDF/customer approval/public link/conversion/payment/customer portal/contractor controls.
- Estimate detail wording/internal scaffolding collapse validation status: `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `131` tests); authenticated smoke confirmed Internal Readiness Notes collapsed by default with readiness/boundary language available when expanded, blocked `Record Send Attempt` preserved `Draft` status, and `Mark Sent Manually` transitioned `Draft -> Sent`.
- Estimate Pricebook Editable Defaults V1 validation status: `npx.cmd tsc --noEmit` passed; `npx.cmd vitest run lib/estimates` passed (`7` files / `131` tests); authenticated sandbox smoke confirmed Pricebook selection prefills editable fields, edited item name/description/quantity/unit price persist on added line snapshot, manual add still works, draft remove still works, sent estimate lock behavior remains unchanged, and no invoice/payment/conversion/approval/PDF/live-email behavior surfaced.
- Work Item-first Invoice Builder Clarity V1 validation status: `npx.cmd tsc --noEmit` passed; targeted tests passed (`npx.cmd vitest run lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts lib/business/__tests__/internal-invoice-line-items-provenance.test.ts` = `2` files / `24` tests); browser smoke confirmed create draft invoice, add selected Work Items, imported Work Item visibility with `Already added`, Pricebook add, manual add/edit/remove, save charge, and remove charge all worked with no persistent feature breakage; transient dev-session navigation/request churn was observed and not treated as a blocker for this copy/UX slice.
- Work Item Import Defaults Clarification V1 validation status: `npx.cmd tsc --noEmit` passed; targeted tests passed (`npx.cmd vitest run lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts lib/business/__tests__/internal-invoice-line-items-provenance.test.ts` = `2` files / `24` tests); browser smoke confirmed the new helper copy appeared near the Work Item import area, importing a Work Item still succeeded, the imported draft charge still defaulted to qty `1.00` and unit price `$0.00`, the imported draft charge remained editable, and issue-gate/issue behavior remained unchanged.
- Invoice Panel Hierarchy Polish V1 validation status: `npx.cmd tsc --noEmit` passed; targeted tests passed (`npx.cmd vitest run lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts lib/business/__tests__/internal-invoice-line-items-provenance.test.ts` = `2` files / `24` tests); browser smoke confirmed Work Item import appeared before `Add From Pricebook`, Work Item import remained recommended, Pricebook add read as fallback, manual add remained available as exception/fallback, imported Work Item charges still defaulted to qty `1.00` and unit price `$0.00` and remained editable, direct Pricebook add still worked, manual add still worked, and issue-gate/issue behavior remained unchanged.
- Work Item-first Flow Copy Density Polish V1 validation status: `npx.cmd tsc --noEmit` passed; targeted tests passed (`npx.cmd vitest run lib/actions/__tests__/internal-invoice-pricebook-line-actions.test.ts lib/business/__tests__/internal-invoice-line-items-provenance.test.ts` = `2` files / `24` tests); browser smoke confirmed desktop and narrow/mobile-ish rendering, no horizontal overflow on the inspected invoice surface, Work Item path still first, Pricebook fallback still visible, manual add still available as exception/fresh charge path, imported rows still rendered, and no behavior drift.

Future end-of-road UX review option (deferred, not current implementation):
- If job detail remains too dense after broader build completion, evaluate a job-owned billing workspace route such as `/jobs/[id]/billing` or `/jobs/[id]/invoice`.
- This is a final review option, not an immediate roadmap commitment.
- Any future route must remain job-owned and preserve job context, Work Item import behavior, invoice issue/send/payment boundaries, permissions, source-of-truth ownership, and reuse of existing invoice components where practical.
- Production readiness hardening guard is complete and committed: `createEstimateDraft` in `lib/estimates/estimate-actions.ts` now returns `{ success: false, error: "Estimates are currently unavailable." }` as the first statement when `ENABLE_ESTIMATES` is false or unset, running before `createClient`/auth/DB work. This was the sole identified pre-production code blocker from the readiness audit.
- Production readiness hardening validation: `npx vitest run lib/estimates` = `131/131`, `npx tsc --noEmit` = `TSC_OK`. Tests confirm: flag-off returns unavailable, no Supabase insert occurs, no estimate_events insert occurs, flag-on valid create still passes. No migrations, Supabase commands, production data actions, email sends, feature flag enables, RLS/policy changes, PDF/storage/customer/public/payment/conversion behavior were introduced.
- Estimates Guard Parity + Send Wording Polish closeout is complete on the guarded internal baseline (commit `edf5022`): `addEstimateLineItem` and `removeEstimateLineItem` now fail-close when `ENABLE_ESTIMATES` is false/unset, mutator tests now assert unavailable response and no `requireInternalUser` call when gated off, and estimate send-attempt wording now consistently uses `Record Send Attempt` while preserving internal-only non-goal boundaries.
- Production execution runbook is now hardened and committed (`df9870f`) at `docs/ACTIVE/Estimates_Production_Enablement_Runbook.md`; this remains planning/runbook readiness only and does not execute migrations, flags, or production enablement.
- Next estimate direction: any production estimate enablement remains a future explicit execution decision under the hardened runbook gates. Do not enable production estimate email sending without an explicit rollout plan.
- Stripe customer/work payment execution follows service/invoice/estimate workflow readiness unless explicitly pulled forward.
- Stripe Platform Subscription V1 remains platform/app usage billing only and must not be conflated with tenant customer/work payment execution.
- Current Pricebook baseline status:
  - production-complete baseline from prior work includes Pricebook admin surface, starter catalog rows, controlled Category/Unit Label values, and server-side controlled-value validation
  - production-promoted C1B/C1C is now complete on `main` (merge commit `e208555`) with production migration applied: `20260427153000_internal_invoice_line_items_pricebook_provenance_v1.sql`
  - C1B/C1C production schema now includes nullable invoice-line provenance/snapshot fields: `source_kind`, `source_pricebook_item_id`, `category_snapshot`, `unit_label_snapshot`
  - C1B/C1C production-promoted behavior includes server-side Pricebook-to-invoice-line frozen snapshot mapping and draft invoice picker wiring; manual line flow remains intact; issued/void invoice immutability remains intact
  - inactive and negative/default-credit items are blocked/deferred from new draft picker selection
  - production smoke is confirmed for Pricebook C1B/C1C with no payment-execution language drift observed
  - production already includes Pricebook seed identity foundation (`seed_key`, `starter_version`) from migration `20260427170000_pricebook_seed_identity_v1`
  - D2C-3 seed helper is production-promoted and matches the original V1 starter definitions
  - D2C-4 first-owner provisioning integration is production-promoted and now surfaces structured `pricebookSeeding` output in dry-run/apply paths
  - production dry-run smoke confirmed `mode = dry_run`, `pricebookSeeding` preview present, `inserted_count = 12`, `skipped_count = 0`, `errors = []`, and `inviteSent = false`
  - V2A/V2B are production-promoted on `main` (commits `7bf9867` and `51ce27c`)
  - Starter Kit V2 seed definitions are implemented in code with 23 rows (`active = 21`, `inactive/deferred = 2`)
  - Starter Kit V3 is production-promoted on `main` (commits `28cc757`, `b31d433`) and is now the default first-owner starter catalog
  - Starter Kit V3 catalog has 97 rows (`active = 91`, `inactive/deferred = 6`)
  - Starter Kit V3 includes modern refrigerants: `R-410A`, `R-454B`, `R-32`
  - first-owner provisioning now defaults to Starter Kit `v3` when selector is omitted
  - Shared Pricebook Entry UI Primitive V1 closeout is complete for current internal estimate/invoice drafting continuity; validation passed and the consolidation remains presentation-layer only with no schema/provenance/payment/runbook boundary changes
  - explicit selectors remain supported for `v1`, `v2`, and `v3`
  - invalid starter kit selector values are rejected before provisioning execution
  - dry-run output now includes selected starter kit metadata (`starter_kit_version`, `seed_count`, `active_seed_count`, `inactive_seed_count`)
  - no schema migration, Supabase command, provisioning apply action, payment behavior change, or production data action was part of V2A/V2B/V3 promotion
  - D3B controlled-options refinement is production-promoted on `main` via merge commit `58dcb31` (change commit `3084906`):
    - controlled options were refined in code/test only (`lib/business/pricebook-options.ts`, `lib/business/__tests__/pricebook-options.test.ts`)
    - added categories: `Electrical`, `Compliance Docs`
    - added unit labels: `trip`, `doc`
    - removed Pricebook controlled unit label: `cfm` (CFM remains valid in ECC/airflow test contexts)
    - no schema migration, Supabase command, or DB write action was part of this promotion
  - Starter Kit V2 content was not implemented by D3B (it was implemented later in V2A/V2B)
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by D2C-3/D2C-4
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by D3B
  - V2C-1/V2C-2/V2C-3 existing-account Starter Kit V2 backfill tooling is production-promoted on `main` (commit `4ead046`):
    - V2C-1: dry-run planner helper (`planExistingAccountStarterKitBackfill`) is production-promoted
    - V2C-2: apply helper (`applyExistingAccountStarterKitBackfill`) is production-promoted; requires explicit `confirmApply: true`; collision-blocking is on by default
    - V2C-3: operator CLI wrapper (`scripts/backfill-pricebook-starter-kit.ts`) is production-promoted; dry-run is the default mode; apply requires explicit `--apply` flag; `--allow-collisions` required to override collision blocking
    - backfill is single-account only; no batch or auto-discovery mode exists
    - insert-only; existing rows are never updated; customized rows are never mutated
    - hosted/production-like targets require both `ALLOW_FIRST_OWNER_PROVISIONING=true` and `ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true` before dry-run or apply
    - controlled production existing-account Starter Kit V3 backfill verification is complete for live owner account `93dd810e-3c0c-4b69-9dae-edfa0e481dbb` on host `ornrnvxtwwtulohqwxop.supabase.co`
    - production verified terminal dry-run state for that owner account is: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - production owner-account Pricebook count is verified at `108` rows (`12` baseline + `96` inserted) and existing V1 `R-410A` remains non-duplicated (`Refrigerant R-410A (per lb)` count = `1`)
    - production verification was read-only and confirmed post-apply terminal state; no schema/code/file change, migration, provisioning apply action, Supabase CLI command, push, or commit occurred during final verification
    - security follow-up: previously exposed legacy production service-role key was rotated, new Supabase secret key is in use, Vercel `SUPABASE_SERVICE_ROLE_KEY` was updated as sensitive, production was redeployed and smoke tested, and terminal sessions were closed
    - deferred hardening remains: migrate away from legacy JWT anon/service_role API-key usage before disabling JWT-based API keys
    - backfill remains operator-controlled and dry-run-first; existing-account backfill was intentionally not run during V3 default adoption
    - Pricebook remains catalog/default pricing truth, not operational truth
    - historical invoices and invoice snapshots are not touched by backfill
    - admin UI backfill controls remain future work
    - batch backfill remains future work
    - automatic backfill remains prohibited
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by V2C-1/V2C-2/V2C-3
  - Pricebook/Admin Polish P1 is production-promoted on `main` (commit `aecb735`):
    - admin Pricebook UI clarity now emphasizes Starter, Custom, Active, Inactive, and Deferred placeholder status for normal operator workflows
    - V1/V2 seed-version terminology is intentionally hidden from normal admin-facing labels
    - `starter_version` and `seed_key` remain internal/tooling detail and were not removed from backend/operator behavior
    - no admin backfill apply button/control exists; existing-account backfill remains operator-run tooling and is not automatic from admin UI
    - Pricebook remains reusable catalog/default pricing truth, not operational truth
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by Pricebook/Admin Polish P1
  - Pricebook/Admin Polish P2 is production-promoted on `main` (commit `a97c764`):
    - catalog management usability improved: add item form is clearer with helper copy explaining reusable catalog purpose and future-selection behavior
    - edit fields clarity improved: disclosure control is labeled "Edit fields" with better form layout and spacing
    - price and unit display now grouped together in a single table column for easier scanning
    - activate/deactivate controls now have color-coded buttons (red for deactivating, green for activating) with helpful tooltips and helper text clarifying behavior:
      - deactivation prevents future selection and does not mutate historical invoice lines
      - activation enables the item in future selections
    - empty state messaging clarified with actionable guidance
    - P1 clarity fully preserved: Starter, Custom, Active, Inactive, and Deferred placeholder status remain emphasized for normal operators
    - V1/V2 terminology remains intentionally hidden from normal admin-facing labels and page content
    - follow-up cleanup was promoted in `987af81` and removed internal-facing/backfill implementation language from the normal admin page
    - no admin backfill button/control was added; operator-run tooling boundary remains intact
    - Pricebook remains reusable catalog/default pricing truth, not operational truth
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by Pricebook/Admin Polish P2
  - no business logic, seed definitions, or backfill behavior changed by Pricebook/Admin Polish P2
  - safe-equivalent existing-account backfill tooling is production-promoted on `main` (commit `41d5dae`):
    - exact active legacy/different-seed-key equivalents are safely skipped when signature matches (`item_name`, `category`, `unit_label`, `item_type`)
    - unsafe/ambiguous collisions remain blocking by default
    - existing rows are never updated or mutated by backfill
  - controlled sandbox existing-account V3 backfill was completed successfully for account owner `6e93b2f7-1509-4a39-87e5-6558497f2157`:
    - pre-apply dry-run confirmed: `would_insert_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - apply result confirmed: `inserted_count = 96`, `skipped_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - post-apply dry-run confirmed terminal state: `would_insert_count = 0`, `would_skip_existing_seed_key_count = 96`, `would_skip_existing_equivalent_count = 1`, `possible_collision_count = 0`, `errors = []`
    - existing V1 `R-410A` row was not duplicated
    - sandbox admin UI now shows `109` Pricebook items
  - Pricebook/Admin Polish P3 is production-promoted on `main` (commit `4446af3`):
    - admin Pricebook catalog now supports search and category navigation on the normal admin page
    - combined filtering is available across status/source plus search/category
    - clear-filters behavior, filtered count summary, and filtered empty-state guidance are now present
    - normal admin page still does not expose V1/V2/V3 implementation labels and does not include backfill controls
  - existing-account backfill remains operator-controlled and dry-run-first; no automatic or batch backfill behavior exists
  - no production data was touched for existing-account V3 backfill closeout
  - Pricebook remains reusable catalog/default pricing truth, not operational truth
  - no invoice/payment/Stripe/QBO/Visit Scope/service-workflow behavior changed by safe-equivalent tooling or Pricebook/Admin Polish P3
- Launch-readiness polish catch-up is complete for current scope:
  - Service/Visit Scope clarity pass is complete, including clearer Service Details vs Visit Scope guidance and clearer Job Title fallback copy.
  - Invoice job-detail TLC pass is complete, including scanability improvements and explicit truth language that payments are tracking-only entries (no card charge execution).
  - Internal invoice draft prefill fallback hardening is complete where source fields exist, without overwriting existing drafts.
  - Address state capture/wiring is complete on relevant intake/finalization paths, including contractor intake proposal state persistence and downstream billing-state prefill support where captured.
  - Internal invoice void recovery/replacement behavior is complete: voided invoices remain historical, do not satisfy billed-truth closeout, and replacement draft flow exists as the active billing path.
  - Invoice report wording polish is complete: Send Status and Payment Count labels are now the launch wording targets.
  - Completed production-shipped cleanup batch (notifications/calendar/UI/ECC) is now part of the current baseline:
    - proposal unread-awareness cleanup, proposal/notification card identity restoration, and proposal-note boundary preservation are complete
    - calendar details/identity/no-tech visibility/filtering/inspector-default behavior cleanup is complete
    - unified calendar drag/drop behavior is complete without introducing technician-assignment ownership changes
    - date-display formatting polish, login password show/hide toggle, and aging counters on Failed/Need Info surfaces are complete
    - ECC refrigerant Photo Taken attestation path and Asbestos duct-leakage override suggestion are complete with existing truth boundaries preserved
  - These polish slices did not introduce payment execution, Stripe checkout, card charge flows, refunds/disputes, payouts, QBO sync, or RLS model changes.
- Out-of-box readiness / business identity / settings packaging now has Admin Readiness / Setup Checklist V1 complete at the current baseline:
  - readiness is a read-only derived packaging layer over existing tenant/account data (no new truth table)
  - setup-progress completion is gated by user-reviewed timestamps on `internal_business_profiles.profile_reviewed_at` and `internal_business_profiles.team_reviewed_at`, not merely by provisioned foundation rows
  - newly provisioned standard accounts now show `0 of 5 complete` on first login until admins review company profile and team setup
  - required readiness criteria currently include company name, support email, support phone, billing mode, and at least one active internal user after the relevant review steps are completed
  - optional readiness criteria currently include company logo, contractor directory, and platform account status visibility
  - this does not introduce a broad tenant settings system and does not alter onboarding implementation boundaries
  - closeout status: this roadmap area is complete enough to close at the current baseline with Admin Readiness V1 and First Owner Provisioning V1 implemented
  - public `/signup` self-serve onboarding is implemented and functionally smoked for fresh-email onboarding
  - duplicate/existing-email public messaging remains intentionally neutral
  - operator first-owner runbook path remains active/manual fallback, including internal/comped owner provisioning
  - `/ops/admin/internal-users` normal launch UI no longer exposes the Link existing auth user panel; Invite teammate, team setup confirmation, and team member management remain the normal admin surface
  - Stripe Platform Subscription V1 for platform onboarding is implemented and live-smoke confirmed for the platform-account subscription slice
- Pre-launch priority ordering update:
  - Stripe Platform Subscription V1 for new account users/platform onboarding is implemented and live-smoke confirmed for the platform-account subscription slice.
  - Live rollout prerequisites for that slice are complete: live keys, live webhook endpoint, and final live-mode smoke.
  - This priority remains separate from tenant customer invoice payment execution.
  - Tenant customer invoice payment execution remains deferred unless explicitly pulled forward.
  - Live Pay Now/Charge Card/checkout/refunds/disputes/payout execution remains deferred.
- Completed RLS / permission hardening slices for the current stabilized baseline now include customer/location internal account-owner reconciliation, notifications internal-awareness write-path hardening, targeted internal same-account job/service-case mutation boundary hardening, internal same-account job-detail operational mutation boundary hardening, internal same-account pending-info release / re-evaluate mutation boundary hardening, internal same-account service closeout mutation boundary hardening, internal same-account contractor report preview/send boundary hardening, internal job attachments / attachment-storage account-scope hardening, internal job attachments read/download account-scope boundary hardening, internal ECC test-run account-scope hardening, internal job_equipment / job_systems account-scope hardening, internal same-account lifecycle/scheduling mutation boundary hardening, contractor CRUD mutation boundary hardening, staffing / job assignment mutation boundary hardening, job contractor relink mutation boundary hardening, customer standalone mutation boundary hardening, legacy job-detail entrypoint mutation boundary hardening, internal invoice mutation boundary hardening, internal notification read-state mutation boundary hardening, internal user/admin identity mutation boundary hardening, dispatch calendar account-scope read boundary hardening, contractor intake adjudication mutation boundary hardening, dispatch calendar block mutation boundary hardening, admin job terminal mutation boundary hardening, contractor portal intake proposal visibility and collaboration boundary hardening, customer profile upsert mutation boundary hardening, contractor admin edge mutation boundary hardening, contractor invite acceptance membership boundary hardening, and internal business profile mutation boundary hardening:
  - jobs and service_cases were already ahead on account-owner-aware internal read scope
  - customers and locations are now reconciled to that same internal account-owner model for internal same-account teammates
  - validated passed for customer list, customer detail, internal `/jobs/new` guided lookup, and location detail for non-owner internal teammates
  - customer/location visibility no longer depends primarily on admin/manual scope reconstruction for those internal reads
  - targeted internal job-detail mutation surfaces no longer rely on `user is internal` alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted internal operational mutations proceed
  - cross-account internal mutation is denied on the targeted hardened paths
  - the completed targeted mutation-boundary slice covers visit scope mutation and service contract / linked service-case mutation
  - internal same-account job-detail operational mutation boundary hardening is also complete
  - targeted internal `/jobs/[id]` ops-lane mutations no longer rely on `user is internal` alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted ops-lane mutations proceed
  - cross-account internal mutation is denied on the targeted ops-lane hardened paths
  - the completed targeted ops-lane mutation-boundary slice covers resolve failure by correction review, mark certs complete, mark invoice complete, update job ops details, update job ops state, mark field complete, and customer contact attempt logging
  - this was a targeted internal job-detail operational mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
  - internal same-account pending-info release / re-evaluate mutation boundary hardening is also complete
  - targeted internal `/jobs/[id]` release / re-evaluate form entrypoints no longer rely on `user is internal` alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted release/re-evaluate mutations proceed
  - cross-account internal mutation is denied on the targeted release/re-evaluate hardened paths
  - the completed targeted release/re-evaluate mutation-boundary slice covers `releasePendingInfoAndRecomputeFromForm` and `releaseAndReevaluateFromForm`
  - this was a targeted release/re-evaluate ops-lane mutation-boundary slice, not a full jobs/job_events permission-model rewrite
  - internal same-account service closeout mutation boundary hardening is also complete
  - targeted internal `/jobs/[id]` service closeout actions no longer rely on internal-user membership alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted service closeout mutations proceed
  - cross-account internal mutation is denied on the targeted service closeout hardened paths
  - the completed targeted service closeout mutation-boundary slice covers `markServiceComplete` and `markInvoiceSent`
  - denied targeted service closeout paths do not write `jobs`, `service_cases`, or `job_events`
  - contractor authority was not expanded in this targeted service closeout slice
  - this was a targeted service closeout mutation-boundary slice, not a full jobs/service_cases/job_events permission-model rewrite
  - internal same-account contractor report preview/send boundary hardening is also complete
  - targeted internal contractor report preview/send paths no longer rely on internal-user membership alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted contractor report actions proceed
  - cross-account internal access is denied on the targeted contractor report paths
  - the completed targeted contractor-report boundary slice covers `generateContractorReportPreview` and `sendContractorReport`
  - denied targeted contractor-report paths do not write `jobs` or `job_events`
  - denied targeted contractor-report paths do not enqueue or send contractor-report notifications/emails
  - contractor authority was not expanded in this targeted contractor-report slice
  - this was a targeted contractor-report boundary hardening slice, not a full jobs/job_events permission-model rewrite
  - targeted internal attachment flows no longer rely on broad internal access alone for the hardened paths
  - same-account scope is now explicitly asserted before targeted internal attachment/storage mutations proceed
  - cross-account internal attachment/storage access is denied on the targeted hardened paths
  - the completed targeted attachment/account-scope slice covers upload-token issuance, finalize upload, discard upload, and share-to-contractor
  - matching attachment/storage policy reconciliation was completed for this seam
  - this was a targeted internal attachment/account-scope slice, not a full attachment subsystem rewrite
  - internal job attachments read/download account-scope boundary hardening is also complete
  - the internal attachments read/download page no longer relies on internal auth plus implicit row filtering alone for the hardened path
  - one explicit same-account internal scoped-job preflight is now asserted before any attachment row read proceeds on the internal attachments page
  - one explicit same-account internal scoped-job preflight is now asserted before signed URL generation proceeds on the internal attachments page
  - cross-account internal access is denied before attachment row read on the targeted read/download path
  - cross-account internal access is denied before signed URL generation on the targeted read/download path
  - non-internal access is denied before attachment row read on the targeted read/download path
  - non-internal access is denied before signed URL generation on the targeted read/download path
  - the completed targeted internal attachment read/download boundary slice covers the `app/jobs/[id]/attachments/page.tsx` route
  - contractor redirect behavior to portal remains intact
  - this was a targeted internal attachment read/download route-boundary slice, not a full attachment subsystem rewrite and not the end of broader RLS hardening
  - targeted ECC test-run mutation paths no longer rely on broad internal access alone for the hardened paths
  - same-account scope is now explicitly asserted before targeted ECC mutations proceed
  - cross-account internal ECC mutation is denied on the targeted hardened paths
  - the completed targeted ECC truth/account-scope slice covers override update, add test run, delete test run, and a representative ECC test-save path
  - matching `ecc_test_runs` policy reconciliation was completed for this seam
  - this was a targeted ECC truth/account-scope slice, not a full ECC subsystem rewrite or full ECC permission-model completion
  - targeted internal equipment/system mutation paths no longer rely on broad internal access alone for the hardened paths
  - same-account scope is now explicitly asserted before the targeted equipment/system mutations proceed
  - cross-account internal equipment/system mutation is denied on the targeted hardened paths
  - the completed targeted equipment/system account-scope slice covers add equipment, update equipment, delete equipment, and coupled system creation, reuse, and orphan delete behavior inside those flows
  - matching `job_equipment` / `job_systems` policy reconciliation was completed for this seam
  - this was a targeted equipment/system account-scope slice, not a full equipment/system domain rewrite or full equipment/system permission-model completion
  - internal same-account lifecycle/scheduling mutation boundary hardening is also complete
  - targeted lifecycle/scheduling actions no longer rely on internal-user membership alone for the hardened paths
  - same-account scope is now explicitly asserted before targeted lifecycle/scheduling mutations proceed
  - cross-account internal mutation is denied on the targeted lifecycle/scheduling hardened paths
  - the completed targeted lifecycle/scheduling mutation-boundary slice covers `advanceJobStatusFromForm`, `revertOnTheWayFromForm`, and `updateJobScheduleFromForm`
  - denied targeted lifecycle/scheduling paths do not write `jobs` or `job_events`
  - denied targeted schedule paths do not enqueue or send customer/contractor scheduling emails
  - contractor authority was not expanded in this targeted lifecycle/scheduling slice
  - this was a targeted lifecycle/scheduling mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
  - contractor CRUD mutation boundary hardening is also complete
  - targeted contractor mutation paths no longer rely on incomplete or inconsistent app-layer owner checks for the hardened paths
  - same-account internal scope is now explicitly asserted before targeted contractor mutations proceed
  - cross-account internal mutation is denied on the targeted contractor mutation paths
  - the completed targeted contractor CRUD mutation-boundary slice covers `updateContractorFromForm` and legacy `createContractorFromForm`
  - denied targeted contractor CRUD paths do not write contractor records
  - contractor authority was not expanded in this targeted contractor CRUD slice
  - this was a targeted contractor CRUD mutation-boundary slice, not a full contractor subsystem rewrite and not the end of broader RLS hardening
  - staffing / job assignment mutation boundary hardening is also complete
  - targeted staffing mutation paths no longer rely on internal-user membership plus plain job existence checks alone for the hardened paths
  - same-account internal scope is now explicitly asserted before targeted staffing mutations proceed
  - cross-account internal mutation is denied on the targeted staffing mutation paths
  - the completed targeted staffing / job assignment mutation-boundary slice covers `assignJobAssigneeFromForm`, `setPrimaryJobAssigneeFromForm`, and `removeJobAssigneeFromForm`
  - denied targeted staffing paths do not write `job_assignments`
  - denied targeted staffing paths do not write staffing-related `job_events`
  - assignable-user validation now runs inside actor account scope for the hardened staffing paths
  - matching `job_assignments` account-scope reconciliation was completed for this seam
  - contractor authority was not expanded in this targeted staffing slice
  - this was a targeted staffing / job assignment mutation-boundary slice, not a full staffing subsystem rewrite and not the end of broader RLS hardening
  - job contractor relink mutation boundary hardening is also complete
  - the targeted contractor relink path no longer relies on internal-user membership plus plain job read/update flow alone for the hardened path
  - same-account scope is now explicitly asserted before the targeted contractor relink mutation proceeds
  - cross-account internal mutation is denied on the targeted contractor relink path
  - the completed targeted job contractor relink mutation-boundary slice covers `updateJobContractorFromForm`
  - denied targeted contractor relink paths do not write `jobs`
  - denied targeted contractor relink paths do not write `job_events`
  - forged cross-account `contractor_id` targets are denied before write on the hardened path
  - contractor authority was not expanded in this targeted contractor relink slice
  - this was a targeted job contractor relink mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
  - customer standalone mutation boundary hardening is also complete
  - targeted customer standalone mutation paths no longer rely on internal-membership checks plus direct row mutation alone for the hardened paths
  - same-account customer scope is now explicitly asserted before the targeted customer standalone mutations proceed
  - cross-account internal mutation is denied on the targeted customer standalone paths
  - the completed targeted customer standalone mutation-boundary slice covers `archiveCustomerFromForm` and `updateCustomerNotesFromForm`
  - denied targeted customer standalone paths do not write `customers`
  - contractor authority was not expanded in this targeted customer standalone slice
  - this was a targeted customer standalone mutation-boundary slice, not a full customer subsystem rewrite and not the end of broader RLS hardening
  - contractor authority was not expanded, and this was not a full jobs/service_cases RLS rewrite
  - contractor customer/location visibility remains constrained, read-only, and job-derived
  - notifications remain account-owner-scoped for internal awareness
  - the generic `42501 -> service-role` fallback was removed from the internal awareness notification write path
  - contractor-originated or mixed-context internal awareness notifications now use one explicit, policy-aligned write contract
  - internal notification read boundaries remain internal-only; contractors still do not get direct read access to internal notifications
  - Report Center account-scope read/export boundary hardening is also complete
  - targeted Report Center read/export surfaces now assert explicit account-scoped data boundaries for the hardened report paths
  - report jobs/KPI paths now scope job reads by account contractor IDs where applicable
  - service case continuity report paths now scope service case reads by account customer IDs where applicable
  - closeout follow-up report paths now apply the account-owner scope that was already accepted but not fully used
  - dashboard report read model now scopes both jobs and internal invoice reads to the account boundary
  - targeted CSV/export report paths were included in this Report Center boundary pass
  - empty account-scope lists now use sentinel-safe behavior to prevent accidental fetch-all outcomes on hardened report reads
  - focused seam coverage was added for same-account allow, cross-account exclusion/deny, empty scope behavior, and invoice billing-mode honesty
  - targeted seam tests passed: 15/15
  - full suite passed: 284/284
  - TypeScript build passed with `npx tsc --noEmit`
  - browser smoke test passed after implementation
  - this was a targeted Report Center read/export boundary hardening slice, not a Report Center redesign, not a KPI logic redesign, not a billing expansion, not payment execution work, not QBO work, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
  - reporting truth boundaries remain locked: `jobs` / `jobs.ops_status` = operational truth/projection, `service_cases` = continuity truth, `job_events` = audit/activity truth, `internal_invoices` = billed truth for internal-invoicing mode, and `payments` = collected truth only when materially implemented
  - external-billing companies must not be treated as if internal invoice/payment records exist
  - reporting remains owner-family split and must not collapse operational, billed, and collected truth
  - internal job-detail read boundary hardening for `app/jobs/[id]/page.tsx` is also complete
  - the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before main job-detail read assembly
  - the main internal job detail page now asserts an explicit same-account internal scoped-job preflight before attachment signed URL generation performed from that page
  - cross-account internal access is denied before job-detail read assembly on the targeted path
  - cross-account internal access is denied before main-page attachment signed URL generation on the targeted path
  - denied signed URL paths do not call signed URL generation
  - contractor enumeration used by the internal job detail page is scoped to the current internal account owner
  - existing contractor/login redirect behavior was preserved
  - existing mutation behavior was not changed
  - focused seam tests were added for same-account allow, cross-account deny, non-internal behavior preservation, signed URL deny-before-call behavior, and contractor enumeration scoping
  - targeted seam tests passed: 7/7
  - full suite passed: 291/291
  - TypeScript build passed with `npx tsc --noEmit`
  - browser smoke test passed after implementation
  - this was a targeted internal job-detail read-boundary slice, not a `/jobs/[id]` UI redesign, not a job-detail mutation rewrite, not an attachment subsystem rewrite, not a Report Center change, not a billing expansion, not payment execution work, not QBO work, not a role redesign, not a support-access model, not a broad RLS rewrite, and not the end of broader RLS / permission hardening
  - jobs / jobs.ops_status remain operational truth / operational projection
  - service_cases remain continuity truth
  - job_events remain audit/activity truth
  - internal_invoices remain billed truth for internal-invoicing mode
  - payments remain collected truth only when materially implemented
  - contractor authority was not expanded
  - reporting and billing boundaries remain unchanged
  - no role redesign, support-access model, payment work, billing work, broader notifications UX/polish work, or broad portal/contractor authority expansion was part of these slices
- Completed billing hardening slices for the current stabilized baseline include:
  - the external-billing split-brain closeout fix: the supported `Mark Invoice Sent -> Closed` path writes the lightweight billed-truth marker before supported closeout
  - billing-truth read-side normalization: internal-invoicing closeout/report/dashboard/ops readers derive billed truth from the internal invoice domain, while external-billing readers preserve lightweight job-level invoice-action meaning
  - invoice-required counter/label normalization: invoice-required metrics and messaging derive from billing-aware invoice-needed truth rather than raw `jobs.ops_status = invoice_required`
  - external-billing secondary-field unification: `data_entry_completed_at` is aligned across supported lightweight external-billing completion paths, while `invoice_number` remains owned by the explicit data-entry path and is not invented by lightweight action buttons
- These completed slices do not broaden payment execution, do not change internal-invoicing billed truth ownership, and do not change roadmap order.
- Formal closeout review completed for the RLS / permission hardening milestone against live repo evidence and the active hardening ledger.
- Required live access-surface families were reviewed across internal mutations, reads, attachments/signing, ECC flows, equipment/system, lifecycle/scheduling, contractor/customer/location surfaces, invoicing, report exports, notification read-state, identity/admin, dispatch/calendar, intake/adjudication/portal collaboration, server route handlers, and dormant app-local action cleanup.
- Targeted seam hardening coverage is confirmed complete for the milestone-defined families.
- App-local orphan cleanup is confirmed complete for the dormant job-detail action file removal.
- No concrete remaining live permission seam was proven in the closeout review.
- Broad global normalization of all admin-client/service-role usage remains intentionally deferred outside this milestone closeout scope.
- Broad global completion of every notification/email side-effect path remains intentionally deferred outside this milestone closeout scope.
- This milestone is now formally closed at the targeted seam-hardening level.
- This closeout does not imply role redesign, support-access redesign, payment execution work, billing expansion, UI redesign, or a broad cross-domain RLS rewrite.
- Payment P1 foundation is closed at the current baseline under the locked direction in Section 19.
- Payment execution remains deferred; payment readiness is by design to support future adoption without forced redesign.

Reporting / analytics milestone baseline now includes:
- Report Center as the internal reporting home
- Dashboard as the default Report Center landing surface
- Jobs Report as the visit-level operational ledger
- Service Cases Report as the continuity/service-case ledger
- Closeout Report as the visit-owned closeout/follow-up ledger
- Invoices Report as the billed-truth invoice ledger
- export support through report-family ledgers, with dashboard export following honest underlying report surfaces
- lightweight dashboard view controls
- KPI foundation and KPI reference/validation support retained as internal scaffolding
- KPI Reference removed from normal Report Center navigation while remaining accessible by direct URL
- `/reports` routing to Dashboard by default, with Jobs Report moved to `/reports/jobs` and compatibility handling preserved for prior filtered jobs-report links

Reporting / analytics baseline is complete enough for the current milestone; remaining work is minor polish/hardening only.

The next natural roadmap area is:
- Pricebook V1 post-promotion refinement from the current production-complete C1B/C1C baseline
- Estimates/quoting V1A-V1J is implemented as internal-only guarded baseline; production rollout remains deferred

Pre-launch enablement priority track (separate from product-track sequencing):
- Stripe enablement for new account users/platform onboarding is elevated for pre-launch readiness.
- Live smoke is now confirmed complete for that platform-account subscription slice.
- This does not move tenant customer invoice payment execution into current scope.

Roadmap guardrail for this next area:
- Payment P1 foundation is already closed at the current baseline.
- Payments remain payment-ready by design, not payment-active.
- Platform account subscription billing execution is live for the onboarding slice; tenant Stripe/customer payment execution remains deferred unless explicitly pulled forward.
- This does not imply QBO dependency.

Current clarification:
- RLS / permission hardening milestone is formally closed at the targeted seam-hardening level
- payment P1 foundation closeout is complete at the current baseline
- out-of-box readiness / business identity / settings packaging closeout is complete at the current baseline
- the active product-track roadmap area is Pricebook V1 continuation (with C1B/C1C production-complete, production-promoted, and production-smoke confirmed)
- estimates/quoting V1A-V1J is implemented for guarded internal baseline and remains intentionally non-production-live
- V1I is documented as decision/planning artifact only (Option B first; Option A later after gates) and does not change current production-disabled posture
- Work Items terminology alignment is complete and already documented; Job/Visit Scope/Work Items wording now matches the current model across validated internal and contractor-facing surfaces.
- Internal `/jobs/[id]` responsiveness batch is complete for this pass with deferred secondary sections now in place for:
  - attachments
  - follow-up/customer-attempt history
  - service-chain detail body/history
  - add-assignee selector/form
  - timeline/shared/internal narrative bodies
- Internal invoice secondary-detail deferral is complete for this pass:
  - immediate billing/closeout truth remains first-paint
  - full invoice detail/lines/delivery/payment/pricebook panel data streams later
- Customer-attempt summary deferral is complete:
  - measured first-paint `customerAttemptSummary` is now `0ms`
  - contact actions remain immediate
  - no false "0 attempts" display is shown
  - Follow-Up History remains authoritative and deferred
- Timeline summary first-paint softening is complete:
  - blocking 200-row `job_events` parent read was removed from first paint
  - shared/internal notes and timeline header counts/latest-date subtitles were replaced with neutral "loads below" copy
  - `DeferredTimelineBody`, `DeferredSharedNotesBody`, and `DeferredInternalNotesBody` remain authoritative and still read `job_events` after streaming
  - `ContractorReportPanel` generate/send behavior is unchanged; first-paint contractor response labels were display-softened only
- Contact-attempt path cleanup is complete for this pass:
  - redundant unconditional calendar revalidation was removed
  - job revalidation and return-to revalidation behavior remains preserved
  - contact-attempt writes, follow-up updates, banner behavior, and `tab=ops` continuity remain preserved
- Local diagnostic timing instrumentation exists and is intentionally env-gated:
  - `CONTACT_ATTEMPT_TIMING_DEBUG`
  - `JOB_DETAIL_TIMING_DEBUG`
  - these flags are benchmarking diagnostics only and should remain disabled unless intentionally profiling
- Measured responsiveness improvement from this batch (representative):
  - `serviceCaseServiceChainReads`: about `5966ms` -> about `291ms`
  - post-contact total job-detail render: about `21826ms` -> about `4510ms`
  - `assignmentDisplayMapAssignableUsers`: about `716-947ms` -> about `256-362ms`
  - post-contact render follow-up: about `4510-4529ms` -> about `3911ms`
  - warm render follow-up: about `3451ms` -> about `2999ms`
- Latest practical `/jobs/[id]` local smoke baseline:
  - steady-state renders commonly around ~1.45-2.47s
  - `timelineSummary` usually around ~183-384ms after softening
  - `customerAttemptSummary` stayed `0ms`
  - cold/backend/Supabase variance can still cause spikes
- Remaining performance backlog:
  - `mainJobRead`/`eccPayloadReads` can still spike
  - `assignmentDisplaySummary` can spike
  - `serviceChainSummary` can spike
  - invoice truth/detail split should continue to be monitored
  - broader backend/read variance remains future audit territory
  - high-frequency contact actions still need ongoing measured attention where they feel slow
- Next speed work should continue as measured slices (not broad refactors), with likely near-term targets:
  - `/ops` first impression
  - `/jobs/new`
  - calendar
  - reports
  - safe partial-settle patterns
  - contact-action settle path and granular refresh/revalidation mapping
  - further parent render slimming on `/jobs/[id]`
- Guardrails for performance work remain locked:
  - do not chase speed by weakening truth
  - no optimistic final status/action state without explicit approval
  - do not trim revalidation without dependency mapping
  - do not touch invoice/billing/payment performance paths casually; require a separate billing-safe audit
  - use audit -> small slice -> benchmark -> commit -> docs update
  - use Codex for higher-risk dependency mapping and diff review
  - use VS Agent for surgical implementation
  - keep ChatGPT sequencing guardrails/prompts/review
- customer/location internal account-owner reconciliation is complete inside that milestone
- notifications internal-awareness write-path hardening is also complete inside that milestone
- targeted internal same-account job/service-case mutation boundary hardening is also complete inside that milestone
- internal same-account job-detail operational mutation boundary hardening is also complete inside that milestone
- internal same-account pending-info release / re-evaluate mutation boundary hardening is also complete inside that milestone
- internal same-account service closeout mutation boundary hardening is also complete inside that milestone
- internal same-account contractor report preview/send boundary hardening is also complete inside that milestone
- internal job attachments / attachment-storage account-scope hardening is also complete inside that milestone
- internal job attachments read/download account-scope boundary hardening is also complete inside that milestone
- internal ECC test-run account-scope hardening is also complete inside that milestone
- internal job_equipment / job_systems account-scope hardening is also complete inside that milestone
- internal same-account lifecycle/scheduling mutation boundary hardening is also complete inside that milestone
- contractor CRUD mutation boundary hardening is also complete inside that milestone
- staffing / job assignment mutation boundary hardening is also complete inside that milestone
- job contractor relink mutation boundary hardening is also complete inside that milestone
- customer standalone mutation boundary hardening is also complete inside that milestone
- legacy job-detail entrypoint mutation boundary hardening is also complete inside that milestone
- internal invoice mutation boundary hardening is also complete inside that milestone
- internal notification read-state mutation boundary hardening is also complete inside that milestone
- internal user/admin identity mutation boundary hardening is also complete inside that milestone
- dispatch calendar account-scope read boundary hardening is also complete inside that milestone
- contractor intake adjudication mutation boundary hardening is also complete inside that milestone
- dispatch calendar block mutation boundary hardening is also complete inside that milestone
- admin job terminal mutation boundary hardening is also complete inside that milestone
- contractor portal intake proposal visibility and collaboration boundary hardening is also complete inside that milestone
- customer profile upsert mutation boundary hardening is also complete inside that milestone
- contractor admin edge mutation boundary hardening is also complete inside that milestone
- contractor invite acceptance membership boundary hardening is also complete inside that milestone
- internal business profile mutation boundary hardening is also complete inside that milestone
- internal intake create mutation boundary hardening is also complete inside that milestone
- internal job-detail customer / notes / data-entry mutation boundary confirmation hardening is also complete inside that milestone
- internal ECC save / save-complete mutation boundary confirmation hardening is also complete inside that milestone
- targeted legacy job-detail mutation entrypoints no longer rely on missing or incomplete server-side actor/scope enforcement on the hardened paths
- same-account scope is now explicitly asserted before the targeted legacy job-detail mutations proceed
- cross-account internal access is denied before write on the targeted legacy job-detail paths
- non-internal access is denied before write on the targeted legacy job-detail paths
- denied targeted legacy job-detail paths do not write `jobs` or `job_events`
- the generic low-level `updateJob` helper was safely reduced to internal-only/non-exported usage
- this was a targeted legacy job-detail mutation-boundary slice, not a full jobs/job_events permission-model rewrite and not the end of broader RLS hardening
- these completions are limited to targeted internal mutation-boundary slices (including the `/jobs/[id]` ops-lane job-detail slice, targeted release/re-evaluate slice, targeted service closeout slice, and targeted contractor-report preview/send slice), attachment/account-scope hardening, ECC truth/account-scope hardening, and equipment/system account-scope hardening, not a full jobs/service_cases/job_events, attachment, ECC, or equipment/system permission-model rewrite
- targeted lifecycle/scheduling mutation-boundary hardening now also covers `advanceJobStatusFromForm`, `revertOnTheWayFromForm`, and `updateJobScheduleFromForm` with same-account assertion and cross-account denial before mutation
- targeted contractor CRUD mutation-boundary hardening now also covers `updateContractorFromForm` and legacy `createContractorFromForm` with same-account assertion and cross-account denial before mutation
- targeted staffing / job assignment mutation-boundary hardening now also covers `assignJobAssigneeFromForm`, `setPrimaryJobAssigneeFromForm`, and `removeJobAssigneeFromForm` with same-account assertion and cross-account denial before mutation
- targeted job contractor relink mutation-boundary hardening now also covers `updateJobContractorFromForm` with same-account assertion, cross-account denial, and forged cross-account `contractor_id` denial before mutation
- targeted customer standalone mutation-boundary hardening now also covers `archiveCustomerFromForm` and `updateCustomerNotesFromForm` with same-account customer assertion and cross-account denial before mutation
- targeted internal invoice mutation-boundary hardening now also covers `createInternalInvoiceDraftFromForm`, `saveInternalInvoiceDraftFromForm`, `issueInternalInvoiceFromForm`, `voidInternalInvoiceFromForm`, `addInternalInvoiceLineItemFromForm`, `updateInternalInvoiceLineItemFromForm`, `removeInternalInvoiceLineItemFromForm`, and `sendInternalInvoiceEmailFromForm` with same-account scoped-job preflight assertion and cross-account/non-internal denial before mutation or side effects
- denied targeted internal invoice paths do not write `internal_invoices`, `internal_invoice_line_items`, `jobs`, `job_events`, or `notifications`, and do not send invoice email side effects
- targeted internal notification read-state mutation-boundary hardening now also covers `listInternalNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`, and `getInternalUnreadNotificationCount` with explicit same-account internal notification scope assertion and cross-account/non-internal denial/exclusion on targeted notification read-state paths
- denied targeted notification read-state mark paths do not write `notifications` when access is denied
- targeted internal identity/admin mutation-boundary hardening now also covers `createInternalUserFromForm`, `updateInternalUserRoleFromForm`, `activateInternalUserFromForm`, `deactivateInternalUserFromForm`, `inviteInternalUserFromForm`, `deleteInternalUserFromForm`, `updateInternalUserProfileFromForm`, `resendInternalInviteFromForm`, `sendPasswordResetFromForm`, `resendContractorInviteFromForm`, and `inviteContractorUserFromForm` with explicit same-account target preflight assertion and cross-account/non-internal denial before mutation or side effects
- denied targeted internal identity/admin paths do not write `internal_users` and do not trigger `inviteUserByEmail`, `resetPasswordForEmail`, or `inviteContractor` side effects when access is denied
- targeted dispatch calendar read-boundary hardening now also covers the central dispatch dataset path in `calendar-actions.ts` with explicit same-account scope assertion before dataset assembly and cross-account exclusion on returned jobs, downstream `job_events`, and downstream assignment expansion
- non-internal access is denied before dispatch calendar dataset assembly proceeds on the hardened path
- this was a targeted dispatch calendar read-boundary slice, not a calendar UI redesign, not a calendar block mutation pass, and not the end of broader RLS hardening
- targeted dispatch calendar block mutation-boundary hardening now also covers `createCalendarBlockEventFromForm`, `updateCalendarBlockEventFromForm`, and `deleteCalendarBlockEventFromForm` with one explicit same-account internal mutation boundary before targeted calendar block writes proceed
- cross-account and non-internal access are denied before write on the targeted calendar block mutation paths
- denied targeted calendar block mutation paths do not write `calendar_events`
- this was a targeted calendar block mutation-boundary slice, not a calendar UI redesign, not a dispatch dataset rewrite, and not the end of broader RLS hardening
- targeted admin terminal job mutation-boundary hardening now also covers `archiveJobFromForm` and `cancelJobFromForm` with one explicit admin + same-account scoped-job preflight before the targeted terminal job write phases proceed
- cross-account admin, non-admin internal, and non-internal access are denied before write on the targeted admin terminal job mutation paths
- denied targeted archive paths do not write `jobs`
- denied targeted cancel paths do not write `jobs` or `job_events`
- this was a targeted admin terminal job mutation-boundary slice, not a general jobs/job_events permission-model rewrite, and not the end of broader RLS hardening
- contractor portal intake proposal visibility and collaboration boundary hardening is also complete
- live contractor-facing proposal list/detail/comment paths no longer rely on page-local contractor filtering plus elevated admin reads/writes alone for the hardened paths
- one explicit contractor-scoped proposal access boundary is now asserted before targeted elevated proposal visibility/collaboration flows proceed
- cross-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- non-contractor access is denied before targeted elevated read/write on the hardened proposal paths
- denied targeted proposal paths do not proceed into elevated proposal row reads
- denied targeted proposal paths do not proceed into elevated proposal comment reads/writes
- denied targeted proposal paths do not proceed into elevated proposal attachment reads
- the hardened contractor portal proposal paths cover proposal list visibility, proposal detail visibility, and the contractor proposal addendum/comment collaboration path
- this was a targeted contractor portal proposal visibility/collaboration boundary slice, not a contractor portal UX redesign, not a contractor intake adjudication redesign, and not the end of broader RLS hardening
- customer profile upsert mutation boundary hardening is also complete
- `upsertCustomerProfileFromForm` no longer relies on internal-only access plus downstream update flow alone for the hardened path
- one explicit same-account customer mutation preflight is now asserted before canonical customer write or downstream job snapshot sync proceeds on the targeted upsert path
- cross-account internal access is denied before write on the targeted upsert path
- non-internal access is denied before write on the targeted upsert path
- denied targeted upsert paths do not write `customers`
- denied targeted upsert paths do not write downstream `jobs` snapshot fields
- this was a targeted customer profile upsert mutation-boundary slice, not a broader customer subsystem rewrite, not a snapshot-model rewrite, and not the end of broader RLS hardening
- contractor admin edge mutation boundary hardening is also complete
- the remaining live contractor admin edge mutation entrypoints no longer rely on partial or incomplete admin/owner checks alone for the hardened paths
- one explicit same-account contractor mutation preflight is now asserted before targeted contractor admin edge writes proceed
- cross-account internal/admin access is denied before write on the targeted edge paths
- non-internal access is denied before write on the targeted edge paths
- denied targeted edge paths do not write contractor records
- the hardened contractor admin edge entrypoints cover `updateContractorNameAndEmailFromForm` and `createQuickContractorFromForm`
- this was a targeted contractor admin edge mutation-boundary slice, not a contractor subsystem rewrite, not a contractor invite redesign, and not the end of broader RLS hardening
- contractor invite acceptance membership boundary hardening is also complete
- the live contractor invite acceptance membership path no longer relies on elevated invite/membership reads-writes plus fallback-by-email behavior alone for the hardened path
- one explicit scoped acceptance preflight is now asserted before contractor membership creation or invite-acceptance mutation proceeds on the targeted acceptance path
- preferred acceptance resolution is auth-user-first where available
- legacy fallback-by-email is now constrained to deterministic single-scope acceptance only
- ambiguous invite scope is denied before write on the hardened acceptance path
- invalid or unsafe cross-scope acceptance is denied before write on the hardened acceptance path
- denied targeted acceptance paths do not write `contractor_users`
- denied targeted acceptance paths do not write `contractor_invites`
- the hardened targeted acceptance path covers `ensureContractorMembershipFromInvite` and the live set-password acceptance handoff behavior that uses that path
- this was a targeted contractor invite acceptance membership-boundary slice, not a broader auth redesign, not a contractor invite issuance/resend redesign, and not the end of broader RLS hardening
- internal business profile mutation boundary hardening is also complete
- the live internal business profile save path no longer relies on elevated profile/storage mutation flow alone for the hardened path
- one explicit scoped business-profile mutation preflight is now asserted before profile upsert or storage mutation proceeds on the targeted path
- cross-account or invalid-scope access is denied before write on the targeted path
- non-admin/non-internal access is denied before write on the targeted path
- denied targeted business-profile paths do not write `internal_business_profiles`
- denied targeted business-profile paths do not perform storage upload/remove mutations
- the hardened targeted business-profile path covers `saveInternalBusinessProfileFromForm` and the live admin company-profile form path that uses it
- this was a targeted internal business profile mutation-boundary slice, not a broader business-identity redesign, not tenant-settings expansion, and not the end of broader RLS hardening
- internal intake create mutation boundary hardening is also complete
- `createJobFromForm` no longer relies on broad downstream create flow alone for internal intake creation on the hardened path
- one explicit owner-scoped internal intake create preflight is now asserted before canonical create/link mutation or downstream side effect proceeds on the targeted intake-create path
- cross-account or invalid-scope internal access is denied before write on the targeted intake-create path
- non-internal access is denied before write on the targeted intake-create path
- contractor-authorized intake behavior was preserved without authority expansion
- denied targeted intake-create paths do not write `customers`, `locations`, `jobs`, or `job_events`
- denied targeted intake-create paths do not trigger downstream notifications/emails tied to the blocked create flow
- this was a targeted internal intake create mutation-boundary slice, not a `/jobs/new` redesign, not a contractor intake redesign, and not the end of broader RLS hardening
- internal job-detail customer / notes / data-entry mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]` customer / notes / data-entry mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `updateJobCustomerFromForm`, `addPublicNoteFromForm`, `addInternalNoteFromForm`, and `completeDataEntryFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal scoped-job boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted cluster
- cross-account internal deny is now explicitly proven for that targeted cluster
- non-internal deny is now explicitly proven for that targeted cluster
- denied targeted cluster paths do not write `jobs` or `job_events`
- denied `completeDataEntryFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- this was a targeted internal job-detail customer / notes / data-entry seam-proof confirmation slice, not a `/jobs/[id]` redesign, not an ECC redesign, and not the end of broader RLS hardening
- internal ECC save / save-complete mutation boundary confirmation hardening is also complete
- the remaining live internal `/jobs/[id]/tests` ECC save / save-complete mutation entrypoints now have explicit seam-proof coverage on the hardened path
- the targeted confirmed entrypoints are `saveRefrigerantChargeDataFromForm`, `saveAirflowDataFromForm`, `completeEccTestRunFromForm`, `saveAndCompleteDuctLeakageFromForm`, `saveAndCompleteAirflowFromForm`, and `saveAndCompleteRefrigerantChargeFromForm`
- those targeted entrypoints were confirmed to already route through the shared same-account internal ECC scoped boundary on the hardened path
- same-account internal allow is now explicitly proven for that targeted ECC cluster
- cross-account internal deny is now explicitly proven for that targeted ECC cluster
- non-internal deny is now explicitly proven for that targeted ECC cluster
- denied targeted ECC cluster paths do not write `ecc_test_runs`
- denied `completeEccTestRunFromForm` paths do not advance downstream ops-projection-changing behavior on the blocked path
- denied `completeEccTestRunFromForm` paths do not advance retest-resolution/job-event behavior where reachable on the blocked path
- this was a targeted internal ECC save / save-complete seam-proof confirmation slice, not an ECC redesign, not a `/jobs/[id]/tests` redesign, and not the end of broader RLS hardening
- targeted contractor intake adjudication mutation-boundary hardening now also covers `finalizeContractorIntakeSubmissionFromForm`, `rejectContractorIntakeSubmissionFromForm`, and `markContractorIntakeSubmissionAsDuplicateFromForm` with one explicit same-account adjudication preflight before targeted write phases proceed
- cross-account and non-internal access are denied before write on the targeted contractor intake adjudication paths
- denied targeted contractor intake adjudication paths do not write `contractor_intake_submissions`, `customers`, `locations`, `jobs`, or `job_events`
- this was a targeted contractor intake adjudication mutation-boundary slice, not a contractor intake UX redesign, not a contractor portal redesign, and not the end of broader RLS hardening
- this completion does not mean payment execution is live, and does not mean checkout/processor behavior was added
- this completion does not mean the full broader invoice/billing permission model is finished across every possible path
- this completion does not mean the full broader notification/messaging permission model is finished across every possible path
- this completion does not mean the full broader internal identity/admin permission model is finished across every possible path
- this completion does not mean the full broader calendar/dispatch permission model is finished across every possible path
- this completion does not mean the full broader contractor intake/intake-review permission model is finished across every possible path
- this completion does not mean contractor portal UX redesign was done
- this completion does not mean contractor intake adjudication redesign was done
- this completion does not mean contractor portal redesign was done
- this completion does not mean contractor invite redesign was done
- this completion does not mean contractor invite issuance/resend redesign was done
- this completion does not mean customer/location redesign was done
- this completion does not mean snapshot-model rewrite was done
- this completion does not mean the full broader auth/identity lifecycle model is finished across every possible path
- this completion does not mean business-identity redesign was done
- this completion does not mean tenant-settings expansion was done
- this completion does not mean the full broader intake permission model is finished across every possible path
- this completion does not mean `/jobs/new` workflow redesign was done
- this completion does not mean `/jobs/[id]` workflow redesign was done
- this completion does not mean `/jobs/[id]/tests` workflow redesign was done
- this completion does not mean ECC redesign was done
- this completion does not mean the full broader ECC workflow/permission model is finished across every possible path
- this completion does not mean every possible future jobs/job_events operational mutation hardening item is complete; broader/global security normalization remains deferred future work outside the closed targeted RLS / permission hardening milestone
- the targeted RLS / permission hardening milestone is formally closed at the seam-hardening level; broader/global security normalization remains deferred future work
- this completion does not mean every possible future jobs/job_events operational mutation hardening item is complete; broader/global security normalization remains deferred future work outside the closed targeted RLS / permission hardening milestone
- the targeted RLS / permission hardening milestone is formally closed at the seam-hardening level; broader/global security normalization remains deferred future work
- this completion does not mean the full broader contractor permission model is finished across every possible path
- this completion does not mean the full broader staffing permission model is finished across every possible path
- this completion does not mean the full broader customer permission model is finished across every possible path
- this completion does not mean every possible future jobs/job_events operational mutation hardening item is complete; broader/global security normalization remains deferred future work outside the closed targeted RLS / permission hardening milestone
- the targeted RLS / permission hardening milestone is formally closed at the seam-hardening level; broader/global security normalization remains deferred future work

This stays aligned to the current roadmap order already in the spine while accurately marking reporting as no longer the active incomplete milestone.

20.4 Current locked clarifications

1. on_the_way rule

on_the_way is a field lifecycle state only and must never be written to ops_status.

2. retest_needed closure

retest_needed is not an active production target state in the current ECC model.

Current ECC retest flow is governed by:
- failed parent historical truth
- pending_office_review internal review stage where applicable
- retest child job creation for revisit/retest work
- paperwork_required/invoice_required/closed closeout progression as resolver-driven outcomes

Implementation rule:
- New writes must not set jobs.ops_status to retest_needed.
- Existing historical retest_needed rows may be read for compatibility during transition cleanup.
- Active behavioral model should treat retest_needed as legacy compatibility-only, not a forward state.

3. Customer Support / Remote Assistance (V1A/V1B/V1C)

Current confirmed state:
- V1A support-access foundation is implemented, committed, and pushed on `main`.
- V1A includes:
  - `support_users`
  - `support_account_grants`
  - `support_access_sessions`
  - `support_access_audit_events`
  - support access resolver + support audit helper
  - DB-level session/grant/account consistency invariant
- V1A migration is applied to sandbox only.
- Production support-access migration/apply remains intentionally deferred.
- V1C feature exposure guard is implemented and fail-closed: `ENABLE_SUPPORT_CONSOLE` must be explicitly enabled to expose support console routes/actions.
- Production `ENABLE_SUPPORT_CONSOLE` remains intentionally unset/false.
- No production support access is live.

V1B status:
- V1B support console shell is implemented, committed, and sandbox-smoked.
- Sandbox smoke confirmed denied/start/end audit behavior (`access_denied`, `session_started`, `session_ended`).
- Support Console hardening slice H1-H5 is implemented:
  - active `support_user` is required before support console page-shell render
  - non-support admins are redirected back to `/ops/admin/users` with a support-user-required notice
  - start/end action entry points enforce active `support_user` parity
  - support session start requires human-entered reason; reason is stored in audit metadata (`operator_reason`)
  - scoped account load writes `account_viewed` audit event with short-window dedupe
  - notice handling is polished for support console unavailable and support-user-required flows on `/ops/admin/users`

Locked support boundaries:
- support sessions are read-only only
- support access requires explicit `support_user` + active grant + active session
- support sessions are account-owner scoped
- audit events are required
- support start reason is required for audit quality
- no impersonation/login-as-customer behavior
- no tenant job/customer/invoice browsing surface yet
- no support mutation behavior yet
- no support-side operational writes
- no customer-facing support actions
- no broad tenant browsing expansion

Parked/deferred production enablement decision:
- Support V1 architecture is complete enough to park; this is not unfinished architecture.
- Production enablement is intentionally deferred pending better timing and explicit rollout need.
- Do not proceed now with production support migration apply, production support seeding, or production feature-flag enablement.
- H1-H5 hardening implementation does not change deferment: production migration apply, production feature flag enablement, production support-user/grant setup, controlled smoke, and rollback rehearsal remain explicit later approvals.
- Execution-controlled runbook is documented at `docs/ACTIVE/Support_Console_Production_Enablement_Runbook.md` and must be committed before any production support-console action.

Keep-ready rollout checklist (later, explicit approval only):
- production migration approval
- production `support_user` seed
- one read_only grant
- explicit `ENABLE_SUPPORT_CONSOLE` enablement
- controlled smoke
- rollback by disabling `ENABLE_SUPPORT_CONSOLE`

Deferred-later support rollout items:
- production rollout decision remains explicit and deferred
- production migration timing remains explicit and deferred
- production feature exposure / route visibility decision remains open
- tenant/customer-facing support grant visibility remains later
- read-only account overview remains later
- support mutation remains a much later explicit decision, if ever

21. Usage Rule for Future Threads

When starting future work:

Use this spine as the current operational truth.
Distinguish clearly between:
core engine completeness
UX polish
deferred future modules
unresolved model decisions
Do not relabel a UX gap as a missing backend system.
Do not introduce new source-of-truth layers without explicit approval.
Preserve additive architecture and environment discipline.

22. One-Line Definition

Compliance Matters Software is a stabilized, event-driven operational system for compliance and service workflows, with complete scheduling and staffing foundations, strong auditability, completed payment-ready foundation, deferred live payment execution, and future-ready business-layer expansion.

23. Supporting document:
For detailed payment implementation direction, use:
`docs/ACTIVE/Compliance_Matters_Payments_Roadmap.md`

This roadmap is subordinate to the Active Spine. If code or planning detail conflicts with the spine, the spine wins.
