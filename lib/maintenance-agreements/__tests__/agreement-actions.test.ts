import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveEntitlementMock = vi.fn();
const isMaintenanceAgreementsEnabledMock = vi.fn();
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) => resolveEntitlementMock(...args),
}));

vi.mock("@/lib/maintenance-agreements/agreement-exposure", () => ({
  isMaintenanceAgreementsEnabled: (...args: unknown[]) => isMaintenanceAgreementsEnabledMock(...args),
}));

function makeSupabaseClient() {
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "maintenance_agreements") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert: vi.fn((payload: unknown) => {
          insertCalls.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "agr-1" }, error: null })),
            })),
          };
        }),
        update: vi.fn((payload: unknown) => {
          updateCalls.push(payload);
          const eq = vi.fn(() => ({ eq }));
          const select = vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: "agr-1" }, error: null })),
          }));
          const thirdEq = vi.fn(() => ({ select }));
          const secondEq = vi.fn(() => ({ eq: thirdEq }));
          const firstEq = vi.fn(() => ({ eq: secondEq }));
          return { eq: firstEq };
        }),
      };
    }),
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
  };

  return client;
}

function makeAdminClient(params?: {
  customerFound?: boolean;
  locationFound?: boolean;
  templateFound?: boolean;
}) {
  const customerFound = params?.customerFound ?? true;
  const locationFound = params?.locationFound ?? true;
  const templateFound = params?.templateFound ?? true;

  return {
    from: vi.fn((table: string) => {
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: customerFound ? { id: "cust-1" } : null, error: null })),
              })),
            })),
          })),
        };
      }

      if (table === "locations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: locationFound ? { id: "loc-1" } : null, error: null })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "maintenance_agreement_templates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: templateFound
                    ? {
                        id: "tpl-1",
                        template_name: "Seasonal Plan Template",
                        lifecycle_status: "active",
                        agreement_type: "service_plan",
                        frequency: "annual",
                        default_visit_scope_summary: "Seasonal maintenance walkthrough",
                        default_visit_scope_items: [{ title: "Inspect filters" }],
                        internal_notes_default: "Template default note",
                      }
                    : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
  };
}

function makeLinkAdminClient(params?: {
  internalUserFound?: boolean;
  internalUserActive?: boolean;
  agreementFound?: boolean;
  jobFound?: boolean;
  customerFound?: boolean;
  duplicateErrorCode?: string | null;
}) {
  const internalUserFound = params?.internalUserFound ?? true;
  const internalUserActive = params?.internalUserActive ?? true;
  const agreementFound = params?.agreementFound ?? true;
  const jobFound = params?.jobFound ?? true;
  const customerFound = params?.customerFound ?? true;
  const duplicateErrorCode = params?.duplicateErrorCode ?? null;
  const insertCalls: unknown[] = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: internalUserFound
                  ? {
                      account_owner_user_id: "owner-1",
                      is_active: internalUserActive,
                    }
                  : null,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "maintenance_agreements") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: agreementFound
                    ? {
                        id: "agr-1",
                        customer_id: "cust-1",
                        account_owner_user_id: "owner-1",
                      }
                    : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: jobFound
                  ? {
                      id: "job-1",
                      customer_id: "cust-1",
                    }
                  : null,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: customerFound ? { id: "cust-1" } : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "maintenance_agreement_visits") {
        return {
          insert: vi.fn((payload: unknown) => {
            insertCalls.push(payload);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: duplicateErrorCode ? null : { id: "link-1" },
                  error: duplicateErrorCode
                    ? {
                        code: duplicateErrorCode,
                        message: "duplicate key value violates unique constraint",
                      }
                    : null,
                })),
              })),
            };
          }),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
    _insertCalls: insertCalls,
  };
}

