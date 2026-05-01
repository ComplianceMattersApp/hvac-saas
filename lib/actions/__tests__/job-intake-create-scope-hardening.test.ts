import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const resolveCanonicalOwnerMock = vi.fn();
const requireInternalUserMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const sendEmailMock = vi.fn();
const createContractorIntakeProposalAwarenessNotificationMock = vi.fn();
const insertInternalNotificationForEventMock = vi.fn();
const loadScopedActiveInternalContractorForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

const ALLOW_PATH_REACHED = "ALLOW_PATH_REACHED";

type WriteCall = {
  table: string;
  method: "insert" | "update" | "delete";
};

type InsertCall = {
  table: string;
  payload: unknown;
};

type FixtureOptions = {
  throwOnJobsInsert?: boolean;
  contractorId?: string | null;
};

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
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  createContractorIntakeProposalAwarenessNotification: (...args: unknown[]) =>
    createContractorIntakeProposalAwarenessNotificationMock(...args),
  insertInternalNotificationForEvent: (...args: unknown[]) =>
    insertInternalNotificationForEventMock(...args),
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

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

function buildIntakeFormData() {
  const formData = new FormData();
  formData.set("job_type", "ecc");
  formData.set("title", "Intake Smoke Test Job");
  formData.set("customer_id", "cust-1");
  formData.set("location_id", "loc-1");
  return formData;
}

function buildInternalServiceIntakeFormData(options?: {
  visitScopeSummary?: string;
  visitScopeItemsJson?: string;
}) {
  const formData = new FormData();
  formData.set("job_type", "service");
  formData.set("title", "Service Intake Test Job");
  formData.set("customer_id", "cust-1");
  formData.set("location_id", "loc-1");
  formData.set("visit_scope_summary", options?.visitScopeSummary ?? "");
  formData.set("visit_scope_items_json", options?.visitScopeItemsJson ?? "[]");
  return formData;
}

function buildInternalEccIntakeFormData(options?: {
  visitScopeSummary?: string;
  visitScopeItemsJson?: string;
}) {
  const formData = new FormData();
  formData.set("job_type", "ecc");
  formData.set("title", "ECC Intake Test Job");
  formData.set("customer_id", "cust-1");
  formData.set("location_id", "loc-1");
  if (typeof options?.visitScopeSummary === "string") {
    formData.set("visit_scope_summary", options.visitScopeSummary);
  }
  if (typeof options?.visitScopeItemsJson === "string") {
    formData.set("visit_scope_items_json", options.visitScopeItemsJson);
  }
  return formData;
}

function buildCustomerContextFormDataWithoutCustomer() {
  const formData = new FormData();
  formData.set("job_type", "ecc");
  formData.set("title", "Context Guard Job");
  formData.set("intake_source", "customer");
  formData.set("location_id", "loc-1");
  return formData;
}

