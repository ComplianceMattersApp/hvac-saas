import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const revalidatePathMock = vi.fn();

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

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function makeAdminFixture(params: { inScope: boolean }) {
  const customerWrites: Array<Record<string, unknown>> = [];
  const jobSnapshotWrites: Array<Record<string, unknown>> = [];

  const admin = {
    from(table: string) {
      if (table === "customers") {
        let scopedCustomerId = "";
        let scopedOwnerUserId = "";

        const scopeQuery: any = {
          eq: vi.fn((column: string, value: unknown) => {
            if (column === "id") scopedCustomerId = String(value ?? "").trim();
            if (column === "owner_user_id") scopedOwnerUserId = String(value ?? "").trim();
            return scopeQuery;
          }),
          maybeSingle: vi.fn(async () => {
            if (params.inScope && scopedCustomerId === "customer-1" && scopedOwnerUserId === "owner-1") {
              return { data: { id: "customer-1" }, error: null };
            }
            return { data: null, error: null };
          }),
        };

        return {
          select: vi.fn(() => scopeQuery),
          update: vi.fn((payload: Record<string, unknown>) => {
            customerWrites.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === "jobs") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            jobSnapshotWrites.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    },
  };

  return { admin, customerWrites, jobSnapshotWrites };
}

describe("customer profile upsert same-account hardening", () => {
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
  });

  it("allows same-account internal upsertCustomerProfileFromForm and writes customer + jobs snapshots", async () => {
    const fixture = makeAdminFixture({ inScope: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { upsertCustomerProfileFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      upsertCustomerProfileFromForm(
        buildFormData({
          customer_id: "customer-1",
          first_name: "Pat",
          last_name: "Tester",
          phone: "555-0101",
          email: "pat@example.com",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/customers/customer-1/edit?saved=1");

    expect(fixture.customerWrites).toHaveLength(1);
    expect(fixture.jobSnapshotWrites).toHaveLength(1);
  });

  it("denies cross-account internal upsertCustomerProfileFromForm before customer and jobs snapshot writes", async () => {
    const fixture = makeAdminFixture({ inScope: false });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { upsertCustomerProfileFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      upsertCustomerProfileFromForm(
        buildFormData({
          customer_id: "customer-1",
          first_name: "Pat",
          last_name: "Tester",
        }),
      ),
    ).rejects.toThrow("Customer not found in internal account scope");

    expect(fixture.customerWrites).toHaveLength(0);
    expect(fixture.jobSnapshotWrites).toHaveLength(0);
  });

  it("denies non-internal upsertCustomerProfileFromForm before customer and jobs snapshot writes", async () => {
    const fixture = makeAdminFixture({ inScope: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const accessError = new Error("not internal");
    requireInternalUserMock.mockRejectedValue(accessError);
    isInternalAccessErrorMock.mockReturnValue(true);

    const { upsertCustomerProfileFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      upsertCustomerProfileFromForm(
        buildFormData({
          customer_id: "customer-1",
          first_name: "Pat",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/login");

    expect(fixture.customerWrites).toHaveLength(0);
    expect(fixture.jobSnapshotWrites).toHaveLength(0);
  });
});