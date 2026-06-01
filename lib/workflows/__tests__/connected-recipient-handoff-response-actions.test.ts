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

import { respondToConnectedRecipientHandoffRequest } from "../connected-recipient-handoff-response-actions";

type GrantRow = {
  id: string;
  installer_account_owner_user_id: string;
  recipient_account_owner_user_id: string;
  workflow_handoff_request_id: string;
  handoff_kind: "ecc" | "general_future";
  grant_status: "active" | "revoked";
  shared_scope: "handoff_request_only" | "installer_scope";
};

type RequestRow = {
  id: string;
  installer_account_owner_user_id: string;
  handoff_kind: "ecc" | "general_future";
  handoff_status: "sent" | "accepted" | "completed" | "rejected" | "cancelled";
  response_note: string | null;
  evidence_reference: string | null;
  responded_by_user_id?: string | null;
  responded_at?: string | null;
  updated_at?: string | null;
};

function makeGrant(input?: Partial<GrantRow>): GrantRow {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    installer_account_owner_user_id: "00000000-0000-4000-8000-0000000000a2",
    recipient_account_owner_user_id: "00000000-0000-4000-8000-0000000000a3",
    workflow_handoff_request_id: "00000000-0000-4000-8000-0000000000a4",
    handoff_kind: "ecc",
    grant_status: "active",
    shared_scope: "handoff_request_only",
    ...input,
  };
}

function makeRequest(input?: Partial<RequestRow>): RequestRow {
  return {
    id: "00000000-0000-4000-8000-0000000000a4",
    installer_account_owner_user_id: "00000000-0000-4000-8000-0000000000a2",
    handoff_kind: "ecc",
    handoff_status: "sent",
    response_note: null,
    evidence_reference: null,
    ...input,
  };
}

function setActor(params?: {
  userId?: string;
  accountOwnerUserId?: string;
}) {
  createClientMock.mockResolvedValue({});
  requireInternalUserMock.mockResolvedValue({
    userId: params?.userId ?? "00000000-0000-4000-8000-0000000000af",
    internalUser: {
      user_id: params?.userId ?? "00000000-0000-4000-8000-0000000000af",
      role: "admin",
      is_active: true,
      account_owner_user_id: params?.accountOwnerUserId ?? "00000000-0000-4000-8000-0000000000a3",
      created_by: null,
    },
  });
}

function makeAdminFixture(seed?: {
  grants?: GrantRow[];
  requests?: RequestRow[];
  forceRequestSelectRow?: RequestRow | null;
}) {
  const grants = [...(seed?.grants ?? [])];
  const requests = [...(seed?.requests ?? [])];

  const tableCalls: string[] = [];
  const updateTableCalls: string[] = [];

  const applyEqFilters = (rows: any[], eqFilters: Array<[string, unknown]>) =>
    rows.filter((row) => eqFilters.every(([column, value]) => (row as any)?.[column] === value));

  const admin = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);

      if (table !== "workflow_handoff_request_grants" && table !== "workflow_handoff_requests") {
        throw new Error(`Unexpected table ${table}`);
      }

      const selectedRows = table === "workflow_handoff_request_grants" ? grants : requests;

      const selectState = {
        eq: [] as Array<[string, unknown]>,
      };

      const selectChain: any = {
        eq: vi.fn((column: string, value: unknown) => {
          selectState.eq.push([column, value]);
          return selectChain;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "workflow_handoff_requests" && "forceRequestSelectRow" in (seed ?? {})) {
            return { data: seed?.forceRequestSelectRow ?? null, error: null };
          }

          const filtered = applyEqFilters(selectedRows, selectState.eq);
          return { data: filtered[0] ?? null, error: null };
        }),
      };

      if (table === "workflow_handoff_request_grants") {
        return {
          select: vi.fn(() => selectChain),
          update: vi.fn(() => {
            throw new Error("Unexpected grant update");
          }),
        };
      }

      const updateBuilder = (updates: Record<string, unknown>) => {
        updateTableCalls.push(table);

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
              const filtered = applyEqFilters(requests, updateState.eq);
              const target = filtered[0] ?? null;
              if (!target) {
                return { data: null, error: null };
              }

              const next = {
                ...target,
                ...updates,
              };

              const index = requests.findIndex((row) => row.id === target.id);
              if (index >= 0) {
                requests[index] = next;
              }

              return { data: next, error: null };
            }),
          })),
        };

        return updateChain;
      };

      return {
        select: vi.fn(() => selectChain),
        update: vi.fn((updates: Record<string, unknown>) => updateBuilder(updates)),
      };
    }),
  };

  return {
    admin,
    tableCalls,
    updateTableCalls,
    getRequests: () => [...requests],
  };
}

