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
  createWorkflowHandoffRequestGrant,
  revokeWorkflowHandoffRequestGrant,
} from "../workflow-handoff-request-grants-actions";

type MockWorkflowHandoffRequest = {
  id: string;
  installer_account_owner_user_id: string;
  authorized_handoff_recipient_id: string;
  handoff_kind: "ecc" | "general_future";
};

type MockAccountHandoffConnection = {
  id: string;
  requesting_account_owner_user_id: string;
  recipient_account_owner_user_id: string;
  connection_status: "pending" | "active" | "declined" | "revoked";
  handoff_kind: "ecc";
};

type MockAuthorizedHandoffRecipient = {
  id: string;
  account_owner_user_id: string;
  handoff_kind: "ecc" | "general_future";
  recipient_type: string;
  connected_account_owner_user_id: string | null;
  is_active: boolean;
  archived_at: string | null;
};

type MockGrant = {
  id: string;
  installer_account_owner_user_id: string;
  recipient_account_owner_user_id: string;
  account_handoff_connection_id: string;
  workflow_handoff_request_id: string;
  authorized_handoff_recipient_id: string | null;
  handoff_kind: "ecc";
  grant_status: "active" | "revoked";
  shared_scope: "handoff_request_only";
  granted_by_user_id: string;
  granted_at: string;
  revoked_by_user_id: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
};

function makeWorkflowHandoffRequest(input: Partial<MockWorkflowHandoffRequest> & { id: string }): MockWorkflowHandoffRequest {
  const { id, ...rest } = input;

  return {
    id,
    installer_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
    authorized_handoff_recipient_id: "00000000-0000-4000-8000-0000000000f1",
    handoff_kind: "ecc",
    ...rest,
  };
}

function makeAccountHandoffConnection(input: Partial<MockAccountHandoffConnection> & { id: string }): MockAccountHandoffConnection {
  const { id, ...rest } = input;

  return {
    id,
    requesting_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
    recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
    connection_status: "active",
    handoff_kind: "ecc",
    ...rest,
  };
}

function makeAuthorizedHandoffRecipient(
  input: Partial<MockAuthorizedHandoffRecipient> & { id: string },
): MockAuthorizedHandoffRecipient {
  const { id, ...rest } = input;

  return {
    id,
    account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
    handoff_kind: "ecc",
    recipient_type: "connected_account_future",
    connected_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
    is_active: true,
    archived_at: null,
    ...rest,
  };
}

