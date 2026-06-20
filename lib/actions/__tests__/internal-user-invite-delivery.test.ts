import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const resolveAccountEntitlementMock = vi.fn();
const reconcilePlatformSubscriptionSeatQuantityMock = vi.fn();
const sendInviteEmailMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveAccountEntitlement: (...args: unknown[]) => resolveAccountEntitlementMock(...args),
}));

vi.mock("@/lib/business/platform-billing-stripe", async () => {
  const actual = await vi.importActual("@/lib/business/platform-billing-stripe");
  return {
    ...(actual as object),
    reconcilePlatformSubscriptionSeatQuantity: (...args: unknown[]) =>
      reconcilePlatformSubscriptionSeatQuantityMock(...args),
  };
});

vi.mock("@/lib/email/smtp", () => ({
  sendInviteEmail: (...args: unknown[]) => sendInviteEmailMock(...args),
}));

type InternalUserRow = {
  user_id: string;
  role: "admin" | "office" | "tech" | "billing";
  is_active: boolean;
  account_owner_user_id: string;
  created_by: string | null;
};

type AuthUserRow = {
  id: string;
  email: string;
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

function actorAuth() {
  return {
    userId: "actor-1",
    internalUser: {
      user_id: "actor-1",
      role: "admin",
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: null,
    },
  };
}

function inviteFormData() {
  const formData = new FormData();
  formData.set("email", "target@example.com");
  formData.set("role", "office");
  return formData;
}

function resendFormData(userId = "target-user") {
  const formData = new FormData();
  formData.set("user_id", userId);
  return formData;
}

function buildAdminFixture(options?: {
  internalUsersById?: Record<string, InternalUserRow>;
  authUsersById?: Record<string, AuthUserRow>;
  emailUserIdMap?: Record<string, string>;
  inviteError?: any;
  generateLinkError?: any;
}) {
  const internalUsersById = { ...(options?.internalUsersById ?? {}) };
  const authUsersById = { ...(options?.authUsersById ?? {}) };
  const emailUserIdMap = { ...(options?.emailUserIdMap ?? {}) };

  const writes = {
    insertCount: 0,
    updateCount: 0,
    inviteCount: 0,
    generateLinkCount: 0,
    metadataUpdateCount: 0,
  };

  function findUserIdByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return (
      emailUserIdMap[normalized] ??
      Object.values(authUsersById).find((user) => user.email.trim().toLowerCase() === normalized)?.id ??
      null
    );
  }

  const admin = {
    from(table: string) {
      if (table === "internal_users") {
        const filters: Array<{ column: string; value: unknown }> = [];
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value });
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            const userId = String(filters.find((entry) => entry.column === "user_id")?.value ?? "").trim();
            const row = userId ? internalUsersById[userId] ?? null : null;
            return { data: row, error: null };
          }),
        };

        return {
          ...query,
          insert: vi.fn((payload: any) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                writes.insertCount += 1;
                internalUsersById[String(payload.user_id)] = payload;
                return { data: { user_id: payload.user_id }, error: null };
              }),
            })),
          })),
          update: vi.fn((payload: any) => ({
            eq: vi.fn((column: string, value: unknown) => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => {
                    writes.updateCount += 1;
                    const userId = column === "user_id" ? String(value) : "target-user";
                    internalUsersById[userId] = { ...internalUsersById[userId], ...payload };
                    return { data: { user_id: userId }, error: null };
                  }),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        const filters: Array<{ column: string; value: unknown; kind: "ilike" | "eq" }> = [];
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value, kind: "eq" });
            return query;
          }),
          ilike: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value, kind: "ilike" });
            return query;
          }),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            const email = String(filters.find((entry) => entry.kind === "ilike" && entry.column === "email")?.value ?? "")
              .trim()
              .toLowerCase();
            const userId = findUserIdByEmail(email);
            return { data: userId ? { id: userId, email } : null, error: null };
          }),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async (email: string) => {
          writes.inviteCount += 1;
          if (options?.inviteError) {
            return { data: null, error: options.inviteError };
          }

          const id = findUserIdByEmail(email) ?? "invited-user";
          authUsersById[id] = authUsersById[id] ?? {
            id,
            email,
            invited_at: "2026-06-20T12:00:00.000Z",
            email_confirmed_at: null,
            user_metadata: {},
          };
          return { data: { user: { id } }, error: null };
        }),
        generateLink: vi.fn(async () => {
          writes.generateLinkCount += 1;
          if (options?.generateLinkError) {
            return { data: null, error: options.generateLinkError };
          }
          return { data: { properties: { action_link: "https://example.com/setup" } }, error: null };
        }),
        getUserById: vi.fn(async (userId: string) => {
          const user = authUsersById[userId] ?? null;
          return { data: { user }, error: null };
        }),
        updateUserById: vi.fn(async () => {
          writes.metadataUpdateCount += 1;
          return { error: null };
        }),
        listUsers: vi.fn(async () => ({ data: { users: Object.values(authUsersById) }, error: null })),
      },
    },
  };

  return { admin, writes };
}