function makeMarkVisitCountedAdminClient(params?: {
  linkExists?: boolean;
  linkId?: string;
  linkAccountOwnerUserId?: string;
  linkAgreementId?: string;
  linkJobId?: string;
  linkCountStatus?: string;
  linkCountsTowardVisitBalance?: boolean;
  agreementExists?: boolean;
  agreementStatus?: string;
  agreementCustomerId?: string;
  jobExists?: boolean;
  jobType?: string;
  jobStatus?: string;
  jobOpsStatus?: string;
  jobFieldComplete?: boolean;
  jobServiceVisitType?: string;
  jobServiceVisitOutcome?: string | null;
  jobCustomerId?: string;
  updateSucceeds?: boolean;
  updateError?: string | null;
}) {
  const linkId = params?.linkId ?? "link-1";
  const linkAccountOwnerUserId = params?.linkAccountOwnerUserId ?? "owner-1";
  const linkAgreementId = params?.linkAgreementId ?? "agr-1";
  const linkJobId = params?.linkJobId ?? "job-1";
  const updateSucceeds = params?.updateSucceeds ?? true;
  const updateError = params?.updateError ?? null;

  let storedLink =
    params?.linkExists === false
      ? null
      : {
          id: linkId,
          account_owner_user_id: linkAccountOwnerUserId,
          agreement_id: linkAgreementId,
          job_id: linkJobId,
          count_status: params?.linkCountStatus ?? "linked",
          counts_toward_visit_balance: params?.linkCountsTowardVisitBalance ?? false,
        };

  const updateCalls: unknown[] = [];

  const visitSelectBuilder: any = {
    eq: vi.fn(() => visitSelectBuilder),
    maybeSingle: vi.fn(async () => ({
      data: storedLink ? { ...storedLink } : null,
      error: null,
    })),
  };

  const visitUpdateBuilder: any = {
    eq: vi.fn(() => visitUpdateBuilder),
    in: vi.fn(() => visitUpdateBuilder),
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => {
        if (updateError) {
          return { data: null, error: { message: updateError } };
        }

        const currentStatus = String(storedLink?.count_status ?? "").toLowerCase();
        const currentCountsToward = Boolean(storedLink?.counts_toward_visit_balance);
        const canUpdate =
          Boolean(storedLink?.id) &&
          (currentStatus === "linked" || currentStatus === "eligible") &&
          !currentCountsToward &&
          updateSucceeds;

        if (!canUpdate) {
          return { data: null, error: null };
        }

        storedLink = {
          ...(storedLink as Record<string, unknown>),
          count_status: "counted",
          counts_toward_visit_balance: true,
        } as typeof storedLink;

        return {
          data: { id: linkId },
          error: null,
        };
      }),
    })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "maintenance_agreement_visits") {
        return {
          select: vi.fn(() => visitSelectBuilder),
          update: vi.fn((payload: unknown) => {
            updateCalls.push(payload);
            return visitUpdateBuilder;
          }),
        };
      }

      if (table === "jobs") {
        const builder: any = {
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data:
              params?.jobExists === false
                ? null
                : {
                    id: "job-1",
                    customer_id: params?.jobCustomerId ?? "cust-1",
                    job_type: params?.jobType ?? "service",
                    status: params?.jobStatus ?? "completed",
                    ops_status: params?.jobOpsStatus ?? "invoice_required",
                    field_complete: params?.jobFieldComplete ?? true,
                    service_visit_type: params?.jobServiceVisitType ?? "maintenance",
                    service_visit_outcome: params?.jobServiceVisitOutcome ?? null,
                  },
            error: null,
          })),
        };

        return {
          select: vi.fn(() => builder),
        };
      }

      if (table === "maintenance_agreements") {
        const builder: any = {
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data:
              params?.agreementExists === false
                ? null
                : {
                    id: linkAgreementId,
                    account_owner_user_id: linkAccountOwnerUserId,
                    customer_id: params?.agreementCustomerId ?? "cust-1",
                    status: params?.agreementStatus ?? "active",
                  },
            error: null,
          })),
        };

        return {
          select: vi.fn(() => builder),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
    _updateCalls: updateCalls,
  };
}

async function expectRedirectError(work: () => Promise<unknown>) {
  await expect(work()).rejects.toThrow(/REDIRECT:/);
  const calls = redirectMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return String(calls[calls.length - 1]?.[0] ?? "");
}

const { createMaintenanceAgreement, updateMaintenanceAgreement } = await import(
  "@/lib/maintenance-agreements/agreement-actions"
);

