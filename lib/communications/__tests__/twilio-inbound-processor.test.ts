import { describe, expect, it } from "vitest";
import { processTwilioInboundMessage } from "@/lib/communications/twilio-inbound-processor";

const NOW = "2026-08-04T20:00:00.000Z";
const TENANT_NUMBER = "+15550001111";
const CUSTOMER_NUMBER = "+15552223333";

function buildAdminMock(fixtures: {
  senderAccountOwnerUserId?: string | null;
  senderReadError?: boolean;
  insertError?: { code?: string; message?: string } | null;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const senderQueries: Array<Record<string, unknown>> = [];

  const admin = {
    from(table: string) {
      if (table === "sms_sender_identities") {
        const filters: Record<string, unknown> = {};
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters[column] = value;
            return this;
          },
          limit: async () => {
            senderQueries.push(filters);
            if (fixtures.senderReadError) {
              return { data: null, error: { message: "read failed" } };
            }
            return {
              data: fixtures.senderAccountOwnerUserId
                ? [{ account_owner_user_id: fixtures.senderAccountOwnerUserId }]
                : [],
              error: null,
            };
          },
        };
      }

      if (table === "contact_recipient_suppressions") {
        return {
          insert: async (values: Record<string, unknown>) => {
            inserts.push(values);
            return { error: fixtures.insertError ?? null };
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { admin, inserts, senderQueries };
}

describe("processTwilioInboundMessage", () => {
  it("ignores requests missing From or To", async () => {
    const { admin } = buildAdminMock({ senderAccountOwnerUserId: "owner-1" });

    expect(
      (await processTwilioInboundMessage({ admin, params: { To: TENANT_NUMBER, Body: "STOP" } }))
        .outcome,
    ).toBe("ignored_missing_fields");

    expect(
      (await processTwilioInboundMessage({ admin, params: { From: CUSTOMER_NUMBER, Body: "STOP" } }))
        .outcome,
    ).toBe("ignored_missing_fields");
  });

  it("ignores non-keyword conversational messages without any write", async () => {
    const { admin, inserts } = buildAdminMock({ senderAccountOwnerUserId: "owner-1" });

    const result = await processTwilioInboundMessage({
      admin,
      params: { From: CUSTOMER_NUMBER, To: TENANT_NUMBER, Body: "Thanks, see you soon" },
    });

    expect(result.outcome).toBe("ignored_non_keyword");
    expect(inserts).toHaveLength(0);
  });

  it("ignores keywords when no tenant sender identity matches the To number", async () => {
    const { admin, inserts } = buildAdminMock({ senderAccountOwnerUserId: null });

    const result = await processTwilioInboundMessage({
      admin,
      params: { From: CUSTOMER_NUMBER, To: TENANT_NUMBER, Body: "STOP" },
    });

    expect(result.outcome).toBe("ignored_no_account_match");
    expect(inserts).toHaveLength(0);
  });

  it("records a phone-level stop_keyword suppression for STOP", async () => {
    const { admin, inserts, senderQueries } = buildAdminMock({
      senderAccountOwnerUserId: "owner-1",
    });

    const result = await processTwilioInboundMessage({
      admin,
      params: {
        From: CUSTOMER_NUMBER,
        To: TENANT_NUMBER,
        Body: "STOP",
        MessageSid: "SM-inbound-1",
      },
      now: NOW,
    });

    expect(result.outcome).toBe("stop_recorded");
    expect(result.accountOwnerUserId).toBe("owner-1");
    expect(senderQueries[0]).toMatchObject({ phone_e164: TENANT_NUMBER });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      phone_e164: CUSTOMER_NUMBER,
      suppression_type: "stop_keyword",
      source: "inbound_stop",
      is_active: true,
      suppressed_at: NOW,
      provider_name: "twilio",
      provider_message_id: "SM-inbound-1",
      received_keyword: "stop",
    });
  });

  it("handles STOP keyword variants case-insensitively", async () => {
    for (const body of ["stop", "STOPALL", "Unsubscribe", "CANCEL", "End", "quit", "STOP."]) {
      const { admin, inserts } = buildAdminMock({ senderAccountOwnerUserId: "owner-1" });

      const result = await processTwilioInboundMessage({
        admin,
        params: { From: CUSTOMER_NUMBER, To: TENANT_NUMBER, Body: body },
        now: NOW,
      });

      expect(result.outcome).toBe("stop_recorded");
      expect(inserts).toHaveLength(1);
    }
  });

  it("treats an existing active suppression (unique violation) as already recorded", async () => {
    const { admin } = buildAdminMock({
      senderAccountOwnerUserId: "owner-1",
      insertError: { code: "23505", message: "duplicate key" },
    });

    const result = await processTwilioInboundMessage({
      admin,
      params: { From: CUSTOMER_NUMBER, To: TENANT_NUMBER, Body: "STOP" },
      now: NOW,
    });

    expect(result.outcome).toBe("stop_already_recorded");
  });

  it("acknowledges START without lifting suppression and without any write", async () => {
    const { admin, inserts } = buildAdminMock({ senderAccountOwnerUserId: "owner-1" });

    const result = await processTwilioInboundMessage({
      admin,
      params: { From: CUSTOMER_NUMBER, To: TENANT_NUMBER, Body: "START" },
      now: NOW,
    });

    expect(result.outcome).toBe("start_received_no_auto_lift");
    expect(inserts).toHaveLength(0);
  });

  it("acknowledges HELP without any write", async () => {
    const { admin, inserts } = buildAdminMock({ senderAccountOwnerUserId: "owner-1" });

    const result = await processTwilioInboundMessage({
      admin,
      params: { From: CUSTOMER_NUMBER, To: TENANT_NUMBER, Body: "help" },
      now: NOW,
    });

    expect(result.outcome).toBe("help_received");
    expect(inserts).toHaveLength(0);
  });

  it("throws when a non-unique-violation insert error occurs", async () => {
    const { admin } = buildAdminMock({
      senderAccountOwnerUserId: "owner-1",
      insertError: { code: "XX000", message: "insert failed" },
    });

    await expect(
      processTwilioInboundMessage({
        admin,
        params: { From: CUSTOMER_NUMBER, To: TENANT_NUMBER, Body: "STOP" },
        now: NOW,
      }),
    ).rejects.toBeTruthy();
  });
});
