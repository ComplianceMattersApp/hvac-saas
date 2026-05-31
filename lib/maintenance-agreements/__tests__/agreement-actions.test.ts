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
  templateOverrides?: Record<string, unknown>;
  agreementFound?: boolean;
  agreementOverrides?: Record<string, unknown>;
}) {
  const customerFound = params?.customerFound ?? true;
  const locationFound = params?.locationFound ?? true;
  const templateFound = params?.templateFound ?? true;
  const templateOverrides = params?.templateOverrides ?? {};
  const agreementFound = params?.agreementFound ?? true;
  const agreementOverrides = params?.agreementOverrides ?? {};

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

      if (table === "maintenance_agreements") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: agreementFound
                      ? {
                          id: "agr-1",
                          customer_id: "cust-1",
                          account_owner_user_id: "owner-1",
                          agreement_name: "Current Service Plan",
                          agreement_type: "maintenance",
                          frequency: "quarterly",
                          default_visit_scope_summary: "Current scope summary",
                          default_visit_scope_items: [{ title: "Current item" }],
                          template_locked_field_keys: null,
                          template_lock_policy_version: null,
                          template_lock_snapshot_applied_at: null,
                          ...agreementOverrides,
                        }
                      : null,
                    error: null,
                  })),
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
                        locked_field_keys: ["agreement_name", "agreement_type", "frequency", "default_visit_scope_summary", "default_visit_scope_items"],
                        lock_policy_version: 2,
                        ...templateOverrides,
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

type AutoCountVisitLinkFixture = {
  id: string;
  account_owner_user_id: string;
  agreement_id: string;
  job_id: string;
  count_status: string;
  counts_toward_visit_balance: boolean;
  reversed_at: string | null;
  counted_at: string | null;
  counted_by_user_id: string | null;
  updated_by_user_id: string | null;
};