describe("connected recipient handoff response actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createAdminClientMock.mockReset();
    requireInternalUserMock.mockReset();
  });

  it("recipient account can accept a sent request", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "sent" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();

    const result = await respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
      responseNote: "Accepted by connected rater",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.handoffStatus).toBe("accepted");
    expect(result.responseNote).toBe("Accepted by connected rater");
  });

  it("recipient account can complete a sent request", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "sent" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();

    const result = await respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "completed",
      responseNote: "Completed in one pass",
    });

    expect(result).toMatchObject({
      success: true,
      handoffStatus: "completed",
      responseNote: "Completed in one pass",
    });
  });

  it("recipient account can complete an accepted request", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "accepted" })],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();

    const result = await respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "completed",
    });

    expect(result).toMatchObject({
      success: true,
      handoffStatus: "completed",
      responseNote: "ECC completed by connected recipient.",
    });
  });

  it("recipient account can reject sent and accepted requests with note", async () => {
    const sentFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "sent" })],
    });

    createAdminClientMock.mockReturnValue(sentFixture.admin);
    setActor();

    const sentResult = await respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "rejected",
      responseNote: "Rejected due to missing attachment",
    });

    expect(sentResult).toMatchObject({
      success: true,
      handoffStatus: "rejected",
      responseNote: "Rejected due to missing attachment",
    });

    const acceptedFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "accepted" })],
    });

    createAdminClientMock.mockReturnValue(acceptedFixture.admin);

    const acceptedResult = await respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "rejected",
      responseNote: "Rejected after review",
    });

    expect(acceptedResult).toMatchObject({
      success: true,
      handoffStatus: "rejected",
      responseNote: "Rejected after review",
    });
  });

  it("persists evidence reference when provided", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest()],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();

    const result = await respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "completed",
      evidenceReference: "drive://evidence/report-42.pdf",
    });

    expect(result).toMatchObject({
      success: true,
      handoffStatus: "completed",
      evidenceReference: "drive://evidence/report-42.pdf",
    });

    expect(fixture.getRequests()[0]?.evidence_reference).toBe("drive://evidence/report-42.pdf");
  });

  it("rejects wrong recipient account and installer account through connected action", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest()],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    setActor({ accountOwnerUserId: "00000000-0000-4000-8000-0000000000b1" });
    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "grant_id is out of connected recipient account scope.",
    });

    setActor({ accountOwnerUserId: "00000000-0000-4000-8000-0000000000a2" });
    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "grant_id is out of connected recipient account scope.",
    });
  });

  it("rejects revoked, missing, and invalid grants", async () => {
    const revokedFixture = makeAdminFixture({
      grants: [makeGrant({ grant_status: "revoked" })],
      requests: [makeRequest()],
    });

    createAdminClientMock.mockReturnValue(revokedFixture.admin);
    setActor();

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "grant_id must be active.",
    });

    const missingFixture = makeAdminFixture({
      grants: [],
      requests: [makeRequest()],
    });

    createAdminClientMock.mockReturnValue(missingFixture.admin);

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000ff",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "grant_id not found.",
    });

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "not-a-uuid",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "grant_id is required.",
    });
  });

  it("rejects missing request and grant/request mismatch", async () => {
    const missingRequestFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [],
    });

    createAdminClientMock.mockReturnValue(missingRequestFixture.admin);
    setActor();

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "workflow_handoff_request_id not found for grant_id.",
    });

    const mismatchFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ id: "00000000-0000-4000-8000-0000000000ab" })],
      forceRequestSelectRow: makeRequest({ id: "00000000-0000-4000-8000-0000000000ab" }),
    });

    createAdminClientMock.mockReturnValue(mismatchFixture.admin);

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "grant_id does not match workflow_handoff_request_id.",
    });
  });

  it("rejects rejected response without note", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest()],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "rejected",
    })).resolves.toEqual({
      success: false,
      error: "response_note is required when rejecting a handoff request.",
    });
  });

  it("rejects terminal and invalid status transitions", async () => {
    const completedFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "completed" })],
    });

    createAdminClientMock.mockReturnValue(completedFixture.admin);
    setActor();

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "handoff request cannot transition from completed to accepted.",
    });

    const rejectedFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "rejected" })],
    });

    createAdminClientMock.mockReturnValue(rejectedFixture.admin);

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "completed",
    })).resolves.toEqual({
      success: false,
      error: "handoff request cannot transition from rejected to completed.",
    });

    const cancelledFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_status: "cancelled" })],
    });

    createAdminClientMock.mockReturnValue(cancelledFixture.admin);

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "handoff request cannot transition from cancelled to accepted.",
    });
  });

  it("rejects non-ecc grant or request", async () => {
    const nonEccGrantFixture = makeAdminFixture({
      grants: [makeGrant({ handoff_kind: "general_future" })],
      requests: [makeRequest()],
    });

    createAdminClientMock.mockReturnValue(nonEccGrantFixture.admin);
    setActor();

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "grant_id must be ecc.",
    });

    const nonEccRequestFixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest({ handoff_kind: "general_future" })],
    });

    createAdminClientMock.mockReturnValue(nonEccRequestFixture.admin);

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "workflow_handoff_request_id must be ecc.",
    });
  });

  it("rejects non-active internal user contexts", async () => {
    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockRejectedValue({
      name: "InternalAccessError",
      code: "AUTH_REQUIRED",
    });

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "Authentication required.",
    });

    requireInternalUserMock.mockRejectedValue({
      name: "InternalAccessError",
      code: "INTERNAL_USER_REQUIRED",
    });

    await expect(respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "accepted",
    })).resolves.toEqual({
      success: false,
      error: "Active internal user required.",
    });
  });

  it("touches only grants and requests for reads and only requests for writes", async () => {
    const fixture = makeAdminFixture({
      grants: [makeGrant()],
      requests: [makeRequest()],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);
    setActor();

    const result = await respondToConnectedRecipientHandoffRequest({
      grantId: "00000000-0000-4000-8000-0000000000a1",
      responseStatus: "completed",
    });

    expect(result.success).toBe(true);
    expect(new Set(fixture.tableCalls)).toEqual(new Set([
      "workflow_handoff_request_grants",
      "workflow_handoff_requests",
    ]));
    expect(fixture.updateTableCalls).toEqual(["workflow_handoff_requests"]);

    const forbiddenTables = [
      "jobs",
      "service_cases",
      "customers",
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "workflow_instances",
      "workflow_instance_milestones",
      "authorized_handoff_recipients",
      "account_handoff_connections",
    ];

    for (const table of forbiddenTables) {
      expect(fixture.tableCalls).not.toContain(table);
      expect(fixture.updateTableCalls).not.toContain(table);
    }
  });
});