describe("maintenance agreement actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
      },
    });
    resolveEntitlementMock.mockResolvedValue({ authorized: true, reason: "ok" });
  });

  it("fails closed when feature flag is disabled before any client is created", async () => {
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Spring Tune-up",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
    });

    expect(result).toEqual({
      success: false,
      error: "Maintenance Agreements are currently unavailable.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid enum and date values safely", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "",
      agreementType: "invalid",
      frequency: "quarterly",
      nextDueDate: "2026/06/01",
      startDate: "2026-05-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Agreement name is required.");
    }
  });

  it("rejects out-of-scope primary location", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient({ locationFound: false }));

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan A",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      primaryLocationId: "loc-out-of-scope",
    });

    expect(result).toEqual({
      success: false,
      error: "Primary location must belong to this customer and account.",
    });
  });

  it("creates using server-scoped owner and user ids", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan B",
      agreementType: "service_plan",
      frequency: "annual",
      nextDueDate: "2026-10-01",
      startDate: "2026-05-01",
      renewalDate: "",
      defaultVisitScopeSummary: "Summary",
      defaultVisitScopeItemsJson: JSON.stringify([
        {
          title: " Inspect condenser coil ",
          details: " Clean as needed ",
          kind: "primary",
        },
      ]),
      internalNotes: "Internal",
    });

    expect(result).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      customer_id: "cust-1",
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      agreement_type: "service_plan",
      frequency: "annual",
      renewal_date: null,
      default_visit_scope_items: [
        {
          title: "Inspect condenser coil",
          details: "Clean as needed",
          kind: "primary",
        },
      ],
    });
    expect(supabase._insertCalls[0]).not.toHaveProperty("source_template_id");
    expect(supabase._insertCalls[0]).not.toHaveProperty("source_template_name_snapshot");
    expect(supabase._insertCalls[0]).not.toHaveProperty("source_template_lifecycle_status_snapshot");
    expect(supabase._insertCalls[0]).not.toHaveProperty("source_template_applied_at");
    expect(supabase._insertCalls[0]).not.toHaveProperty("source_template_snapshot");
  });

  it("captures provenance snapshot when creating from a selected template", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient({ templateFound: true }));

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan From Template",
      agreementType: "service_plan",
      frequency: "annual",
      nextDueDate: "2026-10-01",
      startDate: "2026-05-01",
      sourceTemplateId: "tpl-1",
    });

    expect(result).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toMatchObject({
      source_template_id: "tpl-1",
      source_template_name_snapshot: "Seasonal Plan Template",
      source_template_lifecycle_status_snapshot: "active",
      source_template_snapshot: {
        agreement_type: "service_plan",
        frequency: "annual",
        default_visit_scope_summary: "Seasonal maintenance walkthrough",
        default_visit_scope_items: [{ title: "Inspect filters" }],
        internal_notes_default: "Template default note",
      },
    });
    expect(typeof (supabase._insertCalls[0] as any).source_template_applied_at).toBe("string");
  });

  it("fails safely when selected template is unavailable", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient({ templateFound: false }));

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan From Missing Template",
      agreementType: "service_plan",
      frequency: "annual",
      nextDueDate: "2026-10-01",
      startDate: "2026-05-01",
      sourceTemplateId: "tpl-missing",
    });

    expect(result).toEqual({
      success: false,
      error: "Selected template is unavailable for this account.",
    });
    expect(supabase._insertCalls).toHaveLength(0);
  });

  it("rejects invalid default work items safely", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan Invalid Items",
      agreementType: "service_plan",
      frequency: "annual",
      nextDueDate: "2026-10-01",
      startDate: "2026-05-01",
      defaultVisitScopeItemsJson: "{not-json}",
    });

    expect(result).toEqual({
      success: false,
      error: "Default Work Items must be valid visit scope items.",
    });
    expect(supabase._insertCalls).toHaveLength(0);
  });

  it("updates allowed fields and rejects invalid status", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());

    const invalid = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Plan C",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      status: "deleted",
    });

    expect(invalid).toEqual({ success: false, error: "Status is invalid." });

    const ok = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Plan C",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      defaultVisitScopeItemsJson: JSON.stringify([
        {
          title: " Replace filter ",
          details: " 16x25x1 ",
          kind: "primary",
        },
      ]),
      status: "active",
    });

    expect(ok).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._updateCalls).toHaveLength(1);
    expect(supabase._updateCalls[0]).toMatchObject({
      agreement_name: "Plan C",
      status: "active",
      updated_by_user_id: "user-1",
      default_visit_scope_items: [
        {
          title: "Replace filter",
          details: "16x25x1",
          kind: "primary",
        },
      ],
    });
    expect(supabase._updateCalls[0]).not.toHaveProperty("customer_id");
    expect(supabase._updateCalls[0]).not.toHaveProperty("account_owner_user_id");
    expect(supabase._updateCalls[0]).not.toHaveProperty("source_template_id");
    expect(supabase._updateCalls[0]).not.toHaveProperty("source_template_name_snapshot");
    expect(supabase._updateCalls[0]).not.toHaveProperty("source_template_lifecycle_status_snapshot");
    expect(supabase._updateCalls[0]).not.toHaveProperty("source_template_applied_at");
    expect(supabase._updateCalls[0]).not.toHaveProperty("source_template_snapshot");
  });
});

