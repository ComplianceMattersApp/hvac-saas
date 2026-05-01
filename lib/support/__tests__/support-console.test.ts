import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();
const resolveSupportAccessContextMock = vi.fn();
const recordSupportAccessAuditEventMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/support/support-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/support/support-access")>("@/lib/support/support-access");
  return {
    ...actual,
    resolveSupportAccessContext: (...args: unknown[]) => resolveSupportAccessContextMock(...args),
    recordSupportAccessAuditEvent: (...args: unknown[]) => recordSupportAccessAuditEventMock(...args),
  };
});

type SupportUser = {
  id: string;
  auth_user_id: string;
  display_name?: string | null;
  default_access_mode?: "read_only" | "write";
  is_active: boolean;
};

type SupportGrant = {
  id: string;
  support_user_id: string;
  account_owner_user_id: string;
  access_mode: "read_only" | "write";
  status: "active" | "inactive" | "revoked";
  starts_at: string;
  expires_at: string | null;
  created_at?: string;
};

type SupportSession = {
  id: string;
  support_user_id: string;
  support_account_grant_id: string;
  account_owner_user_id: string;
  access_mode: "read_only" | "write";
  status: "active" | "ended" | "expired" | "revoked";
  started_at: string;
  expires_at: string;
  ended_at: string | null;
};

