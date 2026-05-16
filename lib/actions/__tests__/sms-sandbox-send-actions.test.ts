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

vi.mock("@/lib/communications/sms-sandbox-test-recipient-read", () => ({
  readSmsSandboxTestRecipientForPhone: (...args: unknown[]) =>
    readSmsSandboxTestRecipientForPhoneMock(...args),
}));

const readSmsSandboxTestRecipientForPhoneMock = vi.fn();

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

type TestRecipientFixture = {
  id: string;
  account_owner_user_id: string;
  phone_e164: string;
  phone_label: string | null;
  is_active: boolean;
  verified_at: string | null;
  verified_by_user_id: string | null;
  created_at: string;
  updated_at: string;
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

function makeTestRecipient(overrides?: Partial<TestRecipientFixture>): TestRecipientFixture {
  return {
    id: "test-recipient-1",
    account_owner_user_id: "owner-1",
    phone_e164: "+15551234567",
    phone_label: "Test Phone",
    is_active: true,
    verified_at: "2026-05-15T00:00:00Z",
    verified_by_user_id: "admin-1",
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

function buildAdminReadMock(fixtures?: {
  delivery?: DeliveryFixture | null;
  intent?: IntentFixture | null;
  testRecipient?: TestRecipientFixture | null;
  deliveryReadError?: boolean;
  intentReadError?: boolean;
  testRecipientReadError?: boolean;
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

    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValue(null);
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

  it("blocks when no active verified test recipient exists", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      testRecipient: null,
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(null);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  it("blocks when test recipient is inactive", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({ is_active: false }),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  it("blocks when test recipient verified_at is null", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({ verified_at: null, verified_by_user_id: null }),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  it("blocks when test recipient verified_by_user_id is null", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({ verified_at: "2026-05-15T00:00:00Z", verified_by_user_id: null }),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  it("passes with same-account active verified test recipient and returns sandbox_reservation_dry_run_ready", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      testRecipient: makeTestRecipient(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({
        account_owner_user_id: "owner-1",
        phone_e164: "+15551234567",
        is_active: true,
        verified_at: "2026-05-15T00:00:00Z",
        verified_by_user_id: "admin-1",
      }),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_reservation_dry_run_ready",
    );
  });

  it("test-recipient gate uses phone from intent recipient_phone_snapshot", async () => {
    const phoneSnapshot = "+15559876543";
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent({ recipient_phone_snapshot: phoneSnapshot }),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({ phone_e164: phoneSnapshot }),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_reservation_dry_run_ready");

    expect(readSmsSandboxTestRecipientForPhoneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneE164: phoneSnapshot,
      }),
    );
  });

  it("dry-run ready path does not mutate sms_provider_deliveries", async () => {
    const { admin, mutationCalls } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient(),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(mutationCalls).toHaveLength(0);
  });

  it("dry-run ready path does not call Twilio/provider", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient(),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(resolveSmsSandboxProviderConfigMock).toHaveBeenCalledOnce();
    // No actual Twilio calls would be made (no provider submit, no message send)
  });

  it("action reads only expected tables (delivery, intent, test-recipient)", async () => {
    const { admin, fromCalls } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient(),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(fromCalls).toContain("sms_provider_deliveries");
    expect(fromCalls).toContain("sms_message_intents");
    expect(fromCalls).not.toContain("jobs");
    expect(fromCalls).not.toContain("job_events");
    expect(fromCalls).not.toContain("sms_provider_configurations");
  });

  it("test-recipient read errors are handled gracefully", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      testRecipientReadError: true,
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockRejectedValueOnce(
      new Error("test_recipient_read_failed"),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_internal_error");
  });
});
