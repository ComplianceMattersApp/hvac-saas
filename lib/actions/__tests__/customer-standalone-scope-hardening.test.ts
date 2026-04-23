import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
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
  isInternalAccessError: vi.fn(() => false),
}));

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function makeAdminScopeFixture(inScope: boolean) {
  return {
    from(table: string) {
      if (table !== "customers") throw new Error(`Unexpected admin table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: inScope ? { id: "customer-1" } : null,
                error: null,
              })),
            })),
          })),
        })),
      };
    },
  };
}

function makeSessionFixture() {
  const customerWrites: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(async () => ({ count: 0, error: null })),
            })),
          })),
        };
      }

      if (table === "customers") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            customerWrites.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, customerWrites };
}

describe("customer standalone same-account hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
  });

  it("denies cross-account internal archiveCustomerFromForm before customer write", async () => {
    const { supabase, customerWrites } = makeSessionFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminScopeFixture(false));

    const { archiveCustomerFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      archiveCustomerFromForm(
        buildFormData({
          customer_id: "customer-1",
        }),
      ),
    ).rejects.toThrow("Customer not found in internal account scope");

    expect(customerWrites).toHaveLength(0);
  });

  it("allows same-account internal archiveCustomerFromForm", async () => {
    const { supabase, customerWrites } = makeSessionFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminScopeFixture(true));

    const { archiveCustomerFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      archiveCustomerFromForm(
        buildFormData({
          customer_id: "customer-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/customers?saved=archived");

    expect(customerWrites).toHaveLength(1);
    expect(customerWrites[0]).toHaveProperty("deleted_at");
  });

  it("denies cross-account internal updateCustomerNotesFromForm before customer write", async () => {
    const { supabase, customerWrites } = makeSessionFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminScopeFixture(false));

    const { updateCustomerNotesFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      updateCustomerNotesFromForm(
        buildFormData({
          customer_id: "customer-1",
          notes: "Scoped note",
        }),
      ),
    ).rejects.toThrow("Customer not found in internal account scope");

    expect(customerWrites).toHaveLength(0);
  });

  it("allows same-account internal updateCustomerNotesFromForm", async () => {
    const { supabase, customerWrites } = makeSessionFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminScopeFixture(true));

    const { updateCustomerNotesFromForm } = await import("@/lib/actions/customer-actions");

    await expect(
      updateCustomerNotesFromForm(
        buildFormData({
          customer_id: "customer-1",
          notes: "Scoped note",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/customers/customer-1#customer-notes");

    expect(customerWrites).toHaveLength(1);
    expect(customerWrites[0]).toMatchObject({ notes: "Scoped note" });
  });
});
