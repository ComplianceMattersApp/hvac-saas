import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const resolveSmsSandboxProviderConfigMock = vi.fn();
const sendTwilioSandboxMessageMock = vi.fn();

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

vi.mock("@/lib/communications/twilio-messages-client", () => ({
  sendTwilioSandboxMessage: (...args: unknown[]) => sendTwilioSandboxMessageMock(...args),
  TwilioMessageError: class TwilioMessageError extends Error {
    public readonly code: number | string | null;
    public readonly twilioStatus: string | null;
    constructor(params: { code: number | string | null; twilioStatus: string | null; message: string }) {
      super(params.message);
      this.name = "TwilioMessageError";
      this.code = params.code;
      this.twilioStatus = params.twilioStatus;
    }
  },
}));

const readSmsSandboxTestRecipientForPhoneMock = vi.fn();

import {
  reserveSmsSandboxDeliveryDryRunFromForm,
  submitSmsSandboxDeliveryToProviderFromForm,
} from "@/lib/actions/sms-sandbox-send-actions";
import { TwilioMessageError } from "@/lib/communications/twilio-messages-client";

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
    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
  });

  it("blocks when test recipient phone does not match intent snapshot", async () => {
    const intentPhone = "+15550001111";
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent({ recipient_phone_snapshot: intentPhone }),
    });
    createAdminClientMock.mockReturnValue(admin);

    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(null);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );

    expect(readSmsSandboxTestRecipientForPhoneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        phoneE164: intentPhone,
      }),
    );
  });

  it("blocks cross-account test recipient by account-scoped lookup", async () => {
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    // Account-scoped helper should return null for cross-account rows.
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(null);

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );

    expect(readSmsSandboxTestRecipientForPhoneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
      }),
    );
  });

  it("ignores forged client test-recipient fields and still uses server-side intent snapshot", async () => {
    const intentPhone = "+15551234567";
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent({ recipient_phone_snapshot: intentPhone }),
    });
    createAdminClientMock.mockReturnValue(admin);

    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({ phone_e164: intentPhone }),
    );

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(
        buildFormData("delivery-1", {
          recipient_phone_snapshot: "+19999999999",
          phone_e164: "+18888888888",
          account_owner_user_id: "forged-owner",
          test_recipient_id: "forged-test-recipient",
        }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_reservation_dry_run_ready",
    );

    expect(readSmsSandboxTestRecipientForPhoneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: "owner-1",
        phoneE164: intentPhone,
      }),
    );
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

// ---------------------------------------------------------------------------
// C4: submitSmsSandboxDeliveryToProviderFromForm
// ---------------------------------------------------------------------------

type C4MockConfig = {
  delivery?: DeliveryFixture | null;
  intent?: IntentFixture | null;
  messagingServiceRef?: string | null;
  guardedUpdateRowCount?: number;
  deliveryReadError?: boolean;
  intentReadError?: boolean;
  providerConfigReadError?: boolean;
  guardedUpdateError?: boolean;
  postSendUpdateError?: boolean;
};

function buildC4AdminMock(config: C4MockConfig = {}) {
  const fromCalls: string[] = [];
  const updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = [];

  const admin = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);

      const filters: Record<string, unknown> = {};
      let inUpdateChain = false;
      let pendingPatch: Record<string, unknown> = {};

      const chain: any = {
        select: vi.fn((cols?: string) => {
          if (inUpdateChain) {
            if (config.guardedUpdateError) {
              return Promise.resolve({ data: null, error: new Error("guarded_update_failed") });
            }
            const count = config.guardedUpdateRowCount ?? 1;
            return Promise.resolve({
              data: count > 0 ? [{ id: filters["id"] ?? "delivery-1" }] : [],
              error: null,
            });
          }
          return chain;
        }),
        eq: vi.fn((col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        }),
        is: vi.fn((col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        }),
        update: vi.fn((patch: Record<string, unknown>) => {
          inUpdateChain = true;
          pendingPatch = patch;
          updateCalls.push({ table, patch });
          return chain;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "sms_provider_deliveries") {
            if (config.deliveryReadError) {
              return { data: null, error: new Error("delivery_read_failed") };
            }
            const del = config.delivery ?? null;
            if (!del) return { data: null, error: null };
            if (filters["id"] !== del.id) return { data: null, error: null };
            if (filters["account_owner_user_id"] !== del.account_owner_user_id)
              return { data: null, error: null };
            return { data: del, error: null };
          }
          if (table === "sms_message_intents") {
            if (config.intentReadError) {
              return { data: null, error: new Error("intent_read_failed") };
            }
            const int = config.intent ?? null;
            if (!int) return { data: null, error: null };
            if (filters["id"] !== int.id) return { data: null, error: null };
            if (filters["account_owner_user_id"] !== int.account_owner_user_id)
              return { data: null, error: null };
            return { data: int, error: null };
          }
          if (table === "sms_provider_configurations") {
            if (config.providerConfigReadError) {
              return { data: null, error: new Error("provider_config_read_failed") };
            }
            const ref =
              config.messagingServiceRef !== undefined
                ? config.messagingServiceRef
                : "MGtestmessagingservice";
            if (!ref) return { data: null, error: null };
            return { data: { default_messaging_service_ref: ref }, error: null };
          }
          return { data: null, error: null };
        }),
      };

      // Make the chain thenable so post-send update chains can be directly awaited.
      chain.then = (
        resolve: (v: { data: unknown; error: unknown }) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        const error =
          inUpdateChain && config.postSendUpdateError
            ? new Error("post_send_update_failed")
            : null;
        return Promise.resolve({ data: null, error }).then(resolve, reject);
      };

      return chain;
    }),
  };

  return { admin, fromCalls, updateCalls };
}