function buildSupabaseFixture(options: FixtureOptions = {}) {
  const writeCalls: WriteCall[] = [];
  const insertCalls: InsertCall[] = [];

  function makeReadQuery(table: string, selected: string) {
    const filters: Array<{ column: string; value: unknown }> = [];

    const query: any = {
      select: vi.fn((nextSelected?: string) => {
        if (typeof nextSelected === "string") {
          selected = nextSelected;
        }
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value });
        return query;
      }),
      gte: vi.fn(() => query),
      is: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => resolveMaybeSingle()),
      single: vi.fn(async () => resolveSingle()),
      then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveThenable()).then(onFulfilled, onRejected),
    };

    function resolveMaybeSingle() {
      if (table === "contractor_users") {
        if (options.contractorId) {
          return { data: { contractor_id: options.contractorId }, error: null };
        }
        return { data: null, error: null };
      }

      if (table === "customers") {
        if (selected.includes("owner_user_id")) {
          return { data: { id: "cust-1", owner_user_id: "owner-1" }, error: null };
        }
        return {
          data: {
            first_name: "Jane",
            last_name: "Customer",
            email: "jane@example.com",
            phone: "555-1111",
          },
          error: null,
        };
      }

      if (table === "locations") {
        if (selected.includes("owner_user_id")) {
          return {
            data: { id: "loc-1", customer_id: "cust-1", owner_user_id: "owner-1" },
            error: null,
          };
        }
        return {
          data: {
            id: "loc-1",
            address_line1: "100 Main St",
            city: "Stockton",
            zip: "95202",
          },
          error: null,
        };
      }

      if (table === "jobs") {
        return { data: null, error: null };
      }

      return { data: null, error: null };
    }

    function resolveSingle() {
      if (table === "jobs") {
        if (options.throwOnJobsInsert) {
          throw new Error(ALLOW_PATH_REACHED);
        }
        return {
          data: {
            id: "job-1",
            customer_id: "cust-1",
            location_id: "loc-1",
            service_case_id: null,
            parent_job_id: null,
            title: "Intake Smoke Test Job",
            job_notes: null,
          },
          error: null,
        };
      }

      return { data: null, error: null };
    }

    function resolveThenable() {
      if (table === "jobs") {
        return { data: [], error: null };
      }

      if (table === "locations") {
        return { data: [], error: null };
      }

      return { data: [], error: null };
    }

    return query;
  }

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "internal-1",
            email: "internal@example.com",
          },
        },
        error: null,
      })),
    },
    from(table: string) {
      return {
        select: vi.fn((selected: string) => makeReadQuery(table, selected)),
        insert: vi.fn((_payload: unknown) => {
          writeCalls.push({ table, method: "insert" });
          insertCalls.push({ table, payload: _payload });
          return {
            select: vi.fn((selected: string) => makeReadQuery(table, selected)),
          };
        }),
        update: vi.fn((_payload: unknown) => {
          writeCalls.push({ table, method: "update" });
          return {
            eq: vi.fn(() => ({
              select: vi.fn((selected: string) => makeReadQuery(table, selected)),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          };
        }),
        delete: vi.fn(() => {
          writeCalls.push({ table, method: "delete" });
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }),
      };
    },
  };

  return { supabase, writeCalls, insertCalls };
}

describe("job intake create same-account hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalRoleMock.mockResolvedValue({
      userId: "internal-1",
      internalUser: {
        user_id: "internal-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-1",
      internalUser: {
        user_id: "internal-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    createContractorIntakeProposalAwarenessNotificationMock.mockResolvedValue(undefined);
    insertInternalNotificationForEventMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(undefined);
    loadScopedActiveInternalContractorForMutationMock.mockResolvedValue({ id: "ctr-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  function assertNoIntakeCreateWrites(fixture: { writeCalls: Array<{ table: string }> }) {
    expect(
      fixture.writeCalls.filter((call) =>
        ["customers", "locations", "jobs", "job_events", "notifications"].includes(call.table),
      ),
    ).toHaveLength(0);
  }

  it("allows same-account internal createJobFromForm to reach authorized create path", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: true });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow(ALLOW_PATH_REACHED);

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toContainEqual({ table: "jobs", method: "insert" });
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows internal create when entitlement is valid trial", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: true });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_trial",
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow(ALLOW_PATH_REACHED);

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toContainEqual({ table: "jobs", method: "insert" });
  });

  it("blocks expired trial internal create before any canonical writes", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
    );

    assertNoIntakeCreateWrites(fixture);
  });

  it("blocks null-ended trial internal create before any canonical writes", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_missing_end",
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
    );

    assertNoIntakeCreateWrites(fixture);
  });

  it("allows internal create for internal comped entitlement", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: true });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_internal_comped",
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow(ALLOW_PATH_REACHED);

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toContainEqual({ table: "jobs", method: "insert" });
  });

  it("blocks missing entitlement row internal create before any canonical writes", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    assertNoIntakeCreateWrites(fixture);
  });

  it("rejects internal Service intake with no Visit Scope items", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(
        buildInternalServiceIntakeFormData({
          visitScopeSummary: "",
          visitScopeItemsJson: "[]",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/new?err=visit_scope_required");

    expect(fixture.writeCalls.find((call) => call.table === "jobs" && call.method === "insert")).toBeUndefined();
  });

  it("rejects internal Service intake when scope is summary-only", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(
        buildInternalServiceIntakeFormData({
          visitScopeSummary: "Summary only should not satisfy service intake.",
          visitScopeItemsJson: "[]",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/new?err=visit_scope_required");

    expect(fixture.writeCalls.find((call) => call.table === "jobs" && call.method === "insert")).toBeUndefined();
  });

  it("allows internal Service intake with at least one structured Visit Scope item", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: true });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(
        buildInternalServiceIntakeFormData({
          visitScopeSummary: "Optional summary context",
          visitScopeItemsJson: '[{"title":"Diagnose airflow issue","details":"Main hallway return","kind":"primary"}]',
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toContainEqual({ table: "jobs", method: "insert" });
  });

  it("allows internal ECC intake with optional companion scope items", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: true });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(
        buildInternalEccIntakeFormData({
          visitScopeItemsJson: '[{"title":"Duct Cleaning follow-up","kind":"companion_service"}]',
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toContainEqual({ table: "jobs", method: "insert" });
  });

  it("keeps contractor intake proposal-only and does not persist canonical Visit Scope fields", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: true, contractorId: "ctr-1" });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(
        buildInternalServiceIntakeFormData({
          visitScopeSummary: "Contractor proposal summary",
          visitScopeItemsJson: '[{"title":"Proposed scope","kind":"primary"}]',
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsInsertCall = fixture.insertCalls.find((call) => call.table === "jobs");
    const jobsPayloadRaw = jobsInsertCall?.payload;
    const jobsPayload = (
      Array.isArray(jobsPayloadRaw) ? jobsPayloadRaw[0] : jobsPayloadRaw
    ) as Record<string, unknown> | null | undefined;

    expect(jobsPayload).toBeTruthy();
    expect(jobsPayload?.visit_scope_summary ?? null).toBeNull();
    expect(Array.isArray(jobsPayload?.visit_scope_items) ? jobsPayload.visit_scope_items : []).toEqual([]);
  });

  it("denies cross-account or invalid-scope internal createJobFromForm before canonical writes and side effects", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    requireInternalUserMock.mockResolvedValueOnce({
      userId: "internal-1",
      internalUser: {
        user_id: "internal-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-2",
      },
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow("REDIRECT:/forbidden");

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toHaveLength(0);
    expect(createContractorIntakeProposalAwarenessNotificationMock).not.toHaveBeenCalled();
    expect(insertInternalNotificationForEventMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("denies non-internal createJobFromForm before canonical writes and side effects", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    requireInternalUserMock.mockRejectedValueOnce(new Error("Active internal user required."));

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildIntakeFormData())).rejects.toThrow("REDIRECT:/forbidden");

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toHaveLength(0);
    expect(createContractorIntakeProposalAwarenessNotificationMock).not.toHaveBeenCalled();
    expect(insertInternalNotificationForEventMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("rejects customer-context intake when customer_id is missing before canonical writes", async () => {
    const fixture = buildSupabaseFixture({ throwOnJobsInsert: false });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildCustomerContextFormDataWithoutCustomer())).rejects.toThrow(
      "REDIRECT:/jobs/new?err=invalid_customer_location",
    );

    expect(
      fixture.writeCalls.filter((call) => ["customers", "locations", "jobs", "job_events"].includes(call.table)),
    ).toHaveLength(0);
  });
});
