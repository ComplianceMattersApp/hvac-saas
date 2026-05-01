import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const loadScopedInternalContractorForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const inviteContractorMock = vi.fn();
const revalidatePathMock = vi.fn();

const ALLOW_PATH_REACHED = "ALLOW_PATH_REACHED";

type TargetAction =
  | "createContractorFromForm"
  | "updateContractorFromForm"
  | "updateContractorNameAndEmailFromForm"
  | "createQuickContractorFromForm"
  | "archiveContractorFromForm"
  | "unarchiveContractorFromForm";

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/auth/internal-contractor-scope", () => ({
  loadScopedInternalContractorForMutation: (...args: unknown[]) =>
    loadScopedInternalContractorForMutationMock(...args),
}));

vi.mock("@/lib/actions/contractor-invite-actions", () => ({
  inviteContractor: (...args: unknown[]) => inviteContractorMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

const targets: Array<{ name: TargetAction; buildFormData: () => FormData }> = [
  {
    name: "createContractorFromForm",
    buildFormData: () =>
      makeFormData({
        name: "Contractor Create",
        email: "create@example.com",
      }),
  },
  {
    name: "updateContractorFromForm",
    buildFormData: () =>
      makeFormData({
        contractor_id: "contractor-1",
        name: "Contractor Update",
      }),
  },
  {
    name: "updateContractorNameAndEmailFromForm",
    buildFormData: () =>
      makeFormData({
        contractor_id: "contractor-1",
        name: "Contractor Edge Update",
        email: "edge@example.com",
      }),
  },
  {
    name: "createQuickContractorFromForm",
    buildFormData: () =>
      makeFormData({
        name: "Quick Contractor",
        email: "quick@example.com",
      }),
  },
  {
    name: "archiveContractorFromForm",
    buildFormData: () =>
      makeFormData({
        contractor_id: "contractor-1",
        archived_reason: "retired",
      }),
  },
  {
    name: "unarchiveContractorFromForm",
    buildFormData: () =>
      makeFormData({
        contractor_id: "contractor-1",
      }),
  },
];

function expectedAllowError(actionName: TargetAction) {
  if (actionName === "createContractorFromForm") {
    return "REDIRECT:/contractors/contractor-1/edit?notice=contractor_created_invite_failed";
  }

  if (actionName === "createQuickContractorFromForm") {
    return "REDIRECT:/ops/admin/contractors?notice=contractor_created_invite_failed";
  }

  return ALLOW_PATH_REACHED;
}

function makeAllowFixture(actionName: TargetAction) {
  const contractorInsertPayloads: Array<Record<string, unknown>> = [];
  const contractorUpdatePayloads: Array<Record<string, unknown>> = [];
  const contractorInviteUpdatePayloads: Array<Record<string, unknown>> = [];

  const contractorsTable = {
    insert: vi.fn((payload: Record<string, unknown>) => {
      contractorInsertPayloads.push(payload);
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "contractor-1" },
            error: null,
          })),
        })),
      };
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      contractorUpdatePayloads.push(payload);
      return {
        eq: vi.fn(() => {
          if (actionName === "archiveContractorFromForm" || actionName === "unarchiveContractorFromForm") {
            return {
              eq: vi.fn(async () => {
                throw new Error(ALLOW_PATH_REACHED);
              }),
            };
          }

          throw new Error(ALLOW_PATH_REACHED);
        }),
      };
    }),
  };

  const contractorInvitesTable = {
    update: vi.fn((payload: Record<string, unknown>) => {
      contractorInviteUpdatePayloads.push(payload);
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => {
              throw new Error(ALLOW_PATH_REACHED);
            }),
          })),
        })),
      };
    }),
  };

  const supabase = {
    from(table: string) {
      if (table === "contractors") {
        return contractorsTable;
      }

      if (table === "contractor_invites") {
        return contractorInvitesTable;
      }

      throw new Error(`UNEXPECTED_TABLE:${table}`);
    },
  };

  return {
    supabase,
    contractorInsertPayloads,
    contractorUpdatePayloads,
    contractorInviteUpdatePayloads,
  };
}

function makeBlockedFixture() {
  const contractorInsertPayloads: Array<Record<string, unknown>> = [];
  const contractorUpdatePayloads: Array<Record<string, unknown>> = [];
  const contractorInviteUpdatePayloads: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "contractors") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            contractorInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "contractor-1" }, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            contractorUpdatePayloads.push(payload);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            };
          }),
        };
      }

      if (table === "contractor_invites") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            contractorInviteUpdatePayloads.push(payload);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              })),
            };
          }),
        };
      }

      throw new Error(`UNEXPECTED_TABLE:${table}`);
    },
  };

  return {
    supabase,
    contractorInsertPayloads,
    contractorUpdatePayloads,
    contractorInviteUpdatePayloads,
  };
}

async function invokeAction(actionName: TargetAction, formData: FormData) {
  const mod = await import("@/lib/actions/contractor-actions");

  return (mod as Record<TargetAction, (fd: FormData) => Promise<unknown>>)[actionName](formData);
}

describe("contractor directory entitlement hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "admin-user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    loadScopedInternalContractorForMutationMock.mockResolvedValue({
      id: "contractor-1",
      owner_user_id: "owner-1",
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });

    inviteContractorMock.mockRejectedValue(new Error(ALLOW_PATH_REACHED));
  });

  for (const { name, buildFormData } of targets) {
    it(`${name}: allows active entitlement`, async () => {
      const fixture = makeAllowFixture(name);
      createClientMock.mockResolvedValue(fixture.supabase);

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(expectedAllowError(name));

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(
        fixture.contractorInsertPayloads.length +
          fixture.contractorUpdatePayloads.length +
          fixture.contractorInviteUpdatePayloads.length,
      ).toBeGreaterThan(0);
    });

    it(`${name}: allows valid trial entitlement`, async () => {
      const fixture = makeAllowFixture(name);
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(expectedAllowError(name));
    });

    it(`${name}: allows internal comped entitlement`, async () => {
      const fixture = makeAllowFixture(name);
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(expectedAllowError(name));
    });
  }

  const blockedReasons = [
    "blocked_trial_expired",
    "blocked_trial_missing_end",
    "blocked_missing_entitlement",
  ] as const;

  for (const reason of blockedReasons) {
    for (const { name, buildFormData } of targets) {
      it(`${name}: blocks ${reason} before writes and side effects`, async () => {
        const fixture = makeBlockedFixture();
        createClientMock.mockResolvedValue(fixture.supabase);
        resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
          authorized: false,
          reason,
        });

        await expect(invokeAction(name, buildFormData())).rejects.toThrow(
          `REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=${reason}`,
        );

        expect(fixture.contractorInsertPayloads).toHaveLength(0);
        expect(fixture.contractorUpdatePayloads).toHaveLength(0);
        expect(fixture.contractorInviteUpdatePayloads).toHaveLength(0);
        expect(inviteContractorMock).not.toHaveBeenCalled();
        expect(revalidatePathMock).not.toHaveBeenCalled();
      });
    }
  }
});