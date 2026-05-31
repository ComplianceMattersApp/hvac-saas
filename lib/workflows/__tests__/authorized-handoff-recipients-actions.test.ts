import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error)
    && typeof error === "object"
    && (error as any).name === "InternalAccessError",
}));

const {
  archiveAuthorizedHandoffRecipient,
  createAuthorizedHandoffRecipient,
  updateAuthorizedHandoffRecipient,
} = await import("@/lib/workflows/authorized-handoff-recipients-actions");

const { listActiveAuthorizedHandoffRecipients } = await import("@/lib/workflows/authorized-handoff-recipients-read");

type RecipientRow = {
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

function makeRecipient(input: Partial<RecipientRow> & { id: string }): RecipientRow {
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

function makeAdminFixture(initialRows: RecipientRow[]) {
  const rows = [...initialRows];
  const tableCalls: string[] = [];

  function applyFilters(state: {
    eq: Array<[string, unknown]>;
    neq: Array<[string, unknown]>;
    isFilters: Array<[string, unknown]>;
  }) {
    return rows.filter((row: any) => {
      for (const [column, value] of state.eq) {
        if (row?.[column] !== value) return false;
      }
      for (const [column, value] of state.neq) {
        if (row?.[column] === value) return false;
      }
      for (const [column, value] of state.isFilters) {
        if (row?.[column] !== value) return false;
      }
      return true;
    });
  }

  const admin = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);
      if (table !== "authorized_handoff_recipients") {
        throw new Error(`Unexpected table ${table}`);
      }

      const state = {
        eq: [] as Array<[string, unknown]>,
        neq: [] as Array<[string, unknown]>,
        isFilters: [] as Array<[string, unknown]>,
      };

      let mode: "select" | "update" = "select";
      let updatePayload: Record<string, unknown> | null = null;
      let limitValue = 100;
      let selectedColumns = "*";

      const query: any = {
        select: vi.fn((columns?: string) => {
          selectedColumns = String(columns ?? "*");
          mode = "select";
          return query;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const id = `recipient-${rows.length + 1}`;
              const row = makeRecipient({
                id,
                ...payload,
                created_at: "2026-05-31T00:00:00Z",
                updated_at: "2026-05-31T00:00:00Z",
              } as any);
              rows.push(row);
              return { data: row, error: null };
            }),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          mode = "update";
          updatePayload = payload;
          return query;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          state.eq.push([column, value]);
          return query;
        }),
        neq: vi.fn((column: string, value: unknown) => {
          state.neq.push([column, value]);
          return query;
        }),
        is: vi.fn((column: string, value: unknown) => {
          state.isFilters.push([column, value]);
          return query;
        }),
        order: vi.fn(() => query),
        limit: vi.fn((value: number) => {
          limitValue = value;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          const data = applyFilters(state)[0] ?? null;
          return { data, error: null };
        }),
        then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) => {
          if (mode === "update") {
            const matches = applyFilters(state);
            for (const row of matches) {
              Object.assign(row, updatePayload ?? {});
            }
            return Promise.resolve({ data: matches, error: null }).then(resolve, reject);
          }

          const data = applyFilters(state).slice(0, limitValue);
          if (selectedColumns === "*" || selectedColumns.length > 0) {
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };

      return query;
    }),
  };

  return { admin, rows, tableCalls };
}

