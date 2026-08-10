# EveryStep FieldWorks — SMS Tenant Self-Serve Provisioning Lane (Planning)

Status: ACTIVE planning/model spec — committed future lane, not started
Authority: Subordinate to docs/ACTIVE/SMS_Provider_Twilio_Readiness_Spec.md and docs/CURRENT_ROADMAP.md
Mode: Documentation/model only (no implementation approved by this document)
Date: 2026-08-06
Owner decision: automated tenant SMS onboarding is ON the roadmap for certain (Lane 7); concierge
is the interim operating procedure until the lane starts.

---

## 1) Problem

Every tenant needs their own Twilio phone number + A2P 10DLC brand/campaign (carrier rule: texts
must come from a number registered to that business; a shared platform number is a compliance
violation and breaks inbound tenant routing, which matches the receiving number against
`sms_sender_identities.phone_e164`). Today that provider-side setup is manual per tenant. The
app side is already fully tenant-generic: setup CRUD, consent provisioning, backfill, activation,
webhooks, and send gates all work per account with zero code changes.

## 2) Interim operating procedure — concierge checklist (per new tenant)

Platform operator performs once per tenant that wants SMS:

1. Collect from tenant: legal business name, EIN, business address, contact, website, expected
   monthly volume. (These are A2P brand registration inputs.)
2. Twilio console: buy a local number in the tenant's area code (~$1.15/mo).
3. Create a Messaging Service for the tenant; add the number to its Sender Pool.
4. Register the A2P brand (tenant's business identity), then an operational/customer-care
   campaign under it with the on-the-way sample message (include STOP language). Opt-in
   description: customers provide their phone number when booking service. Wait for carrier
   approval (days).
5. Messaging Service Integration settings: inbound webhook →
   `https://app.compliancemattersca.com/api/sms/twilio/inbound` (POST); delivery status callback →
   `.../api/sms/twilio/status-callback`. Keep default Opt-Out Management ON.
6. Hand the tenant admin: Messaging Service SID (MG…) + their number. They complete Provider
   Setup on `/ops/admin/communications` (config, sender identity + attestation, sandbox gate,
   test recipient), run one sandbox smoke, then Activate live SMS. Optionally run the Legacy
   Customer SMS Backfill.

Cost note for pricing: ~$2–11/mo per tenant (number + campaign fees) plus per-segment charges,
starting only when the tenant is provisioned. Fold into tier pricing or an SMS add-on.

## 3) Target end-state (the lane): "Enable texting" wizard

Tenant self-serve flow, no platform-operator involvement:

1. Tenant admin opens Enable Texting; enters business identity fields (EIN, legal name, address,
   contact, volume estimate) and accepts messaging terms.
2. Platform automates via Twilio APIs: (a) optional subaccount per tenant, (b) number search +
   purchase in tenant's area code, (c) Messaging Service creation + sender pool + webhook
   configuration, (d) TrustHub brand registration, (e) campaign registration with locked
   operational sample messages.
3. Provider config + sender identity rows are written automatically with
   `provider_brand_ref` / `provider_campaign_ref` / `provider_registration_ref` /
   `provider_sender_ref` (columns already exist on `sms_sender_identities` for exactly this).
4. Registration status polls/webhooks drive readiness_status transitions
   (`registration_pending` → `ready_for_sandbox`); tenant is notified on approval or rejection
   (rejection surfaces carrier feedback + edit-and-resubmit).
5. Tenant runs the existing sandbox smoke + attestation activation flow unchanged.

## 4) Model locks (decided now to keep the lane cheap later)

- One number + one campaign per tenant; never shared senders.
- The existing account-scoped schema is the contract — the lane fills refs the schema already
  reserves; no new send-path behavior.
- Sandbox smoke + attested activation remain required even for automated onboarding.
- Billing: provisioning must be gated on an entitlement/paid add-on check before any Twilio spend
  is incurred on the tenant's behalf.
- Failure states are first-class: number purchase failure, brand rejection, campaign rejection,
  and stuck-pending must each have a visible tenant-facing status and a retry/edit path.
- Review-request/marketing campaigns remain a separate future registration class with express
  opt-in; this lane covers the operational campaign only.

## 5) Trigger to start the lane

Concierge remains the plan of record until tenant demand makes it a bottleneck (rule of thumb:
around the fifth tenant requesting SMS, or when onboarding SLA matters for GTM). Prerequisites
when starting: Twilio ISV account posture review, TrustHub API access, and the pricing decision
for the SMS add-on.

## 6) Twilio references

- TrustHub / A2P registration APIs: https://www.twilio.com/docs/trust-hub
- A2P 10DLC ISV onboarding: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/isv-standard-campaign-registration-overview
- Subaccounts: https://www.twilio.com/docs/iam/api/subaccounts
- Messaging Services API: https://www.twilio.com/docs/messaging/services/api
- Phone number provisioning: https://www.twilio.com/docs/phone-numbers/api
