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

type ClaimMode = "allow" | "already-owned" | "missing";

function makeAdminFixture(mode: ClaimMode) {
  const ownershipWrites: Array<Record<string, unknown>> = [];

  const allowPreflightRow = { id: "customer-1", owner_user_id: null };
  const alreadyOwnedPreflightRow = { id: "customer-1", owner_user_id: "owner-2" };

  const supabase = {
    from(table: string) {
      if (table !== "customers") throw new Error(`Unexpected admin table ${table}`);

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              if (mode === "missing") return { data: null, error: null };
              if (mode === "already-owned") {
                return { data: alreadyOwnedPreflightRow, error: null };
              }
              return { data: allowPreflightRow, error: null };
            }),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          ownershipWrites.push(payload);
          return {
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    if (mode !== "allow") return { data: null, error: null };
                    return {
                      data: { id: "customer-1", owner_user_id: String(payload.owner_user_id ?? "") },
                      error: null,
                    };
                  }),
                })),
              })),
            })),
          };
        }),
      };
    },
  };

  return { supabase, ownershipWrites };
}

describe("null-owner customer claim hardening", () => {
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
  });

  it("allows valid in-scope null-owner claim", async () => {
    const { supabase, ownershipWrites } = makeAdminFixture("allow");
    createAdminClientMock.mockReturnValue(supabase);

    const { claimNullOwnerCustomer } = await import("@/lib/actions/customer-actions");

    await expect(claimNullOwnerCustomer("customer-1", new FormData())).rejects.toThrow(
      "REDIRECT:/customers/customer-1/edit",
    );

    expect(ownershipWrites).toHaveLength(1);
    expect(ownershipWrites[0]).toMatchObject({ owner_user_id: "owner-1" });
  });

  it("denies claim when row is already owned before write", async () => {
    const { supabase, ownershipWrites } = makeAdminFixture("already-owned");
    createAdminClientMock.mockReturnValue(supabase);

    const { claimNullOwnerCustomer } = await import("@/lib/actions/customer-actions");

    await expect(claimNullOwnerCustomer("customer-1", new FormData())).rejects.toThrow(
      "REDIRECT:/customers/customer-1/edit?claimError=already_owned",
    );

    expect(ownershipWrites).toHaveLength(0);
  });

  it("denies claim when row is missing before write", async () => {
    const { supabase, ownershipWrites } = makeAdminFixture("missing");
    createAdminClientMock.mockReturnValue(supabase);

    const { claimNullOwnerCustomer } = await import("@/lib/actions/customer-actions");

    await expect(claimNullOwnerCustomer("customer-1", new FormData())).rejects.toThrow(
      "REDIRECT:/customers/customer-1/edit?claimError=row_not_found",
    );

    expect(ownershipWrites).toHaveLength(0);
  });
});