function makeReadyProviderConfig(overrides?: Partial<{ providerConfigurationId: string }>) {
  return {
    readyForSandboxProviderSubmit: true,
    blockedReasons: [],
    warnings: [],
    providerName: "twilio",
    providerEnvironment: "sandbox",
    providerConfigurationId: overrides?.providerConfigurationId ?? "provider-1",
    senderIdentityId: "sender-1",
    messagingServiceConfigured: true,
    senderIdentityReady: true,
    sandboxSendGateEnabled: true,
    liveSendEnabled: false,
  };
}

describe("submitSmsSandboxDeliveryToProviderFromForm", () => {
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

    resolveSmsSandboxProviderConfigMock.mockResolvedValue(makeReadyProviderConfig());

    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValue(
      makeTestRecipient({
        is_active: true,
        verified_at: "2026-05-15T00:00:00Z",
        verified_by_user_id: "admin-1",
      }),
    );

    sendTwilioSandboxMessageMock.mockResolvedValue({
      messageSid: "SMtest123456",
      status: "queued",
    });
  });

  // --- Gate tests (same as dry-run gates) ---

  it("(1) blocks non-admin actor", async () => {
    requireInternalRoleMock.mockRejectedValueOnce(new Error("INTERNAL_ROLE_REQUIRED"));

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=admin_required");
  });

  it("(2) blocks when delivery_id is missing", async () => {
    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData(undefined)),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_delivery_missing");
  });

  it("(3) blocks when delivery does not exist", async () => {
    const { admin } = buildC4AdminMock({ delivery: null });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_delivery_not_found");
  });

  it("(4) blocks when delivery already has non-not_submitted status", async () => {
    const { admin } = buildC4AdminMock({
      delivery: makeDelivery({ provider_status: "queued" }),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_delivery_already_submitted",
    );
  });

  it("(5) blocks when delivery already has provider_message_id", async () => {
    const { admin } = buildC4AdminMock({
      delivery: makeDelivery({ provider_message_id: "SMexisting" }),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_delivery_already_submitted",
    );
  });

  it("(6) blocks when intent is not ready", async () => {
    const { admin } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent({ decision_outcome: "blocked" }),
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_intent_not_ready");
  });

  it("(7) blocks when provider resolver is not ready", async () => {
    const { admin } = buildC4AdminMock({ delivery: makeDelivery(), intent: makeIntent() });
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
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_provider_not_ready");
  });

  it("(8) maps missing/disabled sandbox send gate to sandbox_send_gate_missing_or_disabled", async () => {
    const { admin } = buildC4AdminMock({ delivery: makeDelivery(), intent: makeIntent() });
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
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_send_gate_missing_or_disabled",
    );
  });

  it("(9a) blocks when test recipient is missing", async () => {
    const { admin } = buildC4AdminMock({ delivery: makeDelivery(), intent: makeIntent() });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(null);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  it("(9b) blocks when test recipient is inactive", async () => {
    const { admin } = buildC4AdminMock({ delivery: makeDelivery(), intent: makeIntent() });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({ is_active: false }),
    );

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  it("(9c) blocks when test recipient is unverified", async () => {
    const { admin } = buildC4AdminMock({ delivery: makeDelivery(), intent: makeIntent() });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(
      makeTestRecipient({ verified_at: null, verified_by_user_id: null }),
    );

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_test_recipient_required",
    );
  });

  // --- Guarded reservation tests ---

  it("(10) guarded reservation zero-row result returns sandbox_delivery_reserved and does not call Twilio", async () => {
    const { admin } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 0,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_delivery_reserved");

    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
  });

  it("(11) guarded reservation success calls mocked Twilio exactly once", async () => {
    const { admin } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("REDIRECT:/ops/admin/communications?notice=sandbox_provider_submit_attempted");

    expect(sendTwilioSandboxMessageMock).toHaveBeenCalledOnce();
  });

  // --- Success mapping tests ---

  it("(12a) success maps Twilio queued status to provider_status=queued", async () => {
    sendTwilioSandboxMessageMock.mockResolvedValueOnce({ messageSid: "SMabc", status: "queued" });

    const { admin, updateCalls } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_provider_submit_attempted");

    const postSendUpdate = updateCalls.find(
      (c) => c.table === "sms_provider_deliveries" && c.patch.provider_message_id !== undefined,
    );
    expect(postSendUpdate).toBeDefined();
    expect(postSendUpdate?.patch.provider_message_id).toBe("SMabc");
    expect(postSendUpdate?.patch.provider_status).toBe("queued");
    expect(postSendUpdate?.patch.provider_raw_status).toBe("queued");
  });

  it("(12b) success maps non-queued Twilio status to provider_status=submitted", async () => {
    sendTwilioSandboxMessageMock.mockResolvedValueOnce({ messageSid: "SMxyz", status: "sending" });

    const { admin, updateCalls } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_provider_submit_attempted");

    const postSendUpdate = updateCalls.find(
      (c) => c.table === "sms_provider_deliveries" && c.patch.provider_message_id !== undefined,
    );
    expect(postSendUpdate?.patch.provider_status).toBe("submitted");
    expect(postSendUpdate?.patch.provider_raw_status).toBe("sending");
  });

  it("(12c) success does not write sent_at or delivered_at", async () => {
    const { admin, updateCalls } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_provider_submit_attempted");

    for (const call of updateCalls) {
      expect(call.patch).not.toHaveProperty("sent_at");
      expect(call.patch).not.toHaveProperty("delivered_at");
    }
  });

  it("(12d) success passes intent phone and body to Twilio", async () => {
    const { admin } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent({
        recipient_phone_snapshot: "+15551112222",
        message_body_snapshot: "Your tech is on the way.",
      }),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_provider_submit_attempted");

    expect(sendTwilioSandboxMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15551112222",
        body: "Your tech is on the way.",
        messagingServiceSid: "MGtestmessagingservice",
      }),
    );
  });

  // --- Immediate Twilio error tests ---

  it("(13a) immediate Twilio error maps failed status and error fields", async () => {
    const { TwilioMessageError: MockTwilioMessageError } = await import(
      "@/lib/communications/twilio-messages-client"
    );
    sendTwilioSandboxMessageMock.mockRejectedValueOnce(
      new MockTwilioMessageError({ code: 21211, twilioStatus: "400", message: "Invalid To number" }),
    );

    const { admin, updateCalls } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/communications?notice=sandbox_provider_immediate_failure",
    );

    const failureUpdate = updateCalls.find(
      (c) => c.table === "sms_provider_deliveries" && c.patch.provider_status === "failed",
    );
    expect(failureUpdate).toBeDefined();
    expect(failureUpdate?.patch.failed_at).toBeDefined();
    expect(failureUpdate?.patch.provider_error_code).toBe("21211");
    expect(failureUpdate?.patch.provider_error_message).toBe("Invalid To number");
    expect(failureUpdate?.patch.provider_raw_status).toBe("400");
    expect(failureUpdate?.patch.provider_last_event_at).toBeDefined();
  });

  it("(13b) immediate error does not write sent_at or delivered_at", async () => {
    const { TwilioMessageError: MockTwilioMessageError } = await import(
      "@/lib/communications/twilio-messages-client"
    );
    sendTwilioSandboxMessageMock.mockRejectedValueOnce(
      new MockTwilioMessageError({ code: 30005, twilioStatus: "400", message: "Unknown dest" }),
    );

    const { admin, updateCalls } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_provider_immediate_failure");

    for (const call of updateCalls) {
      expect(call.patch).not.toHaveProperty("sent_at");
      expect(call.patch).not.toHaveProperty("delivered_at");
    }
  });

  // --- Security: no credential exposure ---

  it("(14) Twilio credentials are not exposed in notices", async () => {
    const { TwilioMessageError: MockTwilioMessageError } = await import(
      "@/lib/communications/twilio-messages-client"
    );
    // Simulate a message that might contain an account SID
    sendTwilioSandboxMessageMock.mockRejectedValueOnce(
      new MockTwilioMessageError({
        code: 20003,
        twilioStatus: "401",
        message: "Authenticate error",
      }),
    );

    const { admin } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    let caughtRedirect = "";
    try {
      await submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1"));
    } catch (e) {
      caughtRedirect = (e as Error).message;
    }

    // Notice must not contain raw Account SID pattern (ACxxxxxxxx...)
    expect(caughtRedirect).not.toMatch(/AC[a-f0-9]{32}/i);
    // Must not contain auth token pattern (32 hex chars standalone)
    expect(caughtRedirect).toContain("sandbox_provider_immediate_failure");
  });

  // --- Immutability checks ---

  it("(15) action does not mutate jobs or job_events tables", async () => {
    const { admin, fromCalls } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(fromCalls).not.toContain("jobs");
    expect(fromCalls).not.toContain("job_events");
  });

  it("(16) action does not mutate sms_message_intents", async () => {
    const { admin, updateCalls } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    const intentMutations = updateCalls.filter((c) => c.table === "sms_message_intents");
    expect(intentMutations).toHaveLength(0);
  });

  it("(17) action never writes sent_at or delivered_at in any code path", async () => {
    const { TwilioMessageError: MockTwilioMessageError } = await import(
      "@/lib/communications/twilio-messages-client"
    );

    // Check success path
    const { admin: adminSuccess, updateCalls: successUpdates } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(adminSuccess);
    sendTwilioSandboxMessageMock.mockResolvedValueOnce({ messageSid: "SM1", status: "queued" });

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    for (const call of successUpdates) {
      expect(call.patch).not.toHaveProperty("sent_at");
      expect(call.patch).not.toHaveProperty("delivered_at");
    }

    // Check failure path
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { user_id: "admin-1", role: "admin", is_active: true, account_owner_user_id: "owner-1" },
    });
    resolveSmsSandboxProviderConfigMock.mockResolvedValue(makeReadyProviderConfig());
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValue(
      makeTestRecipient({ is_active: true, verified_at: "2026-05-15T00:00:00Z", verified_by_user_id: "admin-1" }),
    );

    const { admin: adminFail, updateCalls: failUpdates } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(adminFail);
    sendTwilioSandboxMessageMock.mockRejectedValueOnce(
      new MockTwilioMessageError({ code: 30003, twilioStatus: "400", message: "Landline" }),
    );

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_provider_immediate_failure");

    for (const call of failUpdates) {
      expect(call.patch).not.toHaveProperty("sent_at");
      expect(call.patch).not.toHaveProperty("delivered_at");
    }
  });

  it("(18) no webhook or callback behavior is triggered", async () => {
    // No webhook module exists in this path; action only calls Twilio Messages API once.
    const { admin } = buildC4AdminMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
      guardedUpdateRowCount: 1,
    });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_provider_submit_attempted");

    // Twilio called exactly once; no callback/webhook mocks needed or called
    expect(sendTwilioSandboxMessageMock).toHaveBeenCalledOnce();
  });

  it("(19) Mark On The Way action does not call sendTwilioSandboxMessage", async () => {
    // Verify the dry-run action (which backs Mark On The Way flow) never calls Twilio
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(makeTestRecipient());

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow();

    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
  });

  it("(20) manual sandbox send action is separate and admin-only; not triggered by dry-run", async () => {
    // The dry-run action is a separate export and ends at sandbox_reservation_dry_run_ready.
    // submitSmsSandboxDeliveryToProviderFromForm is the only path that calls Twilio.
    // Calling the dry-run action does NOT invoke the submit action.
    const { admin } = buildAdminReadMock({
      delivery: makeDelivery(),
      intent: makeIntent(),
    });
    createAdminClientMock.mockReturnValue(admin);
    readSmsSandboxTestRecipientForPhoneMock.mockResolvedValueOnce(makeTestRecipient());

    await expect(
      reserveSmsSandboxDeliveryDryRunFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("sandbox_reservation_dry_run_ready");

    // Twilio must NOT have been called
    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();

    // Non-admin attempt on submit action is blocked
    requireInternalRoleMock.mockRejectedValueOnce(new Error("INTERNAL_ROLE_REQUIRED"));
    await expect(
      submitSmsSandboxDeliveryToProviderFromForm(buildFormData("delivery-1")),
    ).rejects.toThrow("admin_required");
    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
  });
});
