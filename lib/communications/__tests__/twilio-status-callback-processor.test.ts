import { describe, expect, it } from "vitest";
import { processTwilioStatusCallback } from "@/lib/communications/twilio-status-callback-processor";

type DeliveryFixture = {
  id: string;
  account_owner_user_id: string;
  provider_status: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
};

function makeDelivery(overrides?: Partial<DeliveryFixture>): DeliveryFixture {
  return {
    id: "delivery-1",
    account_owner_user_id: "owner-1",
    provider_status: "submitted",
    sent_at: null,
    delivered_at: null,
    failed_at: null,
    ...overrides,
  };
}

function buildAdminMock(fixtures: {
  delivery: DeliveryFixture | null;
  readError?: boolean;
  updateError?: boolean;
}) {
  const updates: Array<Record<string, unknown>> = [];

  const admin = {
    from(table: string) {
      if (table !== "sms_provider_deliveries") {
        throw new Error(`unexpected table ${table}`);
      }

      return {
        select() {
          return {
            eq() {
              return this;
            },
            maybeSingle: async () =>
              fixtures.readError
                ? { data: null, error: { message: "read failed" } }
                : { data: fixtures.delivery, error: null },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return {
            eq() {
              return this;
            },
            then(resolve: (value: unknown) => void) {
              resolve(
                fixtures.updateError
                  ? { error: { message: "update failed" } }
                  : { error: null },
              );
            },
          };
        },
      };
    },
  };

  return { admin, updates };
}

const NOW = "2026-08-04T20:00:00.000Z";

describe("processTwilioStatusCallback", () => {
  it("ignores callbacks missing MessageSid or MessageStatus", async () => {
    const { admin } = buildAdminMock({ delivery: makeDelivery() });

    expect(
      (await processTwilioStatusCallback({ admin, params: { MessageStatus: "sent" }, now: NOW }))
        .outcome,
    ).toBe("ignored_missing_fields");

    expect(
      (await processTwilioStatusCallback({ admin, params: { MessageSid: "SM1" }, now: NOW }))
        .outcome,
    ).toBe("ignored_missing_fields");
  });

  it("ignores callbacks for unknown message sids", async () => {
    const { admin, updates } = buildAdminMock({ delivery: null });

    const result = await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM-unknown", MessageStatus: "delivered" },
      now: NOW,
    });

    expect(result.outcome).toBe("ignored_unknown_message");
    expect(updates).toHaveLength(0);
  });

  it("applies a sent callback and stamps sent_at once", async () => {
    const { admin, updates } = buildAdminMock({ delivery: makeDelivery() });

    const result = await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM1", MessageStatus: "sent" },
      now: NOW,
    });

    expect(result.outcome).toBe("updated");
    expect(result.normalizedStatus).toBe("sent");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      provider_status: "sent",
      provider_raw_status: "sent",
      sent_at: NOW,
      provider_last_event_at: NOW,
    });
    expect(updates[0].delivered_at).toBeUndefined();
  });

  it("applies delivered, backfills sent_at, and stamps delivered_at", async () => {
    const { admin, updates } = buildAdminMock({
      delivery: makeDelivery({ provider_status: "sent", sent_at: null }),
    });

    const result = await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM1", MessageStatus: "delivered" },
      now: NOW,
    });

    expect(result.outcome).toBe("updated");
    expect(updates[0]).toMatchObject({
      provider_status: "delivered",
      sent_at: NOW,
      delivered_at: NOW,
    });
  });

  it("does not restamp sent_at when already present", async () => {
    const earlier = "2026-08-04T19:00:00.000Z";
    const { admin, updates } = buildAdminMock({
      delivery: makeDelivery({ provider_status: "sent", sent_at: earlier }),
    });

    await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM1", MessageStatus: "delivered" },
      now: NOW,
    });

    expect(updates[0].sent_at).toBeUndefined();
    expect(updates[0].delivered_at).toBe(NOW);
  });

  it("ignores out-of-order earlier statuses after delivered", async () => {
    const { admin, updates } = buildAdminMock({
      delivery: makeDelivery({ provider_status: "delivered" }),
    });

    const result = await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM1", MessageStatus: "sent" },
      now: NOW,
    });

    expect(result.outcome).toBe("ignored_stale_status");
    expect(updates).toHaveLength(0);
  });

  it("re-applies duplicate callbacks idempotently", async () => {
    const { admin, updates } = buildAdminMock({
      delivery: makeDelivery({ provider_status: "sent", sent_at: NOW }),
    });

    const result = await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM1", MessageStatus: "sent" },
      now: NOW,
    });

    expect(result.outcome).toBe("updated");
    expect(updates[0]).toMatchObject({ provider_status: "sent" });
  });

  it("records failure with error code, failed_at, and sanitized message", async () => {
    const { admin, updates } = buildAdminMock({ delivery: makeDelivery() });

    const result = await processTwilioStatusCallback({
      admin,
      params: {
        MessageSid: "SM1",
        MessageStatus: "failed",
        ErrorCode: "30006",
        ErrorMessage: `Blocked for account ${"AC" + "a".repeat(32)} carrier violation`,
      },
      now: NOW,
    });

    expect(result.outcome).toBe("updated");
    expect(updates[0]).toMatchObject({
      provider_status: "failed",
      failed_at: NOW,
      provider_error_code: "30006",
    });
    expect(String(updates[0].provider_error_message)).toContain("[redacted]");
    expect(String(updates[0].provider_error_message)).not.toMatch(/AC[a-f0-9]{32}/i);
  });

  it("normalizes undelivered as a terminal failure state", async () => {
    const { admin, updates } = buildAdminMock({
      delivery: makeDelivery({ provider_status: "sent" }),
    });

    const result = await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM1", MessageStatus: "undelivered" },
      now: NOW,
    });

    expect(result.outcome).toBe("updated");
    expect(updates[0]).toMatchObject({ provider_status: "undelivered", failed_at: NOW });
  });

  it("stores an allowlisted payload snapshot only", async () => {
    const { admin, updates } = buildAdminMock({ delivery: makeDelivery() });

    await processTwilioStatusCallback({
      admin,
      params: {
        MessageSid: "SM1",
        MessageStatus: "sent",
        To: "+15551234567",
        From: "+15559876543",
        Body: "should never be stored",
        AccountSid: "AC" + "a".repeat(32),
      },
      now: NOW,
    });

    const snapshot = updates[0].provider_callback_payload_snapshot as Record<string, string>;
    expect(snapshot.MessageSid).toBe("SM1");
    expect(snapshot.MessageStatus).toBe("sent");
    expect(snapshot.received_at).toBe(NOW);
    expect(snapshot.To).toBeUndefined();
    expect(snapshot.From).toBeUndefined();
    expect(snapshot.Body).toBeUndefined();
    expect(snapshot.AccountSid).toBeUndefined();
  });

  it("maps unrecognized statuses to unknown without regressing rank", async () => {
    const { admin, updates } = buildAdminMock({
      delivery: makeDelivery({ provider_status: "delivered" }),
    });

    const result = await processTwilioStatusCallback({
      admin,
      params: { MessageSid: "SM1", MessageStatus: "someday-new-status" },
      now: NOW,
    });

    expect(result.outcome).toBe("ignored_stale_status");
    expect(updates).toHaveLength(0);
  });

  it("throws when the delivery read fails", async () => {
    const { admin } = buildAdminMock({ delivery: makeDelivery(), readError: true });

    await expect(
      processTwilioStatusCallback({
        admin,
        params: { MessageSid: "SM1", MessageStatus: "sent" },
        now: NOW,
      }),
    ).rejects.toBeTruthy();
  });
});
