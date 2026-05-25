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

function buildInviteFormData(role = "billing") {
  const formData = new FormData();
  formData.set("email", "billing.user@example.com");
  formData.set("role", role);
  return formData;
}

function buildUpdateRoleFormData(role = "billing") {
  const formData = new FormData();
  formData.set("user_id", "target-user");
  formData.set("role", role);
  return formData;
}

function actorAuth() {
  return {
    userId: "admin-1",
    internalUser: {
      user_id: "admin-1",
      role: "admin",
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: null,
    },
  };
}

function makeAdminFixture() {
  const writes = {
    insertedInternalUsers: [] as Array<Record<string, unknown>>,
    updatedInternalUsers: [] as Array<Record<string, unknown>>,
  };

  const internalUsersById: Record<string, any> = {
    "target-user": {
      user_id: "target-user",
      role: "office",
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: "admin-1",
    },
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        const query: any = {
          select: vi.fn(() => query),
          ilike: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: { id: "invited-user", email: "billing.user@example.com" },
            error: null,
          })),
        };
        return query;
      }

      if (table === "internal_users") {
        const filters: Record<string, unknown> = {};

        const selectQuery: any = {
          select: vi.fn(() => selectQuery),
          eq: vi.fn((column: string, value: unknown) => {
            filters[column] = value;
            return selectQuery;
          }),
          maybeSingle: vi.fn(async () => {
            const userId = String(filters.user_id ?? "").trim();
            const accountOwner = String(filters.account_owner_user_id ?? "").trim();
            const row = internalUsersById[userId] ?? null;
            if (!row) return { data: null, error: null };
            if (accountOwner && row.account_owner_user_id !== accountOwner) {
              return { data: null, error: null };
            }
            return { data: row, error: null };
          }),
        };

        return {
          ...selectQuery,
          insert: vi.fn((payload: Record<string, unknown>) => {
            writes.insertedInternalUsers.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { user_id: "invited-user" }, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            writes.updatedInternalUsers.push(payload);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { user_id: "target-user" }, error: null })),
                  })),
                })),
              })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async () => ({
          data: { user: { id: "invited-user" } },
          error: null,
        })),
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
  };

  return { admin, writes };
}

describe("internal-user actions billing role support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    createAdminClientMock.mockReturnValue(makeAdminFixture().admin);
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
  });

  it("accepts billing in invite role parser", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.inviteInternalUserFromForm(buildInviteFormData("billing"))).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=invited",
    );

    expect(fixture.writes.insertedInternalUsers[0]).toEqual(
      expect.objectContaining({ role: "billing" }),
    );
  });

  it("accepts billing in manage role parser", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.updateInternalUserRoleFromForm(buildUpdateRoleFormData("billing"))).resolves.toBeUndefined();

    expect(fixture.writes.updatedInternalUsers[0]).toEqual(
      expect.objectContaining({ role: "billing" }),
    );
  });

  it("keeps team role management admin-only", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    requireInternalRoleMock.mockRejectedValueOnce(new Error("INTERNAL_ROLE_REQUIRED"));

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.updateInternalUserRoleFromForm(buildUpdateRoleFormData("billing"))).rejects.toThrow(
      "INTERNAL_ROLE_REQUIRED",
    );

    expect(fixture.writes.updatedInternalUsers).toHaveLength(0);
  });
});
