import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareSmsProviderDeliveryPreflightMock = vi.fn();
const sendTwilioSandboxMessageMock = vi.fn();

vi.mock("@/lib/communications/sms-provider-delivery-preflight", () => ({
  prepareSmsProviderDeliveryPreflight: (...args: unknown[]) =>
    prepareSmsProviderDeliveryPreflightMock(...args),
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

import {
  attemptLiveOnTheWaySend,
  isWithinSmsSendWindow,
  resolveSmsLiveProviderConfig,
} from "@/lib/communications/sms-live-send";
import { TwilioMessageError } from "@/lib/communications/twilio-messages-client";

// A UTC instant chosen so window math is easy to reason about:
// 2026-08-06T19:00:00Z = 12:00 PDT (inside window) = 04:00 next-day in Tokyo (outside).
const NOON_PACIFIC = new Date("2026-08-06T19:00:00Z");
// 2026-08-06T05:00:00Z = 22:00 PDT previous evening (outside window).
const LATE_PACIFIC = new Date("2026-08-06T05:00:00Z");

type Fixtures = {
  configs?: any[];
  senders?: any[];
  timeZone?: string | null;
  intent?: { recipient_phone_snapshot: string | null; message_body_snapshot: string | null } | null;
  suppressions?: any[];
  reserveRows?: any[];
};

function buildAdminMock(fixtures: Fixtures) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

  const admin = {
    from(table: string) {
      const chain: any = {
        _filters: {} as Record<string, unknown>,
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          chain._filters[column] = value;
          return chain;
        },
        is() {
          return chain;
        },
        limit: async () => {
          if (table === "sms_sender_identities") {
            return { data: fixtures.senders ?? [], error: null };
          }
          if (table === "contact_recipient_suppressions") {
            return { data: fixtures.suppressions ?? [], error: null };
          }
          return { data: [], error: null };
        },
        maybeSingle: async () => {
          if (table === "internal_business_profiles") {
            return { data: fixtures.timeZone != null ? { time_zone: fixtures.timeZone } : null, error: null };
          }
          if (table === "sms_message_intents") {
            return { data: fixtures.intent ?? null, error: null };
          }
          return { data: null, error: null };
        },
        update(values: Record<string, unknown>) {
          updates.push({ table, values });
          const updateChain: any = {
            eq() {
              return updateChain;
            },
            is() {
              return updateChain;
            },
            select: async () => ({ data: fixtures.reserveRows ?? [{ id: "delivery-1" }], error: null }),
            then(resolve: (value: unknown) => void) {
              resolve({ error: null });
            },
          };
          return updateChain;
        },
        then(resolve: (value: unknown) => void) {
          // Awaiting the filter chain directly (configs query has no terminal call).
          if (table === "sms_provider_configurations") {
            resolve({ data: fixtures.configs ?? [], error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };

  return { admin, updates };
}

const ACTIVE_CONFIG = {
  id: "config-1",
  provider_environment: "sandbox",
  readiness_status: "ready_for_activation",
  activation_status: "active",
  default_messaging_service_ref: "MG123",
};

const READY_SENDER = {
  id: "sender-1",
  verification_status: "verified",
  activation_status: "active",
  messaging_service_ref: null,
};

const READY_INTENT = {
  recipient_phone_snapshot: "+15551234567",
  message_body_snapshot: "On the way. Reply STOP to opt out.",
};

function readyFixtures(overrides?: Partial<Fixtures>): Fixtures {
  return {
    configs: [ACTIVE_CONFIG],
    senders: [READY_SENDER],
    timeZone: "America/Los_Angeles",
    intent: READY_INTENT,
    suppressions: [],
    reserveRows: [{ id: "delivery-1" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prepareSmsProviderDeliveryPreflightMock.mockResolvedValue({
    created: true,
    deduped: false,
    deliveryId: "delivery-1",
    readyForProviderSubmit: false,
    blockedReasons: [],
    warnings: [],
    providerName: "twilio",
    providerStatus: "not_submitted",
    liveSendEnabled: false,
  });
  sendTwilioSandboxMessageMock.mockResolvedValue({ messageSid: "SM-live-1", status: "queued" });
});

describe("isWithinSmsSendWindow", () => {
  it("allows sends inside 8am-9pm local time", () => {
    expect(isWithinSmsSendWindow({ timeZone: "America/Los_Angeles", now: NOON_PACIFIC })).toBe(true);
  });

  it("blocks sends outside the window", () => {
    expect(isWithinSmsSendWindow({ timeZone: "America/Los_Angeles", now: LATE_PACIFIC })).toBe(false);
  });

  it("evaluates the window in the given time zone", () => {
    // 19:00 UTC is 04:00 in Tokyo — outside the window there, inside in LA.
    expect(isWithinSmsSendWindow({ timeZone: "Asia/Tokyo", now: NOON_PACIFIC })).toBe(false);
  });

  it("fails closed on an invalid time zone", () => {
    expect(isWithinSmsSendWindow({ timeZone: "Not/AZone", now: NOON_PACIFIC })).toBe(false);
  });
});

describe("resolveSmsLiveProviderConfig", () => {
  it("blocks when no provider configuration exists", async () => {
    const { admin } = buildAdminMock({ configs: [] });
    const result = await resolveSmsLiveProviderConfig({ admin, accountOwnerUserId: "owner-1" });
    expect(result.ready).toBe(false);
    expect(result.blockedReasons).toContain("provider_configuration_missing");
  });

  it("blocks when activation is not active", async () => {
    const { admin } = buildAdminMock({
      configs: [{ ...ACTIVE_CONFIG, activation_status: "disabled" }],
      senders: [READY_SENDER],
    });
    const result = await resolveSmsLiveProviderConfig({ admin, accountOwnerUserId: "owner-1" });
    expect(result.ready).toBe(false);
    expect(result.blockedReasons).toContain("live_activation_disabled");
  });

  it("prefers a production row when both environments exist", async () => {
    const { admin } = buildAdminMock({
      configs: [
        { ...ACTIVE_CONFIG, id: "sandbox-row", activation_status: "disabled" },
        { ...ACTIVE_CONFIG, id: "prod-row", provider_environment: "production" },
      ],
      senders: [READY_SENDER],
    });
    const result = await resolveSmsLiveProviderConfig({ admin, accountOwnerUserId: "owner-1" });
    expect(result.ready).toBe(true);
    expect(result.providerConfigurationId).toBe("prod-row");
  });

  it("requires a ready sender and a messaging service ref", async () => {
    const noSender = buildAdminMock({ configs: [ACTIVE_CONFIG], senders: [] });
    expect(
      (await resolveSmsLiveProviderConfig({ admin: noSender.admin, accountOwnerUserId: "owner-1" }))
        .blockedReasons,
    ).toContain("sender_identity_not_ready");

    const noRef = buildAdminMock({
      configs: [{ ...ACTIVE_CONFIG, default_messaging_service_ref: null }],
      senders: [{ ...READY_SENDER, messaging_service_ref: null }],
    });
    expect(
      (await resolveSmsLiveProviderConfig({ admin: noRef.admin, accountOwnerUserId: "owner-1" }))
        .blockedReasons,
    ).toContain("messaging_service_missing");
  });
});

describe("attemptLiveOnTheWaySend", () => {
  it("returns not_activated without touching Twilio when activation is off", async () => {
    const { admin } = buildAdminMock(
      readyFixtures({ configs: [{ ...ACTIVE_CONFIG, activation_status: "disabled" }] }),
    );

    const result = await attemptLiveOnTheWaySend({
      admin,
      accountOwnerUserId: "owner-1",
      smsMessageIntentId: "intent-1",
      now: NOON_PACIFIC,
    });

    expect(result.outcome).toBe("not_activated");
    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
    expect(prepareSmsProviderDeliveryPreflightMock).not.toHaveBeenCalled();
  });

  it("holds sends outside quiet hours without creating a delivery", async () => {
    const { admin } = buildAdminMock(readyFixtures());

    const result = await attemptLiveOnTheWaySend({
      admin,
      accountOwnerUserId: "owner-1",
      smsMessageIntentId: "intent-1",
      now: LATE_PACIFIC,
    });

    expect(result.outcome).toBe("held_quiet_hours");
    expect(prepareSmsProviderDeliveryPreflightMock).not.toHaveBeenCalled();
    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
  });

  it("blocks when a suppression arrived after intent creation", async () => {
    const { admin } = buildAdminMock(readyFixtures({ suppressions: [{ id: "sup-1" }] }));

    const result = await attemptLiveOnTheWaySend({
      admin,
      accountOwnerUserId: "owner-1",
      smsMessageIntentId: "intent-1",
      now: NOON_PACIFIC,
    });

    expect(result.outcome).toBe("suppressed");
    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
  });

  it("sends via Twilio and records provider identifiers on success", async () => {
    const { admin, updates } = buildAdminMock(readyFixtures());

    const result = await attemptLiveOnTheWaySend({
      admin,
      accountOwnerUserId: "owner-1",
      smsMessageIntentId: "intent-1",
      now: NOON_PACIFIC,
    });

    expect(result.outcome).toBe("sent_to_provider");
    expect(result.deliveryId).toBe("delivery-1");
    expect(sendTwilioSandboxMessageMock).toHaveBeenCalledWith({
      to: "+15551234567",
      body: "On the way. Reply STOP to opt out.",
      messagingServiceSid: "MG123",
    });

    const reservation = updates.find((u) => u.values.provider_status === "submitted");
    expect(reservation).toBeTruthy();
    const success = updates.find((u) => u.values.provider_message_id === "SM-live-1");
    expect(success?.values.provider_status).toBe("queued");
  });

  it("returns already_handled when the guarded reservation loses the race", async () => {
    const { admin } = buildAdminMock(readyFixtures({ reserveRows: [] }));

    const result = await attemptLiveOnTheWaySend({
      admin,
      accountOwnerUserId: "owner-1",
      smsMessageIntentId: "intent-1",
      now: NOON_PACIFIC,
    });

    expect(result.outcome).toBe("already_handled");
    expect(sendTwilioSandboxMessageMock).not.toHaveBeenCalled();
  });

  it("records immediate provider failure on the delivery", async () => {
    sendTwilioSandboxMessageMock.mockRejectedValueOnce(
      new TwilioMessageError({ code: 21610, twilioStatus: "400", message: "Blocked recipient" }),
    );
    const { admin, updates } = buildAdminMock(readyFixtures());

    const result = await attemptLiveOnTheWaySend({
      admin,
      accountOwnerUserId: "owner-1",
      smsMessageIntentId: "intent-1",
      now: NOON_PACIFIC,
    });

    expect(result.outcome).toBe("provider_immediate_failure");
    const failure = updates.find((u) => u.values.provider_status === "failed");
    expect(failure?.values.provider_error_code).toBe("21610");
  });

  it("never throws — internal errors become an error outcome", async () => {
    prepareSmsProviderDeliveryPreflightMock.mockRejectedValueOnce(new Error("db down"));
    const { admin } = buildAdminMock(readyFixtures());

    const result = await attemptLiveOnTheWaySend({
      admin,
      accountOwnerUserId: "owner-1",
      smsMessageIntentId: "intent-1",
      now: NOON_PACIFIC,
    });

    expect(result.outcome).toBe("error");
    expect(result.detail).toContain("db down");
  });
});
