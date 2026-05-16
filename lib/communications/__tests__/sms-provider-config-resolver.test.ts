import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { resolveSmsSandboxProviderConfig } from "@/lib/communications/sms-provider-config-resolver";

type ProviderConfigFixture = {
  id: string;
  account_owner_user_id: string;
  provider_name: string;
  provider_environment: string;
  readiness_status: string;
  activation_status: string;
  default_messaging_service_ref?: string | null;
  sandbox_send_enabled?: boolean;
  provider_account_ref?: string | null;
  updated_at?: string;
};

type SenderIdentityFixture = {
  id: string;
  account_owner_user_id: string;
  provider_configuration_id: string;
  verification_status: string;
  activation_status: string;
  messaging_service_ref?: string | null;
  provider_sender_ref?: string | null;
  updated_at?: string;
};

function makeProviderConfig(overrides?: Partial<ProviderConfigFixture>): ProviderConfigFixture {
  return {
    id: "provider-config-1",
    account_owner_user_id: "owner-1",
    provider_name: "twilio",
    provider_environment: "sandbox",
    readiness_status: "ready_for_sandbox",
    activation_status: "disabled",
    default_messaging_service_ref: "MG-REDACTED",
    sandbox_send_enabled: true,
    provider_account_ref: "AC-REDACTED",
    updated_at: "2026-05-15T10:00:00Z",
    ...overrides,
  };
}

function makeSenderIdentity(overrides?: Partial<SenderIdentityFixture>): SenderIdentityFixture {
  return {
    id: "sender-1",
    account_owner_user_id: "owner-1",
    provider_configuration_id: "provider-config-1",
    verification_status: "verified",
    activation_status: "active",
    messaging_service_ref: "MG-SENDER-REDACTED",
    provider_sender_ref: "PN-REDACTED",
    updated_at: "2026-05-15T10:00:00Z",
    ...overrides,
  };
}

function makeSupabase(fixtures?: {
  providerConfigurations?: ProviderConfigFixture[];
  senderIdentities?: SenderIdentityFixture[];
}) {
  const providerConfigurations = fixtures?.providerConfigurations ?? [];
  const senderIdentities = fixtures?.senderIdentities ?? [];
  const calls: string[] = [];
  const providerConfigurationFilters: Array<{ column: string; value: unknown }> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      calls.push(table);
      const filters = new Map<string, unknown>();

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.set(column, value);
          if (table === "sms_provider_configurations") {
            providerConfigurationFilters.push({ column, value });
          }
          return query;
        }),
        order: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          if (table === "sms_provider_configurations") {
            const match = providerConfigurations.find((row) => {
              return Array.from(filters.entries()).every(([column, value]) => {
                return (row as Record<string, unknown>)[column] === value;
              });
            }) ?? null;

            return { data: match, error: null };
          }

          if (table === "sms_sender_identities") {
            const match = senderIdentities.find((row) => {
              return Array.from(filters.entries()).every(([column, value]) => {
                return (row as Record<string, unknown>)[column] === value;
              });
            }) ?? null;

            return { data: match, error: null };
          }

          return { data: null, error: null };
        }),
      };

      return query;
    }),
  };

  return { supabase, calls, providerConfigurationFilters };
}

