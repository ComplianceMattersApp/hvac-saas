import { describe, expect, it, vi } from "vitest";

import {
  listContactRecipientsForAccount,
  listContactRecipientsForEntity,
  normalizeContactRecipientRow,
} from "@/lib/communications/contact-recipients-read";

type ContactRecipientFixture = {
  id: string;
  account_owner_user_id: string;
  linked_entity_type: string;
  linked_entity_id: string | null;
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

function makeRecipient(input: Partial<ContactRecipientFixture> & { id: string }): ContactRecipientFixture {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "owner-1",
    linked_entity_type: "customer",
    linked_entity_id: "customer-1",
    display_name: `Recipient ${input.id}`,
    phone_e164: "+15551234567",
    phone_last10: "5551234567",
    email: "recipient@example.com",
    recipient_role: "customer_primary",
    status: "inactive",
    preferred_contact_method: "sms",
    recipient_timezone: null,
    source_type: "manual",
    source_ref: null,
    notes: null,
    created_by_user_id: "internal-1",
    updated_by_user_id: "internal-1",
    deactivated_at: null,
    deactivated_by_user_id: null,
    created_at: "2026-05-14T12:00:00Z",
    updated_at: "2026-05-14T12:00:00Z",
    ...rest,
  };
}

function makeSupabase(
  rows: ContactRecipientFixture[],
  options?: {
    queryError?: unknown;
  },
) {
  const calls: Array<{ table: string; op: string; column?: string; value?: unknown }> = [];
  const queryError = options?.queryError ?? null;

  const supabase = {
    from(table: string) {
      calls.push({ table, op: "from" });
      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      let limitValue: number | null = null;

      const resolve = () => {
        if (queryError) {
          return { data: null, error: queryError };
        }

        let data = [...rows];
        for (const [column, value] of eqFilters) {
          data = data.filter((row: any) => row?.[column] === value);
        }
        for (const [column, value] of inFilters) {
          data = data.filter((row: any) => value.includes(row?.[column]));
        }
        data.sort((left, right) => String(left.display_name).localeCompare(String(right.display_name)));
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
        in: vi.fn((column: string, value: unknown[]) => {
          calls.push({ table, op: "in", column, value });
          inFilters.push([column, value]);
          return query;
        }),
        order: vi.fn(() => {
          calls.push({ table, op: "order" });
          return query;
        }),
        limit: vi.fn((value: number) => {
          calls.push({ table, op: "limit", value });
          limitValue = value;
          return query;
        }),
        then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onFulfilled, onRejected),
      };

      return query;
    },
  };

  return { supabase, calls };
}

describe("contact recipient read model", () => {
  it("normalizes and trims row fields safely", () => {
    const normalized = normalizeContactRecipientRow({
      id: " recipient-1 ",
      account_owner_user_id: " owner-1 ",
      linked_entity_type: " customer ",
      linked_entity_id: " customer-1 ",
      display_name: "  Maya Lopez  ",
      phone_e164: " +15551234567 ",
      phone_last10: null,
      email: " maya@example.com ",
      recipient_role: " customer_primary ",
      status: " inactive ",
      preferred_contact_method: " sms ",
      recipient_timezone: " America/Los_Angeles ",
      source_type: " manual ",
      source_ref: "  import-1  ",
      notes: "  note  ",
      created_by_user_id: " internal-1 ",
      updated_by_user_id: " internal-2 ",
      deactivated_at: null,
      deactivated_by_user_id: null,
      created_at: " 2026-05-14T12:00:00Z ",
      updated_at: " 2026-05-14T12:01:00Z ",
    });

    expect(normalized).toEqual({
      id: "recipient-1",
      account_owner_user_id: "owner-1",
      linked_entity_type: "customer",
      linked_entity_id: "customer-1",
      display_name: "Maya Lopez",
      phone_e164: "+15551234567",
      phone_last10: "5551234567",
      email: "maya@example.com",
      recipient_role: "customer_primary",
      status: "inactive",
      preferred_contact_method: "sms",
      recipient_timezone: "America/Los_Angeles",
      source_type: "manual",
      source_ref: "import-1",
      notes: "note",
      created_by_user_id: "internal-1",
      updated_by_user_id: "internal-2",
      deactivated_at: null,
      deactivated_by_user_id: null,
      created_at: "2026-05-14T12:00:00Z",
      updated_at: "2026-05-14T12:01:00Z",
    });
  });

  it("returns safe empty when account scope is missing", async () => {
    const { supabase, calls } = makeSupabase([makeRecipient({ id: "recipient-1" })]);

    const rows = await listContactRecipientsForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "",
    });

    expect(rows).toEqual([]);
    expect(calls.some((call) => call.op === "from")).toBe(false);
  });

  it("returns safe empty when contact_recipients is missing from schema cache", async () => {
    const queryError = {
      code: "PGRST205",
      message: "Could not find the table 'contact_recipients' in the schema cache",
    };

    const { supabase } = makeSupabase([], { queryError });

    const rows = await listContactRecipientsForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(rows).toEqual([]);
  });

  it("returns safe empty when contact_recipients relation is missing", async () => {
    const queryError = {
      code: "42P01",
      message: 'relation "public.contact_recipients" does not exist',
    };

    const { supabase } = makeSupabase([], { queryError });

    const rows = await listContactRecipientsForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(rows).toEqual([]);
  });

  it("throws for non-missing-table query errors", async () => {
    const queryError = {
      code: "42501",
      message: "permission denied for table contact_recipients",
    };

    const { supabase } = makeSupabase([], { queryError });

    await expect(
      listContactRecipientsForAccount({
        supabase: supabase as any,
        accountOwnerUserId: "owner-1",
      }),
    ).rejects.toBe(queryError);
  });

  it("filters by entity, role, and status", async () => {
    const { supabase } = makeSupabase([
      makeRecipient({
        id: "recipient-1",
        account_owner_user_id: "owner-1",
        linked_entity_type: "customer",
        linked_entity_id: "customer-1",
        recipient_role: "customer_primary",
        status: "active",
      }),
      makeRecipient({
        id: "recipient-2",
        account_owner_user_id: "owner-1",
        linked_entity_type: "customer",
        linked_entity_id: "customer-2",
        recipient_role: "customer_primary",
        status: "active",
      }),
      makeRecipient({
        id: "recipient-3",
        account_owner_user_id: "owner-1",
        linked_entity_type: "customer",
        linked_entity_id: "customer-1",
        recipient_role: "customer_alt",
        status: "inactive",
      }),
    ]);

    const rows = await listContactRecipientsForEntity({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      linkedEntityType: "customer",
      linkedEntityId: "customer-1",
      recipientRole: "customer_primary",
      status: "active",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("recipient-1");
    expect(rows[0]?.linked_entity_id).toBe("customer-1");
    expect(rows[0]?.recipient_role).toBe("customer_primary");
    expect(rows[0]?.status).toBe("active");
  });

  it("reads only contact_recipients and never infers from job snapshots", async () => {
    const { supabase, calls } = makeSupabase([
      makeRecipient({ id: "recipient-1", linked_entity_type: "job", linked_entity_id: "job-1" }),
    ]);

    await listContactRecipientsForAccount({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      linkedEntityType: "job",
      linkedEntityId: "job-1",
      status: ["active", "inactive"],
    });

    const fromTables = calls.filter((call) => call.op === "from").map((call) => call.table);
    expect(fromTables).toEqual(["contact_recipients"]);
    expect(fromTables.includes("jobs")).toBe(false);
    expect(fromTables.includes("customers")).toBe(false);
  });
});
