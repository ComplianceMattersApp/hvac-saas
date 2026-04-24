import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const inviteContractorMock = vi.fn();
const resetPasswordForEmailMock = vi.fn();

type InternalUserRow = {
  user_id: string;
  role: "admin" | "office" | "tech";
  is_active: boolean;
  account_owner_user_id: string;
  created_by: string | null;
};

type FixtureOptions = {
  internalUsersById?: Record<string, InternalUserRow>;
  emailUserIdMap?: Record<string, string>;
  contractorOwnersById?: Record<string, string>;
  throwOnInternalUsersWrite?: boolean;
  throwOnInvite?: boolean;
  throwOnGetUserById?: boolean;
  throwOnJobAssignmentsCount?: boolean;
  activeAdminCount?: number;
};

const ALLOW_PATH_REACHED = "ALLOW_PATH_REACHED";

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

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmailMock(...args),
    },
  })),
}));

vi.mock("@/lib/actions/contractor-invite-actions", () => ({
  inviteContractor: (...args: unknown[]) => inviteContractorMock(...args),
}));

vi.mock("@/lib/email/smtp", () => ({
  sendInviteEmail: vi.fn(async () => undefined),
}));

function buildAdminFixture(options: FixtureOptions = {}) {
  const internalUsersById = { ...(options.internalUsersById ?? {}) };
  const emailUserIdMap = { ...(options.emailUserIdMap ?? {}) };
  const contractorOwnersById = { ...(options.contractorOwnersById ?? {}) };
  const internalUsersWrites: Array<{ method: "insert" | "update" | "delete" }> = [];

  function withFilters(table: string) {
    const filters: Array<{ type: "eq" | "ilike"; column: string; value: unknown }> = [];
    let isHeadCountQuery = false;

    const query: any = {
      select: vi.fn((_: string, opts?: { head?: boolean; count?: string }) => {
        isHeadCountQuery = Boolean(opts?.head);
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ type: "eq", column, value });
        return query;
      }),
      ilike: vi.fn((column: string, value: unknown) => {
        filters.push({ type: "ilike", column, value });
        return query;
      }),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => resolveMaybeSingle()),
      single: vi.fn(async () => resolveSingle()),
      then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveThenable()).then(onFulfilled, onRejected),
    };

    function eqValue(column: string) {
      const hit = filters.find((filter) => filter.type === "eq" && filter.column === column);
      return hit?.value;
    }

    function resolveMaybeSingle() {
      if (table === "internal_users") {
        const userId = String(eqValue("user_id") ?? "").trim();
        const accountOwnerFilter = String(eqValue("account_owner_user_id") ?? "").trim();
        const row = userId ? internalUsersById[userId] ?? null : null;
        if (row && accountOwnerFilter && row.account_owner_user_id !== accountOwnerFilter) {
          return { data: null, error: null };
        }
        return { data: row, error: null };
      }

      if (table === "profiles") {
        const email = String(filters.find((filter) => filter.type === "ilike" && filter.column === "email")?.value ?? "")
          .trim()
          .toLowerCase();
        const userId = email ? emailUserIdMap[email] ?? null : null;
        return { data: userId ? { id: userId, email } : null, error: null };
      }

      if (table === "contractors") {
        const contractorId = String(eqValue("id") ?? "").trim();
        const ownerUserId = String(eqValue("owner_user_id") ?? "").trim();
        const owner = contractorOwnersById[contractorId];
        return {
          data: owner && owner === ownerUserId ? { id: contractorId } : null,
          error: null,
        };
      }

      throw new Error(`Unexpected maybeSingle table: ${table}`);
    }

    function resolveSingle() {
      if (table === "internal_users") {
        if (options.throwOnInternalUsersWrite) {
          throw new Error(ALLOW_PATH_REACHED);
        }
        return { data: { user_id: "ok" }, error: null };
      }

      throw new Error(`Unexpected single table: ${table}`);
    }

    function resolveThenable() {
      if (table === "internal_users" && isHeadCountQuery) {
        return { count: options.activeAdminCount ?? 2, error: null };
      }

      if (table === "job_assignments") {
        if (options.throwOnJobAssignmentsCount) {
          throw new Error(ALLOW_PATH_REACHED);
        }
        return { count: 0, error: null };
      }

      throw new Error(`Unexpected thenable table: ${table}`);
    }

    return query;
  }

  const admin = {
    from(table: string) {
      return {
        ...withFilters(table),
        insert: vi.fn(() => {
          if (table === "internal_users") {
            internalUsersWrites.push({ method: "insert" });
          }
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                if (options.throwOnInternalUsersWrite) {
                  throw new Error(ALLOW_PATH_REACHED);
                }
                return { data: { user_id: "ok" }, error: null };
              }),
            })),
          };
        }),
        update: vi.fn(() => {
          if (table === "internal_users") {
            internalUsersWrites.push({ method: "update" });
          }
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => {
                    if (options.throwOnInternalUsersWrite) {
                      throw new Error(ALLOW_PATH_REACHED);
                    }
                    return { data: { user_id: "ok" }, error: null };
                  }),
                })),
              })),
            })),
          };
        }),
        delete: vi.fn(() => {
          if (table === "internal_users") {
            internalUsersWrites.push({ method: "delete" });
          }
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => {
                    if (options.throwOnInternalUsersWrite) {
                      throw new Error(ALLOW_PATH_REACHED);
                    }
                    return { data: { user_id: "ok" }, error: null };
                  }),
                })),
              })),
            })),
          };
        }),
      };
    },
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async () => {
          if (options.throwOnInvite) {
            throw new Error(ALLOW_PATH_REACHED);
          }
          return { data: { user: { id: "invited-user" } }, error: null };
        }),
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
        getUserById: vi.fn(async () => {
          if (options.throwOnGetUserById) {
            throw new Error(ALLOW_PATH_REACHED);
          }
          return {
            data: { user: { email: "target@example.com", user_metadata: {} } },
            error: null,
          };
        }),
        updateUserById: vi.fn(async () => ({ error: null })),
      },
    },
  };

  return { admin, internalUsersWrites };
}

