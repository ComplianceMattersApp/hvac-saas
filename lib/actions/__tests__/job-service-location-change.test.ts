import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: vi.fn(),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(),
  healStalePaperworkOpsStatus: vi.fn(),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  createContractorIntakeProposalAwarenessNotification: vi.fn(),
  insertInternalNotificationForEvent: vi.fn(),
  insertTargetedInternalNotification: vi.fn(),
  markInternalNewWorkNotificationsResolved: vi.fn(),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(),
}));

vi.mock("@/lib/actions/job-ops-actions", () => ({
  releasePendingInfoAndRecompute: vi.fn(),
  releaseAndReevaluate: vi.fn(),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/maintenance-agreements/agreement-actions", () => ({
  createMaintenanceAgreementVisitLinkFromJobCreation: vi.fn(),
  autoCountMaintenanceAgreementVisitsForCompletedServiceJob: vi.fn(),
}));

type Row = Record<string, unknown>;

function buildForm(locationId = "loc-2") {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("location_id", locationId);
  return formData;
}

function makeSelectQuery(data: Row | null) {
  const filters: Array<[string, unknown]> = [];
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return { query, filters };
}

function makeFixture(options?: {
  job?: Row | null;
  location?: Row | null;
}) {
  const job = options?.job ?? {
    id: "job-1",
    customer_id: "cust-1",
    location_id: "loc-1",
    service_case_id: "case-1",
  };
  const location: Row | null =
    options && "location" in options
      ? options.location ?? null
      : {
          id: "loc-2",
          customer_id: "cust-1",
          owner_user_id: "owner-1",
          address_line1: "200 Oak Ave",
          city: "Lodi",
          state: "CA",
          zip: "95240",
          postal_code: "95240",
        };
  const jobUpdates: Array<{ payload: Row; filters: Array<[string, unknown]> }> = [];
  const eventInserts: Row[] = [];
  const touchedTables: string[] = [];
  const forbiddenWrites: Array<{ table: string; method: string }> = [];

  const supabase = {
    from(table: string) {
      touchedTables.push(table);

      if (table === "jobs") {
        return {
          select: vi.fn(() => makeSelectQuery(job).query),
          update: vi.fn((payload: Row) => {
            const filters: Array<[string, unknown]> = [];
            const chain: any = {
              eq: vi.fn((column: string, value: unknown) => {
                filters.push([column, value]);
                return chain;
              }),
              then: (resolve: (value: unknown) => void) => {
                jobUpdates.push({ payload, filters });
                resolve({ error: null });
              },
            };
            return chain;
          }),
        };
      }

      if (table === "locations") {
        return {
          select: vi.fn(() => makeSelectQuery(location).query),
          update: vi.fn(() => {
            forbiddenWrites.push({ table, method: "update" });
            return { eq: vi.fn(() => ({ error: null })) };
          }),
          insert: vi.fn(() => {
            forbiddenWrites.push({ table, method: "insert" });
            return { error: null };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Row) => {
            eventInserts.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }

      if (
        [
          "service_cases",
          "internal_invoices",
          "internal_invoice_payments",
          "internal_invoice_line_items",
          "contact_recipients",
        ].includes(table)
      ) {
        return {
          update: vi.fn(() => {
            forbiddenWrites.push({ table, method: "update" });
            return { eq: vi.fn(() => ({ error: null })) };
          }),
          insert: vi.fn(() => {
            forbiddenWrites.push({ table, method: "insert" });
            return { error: null };
          }),
          select: vi.fn(() => makeSelectQuery(null).query),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  createClientMock.mockResolvedValue(supabase);
  return { jobUpdates, eventInserts, touchedTables, forbiddenWrites };
}

async function invoke(locationId = "loc-2") {
  const { changeJobServiceLocationFromForm } = await import("@/lib/actions/job-actions");
  return changeJobServiceLocationFromForm(buildForm(locationId));
}

describe("changeJobServiceLocationFromForm", () => {
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
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("allows an internal same-account user to change a job to another saved location for the same customer", async () => {
    const fixture = makeFixture();

    await expect(invoke()).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=service_location_updated#job-location",
    );

    expect(fixture.jobUpdates).toHaveLength(1);
    expect(fixture.jobUpdates[0].payload).toMatchObject({ location_id: "loc-2" });
    expect(fixture.eventInserts).toHaveLength(1);
    expect(fixture.eventInserts[0]).toMatchObject({
      job_id: "job-1",
      event_type: "service_location_changed",
      user_id: "internal-user-1",
    });
    expect(fixture.eventInserts[0].meta).toMatchObject({
      previous_location_id: "loc-1",
      new_location_id: "loc-2",
      customer_id: "cust-1",
      service_case_id: "case-1",
    });
    expect(fixture.forbiddenWrites).toHaveLength(0);
  });

  it("denies a cross-account location before job or event writes", async () => {
    const fixture = makeFixture({ location: null });

    await expect(invoke()).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=service_location_change_invalid#job-location",
    );

    expect(fixture.jobUpdates).toHaveLength(0);
    expect(fixture.eventInserts).toHaveLength(0);
  });

  it("denies a different-customer location before job or event writes", async () => {
    const fixture = makeFixture({
      location: {
        id: "loc-2",
        customer_id: "cust-2",
        owner_user_id: "owner-1",
      },
    });

    await expect(invoke()).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=service_location_change_invalid#job-location",
    );

    expect(fixture.jobUpdates).toHaveLength(0);
    expect(fixture.eventInserts).toHaveLength(0);
  });

  it("no-ops safely when the selected location is already the job location", async () => {
    const fixture = makeFixture();

    await expect(invoke("loc-1")).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=service_location_already_selected#job-location",
    );

    expect(fixture.jobUpdates).toHaveLength(0);
    expect(fixture.eventInserts).toHaveLength(0);
  });

  it("does not mutate address, service case, invoice, billing, payment, or contact records", async () => {
    const fixture = makeFixture();

    await expect(invoke()).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=service_location_updated#job-location",
    );

    expect(fixture.touchedTables).not.toContain("service_cases");
    expect(fixture.touchedTables).not.toContain("internal_invoices");
    expect(fixture.touchedTables).not.toContain("internal_invoice_payments");
    expect(fixture.touchedTables).not.toContain("contact_recipients");
    expect(fixture.forbiddenWrites).toHaveLength(0);
  });
});

describe("job service location page wiring and intake guardrails", () => {
  const jobPageSource = readFileSync(
    path.join(process.cwd(), "app", "jobs", "[id]", "page.tsx"),
    "utf8",
  );
  const jobActionsSource = readFileSync(
    path.join(process.cwd(), "lib", "actions", "job-actions.ts"),
    "utf8",
  );
  const newJobPageSource = readFileSync(
    path.join(process.cwd(), "app", "jobs", "new", "page.tsx"),
    "utf8",
  );

  it("renders the compact Change Service Location flow near the job location card", () => {
    expect(jobPageSource).toContain("Change Service Location");
    expect(jobPageSource).toContain("Use this if the job was created for the wrong saved address.");
    expect(jobPageSource).toContain("Move this job to a different saved service location?");
    expect(jobPageSource).toContain("action={changeJobServiceLocationFromForm}");
    expect(jobPageSource).toContain("Service location updated for this job.");
  });

  it("keeps job intake reading saved customer locations and reusing duplicates", () => {
    expect(newJobPageSource).toContain('.from("locations")');
    expect(newJobPageSource).toContain('.eq("customer_id", customerId)');
    expect(newJobPageSource).toContain("locations={customerLocations}");
    expect(jobActionsSource).toContain("async function findReusableLocation(customerId: string)");
    expect(jobActionsSource).toContain("const reusableLocation = await findReusableLocation(existingCustomerId);");
  });

  it("documents job-only service case behavior in the action surface", () => {
    expect(jobActionsSource).toContain('event_type: "service_location_changed"');
    expect(jobActionsSource).toContain("service_case_id: String(job.service_case_id ?? \"\").trim() || null");
    expect(jobActionsSource).not.toContain('.from("service_cases")\n    .update');
  });
});
