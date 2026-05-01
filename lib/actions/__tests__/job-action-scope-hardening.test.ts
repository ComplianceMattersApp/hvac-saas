import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeAdminClientFixture(fixture: {
  job: Record<string, unknown> | null;
  customerInScope: boolean;
  serviceCase?: Record<string, unknown> | null;
}) {
  return {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: fixture.job,
                  error: null,
                })),
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
                  data: fixture.customerInScope ? { id: String((fixture.job as any)?.customer_id ?? "cust-1") } : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "service_cases") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: fixture.serviceCase ?? null,
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    },
  };
}

function makeSessionClientFixture() {
  const updateCalls: Array<{ table: string; values: Record<string, unknown>; eq: Array<[string, unknown]> }> = [];
  const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs" || table === "service_cases") {
        return {
          update(values: Record<string, unknown>) {
            const record = { table, values, eq: [] as Array<[string, unknown]> };
            updateCalls.push(record);
            return {
              eq(column: string, value: unknown) {
                record.eq.push([column, value]);
                return Promise.resolve({ error: null });
              },
            };
          },
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "case-1" }, error: null })),
            })),
          })),
          insert: vi.fn(async () => ({ data: { id: "case-1" }, error: null })),
        };
      }

      if (table === "job_events") {
        return {
          insert(values: Record<string, unknown>) {
            insertCalls.push({ table, values });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "service_cases") {
        return {
          insert: vi.fn(async () => ({ data: { id: "case-1" }, error: null })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    },
  };

  return { supabase, updateCalls, insertCalls };
}

describe("internal same-account job mutation hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("allows same-account internal visit scope mutation", async () => {
    const { supabase, updateCalls, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: {
          id: "job-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "service",
          visit_scope_summary: "Old summary",
          visit_scope_items: [],
        },
        customerInScope: true,
      }),
    );

    const { updateJobVisitScopeFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("tab", "info");
    formData.set("visit_scope_summary", "New scoped summary");
    formData.set("visit_scope_items_json", "[]");

    await expect(updateJobVisitScopeFromForm(formData)).rejects.toThrow(
      /REDIRECT:\/jobs\/job-1\?tab=info&banner=visit_scope_saved&rv=/,
    );

    expect(updateCalls).toContainEqual({
      table: "jobs",
      values: {
        visit_scope_summary: "New scoped summary",
        visit_scope_items: [],
      },
      eq: [["id", "job-1"]],
    });
    expect(insertCalls).toHaveLength(1);
  });

  it("denies cross-account internal visit scope mutation before write", async () => {
    const { supabase, updateCalls, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: {
          id: "job-2",
          customer_id: "cust-2",
          service_case_id: "case-2",
          job_type: "service",
          visit_scope_summary: "Old summary",
          visit_scope_items: [],
        },
        customerInScope: false,
      }),
    );

    const { updateJobVisitScopeFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-2");
    formData.set("tab", "info");
    formData.set("visit_scope_summary", "New scoped summary");
    formData.set("visit_scope_items_json", "[]");

    await expect(updateJobVisitScopeFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-2?tab=info&banner=visit_scope_job_read_failed",
    );

    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("allows same-account internal service contract and linked service-case mutation", async () => {
    const { supabase, updateCalls, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: {
          id: "job-3",
          customer_id: "cust-3",
          service_case_id: "case-3",
          job_type: "service",
          service_visit_type: "diagnostic",
          service_visit_reason: "Old reason",
          service_visit_outcome: "follow_up_required",
          title: "Service Visit",
          job_notes: "Old notes",
        },
        customerInScope: true,
        serviceCase: {
          id: "case-3",
          customer_id: "cust-3",
          case_kind: "reactive",
        },
      }),
    );

    const { updateJobServiceContractFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-3");
    formData.set("tab", "info");
    formData.set("service_visit_type", "maintenance");
    formData.set("service_visit_reason", "New reason");
    formData.set("service_visit_outcome", "resolved");
    formData.set("service_case_kind", "maintenance");

    await expect(updateJobServiceContractFromForm(formData)).rejects.toThrow(
      /REDIRECT:\/jobs\/job-3\?tab=info&banner=service_contract_saved&rv=/,
    );

    expect(updateCalls).toContainEqual({
      table: "jobs",
      values: {
        service_visit_type: "maintenance",
        service_visit_reason: "New reason",
        service_visit_outcome: "resolved",
      },
      eq: [["id", "job-3"]],
    });
    expect(updateCalls).toContainEqual({
      table: "service_cases",
      values: {
        case_kind: "maintenance",
        updated_at: expect.any(String),
      },
      eq: [["id", "case-3"]],
    });
    expect(insertCalls).toHaveLength(1);
  });

  it("denies cross-account internal service contract mutation before job and service-case writes", async () => {
    const { supabase, updateCalls, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      makeAdminClientFixture({
        job: {
          id: "job-4",
          customer_id: "cust-4",
          service_case_id: "case-4",
          job_type: "service",
          service_visit_type: "diagnostic",
          service_visit_reason: "Old reason",
          service_visit_outcome: "follow_up_required",
          title: "Service Visit",
          job_notes: "Old notes",
        },
        customerInScope: false,
        serviceCase: {
          id: "case-4",
          customer_id: "cust-4",
          case_kind: "reactive",
        },
      }),
    );

    const { updateJobServiceContractFromForm } = await import("@/lib/actions/job-actions");

    const formData = new FormData();
    formData.set("job_id", "job-4");
    formData.set("tab", "info");
    formData.set("service_visit_type", "maintenance");
    formData.set("service_visit_reason", "New reason");
    formData.set("service_visit_outcome", "resolved");
    formData.set("service_case_kind", "maintenance");

    await expect(updateJobServiceContractFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/job-4?tab=info&banner=service_contract_update_failed",
    );

    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});