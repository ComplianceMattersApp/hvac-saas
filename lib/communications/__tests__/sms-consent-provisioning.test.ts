import { describe, expect, it, vi } from "vitest";
import {
  findSmsBackfillCandidates,
  provisionCustomerSmsRecipientAndConsent,
} from "@/lib/communications/sms-consent-provisioning";

type Fixtures = {
  existingRecipientId?: string | null;
  existingConsent?: boolean;
  recipientInsertError?: { code?: string; message?: string } | null;
  recipientReadError?: boolean;
};

function buildSupabaseMock(fixtures: Fixtures) {
  const recipientInserts: Array<Record<string, unknown>> = [];
  const consentInserts: Array<Record<string, unknown>> = [];
  let recipientSelectCount = 0;

  const supabase = {
    from(table: string) {
      if (table === "contact_recipients") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          limit: async () => {
            recipientSelectCount += 1;
            if (fixtures.recipientReadError) {
              return { data: null, error: { message: "read failed" } };
            }
            // First read: pre-insert check; later reads: post-conflict retry.
            if (recipientSelectCount === 1) {
              return {
                data: fixtures.existingRecipientId ? [{ id: fixtures.existingRecipientId }] : [],
                error: null,
              };
            }
            return { data: [{ id: "recipient-retry" }], error: null };
          },
          insert(values: Record<string, unknown>) {
            recipientInserts.push(values);
            return {
              select() {
                return {
                  single: async () =>
                    fixtures.recipientInsertError
                      ? { data: null, error: fixtures.recipientInsertError }
                      : { data: { id: "recipient-new" }, error: null },
                };
              },
            };
          },
        };
      }

      if (table === "contact_recipient_consents") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          limit: async () => ({
            data: fixtures.existingConsent ? [{ id: "consent-1" }] : [],
            error: null,
          }),
          insert: async (values: Record<string, unknown>) => {
            consentInserts.push(values);
            return { error: null };
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return { supabase, recipientInserts, consentInserts };
}

const BASE = {
  accountOwnerUserId: "owner-1",
  actingUserId: "admin-1",
  customerId: "customer-1",
  displayName: "Jane Customer",
  phoneRaw: "(209) 555-1234",
};

describe("provisionCustomerSmsRecipientAndConsent", () => {
  it("creates a customer_primary recipient and opted_in consent by default", async () => {
    const { supabase, recipientInserts, consentInserts } = buildSupabaseMock({});

    await provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE });

    expect(recipientInserts).toHaveLength(1);
    expect(recipientInserts[0]).toMatchObject({
      linked_entity_type: "customer",
      linked_entity_id: "customer-1",
      recipient_role: "customer_primary",
      phone_e164: "+12095551234",
      source_type: "seeded_from_customer",
      status: "active",
    });

    expect(consentInserts).toHaveLength(1);
    expect(consentInserts[0]).toMatchObject({
      contact_recipient_id: "recipient-new",
      message_class: "on_the_way",
      consent_status: "opted_in",
      consent_source: "service_intake_number_provided",
      consent_captured_by_user_id: "admin-1",
    });
  });

  it("records opted_out when declined", async () => {
    const { supabase, consentInserts } = buildSupabaseMock({});

    await provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE, declined: true });

    expect(consentInserts).toHaveLength(1);
    expect(consentInserts[0]).toMatchObject({
      consent_status: "opted_out",
      consent_source: "declined_at_intake",
    });
  });

  it("does nothing without a normalizable phone", async () => {
    const { supabase, recipientInserts, consentInserts } = buildSupabaseMock({});

    await provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE, phoneRaw: "n/a" });
    await provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE, phoneRaw: null });

    expect(recipientInserts).toHaveLength(0);
    expect(consentInserts).toHaveLength(0);
  });

  it("reuses an existing active recipient instead of inserting a duplicate", async () => {
    const { supabase, recipientInserts, consentInserts } = buildSupabaseMock({
      existingRecipientId: "recipient-existing",
    });

    await provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE });

    expect(recipientInserts).toHaveLength(0);
    expect(consentInserts[0]).toMatchObject({ contact_recipient_id: "recipient-existing" });
  });

  it("never overwrites an existing consent decision", async () => {
    const { supabase, consentInserts } = buildSupabaseMock({
      existingRecipientId: "recipient-existing",
      existingConsent: true,
    });

    await provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE });

    expect(consentInserts).toHaveLength(0);
  });

  it("recovers from a concurrent-insert unique conflict by re-reading", async () => {
    const { supabase, consentInserts } = buildSupabaseMock({
      recipientInsertError: { code: "23505", message: "duplicate" },
    });

    await provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE });

    expect(consentInserts).toHaveLength(1);
    expect(consentInserts[0]).toMatchObject({ contact_recipient_id: "recipient-retry" });
  });

  it("swallows unexpected failures without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = buildSupabaseMock({ recipientReadError: true });

    await expect(
      provisionCustomerSmsRecipientAndConsent({ supabase, ...BASE }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("findSmsBackfillCandidates", () => {
  function buildBackfillMock(fixtures: {
    customers: Array<Record<string, unknown>>;
    coveredCustomerIds?: string[];
  }) {
    return {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          order: () => chain,
          in: async () => ({
            data: (fixtures.coveredCustomerIds ?? []).map((id) => ({ linked_entity_id: id })),
            error: null,
          }),
          limit: async () => {
            if (table !== "customers") throw new Error(`unexpected limit on ${table}`);
            return { data: fixtures.customers, error: null };
          },
        };
        return chain;
      },
    };
  }

  it("returns phone-bearing customers without an active recipient", async () => {
    const supabase = buildBackfillMock({
      customers: [
        { id: "c-1", full_name: "Covered Customer", phone: "(209) 555-0001" },
        { id: "c-2", full_name: "Legacy Customer", phone: "(209) 555-0002" },
        { id: "c-3", full_name: "Bad Phone", phone: "n/a" },
      ],
      coveredCustomerIds: ["c-1"],
    });

    const result = await findSmsBackfillCandidates({
      supabase,
      accountOwnerUserId: "owner-1",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      customerId: "c-2",
      displayName: "Legacy Customer",
    });
  });

  it("respects the batch limit", async () => {
    const supabase = buildBackfillMock({
      customers: Array.from({ length: 5 }, (_, index) => ({
        id: `c-${index}`,
        full_name: `Customer ${index}`,
        phone: `(209) 555-000${index}`,
      })),
    });

    const result = await findSmsBackfillCandidates({
      supabase,
      accountOwnerUserId: "owner-1",
      limit: 2,
    });

    expect(result.candidates).toHaveLength(2);
  });

  it("returns empty without account scope", async () => {
    const supabase = buildBackfillMock({ customers: [] });
    const result = await findSmsBackfillCandidates({ supabase, accountOwnerUserId: "" });
    expect(result.candidates).toHaveLength(0);
  });
});
