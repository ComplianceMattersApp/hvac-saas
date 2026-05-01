import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const resolveCanonicalOwnerMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedActiveInternalContractorForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const createContractorIntakeProposalAwarenessNotificationMock = vi.fn();
const insertInternalNotificationForEventMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/canonical-owner", () => ({
  resolveCanonicalOwner: (...args: unknown[]) => resolveCanonicalOwnerMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/auth/internal-contractor-scope", () => ({
  loadScopedActiveInternalContractorForMutation: (...args: unknown[]) =>
    loadScopedActiveInternalContractorForMutationMock(...args),
  loadScopedInternalContractorForMutation: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  createContractorIntakeProposalAwarenessNotification: (...args: unknown[]) =>
    createContractorIntakeProposalAwarenessNotificationMock(...args),
  insertInternalNotificationForEvent: (...args: unknown[]) =>
    insertInternalNotificationForEventMock(...args),
}));

type FixtureOptions = {
  userId: string | null;
  contractorMembershipId: string | null;
  proposalInsertError?: Error | null;
};

function buildContractorProposalFormData(overrides?: {
  city?: string;
  zip?: string;
  state?: string;
  address?: string;
}) {
  const formData = new FormData();
  formData.set("job_type", "ecc");
  formData.set("project_type", "alteration");
  formData.set("customer_first_name", "Sam");
  formData.set("customer_last_name", "Day");
  formData.set("customer_phone", "5551112222");
  formData.set("customer_email", "info@samedayhvacservices.com");
  formData.set("address_line1", overrides?.address ?? "4137 AMBERWOOD CIR");
  formData.set("city", overrides?.city ?? "PLEASANTON");
  formData.set("state", overrides?.state ?? "CA");
  formData.set("zip", overrides?.zip ?? "94588");
  return formData;
}

function buildFixture(options: FixtureOptions) {
  const proposalInsertPayloads: Array<Record<string, unknown>> = [];
  const proposalDeleteCalls: Array<{ table: string }> = [];

  const baseClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: options.userId
            ? {
                id: options.userId,
                email: "contractor@example.com",
              }
            : null,
        },
        error: null,
      })),
    },
    from(table: string) {
      if (table === "contractor_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: options.contractorMembershipId
                  ? { contractor_id: options.contractorMembershipId }
                  : null,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "locations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    },
  };

  const adminClient = {
    from(table: string) {
      if (table === "contractor_intake_submissions") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            proposalInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: options.proposalInsertError ? null : { id: "proposal-1" },
                  error: options.proposalInsertError ?? null,
                })),
              })),
            };
          }),
          delete: vi.fn(() => {
            proposalDeleteCalls.push({ table });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: null, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "attachments") {
        return {
          insert: vi.fn(async () => ({ data: null, error: null })),
          delete: vi.fn(() => {
            proposalDeleteCalls.push({ table });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            };
          }),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ data: null, error: null })),
        remove: vi.fn(async () => ({ data: null, error: null })),
      })),
    },
  };

  return {
    baseClient,
    adminClient,
    proposalInsertPayloads,
    proposalDeleteCalls,
  };
}

describe("contractor intake submit hotfix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    resolveCanonicalOwnerMock.mockImplementation(async ({ defaultWriteClient }: any) => ({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: defaultWriteClient,
    }));

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-1",
      internalUser: {
        user_id: "internal-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    loadScopedActiveInternalContractorForMutationMock.mockResolvedValue({ id: "ctr-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });

    createContractorIntakeProposalAwarenessNotificationMock.mockResolvedValue("notice-1");
    insertInternalNotificationForEventMock.mockResolvedValue(undefined);
  });

  it("creates a contractor intake submission on valid contractor proposal", async () => {
    const fixture = buildFixture({
      userId: "contractor-user-1",
      contractorMembershipId: "ctr-1",
    });

    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildContractorProposalFormData())).rejects.toThrow(
      "REDIRECT:/jobs/new?err=contractor_proposal_submitted",
    );

    expect(fixture.proposalInsertPayloads).toHaveLength(1);
    expect(fixture.proposalInsertPayloads[0]).toEqual(
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        contractor_id: "ctr-1",
        submitted_by_user_id: "contractor-user-1",
        proposed_address_line1: "4137 AMBERWOOD CIR",
        proposed_city: "PLEASANTON",
      }),
    );
  });

  it("returns clean contractor validation error when required location fields are missing", async () => {
    const fixture = buildFixture({
      userId: "contractor-user-1",
      contractorMembershipId: "ctr-1",
    });

    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(
        buildContractorProposalFormData({
          city: "",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/new?err=contractor_proposal_invalid_input");

    expect(fixture.proposalInsertPayloads).toHaveLength(0);
  });

  it("returns clean contractor submit failure when canonical owner resolution fails before insert", async () => {
    const fixture = buildFixture({
      userId: "contractor-user-1",
      contractorMembershipId: "ctr-1",
    });

    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);
    resolveCanonicalOwnerMock.mockRejectedValueOnce(
      new Error("Contractor is not mapped to an internal owner_user_id"),
    );

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildContractorProposalFormData())).rejects.toThrow(
      "REDIRECT:/jobs/new?err=contractor_proposal_submit_failed",
    );

    expect(fixture.proposalInsertPayloads).toHaveLength(0);
  });

  it("keeps successful proposal submission when awareness side effect fails", async () => {
    const fixture = buildFixture({
      userId: "contractor-user-1",
      contractorMembershipId: "ctr-1",
    });

    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);
    createContractorIntakeProposalAwarenessNotificationMock.mockRejectedValueOnce(
      new Error("awareness rpc failed"),
    );

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildContractorProposalFormData())).rejects.toThrow(
      "REDIRECT:/jobs/new?err=contractor_proposal_submitted",
    );

    expect(fixture.proposalInsertPayloads).toHaveLength(1);
    expect(
      fixture.proposalDeleteCalls.find((entry) => entry.table === "contractor_intake_submissions"),
    ).toBeUndefined();
  });

  it("denies unauthorized user before writes", async () => {
    const fixture = buildFixture({
      userId: null,
      contractorMembershipId: null,
    });

    createClientMock.mockResolvedValue(fixture.baseClient);
    createAdminClientMock.mockReturnValue(fixture.adminClient);
    requireInternalUserMock.mockRejectedValueOnce(new Error("Active internal user required."));

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildContractorProposalFormData())).rejects.toThrow(
      "REDIRECT:/forbidden",
    );

    expect(fixture.proposalInsertPayloads).toHaveLength(0);
  });
});
