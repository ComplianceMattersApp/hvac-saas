# SLICE 04 — Twilio Self-Serve Tenant SMS Provisioning

You are a senior engineer working in the EveryStep FieldWorks repo (`hvac-saas`).
Read `docs/SLICES/SLICE-01-qbo-correctness.md` §1–§2 for repo orientation and the
standing rules — they bind this slice. Additionally, the **product authority for
this slice is the owner's own lane spec:
`docs/ACTIVE/SMS_Tenant_Self_Serve_Provisioning_Lane_Spec.md`** (read it in
full). Its model locks are non-negotiable: one number + one campaign per tenant,
never shared; the existing SMS schema is the contract; sandbox smoke + attested
activation still gate live sends; provisioning is entitlement-gated BEFORE any
Twilio spend; failure states are first-class UI states with retry/edit. This
document is the implementation contract on top of it. This is the largest slice
so far — a two-pass delivery like Slice 02 (honest partial report, then finish
before review) is acceptable; silent scope-shrink is not.

## 1. What exists today (verified)

- The entire Twilio client is one call: `sendTwilioSandboxMessage` in
  `lib/communications/twilio-messages-client.ts` (`POST /Messages.json`, HTTP
  Basic with env `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`). No provisioning
  APIs anywhere.
- Per-tenant config lives in `sms_provider_configurations` (readiness enum
  already reserves `registration_required|registration_pending|provider_review_required|rejected`
  — nothing writes them today) and `sms_sender_identities`
  (`provider_brand_ref`, `provider_campaign_ref`, `provider_registration_ref`
  exist and are never written; `registration_type` already supports
  `a2p_10dlc`). Setup actions live in
  `lib/actions/sms-provider-setup-actions.ts`; the admin surface is
  `app/ops/admin/communications/page.tsx`.
- Today "verification" is an honor-system checkbox that sets
  `verification_status='verified'` + `activation_status='active'`, and the
  live-activation attestations are checked but never persisted.
- All SMS tables are SELECT-only under RLS; writes go through service-role
  server actions gated by `requireInternalRole("admin")`. Keep that pattern.
- Webhook signatures (`lib/communications/twilio-webhook-signature.ts`) are
  validated against the single platform auth token.

## 2. Architecture decisions (made — implement as written)

**D1. One Twilio subaccount per tenant.** Twilio's ISV pattern, and brands
cannot be shared/moved across accounts later — starting under the parent
account locks in the wrong architecture. The subaccount SID is stored in the
existing `sms_provider_configurations.provider_account_ref` (reference only,
per its column comment).

**D2. Subaccount auth tokens are stored encrypted, in a dedicated table.**
Status callbacks for subaccount-sent messages are signed with the SUBACCOUNT's
token, so validation needs it. Mirror the QBO token pattern
(`lib/qbo/qbo-encryption.ts`): new table `sms_provider_subaccount_credentials`
(`account_owner_user_id` unique, `subaccount_sid`, `auth_token_encrypted`,
audit cols) — **no tenant SELECT policy at all**; service-role only. New env
`SMS_CREDENTIALS_ENCRYPTION_KEY` (32 bytes hex, same validation as
`QBO_ENCRYPTION_KEY`). This is a deliberate, documented amendment to the
"never store credentials" rule: the rule's intent (no tenant-readable secrets,
no plaintext) is preserved; per-subaccount webhook validation is impossible
without it.

**D3. Registration paths.** Primary: **A2P 10DLC, Low-Volume Standard brand**
(`SkipAutomaticSecVet=true` — $4.50 vs $46, ample throughput for on-the-way
volumes), local number. Fallback: **Sole Proprietor** for tenants without an
EIN (`BrandType=SOLE_PROPRIETOR`, OTP step, 1 number/campaign, T-Mobile
1,000 segments/day). The wizard branches on "Do you have an EIN?" — and a
registered LLC/corp must NOT go through sole prop (Twilio error 30915).
Toll-free verification is OUT of scope (EIN is required there too since
Jan 2026, and local numbers are preferred for on-the-way texts).

**D4. Entitlement gate v1 = owner allowlist.** Env
`ENABLE_SMS_SELF_SERVE_ACCOUNT_OWNER_IDS` (same pattern as
`ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS`, see
`lib/permits/permit-workflow-gate.ts`). This satisfies the lane spec's
"no Twilio spend without entitlement" lock with owner-per-tenant control;
a billing add-on replaces it in a later slice. Fee pass-through/pricing is a
business decision recorded in the lane spec, not this slice's code.

