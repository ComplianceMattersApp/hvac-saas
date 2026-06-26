import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const revalidatePathMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
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
  isInternalAccessError: (...args: unknown[]) => isInternalAccessErrorMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

type TableWrite = Record<string, unknown>;

function makeAdminFixture() {
  const customerInserts: TableWrite[] = [];
  const locationInserts: TableWrite[] = [];
  const sideEffectWrites: Array<{ table: string; payload: TableWrite }> = [];
  const forbiddenSideEffectTables = new Set([
    "jobs",
    "contractor_intake_submissions",
    "service_cases",
    "job_events",
    "notifications",
    "estimates",
    "invoices",
    "internal_invoices",
    "payments",
  ]);

  const admin = {
    from(table: string) {
      if (forbiddenSideEffectTables.has(table)) {
        return {
          insert: vi.fn((payload: TableWrite) => {
            sideEffectWrites.push({ table, payload });
            return Promise.resolve({ data: null, error: null });
          }),
          update: vi.fn((payload: TableWrite) => {
            sideEffectWrites.push({ table, payload });
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === "customers") {
        return {
          insert: vi.fn((payload: TableWrite) => {
            customerInserts.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "new-customer-1" },
                  error: null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "locations") {
        return {
          insert: vi.fn((payload: TableWrite) => {
            locationInserts.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    },
  };

  return { admin, customerInserts, locationInserts, sideEffectWrites };
}

describe("createCustomerOnlyFromForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    isInternalAccessErrorMock.mockReturnValue(false);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("creates a customer without a location when no address is provided", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { createCustomerOnlyFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      createCustomerOnlyFromForm(
        buildFormData({
          first_name: "Jane",
          last_name: "Smith",
          phone: "2135550100",
          email: "jane@example.com",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/customers/new-customer-1?created=1");

    expect(fixture.customerInserts).toHaveLength(1);
    expect(fixture.customerInserts[0]).toMatchObject({
      first_name: "Jane",
      last_name: "Smith",
      phone: "2135550100",
      email: "jane@example.com",
      owner_user_id: "owner-1",
    });
    // No location when address fields are absent
    expect(fixture.locationInserts).toHaveLength(0);
    expect(fixture.sideEffectWrites).toHaveLength(0);
  });

  it("creates a customer AND a primary service location when address fields are provided", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { createCustomerOnlyFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      createCustomerOnlyFromForm(
        buildFormData({
          first_name: "Bob",
          last_name: "Jones",
          phone: "3105550199",
          address_line1: "123 Main St",
          city: "Los Angeles",
          state: "CA",
          zip: "90001",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/customers/new-customer-1?created=1");

    expect(fixture.customerInserts).toHaveLength(1);
    expect(fixture.locationInserts).toHaveLength(1);
    expect(fixture.locationInserts[0]).toMatchObject({
      customer_id: "new-customer-1",
      address_line1: "123 Main St",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
      postal_code: "90001",
      owner_user_id: "owner-1",
    });
    expect(fixture.sideEffectWrites).toHaveLength(0);
  });

  it("does NOT create a location when address_line1 is provided but city or zip is missing", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { createCustomerOnlyFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      createCustomerOnlyFromForm(
        buildFormData({
          first_name: "Sam",
          last_name: "Lee",
          address_line1: "456 Oak Ave",
          city: "Burbank",
          // zip intentionally omitted
        }),
      ),
    ).rejects.toThrow("REDIRECT:/customers/new-customer-1?created=1");

    expect(fixture.customerInserts).toHaveLength(1);
    expect(fixture.locationInserts).toHaveLength(0);
    expect(fixture.sideEffectWrites).toHaveLength(0);
  });

  it("throws when neither first_name nor last_name is provided", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { createCustomerOnlyFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      createCustomerOnlyFromForm(buildFormData({ phone: "3105559999" })),
    ).rejects.toThrow("At least a first name or last name is required.");

    expect(fixture.customerInserts).toHaveLength(0);
    expect(fixture.sideEffectWrites).toHaveLength(0);
  });

  it("redirects to /login when the caller is not an internal user", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const accessError = new Error("not internal");
    requireInternalUserMock.mockRejectedValue(accessError);
    isInternalAccessErrorMock.mockReturnValue(true);

    const { createCustomerOnlyFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      createCustomerOnlyFromForm(buildFormData({ first_name: "Eve" })),
    ).rejects.toThrow("REDIRECT:/login");

    expect(fixture.customerInserts).toHaveLength(0);
    expect(fixture.sideEffectWrites).toHaveLength(0);
  });

  it("respects account scoping: owner_user_id matches internalUser.account_owner_user_id", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "tech-user-99",
        role: "tech",
        is_active: true,
        account_owner_user_id: "owner-99",
      },
    });

    const { createCustomerOnlyFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      createCustomerOnlyFromForm(buildFormData({ first_name: "Test", last_name: "Scope" })),
    ).rejects.toThrow("REDIRECT:/customers/new-customer-1?created=1");

    expect(fixture.customerInserts[0]).toMatchObject({ owner_user_id: "owner-99" });
    expect(fixture.sideEffectWrites).toHaveLength(0);
  });
});
