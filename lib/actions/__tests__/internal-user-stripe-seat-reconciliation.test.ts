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

function buildCreateOrUpdateFormData() {
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
  activeAdminCount?: number;
  activeAssignmentCount?: number;
}) {
  const internalUsersById = { ...(options?.internalUsersById ?? {}) };
  const profileByEmail = { ...(options?.profileByEmail ?? {}) };

  const writes = {
    insertCount: 0,
    updateCount: 0,
    deleteCount: 0,
    inviteCount: 0,
  };

  const admin = {
    from(table: string) {
      if (table === "internal_users") {
        const filters: Array<{ column: string; value: unknown }> = [];
        let headCount = false;

        const query: any = {
          select: vi.fn((_columns: string, opts?: { head?: boolean }) => {
            headCount = Boolean(opts?.head);
            return query;
          }),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value });
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            const userId = String(
              filters.find((entry) => entry.column === "user_id")?.value ?? "",
            ).trim();
            const accountOwnerFilter = String(
              filters.find((entry) => entry.column === "account_owner_user_id")?.value ?? "",
            ).trim();
            const row = userId ? internalUsersById[userId] ?? null : null;

            if (row && accountOwnerFilter && row.account_owner_user_id !== accountOwnerFilter) {
              return { data: null, error: null };
            }

            return { data: row, error: null };
          }),
          then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
            Promise.resolve(
              headCount
                ? { count: options?.activeAdminCount ?? 2, error: null }
                : { data: null, error: null },
            ).then(onFulfilled, onRejected),
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
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => {
                    writes.deleteCount += 1;
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

      if (table === "job_assignments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ count: options?.activeAssignmentCount ?? 0, error: null })),
            })),
          })),
        };
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
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
  };

  return { admin, writes };
}

describe("internal user Stripe seat reconciliation wiring (V1D-B)", () => {
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
  });

  it("calls reconciliation after createInternalUserFromForm succeeds", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.createInternalUserFromForm(buildCreateOrUpdateFormData())).resolves.toBeUndefined();

    expect(fixture.writes.insertCount).toBe(1);
    expect(reconcilePlatformSubscriptionSeatQuantityMock).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
  });

  it("calls reconciliation after inviteInternalUserFromForm succeeds", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.inviteInternalUserFromForm(buildInviteFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?invite_status=invited",
    );

    expect(fixture.writes.insertCount).toBe(1);
    expect(reconcilePlatformSubscriptionSeatQuantityMock).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
  });

  it("calls reconciliation after activateInternalUserFromForm succeeds", async () => {
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

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.activateInternalUserFromForm(buildCreateOrUpdateFormData())).resolves.toBeUndefined();

    expect(fixture.writes.updateCount).toBe(1);
    expect(reconcilePlatformSubscriptionSeatQuantityMock).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
  });

  it("calls reconciliation after deactivateInternalUserFromForm succeeds", async () => {
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
      activeAdminCount: 2,
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.deactivateInternalUserFromForm(buildCreateOrUpdateFormData())).resolves.toBeUndefined();

    expect(fixture.writes.updateCount).toBe(1);
    expect(reconcilePlatformSubscriptionSeatQuantityMock).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
  });

  it("calls reconciliation after deleteInternalUserFromForm succeeds", async () => {
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
      activeAdminCount: 2,
      activeAssignmentCount: 0,
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.deleteInternalUserFromForm(buildCreateOrUpdateFormData())).resolves.toBeUndefined();

    expect(fixture.writes.deleteCount).toBe(1);
    expect(reconcilePlatformSubscriptionSeatQuantityMock).toHaveBeenCalledWith({
      accountOwnerUserId: "owner-1",
    });
  });

  it("does not call reconciliation for role-only updates", async () => {
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
      activeAdminCount: 2,
    });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.updateInternalUserRoleFromForm(buildCreateOrUpdateFormData())).resolves.toBeUndefined();

    expect(fixture.writes.updateCount).toBe(1);
    expect(reconcilePlatformSubscriptionSeatQuantityMock).not.toHaveBeenCalled();
  });

  it("does not throw to caller when reconciliation fails after mutation", async () => {
    const fixture = buildAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    reconcilePlatformSubscriptionSeatQuantityMock.mockRejectedValueOnce(
      new Error("stripe down"),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(mod.createInternalUserFromForm(buildCreateOrUpdateFormData())).resolves.toBeUndefined();

    expect(fixture.writes.insertCount).toBe(1);
    expect(reconcilePlatformSubscriptionSeatQuantityMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
