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

function makeAdminClientFixture(options?: { customerInScope?: boolean }) {
  const customerInScope = options?.customerInScope ?? true;

  return {
    from(table: string) {
      if (table !== "customers") {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: customerInScope ? { id: "cust-1" } : null,
                error: null,
              })),
            })),
          })),
        })),
      };
    },
  };
}

function makeSessionClientFixture() {
  const fromCalls: string[] = [];
  const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];

  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      if (table === "contact_recipients") {
        return {
          insert(values: Record<string, unknown>) {
            insertCalls.push({ table, values });
            return Promise.resolve({ error: null });
          },
        };
      }

      return {
        insert: vi.fn(async () => ({ error: null })),
      };
    },
  };

  return { supabase, fromCalls, insertCalls };
}

function makeFormData(overrides?: Record<string, string>) {
  const form = new FormData();
  form.set("customer_id", "11111111-1111-4111-8111-111111111111");
  form.set("recipient_role", "homeowner");
  form.set("display_name", "Jane Role Contact");
  form.set("phone", "(555) 123-4567");
  form.set("email", "jane@example.com");
  form.set("preferred_contact_method", "phone");

  Object.entries(overrides ?? {}).forEach(([key, value]) => {
    form.set(key, value);
  });

  return form;
}

describe("addCustomerRoleContactFromForm", () => {
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
    isInternalAccessErrorMock.mockReturnValue(false);
  });

  it("internal user can create a customer-linked role contact in same account", async () => {
    const { supabase, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClientFixture({ customerInScope: true }));

    const { addCustomerRoleContactFromForm } = await import("@/lib/actions/contact-recipient-actions");

    await expect(addCustomerRoleContactFromForm(makeFormData())).rejects.toThrow(
      "REDIRECT:/customers/11111111-1111-4111-8111-111111111111?rcSaved=1#role-contacts",
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      account_owner_user_id: "owner-1",
      linked_entity_type: "customer",
      linked_entity_id: "11111111-1111-4111-8111-111111111111",
      recipient_role: "homeowner",
      display_name: "Jane Role Contact",
      phone_e164: "+15551234567",
      phone_last10: "5551234567",
      email: "jane@example.com",
      preferred_contact_method: "phone",
      source_type: "manual",
      created_by_user_id: "internal-user-1",
      updated_by_user_id: "internal-user-1",
      status: "active",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/customers/11111111-1111-4111-8111-111111111111",
    );
  });

  it("rejects out-of-account customer before insert", async () => {
    const { supabase, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClientFixture({ customerInScope: false }));

    const { addCustomerRoleContactFromForm } = await import("@/lib/actions/contact-recipient-actions");

    await expect(addCustomerRoleContactFromForm(makeFormData())).rejects.toThrow(
      "REDIRECT:/customers/11111111-1111-4111-8111-111111111111?rcError=1#role-contacts",
    );

    expect(insertCalls).toHaveLength(0);
  });

  it("denies contractor or portal user via internal guard", async () => {
    const { supabase, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClientFixture({ customerInScope: true }));
    requireInternalUserMock.mockRejectedValueOnce({ code: "INTERNAL_USER_REQUIRED" });
    isInternalAccessErrorMock.mockReturnValueOnce(true);

    const { addCustomerRoleContactFromForm } = await import("@/lib/actions/contact-recipient-actions");

    await expect(addCustomerRoleContactFromForm(makeFormData())).rejects.toThrow("REDIRECT:/login");
    expect(insertCalls).toHaveLength(0);
  });

  it("resolves account owner server-side and ignores form spoofing", async () => {
    const { supabase, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClientFixture({ customerInScope: true }));

    const { addCustomerRoleContactFromForm } = await import("@/lib/actions/contact-recipient-actions");
    const formData = makeFormData({ account_owner_user_id: "spoof-owner" });

    await expect(addCustomerRoleContactFromForm(formData)).rejects.toThrow(
      "REDIRECT:/customers/11111111-1111-4111-8111-111111111111?rcSaved=1#role-contacts",
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values.account_owner_user_id).toBe("owner-1");
  });

  it("rejects invalid role", async () => {
    const { supabase, insertCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClientFixture({ customerInScope: true }));

    const { addCustomerRoleContactFromForm } = await import("@/lib/actions/contact-recipient-actions");

    await expect(
      addCustomerRoleContactFromForm(makeFormData({ recipient_role: "site_access_contact" })),
    ).rejects.toThrow(
      "REDIRECT:/customers/11111111-1111-4111-8111-111111111111?rcError=1#role-contacts",
    );

    expect(insertCalls).toHaveLength(0);
  });

  it("does not mutate customer or job source-of-truth fields", async () => {
    const { supabase, fromCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClientFixture({ customerInScope: true }));

    const { addCustomerRoleContactFromForm } = await import("@/lib/actions/contact-recipient-actions");

    await expect(addCustomerRoleContactFromForm(makeFormData())).rejects.toThrow(
      "REDIRECT:/customers/11111111-1111-4111-8111-111111111111?rcSaved=1#role-contacts",
    );

    expect(fromCalls).toEqual(["contact_recipients"]);
    expect(fromCalls).not.toContain("customers");
    expect(fromCalls).not.toContain("jobs");
  });

  it("does not call sms or email side-effect paths", async () => {
    const { supabase, fromCalls } = makeSessionClientFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminClientFixture({ customerInScope: true }));

    const { addCustomerRoleContactFromForm } = await import("@/lib/actions/contact-recipient-actions");

    await expect(addCustomerRoleContactFromForm(makeFormData())).rejects.toThrow(
      "REDIRECT:/customers/11111111-1111-4111-8111-111111111111?rcSaved=1#role-contacts",
    );

    expect(fromCalls.some((table) => /sms|email|push|notification/i.test(table))).toBe(false);
  });
});