function makeFixture(input: {
  supportUsers?: SupportUser[];
  grants?: SupportGrant[];
  sessions?: SupportSession[];
} = {}) {
  const supportUsers = input.supportUsers ?? [];
  const grants = input.grants ?? [];
  const sessions = [...(input.sessions ?? [])];

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "support_users") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            query.__filters[column] = value;
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            const authUserId = String(query.__filters.auth_user_id ?? "").trim();
            const row = supportUsers.find((item) => item.auth_user_id === authUserId) ?? null;
            return { data: row, error: null };
          }),
          __filters: {} as Record<string, unknown>,
        };
        return query;
      }

      if (table === "support_account_grants") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            query.__filters[column] = value;
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            const supportUserId = String(query.__filters.support_user_id ?? "").trim();
            const accountOwnerUserId = String(query.__filters.account_owner_user_id ?? "").trim();

            const rows = grants.filter(
              (item) =>
                item.support_user_id === supportUserId &&
                item.account_owner_user_id === accountOwnerUserId,
            );

            const row = rows.length > 0 ? rows[0] : null;
            return { data: row, error: null };
          }),
          __filters: {} as Record<string, unknown>,
        };
        return query;
      }

      if (table === "support_access_sessions") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            query.__filters[column] = value;
            return query;
          }),
          is: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            const supportUserId = String(query.__filters.support_user_id ?? "").trim();
            const accountOwnerUserId = String(query.__filters.account_owner_user_id ?? "").trim();
            const status = String(query.__filters.status ?? "").trim();

            const row = sessions.find(
              (item) =>
                item.support_user_id === supportUserId &&
                item.account_owner_user_id === accountOwnerUserId &&
                item.status === status &&
                item.ended_at === null,
            ) ?? null;

            return { data: row, error: null };
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            const inserted: SupportSession = {
              id: `session-${sessions.length + 1}`,
              support_user_id: String(payload.support_user_id),
              support_account_grant_id: String(payload.support_account_grant_id),
              account_owner_user_id: String(payload.account_owner_user_id),
              access_mode: "read_only",
              status: "active",
              started_at: String(payload.started_at),
              expires_at: String(payload.expires_at),
              ended_at: null,
            };
            sessions.unshift(inserted);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: inserted, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((column: string, value: unknown) => {
              query.__updateFilters[column] = value;
              return {
                eq: vi.fn((columnB: string, valueB: unknown) => {
                  query.__updateFilters[columnB] = valueB;
                  return {
                    eq: vi.fn((columnC: string, valueC: unknown) => {
                      query.__updateFilters[columnC] = valueC;
                      return {
                        eq: vi.fn((columnD: string, valueD: unknown) => {
                          query.__updateFilters[columnD] = valueD;
                          return {
                            is: vi.fn(() => ({
                              select: vi.fn(() => ({
                                maybeSingle: vi.fn(async () => {
                                  const row = sessions.find((item) => item.id === String(query.__updateFilters.id));
                                  if (!row || row.status !== "active" || row.ended_at !== null) {
                                    return { data: null, error: null };
                                  }
                                  row.status = "ended";
                                  row.ended_at = String(payload.ended_at ?? new Date().toISOString());
                                  return { data: row, error: null };
                                }),
                              })),
                            })),
                          };
                        }),
                      };
                    }),
                  };
                }),
              };
            }),
          })),
          __filters: {} as Record<string, unknown>,
          __updateFilters: {} as Record<string, unknown>,
        };
        return query;
      }

      if (table === "support_access_audit_events") {
        const query: any = {
          select: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          eq: vi.fn(() => query),
          then: (onFulfilled: (value: any) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onFulfilled),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { admin, sessions };
}

describe("support console session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    resolveSupportAccessContextMock.mockResolvedValue({ accessMode: "read_only" });
    recordSupportAccessAuditEventMock.mockResolvedValue({});
  });

  it("denies start when support user does not exist and records denied audit", async () => {
    const fixture = makeFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { startReadOnlySupportSession } = await import("@/lib/support/support-console");

    await expect(
      startReadOnlySupportSession({
        actorUserId: "actor-1",
        accountOwnerUserId: "owner-1",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_USER_NOT_FOUND" });

    expect(recordSupportAccessAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "access_denied",
        reasonCode: "SUPPORT_USER_NOT_FOUND",
      }),
    );
  });

  it("denies start when grant is inactive or expired", async () => {
    const fixture = makeFixture({
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "actor-1",
          is_active: true,
        },
      ],
      grants: [
        {
          id: "grant-1",
          support_user_id: "support-user-1",
          account_owner_user_id: "owner-1",
          access_mode: "read_only",
          status: "inactive",
          starts_at: "2026-05-01T00:00:00.000Z",
          expires_at: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { startReadOnlySupportSession } = await import("@/lib/support/support-console");

    await expect(
      startReadOnlySupportSession({
        actorUserId: "actor-1",
        accountOwnerUserId: "owner-1",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_INACTIVE" });

    expect(recordSupportAccessAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "access_denied" }),
    );
  });

  it("starts read-only session for active read-only grant and writes session_started audit", async () => {
    const fixture = makeFixture({
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "actor-1",
          is_active: true,
        },
      ],
      grants: [
        {
          id: "grant-1",
          support_user_id: "support-user-1",
          account_owner_user_id: "owner-1",
          access_mode: "read_only",
          status: "active",
          starts_at: "2026-05-01T00:00:00.000Z",
          expires_at: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { startReadOnlySupportSession } = await import("@/lib/support/support-console");

    const result = await startReadOnlySupportSession({
      actorUserId: "actor-1",
      accountOwnerUserId: "owner-1",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result.id).toBeTruthy();
    expect(result.access_mode).toBe("read_only");
    expect(resolveSupportAccessContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedMode: "read_only",
        supportAccessSessionId: result.id,
      }),
    );
    expect(recordSupportAccessAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_started",
        outcome: "allowed",
      }),
    );
  });

  it("ends only matching active session and writes session_ended audit", async () => {
    const fixture = makeFixture({
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "actor-1",
          is_active: true,
        },
      ],
      sessions: [
        {
          id: "session-1",
          support_user_id: "support-user-1",
          support_account_grant_id: "grant-1",
          account_owner_user_id: "owner-1",
          access_mode: "read_only",
          status: "active",
          started_at: "2026-05-01T00:00:00.000Z",
          expires_at: "2026-05-01T01:00:00.000Z",
          ended_at: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(fixture.admin);

    const { endSupportSession } = await import("@/lib/support/support-console");

    const ended = await endSupportSession({
      actorUserId: "actor-1",
      accountOwnerUserId: "owner-1",
      supportAccessSessionId: "session-1",
      now: new Date("2026-05-01T00:30:00.000Z"),
    });

    expect(ended.status).toBe("ended");
    expect(ended.ended_at).toBeTruthy();
    expect(recordSupportAccessAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_ended",
        outcome: "allowed",
      }),
    );
  });
});
