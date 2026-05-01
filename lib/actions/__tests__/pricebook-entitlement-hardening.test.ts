import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

type TargetAction =
  | "createPricebookItemFromForm"
  | "updatePricebookItemFromForm"
  | "setPricebookItemActiveFromForm";

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
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeCreateFormData() {
  const formData = new FormData();
  formData.set("item_name", "Combustion Analysis");
  formData.set("item_type", "service");
  formData.set("default_unit_price", "199.99");
  formData.set("category", "Compliance");
  formData.set("default_description", "Annual combustion analysis");
  formData.set("unit_label", "each");
  return formData;
}

function makeUpdateFormData() {
  const formData = makeCreateFormData();
  formData.set("item_id", "pricebook-1");
  formData.set("item_name", "Updated Analysis");
  return formData;
}

function makeSetActiveFormData() {
  const formData = new FormData();
  formData.set("item_id", "pricebook-1");
  formData.set("is_active", "1");
  return formData;
}

const targets: Array<{ name: TargetAction; buildFormData: () => FormData; successRedirect: string }> = [
  {
    name: "createPricebookItemFromForm",
    buildFormData: makeCreateFormData,
    successRedirect: "REDIRECT:/ops/admin/pricebook?notice=created",
  },
  {
    name: "updatePricebookItemFromForm",
    buildFormData: makeUpdateFormData,
    successRedirect: "REDIRECT:/ops/admin/pricebook?notice=updated",
  },
  {
    name: "setPricebookItemActiveFromForm",
    buildFormData: makeSetActiveFormData,
    successRedirect: "REDIRECT:/ops/admin/pricebook?notice=status_updated",
  },
];

function makeFixture() {
  const operations: string[] = [];
  const insertPayloads: Array<Record<string, unknown>> = [];
  const updatePayloads: Array<Record<string, unknown>> = [];
  const maybeSingleLookups: string[] = [];

  const supabase = {
    from(table: string) {
      if (table !== "pricebook_items") {
        throw new Error(`UNEXPECTED_TABLE:${table}`);
      }

      return {
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          operations.push("insert");
          insertPayloads.push(payload);
          return { error: null };
        }),
        select: vi.fn(() => ({
          eq: vi.fn((column: string, value: unknown) => ({
            eq: vi.fn((ownerColumn: string, ownerValue: unknown) => ({
              maybeSingle: vi.fn(async () => {
                operations.push("lookup");
                maybeSingleLookups.push(`${column}:${String(value)}|${ownerColumn}:${String(ownerValue)}`);
                return {
                  data: { id: "pricebook-1" },
                  error: null,
                };
              }),
            })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          operations.push("update");
          updatePayloads.push(payload);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }),
      };
    },
  };

  return { supabase, operations, insertPayloads, updatePayloads, maybeSingleLookups };
}

async function invokeAction(actionName: TargetAction, formData: FormData) {
  const mod = await import("@/lib/actions/pricebook-actions");
  return (mod as Record<TargetAction, (fd: FormData) => Promise<unknown>>)[actionName](formData);
}

describe("pricebook entitlement hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalRoleMock.mockImplementation(async () => {
      return {
        internalUser: {
          user_id: "admin-user-1",
          role: "admin",
          is_active: true,
          account_owner_user_id: "owner-1",
        },
      };
    });

    resolveOperationalMutationEntitlementAccessMock.mockImplementation(async () => {
      return {
        authorized: true,
        reason: "allowed_active",
      };
    });
  });

  for (const { name, buildFormData, successRedirect } of targets) {
    it(`${name}: allows active entitlement`, async () => {
      const fixture = makeFixture();
      createClientMock.mockResolvedValue(fixture.supabase);

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(successRedirect);

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );

      if (name === "createPricebookItemFromForm") {
        expect(fixture.operations).toEqual(["insert"]);
      } else {
        expect(fixture.operations).toEqual(["lookup", "update"]);
      }

      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it(`${name}: allows valid trial entitlement`, async () => {
      const fixture = makeFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(successRedirect);
    });

    it(`${name}: allows internal comped entitlement`, async () => {
      const fixture = makeFixture();
      createClientMock.mockResolvedValue(fixture.supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(successRedirect);
    });
  }

  const blockedReasons = [
    "blocked_trial_expired",
    "blocked_trial_missing_end",
    "blocked_missing_entitlement",
  ] as const;

  for (const reason of blockedReasons) {
    for (const { name, buildFormData } of targets) {
      it(`${name}: blocks ${reason} before writes and side effects`, async () => {
        const fixture = makeFixture();
        createClientMock.mockResolvedValue(fixture.supabase);
        resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
          authorized: false,
          reason,
        });

        await expect(invokeAction(name, buildFormData())).rejects.toThrow(
          `REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=${reason}`,
        );

        if (name === "createPricebookItemFromForm") {
          expect(fixture.operations).toEqual([]);
        } else {
          expect(fixture.operations).toEqual(["lookup"]);
        }

        expect(fixture.insertPayloads).toHaveLength(0);
        expect(fixture.updatePayloads).toHaveLength(0);
        expect(revalidatePathMock).not.toHaveBeenCalled();
      });
    }
  }
});