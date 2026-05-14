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
  isInternalAccessError: (e: any) => e?.code,
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) => resolveEntitlementMock(...args),
}));

vi.mock("@/lib/maintenance-agreements/agreement-exposure", () => ({
  isMaintenanceAgreementsEnabled: (...args: unknown[]) => isMaintenanceAgreementsEnabledMock(...args),
}));

describe("confirmMaintenanceAgreementNextDueDateFromForm", () => {
  async function expectRedirectError(fn: () => Promise<void>) {
    try {
      await fn();
      throw new Error("Expected redirect error");
    } catch (e: any) {
      if (e.message.startsWith("REDIRECT:")) {
        return e.message.slice("REDIRECT:".length);
      }
      throw e;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalUserMock.mockReturnValue({
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
      },
      userId: "user-1",
    });
    resolveEntitlementMock.mockReturnValue({ authorized: true });
    isMaintenanceAgreementsEnabledMock.mockReturnValue(true);
    createClientMock.mockReturnValue({});
  });

  it("successfully confirms and updates agreement next_due_date", async () => {
    const { confirmMaintenanceAgreementNextDueDateFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");

    const selectMock = vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({ data: { id: "agr-1" }, error: null })),
    }));

    const eq4Mock = vi.fn(() => ({
      select: selectMock,
    }));

    const eq3Mock = vi.fn(() => ({
      eq: eq4Mock,
    }));

    const eq2Mock = vi.fn(() => ({
      eq: eq3Mock,
    }));

    const eq1Mock = vi.fn(() => ({
      eq: eq2Mock,
    }));

    const updateMock = vi.fn(() => ({
      eq: eq1Mock,
    }));

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "maintenance_agreement_visits") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "link-1",
                      account_owner_user_id: "owner-1",
                      job_id: "job-1",
                      agreement_id: "agr-1",
                      count_status: "counted",
                      counts_toward_visit_balance: true,
                    },
                    error: null,
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
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "agr-1",
                      account_owner_user_id: "owner-1",
                      customer_id: "cust-1",
                      status: "active",
                      frequency: "monthly",
                      next_due_date: "2026-06-15",
                    },
                    error: null,
                  })),
                })),
              })),
            })),
            update: updateMock,
          };
        }
        if (table === "jobs") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "job-1",
                    customer_id: "cust-1",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("agreement_id", "agr-1");
    formData.set("suggested_next_due_date", "2026-07-15");
    formData.set("baseline_next_due_date", "2026-06-15");

    const target = await expectRedirectError(() => confirmMaintenanceAgreementNextDueDateFromForm(formData));

    expect(target).toContain("banner=confirm_next_due_saved");
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs/job-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/service-plans");
    expect(revalidatePathMock).toHaveBeenCalledWith("/customers/cust-1");
    expect(updateMock).toHaveBeenCalledWith({
      next_due_date: "2026-07-15",
      updated_by_user_id: "user-1",
    });
  });

  it("fails when agreement next_due_date changed (stale state)", async () => {
    const { confirmMaintenanceAgreementNextDueDateFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "maintenance_agreement_visits") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "link-1",
                      account_owner_user_id: "owner-1",
                      job_id: "job-1",
                      agreement_id: "agr-1",
                      count_status: "counted",
                      counts_toward_visit_balance: true,
                    },
                    error: null,
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
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "agr-1",
                      account_owner_user_id: "owner-1",
                      customer_id: "cust-1",
                      status: "active",
                      frequency: "monthly",
                      next_due_date: "2026-07-01", // different from baseline
                    },
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
                  data: {
                    id: "job-1",
                    customer_id: "cust-1",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("agreement_id", "agr-1");
    formData.set("suggested_next_due_date", "2026-07-15");
    formData.set("baseline_next_due_date", "2026-06-15");

    const target = await expectRedirectError(() => confirmMaintenanceAgreementNextDueDateFromForm(formData));

    expect(target).toContain("banner=confirm_next_due_stale_state");
  });

  it("fails when agreement frequency is custom", async () => {
    const { confirmMaintenanceAgreementNextDueDateFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "maintenance_agreement_visits") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "link-1",
                      account_owner_user_id: "owner-1",
                      job_id: "job-1",
                      agreement_id: "agr-1",
                      count_status: "counted",
                      counts_toward_visit_balance: true,
                    },
                    error: null,
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
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "agr-1",
                      account_owner_user_id: "owner-1",
                      customer_id: "cust-1",
                      status: "active",
                      frequency: "custom", // not interval
                      next_due_date: "2026-06-15",
                    },
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
                  data: {
                    id: "job-1",
                    customer_id: "cust-1",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("agreement_id", "agr-1");
    formData.set("suggested_next_due_date", "2026-07-15");
    formData.set("baseline_next_due_date", "2026-06-15");

    const target = await expectRedirectError(() => confirmMaintenanceAgreementNextDueDateFromForm(formData));

    expect(target).toContain("banner=confirm_next_due_custom_frequency");
  });

  it("fails when agreement is not active", async () => {
    const { confirmMaintenanceAgreementNextDueDateFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "maintenance_agreement_visits") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "link-1",
                      account_owner_user_id: "owner-1",
                      job_id: "job-1",
                      agreement_id: "agr-1",
                      count_status: "counted",
                      counts_toward_visit_balance: true,
                    },
                    error: null,
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
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "agr-1",
                      account_owner_user_id: "owner-1",
                      customer_id: "cust-1",
                      status: "paused", // not active
                      frequency: "monthly",
                      next_due_date: "2026-06-15",
                    },
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
                  data: {
                    id: "job-1",
                    customer_id: "cust-1",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("agreement_id", "agr-1");
    formData.set("suggested_next_due_date", "2026-07-15");
    formData.set("baseline_next_due_date", "2026-06-15");

    const target = await expectRedirectError(() => confirmMaintenanceAgreementNextDueDateFromForm(formData));

    expect(target).toContain("banner=confirm_next_due_agreement_inactive");
  });

  it("fails when link is not counted", async () => {
    const { confirmMaintenanceAgreementNextDueDateFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "maintenance_agreement_visits") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "link-1",
                      account_owner_user_id: "owner-1",
                      job_id: "job-1",
                      agreement_id: "agr-1",
                      count_status: "linked", // not counted
                      counts_toward_visit_balance: false,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(admin);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("agreement_id", "agr-1");
    formData.set("suggested_next_due_date", "2026-07-15");
    formData.set("baseline_next_due_date", "2026-06-15");

    const target = await expectRedirectError(() => confirmMaintenanceAgreementNextDueDateFromForm(formData));

    expect(target).toContain("banner=confirm_next_due_not_counted");
  });

  it("fails when feature flag is disabled", async () => {
    const { confirmMaintenanceAgreementNextDueDateFromForm } = await import("@/lib/maintenance-agreements/agreement-actions");
    isMaintenanceAgreementsEnabledMock.mockReturnValue(false);

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("agreement_id", "agr-1");
    formData.set("suggested_next_due_date", "2026-07-15");
    formData.set("baseline_next_due_date", "2026-06-15");

    const target = await expectRedirectError(() => confirmMaintenanceAgreementNextDueDateFromForm(formData));

    expect(target).toContain("banner=confirm_next_due_unavailable");
  });
});