describe("sms provider config resolver", () => {
  let mockTwilioCall: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTwilioCall = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks when account owner scope is missing", async () => {
    const { supabase } = makeSupabase();

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("account_scope_missing");
    expect(result.liveSendEnabled).toBe(false);
  });

  it("blocks when provider configuration is missing", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("provider_configuration_missing");
  });

  it("treats non-twilio provider configuration as missing sandbox config", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("provider_configuration_missing");
  });

  it("treats non-sandbox provider environment as missing sandbox config", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("provider_configuration_missing");
  });

  it("blocks when provider is not sandbox-ready", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig({ readiness_status: "registration_pending" })],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("provider_not_ready_for_sandbox");
  });

  it("filters provider configuration by account + provider_name + provider_environment", async () => {
    const sandboxConfig = makeProviderConfig({
      id: "provider-sandbox",
      account_owner_user_id: "owner-1",
      provider_name: "twilio",
      provider_environment: "sandbox",
      sandbox_send_enabled: true,
    });

    const { supabase, providerConfigurationFilters } = makeSupabase({
      providerConfigurations: [sandboxConfig],
      senderIdentities: [
        makeSenderIdentity({
          provider_configuration_id: "provider-sandbox",
        }),
      ],
    });

    await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(providerConfigurationFilters).toEqual(
      expect.arrayContaining([
        { column: "account_owner_user_id", value: "owner-1" },
        { column: "provider_name", value: "twilio" },
        { column: "provider_environment", value: "sandbox" },
      ]),
    );
  });

  it("does not allow production provider config to satisfy sandbox readiness", async () => {
    const productionConfig = makeProviderConfig({
      provider_environment: "production",
      sandbox_send_enabled: true,
    });

    const { supabase } = makeSupabase({
      providerConfigurations: [productionConfig],
      senderIdentities: [makeSenderIdentity()],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("provider_configuration_missing");
  });

  it("blocks when sender identity is missing", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig()],
      senderIdentities: [],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("sender_identity_missing");
  });

  it("blocks when sender identity is not verified and active", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig()],
      senderIdentities: [
        makeSenderIdentity({ verification_status: "pending_verification", activation_status: "disabled" }),
      ],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("sender_identity_not_ready");
  });

  it("blocks when messaging service reference is missing on provider and sender", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig({ default_messaging_service_ref: null })],
      senderIdentities: [makeSenderIdentity({ messaging_service_ref: null })],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("messaging_service_missing");
  });

  it("blocks when sandbox send gate is disabled", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig({ sandbox_send_enabled: false })],
      senderIdentities: [makeSenderIdentity()],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("sandbox_send_gate_missing_or_disabled");
  });

  it("blocks when sandbox send gate field is missing", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig({ sandbox_send_enabled: undefined })],
      senderIdentities: [makeSenderIdentity()],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(false);
    expect(result.blockedReasons).toContain("sandbox_send_gate_missing_or_disabled");
  });

  it("returns ready true when sandbox config and sender identity are fully ready", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig({ sandbox_send_enabled: true })],
      senderIdentities: [makeSenderIdentity()],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.readyForSandboxProviderSubmit).toBe(true);
    expect(result.blockedReasons).toEqual([]);
    expect(result.providerName).toBe("twilio");
    expect(result.providerEnvironment).toBe("sandbox");
    expect(result.messagingServiceConfigured).toBe(true);
    expect(result.senderIdentityReady).toBe(true);
    expect(result.sandboxSendGateEnabled).toBe(true);
  });

  it("does not expose raw provider refs or secrets", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [
        makeProviderConfig({
          provider_account_ref: "AC123-secret",
          default_messaging_service_ref: "MG123-secret",
        }),
      ],
      senderIdentities: [
        makeSenderIdentity({
          provider_sender_ref: "PN123-secret",
          messaging_service_ref: "MG456-secret",
        }),
      ],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result).not.toHaveProperty("provider_account_ref");
    expect(result).not.toHaveProperty("default_messaging_service_ref");
    expect(result).not.toHaveProperty("provider_sender_ref");
    expect(result).not.toHaveProperty("messaging_service_ref");
    expect(result).not.toHaveProperty("twilioAccountSid");
    expect(result).not.toHaveProperty("twilioAuthToken");
    expect(result).not.toHaveProperty("twilioMessagingServiceSid");
  });

  it("does not return canSend", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig()],
      senderIdentities: [makeSenderIdentity()],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect((result as any).canSend).toBeUndefined();
  });

  it("always returns liveSendEnabled false", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig()],
      senderIdentities: [makeSenderIdentity()],
    });

    const result = await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(result.liveSendEnabled).toBe(false);
  });

  it("does not call Twilio/provider APIs", async () => {
    const { supabase } = makeSupabase({
      providerConfigurations: [makeProviderConfig()],
      senderIdentities: [makeSenderIdentity()],
    });

    await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(mockTwilioCall).not.toHaveBeenCalled();
  });

  it("reads only provider configurations and sender identities tables", async () => {
    const { supabase, calls } = makeSupabase({
      providerConfigurations: [makeProviderConfig()],
      senderIdentities: [makeSenderIdentity()],
    });

    await resolveSmsSandboxProviderConfig({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(calls).toEqual(["sms_provider_configurations", "sms_sender_identities"]);
  });
});