describe("internal user invite delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue(actorAuth());
    resolveAccountEntitlementMock.mockResolvedValue({
      seatLimit: null,
      activeSeatCount: 0,
      isInternalComped: false,
    });
    reconcilePlatformSubscriptionSeatQuantityMock.mockResolvedValue({
      skipped: false,
      reason: "updated",
    });
    sendInviteEmailMock.mockResolvedValue(undefined);
  });

  it("sends a Supabase invite and inserts one internal user for a new team invite", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.inviteInternalUserFromForm(inviteFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=invited",
    );

    expect(fixture.writes.inviteCount).toBe(1);
    expect(fixture.writes.insertCount).toBe(1);
    expect(fixture.writes.metadataUpdateCount).toBe(1);
  });

  it("does not insert or show false success when invite delivery fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fixture = buildAdminFixture({
      inviteError: { message: "SMTP not configured", status: 500 },
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.inviteInternalUserFromForm(inviteFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=invite_send_failed",
    );

    expect(fixture.writes.insertCount).toBe(0);
    warnSpy.mockRestore();
  });

  it("does not insert or show false success when existing-user setup email fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sendInviteEmailMock.mockRejectedValueOnce(new Error("Missing RESEND_API_KEY"));
    const fixture = buildAdminFixture({
      inviteError: { message: "User already registered" },
      emailUserIdMap: { "target@example.com": "target-user" },
      authUsersById: {
        "target-user": {
          id: "target-user",
          email: "target@example.com",
          invited_at: "2026-06-20T12:00:00.000Z",
          email_confirmed_at: null,
          user_metadata: {},
        },
      },
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.inviteInternalUserFromForm(inviteFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=invite_send_failed",
    );

    expect(fixture.writes.insertCount).toBe(0);
    expect(fixture.writes.generateLinkCount).toBe(1);
    warnSpy.mockRestore();
  });

  it("resends a pending internal invite without creating duplicate rows", async () => {
    const fixture = buildAdminFixture({
      inviteError: { message: "User already registered" },
      internalUsersById: {
        "target-user": {
          user_id: "target-user",
          role: "office",
          is_active: true,
          account_owner_user_id: "owner-1",
          created_by: null,
        },
      },
      authUsersById: {
        "target-user": {
          id: "target-user",
          email: "target@example.com",
          invited_at: "2026-06-20T12:00:00.000Z",
          email_confirmed_at: null,
          user_metadata: {},
        },
      },
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.resendInternalInviteFromForm(resendFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?resend_status=resent",
    );

    expect(fixture.writes.insertCount).toBe(0);
    expect(fixture.writes.updateCount).toBe(0);
    expect(fixture.writes.generateLinkCount).toBe(1);
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
  });

  it("blocks resend for accepted active users", async () => {
    const fixture = buildAdminFixture({
      internalUsersById: {
        "target-user": {
          user_id: "target-user",
          role: "office",
          is_active: true,
          account_owner_user_id: "owner-1",
          created_by: null,
        },
      },
      authUsersById: {
        "target-user": {
          id: "target-user",
          email: "target@example.com",
          email_confirmed_at: "2026-06-20T12:10:00.000Z",
          user_metadata: {},
        },
      },
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.resendInternalInviteFromForm(resendFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?resend_status=not_pending",
    );

    expect(fixture.writes.inviteCount).toBe(0);
    expect(sendInviteEmailMock).not.toHaveBeenCalled();
  });
});