**D5. Status tracking v1 = polling cron, not Event Streams.** Event Streams
sinks must be configured per subaccount (real per-tenant setup cost); polling
`GET /v1/a2p/BrandRegistrations/{Sid}` and
`GET /v1/Services/{MS}/Compliance/Usa2p` is a documented, valid pattern. A
10-minute cron (follow the `vercel.json` + `app/api/cron/*` pattern) polls all
in-flight registrations. Event Streams is a named follow-up.

**D6. Real verification replaces the honor-system checkbox for wizard-provisioned
tenants.** When the campaign reaches `VERIFIED` and the number is attached to
the Messaging Service, the system itself writes
`sms_sender_identities.verification_status='verified'` and
`sms_provider_configurations.readiness_status='ready_for_activation'`. The
manual checkbox path remains for owner-concierge setups but its label must say
it is a manual attestation. Live activation (the 3-attestation step) is
UNCHANGED — provisioning ends at `ready_for_activation`, never `active`.

**D7. Mock mode for non-production.** `provider_environment='sandbox'`
registrations use `Mock=true` brands (and mock campaigns auto-follow), so the
whole state machine is exercisable in staging without TCR spend. Unit tests
mock the HTTP layer like `qbo-api-client` tests do.

## 3. Work units

### WU1 — Schema (one additive migration)

