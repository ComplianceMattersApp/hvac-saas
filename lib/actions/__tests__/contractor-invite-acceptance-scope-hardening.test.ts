import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();

type InviteRow = {
  id: string;
  contractor_id: string;
  owner_user_id: string;
  auth_user_id: string | null;
  email: string;
  status: "pending" | "accepted";
  created_at: string;
};

type ContractorRow = {
  id: string;
  owner_user_id: string;
};

type FixtureOptions = {
  invites?: InviteRow[];
  contractors?: Record<string, ContractorRow>;
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

function buildAdminFixture(options: FixtureOptions = {}) {
  const invites = [...(options.invites ?? [])];
  const contractors = { ...(options.contractors ?? {}) };

  const contractorUserWrites: Array<{ contractor_id: string; user_id: string }> = [];
  const contractorInviteWrites: Array<{ id: string; status?: string; auth_user_id?: string }> = [];

  function buildSelectQuery(table: string) {
    const filters: Array<{ type: "eq" | "ilike"; column: string; value: unknown }> = [];

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ type: "eq", column, value });
        return query;
      }),
      ilike: vi.fn((column: string, value: unknown) => {
        filters.push({ type: "ilike", column, value });
        return query;
      }),
      order: vi.fn(() => query),
      limit: vi.fn((count: number) => {
        query.__limit = count;
        return query;
      }),
      maybeSingle: vi.fn(async () => resolveMaybeSingle()),
      then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveThenable()).then(onFulfilled, onRejected),
    };

    function getEq(column: string) {
      return filters.find((f) => f.type === "eq" && f.column === column)?.value;
    }

    function resolveContractorInvites() {
      let rows = invites;

      const authUserId = getEq("auth_user_id");
      if (authUserId !== undefined) {
        rows = rows.filter((row) => String(row.auth_user_id ?? "") === String(authUserId ?? ""));
      }

      const status = getEq("status");
      if (status !== undefined) {
        rows = rows.filter((row) => String(row.status) === String(status));
      }

      const ilikeEmail = filters.find((f) => f.type === "ilike" && f.column === "email")?.value;
      if (ilikeEmail !== undefined) {
        const target = String(ilikeEmail ?? "").trim().toLowerCase();
        rows = rows.filter((row) => String(row.email).trim().toLowerCase() === target);
      }

      const limit = Number(query.__limit ?? rows.length);
      return rows.slice(0, limit);
    }

    function resolveMaybeSingle() {
      if (table === "contractors") {
        const id = String(getEq("id") ?? "").trim();
        const row = id ? contractors[id] ?? null : null;
        return { data: row, error: null };
      }

      if (table === "contractor_users") {
        return { data: null, error: null };
      }

      throw new Error(`Unexpected maybeSingle table: ${table}`);
    }

    function resolveThenable() {
      if (table === "contractor_invites") {
        return { data: resolveContractorInvites(), error: null };
      }

      throw new Error(`Unexpected thenable table: ${table}`);
    }

    return query;
  }

  function buildUpdateQuery(table: string, payload: any) {
    const filters: Array<{ column: string; value: unknown }> = [];

    const query: any = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value });
        return query;
      }),
      then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) => {
        if (table === "contractor_invites") {
          const id = String(filters.find((f) => f.column === "id")?.value ?? "").trim();
          contractorInviteWrites.push({
            id,
            status: payload?.status,
            auth_user_id: payload?.auth_user_id,
          });
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        }

        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      },
    };

    return query;
  }

  const admin = {
    from(table: string) {
      return {
        ...buildSelectQuery(table),
        upsert: vi.fn(async (payload: any) => {
          if (table === "contractor_users") {
            contractorUserWrites.push({
              contractor_id: String(payload?.contractor_id ?? ""),
              user_id: String(payload?.user_id ?? ""),
            });
          }
          return { error: null };
        }),
        update: vi.fn((payload: any) => buildUpdateQuery(table, payload)),
      };
    },
  };

  return {
    admin,
    contractorUserWrites,
    contractorInviteWrites,
  };
}

describe("contractor invite acceptance same-scope hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "user-1",
              email: "contractor@example.com",
            },
          },
          error: null,
        })),
      },
    });
  });

  it("allows deterministic same-scope acceptance via auth_user_id", async () => {
    const fixture = buildAdminFixture({
      invites: [
        {
          id: "invite-1",
          contractor_id: "contractor-1",
          owner_user_id: "owner-1",
          auth_user_id: "user-1",
          email: "contractor@example.com",
          status: "pending",
          created_at: "2026-04-24T00:00:00.000Z",
        },
      ],
      contractors: {
        "contractor-1": {
          id: "contractor-1",
          owner_user_id: "owner-1",
        },
      },
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { ensureContractorMembershipFromInvite } = await import(
      "@/lib/actions/contractor-acceptance-actions"
    );

    await expect(ensureContractorMembershipFromInvite()).resolves.toEqual({
      isContractor: true,
      error: undefined,
    });

    expect(fixture.contractorUserWrites).toHaveLength(1);
    expect(fixture.contractorUserWrites[0]).toEqual({
      contractor_id: "contractor-1",
      user_id: "user-1",
    });

    expect(fixture.contractorInviteWrites).toHaveLength(1);
    expect(fixture.contractorInviteWrites[0]).toMatchObject({
      id: "invite-1",
      status: "accepted",
      auth_user_id: "user-1",
    });
  });

  it("denies ambiguous fallback-by-email scope before contractor_users/contractor_invites writes", async () => {
    const fixture = buildAdminFixture({
      invites: [
        {
          id: "invite-a",
          contractor_id: "contractor-1",
          owner_user_id: "owner-1",
          auth_user_id: null,
          email: "contractor@example.com",
          status: "pending",
          created_at: "2026-04-24T00:00:00.000Z",
        },
        {
          id: "invite-b",
          contractor_id: "contractor-2",
          owner_user_id: "owner-2",
          auth_user_id: null,
          email: "contractor@example.com",
          status: "pending",
          created_at: "2026-04-24T01:00:00.000Z",
        },
      ],
      contractors: {
        "contractor-1": { id: "contractor-1", owner_user_id: "owner-1" },
        "contractor-2": { id: "contractor-2", owner_user_id: "owner-2" },
      },
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { ensureContractorMembershipFromInvite } = await import(
      "@/lib/actions/contractor-acceptance-actions"
    );

    await expect(ensureContractorMembershipFromInvite()).resolves.toEqual({
      isContractor: false,
      error: "INVITE_SCOPE_AMBIGUOUS",
    });

    expect(fixture.contractorUserWrites).toHaveLength(0);
    expect(fixture.contractorInviteWrites).toHaveLength(0);
  });

  it("denies invalid contractor/account scope before contractor_users/contractor_invites writes", async () => {
    const fixture = buildAdminFixture({
      invites: [
        {
          id: "invite-1",
          contractor_id: "contractor-1",
          owner_user_id: "owner-1",
          auth_user_id: null,
          email: "contractor@example.com",
          status: "pending",
          created_at: "2026-04-24T00:00:00.000Z",
        },
      ],
      contractors: {
        "contractor-1": {
          id: "contractor-1",
          owner_user_id: "owner-2",
        },
      },
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { ensureContractorMembershipFromInvite } = await import(
      "@/lib/actions/contractor-acceptance-actions"
    );

    await expect(ensureContractorMembershipFromInvite()).resolves.toEqual({
      isContractor: false,
      error: "INVITE_SCOPE_INVALID",
    });

    expect(fixture.contractorUserWrites).toHaveLength(0);
    expect(fixture.contractorInviteWrites).toHaveLength(0);
  });
});