type TestCase = {
  entrypoint: string;
  invoke: () => Promise<unknown>;
  setupAllow: () => { internalUsersWrites: Array<{ method: "insert" | "update" | "delete" }> };
  setupCrossAccount: () => { internalUsersWrites: Array<{ method: "insert" | "update" | "delete" }> };
  expectedCrossAccountError: string;
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
  formData.set("display_name", "Target User");
  formData.set("phone", "555-111-2222");
  return formData;
}

function buildInviteUserFormData() {
  const formData = new FormData();
  formData.set("email", "target@example.com");
  formData.set("role", "office");
  return formData;
}

function buildAdminEmailFormData() {
  const formData = new FormData();
  formData.set("return_to", "/ops/admin/users");
  formData.set("email", "target@example.com");
  formData.set("role", "office");
  return formData;
}

function buildAdminContractorFormData() {
  const formData = new FormData();
  formData.set("return_to", "/ops/admin/users");
  formData.set("contractor_id", "contractor-1");
  formData.set("email", "contractor@example.com");
  return formData;
}

describe("identity/admin same-account hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue(actorAuth());

    resetPasswordForEmailMock.mockResolvedValue({ error: new Error(ALLOW_PATH_REACHED) });
    inviteContractorMock.mockRejectedValue(new Error(ALLOW_PATH_REACHED));
  });

  const cases: TestCase[] = [
    {
      entrypoint: "createInternalUserFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/internal-user-actions");
        return mod.createInternalUserFromForm(buildTargetUserFormData());
      },
      setupAllow: () => {
        const fixture = buildAdminFixture({
          internalUsersById: {},
          throwOnInternalUsersWrite: true,
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "TARGET_ACCOUNT_OWNER_MISMATCH",
    },
    {
      entrypoint: "updateInternalUserRoleFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/internal-user-actions");
        return mod.updateInternalUserRoleFromForm(buildTargetUserFormData());
      },
      setupAllow: () => {
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
          throwOnInternalUsersWrite: true,
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "TARGET_ACCOUNT_OWNER_MISMATCH",
    },
    {
      entrypoint: "activateInternalUserFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/internal-user-actions");
        return mod.activateInternalUserFromForm(buildTargetUserFormData());
      },
      setupAllow: () => {
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
          throwOnInternalUsersWrite: true,
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: false,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "TARGET_ACCOUNT_OWNER_MISMATCH",
    },
    {
      entrypoint: "deactivateInternalUserFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/internal-user-actions");
        return mod.deactivateInternalUserFromForm(buildTargetUserFormData());
      },
      setupAllow: () => {
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
          throwOnInternalUsersWrite: true,
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "TARGET_ACCOUNT_OWNER_MISMATCH",
    },
    {
      entrypoint: "inviteInternalUserFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/internal-user-actions");
        return mod.inviteInternalUserFromForm(buildInviteUserFormData());
      },
      setupAllow: () => {
        const fixture = buildAdminFixture({ throwOnInvite: true });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          emailUserIdMap: {
            "target@example.com": "cross-user",
          },
          internalUsersById: {
            "cross-user": {
              user_id: "cross-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "REDIRECT:/ops/admin/internal-users?invite_status=already_internal_other_owner",
    },
    {
      entrypoint: "deleteInternalUserFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/internal-user-actions");
        return mod.deleteInternalUserFromForm(buildTargetUserFormData());
      },
      setupAllow: () => {
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
          throwOnJobAssignmentsCount: true,
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "TARGET_ACCOUNT_OWNER_MISMATCH",
    },
    {
      entrypoint: "updateInternalUserProfileFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/internal-user-actions");
        return mod.updateInternalUserProfileFromForm(buildTargetUserFormData());
      },
      setupAllow: () => {
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
          throwOnGetUserById: true,
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "TARGET_ACCOUNT_OWNER_MISMATCH",
    },
    {
      entrypoint: "resendInternalInviteFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/admin-user-actions");
        return mod.resendInternalInviteFromForm(buildAdminEmailFormData());
      },
      setupAllow: () => {
        const fixture = buildAdminFixture({
          emailUserIdMap: {
            "target@example.com": "target-user",
          },
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-1",
              created_by: null,
            },
          },
          throwOnInvite: true,
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          emailUserIdMap: {
            "target@example.com": "cross-user",
          },
          internalUsersById: {
            "cross-user": {
              user_id: "cross-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "REDIRECT:/ops/admin/users",
    },
    {
      entrypoint: "sendPasswordResetFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/admin-user-actions");
        return mod.sendPasswordResetFromForm(buildAdminEmailFormData());
      },
      setupAllow: () => {
        const fixture = buildAdminFixture({
          emailUserIdMap: {
            "target@example.com": "target-user",
          },
          internalUsersById: {
            "target-user": {
              user_id: "target-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-1",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        resetPasswordForEmailMock.mockRejectedValueOnce(new Error(ALLOW_PATH_REACHED));
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          emailUserIdMap: {
            "target@example.com": "cross-user",
          },
          internalUsersById: {
            "cross-user": {
              user_id: "cross-user",
              role: "office",
              is_active: true,
              account_owner_user_id: "owner-2",
              created_by: null,
            },
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        return fixture;
      },
      expectedCrossAccountError: "REDIRECT:/ops/admin/users",
    },
    {
      entrypoint: "resendContractorInviteFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/admin-user-actions");
        return mod.resendContractorInviteFromForm(buildAdminContractorFormData());
      },
      setupAllow: () => {
        const fixture = buildAdminFixture({
          contractorOwnersById: {
            "contractor-1": "owner-1",
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        createClientMock.mockResolvedValue({ from: fixture.admin.from.bind(fixture.admin) });
        inviteContractorMock.mockRejectedValueOnce(new Error(ALLOW_PATH_REACHED));
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          contractorOwnersById: {
            "contractor-1": "owner-2",
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        createClientMock.mockResolvedValue({ from: fixture.admin.from.bind(fixture.admin) });
        return fixture;
      },
      expectedCrossAccountError: "REDIRECT:/ops/admin/users",
    },
    {
      entrypoint: "inviteContractorUserFromForm",
      invoke: async () => {
        const mod = await import("@/lib/actions/admin-user-actions");
        return mod.inviteContractorUserFromForm(buildAdminContractorFormData());
      },
      setupAllow: () => {
        const fixture = buildAdminFixture({
          contractorOwnersById: {
            "contractor-1": "owner-1",
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        createClientMock.mockResolvedValue({ from: fixture.admin.from.bind(fixture.admin) });
        inviteContractorMock.mockRejectedValueOnce(new Error(ALLOW_PATH_REACHED));
        return fixture;
      },
      setupCrossAccount: () => {
        const fixture = buildAdminFixture({
          contractorOwnersById: {
            "contractor-1": "owner-2",
          },
        });
        createAdminClientMock.mockReturnValue(fixture.admin);
        createClientMock.mockResolvedValue({ from: fixture.admin.from.bind(fixture.admin) });
        return fixture;
      },
      expectedCrossAccountError: "REDIRECT:/ops/admin/users",
    },
  ];

  for (const testCase of cases) {
    it(`allows same-account internal ${testCase.entrypoint} past scoped preflight`, async () => {
      testCase.setupAllow();

      await expect(testCase.invoke()).rejects.toThrow(ALLOW_PATH_REACHED);
    });

    it(`denies cross-account internal ${testCase.entrypoint} before internal_users writes/identity side effects`, async () => {
      const fixture = testCase.setupCrossAccount();

      await expect(testCase.invoke()).rejects.toThrow(testCase.expectedCrossAccountError);

      expect(fixture.internalUsersWrites).toHaveLength(0);
      expect(inviteContractorMock).not.toHaveBeenCalled();
      expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
    });

    it(`denies non-internal ${testCase.entrypoint} before internal_users writes/identity side effects`, async () => {
      const fixture = testCase.setupAllow();
      requireInternalRoleMock.mockRejectedValueOnce(new Error("Active internal user required."));

      await expect(testCase.invoke()).rejects.toThrow("Active internal user required.");

      expect(fixture.internalUsersWrites).toHaveLength(0);
      expect(inviteContractorMock).not.toHaveBeenCalled();
      expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
    });
  }
});
