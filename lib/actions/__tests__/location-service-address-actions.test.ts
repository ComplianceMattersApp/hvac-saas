import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const revalidatePathMock = vi.fn();
const locationPageSource = readFileSync(
  resolve(__dirname, "../../../app/locations/[id]/page.tsx"),
  "utf8",
);
const customerActionsSource = readFileSync(
  resolve(__dirname, "../customer-actions.ts"),
  "utf8",
);

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  isInternalAccessError: () => false,
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

type Row = Record<string, unknown>;

function buildForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("location_id", overrides.location_id ?? "loc-1");
  formData.set("nickname", overrides.nickname ?? "Warehouse");
  formData.set("label", overrides.label ?? "Back shop");
  formData.set("address_line1", overrides.address_line1 ?? "200 New Main St");
  formData.set("address_line2", overrides.address_line2 ?? "Suite 4");
  formData.set("city", overrides.city ?? "Lodi");
  formData.set("state", overrides.state ?? "CA");
  formData.set("zip", overrides.zip ?? "95240");
  formData.set("notes", overrides.notes ?? "Gate code changed");
  return formData;
}

function buildFixture(options?: {
  location?: Row | null;
  customer?: Row | null;
  accountOwnerUserId?: string;
}) {
  const updates: Array<{ table: string; payload: Row; filters: Array<[string, unknown]> }> = [];
  const location = options?.location ?? {
    id: "loc-1",
    customer_id: "cust-1",
    owner_user_id: "owner-1",
    nickname: "Old",
    label: "Old label",
    address_line1: "100 Main St",
    address_line2: "Unit A",
    city: "Stockton",
    state: "CA",
    zip: "95202",
    postal_code: "95202",
    notes: "Old notes",
  };
  const customer = options?.customer ?? {
    id: "cust-1",
    owner_user_id: "owner-1",
    billing_address_line1: null,
    billing_address_line2: null,
    billing_city: null,
    billing_state: null,
    billing_zip: null,
  };

  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    let mode: "read" | "update" = "read";
    let updatePayload: Row | null = null;

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      update: vi.fn((payload: Row) => {
        mode = "update";
        updatePayload = payload;
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "locations") {
          return { data: location, error: null };
        }
        if (table === "customers") {
          return { data: customer, error: null };
        }
        return { data: null, error: null };
      }),
      then: (resolve: (value: unknown) => void) => {
        if (mode === "update" && updatePayload) {
          updates.push({ table, payload: updatePayload, filters });
        }
        resolve({ error: null });
      },
    };

    return query;
  }

  const admin = {
    from: vi.fn((table: string) => makeQuery(table)),
  };

  createClientMock.mockResolvedValue({});
  createAdminClientMock.mockReturnValue(admin);
  requireInternalUserMock.mockResolvedValue({
    internalUser: {
      id: "internal-1",
      account_owner_user_id: options?.accountOwnerUserId ?? "owner-1",
    },
  });

  return { updates, admin };
}