describe("authorized handoff recipient actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-user-1",
      internalUser: {
        account_owner_user_id: "owner-1",
        role: "admin",
      },
    });
  });

  it("owner/admin can create authorized ECC recipient", async () => {
    const fixture = makeAdminFixture([]);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const result = await createAuthorizedHandoffRecipient({
      recipientType: "external_manual",
      handoffKind: "ecc",
      displayName: "Primary Rater",
      externalContactName: "Jane Rater",
      isDefault: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.recipient.display_name).toBe("Primary Rater");
      expect(result.recipient.handoff_kind).toBe("ecc");
      expect(result.recipient.is_default).toBe(true);
    }
    expect(fixture.tableCalls.every((table) => table === "authorized_handoff_recipients")).toBe(true);
  });

  it("non-admin cannot create or update or archive recipients", async () => {
    requireInternalRoleMock.mockRejectedValue({
      name: "InternalAccessError",
      code: "INTERNAL_ROLE_REQUIRED",
      message: "Required internal role: admin",
    });

    createAdminClientMock.mockReturnValue(makeAdminFixture([]).admin);

    const createResult = await createAuthorizedHandoffRecipient({
      recipientType: "external_manual",
      handoffKind: "ecc",
      displayName: "Blocked",
    });
    expect(createResult).toEqual({ success: false, error: "Owner/admin access is required." });

    const updateResult = await updateAuthorizedHandoffRecipient({
      recipientId: "11111111-1111-4111-8111-111111111111",
      displayName: "Blocked",
    });
    expect(updateResult).toEqual({ success: false, error: "Owner/admin access is required." });

    const archiveResult = await archiveAuthorizedHandoffRecipient({
      recipientId: "11111111-1111-4111-8111-111111111111",
    });
    expect(archiveResult).toEqual({ success: false, error: "Owner/admin access is required." });
  });

  it("cross-account updates are rejected", async () => {
    const fixture = makeAdminFixture([
      makeRecipient({
        id: "11111111-1111-4111-8111-111111111111",
        account_owner_user_id: "owner-2",
      }),
    ]);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const result = await updateAuthorizedHandoffRecipient({
      recipientId: "11111111-1111-4111-8111-111111111111",
      displayName: "Should not update",
    });

    expect(result).toEqual({ success: false, error: "Recipient not found." });
  });

  it("default uniqueness is action-normalized", async () => {
    const fixture = makeAdminFixture([
      makeRecipient({
        id: "11111111-1111-4111-8111-111111111111",
        is_default: true,
        display_name: "First default",
      }),
    ]);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const createResult = await createAuthorizedHandoffRecipient({
      recipientType: "external_manual",
      handoffKind: "ecc",
      displayName: "Second default",
      isDefault: true,
    });

    expect(createResult.success).toBe(true);
    const defaults = fixture.rows.filter((row) => row.is_default && row.is_active && !row.archived_at);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].display_name).toBe("Second default");
  });

  it("archived recipient is removed from active selection", async () => {
    const fixture = makeAdminFixture([
      makeRecipient({
        id: "11111111-1111-4111-8111-111111111111",
        is_active: true,
        handoff_kind: "ecc",
      }),
    ]);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const archiveResult = await archiveAuthorizedHandoffRecipient({
      recipientId: "11111111-1111-4111-8111-111111111111",
    });

    expect(archiveResult.success).toBe(true);

    const active = await listActiveAuthorizedHandoffRecipients({
      supabase: fixture.admin as any,
      accountOwnerUserId: "owner-1",
      handoffKind: "ecc",
    });

    expect(active).toEqual([]);
  });

  it("does not touch job/service-case/job-event/payment/sms/qbo/portal tables", async () => {
    const fixture = makeAdminFixture([
      makeRecipient({
        id: "11111111-1111-4111-8111-111111111111",
        is_active: true,
        handoff_kind: "ecc",
      }),
    ]);
    createAdminClientMock.mockReturnValue(fixture.admin);

    await createAuthorizedHandoffRecipient({
      recipientType: "external_manual",
      handoffKind: "ecc",
      displayName: "Scoped recipient",
    });

    await updateAuthorizedHandoffRecipient({
      recipientId: "11111111-1111-4111-8111-111111111111",
      displayName: "Scoped recipient updated",
    });

    await archiveAuthorizedHandoffRecipient({
      recipientId: "11111111-1111-4111-8111-111111111111",
    });

    expect(new Set(fixture.tableCalls)).toEqual(new Set(["authorized_handoff_recipients"]));
  });
});
