import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

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

type FixtureInput = {
  authUserId?: string | null;
  supportUsers?: SupportUser[];
  grants?: SupportGrant[];
  sessions?: SupportSession[];
};

function makeFixture(input: FixtureInput = {}) {
  const supportUsers = input.supportUsers ?? [];
  const grants = input.grants ?? [];
  const sessions = input.sessions ?? [];
  const auditInserts: Array<Record<string, unknown>> = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: input.authUserId ? { id: input.authUserId } : null,
        },
        error: null,
      })),
    },
  };

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
          maybeSingle: vi.fn(async () => {
            const sessionId = String(query.__filters.id ?? "").trim();
            const row = sessions.find((item) => item.id === sessionId) ?? null;
            return { data: row, error: null };
          }),
          __filters: {} as Record<string, unknown>,
        };
        return query;
      }

      if (table === "support_access_audit_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            auditInserts.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, admin, auditInserts };
}

describe("support access resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("denies when auth user is not a support user", async () => {
    const fixture = makeFixture({ authUserId: "auth-user-1" });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext, isSupportAccessError } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_USER_NOT_FOUND" });

    try {
      await resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
      });
    } catch (error) {
      expect(isSupportAccessError(error)).toBe(true);
    }
  });

  it("denies when support user is inactive", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
          is_active: false,
        },
      ],
    });

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_USER_INACTIVE" });
  });

  it("denies when no grant exists", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
          is_active: true,
        },
      ],
    });

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_NOT_FOUND" });
  });

  it("denies when grant is expired", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
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
          expires_at: "2026-05-01T00:05:00.000Z",
        },
      ],
    });

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
        now: new Date("2026-05-01T00:06:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_EXPIRED" });
  });

  it("denies when grant is inactive", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
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

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_GRANT_INACTIVE" });
  });

  it("denies when session is expired", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
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
      sessions: [
        {
          id: "session-1",
          support_user_id: "support-user-1",
          support_account_grant_id: "grant-1",
          account_owner_user_id: "owner-1",
          access_mode: "read_only",
          status: "active",
          started_at: "2026-05-01T00:00:00.000Z",
          expires_at: "2026-05-01T00:05:00.000Z",
          ended_at: null,
        },
      ],
    });

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
        now: new Date("2026-05-01T00:06:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_SESSION_EXPIRED" });
  });

  it("denies when session account does not match requested account", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
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
      sessions: [
        {
          id: "session-1",
          support_user_id: "support-user-1",
          support_account_grant_id: "grant-1",
          account_owner_user_id: "owner-2",
          access_mode: "read_only",
          status: "active",
          started_at: "2026-05-01T00:00:00.000Z",
          expires_at: "2026-05-01T01:00:00.000Z",
          ended_at: null,
        },
      ],
    });

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_SESSION_ACCOUNT_MISMATCH" });
  });

  it("resolves read-only support access when checks pass", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
          display_name: "Support Agent",
          default_access_mode: "read_only",
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

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    const resolved = await resolveSupportAccessContext({
      accountOwnerUserId: "owner-1",
      supportAccessSessionId: "session-1",
      requestedMode: "read_only",
      now: new Date("2026-05-01T00:30:00.000Z"),
    });

    expect(resolved).toEqual({
      actorUserId: "auth-user-1",
      supportUserId: "support-user-1",
      supportDisplayName: "Support Agent",
      accountOwnerUserId: "owner-1",
      supportAccountGrantId: "grant-1",
      supportAccessSessionId: "session-1",
      accessMode: "read_only",
    });
  });

  it("denies write mode in V1", async () => {
    const fixture = makeFixture({
      authUserId: "auth-user-1",
      supportUsers: [
        {
          id: "support-user-1",
          auth_user_id: "auth-user-1",
          is_active: true,
        },
      ],
      grants: [
        {
          id: "grant-1",
          support_user_id: "support-user-1",
          account_owner_user_id: "owner-1",
          access_mode: "write",
          status: "active",
          starts_at: "2026-05-01T00:00:00.000Z",
          expires_at: null,
        },
      ],
      sessions: [
        {
          id: "session-1",
          support_user_id: "support-user-1",
          support_account_grant_id: "grant-1",
          account_owner_user_id: "owner-1",
          access_mode: "write",
          status: "active",
          started_at: "2026-05-01T00:00:00.000Z",
          expires_at: "2026-05-01T01:00:00.000Z",
          ended_at: null,
        },
      ],
    });

    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { resolveSupportAccessContext } = await import("@/lib/support/support-access");

    await expect(
      resolveSupportAccessContext({
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
        requestedMode: "write",
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_MODE_NOT_ALLOWED_V1" });
  });
});

describe("support access audit helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("builds expected audit payload shape and writes through admin dependency", async () => {
    const fixture = makeFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const {
      buildSupportAccessAuditPayload,
      recordSupportAccessAuditEvent,
    } = await import("@/lib/support/support-access");

    const payload = buildSupportAccessAuditPayload({
      supportUserId: "support-user-1",
      accountOwnerUserId: "owner-1",
      supportAccessSessionId: "session-1",
      eventType: "account_viewed",
      outcome: "allowed",
      reasonCode: null,
      metadata: { route: "/ops", requestId: "req-1" },
    });

    expect(payload).toEqual({
      support_user_id: "support-user-1",
      account_owner_user_id: "owner-1",
      support_access_session_id: "session-1",
      event_type: "account_viewed",
      outcome: "allowed",
      reason_code: null,
      metadata: { route: "/ops", requestId: "req-1" },
    });

    const inserted = await recordSupportAccessAuditEvent({
      supportUserId: "support-user-1",
      accountOwnerUserId: "owner-1",
      supportAccessSessionId: "session-1",
      eventType: "account_viewed",
      outcome: "allowed",
      metadata: { route: "/ops", requestId: "req-1" },
    });

    expect(inserted).toEqual(payload);
    expect(fixture.auditInserts).toEqual([payload]);
  });
});
