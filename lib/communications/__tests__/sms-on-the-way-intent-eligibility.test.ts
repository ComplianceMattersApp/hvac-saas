import { describe, expect, it, vi } from "vitest";

import { evaluateOnTheWayIntentEligibility } from "@/lib/communications/sms-on-the-way-intent-eligibility";

type JobFixture = {
  id: string;
  status: string;
  customer_id: string;
  service_case_id: string | null;
  customers: { owner_user_id: string } | Array<{ owner_user_id: string }> | null;
};

type JobEventFixture = {
  id: string;
  job_id: string;
  event_type: string;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

type RecipientFixture = {
  id: string;
  account_owner_user_id: string;
  linked_entity_type: string;
  linked_entity_id: string;
  display_name: string;
  phone_e164: string | null;
  phone_last10: string | null;
  email: string | null;
  recipient_role: string;
  status: string;
  preferred_contact_method: string;
  recipient_timezone: string | null;
  source_type: string;
  source_ref: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  deactivated_at: string | null;
  deactivated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ConsentFixture = {
  account_owner_user_id: string;
  contact_recipient_id: string;
  message_class: string;
  consent_status: string;
};

type SuppressionFixture = {
  account_owner_user_id: string;
  contact_recipient_id: string | null;
  phone_e164: string | null;
  suppression_type: string;
  is_active: boolean;
};

type TemplateFixture = {
  id: string;
  account_owner_user_id: string;
  template_key: string;
  message_class: string;
  display_name: string;
  lifecycle_status: string;
  current_version_id: string | null;
  sandbox_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type VersionFixture = {
  id: string;
  account_owner_user_id: string;
  sms_message_template_id: string;
  template_key: string;
  message_class: string;
  version_number: number;
  version_label: string | null;
  body_template: string;
  detected_tokens: string[];
  unknown_tokens: string[];
  token_policy_version: string;
  content_classification: string;
  version_status: string;
  internal_review_status: string;
  legal_review_status: string;
  provider_review_status: string;
  created_at: string;
  updated_at: string;
};

type ProviderConfigurationFixture = {
  id: string;
  account_owner_user_id: string;
  provider_name: string;
  provider_environment: string;
  provider_account_ref: string | null;
  default_messaging_service_ref: string | null;
  readiness_status: string;
  activation_status: string;
  callback_status_readiness: string;
  inbound_webhook_readiness: string;
  status_callback_readiness: string;
  advanced_opt_out_readiness: string;
  created_at: string;
  updated_at: string;
};

type SenderIdentityFixture = {
  id: string;
  account_owner_user_id: string;
  provider_configuration_id: string;
  sender_type: string;
  sender_display_label: string;
  phone_last4: string | null;
  provider_sender_ref: string | null;
  messaging_service_ref: string | null;
  registration_type: string;
  provider_brand_ref: string | null;
  provider_campaign_ref: string | null;
  provider_registration_ref: string | null;
  verification_status: string;
  activation_status: string;
  created_at: string;
  updated_at: string;
};

function makeJob(input: Partial<JobFixture> & { id: string }): JobFixture {
  const { id, ...rest } = input;

  return {
    id,
    status: "on_the_way",
    customer_id: "customer-1",
    service_case_id: "service-case-1",
    customers: { owner_user_id: "owner-1" },
    ...rest,
  };
}

function makeJobEvent(input: Partial<JobEventFixture> & { id: string }): JobEventFixture {
  const { id, ...rest } = input;

  return {
    id,
    job_id: "job-1",
    event_type: "on_my_way",
    created_at: "2026-05-15T12:00:00Z",
    meta: null,
    ...rest,
  };
}

function makeRecipient(input: Partial<RecipientFixture> & { id: string }): RecipientFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    linked_entity_type: "customer",
    linked_entity_id: "customer-1",
    display_name: "Taylor Customer",
    phone_e164: "+15551234567",
    phone_last10: "5551234567",
    email: "taylor@example.com",
    recipient_role: "customer_primary",
    status: "active",
    preferred_contact_method: "sms",
    recipient_timezone: "America/Chicago",
    source_type: "manual",
    source_ref: null,
    notes: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    deactivated_at: null,
    deactivated_by_user_id: null,
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T09:00:00Z",
    ...rest,
  };
}

function makeConsent(input: Partial<ConsentFixture> & { contact_recipient_id: string }): ConsentFixture {
  const { contact_recipient_id, ...rest } = input;

  return {
    account_owner_user_id: "owner-1",
    contact_recipient_id,
    message_class: "on_the_way",
    consent_status: "opted_in",
    ...rest,
  };
}

function makeSuppression(
  input: Partial<SuppressionFixture> &
    ({ contact_recipient_id: string; phone_e164?: string | null } | { phone_e164: string; contact_recipient_id?: string | null }),
): SuppressionFixture {
  return {
    account_owner_user_id: "owner-1",
    contact_recipient_id: input.contact_recipient_id ?? null,
    phone_e164: input.phone_e164 ?? null,
    suppression_type: "manual_suppression",
    is_active: true,
    ...input,
  };
}

function makeTemplate(input: Partial<TemplateFixture> & { id: string }): TemplateFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    template_key: "on_the_way",
    message_class: "on_the_way",
    display_name: "On-The-Way Notification",
    lifecycle_status: "active",
    current_version_id: null,
    sandbox_version_id: "version-1",
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T09:00:00Z",
    ...rest,
  };
}