function makeAutoCountAdminClient(params?: {
  job?: Record<string, unknown>;
  links?: AutoCountVisitLinkFixture[];
  agreementStatusById?: Record<string, string>;
  agreementCustomerIdById?: Record<string, string>;
}) {
  const job = {
    id: "job-1",
    customer_id: "cust-1",
    job_type: "service",
    status: "completed",
    ops_status: "invoice_required",
    field_complete: true,
    service_visit_type: "maintenance",
    service_visit_outcome: null,
    ...(params?.job ?? {}),
  };

  const visitLinks: AutoCountVisitLinkFixture[] =
    params?.links ??
    [
      {
        id: "link-1",
        account_owner_user_id: "owner-1",
        agreement_id: "agr-1",
        job_id: "job-1",
        count_status: "linked",
        counts_toward_visit_balance: false,
        reversed_at: null,
        counted_at: null,
        counted_by_user_id: null,
        updated_by_user_id: null,
      },
    ];

  const agreementStatusById: Record<string, string> = {
    "agr-1": "active",
    ...(params?.agreementStatusById ?? {}),
  };
  const agreementCustomerIdById: Record<string, string> = {
    "agr-1": "cust-1",
    ...(params?.agreementCustomerIdById ?? {}),
  };

  const updateCalls: unknown[] = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "jobs") {
        const builder: any = {
          eq: vi.fn((_column: string, value: unknown) => {
            builder._jobId = String(value ?? "");
            return builder;
          }),
          maybeSingle: vi.fn(async () => ({
            data: builder._jobId === String(job.id ?? "") ? { ...job } : null,
            error: null,
          })),
        };

        return {
          select: vi.fn(() => builder),
        };
      }

      if (table === "maintenance_agreements") {
        const builder: any = {
          _agreementId: "",
          _ownerId: "",
          eq: vi.fn((column: string, value: unknown) => {
            if (column === "id") builder._agreementId = String(value ?? "");
            if (column === "account_owner_user_id") builder._ownerId = String(value ?? "");
            return builder;
          }),
          maybeSingle: vi.fn(async () => {
            const agreementId = String(builder._agreementId ?? "");
            if (!agreementId) return { data: null, error: null };

            return {
              data: {
                id: agreementId,
                account_owner_user_id: String(builder._ownerId ?? "owner-1"),
                customer_id: agreementCustomerIdById[agreementId] ?? "cust-1",
                status: agreementStatusById[agreementId] ?? "active",
              },
              error: null,
            };
          }),
        };

        return {
          select: vi.fn(() => builder),
        };
      }

      if (table === "maintenance_agreement_visits") {
        return {
          select: vi.fn(() => {
            const builder: any = {
              _jobId: "",
              _ownerId: "",
              _linkId: "",
              eq: vi.fn((column: string, value: unknown) => {
                if (column === "job_id") builder._jobId = String(value ?? "");
                if (column === "account_owner_user_id") builder._ownerId = String(value ?? "");
                if (column === "id") builder._linkId = String(value ?? "");
                return builder;
              }),
              maybeSingle: vi.fn(async () => {
                const link = visitLinks.find((row) => row.id === builder._linkId) ?? null;
                return { data: link ? { ...link } : null, error: null };
              }),
              then: (onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => {
                const filtered = visitLinks.filter((row) => {
                  const matchesJob = builder._jobId ? row.job_id === builder._jobId : true;
                  const matchesOwner = builder._ownerId
                    ? row.account_owner_user_id === builder._ownerId
                    : true;
                  return matchesJob && matchesOwner;
                });

                return Promise.resolve({ data: filtered.map((row) => ({ ...row })), error: null }).then(
                  onFulfilled,
                  onRejected,
                );
              },
            };

            return builder;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updateCalls.push(payload);

            const builder: any = {
              _linkId: "",
              _ownerId: "",
              _jobId: "",
              _agreementId: "",
              _allowedStatuses: [] as string[],
              _countsTowardVisitBalance: false,
              eq: vi.fn((column: string, value: unknown) => {
                if (column === "id") builder._linkId = String(value ?? "");
                if (column === "account_owner_user_id") builder._ownerId = String(value ?? "");
                if (column === "job_id") builder._jobId = String(value ?? "");
                if (column === "agreement_id") builder._agreementId = String(value ?? "");
                if (column === "counts_toward_visit_balance") {
                  builder._countsTowardVisitBalance = Boolean(value);
                }
                return builder;
              }),
              in: vi.fn((column: string, values: unknown[]) => {
                if (column === "count_status") {
                  builder._allowedStatuses = values.map((value) => String(value ?? "").toLowerCase());
                }
                return builder;
              }),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  const link = visitLinks.find((row) => row.id === builder._linkId) ?? null;
                  if (!link) return { data: null, error: null };

                  const status = String(link.count_status ?? "").toLowerCase();
                  const canUpdate =
                    link.account_owner_user_id === builder._ownerId &&
                    link.job_id === builder._jobId &&
                    link.agreement_id === builder._agreementId &&
                    builder._allowedStatuses.includes(status) &&
                    link.counts_toward_visit_balance === builder._countsTowardVisitBalance;

                  if (!canUpdate) {
                    return { data: null, error: null };
                  }

                  link.count_status = String(payload.count_status ?? link.count_status);
                  link.counts_toward_visit_balance = Boolean(
                    payload.counts_toward_visit_balance ?? link.counts_toward_visit_balance,
                  );
                  link.counted_at = String(payload.counted_at ?? "") || null;
                  link.counted_by_user_id = String(payload.counted_by_user_id ?? "") || null;
                  link.updated_by_user_id = String(payload.updated_by_user_id ?? "") || null;

                  return { data: { id: link.id }, error: null };
                }),
              })),
            };

            return builder;
          }),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    }),
    _visitLinks: visitLinks,
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
        role: "admin",
        is_active: true,
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
      expect(result.error).toBe("Next due date must be a valid date (YYYY-MM-DD).");
    }
  });

  it("denies service plan create for non-admin non-owner internal roles", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "office-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Plan A",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
    });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin internal role required for Service Plan management.",
    });
    expect(supabase._insertCalls).toHaveLength(0);
  });

  it("denies service plan update for non-admin non-owner internal roles", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient());
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "office-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const result = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Plan C",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      status: "active",
    });

    expect(result).toEqual({
      success: false,
      error: "Owner/admin internal role required for Service Plan management.",
    });
    expect(supabase._updateCalls).toHaveLength(0);
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
      agreement_name: "Plan B",
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
    expect(supabase._insertCalls[0]).not.toHaveProperty("template_locked_field_keys");
    expect(supabase._insertCalls[0]).not.toHaveProperty("template_lock_policy_version");
    expect(supabase._insertCalls[0]).not.toHaveProperty("template_lock_snapshot_applied_at");
  });

  it("forces template package fields and persists lock snapshot when creating from a selected template", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClient({ templateFound: true }));

    const result = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Typed Override Should Not Persist",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-10-01",
      startDate: "2026-05-01",
      sourceTemplateId: "tpl-1",
      defaultVisitScopeSummary: "Typed Summary Override",
      defaultVisitScopeItemsJson: JSON.stringify([{ title: "Typed Override Item" }]),
    });

    expect(result).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toMatchObject({
      agreement_name: "Seasonal Plan Template",
      agreement_type: "service_plan",
      frequency: "annual",
      default_visit_scope_summary: "Seasonal maintenance walkthrough",
      default_visit_scope_items: [{ title: "Inspect filters" }],
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
      template_locked_field_keys: ["agreement_name", "agreement_type", "frequency", "default_visit_scope_summary", "default_visit_scope_items"],
      template_lock_policy_version: 2,
    });
    expect(typeof (supabase._insertCalls[0] as any).source_template_applied_at).toBe("string");
    expect(typeof (supabase._insertCalls[0] as any).template_lock_snapshot_applied_at).toBe("string");
    expect(supabase._insertCalls[0]).not.toHaveProperty("generate_draft_invoice");
    expect(supabase._insertCalls[0]).not.toHaveProperty("autopay");
    expect(supabase._insertCalls[0]).not.toHaveProperty("visit_count");
    expect(supabase._insertCalls[0]).not.toHaveProperty("next_due_mutation");
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
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_locked_field_keys");
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_lock_policy_version");
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_lock_snapshot_applied_at");
  });

  it("blocks locked template package field updates without mutating the agreement", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClient({
        agreementOverrides: {
          agreement_name: "Locked Current Name",
          agreement_type: "maintenance",
          frequency: "quarterly",
          default_visit_scope_summary: "Locked current summary",
          default_visit_scope_items: [{ title: "Locked current item" }],
          template_locked_field_keys: [
            "agreement_name",
            "agreement_type",
            "frequency",
            "default_visit_scope_summary",
            "default_visit_scope_items",
          ],
          template_lock_policy_version: 1,
          template_lock_snapshot_applied_at: "2026-05-30T12:00:00.000Z",
          source_template_id: "tpl-1",
        },
      }),
    );

    const result = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Edited Locked Name",
      agreementType: "inspection",
      frequency: "monthly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      defaultVisitScopeSummary: "Edited locked summary",
      defaultVisitScopeItemsJson: JSON.stringify([{ title: "Edited locked item" }]),
      primaryLocationId: "loc-1",
      renewalDate: "2026-07-01",
      status: "active",
      internalNotes: "Updated notes",
    });

    expect(result).toEqual({
      success: false,
      error:
        "maintenance_agreement_locked_field_update_blocked: This Service Plan was created from a locked template package. Duplicate or edit the template to change package details.",
    });
    expect(supabase._updateCalls).toHaveLength(0);
  });

  it("allows editable fields to update on locked template-created agreements", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClient({
        agreementOverrides: {
          agreement_name: "Locked Current Name",
          agreement_type: "maintenance",
          frequency: "quarterly",
          default_visit_scope_summary: "Locked current summary",
          default_visit_scope_items: [{ title: "Locked current item" }],
          template_locked_field_keys: [
            "agreement_name",
            "agreement_type",
            "frequency",
            "default_visit_scope_summary",
            "default_visit_scope_items",
          ],
          template_lock_policy_version: 1,
          template_lock_snapshot_applied_at: "2026-05-30T12:00:00.000Z",
          source_template_id: "tpl-1",
        },
      }),
    );

    const result = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Locked Current Name",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      defaultVisitScopeSummary: "Locked current summary",
      defaultVisitScopeItemsJson: JSON.stringify([{ title: "Locked current item" }]),
      primaryLocationId: "loc-1",
      renewalDate: "2026-07-01",
      status: "paused",
      internalNotes: "Editable notes",
    });

    expect(result).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._updateCalls).toHaveLength(1);
    expect(supabase._updateCalls[0]).toMatchObject({
      primary_location_id: "loc-1",
      renewal_date: "2026-07-01",
      status: "paused",
      internal_notes: "Editable notes",
    });
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_locked_field_keys");
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_lock_policy_version");
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_lock_snapshot_applied_at");
  });

  it("keeps source-template agreements without a lock snapshot backward-compatible", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClient({
        agreementOverrides: {
          source_template_id: "tpl-1",
          template_locked_field_keys: null,
          template_lock_policy_version: null,
          template_lock_snapshot_applied_at: null,
        },
      }),
    );

    const result = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Updated Legacy Source Template Name",
      agreementType: "inspection",
      frequency: "monthly",
      nextDueDate: "2026-06-01",
      startDate: "2026-05-01",
      defaultVisitScopeSummary: "Updated legacy summary",
      defaultVisitScopeItemsJson: JSON.stringify([{ title: "Updated legacy item" }]),
      primaryLocationId: "loc-1",
      renewalDate: "2026-07-01",
      status: "active",
      internalNotes: "Legacy notes",
    });

    expect(result).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._updateCalls).toHaveLength(1);
    expect(supabase._updateCalls[0]).toMatchObject({
      agreement_name: "Updated Legacy Source Template Name",
      agreement_type: "inspection",
      frequency: "monthly",
      default_visit_scope_summary: "Updated legacy summary",
      default_visit_scope_items: [{ title: "Updated legacy item" }],
      primary_location_id: "loc-1",
      status: "active",
    });
  });

  it("treats persisted template snapshot as immutable agreement-side data during updates", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClient({
        templateFound: true,
        templateOverrides: {
          template_name: "Template Name Edited Later",
          agreement_type: "maintenance",
          frequency: "monthly",
          lock_policy_version: 7,
          locked_field_keys: ["agreement_name", "frequency"],
        },
      }),
    );

    const created = await createMaintenanceAgreement({
      customerId: "cust-1",
      agreementName: "Will Be Ignored",
      agreementType: "inspection",
      frequency: "custom",
      nextDueDate: "2026-10-01",
      startDate: "2026-05-01",
      sourceTemplateId: "tpl-1",
    });
    expect(created).toEqual({ success: true, agreementId: "agr-1" });

    const updated = await updateMaintenanceAgreement({
      agreementId: "agr-1",
      customerId: "cust-1",
      agreementName: "Operator Edited Name",
      agreementType: "maintenance",
      frequency: "quarterly",
      nextDueDate: "2026-11-01",
      startDate: "2026-05-01",
      status: "active",
    });

    expect(updated).toEqual({ success: true, agreementId: "agr-1" });
    expect(supabase._insertCalls[0]).toMatchObject({
      agreement_name: "Template Name Edited Later",
      template_lock_policy_version: 7,
      template_locked_field_keys: ["agreement_name", "frequency"],
    });
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_lock_policy_version");
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_locked_field_keys");
    expect(supabase._updateCalls[0]).not.toHaveProperty("template_lock_snapshot_applied_at");
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

  it("keeps service-plan work-order link creation operational for technician-created jobs", async () => {
    const { createMaintenanceAgreementVisitLinkFromJobCreation } = await import("@/lib/maintenance-agreements/agreement-actions");

    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    const admin = makeLinkAdminClient();
    createAdminClientMock.mockReturnValue(admin);

    const result = await createMaintenanceAgreementVisitLinkFromJobCreation({
      agreementId: "agr-1",
      jobId: "job-1",
      createdByUserId: "tech-1",
    });

    expect(result).toBe(true);
    expect(admin._insertCalls).toHaveLength(1);
    expect(admin._insertCalls[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      agreement_id: "agr-1",
      job_id: "job-1",
      created_by_user_id: "tech-1",
      updated_by_user_id: "tech-1",
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

  it("allows technicians to progress counted-visit completion flow when already authorized by job permissions", async () => {
    const { markMaintenanceAgreementVisitCountedFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    const admin = makeMarkVisitCountedAdminClient();
    createAdminClientMock.mockReturnValue(admin);
    requireInternalUserMock.mockResolvedValue({
      userId: "tech-1",
      internalUser: {
        user_id: "tech-1",
        role: "tech",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("maintenance_agreement_visit_link_id", "link-1");

    const target = await expectRedirectError(() =>
      markMaintenanceAgreementVisitCountedFromForm(formData),
    );

    expect(target).toContain("banner=maintenance_visit_count_saved");
    expect(admin._updateCalls).toHaveLength(1);
    expect(admin._updateCalls[0]).toMatchObject({
      counted_by_user_id: "tech-1",
      updated_by_user_id: "tech-1",
    });
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

describe("autoCountMaintenanceAgreementVisitsForCompletedServiceJob", () => {
  it("counts a linked eligible service-plan visit once", async () => {
    const { autoCountMaintenanceAgreementVisitsForCompletedServiceJob } = await import("@/lib/maintenance-agreements/agreement-actions");
    const admin = makeAutoCountAdminClient();

    const result = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });

    expect(result.countedLinks).toBe(1);
    expect(admin._updateCalls).toHaveLength(1);
    expect(admin._visitLinks[0]).toMatchObject({
      count_status: "counted",
      counts_toward_visit_balance: true,
      counted_by_user_id: "user-1",
    });
  });

  it("does not double-count on repeated helper calls", async () => {
    const { autoCountMaintenanceAgreementVisitsForCompletedServiceJob } = await import("@/lib/maintenance-agreements/agreement-actions");
    const admin = makeAutoCountAdminClient();

    const first = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });
    const second = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });

    expect(first.countedLinks).toBe(1);
    expect(second.countedLinks).toBe(0);
    expect(admin._updateCalls).toHaveLength(1);
  });

  it("skips already counted links", async () => {
    const { autoCountMaintenanceAgreementVisitsForCompletedServiceJob } = await import("@/lib/maintenance-agreements/agreement-actions");
    const admin = makeAutoCountAdminClient({
      links: [
        {
          id: "link-1",
          account_owner_user_id: "owner-1",
          agreement_id: "agr-1",
          job_id: "job-1",
          count_status: "counted",
          counts_toward_visit_balance: true,
          reversed_at: null,
          counted_at: "2026-05-01T00:00:00.000Z",
          counted_by_user_id: "user-0",
          updated_by_user_id: "user-0",
        },
      ],
    });

    const result = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });

    expect(result.countedLinks).toBe(0);
    expect(result.alreadyCountedLinks).toBe(1);
    expect(admin._updateCalls).toHaveLength(0);
  });

  it("skips excluded and reversed links", async () => {
    const { autoCountMaintenanceAgreementVisitsForCompletedServiceJob } = await import("@/lib/maintenance-agreements/agreement-actions");
    const admin = makeAutoCountAdminClient({
      links: [
        {
          id: "link-excluded",
          account_owner_user_id: "owner-1",
          agreement_id: "agr-1",
          job_id: "job-1",
          count_status: "excluded",
          counts_toward_visit_balance: false,
          reversed_at: null,
          counted_at: null,
          counted_by_user_id: null,
          updated_by_user_id: null,
        },
        {
          id: "link-reversed",
          account_owner_user_id: "owner-1",
          agreement_id: "agr-1",
          job_id: "job-1",
          count_status: "linked",
          counts_toward_visit_balance: false,
          reversed_at: "2026-05-02T00:00:00.000Z",
          counted_at: null,
          counted_by_user_id: null,
          updated_by_user_id: null,
        },
      ],
    });

    const result = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });

    expect(result.countedLinks).toBe(0);
    expect(admin._updateCalls).toHaveLength(0);
  });

  it("skips non-service and non-maintenance visit types", async () => {
    const { autoCountMaintenanceAgreementVisitsForCompletedServiceJob } = await import("@/lib/maintenance-agreements/agreement-actions");

    const nonServiceAdmin = makeAutoCountAdminClient({
      job: {
        job_type: "ecc",
      },
    });
    const nonMaintenanceAdmin = makeAutoCountAdminClient({
      job: {
        service_visit_type: "repair",
      },
    });

    const nonServiceResult = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin: nonServiceAdmin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });
    const nonMaintenanceResult = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin: nonMaintenanceAdmin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });

    expect(nonServiceResult.countedLinks).toBe(0);
    expect(nonMaintenanceResult.countedLinks).toBe(0);
    expect(nonServiceAdmin._updateCalls).toHaveLength(0);
    expect(nonMaintenanceAdmin._updateCalls).toHaveLength(0);
  });

  it("skips disqualifying canceled/no-show outcomes", async () => {
    const { autoCountMaintenanceAgreementVisitsForCompletedServiceJob } = await import("@/lib/maintenance-agreements/agreement-actions");
    const canceledAdmin = makeAutoCountAdminClient({
      job: {
        status: "cancelled",
      },
    });
    const noShowAdmin = makeAutoCountAdminClient({
      job: {
        service_visit_outcome: "no_show",
      },
    });

    const canceledResult = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin: canceledAdmin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });
    const noShowResult = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin: noShowAdmin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });

    expect(canceledResult.countedLinks).toBe(0);
    expect(noShowResult.countedLinks).toBe(0);
    expect(canceledAdmin._updateCalls).toHaveLength(0);
    expect(noShowAdmin._updateCalls).toHaveLength(0);
  });

  it("counts all eligible links when multiple links are eligible", async () => {
    const { autoCountMaintenanceAgreementVisitsForCompletedServiceJob } = await import("@/lib/maintenance-agreements/agreement-actions");
    const admin = makeAutoCountAdminClient({
      links: [
        {
          id: "link-1",
          account_owner_user_id: "owner-1",
          agreement_id: "agr-1",
          job_id: "job-1",
          count_status: "linked",
          counts_toward_visit_balance: false,
          reversed_at: null,
          counted_at: null,
          counted_by_user_id: null,
          updated_by_user_id: null,
        },
        {
          id: "link-2",
          account_owner_user_id: "owner-1",
          agreement_id: "agr-2",
          job_id: "job-1",
          count_status: "eligible",
          counts_toward_visit_balance: false,
          reversed_at: null,
          counted_at: null,
          counted_by_user_id: null,
          updated_by_user_id: null,
        },
      ],
      agreementStatusById: {
        "agr-1": "active",
        "agr-2": "active",
      },
      agreementCustomerIdById: {
        "agr-1": "cust-1",
        "agr-2": "cust-1",
      },
    });

    const result = await autoCountMaintenanceAgreementVisitsForCompletedServiceJob({
      admin,
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      actingUserId: "user-1",
    });

    expect(result.countedLinks).toBe(2);
    expect(admin._updateCalls).toHaveLength(2);
    expect(admin._visitLinks.every((row) => row.count_status === "counted")).toBe(true);
  });
});