describe("createMaintenanceAgreementVisitLinkFromJobCreation", () => {
  // The link creation function is tested implicitly through job creation tests.
  // This is a no-throw, non-blocking helper called during job creation.
  // Direct unit testing is minimal since it fails silently on invalid scopes.

  it("does not throw when feature flag is disabled", async () => {
    const { createMaintenanceAgreementVisitLinkFromJobCreation } = await import("@/lib/maintenance-agreements/agreement-actions");

    // Feature flag disabled => function returns false without error
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);

    const result = await createMaintenanceAgreementVisitLinkFromJobCreation({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
    });

    expect(result).toBe(false);
  });

  it("does not throw when parameters are invalid", async () => {
    const { createMaintenanceAgreementVisitLinkFromJobCreation } = await import("@/lib/maintenance-agreements/agreement-actions");

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);

    // Empty agreement ID => function returns false
    const result = await createMaintenanceAgreementVisitLinkFromJobCreation({
      agreementId: "",
      jobId: "job-1",
      createdByUserId: "user-1",
    });

    expect(result).toBe(false);
  });

  it("creates a link row when admin-scoped validation passes", async () => {
    const { createMaintenanceAgreementVisitLinkFromJobCreation } = await import("@/lib/maintenance-agreements/agreement-actions");

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    const admin = makeLinkAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const result = await createMaintenanceAgreementVisitLinkFromJobCreation({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
    });

    expect(result).toBe(true);
    expect(admin._insertCalls).toHaveLength(1);
    expect(admin._insertCalls[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      agreement_id: "agr-1",
      job_id: "job-1",
      link_source: "service_plan_prefill",
      count_status: "linked",
      counts_toward_visit_balance: false,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
    });
  });

  it("uses the provided owner scope without requiring an internal user lookup", async () => {
    const { createMaintenanceAgreementVisitLinkFromJobCreation } = await import("@/lib/maintenance-agreements/agreement-actions");

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    const admin = makeLinkAdminClient({ internalUserFound: false });
    createAdminClientMock.mockReturnValue(admin);

    const result = await createMaintenanceAgreementVisitLinkFromJobCreation({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "user-1",
      accountOwnerUserId: "owner-1",
    });

    expect(result).toBe(true);
    expect(admin.from).not.toHaveBeenCalledWith("internal_users");
    expect(admin._insertCalls).toHaveLength(1);
    expect(admin._insertCalls[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      agreement_id: "agr-1",
      job_id: "job-1",
    });
  });
});

describe("markMaintenanceAgreementVisitCountedFromForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    resolveEntitlementMock.mockResolvedValue({ authorized: true, reason: "ok" });
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
      },
    });
    createClientMock.mockResolvedValue({});
  });

  it("marks an eligible maintenance visit link counted and revalidates detail + service plans", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    const admin = makeMarkVisitCountedAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_saved");
    expect(admin._updateCalls).toHaveLength(1);
    expect(admin._updateCalls[0]).toMatchObject({
      count_status: "counted",
      counts_toward_visit_balance: true,
      counted_by_user_id: "user-1",
      updated_by_user_id: "user-1",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/service-plans");
  });

  it("fails closed when feature flag is disabled", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_unavailable");
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns missing-link banner when no link row exists", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    createAdminClientMock.mockReturnValue(makeMarkVisitCountedAdminClient({ linkExists: false }));

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_missing_link");
  });

  it("returns already-counted when link is already counted", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    createAdminClientMock.mockReturnValue(
      makeMarkVisitCountedAdminClient({
        linkCountStatus: "counted",
        linkCountsTowardVisitBalance: true,
      }),
    );

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_already_counted");
  });

  it("returns excluded-or-reversed when link status is excluded", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    createAdminClientMock.mockReturnValue(
      makeMarkVisitCountedAdminClient({
        linkCountStatus: "excluded",
      }),
    );

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_excluded_or_reversed");
  });

  it("returns out-of-scope when account ownership does not match", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    createAdminClientMock.mockReturnValue(
      makeMarkVisitCountedAdminClient({
        linkAccountOwnerUserId: "owner-2",
      }),
    );

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_out_of_scope");
  });

  it("returns not-eligible when job is not maintenance", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    createAdminClientMock.mockReturnValue(
      makeMarkVisitCountedAdminClient({
        jobServiceVisitType: "repair",
      }),
    );

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_not_eligible");
  });

  it("returns not-eligible when job is not completed or field-complete", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    createAdminClientMock.mockReturnValue(
      makeMarkVisitCountedAdminClient({
        jobStatus: "in_process",
        jobFieldComplete: false,
      }),
    );

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_not_eligible");
  });
});
