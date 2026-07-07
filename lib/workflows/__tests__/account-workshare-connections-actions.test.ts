import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error)
    && typeof error === "object"
    && (error as any).name === "InternalAccessError",
}));

import {
  acceptAccountWorkshareInvite,
  createAccountWorkshareInvite,
  createAccountWorkshareInviteFromForm,
  disableAccountWorkshareConnection,
  revokeAccountWorkshareConnection,
} from "../account-workshare-connections-actions";

type MockConnection = {
  id: string;
  sender_account_id: string | null;
  receiver_account_id: string;
  service_type: "ecc_hers";
  status: "pending" | "active" | "disabled" | "revoked";
  invite_email: string | null;
  invite_company_name: string | null;
  invite_token_hash: string | null;
  invited_by_user_id: string;
  accepted_by_user_id: string | null;
  disabled_by_user_id: string | null;
  revoked_by_user_id: string | null;
  created_at: string;
  accepted_at: string | null;
  disabled_at: string | null;
  revoked_at: string | null;
  updated_at: string;
};

function makeConnection(input: Partial<MockConnection> & { id: string }): MockConnection {
  const { id, ...rest } = input;

  return {
    id,
    sender_account_id: "00000000-0000-4000-8000-0000000000a1",
    receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
    service_type: "ecc_hers",
    status: "pending",
    invite_email: null,
    invite_company_name: null,
    invite_token_hash: null,
    invited_by_user_id: "00000000-0000-4000-8000-0000000000b2",
    accepted_by_user_id: null,
    disabled_by_user_id: null,
    revoked_by_user_id: null,
    created_at: "2026-07-06T12:00:00.000Z",
    accepted_at: null,
    disabled_at: null,
    revoked_at: null,
    updated_at: "2026-07-06T12:00:00.000Z",
    ...rest,
  };
}

function makeAdminFixture(seed: { connections?: MockConnection[] } = {}) {
  const connections = [...(seed.connections ?? [])];
  const tableCalls: string[] = [];
  const insertCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];

  const admin = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);

      if (table !== "account_workshare_connections") {
        throw new Error(`Unexpected table ${table}`);
      }

      const state = {
        eq: [] as Array<[string, unknown]>,
        in: [] as Array<[string, unknown[]]>,
        order: [] as Array<[string, boolean]>,
        limit: null as number | null,
      };

      const applyFilters = () => {
        let rows = [...connections];

        for (const [column, value] of state.eq) {
          rows = rows.filter((row: any) => row?.[column] === value);
        }

        for (const [column, values] of state.in) {
          rows = rows.filter((row: any) => values.includes((row as any)?.[column]));
        }

        for (const [column, ascending] of [...state.order].reverse()) {
          rows.sort((left: any, right: any) => {
            const l = String(left?.[column] ?? "");
            const r = String(right?.[column] ?? "");
            return ascending ? l.localeCompare(r) : r.localeCompare(l);
          });
        }

        if (typeof state.limit === "number") {
          rows = rows.slice(0, state.limit);
        }

        return rows;
      };

      const selectBuilder: any = {
        eq: vi.fn((column: string, value: unknown) => {
          state.eq.push([column, value]);
          return selectBuilder;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          state.in.push([column, values]);
          return selectBuilder;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          state.order.push([column, options?.ascending !== false]);
          return selectBuilder;
        }),
        limit: vi.fn((value: number) => {
          state.limit = value;
          return selectBuilder;
        }),
        maybeSingle: vi.fn(async () => ({ data: applyFilters()[0] ?? null, error: null })),
        then: (resolve: (value: { data: MockConnection[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: applyFilters(), error: null }).then(resolve, reject),
      };

      const updateBuilder = (updates: Record<string, unknown>) => {
        const updateState = {
          eq: [] as Array<[string, unknown]>,
        };

        const scopedRows = () => connections.filter((row) =>
          updateState.eq.every(([column, value]) => (row as any)?.[column] === value));

        const chain: any = {
          eq: vi.fn((column: string, value: unknown) => {
            updateState.eq.push([column, value]);
            return chain;
          }),
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const target = scopedRows()[0] ?? null;
              if (!target) return { data: null, error: null };

              const next = { ...target, ...updates };
              const index = connections.findIndex((row) => row.id === target.id);
              if (index >= 0) connections[index] = next;
              updateCalls.push(updates);
              return { data: next, error: null };
            }),
          })),
        };

        return chain;
      };

      return {
        select: vi.fn(() => selectBuilder),
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertCalls.push(payload);
          const id = `00000000-0000-4000-8000-${String(connections.length + 1).padStart(12, "0")}`;
          const now = "2026-07-06T12:00:00.000Z";
          const row = makeConnection({
            id,
            sender_account_id: payload.sender_account_id == null ? null : String(payload.sender_account_id),
            receiver_account_id: String(payload.receiver_account_id ?? ""),
            service_type: "ecc_hers",
            status: "pending",
            invite_email: payload.invite_email == null ? null : String(payload.invite_email),
            invite_company_name: payload.invite_company_name == null ? null : String(payload.invite_company_name),
            invite_token_hash: payload.invite_token_hash == null ? null : String(payload.invite_token_hash),
            invited_by_user_id: String(payload.invited_by_user_id ?? ""),
            created_at: now,
            updated_at: now,
          });
          connections.push(row);

          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: row, error: null })),
            })),
          };
        }),
        update: vi.fn((updates: Record<string, unknown>) => updateBuilder(updates)),
      };
    }),
  };

  return {
    admin,
    tableCalls,
    insertCalls,
    updateCalls,
    getConnections: () => [...connections],
  };
}

