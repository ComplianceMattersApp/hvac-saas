import { describe, expect, it, vi } from "vitest";

import { getSmsProviderReadinessForAccount } from "@/lib/communications/sms-provider-readiness-read";

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
  phone_e164?: string | null;
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

function makeProviderConfiguration(
  input: Partial<ProviderConfigurationFixture> & { id: string },
): ProviderConfigurationFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    provider_name: "twilio",
    provider_environment: "production",
    provider_account_ref: null,
    default_messaging_service_ref: null,
    readiness_status: "draft",
    activation_status: "disabled",
    callback_status_readiness: "not_configured",
    inbound_webhook_readiness: "not_configured",
    status_callback_readiness: "not_configured",
    advanced_opt_out_readiness: "not_configured",
    created_at: "2026-05-15T10:00:00Z",
    updated_at: "2026-05-15T10:00:00Z",
    ...rest,
  };
}

function makeSenderIdentity(input: Partial<SenderIdentityFixture> & { id: string }): SenderIdentityFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    provider_configuration_id: "provider-1",
    sender_type: "long_code",
    sender_display_label: "Primary service line",
    phone_e164: "+15551234567",
    phone_last4: "4567",
    provider_sender_ref: null,
    messaging_service_ref: null,
    registration_type: "none",
    provider_brand_ref: null,
    provider_campaign_ref: null,
    provider_registration_ref: null,
    verification_status: "draft",
    activation_status: "disabled",
    created_at: "2026-05-15T10:00:00Z",
    updated_at: "2026-05-15T10:00:00Z",
    ...rest,
  };
}

function makeSupabase(fixtures?: {
  providerConfigurations?: ProviderConfigurationFixture[];
  senderIdentities?: SenderIdentityFixture[];
}) {
  const providerConfigurations = fixtures?.providerConfigurations ?? [];
  const senderIdentities = fixtures?.senderIdentities ?? [];
  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });

      const eqFilters: Array<[string, unknown]> = [];
      const orderFilters: Array<[string, boolean]> = [];

      const getRows = () => {
        const source =
          table === "sms_provider_configurations"
            ? providerConfigurations
            : table === "sms_sender_identities"
              ? senderIdentities
              : [];

        let data: any[] = [...source];
        for (const [column, value] of eqFilters) {
          data = data.filter((row) => row?.[column] === value);
        }
        for (const [column, ascending] of orderFilters) {
          data.sort((left, right) => {
            const comparison = String(left?.[column] ?? "").localeCompare(String(right?.[column] ?? ""));
            return ascending ? comparison : comparison * -1;
          });
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
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          calls.push({ table, op: "order", column, value: options?.ascending ?? true });
          orderFilters.push([column, options?.ascending ?? true]);
          return query;
        }),
        then: (onFulfilled: (value: { data: any[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(getRows()).then(onFulfilled, onRejected),
      };

      return query;
    },
  };

  return { supabase, calls };
}

