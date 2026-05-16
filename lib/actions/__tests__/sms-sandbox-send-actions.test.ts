import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const resolveSmsSandboxProviderConfigMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/communications/sms-provider-config-resolver", () => ({
  resolveSmsSandboxProviderConfig: (...args: unknown[]) =>
    resolveSmsSandboxProviderConfigMock(...args),
}));

import { reserveSmsSandboxDeliveryDryRunFromForm } from "@/lib/actions/sms-sandbox-send-actions";

type DeliveryFixture = {
  id: string;
  account_owner_user_id: string;
  sms_message_intent_id: string;
  provider_name: string;
  provider_status: string;
  provider_message_id: string | null;
};

type IntentFixture = {
  id: string;
  account_owner_user_id: string;
  message_class: string;
  decision_outcome: string;
  job_event_id: string | null;
  recipient_phone_snapshot: string | null;
  message_body_snapshot: string | null;
  template_key: string | null;
  template_version: string | null;
};

function buildFormData(deliveryId?: string, extras?: Record<string, string>) {
  const formData = new FormData();
  if (deliveryId !== undefined) {
    formData.set("delivery_id", deliveryId);
  }

  for (const [key, value] of Object.entries(extras ?? {})) {
    formData.set(key, value);
  }

  return formData;
}

function makeDelivery(overrides?: Partial<DeliveryFixture>): DeliveryFixture {
  return {
    id: "delivery-1",
    account_owner_user_id: "owner-1",
    sms_message_intent_id: "intent-1",
    provider_name: "twilio",
    provider_status: "not_submitted",
    provider_message_id: null,
    ...overrides,
  };
}

function makeIntent(overrides?: Partial<IntentFixture>): IntentFixture {
  return {
    id: "intent-1",
    account_owner_user_id: "owner-1",
    message_class: "on_the_way",
    decision_outcome: "ready_for_provider",
    job_event_id: "event-1",
    recipient_phone_snapshot: "+15551234567",
    message_body_snapshot: "Your technician is on the way.",
    template_key: "on_the_way",
    template_version: "1",
    ...overrides,
  };
}

function buildAdminReadMock(fixtures?: {
  delivery?: DeliveryFixture | null;
  intent?: IntentFixture | null;
  deliveryReadError?: boolean;
  intentReadError?: boolean;
}) {
  const fromCalls: string[] = [];
  const mutationCalls: Array<{ table: string; operation: string }> = [];

  const admin = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);

      const filters = new Map<string, unknown>();

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.set(column, value);
          return query;
        }),
        insert: vi.fn(() => {
          mutationCalls.push({ table, operation: "insert" });
          return query;
        }),
        update: vi.fn(() => {
          mutationCalls.push({ table, operation: "update" });
          return query;
        }),
        delete: vi.fn(() => {
          mutationCalls.push({ table, operation: "delete" });
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "sms_provider_deliveries") {
            if (fixtures?.deliveryReadError) {
              return { data: null, error: new Error("delivery_read_failed") };
            }

            const delivery = fixtures?.delivery ?? null;
            if (!delivery) {
              return { data: null, error: null };
            }

            if (filters.get("id") !== delivery.id) {
              return { data: null, error: null };
            }

            if (filters.get("account_owner_user_id") !== delivery.account_owner_user_id) {
              return { data: null, error: null };
            }

            return { data: delivery, error: null };
          }

          if (table === "sms_message_intents") {
            if (fixtures?.intentReadError) {
              return { data: null, error: new Error("intent_read_failed") };
            }

            const intent = fixtures?.intent ?? null;
            if (!intent) {
              return { data: null, error: null };
            }

            if (filters.get("id") !== intent.id) {
              return { data: null, error: null };
            }

            if (filters.get("account_owner_user_id") !== intent.account_owner_user_id) {
              return { data: null, error: null };
            }

            return { data: intent, error: null };
          }

          return { data: null, error: null };
        }),
      };

      return query;
    }),
  };

  return { admin, fromCalls, mutationCalls };
}

