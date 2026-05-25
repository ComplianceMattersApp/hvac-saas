import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

function makeSupabaseFixture(input: {
  authUserId?: string | null;
  internalUserRole?: string | null;
  isActive?: boolean;
  accountOwnerUserId?: string | null;
}) {
  const authUserId = String(input.authUserId ?? "").trim();
  const internalUserRole = String(input.internalUserRole ?? "").trim();

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: authUserId ? { id: authUserId } : null,
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "internal_users") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: authUserId && internalUserRole
            ? {
                user_id: authUserId,
                role: internalUserRole,
                is_active: input.isActive ?? true,
                account_owner_user_id: input.accountOwnerUserId ?? "owner-1",
                created_by: null,
              }
            : null,
          error: null,
        })),
      };

      return query;
    }),
  };
}

describe("internal-user billing role support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("parses billing as a valid internal role", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseFixture({
        authUserId: "billing-1",
        internalUserRole: "billing",
        isActive: true,
        accountOwnerUserId: "owner-1",
      }),
    );

    const { getInternalUser } = await import("@/lib/auth/internal-user");
    const result = await getInternalUser();

    expect(result).toEqual(
      expect.objectContaining({
        user_id: "billing-1",
        role: "billing",
        is_active: true,
        account_owner_user_id: "owner-1",
      }),
    );
  });

  it("keeps admin-only role checks blocking billing actors", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseFixture({
        authUserId: "billing-1",
        internalUserRole: "billing",
        isActive: true,
        accountOwnerUserId: "owner-1",
      }),
    );

    const { requireInternalRole } = await import("@/lib/auth/internal-user");

    await expect(requireInternalRole("admin")).rejects.toMatchObject({
      name: "InternalAccessError",
      code: "INTERNAL_ROLE_REQUIRED",
    });
  });
});