describe("sms provider readiness read helper", () => {
  it("returns safe empty when account scope is missing", async () => {
    const { supabase, calls } = makeSupabase();

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "",
    });

    expect(result.accountOwnerUserId).toBe("");
    expect(result.providerConfigurations).toEqual([]);
    expect(result.senderIdentities).toEqual([]);
    expect(result.hasProviderConfiguration).toBe(false);
    expect(result.hasSenderIdentity).toBe(false);
    expect(result.communicationsStatus.smsEnabled).toBe(false);
    expect(result.communicationsStatus.liveSendsEnabled).toBe(false);
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("returns safe empty summaries when no provider configuration rows exist", async () => {
    const { supabase } = makeSupabase();

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.providerConfigurations).toEqual([]);
    expect(result.senderIdentities).toEqual([]);
    expect(result.providerReadinessSummary.statusLabel).toBe("Not configured");
    expect(result.senderIdentitySummary.statusLabel).toBe("Not configured");
  });

  it("returns safe empty sender identity state when no sender rows exist", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfiguration({ id: "provider-1" })],
      senderIdentities: [],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.hasProviderConfiguration).toBe(true);
    expect(result.hasSenderIdentity).toBe(false);
    expect(result.senderIdentities).toEqual([]);
    expect(result.senderIdentitySummary.statusLabel).toBe("Not configured");
  });

  it("maps provider configuration statuses and converts provider refs to safe booleans", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [
        makeProviderConfiguration({
          id: "provider-1",
          readiness_status: "registration_pending",
          activation_status: "disabled",
          provider_account_ref: "AC123",
          default_messaging_service_ref: "MG123",
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.providerConfigurations[0]).toMatchObject({
      id: "provider-1",
      readinessStatus: "registration_pending",
      readinessLabel: "Registration pending",
      activationStatus: "disabled",
      activationLabel: "Disabled",
      providerAccountConfigured: true,
      defaultMessagingServiceConfigured: true,
    });
    expect(result.providerConfigurations[0]).not.toHaveProperty("provider_account_ref");
    expect(result.providerConfigurations[0]).not.toHaveProperty("default_messaging_service_ref");
  });

  it("maps activation active to configured active but live sends unavailable", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [
        makeProviderConfiguration({
          id: "provider-1",
          readiness_status: "active",
          activation_status: "active",
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.providerConfigurations[0]?.activationLabel).toBe(
      "Configured active; live sends still unavailable",
    );
    expect(result.communicationsStatus.smsEnabled).toBe(false);
    expect(result.communicationsStatus.liveSendsEnabled).toBe(false);
  });

  it("maps callback readiness statuses", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [
        makeProviderConfiguration({
          id: "provider-1",
          callback_status_readiness: "failed",
          inbound_webhook_readiness: "ready",
          status_callback_readiness: "pending",
          advanced_opt_out_readiness: "not_applicable",
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.providerConfigurations[0]).toMatchObject({
      callbackStatusLabel: "Needs attention",
      inboundWebhookLabel: "Ready",
      statusCallbackLabel: "Pending",
      advancedOptOutLabel: "Not applicable",
    });
  });

  it("maps sender identity statuses and safe registration booleans", async () => {
    const { supabase } = makeSupabase({
      senderIdentities: [
        makeSenderIdentity({
          id: "sender-1",
          sender_type: "messaging_service",
          verification_status: "active",
          activation_status: "paused",
          registration_type: "a2p_10dlc",
          provider_sender_ref: "PN123",
          messaging_service_ref: "MG123",
          provider_brand_ref: "BN123",
          provider_campaign_ref: null,
          provider_registration_ref: "RG123",
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.senderIdentities[0]).toMatchObject({
      senderTypeLabel: "Messaging service",
      verificationLabel: "Active sender configuration",
      activationLabel: "Paused",
      registrationTypeLabel: "A2P 10DLC",
      providerSenderConfigured: true,
      messagingServiceConfigured: true,
      brandRegistrationConfigured: true,
      providerRegistrationConfigured: true,
    });
  });

  it("masks sender phone using phone_last4 and never returns full phone number", async () => {
    const { supabase } = makeSupabase({
      senderIdentities: [
        makeSenderIdentity({
          id: "sender-1",
          phone_e164: "+15551234567",
          phone_last4: "4567",
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.senderIdentities[0]?.maskedSender).toBe("•••• 4567");
    expect(result.senderIdentities[0]).not.toHaveProperty("phone_e164");
    expect(JSON.stringify(result)).not.toContain("+15551234567");
  });

  it("returns not configured masked sender when phone_last4 is missing", async () => {
    const { supabase } = makeSupabase({
      senderIdentities: [
        makeSenderIdentity({
          id: "sender-1",
          phone_e164: null,
          phone_last4: null,
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.senderIdentities[0]?.maskedSender).toBe("Not configured");
  });

  it("does not return raw provider refs in browser-facing output", async () => {
    const { supabase } = makeSupabase({
      senderIdentities: [
        makeSenderIdentity({
          id: "sender-1",
          provider_sender_ref: "PN123",
          messaging_service_ref: "MG123",
          provider_brand_ref: "BN123",
          provider_campaign_ref: "CP123",
          provider_registration_ref: "RG123",
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.senderIdentities[0]).not.toHaveProperty("provider_sender_ref");
    expect(result.senderIdentities[0]).not.toHaveProperty("messaging_service_ref");
    expect(result.senderIdentities[0]).not.toHaveProperty("provider_brand_ref");
    expect(result.senderIdentities[0]).not.toHaveProperty("provider_campaign_ref");
    expect(result.senderIdentities[0]).not.toHaveProperty("provider_registration_ref");
    expect(JSON.stringify(result)).not.toContain("PN123");
    expect(JSON.stringify(result)).not.toContain("MG123");
    expect(JSON.stringify(result)).not.toContain("BN123");
    expect(JSON.stringify(result)).not.toContain("CP123");
    expect(JSON.stringify(result)).not.toContain("RG123");
  });

  it("applies account scope to provider configuration and sender identity queries", async () => {
    const { supabase, calls } = makeSupabase({
      providerConfigurations: [
        makeProviderConfiguration({ id: "provider-1", account_owner_user_id: "owner-1" }),
        makeProviderConfiguration({ id: "provider-2", account_owner_user_id: "owner-2" }),
      ],
      senderIdentities: [
        makeSenderIdentity({ id: "sender-1", account_owner_user_id: "owner-1" }),
        makeSenderIdentity({ id: "sender-2", account_owner_user_id: "owner-2" }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.providerConfigurations).toHaveLength(1);
    expect(result.senderIdentities).toHaveLength(1);
    expect(
      calls.some(
        (call) =>
          call.table === "sms_provider_configurations" &&
          call.op === "eq" &&
          call.column === "account_owner_user_id" &&
          call.value === "owner-1",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.table === "sms_sender_identities" &&
          call.op === "eq" &&
          call.column === "account_owner_user_id" &&
          call.value === "owner-1",
      ),
    ).toBe(true);
  });

  it("applies account scope to provider configuration query", async () => {
    const { supabase, calls } = makeSupabase({
      providerConfigurations: [makeProviderConfiguration({ id: "provider-1" })],
    });

    await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(
      calls.some(
        (call) =>
          call.table === "sms_provider_configurations" &&
          call.op === "eq" &&
          call.column === "account_owner_user_id" &&
          call.value === "owner-1",
      ),
    ).toBe(true);
  });

  it("applies account scope to sender identity query", async () => {
    const { supabase, calls } = makeSupabase({
      senderIdentities: [makeSenderIdentity({ id: "sender-1" })],
    });

    await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(
      calls.some(
        (call) =>
          call.table === "sms_sender_identities" &&
          call.op === "eq" &&
          call.column === "account_owner_user_id" &&
          call.value === "owner-1",
      ),
    ).toBe(true);
  });

  it("reads only provider configuration and sender identity tables", async () => {
    const { supabase, calls } = makeSupabase({
      providerConfigurations: [makeProviderConfiguration({ id: "provider-1" })],
      senderIdentities: [makeSenderIdentity({ id: "sender-1" })],
    });

    await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    const fromTables = calls.filter((call) => call.op === "from").map((call) => call.table);
    expect(fromTables).toEqual(["sms_provider_configurations", "sms_sender_identities"]);
    expect(fromTables.includes("jobs")).toBe(false);
    expect(fromTables.includes("sms_message_intents")).toBe(false);
    expect(fromTables.includes("sms_provider_deliveries")).toBe(false);
  });

  it("does not return canSend and never enables SMS flags", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [
        makeProviderConfiguration({
          id: "provider-1",
          readiness_status: "active",
          activation_status: "active",
        }),
      ],
      senderIdentities: [
        makeSenderIdentity({
          id: "sender-1",
          verification_status: "active",
          activation_status: "active",
        }),
      ],
    });

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result).not.toHaveProperty("canSend");
    expect(result.communicationsStatus.smsEnabled).toBe(false);
    expect(result.communicationsStatus.liveSendsEnabled).toBe(false);
    expect(result.activationSummary.statusLabel).toBe("SMS is not enabled");
  });

  it("returns the expected readiness checklist statuses", async () => {
    const { supabase } = makeSupabase();

    const result = await getSmsProviderReadinessForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.complianceChecklist).toEqual([
      { key: "recipient_registry", label: "Recipient registry", status: "complete" },
      { key: "consent_suppression_foundation", label: "Consent/suppression foundation", status: "complete" },
      { key: "non_sending_eligibility_helper", label: "Non-sending eligibility helper", status: "complete" },
      { key: "intent_delivery_audit_tables", label: "Intent/delivery audit tables", status: "complete" },
      {
        key: "provider_config_sender_identity_schema",
        label: "Provider config/sender identity schema",
        status: "complete",
      },
      { key: "quiet_hours_send_gate", label: "Quiet-hours send gate", status: "deferred" },
      { key: "template_governance", label: "Template governance", status: "deferred" },
      {
        key: "provider_webhook_signature_validation",
        label: "Provider webhook/signature validation",
        status: "deferred",
      },
      { key: "sandbox_validation", label: "Sandbox validation", status: "deferred" },
      { key: "legal_provider_review", label: "Legal/provider review", status: "deferred" },
      { key: "explicit_activation", label: "Explicit activation", status: "disabled" },
    ]);
  });
});
