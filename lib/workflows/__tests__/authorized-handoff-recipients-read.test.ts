import { describe, expect, it, vi } from "vitest";

import {
  listActiveAuthorizedHandoffRecipients,
  normalizeAuthorizedHandoffRecipientRow,
  resolveActiveAuthorizedHandoffRecipientSelection,
} from "@/lib/workflows/authorized-handoff-recipients-read";

type RecipientFixture = {
  id: string;
  account_owner_user_id: string;
  recipient_type: string;
  handoff_kind: string;
  display_name: string;
  internal_user_id: string | null;
  external_company_name: string | null;
  external_contact_name: string | null;
  external_email: string | null;
  external_phone: string | null;
  connected_account_owner_user_id: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

function makeRecipient(input: Partial<RecipientFixture> & { id: string }): RecipientFixture {
  const { id, ...rest } = input;
  return {
    id,
    account_owner_user_id: "owner-1",
    recipient_type: "external_manual",
    handoff_kind: "ecc",
    display_name: `Recipient ${input.id}`,
    internal_user_id: null,
    external_company_name: null,
    external_contact_name: null,
    external_email: null,
    external_phone: null,
    connected_account_owner_user_id: null,
    is_default: false,
    is_active: true,
    notes: null,
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-05-31T00:00:00Z",
    updated_at: "2026-05-31T00:00:00Z",
    archived_at: null,
    ...rest,
  };
}

function makeSupabase(rows: RecipientFixture[], queryError?: unknown) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "authorized_handoff_recipients") {
        throw new Error(`Unexpected table ${table}`);
      }

      const eqFilters: Array<[string, unknown]> = [];
      let isFilter: [string, unknown] | null = null;
      let limitValue = 100;

      const resolve = () => {
        if (queryError) {
          return { data: null, error: queryError };
        }

        let data = [...rows];
        for (const [column, value] of eqFilters) {
          data = data.filter((row: any) => row?.[column] === value);
        }
        if (isFilter) {
          const [column, value] = isFilter;
          data = data.filter((row: any) => row?.[column] === value);
        }

        data.sort((left, right) => {
          if (Boolean(left.is_default) !== Boolean(right.is_default)) {
            return left.is_default ? -1 : 1;
          }
          return String(left.display_name).localeCompare(String(right.display_name));
        });

        return { data: data.slice(0, limitValue), error: null };
      };

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          eqFilters.push([column, value]);
          return query;
        }),
        is: vi.fn((column: string, value: unknown) => {
          isFilter = [column, value];
          return query;
        }),
        order: vi.fn(() => query),
        limit: vi.fn((value: number) => {
          limitValue = value;
          return query;
        }),
        then: (resolveFn: (value: any) => unknown, rejectFn?: (reason: unknown) => unknown) =>
          Promise.resolve(resolve()).then(resolveFn, rejectFn),
      };

      return query;
    }),
  };
}

describe("authorized handoff recipients read model", () => {
  it("normalizes row shape", () => {
    const normalized = normalizeAuthorizedHandoffRecipientRow(makeRecipient({
      id: "recipient-1",
      display_name: "  Main Rater  ",
      external_email: "  rater@example.com ",
    }));

    expect(normalized?.display_name).toBe("Main Rater");
    expect(normalized?.external_email).toBe("rater@example.com");
  });

  it("returns empty when account scope is missing", async () => {
    const supabase = makeSupabase([makeRecipient({ id: "recipient-1" })]);

    const rows = await listActiveAuthorizedHandoffRecipients({
      supabase: supabase as any,
      accountOwnerUserId: "",
    });

    expect(rows).toEqual([]);
  });

  it("returns safe empty when table is missing", async () => {
    const supabase = makeSupabase([], {
      code: "PGRST205",
      message: "Could not find the table 'authorized_handoff_recipients' in the schema cache",
    });

    const rows = await listActiveAuthorizedHandoffRecipients({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
    });

    expect(rows).toEqual([]);
  });

  it("returns only active ecc recipients for account scope", async () => {
    const supabase = makeSupabase([
      makeRecipient({ id: "recipient-1", account_owner_user_id: "owner-1", handoff_kind: "ecc", is_active: true, archived_at: null }),
      makeRecipient({ id: "recipient-2", account_owner_user_id: "owner-1", handoff_kind: "general_future", is_active: true, archived_at: null }),
      makeRecipient({ id: "recipient-3", account_owner_user_id: "owner-1", handoff_kind: "ecc", is_active: false, archived_at: null }),
      makeRecipient({ id: "recipient-4", account_owner_user_id: "owner-2", handoff_kind: "ecc", is_active: true, archived_at: null }),
      makeRecipient({ id: "recipient-5", account_owner_user_id: "owner-1", handoff_kind: "ecc", is_active: true, archived_at: "2026-05-31T00:00:00Z" }),
    ]);

    const rows = await listActiveAuthorizedHandoffRecipients({
      supabase: supabase as any,
      accountOwnerUserId: "owner-1",
      handoffKind: "ecc",
    });

    expect(rows.map((row) => row.id)).toEqual(["recipient-1"]);
  });

  it("selection helper supports zero, one, and multiple recipients", async () => {
    const noneState = await resolveActiveAuthorizedHandoffRecipientSelection({
      supabase: makeSupabase([]) as any,
      accountOwnerUserId: "owner-1",
      handoffKind: "ecc",
    });
    expect(noneState.mode).toBe("none");

    const oneState = await resolveActiveAuthorizedHandoffRecipientSelection({
      supabase: makeSupabase([makeRecipient({ id: "recipient-1" })]) as any,
      accountOwnerUserId: "owner-1",
      handoffKind: "ecc",
    });
    expect(oneState.mode).toBe("single");
    expect(oneState.preselectedRecipientId).toBe("recipient-1");

    const multiState = await resolveActiveAuthorizedHandoffRecipientSelection({
      supabase: makeSupabase([
        makeRecipient({ id: "recipient-2", display_name: "Zulu", is_default: false }),
        makeRecipient({ id: "recipient-1", display_name: "Alpha", is_default: true }),
      ]) as any,
      accountOwnerUserId: "owner-1",
      handoffKind: "ecc",
    });
    expect(multiState.mode).toBe("multiple");
    expect(multiState.defaultRecipientId).toBe("recipient-1");
    expect(multiState.preselectedRecipientId).toBe("recipient-1");
  });
});
