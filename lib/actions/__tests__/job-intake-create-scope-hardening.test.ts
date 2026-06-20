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
  jobsInsertError?: Error | null;
  contractorId?: string | null;
  accountSettingsProductMode?: "hybrid" | "ecc_hers" | "hvac_service" | null;
  locationRows?: Array<Record<string, unknown>>;
  createdLocationId?: string;
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

function buildIntakeFormData(options?: { jobNotes?: string }) {
  const formData = new FormData();
  formData.set("job_type", "ecc");
  formData.set("title", "Intake Smoke Test Job");
  formData.set("customer_id", "cust-1");
  formData.set("location_id", "loc-1");
  if (typeof options?.jobNotes === "string") {
    formData.set("job_notes", options.jobNotes);
  }
  return formData;
}

function buildInternalServiceIntakeFormData(options?: {
  visitScopeSummary?: string;
  visitScopeItemsJson?: string;
  maintenanceAgreementId?: string;
  serviceVisitType?: "diagnostic" | "repair" | "install" | "return_visit" | "callback" | "maintenance";
  intakeContext?: "app" | "portal";
  equipmentJson?: string;
}) {
  const formData = new FormData();
  formData.set("job_type", "service");
  formData.set("title", "Service Intake Test Job");
  formData.set("customer_id", "cust-1");
  formData.set("location_id", "loc-1");
  formData.set("visit_scope_summary", options?.visitScopeSummary ?? "");
  formData.set("visit_scope_items_json", options?.visitScopeItemsJson ?? "[]");
  if (options?.serviceVisitType) {
    formData.set("service_visit_type", options.serviceVisitType);
  }
  if (options?.maintenanceAgreementId) {
    formData.set("maintenance_agreement_id", options.maintenanceAgreementId);
    formData.set("service_case_kind", "maintenance");
    formData.set("service_visit_type", "maintenance");
  }
  if (options?.intakeContext) {
    formData.set("intake_context", options.intakeContext);
  }
  if (typeof options?.equipmentJson === "string") {
    formData.set("equipment_json", options.equipmentJson);
  }
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

function buildExistingCustomerSelectedLocationFormData(locationId: string) {
  const formData = new FormData();
  formData.set("job_type", "ecc");
  formData.set("title", "Second Location Intake Job");
  formData.set("customer_id", "cust-1");
  formData.set("location_id", locationId);
  return formData;
}

function buildExistingCustomerNewLocationFormData(options?: { siteAccessContact?: boolean }) {
  const formData = new FormData();
  formData.set("job_type", "ecc");
  formData.set("title", "New Location Intake Job");
  formData.set("customer_id", "cust-1");
  formData.set("location_nickname", "Warehouse");
  formData.set("address_line1", "200 Side St");
  formData.set("address_line2", "Suite 4");
  formData.set("city", "Lodi");
  formData.set("state", "CA");
  formData.set("zip", "95240");

  if (options?.siteAccessContact) {
    formData.set("site_access_contact_different", "1");
    formData.set("site_access_contact_name", "Onsite Manager");
    formData.set("site_access_contact_phone", "2095550100");
  }

  return formData;
}

function buildSupabaseFixture(options: FixtureOptions = {}) {
  const writeCalls: WriteCall[] = [];
  const insertCalls: InsertCall[] = [];
  let lastLocationInsertPayload: Record<string, unknown> | null = null;
  const locationRows = options.locationRows ?? [
    {
      id: "loc-1",
      customer_id: "cust-1",
      owner_user_id: "owner-1",
      address_line1: "100 Main St",
      city: "Stockton",
      state: "CA",
      zip: "95202",
      postal_code: "95202",
    },
  ];

  function locationById(id: unknown) {
    const normalizedId = String(id ?? "").trim();
    if (!normalizedId) return null;
    if (normalizedId === (options.createdLocationId ?? "loc-new") && lastLocationInsertPayload) {
      return {
        id: normalizedId,
        ...lastLocationInsertPayload,
      };
    }
    return locationRows.find((row) => String(row.id ?? "").trim() === normalizedId) ?? null;
  }

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
        if (selected.trim() === "id") {
          return { data: { id: "cust-1" }, error: null };
        }
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
        const idFilter = filters.find((filter) => filter.column === "id");
        const scopedLocation = idFilter ? locationById(idFilter.value) : null;
        if (selected.includes("owner_user_id")) {
          return {
            data: scopedLocation ?? { id: "loc-1", customer_id: "cust-1", owner_user_id: "owner-1" },
            error: null,
          };
        }
        return {
          data:
            scopedLocation ?? {
              id: "loc-1",
              address_line1: "100 Main St",
              city: "Stockton",
              zip: "95202",
            },
          error: null,
        };
      }

      if (table === "jobs") {
        const byId = filters.find((filter) => filter.column === "id");
        if (byId && byId.value === "job-1" && selected.includes("customer_id")) {
          return {
            data: {
              id: "job-1",
              customer_id: "cust-1",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }

      if (table === "maintenance_agreements") {
        return {
          data: {
            id: "52851fbf-0e65-482d-868a-1c858521d128",
            customer_id: "cust-1",
            account_owner_user_id: "owner-1",
          },
          error: null,
        };
      }

      if (table === "account_settings") {
        return {
          data: options.accountSettingsProductMode
            ? {
                account_owner_user_id: "owner-1",
                product_mode: options.accountSettingsProductMode,
              }
            : null,
          error: null,
        };
      }

      return { data: null, error: null };
    }

    function resolveSingle() {
      if (table === "jobs") {
        if (options.jobsInsertError) {
          throw options.jobsInsertError;
        }
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
            job_display_number: "J-1001",
          },
          error: null,
        };
      }

      if (table === "service_cases") {
        return {
          data: {
            id: "case-1",
          },
          error: null,
        };
      }

      if (table === "job_events") {
        return {
          data: {
            id: "event-1",
          },
          error: null,
        };
      }

      if (table === "contractor_intake_submissions") {
        return {
          data: {
            id: "proposal-1",
          },
          error: null,
        };
      }

      if (table === "locations") {
        return {
          data: {
            id: options.createdLocationId ?? "loc-new",
            ...(lastLocationInsertPayload ?? {}),
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
        return { data: locationRows, error: null };
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
          if (table === "locations") {
            lastLocationInsertPayload = (
              Array.isArray(_payload) ? _payload[0] : _payload
            ) as Record<string, unknown>;
          }
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

  function firstInsertPayload(fixture: { insertCalls: InsertCall[] }, table: string) {
    const insertCall = fixture.insertCalls.find((call) => call.table === table);
    const payloadRaw = insertCall?.payload;
    return (
      Array.isArray(payloadRaw) ? payloadRaw[0] : payloadRaw
    ) as Record<string, unknown> | null | undefined;
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

  it("persists normal job notes without request-source injection", async () => {
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
        buildIntakeFormData({
          jobNotes: "Customer noted intermittent airflow issue.",
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsInsertCall = fixture.insertCalls.find((call) => call.table === "jobs");
    const jobsPayloadRaw = jobsInsertCall?.payload;
    const jobsPayload = (
      Array.isArray(jobsPayloadRaw) ? jobsPayloadRaw[0] : jobsPayloadRaw
    ) as Record<string, unknown> | null | undefined;

    expect(jobsPayload).toBeTruthy();
    expect(jobsPayload?.job_notes).toBe("Customer noted intermittent airflow issue.");
    expect(String(jobsPayload?.job_notes ?? "")).not.toContain("Request source:");
  });

  it("creates an existing-customer job with the selected second saved location", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      locationRows: [
        {
          id: "loc-1",
          customer_id: "cust-1",
          owner_user_id: "owner-1",
          address_line1: "100 Main St",
          city: "Stockton",
          state: "CA",
          zip: "95202",
          postal_code: "95202",
        },
        {
          id: "loc-2",
          customer_id: "cust-1",
          owner_user_id: "owner-1",
          address_line1: "200 Side St",
          city: "Lodi",
          state: "CA",
          zip: "95240",
          postal_code: "95240",
        },
      ],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(buildExistingCustomerSelectedLocationFormData("loc-2")),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    expect(firstInsertPayload(fixture, "jobs")).toMatchObject({
      customer_id: "cust-1",
      location_id: "loc-2",
      job_address: "200 Side St",
      city: "Lodi",
    });
  });

  it("creates an existing-customer new location and job address snapshot", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      createdLocationId: "loc-new",
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(createJobFromForm(buildExistingCustomerNewLocationFormData())).rejects.toThrow(
      ALLOW_PATH_REACHED,
    );

    expect(firstInsertPayload(fixture, "locations")).toMatchObject({
      customer_id: "cust-1",
      nickname: "Warehouse",
      address_line1: "200 Side St",
      address_line2: "Suite 4",
      city: "Lodi",
      state: "CA",
      zip: "95240",
      postal_code: "95240",
      owner_user_id: "owner-1",
    });
    expect(firstInsertPayload(fixture, "jobs")).toMatchObject({
      customer_id: "cust-1",
      location_id: "loc-new",
      job_address: "200 Side St",
      city: "Lodi",
    });
  });

  it("uses the created location id for Branch 2 site/access contact creation", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: false,
      createdLocationId: "loc-new",
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    await expect(
      createJobFromForm(buildExistingCustomerNewLocationFormData({ siteAccessContact: true })),
    ).rejects.toThrow("REDIRECT:/jobs/job-1?banner=job_created");

    const contactInsert = fixture.insertCalls.find((call) => call.table === "contact_recipients");
    expect(contactInsert?.payload).toMatchObject({
      linked_entity_type: "location",
      linked_entity_id: "loc-new",
      recipient_role: "site_access_contact",
      display_name: "Onsite Manager",
    });
  });

  it("preserves service job type for service-plan intake under ecc_hers mode", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      accountSettingsProductMode: "ecc_hers",
    });
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
          maintenanceAgreementId: "52851fbf-0e65-482d-868a-1c858521d128",
          visitScopeItemsJson: JSON.stringify([
            { title: "Inspect outdoor unit", details: "Clean as needed", kind: "primary" },
          ]),
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsInsert = fixture.insertCalls.find((call) => call.table === "jobs");
    expect(jobsInsert).toBeTruthy();
    expect(jobsInsert?.payload).toMatchObject({
      job_type: "service",
      service_visit_type: "maintenance",
    });
  });

  it("preserves requested service lane create in hybrid mode", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      accountSettingsProductMode: "hybrid",
    });
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
          visitScopeItemsJson: JSON.stringify([
            { title: "Diagnose weak airflow", details: "Upstairs hall", kind: "primary" },
          ]),
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsInsert = fixture.insertCalls.find((call) => call.table === "jobs");
    expect(jobsInsert?.payload).toMatchObject({
      job_type: "service",
      service_visit_type: "diagnostic",
    });
  });

  it("accepts install service visit type in service intake", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      accountSettingsProductMode: "hybrid",
    });
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
          serviceVisitType: "install",
          visitScopeItemsJson: JSON.stringify([
            { title: "Install condenser", details: "Back yard", kind: "primary" },
          ]),
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsInsert = fixture.insertCalls.find((call) => call.table === "jobs");
    expect(jobsInsert?.payload).toMatchObject({
      job_type: "service",
      service_visit_type: "install",
    });
  });

  it("redirects cleanly when internal service submit fails during create", async () => {
    const fixture = buildSupabaseFixture({
      jobsInsertError: new Error("database unavailable"),
      accountSettingsProductMode: "hvac_service",
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    const formData = buildInternalServiceIntakeFormData({
      visitScopeItemsJson: JSON.stringify([
        { title: "Diagnose weak airflow", details: "Upstairs hall", kind: "primary" },
      ]),
    });

    await expect(createJobFromForm(formData)).rejects.toThrow(
      "REDIRECT:/jobs/new?err=service_submit_failed",
    );
  });

  it("preserves requested ECC lane create in hybrid mode", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      accountSettingsProductMode: "hybrid",
    });
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
          visitScopeSummary: "Hybrid ECC lane smoke",
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsInsert = fixture.insertCalls.find((call) => call.table === "jobs");
    expect(jobsInsert?.payload).toMatchObject({
      job_type: "ecc",
      project_type: "alteration",
    });
  });

  it("defaults missing relationship action to safe new case behavior", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      accountSettingsProductMode: "hybrid",
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");
    const formData = buildInternalServiceIntakeFormData({
      visitScopeItemsJson: JSON.stringify([
        { title: "Confirm thermostat issue", details: "Entry hall", kind: "primary" },
      ]),
    });
    formData.delete("relationship_action");
    formData.delete("relationship_job_id");

    await expect(createJobFromForm(formData)).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsInsert = fixture.insertCalls.find((call) => call.table === "jobs");
    expect(jobsInsert?.payload).toMatchObject({
      job_type: "service",
      service_visit_type: "diagnostic",
    });
  });

  it("creates maintenance agreement link row before post-create redirect", async () => {
    const previousMaintenanceFlag = process.env.ENABLE_MAINTENANCE_AGREEMENTS;
    process.env.ENABLE_MAINTENANCE_AGREEMENTS = "true";

    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: false,
      accountSettingsProductMode: "ecc_hers",
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    resolveCanonicalOwnerMock.mockResolvedValue({
      canonicalOwnerUserId: "owner-1",
      canonicalWriteClient: fixture.supabase,
    });

    const { createJobFromForm } = await import("@/lib/actions/job-actions");

    try {
      await expect(
        createJobFromForm(
          buildInternalServiceIntakeFormData({
            maintenanceAgreementId: "52851fbf-0e65-482d-868a-1c858521d128",
            visitScopeItemsJson: JSON.stringify([{ title: "Inspect blower", kind: "primary" }]),
          }),
        ),
      ).rejects.toThrow("REDIRECT:/jobs/job-1?banner=job_created");

      expect(
        fixture.writeCalls.some((call) => call.table === "maintenance_agreement_visits" && call.method === "insert"),
      ).toBe(true);
    } finally {
      process.env.ENABLE_MAINTENANCE_AGREEMENTS = previousMaintenanceFlag;
    }
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
          intakeContext: "portal",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/new?err=contractor_proposal_submitted");

    const proposalPayload = firstInsertPayload(fixture, "contractor_intake_submissions");
    expect(proposalPayload).toBeTruthy();
    expect(String(proposalPayload?.proposed_job_notes ?? "")).not.toContain("Contractor proposal summary");
    expect(fixture.writeCalls.some((call) => call.table === "jobs")).toBe(false);
    expect(fixture.writeCalls.some((call) => call.table === "job_events")).toBe(false);
  });

  it("stores portal intake equipment as proposed proposal context without canonical equipment writes", async () => {
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
          intakeContext: "portal",
          equipmentJson: JSON.stringify({
            systems: [
              {
                name: "Upstairs",
                components: [
                  {
                    type: "furnace",
                    manufacturer: "Trane",
                    model: "TUH",
                    serial: "123",
                    heating_capacity_kbtu: "80",
                    heating_output_btu: "64000",
                    heating_efficiency_percent: "80",
                    notes: "Contractor supplied",
                  },
                ],
              },
            ],
          }),
        }),
      ),
    ).rejects.toThrow("REDIRECT:/jobs/new?err=contractor_proposal_submitted");

    const proposalPayload = firstInsertPayload(fixture, "contractor_intake_submissions");
    expect(String(proposalPayload?.proposed_job_notes ?? "")).toContain("Proposed equipment:");
    expect(String(proposalPayload?.proposed_job_notes ?? "")).toContain("- System: Upstairs");
    expect(String(proposalPayload?.proposed_job_notes ?? "")).toContain("Furnace: manufacturer Trane");
    expect(fixture.writeCalls.some((call) => call.table === "job_systems")).toBe(false);
    expect(fixture.writeCalls.some((call) => call.table === "job_equipment")).toBe(false);
  });

  it("does not switch active app plus portal intake into contractor mode without explicit portal context", async () => {
    const fixture = buildSupabaseFixture({
      throwOnJobsInsert: true,
      contractorId: "ctr-1",
      accountSettingsProductMode: "hybrid",
    });
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
          visitScopeItemsJson: '[{"title":"Diagnose airflow issue","kind":"primary"}]',
        }),
      ),
    ).rejects.toThrow(ALLOW_PATH_REACHED);

    const jobsPayload = firstInsertPayload(fixture, "jobs");
    expect(jobsPayload).toMatchObject({
      contractor_id: null,
    });
    expect(Array.isArray(jobsPayload?.visit_scope_items) ? jobsPayload.visit_scope_items : []).toHaveLength(1);
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