- New `sms_provisioning_registrations`: one active row per
  `account_owner_user_id`. Columns: business info (`legal_business_name`,
  `business_type`, `ein` (nullable — null means sole-prop path),
  `business_registration_number`, address fields, `website_url`,
  `business_industry`, authorized-rep name/email/phone/title), path
  (`registration_path IN ('a2p_lvs','a2p_sole_prop')`), Twilio refs as they're
  created (`subaccount_sid`, `customer_profile_sid`, `trust_product_sid`,
  `address_sid`, `brand_registration_sid`, `messaging_service_sid`,
  `phone_number_sid`, `phone_e164`, `campaign_sid`), per-step statuses
  (`customer_profile_status`, `trust_product_status`, `brand_status`,
  `brand_identity_status`, `campaign_status`, `number_status` — text columns
  mirroring Twilio's enums, CHECK-constrained), `last_error jsonb`,
  `last_polled_at`, `submitted_at`, `completed_at`, audit cols. RLS: **no
  tenant SELECT policy** (EIN lives here); all reads/writes via service-role
  actions that gate on `requireInternalRole("admin")` + the D4 allowlist.
- New `sms_provider_subaccount_credentials` per D2.
- `sms_provider_configurations`: add persisted activation attestations —
  `activation_attested_campaign_approved_at`, `activation_attested_wording_reviewed_at`,
  `activation_attested_stop_tested_at`, `activation_attested_by_user_id`
  (closes the "attestations aren't persisted" gap; write them in
  `activateSmsLiveSendingFromForm`).

### WU2 — Twilio provisioning client

New `lib/communications/twilio-provisioning-client.ts` (server-only), with the
same error-sanitization discipline as `twilio-messages-client.ts` (redact
`AC…`/tokens, truncate). Calls, in tenant-flow order:

1. Create subaccount (`POST /2010-04-01/Accounts.json`) → store SID +
   encrypted token (D2).
2. Search + purchase one local number in the subaccount
   (`AvailablePhoneNumbers/US/Local.json` with area-code preference from the
   tenant's dispatch address; `IncomingPhoneNumbers.json`).
3. Create Messaging Service (`POST messaging.twilio.com/v1/Services`) with
   inbound webhook `https://app.compliancemattersca.com/api/sms/twilio/inbound`
   and status callback `…/api/sms/twilio/status-callback` (URLs per the lane
   spec §concierge checklist; keep Advanced Opt-Out ON), attach the number to
   its sender pool.
4. TrustHub: Secondary Customer Profile (policy
   `RNdfbf3fae0e1107f8aded0e7cead80bf5`) with business-information EndUser
   (EIN path) or Starter Customer Profile (policy
   `RN806dd6cd175f314e1f96a9727ee271f4`, sole-prop path), authorized-rep
   EndUser, Address + SupportingDocument, EntityAssignments, **Evaluations
   preflight** (surface per-field failures to the form before submitting),
   then `Status=pending-review`.
5. A2P Messaging Profile TrustProduct (policy
   `RNb0d4771c2c98518d916a3d4cd70a8f8b`) with
   `us_a2p_messaging_profile_information` EndUser, assignments, evaluation,
   submit.
6. Brand registration (`POST messaging.twilio.com/v1/a2p/BrandRegistrations`)
   with `SkipAutomaticSecVet=true` (LVS) or `BrandType=SOLE_PROPRIETOR`;
   `Mock=true` when `provider_environment='sandbox'`. Sole-prop OTP resend
   endpoint (`…/SmsOtp`) exposed as an action.
7. Campaign (`POST /v1/Services/{MS}/Compliance/Usa2p`):
   `UsAppToPersonUsecase='LOW_VOLUME'`, `Description` and `MessageFlow` built
   from a reviewed template (MessageFlow is the #1 rejection field — describe
   exactly how customers consent when booking service), `MessageSamples` from
   the approved on-the-way template, opt-in/out/help keywords and messages,
   `PrivacyPolicyUrl`/`TermsAndConditionsUrl` pointing at the public `/privacy`
   and `/terms` pages (see `docs/ACTIVE/SMS_A2P_Legal_Implementation_Note.md` —
   registration data must match those disclosures).
8. Status reads for the poller: brand by SID, campaign by MS.

### WU3 — Wizard UI + orchestration actions

- New admin surface under `/ops/admin/communications` (own route, e.g.
  `/ops/admin/communications/provisioning`), visible only when the D4
  allowlist includes the account and no completed registration exists.
- Form pages: EIN branch question → business info (label the legal-name field
  "exactly as it appears on your IRS CP 575 / 147c letter" — EIN/name mismatch
  is Twilio failure #1, error 30795) → authorized rep → review & submit.
  Validation server-side; the TrustHub Evaluations preflight runs before
  submission and maps failures back to fields.
- Orchestration is **resumable steps recorded on the registration row**, not
  one mega-action: each step (subaccount → number → MS → profile → trust
  product → brand → campaign) advances independently, records refs/status, and
  a failed step renders as a first-class state with Retry (re-invoke) or Edit
  (back to form, resubmit via the update endpoints — brand resubmit is
  `POST …/BrandRegistrations/{Sid}` after fixing EndUser attributes; campaign
  fixes update the Usa2p resource). Known failure copy: newly issued EINs take
  30–90 days to appear in TCR's databases (advise waiting/retrying); sole-prop
  OTP pending (offer resend).
- Status panel: per-step progress with plain-language labels ("Waiting on
  carrier review — typically minutes for the brand, up to ~2 weeks for the
  campaign"), driving `sms_provider_configurations.readiness_status` through
  `registration_required → registration_pending → provider_review_required(on
  failure needing input) → ready_for_sandbox/ready_for_activation` and, on
  terminal rejection, `rejected`.

### WU4 — Poller + completion wiring

- Cron route (10-min cadence) polls in-flight registrations
  (`last_polled_at` ordering, never throws, per-row isolation like the QBO
  sweeps). On campaign `VERIFIED` + number attached: write
  `provider_brand_ref`, `provider_campaign_ref`, `provider_registration_ref`,
  `provider_sender_ref`, `phone_e164`, `messaging_service_ref` into
  `sms_sender_identities` + `sms_provider_configurations`
  (`default_messaging_service_ref`, `provider_account_ref`), set D6 statuses,
  notify the tenant admin (existing notifications system) and stamp
  `completed_at`.

### WU5 — Multi-account send + webhook validation

- `sendTwilioSandboxMessage` gains an optional `accountSid` (URL path) —
  resolved from `provider_account_ref`; absent → platform account exactly as
  today (existing tenants unchanged).
- Webhook routes: resolve the candidate account FIRST (inbound: match `To`
  against sender identities — already the routing key; status callback: look
  up the delivery row by `MessageSid`), then validate the signature with that
  account's token (platform env token when the tenant has no subaccount;
  decrypted subaccount token otherwise). Payload fields are used only to
  SELECT the key — trust is still established solely by the signature; wrong
  or missing key → 403 exactly as today. Add tests for both key paths.

### WU5b — Audience split on the communications admin page (owner requirement)

`/ops/admin/communications` currently shows every tenant admin the full
engineering console: Provider Setup (Sandbox) forms, raw MG/campaign SID
fields, template governance version machinery, the sandbox send queue, and the
compliance-readiness checklist. **Tenant admins must never see that.** Split
the page by audience:

- **Tenant admins see:** a status summary in plain language, the provisioning
  wizard entry/status (WU3), live activation with its attestations, the
  on-the-way template's current text (simple view), active suppressions
  (lift with reason), and sandbox test recipients. Nothing that asks for a
  SID, mentions Twilio by name in a form field, or exposes internal review
  machinery.
- **Advanced console sections render only for accounts in a new env allowlist
  `ENABLE_SMS_ADVANCED_CONSOLE_ACCOUNT_OWNER_IDS`** (same pattern as the
  self-serve gate; default: empty = hidden for everyone). The owner's own
  account goes in it so the existing concierge workflow keeps working
  unchanged. No functionality is deleted — it is gated.

### WU6 — Truth cleanup (small)

The hardcoded `communicationsStatus` / `activationSummary` /
`complianceChecklist` literals in `sms-provider-readiness-read.ts` predate live
SMS and now lie — confirmed on the live production page 2026-08-15: the
Activation Status section reads "SMS is not enabled. Live sends are disabled."
on the same page whose Live SMS Activation card shows LIVE, and the
Compliance Readiness checklist marks quiet-hours, webhook signature
validation, sandbox validation, and explicit activation as Deferred/Disabled
when all four are shipped and running. Derive activation summary,
communications status, and the checklist rows from actual row state; delete
any entry that cannot be derived rather than hardcoding it.

Also resolve, with evidence, the **template pointer question** observed live:
governance shows "No current governed template version is selected" and v2
only `approved_for_sandbox` with incomplete reviews, yet live sending is
active and intents render from "Template v2". Determine which version the
live send path actually reads (`current_version_id` vs `sandbox_version_id`
vs something else), make the governed pointer reflect reality (data fix
and/or code fix), and make the UI state impossible to contradict live-send
truth. Report what you found — this may be a real latent bug, not just copy.

## 4. Out of scope (named follow-ups)

Toll-free verification path · Event Streams sinks · billing add-on replacing
the allowlist · Twilio Compliance Embeddable (documented alternative if the
form flow proves heavy) · additional campaigns (review requests, marketing) ·
two-way conversations · migrating the platform owner's own existing manual
setup into a subaccount (it keeps working via the no-subaccount path).

## 5. Acceptance criteria

- [ ] Migration additive-only; EIN/credentials tables have NO tenant SELECT
      policies; nothing applied to a database by you.
- [ ] Allowlisted admin can complete the wizard end-to-end against
      `Mock=true` in sandbox: subaccount → number → MS → profile → trust
      product → brand → campaign, with each step's refs and statuses recorded
      on the registration row.
- [ ] Evaluations preflight failures render as field-level form errors before
      any TCR fee is incurred.
- [ ] A failed brand (simulate 30795) and a failed campaign each render as
      first-class states with working Edit + Retry paths.
- [ ] Poller drives statuses without throwing; completion writes all refs into
      the existing sender-identity/config columns and lands at
      `ready_for_activation` — never auto-activates live sending.
- [ ] Sole-prop path: no EIN collected, OTP resend action works, LLC attempting
      sole-prop surfaces the 30915 explanation.
- [ ] Sends and both webhooks work for BOTH a subaccount tenant and the
      existing no-subaccount platform setup (regression tests).
- [ ] Attestations persist on activation.
- [ ] Non-allowlisted accounts see no provisioning surface and can trigger no
      Twilio call.
- [ ] A tenant admin NOT in the advanced-console allowlist sees only the
      simple surfaces on `/ops/admin/communications` (status, wizard,
      activation, template text, suppressions, test recipients) — no SID
      fields, no governance machinery, no sandbox queue, no compliance
      checklist; an allowlisted account sees everything exactly as today.
- [ ] `npm run test` (pre-existing failures called out), `npm run build`,
      `tsc --noEmit` clean; lint delta explained.

## 6. Deliverable / report back

Branch `slice-04-twilio-provisioning`, no PR unless asked. Report in the
established format: files by group, full test/build output, deviations with
reasons, a manual QA script (mock-mode wizard run end-to-end, a forced brand
failure + edit/retry, webhook signature tests for both account paths), plus
open questions for Slice 05 (recurring visit generation). Flag explicitly any
Twilio API shape you find that differs from this spec's endpoints — the
research is current as of Aug 2026 but Twilio moves; verify against live docs
as you build, and say so in the report when you do.