function setActor(params: {
  userId: string;
  accountOwnerUserId: string;
  role: "admin" | "office" | "tech" | "billing";
  email?: string | null;
}) {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: params.userId, email: params.email ?? "actor@example.com" } },
        error: null,
      })),
    },
  });
  requireInternalUserMock.mockResolvedValue({
    userId: params.userId,
    internalUser: {
      user_id: params.userId,
      role: params.role,
      is_active: true,
      account_owner_user_id: params.accountOwnerUserId,
      created_by: null,
    },
  });
}

describe("account workshare connections actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminClientMock.mockReset();
    requireInternalUserMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("receiver admin creates a pending directional invite for a known sender account", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    const result = await createAccountWorkshareInvite({
      senderAccountId: "00000000-0000-4000-8000-0000000000a1",
      inviteCompanyName: "Sender Co",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.connection.status : null).toBe("pending");
    expect(fixture.insertCalls[0]).toMatchObject({
      sender_account_id: "00000000-0000-4000-8000-0000000000a1",
      receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
      service_type: "ecc_hers",
      status: "pending",
    });
  });

  it("keeps A to B distinct from B to A", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000011",
          sender_account_id: "00000000-0000-4000-8000-0000000000a1",
          receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
        }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createAccountWorkshareInvite({
      senderAccountId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result.success).toBe(true);
    expect(fixture.insertCalls).toHaveLength(1);
    expect(fixture.insertCalls[0]).toMatchObject({
      sender_account_id: "00000000-0000-4000-8000-0000000000b1",
      receiver_account_id: "00000000-0000-4000-8000-0000000000a1",
    });
  });

  it("does not duplicate an existing active or pending directional pair", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000012",
          sender_account_id: "00000000-0000-4000-8000-0000000000a1",
          receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
          status: "active",
          accepted_by_user_id: "00000000-0000-4000-8000-0000000000a2",
          accepted_at: "2026-07-06T13:00:00.000Z",
        }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    const result = await createAccountWorkshareInvite({
      senderAccountId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(result).toMatchObject({
      success: true,
      created: false,
    });
    expect(fixture.insertCalls).toHaveLength(0);
  });

  it("intended sender account can accept a pending invite without creating jobs or portal membership", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000013",
          sender_account_id: "00000000-0000-4000-8000-0000000000a1",
          receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
          status: "pending",
        }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await acceptAccountWorkshareInvite({
      connectionId: "00000000-0000-4000-8000-000000000013",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.connection.status : null).toBe("active");
    expect(fixture.updateCalls[0]).toMatchObject({
      sender_account_id: "00000000-0000-4000-8000-0000000000a1",
      status: "active",
      accepted_by_user_id: "00000000-0000-4000-8000-0000000000a2",
    });
    expect(new Set(fixture.tableCalls)).toEqual(new Set(["account_workshare_connections"]));
    expect(fixture.tableCalls.join(" ")).not.toContain("contractor_users");
    expect(fixture.tableCalls.join(" ")).not.toContain("jobs");
  });

  it("email invite requires matching email and valid token before activation", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
      email: "rater@example.com",
    });

    const created = await createAccountWorkshareInvite({
      inviteEmail: "sender@example.com",
      inviteCompanyName: "Sender Co",
    });
    expect(created.success).toBe(true);
    const connectionId = created.success ? created.connection.id : "";
    const token = created.success ? created.inviteToken : "";

    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
      email: "wrong@example.com",
    });

    await expect(acceptAccountWorkshareInvite({ connectionId, inviteToken: token })).resolves.toMatchObject({
      success: false,
      error: "Only the invited email can accept this invite.",
    });

    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
      email: "sender@example.com",
    });

    await expect(acceptAccountWorkshareInvite({ connectionId, inviteToken: "bad-token" })).resolves.toMatchObject({
      success: false,
      error: "A valid invite token is required.",
    });

    const accepted = await acceptAccountWorkshareInvite({ connectionId, inviteToken: token });
    expect(accepted.success).toBe(true);
    expect(accepted.success ? accepted.connection.sender_account_id : null).toBe("00000000-0000-4000-8000-0000000000a1");
    expect(accepted.success ? accepted.connection.status : null).toBe("active");
  });

  it("unrelated account cannot revoke and sender cannot disable receiver authority", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000014",
          sender_account_id: "00000000-0000-4000-8000-0000000000a1",
          receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
          status: "active",
          accepted_by_user_id: "00000000-0000-4000-8000-0000000000a2",
          accepted_at: "2026-07-06T13:00:00.000Z",
        }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000c2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000c1",
      role: "admin",
    });

    await expect(revokeAccountWorkshareConnection({ connectionId: "00000000-0000-4000-8000-000000000014" })).resolves.toMatchObject({
      success: false,
      error: "Only a connected sender or receiver account can revoke this connection.",
    });

    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    await expect(disableAccountWorkshareConnection({ connectionId: "00000000-0000-4000-8000-000000000014" })).resolves.toMatchObject({
      success: false,
      error: "Only the receiver account owner/admin can disable this connection.",
    });
  });

  it("receiver can disable an active connection", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000015",
          sender_account_id: "00000000-0000-4000-8000-0000000000a1",
          receiver_account_id: "00000000-0000-4000-8000-0000000000b1",
          status: "active",
          accepted_by_user_id: "00000000-0000-4000-8000-0000000000a2",
          accepted_at: "2026-07-06T13:00:00.000Z",
        }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    const result = await disableAccountWorkshareConnection({ connectionId: "00000000-0000-4000-8000-000000000015" });

    expect(result.success).toBe(true);
    expect(result.success ? result.connection.status : null).toBe("disabled");
  });

  it("form wrapper redirects to company profile section and touches no unrelated domains", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    const formData = new FormData();
    formData.set("sender_account_id", "00000000-0000-4000-8000-0000000000a1");

    await expect(createAccountWorkshareInviteFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=workshare_connection_invited#account-workshare-connections",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/company-profile");
    expect(new Set(fixture.tableCalls)).toEqual(new Set(["account_workshare_connections"]));
  });

  it("source guard: actions do not import or reference contractor portal authority", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib", "workflows", "account-workshare-connections-actions.ts"),
      "utf8",
    );

    expect(source).not.toContain("contractor_users");
    expect(source).not.toContain("contractor_invites");
    expect(source).not.toContain("contractor_id");
    expect(source).not.toContain("/portal");
    expect(source).not.toContain("jobs");
    expect(source).not.toContain("customers");
    expect(source).not.toContain("ecc_test_runs");
  });
});