function makeGrant(input: Partial<MockGrant> & { id: string }): MockGrant {
  const { id, ...rest } = input;

  return {
    id,
    installer_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
    recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
    account_handoff_connection_id: "00000000-0000-4000-8000-0000000000c1",
    workflow_handoff_request_id: "00000000-0000-4000-8000-0000000000d1",
    authorized_handoff_recipient_id: "00000000-0000-4000-8000-0000000000f1",
    handoff_kind: "ecc",
    grant_status: "active",
    shared_scope: "handoff_request_only",
    granted_by_user_id: "00000000-0000-4000-8000-0000000000a2",
    granted_at: "2026-05-31T22:00:00.000Z",
    revoked_by_user_id: null,
    revoked_at: null,
    revoke_reason: null,
    created_at: "2026-05-31T22:00:00.000Z",
    updated_at: "2026-05-31T22:00:00.000Z",
    ...rest,
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

function makeAdminFixture(seed?: {
  workflowHandoffRequests?: MockWorkflowHandoffRequest[];
  accountHandoffConnections?: MockAccountHandoffConnection[];
  authorizedHandoffRecipients?: MockAuthorizedHandoffRecipient[];
  grants?: MockGrant[];
}) {
  const workflowHandoffRequests = [...(seed?.workflowHandoffRequests ?? [])];
  const accountHandoffConnections = [...(seed?.accountHandoffConnections ?? [])];
  const authorizedHandoffRecipients = [...(seed?.authorizedHandoffRecipients ?? [])];
  const grants = [...(seed?.grants ?? [])];

  const tableCalls: string[] = [];
  const grantInsertCalls: Array<Record<string, unknown>> = [];
  const grantUpdateCalls: Array<Record<string, unknown>> = [];

  const applyEqFilters = (rows: any[], eqFilters: Array<[string, unknown]>) => rows.filter((row) =>
    eqFilters.every(([column, value]) => (row as any)?.[column] === value));

  const applyOrderAndLimit = (
    rows: any[],
    orders: Array<[string, boolean]>,
    limit: number | null,
  ) => {
    let scoped = [...rows];

    for (const [column, asc] of [...orders].reverse()) {
      scoped.sort((left: any, right: any) => {
        const l = String(left?.[column] ?? "");
        const r = String(right?.[column] ?? "");
        return asc ? l.localeCompare(r) : r.localeCompare(l);
      });
    }

    if (typeof limit === "number") {
      scoped = scoped.slice(0, limit);
    }

    return scoped;
  };

  const admin = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);

      const rows =
        table === "workflow_handoff_requests"
          ? workflowHandoffRequests
          : table === "account_handoff_connections"
            ? accountHandoffConnections
            : table === "authorized_handoff_recipients"
              ? authorizedHandoffRecipients
              : table === "workflow_handoff_request_grants"
                ? grants
                : null;

      if (!rows) {
        throw new Error(`Unexpected table ${table}`);
      }

      const selectState = {
        eq: [] as Array<[string, unknown]>,
        order: [] as Array<[string, boolean]>,
        limit: null as number | null,
      };

      const selectChain: any = {
        eq: vi.fn((column: string, value: unknown) => {
          selectState.eq.push([column, value]);
          return selectChain;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          selectState.order.push([column, options?.ascending !== false]);
          return selectChain;
        }),
        limit: vi.fn((value: number) => {
          selectState.limit = value;
          return selectChain;
        }),
        maybeSingle: vi.fn(async () => {
          const filtered = applyEqFilters(rows, selectState.eq);
          const ordered = applyOrderAndLimit(filtered, selectState.order, selectState.limit);
          return { data: ordered[0] ?? null, error: null };
        }),
        then: (resolve: (value: { data: any[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) => {
          const filtered = applyEqFilters(rows, selectState.eq);
          const ordered = applyOrderAndLimit(filtered, selectState.order, selectState.limit);
          return Promise.resolve({ data: ordered, error: null }).then(resolve, reject);
        },
      };

      const updateBuilder = (updates: Record<string, unknown>) => {
        const updateState = {
          eq: [] as Array<[string, unknown]>,
        };

        const updateChain: any = {
          eq: vi.fn((column: string, value: unknown) => {
            updateState.eq.push([column, value]);
            return updateChain;
          }),
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const filtered = applyEqFilters(rows, updateState.eq);
              const target = filtered[0] ?? null;

              if (!target) {
                return { data: null, error: null };
              }

              const next = {
                ...target,
                ...updates,
              };

              const index = rows.findIndex((row: any) => row.id === target.id);
              if (index >= 0) {
                rows[index] = next;
              }

              if (table === "workflow_handoff_request_grants") {
                grantUpdateCalls.push(updates);
              }

              return { data: next, error: null };
            }),
          })),
        };

        return updateChain;
      };

      return {
        select: vi.fn(() => selectChain),
        insert: vi.fn((payload: Record<string, unknown>) => {
          if (table !== "workflow_handoff_request_grants") {
            throw new Error(`Unexpected insert on table ${table}`);
          }

          grantInsertCalls.push(payload);

          const row = makeGrant({
            id: `00000000-0000-4000-8000-${String(grants.length + 1).padStart(12, "0")}`,
            installer_account_owner_user_id: String(payload.installer_account_owner_user_id ?? ""),
            recipient_account_owner_user_id: String(payload.recipient_account_owner_user_id ?? ""),
            account_handoff_connection_id: String(payload.account_handoff_connection_id ?? ""),
            workflow_handoff_request_id: String(payload.workflow_handoff_request_id ?? ""),
            authorized_handoff_recipient_id: payload.authorized_handoff_recipient_id == null
              ? null
              : String(payload.authorized_handoff_recipient_id),
            handoff_kind: "ecc",
            grant_status: "active",
            shared_scope: "handoff_request_only",
            granted_by_user_id: String(payload.granted_by_user_id ?? ""),
            granted_at: String(payload.granted_at ?? "2026-05-31T22:00:00.000Z"),
            created_at: String(payload.granted_at ?? "2026-05-31T22:00:00.000Z"),
            updated_at: String(payload.granted_at ?? "2026-05-31T22:00:00.000Z"),
          });

          grants.push(row);

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
    grantInsertCalls,
    grantUpdateCalls,
    getGrants: () => [...grants],
  };
}

describe("workflow handoff request grant actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminClientMock.mockReset();
    requireInternalUserMock.mockReset();
  });

  it("installer admin can create active grant", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [
        makeWorkflowHandoffRequest({
          id: "00000000-0000-4000-8000-0000000000d1",
        }),
      ],
      accountHandoffConnections: [
        makeAccountHandoffConnection({
          id: "00000000-0000-4000-8000-0000000000c1",
          connection_status: "active",
        }),
      ],
      authorizedHandoffRecipients: [
        makeAuthorizedHandoffRecipient({
          id: "00000000-0000-4000-8000-0000000000f1",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      authorizedHandoffRecipientId: "00000000-0000-4000-8000-0000000000f1",
    });

    expect(result).toEqual({
      success: true,
      grantId: "00000000-0000-4000-8000-000000000001",
      grantStatus: "active",
      created: true,
    });
    expect(fixture.grantInsertCalls).toHaveLength(1);
    expect(fixture.grantInsertCalls[0]).toMatchObject({
      installer_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
      recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
      account_handoff_connection_id: "00000000-0000-4000-8000-0000000000c1",
      workflow_handoff_request_id: "00000000-0000-4000-8000-0000000000d1",
      authorized_handoff_recipient_id: "00000000-0000-4000-8000-0000000000f1",
      handoff_kind: "ecc",
      grant_status: "active",
      shared_scope: "handoff_request_only",
    });
  });

  it("installer owner (non-admin role) can create active grant", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [makeAccountHandoffConnection({ id: "00000000-0000-4000-8000-0000000000c1" })],
      authorizedHandoffRecipients: [makeAuthorizedHandoffRecipient({ id: "00000000-0000-4000-8000-0000000000f1" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a1",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "office",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toMatchObject({ success: true, grantStatus: "active", created: true });
  });

  it("non-admin non-owner is rejected", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000x2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "office",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin access is required.",
    });
  });

  it("unrelated account is rejected", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [makeAccountHandoffConnection({ id: "00000000-0000-4000-8000-0000000000c1" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000c2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000c1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow_handoff_request_id is out of installer account scope.",
    });
    expect(fixture.grantInsertCalls).toHaveLength(0);
  });

  it("inactive or non-active connection is rejected", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [
        makeAccountHandoffConnection({
          id: "00000000-0000-4000-8000-0000000000c1",
          connection_status: "pending",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toEqual({
      success: false,
      error: "account_handoff_connection_id must be active.",
    });
    expect(fixture.grantInsertCalls).toHaveLength(0);
  });

  it("connection not owned by installer is rejected", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [
        makeAccountHandoffConnection({
          id: "00000000-0000-4000-8000-0000000000c1",
          requesting_account_owner_user_id: "00000000-0000-4000-8000-0000000000d1",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toEqual({
      success: false,
      error: "account_handoff_connection_id is out of installer account scope.",
    });
  });

  it("recipient account mismatch is rejected", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [makeAccountHandoffConnection({ id: "00000000-0000-4000-8000-0000000000c1" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b9",
    });

    expect(result).toEqual({
      success: false,
      error: "recipient_account_owner_user_id does not match account_handoff_connection_id.",
    });
  });

  it("optional authorized recipient mismatch is rejected", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [
        makeWorkflowHandoffRequest({
          id: "00000000-0000-4000-8000-0000000000d1",
          authorized_handoff_recipient_id: "00000000-0000-4000-8000-0000000000f1",
        }),
      ],
      accountHandoffConnections: [makeAccountHandoffConnection({ id: "00000000-0000-4000-8000-0000000000c1" })],
      authorizedHandoffRecipients: [makeAuthorizedHandoffRecipient({ id: "00000000-0000-4000-8000-0000000000f2" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      authorizedHandoffRecipientId: "00000000-0000-4000-8000-0000000000f2",
    });

    expect(result).toEqual({
      success: false,
      error: "authorized_handoff_recipient_id does not match workflow_handoff_request_id.",
    });
  });

  it("optional authorized recipient must be connected_account_future", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [makeAccountHandoffConnection({ id: "00000000-0000-4000-8000-0000000000c1" })],
      authorizedHandoffRecipients: [
        makeAuthorizedHandoffRecipient({
          id: "00000000-0000-4000-8000-0000000000f1",
          recipient_type: "external_manual",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      authorizedHandoffRecipientId: "00000000-0000-4000-8000-0000000000f1",
    });

    expect(result).toEqual({
      success: false,
      error: "authorized_handoff_recipient_id must be connected_account_future.",
    });
  });

  it("duplicate active grant is idempotent and does not insert duplicate", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [makeAccountHandoffConnection({ id: "00000000-0000-4000-8000-0000000000c1" })],
      grants: [
        makeGrant({
          id: "00000000-0000-4000-8000-0000000000e1",
          workflow_handoff_request_id: "00000000-0000-4000-8000-0000000000d1",
          recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
          grant_status: "active",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(result).toEqual({
      success: true,
      grantId: "00000000-0000-4000-8000-0000000000e1",
      grantStatus: "active",
      created: false,
    });
    expect(fixture.grantInsertCalls).toHaveLength(0);
  });

  it("writes and updates only workflow_handoff_request_grants with no operational table access", async () => {
    const fixture = makeAdminFixture({
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
      accountHandoffConnections: [makeAccountHandoffConnection({ id: "00000000-0000-4000-8000-0000000000c1" })],
      authorizedHandoffRecipients: [makeAuthorizedHandoffRecipient({ id: "00000000-0000-4000-8000-0000000000f1" })],
      grants: [makeGrant({ id: "00000000-0000-4000-8000-0000000000e1" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const createResult = await createWorkflowHandoffRequestGrant({
      workflowHandoffRequestId: "00000000-0000-4000-8000-0000000000d1",
      accountHandoffConnectionId: "00000000-0000-4000-8000-0000000000c1",
      recipientAccountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      authorizedHandoffRecipientId: "00000000-0000-4000-8000-0000000000f1",
    });

    const revokeResult = await revokeWorkflowHandoffRequestGrant({
      grantId: "00000000-0000-4000-8000-0000000000e1",
    });

    expect(createResult.success).toBe(true);
    expect(revokeResult.success).toBe(true);

    const forbiddenTables = [
      "jobs",
      "service_cases",
      "job_events",
      "customers",
      "customer_contacts",
      "internal_invoices",
      "internal_invoice_payments",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
      "workflow_instances",
      "workflow_instance_milestones",
    ];

    for (const table of forbiddenTables) {
      expect(fixture.tableCalls).not.toContain(table);
    }
  });

  it("installer admin can revoke active grant", async () => {
    const fixture = makeAdminFixture({
      grants: [
        makeGrant({
          id: "00000000-0000-4000-8000-0000000000e1",
          installer_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
          grant_status: "active",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await revokeWorkflowHandoffRequestGrant({
      grantId: "00000000-0000-4000-8000-0000000000e1",
      revokeReason: "Connection sunset",
    });

    expect(result).toEqual({
      success: true,
      grantId: "00000000-0000-4000-8000-0000000000e1",
      grantStatus: "revoked",
      revoked: true,
    });
    expect(fixture.grantUpdateCalls).toHaveLength(1);
    expect(fixture.grantUpdateCalls[0]).toMatchObject({
      grant_status: "revoked",
      revoked_by_user_id: "00000000-0000-4000-8000-0000000000a2",
      revoke_reason: "Connection sunset",
    });
  });

  it("recipient account cannot revoke in v1", async () => {
    const fixture = makeAdminFixture({
      grants: [
        makeGrant({
          id: "00000000-0000-4000-8000-0000000000e1",
          installer_account_owner_user_id: "00000000-0000-4000-8000-0000000000a1",
          recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000b1",
          grant_status: "active",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000b2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1",
      role: "admin",
    });

    const result = await revokeWorkflowHandoffRequestGrant({
      grantId: "00000000-0000-4000-8000-0000000000e1",
    });

    expect(result).toEqual({
      success: false,
      error: "grant_id is out of installer account scope.",
    });
    expect(fixture.grantUpdateCalls).toHaveLength(0);
  });

  it("already revoked grant returns idempotent success", async () => {
    const fixture = makeAdminFixture({
      grants: [
        makeGrant({
          id: "00000000-0000-4000-8000-0000000000e1",
          grant_status: "revoked",
          revoked_by_user_id: "00000000-0000-4000-8000-0000000000a2",
          revoked_at: "2026-05-31T22:20:00.000Z",
        }),
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await revokeWorkflowHandoffRequestGrant({
      grantId: "00000000-0000-4000-8000-0000000000e1",
    });

    expect(result).toEqual({
      success: true,
      grantId: "00000000-0000-4000-8000-0000000000e1",
      grantStatus: "revoked",
      revoked: false,
    });
    expect(fixture.grantUpdateCalls).toHaveLength(0);
  });

  it("unrelated account cannot revoke", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant({ id: "00000000-0000-4000-8000-0000000000e1" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000x2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000x1",
      role: "admin",
    });

    const result = await revokeWorkflowHandoffRequestGrant({
      grantId: "00000000-0000-4000-8000-0000000000e1",
    });

    expect(result).toEqual({
      success: false,
      error: "grant_id is out of installer account scope.",
    });
    expect(fixture.grantUpdateCalls).toHaveLength(0);
  });

  it("revoke mutates only workflow_handoff_request_grants", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant({ id: "00000000-0000-4000-8000-0000000000e1" })],
      workflowHandoffRequests: [makeWorkflowHandoffRequest({ id: "00000000-0000-4000-8000-0000000000d1" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor({
      userId: "00000000-0000-4000-8000-0000000000a2",
      accountOwnerUserId: "00000000-0000-4000-8000-0000000000a1",
      role: "admin",
    });

    const result = await revokeWorkflowHandoffRequestGrant({
      grantId: "00000000-0000-4000-8000-0000000000e1",
    });

    expect(result.success).toBe(true);
    expect(fixture.grantUpdateCalls).toHaveLength(1);

    const forbiddenTables = [
      "workflow_instance_milestones",
      "workflow_instances",
      "jobs",
      "service_cases",
      "job_events",
      "customers",
      "internal_invoices",
      "internal_invoice_payments",
    ];

    for (const table of forbiddenTables) {
      expect(fixture.tableCalls).not.toContain(table);
    }
  });
});