describe("location service address actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates saved service address fields for an internal account user", async () => {
    const { updates } = buildFixture();
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");

    await expect(updateLocationServiceAddressFromForm(buildForm())).rejects.toThrow(
      "REDIRECT:/locations/loc-1?saved=service_address",
    );

    const locationUpdate = updates.find((update) => update.table === "locations");
    expect(locationUpdate?.payload).toMatchObject({
      nickname: "Warehouse",
      label: "Back shop",
      address_line1: "200 New Main St",
      address_line2: "Suite 4",
      city: "Lodi",
      state: "CA",
      zip: "95240",
      postal_code: "95240",
      notes: "Gate code changed",
    });
  });

  it("blocks cross-account location updates", async () => {
    const { updates } = buildFixture({
      location: {
        id: "loc-1",
        customer_id: "cust-1",
        owner_user_id: "owner-2",
      },
    });
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");

    await expect(updateLocationServiceAddressFromForm(buildForm())).rejects.toThrow(
      "Location not found in internal account scope",
    );

    expect(updates).toHaveLength(0);
  });

  it("requires core service address fields", async () => {
    const { updates } = buildFixture();
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");

    await expect(
      updateLocationServiceAddressFromForm(buildForm({ city: "" })),
    ).rejects.toThrow("Service address city is required");

    expect(updates).toHaveLength(0);
  });

  it("syncs blank customer billing address to the corrected service address", async () => {
    const { updates } = buildFixture();
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");

    await expect(updateLocationServiceAddressFromForm(buildForm())).rejects.toThrow(
      "REDIRECT:/locations/loc-1?saved=service_address",
    );

    const customerUpdate = updates.find((update) => update.table === "customers");
    expect(customerUpdate?.payload).toMatchObject({
      billing_address_line1: "200 New Main St",
      billing_address_line2: "Suite 4",
      billing_city: "Lodi",
      billing_state: "CA",
      billing_zip: "95240",
    });
  });

  it("syncs customer billing address when it matches the old service address", async () => {
    const { updates } = buildFixture({
      customer: {
        id: "cust-1",
        owner_user_id: "owner-1",
        billing_address_line1: "100 Main St",
        billing_address_line2: "Unit A",
        billing_city: "Stockton",
        billing_state: "CA",
        billing_zip: "95202",
      },
    });
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");

    await expect(updateLocationServiceAddressFromForm(buildForm())).rejects.toThrow(
      "REDIRECT:/locations/loc-1?saved=service_address",
    );

    const customerUpdate = updates.find((update) => update.table === "customers");
    expect(customerUpdate?.payload).toMatchObject({
      billing_address_line1: "200 New Main St",
      billing_city: "Lodi",
      billing_state: "CA",
      billing_zip: "95240",
    });
  });

  it("does not overwrite intentionally different customer billing address", async () => {
    const { updates } = buildFixture({
      customer: {
        id: "cust-1",
        owner_user_id: "owner-1",
        billing_address_line1: "PO Box 9",
        billing_address_line2: null,
        billing_city: "Modesto",
        billing_state: "CA",
        billing_zip: "95350",
      },
    });
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");

    await expect(updateLocationServiceAddressFromForm(buildForm())).rejects.toThrow(
      "REDIRECT:/locations/loc-1?saved=service_address",
    );

    expect(updates.some((update) => update.table === "customers")).toBe(false);
  });

  it("does not bulk-rewrite job snapshots when correcting a saved location", async () => {
    const { updates } = buildFixture();
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");

    await expect(updateLocationServiceAddressFromForm(buildForm())).rejects.toThrow(
      "REDIRECT:/locations/loc-1?saved=service_address",
    );

    expect(updates.some((update) => update.table === "jobs")).toBe(false);
  });

  it("can return to the customer service locations workspace after inline customer-page edits", async () => {
    buildFixture();
    const { updateLocationServiceAddressFromForm } = await import("../../../app/locations/[id]/notes-actions");
    const formData = buildForm({ location_id: "loc-1" });
    formData.set("return_customer_id", "cust-1");

    await expect(updateLocationServiceAddressFromForm(formData)).rejects.toThrow(
      "REDIRECT:/customers/cust-1?tab=locations-contacts&locSaved=updated#location-contacts-loc-1",
    );
  });

  it("preserves the notes-only update path with account scoping", async () => {
    const { updates } = buildFixture();
    const { updateLocationNotesFromForm } = await import("../../../app/locations/[id]/notes-actions");
    const formData = new FormData();
    formData.set("location_id", "loc-1");
    formData.set("notes", "Only notes changed");

    await expect(updateLocationNotesFromForm(formData)).rejects.toThrow(
      "REDIRECT:/locations/loc-1",
    );

    expect(updates).toEqual([
      {
        table: "locations",
        payload: { notes: "Only notes changed" },
        filters: [["id", "loc-1"]],
      },
    ]);
  });
});

describe("location service address page wiring", () => {
  it("renders the service address edit form with safe historical-truth copy", () => {
    expect(locationPageSource).toContain("Edit Service Address");
    expect(locationPageSource).toContain("Save Service Address");
    expect(locationPageSource).toContain("This is where jobs at this location take place.");
    expect(locationPageSource).toContain(
      "If this customer does not have a separate billing address, their billing address will stay aligned with this service address.",
    );
    expect(locationPageSource).toContain(
      "This saved service address is used by existing jobs. Correcting it updates the saved customer location and future job creation. Completed job snapshots are not bulk-rewritten.",
    );
    expect(locationPageSource).toContain("action={updateLocationServiceAddressFromForm}");
    expect(locationPageSource).toContain('name="address_line1"');
    expect(locationPageSource).toContain('name="address_line2"');
    expect(locationPageSource).toContain('name="city"');
    expect(locationPageSource).toContain('name="state"');
    expect(locationPageSource).toContain('name="zip"');
    expect(locationPageSource).toContain('name="notes"');
  });

  it("keeps customer profile edits from mutating saved service location address fields", () => {
    const customerProfileSlice =
      customerActionsSource.match(
        /export async function upsertCustomerProfileFromForm[\s\S]*?export async function archiveCustomerFromForm/,
      )?.[0] ?? "";

    expect(customerProfileSlice).toContain('.from("customers")');
    expect(customerProfileSlice).toContain('.from("jobs")');
    expect(customerProfileSlice).not.toContain('.from("locations")');
    expect(customerProfileSlice).not.toContain("location_id");
    expect(customerProfileSlice).not.toContain("postal_code");
  });
});
