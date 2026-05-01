import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

const ALLOW_PATH_REACHED = "ALLOW_PATH_REACHED";

type TargetAction =
  | "upsertCustomerProfileFromForm"
  | "archiveCustomerFromForm"
  | "updateCustomerNotesFromForm"
  | "claimNullOwnerCustomer";

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

function buildUpsertFormData() {
  const formData = new FormData();
  formData.set("customer_id", "customer-1");
  formData.set("first_name", "Pat");
  formData.set("last_name", "Tester");
  formData.set("phone", "555-0101");
  formData.set("email", "pat@example.com");
  return formData;
}

function buildArchiveFormData() {
  const formData = new FormData();
  formData.set("customer_id", "customer-1");
  return formData;
}

function buildNotesFormData() {
  const formData = new FormData();
  formData.set("customer_id", "customer-1");
  formData.set("notes", "Scoped customer notes");
  return formData;
}

const targets: Array<{ name: TargetAction; buildFormData: () => FormData }> = [
  {
    name: "upsertCustomerProfileFromForm",
    buildFormData: buildUpsertFormData,
  },
  {
    name: "archiveCustomerFromForm",
    buildFormData: buildArchiveFormData,
  },
  {
    name: "updateCustomerNotesFromForm",
    buildFormData: buildNotesFormData,
  },
  {
    name: "claimNullOwnerCustomer",
    buildFormData: () => new FormData(),
  },
];

function makeAllowFixtures(actionName: TargetAction) {
  const writes: string[] = [];
  const adminFromCalls: string[] = [];
  const sessionFromCalls: string[] = [];

  const claimUpdatePath = {
    maybeSingle: vi.fn(async () => {
      throw new Error(ALLOW_PATH_REACHED);
    }),
  };

  const updateEqResult: any = {
    is: vi.fn(() => ({
      select: vi.fn(() => claimUpdatePath),
    })),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.reject(new Error(ALLOW_PATH_REACHED)).then(onFulfilled, onRejected),
  };

  const admin = {
    from(table: string) {
      adminFromCalls.push(table);

      if (table !== "customers") {
        throw new Error(`UNEXPECTED_ADMIN_FROM:${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: "customer-1" }, error: null })),
            })),
            maybeSingle: vi.fn(async () => ({
              data: { id: "customer-1", owner_user_id: null },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => {
          writes.push("customers.update");
          return {
            eq: vi.fn(() => updateEqResult),
          };
        }),
      };
    },
  };

  const session = {
    from(table: string) {
      sessionFromCalls.push(table);

      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(async () => ({ count: 0, error: null })),
            })),
          })),
          update: vi.fn(() => {
            writes.push("jobs.update");
            throw new Error("UNEXPECTED_JOBS_UPDATE");
          }),
        };
      }

      if (table === "customers") {
        return {
          update: vi.fn(() => {
            writes.push("customers.session.update");
            return {
              eq: vi.fn(() => updateEqResult),
            };
          }),
        };
      }

      throw new Error(`UNEXPECTED_SESSION_FROM:${table}`);
    },
  };

  if (actionName === "upsertCustomerProfileFromForm") {
    // no-op; allow fixture already throws on first admin customer update
  }

  return { admin, session, writes, adminFromCalls, sessionFromCalls };
}

function makeBlockedFixtures() {
  const writes: string[] = [];
  const adminFromCalls: string[] = [];
  const sessionFromCalls: string[] = [];

  const blockedWriteResult: any = {
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.reject(new Error("UNEXPECTED_WRITE")).then(onFulfilled, onRejected),
    is: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => {
          throw new Error("UNEXPECTED_WRITE");
        }),
      })),
    })),
  };

  const admin = {
    from(table: string) {
      adminFromCalls.push(table);

      if (table !== "customers") {
        throw new Error(`UNEXPECTED_ADMIN_FROM:${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: "customer-1" }, error: null })),
            })),
            maybeSingle: vi.fn(async () => ({
              data: { id: "customer-1", owner_user_id: null },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => {
          writes.push("customers.update");
          return {
            eq: vi.fn(() => blockedWriteResult),
          };
        }),
      };
    },
  };

  const session = {
    from(table: string) {
      sessionFromCalls.push(table);

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
          update: vi.fn(() => {
            writes.push("customers.session.update");
            return {
              eq: vi.fn(() => blockedWriteResult),
            };
          }),
        };
      }

      throw new Error(`UNEXPECTED_SESSION_FROM:${table}`);
    },
  };

  return { admin, session, writes, adminFromCalls, sessionFromCalls };
}

async function invokeAction(actionName: TargetAction, formData: FormData) {
  const mod = await import("@/lib/actions/customer-actions");

  if (actionName === "claimNullOwnerCustomer") {
    return mod.claimNullOwnerCustomer("customer-1", formData);
  }

  return (mod as Record<Exclude<TargetAction, "claimNullOwnerCustomer">, (fd: FormData) => Promise<unknown>>)[
    actionName
  ](formData);
}

describe("customer profile entitlement hardening", () => {
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

    isInternalAccessErrorMock.mockReturnValue(false);

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  for (const { name, buildFormData } of targets) {
    it(`${name}: allows active entitlement`, async () => {
      const fixture = makeAllowFixtures(name);
      createClientMock.mockResolvedValue(fixture.session);
      createAdminClientMock.mockReturnValue(fixture.admin);

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(ALLOW_PATH_REACHED);

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(fixture.writes.length).toBeGreaterThan(0);
    });

    it(`${name}: allows valid trial entitlement`, async () => {
      const fixture = makeAllowFixtures(name);
      createClientMock.mockResolvedValue(fixture.session);
      createAdminClientMock.mockReturnValue(fixture.admin);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(ALLOW_PATH_REACHED);
      expect(fixture.writes.length).toBeGreaterThan(0);
    });

    it(`${name}: allows internal comped entitlement`, async () => {
      const fixture = makeAllowFixtures(name);
      createClientMock.mockResolvedValue(fixture.session);
      createAdminClientMock.mockReturnValue(fixture.admin);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      await expect(invokeAction(name, buildFormData())).rejects.toThrow(ALLOW_PATH_REACHED);
      expect(fixture.writes.length).toBeGreaterThan(0);
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
        const fixture = makeBlockedFixtures();
        createClientMock.mockResolvedValue(fixture.session);
        createAdminClientMock.mockReturnValue(fixture.admin);
        resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
          authorized: false,
          reason,
        });

        await expect(invokeAction(name, buildFormData())).rejects.toThrow(
          `REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=${reason}`,
        );

        expect(fixture.writes).toHaveLength(0);
        expect(revalidatePathMock).not.toHaveBeenCalled();

        if (name === "claimNullOwnerCustomer") {
          expect(fixture.adminFromCalls).toHaveLength(0);
          expect(fixture.sessionFromCalls).toHaveLength(0);
        } else {
          expect(fixture.adminFromCalls).toEqual(["customers"]);
          expect(fixture.sessionFromCalls).toHaveLength(0);
        }
      });
    }
  }
});