describe("reserveSmsSandboxDeliveryDryRunFromForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: {
        user_id: "admin-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    resolveSmsSandboxProviderConfigMock.mockResolvedValue({
      readyForSandboxProviderSubmit: true,
      blockedReasons: [],
      warnings: [],
      providerName: "twilio",
      providerEnvironment: "sandbox",
      providerConfigurationId: "provider-1",
      senderIdentityId: "sender-1",
      messagingServiceConfigured: true,
      senderIdentityReady: true,
      sandboxSendGateEnabled: true,
      liveSendEnabled: false,
    });
  });

  it("blocks non-admin actor", async () => {
    requireInternalRoleMock.mockRejectedValueOnce(new Error("INTERNAL_ROLE_REQUIRED"));

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=admin_required");
  });

  it("blocks when delivery_id is missing", async () => {
    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData(undefined)),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_delivery_missing");
  });

  it("blocks when delivery does not exist", async () => {
    const { admin } = buildAdminReadMock({ delivery: null });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_delivery_not_found");
  });

  it("blocks wrong-account delivery by scoped lookup", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery({ account_owner_user_id: "owner-other" }),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_delivery_not_found");
  });

  it("blocks when delivery status is not not_submitted", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery({ provider_status: "failed" }),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_delivery_already_submitted",
    );
  });

  it("blocks when delivery already has provider_message_id", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery({ provider_message_id: "SM123" }),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_delivery_already_submitted",
    );
  });

  it("blocks when linked intent is missing", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: null,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_intent_not_ready");
  });

  it("blocks when intent decision outcome is not ready_for_provider", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent({ decision_outcome: "blocked" }),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_intent_not_ready");
  });

  it("blocks when intent is missing required snapshots", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent({ recipient_phone_snapshot: null }),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_intent_not_ready");
  });

  it("blocks when provider resolver is not ready", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    resolveSmsSandboxProviderConfigMock.mockResolvedValueOnce({
      readyForSandboxProviderSubmit: false,
      blockedReasons: ["provider_not_ready_for_sandbox"],
      warnings: [],
      providerName: "twilio",
      messagingServiceConfigured: false,
      senderIdentityReady: false,
      sandboxSendGateEnabled: true,
      liveSendEnabled: false,
    });

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_provider_not_ready");
  });

  it("maps missing or disabled send gate to sandbox_send_gate_missing_or_disabled", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    resolveSmsSandboxProviderConfigMock.mockResolvedValueOnce({
      readyForSandboxProviderSubmit: false,
      blockedReasons: ["sandbox_send_gate_missing_or_disabled"],
      warnings: [],
      providerName: "twilio",
      messagingServiceConfigured: true,
      senderIdentityReady: true,
      sandboxSendGateEnabled: false,
      liveSendEnabled: false,
    });

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_send_gate_missing_or_disabled",
    );
  });

  it("fails closed on test-recipient gate because policy is not modeled yet", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  it("uses no Twilio/provider call path and only resolver readiness helper", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(resolveSmsSandboxProviderConfigMock).toHaveBeenCalledOnce();
    expect(resolveSmsSandboxProviderConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        providerName: "twilio",
      }),
    );
  });

  it("does not mutate sms_provider_deliveries rows in dry-run mode", async () => {
    const { admin, mutationCalls } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(mutationCalls).toHaveLength(0);
  });

  it("does not mutate jobs or job_events", async () => {
    const { admin, fromCalls, mutationCalls } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(fromCalls).not.toContain("jobs");
    expect(fromCalls).not.toContain("job_events");
    expect(mutationCalls).toHaveLength(0);
  });

  it("accepts only delivery_id and ignores client-supplied account or provider fields", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    const formData = buildFormData("delivery-1", {
      account_owner_user_id: "owner-forged",
      sms_message_intent_id: "intent-forged",
      provider_name: "provider-forged",
      provider_status: "submitted",
      provider_message_id: "SM-forged",
    });

    await expect(reserveSmsSandboxDeliveryDryRunFromForm(formData)).rejects.toThrow();

    expect(resolveSmsSandboxProviderConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
      }),
    );
  });
});
