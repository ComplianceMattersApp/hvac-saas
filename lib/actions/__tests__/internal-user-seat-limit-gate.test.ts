import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const resolveAccountEntitlementMock = vi.fn();
const reconcilePlatformSubscriptionSeatQuantityMock = vi.fn();

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

type InternalUserRow = {
  user_id: string;
  role: "admin" | "office" | "tech";
  is_active: boolean;
  account_owner_user_id: string;
  created_by: string | null;
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

function buildTargetUserFormData() {
  const formData = new FormData();
  formData.set("user_id", "target-user");
  formData.set("role", "office");
  return formData;
}

function buildInviteFormData() {
  const formData = new FormData();
  formData.set("email", "target@example.com");
  formData.set("role", "office");
  return formData;
}

function buildAdminFixture(options?: {
  internalUsersById?: Record<string, InternalUserRow>;
  profileByEmail?: Record<string, { id: string; email: string }>;
}) {
  const internalUsersById = { ...(options?.internalUsersById ?? {}) };
  const profileByEmail = { ...(options?.profileByEmail ?? {}) };

  const writes = {
    insertCount: 0,
    updateCount: 0,
    inviteCount: 0,
  };

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
            const userId = String(
              filters.find((entry) => entry.column === "user_id")?.value ?? "",
            ).trim();
            const row = userId ? internalUsersById[userId] ?? null : null;
            return { data: row, error: null };
          }),
        };

        return {
          ...query,
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                writes.insertCount += 1;
                return { data: { user_id: "target-user" }, error: null };
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => {
                    writes.updateCount += 1;
                    return { data: { user_id: "target-user" }, error: null };
                  }),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "profiles") {
        const filters: Array<{ column: string; value: unknown; kind: "eq" | "ilike" }> = [];

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
            const email = String(
              filters.find((entry) => entry.kind === "ilike" && entry.column === "email")
                ?.value ?? "",
            )
              .trim()
              .toLowerCase();
            const hit = profileByEmail[email] ?? null;
            return { data: hit, error: null };
          }),
        };

        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async () => {
          writes.inviteCount += 1;
          return {
            data: { user: { id: "invited-user" } },
            error: null,
          };
        }),
        getUserById: vi.fn(async () => ({
          data: {
            user: {
              id: "invited-user",
              email: "target@example.com",
              invited_at: "2026-06-20T12:00:00.000Z",
              email_confirmed_at: null,
              user_metadata: {},
            },
          },
          error: null,
        })),
        updateUserById: vi.fn(async () => ({ error: null })),
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
  };

  return { admin, writes };
}

describe("internal user seat limit enforcement gate (V1C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue(actorAuth());
    reconcilePlatformSubscriptionSeatQuantityMock.mockResolvedValue({
      skipped: false,
      reason: "updated",
    });
  });

  it("blocks createInternalUserFromForm when active seats reach finite seat limit", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    resolveAccountEntitlementMock.mockResolvedValue({
      seatLimit: 2,
      activeSeatCount: 2,
      isInternalComped: false,
    });

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.createInternalUserFromForm(buildTargetUserFormData())).rejects.toThrow(
      "INTERNAL_USERS_SEAT_LIMIT_REACHED",
    );
    expect(fixture.writes.insertCount).toBe(0);
  });

  it("blocks inviteInternalUserFromForm when active seats reach finite seat limit", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    resolveAccountEntitlementMock.mockResolvedValue({
      seatLimit: 1,
      activeSeatCount: 1,
      isInternalComped: false,
    });

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.inviteInternalUserFromForm(buildInviteFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=seat_limit_reached",
    );
    expect(fixture.writes.inviteCount).toBe(0);
    expect(fixture.writes.insertCount).toBe(0);
  });

  it("blocks activateInternalUserFromForm when active seats reach finite seat limit", async () => {
    const fixture = buildAdminFixture({
      internalUsersById: {
        "target-user": {
          user_id: "target-user",
          role: "office",
          is_active: false,
          account_owner_user_id: "owner-1",
          created_by: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    resolveAccountEntitlementMock.mockResolvedValue({
      seatLimit: 3,
      activeSeatCount: 3,
      isInternalComped: false,
    });

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.activateInternalUserFromForm(buildTargetUserFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=seat_limit_reached",
    );
    expect(fixture.writes.updateCount).toBe(0);
  });

  it("allows createInternalUserFromForm when account is under finite seat limit", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    resolveAccountEntitlementMock.mockResolvedValue({
      seatLimit: 5,
      activeSeatCount: 4,
      isInternalComped: false,
    });

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.createInternalUserFromForm(buildTargetUserFormData())).resolves.toBeUndefined();
    expect(fixture.writes.insertCount).toBe(1);
  });

  it("allows activateInternalUserFromForm when seat_limit is null", async () => {
    const fixture = buildAdminFixture({
      internalUsersById: {
        "target-user": {
          user_id: "target-user",
          role: "office",
          is_active: false,
          account_owner_user_id: "owner-1",
          created_by: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    resolveAccountEntitlementMock.mockResolvedValue({
      seatLimit: null,
      activeSeatCount: 999,
      isInternalComped: false,
    });

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.activateInternalUserFromForm(buildTargetUserFormData())).resolves.toBeUndefined();
    expect(fixture.writes.updateCount).toBe(1);
  });

  it("allows inviteInternalUserFromForm for comped internal accounts", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    resolveAccountEntitlementMock.mockResolvedValue({
      seatLimit: 1,
      activeSeatCount: 999,
      isInternalComped: true,
    });

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.inviteInternalUserFromForm(buildInviteFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=invited",
    );
    expect(fixture.writes.inviteCount).toBe(1);
  });
});
