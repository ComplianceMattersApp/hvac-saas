import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();

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
  approveAccountHandoffConnection,
  declineAccountHandoffConnection,
  requestAccountHandoffConnection,
  revokeAccountHandoffConnection,
} from "../account-handoff-connections-actions";

type MockConnection = {
  id: string;
  requesting_account_owner_user_id: string;
  recipient_account_owner_user_id: string;
  connection_status: "pending" | "active" | "declined" | "revoked";
  handoff_kind: "ecc";
  requested_by_user_id: string | null;
  approved_by_user_id: string | null;
  declined_by_user_id: string | null;
  revoked_by_user_id: string | null;
  requested_at: string;
  approved_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  connection_note: string | null;
  created_at: string;
  updated_at: string;
};

function makeConnection(input: Partial<MockConnection> & { id: string }): MockConnection {
  const { id, ...rest } = input;

  return {
    id,
    requesting_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
    recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
    connection_status: "pending",
    handoff_kind: "ecc",
    requested_by_user_id: "00000000-0000-4000-8000-0000000000c1",
    approved_by_user_id: null,
    declined_by_user_id: null,
    revoked_by_user_id: null,
    requested_at: "2026-05-31T00:00:00.000Z",
    approved_at: null,
    declined_at: null,
    revoked_at: null,
    connection_note: null,
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
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

      if (table !== "account_handoff_connections") {
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

        for (const [column, asc] of [...state.order].reverse()) {
          rows.sort((left: any, right: any) => {
            const l = String(left?.[column] ?? "");
            const r = String(right?.[column] ?? "");
            return asc ? l.localeCompare(r) : r.localeCompare(l);
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
        maybeSingle: vi.fn(async () => {
          const rows = applyFilters();
          return { data: rows[0] ?? null, error: null };
        }),
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
              if (!target) {
                return { data: null, error: null };
              }

              const next = { ...target, ...updates };
              const index = connections.findIndex((row) => row.id === target.id);
              if (index >= 0) {
                connections[index] = next;
              }

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
          const now = "2026-05-31T12:00:00.000Z";
          const row = makeConnection({
            id,
            requesting_account_owner_user_id: String(payload.requesting_account_owner_user_id ?? ""),
            recipient_account_owner_user_id: String(payload.recipient_account_owner_user_id ?? ""),
            connection_status: "pending",
            handoff_kind: "ecc",
            requested_by_user_id: String(payload.requested_by_user_id ?? "") || null,
            requested_at: String(payload.requested_at ?? now),
            connection_note: (payload.connection_note as string | null) ?? null,
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
}) {
  createClientMock.mockResolvedValue({});
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

describe("account handoff connections actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminClientMock.mockReset();
    requireInternalUserMock.mockReset();
  });

  it("requester admin can create pending connection", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a1",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await requestAccountHandoffConnection({
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      handoffKind: "ecc",
      connectionNote: "Requesting trust connection",
    });

    expect(result.success).toBe(true);
    expect(result.connectionStatus).toBe("pending");
    expect(fixture.insertCalls).toHaveLength(1);
    expect(fixture.insertCalls[0]).toMatchObject({
      requesting_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
      recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
      connection_status: "pending",
      handoff_kind: "ecc",
    });
  });

  it("cannot request connection to self", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a1",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await requestAccountHandoffConnection({
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(result).toEqual({
      success: false,
      error: "Requesting and recipient account owners must be different.",
      connectionId: null,
      connectionStatus: null,
    });
    expect(fixture.insertCalls).toHaveLength(0);
  });

  it("rejects non-ecc handoff kinds", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a1",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await requestAccountHandoffConnection({
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      handoffKind: "general_future",
    });

    expect(result).toEqual({
      success: false,
      error: "Only ecc handoff connections are supported.",
      connectionId: null,
      connectionStatus: null,
    });
    expect(fixture.insertCalls).toHaveLength(0);
  });

  it("returns existing pending or active live connection without duplicate insert", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000010",
          requesting_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
          recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
          connection_status: "active",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a1",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await requestAccountHandoffConnection({
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toEqual({
      success: true,
      connectionId: "00000000-0000-4000-8000-000000000010",
      connectionStatus: "active",
    });
    expect(fixture.insertCalls).toHaveLength(0);
  });

  it("recipient admin can approve pending connection", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000011",
          requesting_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
          recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
          connection_status: "pending",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    const result = await approveAccountHandoffConnection({
      connectionId: "00000000-0000-4000-8000-000000000011",
      connectionNote: "Approved",
    });

    expect(result).toEqual({
      success: true,
      connectionId: "00000000-0000-4000-8000-000000000011",
      connectionStatus: "active",
    });
    expect(fixture.updateCalls[0]).toMatchObject({
      connection_status: "active",
      approved_by_user_id: "00000000-0000-4000-8000-0000000000b2",
      connection_note: "Approved",
    });
  });

  it("requester cannot approve their own outgoing pending connection", async () => {
    const fixture = makeAdminFixture({
      connections: [makeConnection({ id: "00000000-0000-4000-8000-000000000012" })],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await approveAccountHandoffConnection({
      connectionId: "00000000-0000-4000-8000-000000000012",
    });

    expect(result).toEqual({
      success: false,
      error: "Only the recipient account admin/owner can approve this connection.",
      connectionId: null,
      connectionStatus: null,
    });
  });

  it("recipient admin can decline pending connection", async () => {
    const fixture = makeAdminFixture({
      connections: [makeConnection({ id: "00000000-0000-4000-8000-000000000013" })],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    const result = await declineAccountHandoffConnection({
      connectionId: "00000000-0000-4000-8000-000000000013",
    });

    expect(result).toEqual({
      success: true,
      connectionId: "00000000-0000-4000-8000-000000000013",
      connectionStatus: "declined",
    });
  });

  it("requester cannot decline recipient-side pending connection", async () => {
    const fixture = makeAdminFixture({
      connections: [makeConnection({ id: "00000000-0000-4000-8000-000000000014" })],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await declineAccountHandoffConnection({
      connectionId: "00000000-0000-4000-8000-000000000014",
    });

    expect(result).toEqual({
      success: false,
      error: "Only the recipient account admin/owner can decline this connection.",
      connectionId: null,
      connectionStatus: null,
    });
  });

  it("either side admin can revoke active connection", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({
          id: "00000000-0000-4000-8000-000000000015",
          connection_status: "active",
          approved_by_user_id: "00000000-0000-4000-8000-0000000000b2",
          approved_at: "2026-05-31T10:00:00.000Z",
        }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a3",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await revokeAccountHandoffConnection({
      connectionId: "00000000-0000-4000-8000-000000000015",
    });

    expect(result).toEqual({
      success: true,
      connectionId: "00000000-0000-4000-8000-000000000015",
      connectionStatus: "revoked",
    });
  });

  it("cannot approve declined, revoked, or active connections", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({ id: "00000000-0000-4000-8000-000000000016", connection_status: "declined" }),
        makeConnection({ id: "00000000-0000-4000-8000-000000000017", connection_status: "revoked" }),
        makeConnection({ id: "00000000-0000-4000-8000-000000000018", connection_status: "active" }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    await expect(approveAccountHandoffConnection({ connectionId: "00000000-0000-4000-8000-000000000016" })).resolves.toMatchObject({ success: false });
    await expect(approveAccountHandoffConnection({ connectionId: "00000000-0000-4000-8000-000000000017" })).resolves.toMatchObject({ success: false });
    await expect(approveAccountHandoffConnection({ connectionId: "00000000-0000-4000-8000-000000000018" })).resolves.toMatchObject({ success: false });
  });

  it("cannot revoke pending, declined, or revoked connections", async () => {
    const fixture = makeAdminFixture({
      connections: [
        makeConnection({ id: "00000000-0000-4000-8000-000000000019", connection_status: "pending" }),
        makeConnection({ id: "00000000-0000-4000-8000-000000000020", connection_status: "declined" }),
        makeConnection({ id: "00000000-0000-4000-8000-000000000021", connection_status: "revoked" }),
      ],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a3",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    await expect(revokeAccountHandoffConnection({ connectionId: "00000000-0000-4000-8000-000000000019" })).resolves.toMatchObject({ success: false });
    await expect(revokeAccountHandoffConnection({ connectionId: "00000000-0000-4000-8000-000000000020" })).resolves.toMatchObject({ success: false });
    await expect(revokeAccountHandoffConnection({ connectionId: "00000000-0000-4000-8000-000000000021" })).resolves.toMatchObject({ success: false });
  });

  it("cross-account unrelated admin cannot update", async () => {
    const fixture = makeAdminFixture({
      connections: [makeConnection({ id: "00000000-0000-4000-8000-000000000022", connection_status: "active" })],
    });
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000c2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000c1",
      role: "admin",
    });

    const result = await revokeAccountHandoffConnection({
      connectionId: "00000000-0000-4000-8000-000000000022",
    });

    expect(result).toEqual({
      success: false,
      error: "Only a connected account admin/owner can revoke this connection.",
      connectionId: null,
      connectionStatus: null,
    });
  });

  it("non-admin non-owner actor is blocked", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a9",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "office",
    });

    const result = await requestAccountHandoffConnection({
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin access is required.",
      connectionId: null,
      connectionStatus: null,
    });
  });

  it("writes only account_handoff_connections and does not touch unrelated domains", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a1",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    await requestAccountHandoffConnection({
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(new Set(fixture.tableCalls)).toEqual(new Set(["account_handoff_connections"]));
    const touched = fixture.tableCalls.join(" ");
    expect(touched).not.toContain("jobs");
    expect(touched).not.toContain("service_cases");
    expect(touched).not.toContain("job_events");
    expect(touched).not.toContain("workflow_handoff_requests");
    expect(touched).not.toContain("workflow_instances");
    expect(touched).not.toContain("internal_invoices");
    expect(touched).not.toContain("payments");
    expect(touched).not.toContain("sms");
    expect(touched).not.toContain("qbo");
    expect(touched).not.toContain("service_plans");
  });
});