function makeVersion(input: Partial<VersionFixture> & { id: string }): VersionFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    sms_message_template_id: "template-1",
    template_key: "on_the_way",
    message_class: "on_the_way",
    version_number: 1,
    version_label: "v1",
    body_template:
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.",
    detected_tokens: ["recipient_first_name", "operator_or_tech_name", "company_name"],
    unknown_tokens: [],
    token_policy_version: "v1",
    content_classification: "operational",
    version_status: "approved_for_sandbox",
    internal_review_status: "approved",
    legal_review_status: "not_requested",
    provider_review_status: "not_requested",
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T09:00:00Z",
    ...rest,
  };
}

function makeProviderConfiguration(
  input: Partial<ProviderConfigurationFixture> & { id: string },
): ProviderConfigurationFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    provider_name: "twilio",
    provider_environment: "sandbox",
    provider_account_ref: "AC123",
    default_messaging_service_ref: "MG123",
    readiness_status: "ready_for_sandbox",
    activation_status: "disabled",
    callback_status_readiness: "not_configured",
    inbound_webhook_readiness: "not_configured",
    status_callback_readiness: "not_configured",
    advanced_opt_out_readiness: "not_configured",
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T09:00:00Z",
    ...rest,
  };
}

function makeSenderIdentity(input: Partial<SenderIdentityFixture> & { id: string }): SenderIdentityFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    provider_configuration_id: "provider-1",
    sender_type: "sandbox",
    sender_display_label: "Sandbox Sender",
    phone_last4: "4567",
    provider_sender_ref: "PN123",
    messaging_service_ref: "MG123",
    registration_type: "none",
    provider_brand_ref: null,
    provider_campaign_ref: null,
    provider_registration_ref: null,
    verification_status: "verified",
    activation_status: "disabled",
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T09:00:00Z",
    ...rest,
  };
}

