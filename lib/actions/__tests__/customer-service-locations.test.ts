import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

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

type Row = Record<string, unknown>;

function buildForm(values: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("customer_id", values.customer_id ?? "cust-1");
  formData.set("nickname", values.nickname ?? "Main house");
  formData.set("label", values.label ?? "Front");
  formData.set("address_line1", values.address_line1 ?? "100 Main St");
  formData.set("address_line2", values.address_line2 ?? "Unit A");
  formData.set("city", values.city ?? "Stockton");
  formData.set("state", values.state ?? "CA");
  formData.set("zip", values.zip ?? "95202");
  formData.set("notes", values.notes ?? "Gate code");
  return formData;
}

function makeAdminFixture(options?: { existingLocations?: Row[] }) {
  const locationInserts: Row[] = [];
  const customerFilters: Array<[string, unknown]> = [];
  const locationLookupFilters: Array<[string, unknown]> = [];

  function makeReadQuery(table: string) {
    const filters: Array<[string, unknown]> = table === "customers" ? customerFilters : locationLookupFilters;
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "customers") return { data: { id: "cust-1" }, error: null };
        return { data: null, error: null };
      }),
      then: (resolve: (value: unknown) => void) => {
        if (table === "locations") {
          resolve({ data: options?.existingLocations ?? [], error: null });
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return query;
  }

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "customers") return makeReadQuery(table);
      if (table === "locations") {
        const readQuery = makeReadQuery(table);
        return {
          ...readQuery,
          insert: vi.fn((payload: Row) => {
            locationInserts.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "loc-new" }, error: null })),
              })),
            };
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  createAdminClientMock.mockReturnValue(admin);
  return { admin, customerFilters, locationLookupFilters, locationInserts };
}

describe("customer service location management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        id: "internal-1",
        account_owner_user_id: "owner-1",
      },
    });
    isInternalAccessErrorMock.mockReturnValue(false);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("adds a saved service location for a scoped customer", async () => {
    const fixture = makeAdminFixture();
    const { addCustomerServiceLocationFromForm } = await import("@/lib/actions/customer-actions");

    await expect(addCustomerServiceLocationFromForm(buildForm())).rejects.toThrow(
      "REDIRECT:/customers/cust-1?tab=locations-contacts&locSaved=created#location-contacts-loc-new",
    );

    expect(fixture.customerFilters).toEqual([
      ["id", "cust-1"],
      ["owner_user_id", "owner-1"],
    ]);
    expect(fixture.locationInserts).toHaveLength(1);
    expect(fixture.locationInserts[0]).toMatchObject({
      customer_id: "cust-1",
      owner_user_id: "owner-1",
      nickname: "Main house",
      label: "Front",
      address_line1: "100 Main St",
      address_line2: "Unit A",
      city: "Stockton",
      state: "CA",
      zip: "95202",
      postal_code: "95202",
      notes: "Gate code",
    });
  });

  it("reuses an existing customer location instead of creating a duplicate", async () => {
    const fixture = makeAdminFixture({
      existingLocations: [
        {
          id: "loc-existing",
          address_line1: " 100  Main St ",
          city: "Stockton",
          state: "CA",
          zip: "95202",
        },
      ],
    });
    const { addCustomerServiceLocationFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      addCustomerServiceLocationFromForm(buildForm({ address_line1: "100 Main St" })),
    ).rejects.toThrow(
      "REDIRECT:/customers/cust-1?tab=locations-contacts&locSaved=existing#location-contacts-loc-existing",
    );

    expect(fixture.locationInserts).toHaveLength(0);
  });

  it("requires complete service address fields before insert", async () => {
    const fixture = makeAdminFixture();
    const { addCustomerServiceLocationFromForm } = await import("@/lib/actions/customer-actions");

    await expect(addCustomerServiceLocationFromForm(buildForm({ zip: "" }))).rejects.toThrow(
      "Service address zip is required",
    );

    expect(fixture.locationInserts).toHaveLength(0);
  });
});

describe("customer service location page wiring", () => {
  const customerPageSource = readFileSync(
    path.join(process.cwd(), "app", "customers", "[id]", "page.tsx"),
    "utf8",
  );
  const newJobPageSource = readFileSync(
    path.join(process.cwd(), "app", "jobs", "new", "page.tsx"),
    "utf8",
  );
  const jobActionsSource = readFileSync(
    path.join(process.cwd(), "lib", "actions", "job-actions.ts"),
    "utf8",
  );

  it("shows the customer-level Service Locations section with add and edit actions", () => {
    expect(customerPageSource).toContain("Service Locations");
    expect(customerPageSource).toContain("No service locations saved yet.");
    expect(customerPageSource).toContain("action={addCustomerServiceLocationFromForm}");
    expect(customerPageSource).toContain("Add Location");
    expect(customerPageSource).toContain("action={updateLocationServiceAddressFromForm}");
    expect(customerPageSource).toContain("return_customer_id");
  });

  it("loads all saved customer locations for display and job intake", () => {
    expect(customerPageSource).toContain('.from("locations")');
    expect(customerPageSource).toContain('.eq("customer_id", customerId)');
    expect(newJobPageSource).toContain('.from("locations")');
    expect(newJobPageSource).toContain('.eq("customer_id", customerId)');
    expect(newJobPageSource).toContain("locations={customerLocations}");
  });

  it("keeps job intake duplicate location protection in place", () => {
    expect(jobActionsSource).toContain("async function findReusableLocation(customerId: string)");
    expect(jobActionsSource).toContain('.from("locations")');
    expect(jobActionsSource).toContain('.eq("customer_id", customerId)');
    expect(jobActionsSource).toContain("const reusableLocation = await findReusableLocation(existingCustomerId);");
  });
});