function makeSupabase(fixtures?: {
  jobs?: JobFixture[];
  jobEvents?: JobEventFixture[];
  recipients?: RecipientFixture[];
  consents?: ConsentFixture[];
  suppressions?: SuppressionFixture[];
  templates?: TemplateFixture[];
  versions?: VersionFixture[];
  providerConfigurations?: ProviderConfigurationFixture[];
  senderIdentities?: SenderIdentityFixture[];
}) {
  const jobs = fixtures?.jobs ?? [];
  const jobEvents = fixtures?.jobEvents ?? [];
  const recipients = fixtures?.recipients ?? [];
  const consents = fixtures?.consents ?? [];
  const suppressions = fixtures?.suppressions ?? [];
  const templates = fixtures?.templates ?? [];
  const versions = fixtures?.versions ?? [];
  const providerConfigurations = fixtures?.providerConfigurations ?? [];
  const senderIdentities = fixtures?.senderIdentities ?? [];

  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const tables: Record<string, any[]> = {
    jobs,
    job_events: jobEvents,
    contact_recipients: recipients,
    contact_recipient_consents: consents,
    contact_recipient_suppressions: suppressions,
    sms_message_templates: templates,
    sms_message_template_versions: versions,
    sms_provider_configurations: providerConfigurations,
    sms_sender_identities: senderIdentities,
  };

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });

      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      const orderFilters: Array<[string, boolean]> = [];
      let limitValue: number | null = null;

      const getRows = () => {
        let data: any[] = [...(tables[table] ?? [])];

        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row?.[column] === value);
        }

        for (const [column, values] of inFilters) {
          data = data.filter((row) => values.includes(row?.[column]));
        }

        for (const [column, ascending] of orderFilters) {
          data.sort((left, right) => {
            const leftValue = left?.[column];
            const rightValue = right?.[column];

            if (leftValue === rightValue) return 0;
            if (leftValue === undefined || leftValue === null) return 1;
            if (rightValue === undefined || rightValue === null) return -1;
            if (typeof leftValue === "number" && typeof rightValue === "number") {
              return ascending ? leftValue - rightValue : rightValue - leftValue;
            }

            const comparison = String(leftValue).localeCompare(String(rightValue));
            return ascending ? comparison : comparison * -1;
          });
        }

        if (limitValue !== null) {
          data = data.slice(0, limitValue);
        }

        return { data, error: null };
      };

      const query: any = {
        select: vi.fn(() => {
          calls.push({ table, op: "select" });
          return query;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          calls.push({ table, op: "eq", column, value });
          eqFilters.push([column, value]);
          return query;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          calls.push({ table, op: "in", column, value: values });
          inFilters.push([column, values]);
          return query;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          calls.push({ table, op: "order", column, value: options?.ascending ?? true });
          orderFilters.push([column, options?.ascending ?? true]);
          return query;
        }),
        limit: vi.fn((value: number) => {
          calls.push({ table, op: "limit", value });
          limitValue = value;
          return query;
        }),
        insert: vi.fn(() => {
          calls.push({ table, op: "insert" });
          throw new Error("Unexpected insert");
        }),
        update: vi.fn(() => {
          calls.push({ table, op: "update" });
          throw new Error("Unexpected update");
        }),
        delete: vi.fn(() => {
          calls.push({ table, op: "delete" });
          throw new Error("Unexpected delete");
        }),
        then: (
          onFulfilled: (value: { data: any[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(getRows()).then(onFulfilled, onRejected),
      };

      return query;
    },
  };

  return { supabase, calls };
}

describe("sms on-the-way intent eligibility helper", () => {
  it("blocks missing account, job, and event inputs before any query", async () => {
    const { supabase, calls } = makeSupabase();

    const missingAccount = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(missingAccount.decisionStatus).toBe("blocked");
    expect(missingAccount.blockedReasons).toEqual(["missing_account_scope"]);

    const missingJob = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "",
      jobEventId: "event-1",
    });

    expect(missingJob.blockedReasons).toEqual(["missing_job_id"]);

    const missingEvent = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "",
    });

    expect(missingEvent.blockedReasons).toEqual(["missing_job_event_id"]);
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("blocks when scoped job is missing", async () => {
    const { supabase } = makeSupabase();

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.decisionStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["job_not_found"]);
  });

  it("blocks when scoped job event is missing", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.blockedReasons).toEqual(["job_event_not_found"]);
  });

  it("skips non on_my_way events", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [makeJobEvent({ id: "event-1", event_type: "schedule_updated" })],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.decisionStatus).toBe("skipped");
    expect(result.eligibleForIntent).toBe(false);
    expect(result.blockedReasons).toEqual(["job_event_not_on_the_way"]);
  });

  it("blocks when job is no longer on_the_way", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1", status: "in_progress" })],
      jobEvents: [makeJobEvent({ id: "event-1" })],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.blockedReasons).toEqual(["job_not_currently_on_the_way"]);
  });

  it("blocks when a later on_the_way_reverted event exists", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [
        makeJobEvent({ id: "event-1", created_at: "2026-05-15T12:00:00Z" }),
        makeJobEvent({ id: "event-2", event_type: "on_the_way_reverted", created_at: "2026-05-15T12:05:00Z" }),
      ],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.blockedReasons).toEqual(["job_on_the_way_reverted"]);
  });

  it("blocks when no contact_recipient exists for the scoped customer", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [makeJobEvent({ id: "event-1" })],
      recipients: [],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.blockedReasons).toEqual(["recipient_missing"]);
  });

  it("surfaces consent and suppression blocks", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [makeJobEvent({ id: "event-1" })],
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1", consent_status: "revoked" })],
      suppressions: [makeSuppression({ contact_recipient_id: "recipient-1" })],
      templates: [makeTemplate({ id: "template-1" })],
      versions: [makeVersion({ id: "version-1" })],
      providerConfigurations: [makeProviderConfiguration({ id: "provider-1" })],
      senderIdentities: [makeSenderIdentity({ id: "sender-1" })],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.decisionStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["recipient_suppressed", "recipient_consent_blocked"]);
    expect(result.recipientReady).toBe(true);
    expect(result.consentReady).toBe(false);
  });

  it("blocks when template is missing", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [makeJobEvent({ id: "event-1" })],
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      providerConfigurations: [makeProviderConfiguration({ id: "provider-1" })],
      senderIdentities: [makeSenderIdentity({ id: "sender-1" })],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.blockedReasons).toEqual(["template_missing"]);
  });

  it("returns ready with sandbox template metadata and explicit deferred warnings", async () => {
    const { supabase, calls } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [makeJobEvent({ id: "event-1" })],
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      templates: [makeTemplate({ id: "template-1", sandbox_version_id: "version-1" })],
      versions: [makeVersion({ id: "version-1", version_number: 7 })],
      providerConfigurations: [makeProviderConfiguration({ id: "provider-1" })],
      senderIdentities: [makeSenderIdentity({ id: "sender-1" })],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.decisionStatus).toBe("ready");
    expect(result.eligibleForIntent).toBe(true);
    expect(result.messageClass).toBe("on_the_way");
    expect(result.templateKey).toBe("on_the_way");
    expect(result.templateVersion).toBe(7);
    expect(result.messageBodySnapshot).toContain("Hi Taylor, this is Alex with Your company.");
    expect(result.recipientRef).toBe("recipient-1");
    expect(result.providerReady).toBe(true);
    expect(result.templateReady).toBe(true);
    expect(result.recipientReady).toBe(true);
    expect(result.consentReady).toBe(true);
    expect(result.quietHoursReady).toBe(false);
    expect(result.liveSendEnabled).toBe(false);
    expect(result.warnings).toEqual([
      "quiet_hours_gate_deferred",
      "stop_help_readiness_deferred",
      "live_sms_activation_deferred",
    ]);
    expect(result).not.toHaveProperty("canSend");

    const touchedTables = Array.from(new Set(calls.filter((call) => call.op === "from").map((call) => call.table))).sort();
    expect(touchedTables).toEqual([
      "contact_recipient_consents",
      "contact_recipient_suppressions",
      "contact_recipients",
      "job_events",
      "jobs",
      "sms_message_template_versions",
      "sms_message_templates",
      "sms_provider_configurations",
      "sms_sender_identities",
    ]);
    expect(calls.some((call) => call.op === "insert" || call.op === "update" || call.op === "delete")).toBe(false);
  });

  it("blocks when provider readiness is missing", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [makeJobEvent({ id: "event-1" })],
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      templates: [makeTemplate({ id: "template-1" })],
      versions: [makeVersion({ id: "version-1" })],
      providerConfigurations: [],
      senderIdentities: [],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.decisionStatus).toBe("blocked");
    expect(result.blockedReasons).toEqual(["provider_not_ready", "sender_identity_not_ready"]);
    expect(result.providerReady).toBe(false);
  });

  it("keeps deferred live-send gates explicit while remaining non-sending", async () => {
    const { supabase } = makeSupabase({
      jobs: [makeJob({ id: "job-1" })],
      jobEvents: [makeJobEvent({ id: "event-1" })],
      recipients: [makeRecipient({ id: "recipient-1" })],
      consents: [makeConsent({ contact_recipient_id: "recipient-1" })],
      templates: [makeTemplate({ id: "template-1" })],
      versions: [makeVersion({ id: "version-1" })],
      providerConfigurations: [makeProviderConfiguration({ id: "provider-1" })],
      senderIdentities: [makeSenderIdentity({ id: "sender-1" })],
    });

    const result = await evaluateOnTheWayIntentEligibility({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobEventId: "event-1",
    });

    expect(result.liveSendEnabled).toBe(false);
    expect(result.warnings).toContain("quiet_hours_gate_deferred");
    expect(result.warnings).toContain("stop_help_readiness_deferred");
    expect(result.warnings).toContain("live_sms_activation_deferred");
    expect(result.blockedReasons).not.toContain("live_sms_activation_deferred");
  });
});