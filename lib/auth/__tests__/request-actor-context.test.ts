import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const getInternalUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  getInternalUser: (...args: unknown[]) => getInternalUserMock(...args),
}));

function makeSupabaseFixture(input: {
  userId?: string | null;
  contractorId?: string | null;
  getUserError?: unknown;
}) {
  const auth = {
    getUser: vi.fn(async () => ({
      data: {
        user: input.userId ? { id: input.userId } : null,
      },
      error: input.getUserError ?? null,
    })),
  };

  const from = vi.fn((table: string) => {
    if (table !== "contractor_users") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: input.contractorId ? { contractor_id: input.contractorId } : null,
        error: null,
      })),
    };

    return query;
  });

  return {
    auth,
    from,
  };
}

describe("getRequestActorContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns unauthenticated when there is no auth user", async () => {
    const supabase = makeSupabaseFixture({ userId: null });
    createClientMock.mockResolvedValue(supabase);

    const { getRequestActorContext } = await import("@/lib/auth/request-actor-context");
    const context = await getRequestActorContext();

    expect(context.kind).toBe("unauthenticated");
    expect(context.user).toBeNull();
    expect(context.internalUser).toBeNull();
    expect(context.contractorId).toBeNull();
    expect(getInternalUserMock).not.toHaveBeenCalled();
  });

  it("returns unauthenticated when auth session is missing", async () => {
    const supabase = makeSupabaseFixture({
      userId: null,
      getUserError: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    createClientMock.mockResolvedValue(supabase);

    const { getRequestActorContext } = await import("@/lib/auth/request-actor-context");
    const context = await getRequestActorContext();

    expect(context.kind).toBe("unauthenticated");
    expect(context.user).toBeNull();
    expect(getInternalUserMock).not.toHaveBeenCalled();
  });

  it("returns contractor when contractor membership exists", async () => {
    const supabase = makeSupabaseFixture({ userId: "user-1", contractorId: "contractor-1" });
    createClientMock.mockResolvedValue(supabase);
    getInternalUserMock.mockResolvedValue({
      user_id: "user-1",
      role: "office",
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: null,
    });

    const { getRequestActorContext } = await import("@/lib/auth/request-actor-context");
    const context = await getRequestActorContext();

    expect(context.kind).toBe("contractor");
    expect(context.contractorId).toBe("contractor-1");
    expect(context.internalUser).toBeNull();
  });

  it("returns internal when user has active internal access and no contractor membership", async () => {
    const supabase = makeSupabaseFixture({ userId: "user-2", contractorId: null });
    createClientMock.mockResolvedValue(supabase);
    getInternalUserMock.mockResolvedValue({
      user_id: "user-2",
      role: "admin",
      is_active: true,
      account_owner_user_id: "owner-2",
      created_by: null,
    });

    const { getRequestActorContext } = await import("@/lib/auth/request-actor-context");
    const context = await getRequestActorContext();

    expect(context.kind).toBe("internal");
    expect(context.accountOwnerUserId).toBe("owner-2");
    expect(context.internalUser?.role).toBe("admin");
  });

  it("returns unauthorized when user is neither contractor nor active internal", async () => {
    const supabase = makeSupabaseFixture({ userId: "user-3", contractorId: null });
    createClientMock.mockResolvedValue(supabase);
    getInternalUserMock.mockResolvedValue(null);

    const { getRequestActorContext } = await import("@/lib/auth/request-actor-context");
    const context = await getRequestActorContext();

    expect(context.kind).toBe("unauthorized");
    expect(context.accountOwnerUserId).toBeNull();
  });

  it("returns consistent actor context across repeated calls", async () => {
    const supabase = makeSupabaseFixture({ userId: "user-4", contractorId: null });
    createClientMock.mockResolvedValue(supabase);
    getInternalUserMock.mockResolvedValue({
      user_id: "user-4",
      role: "office",
      is_active: true,
      account_owner_user_id: "owner-4",
      created_by: null,
    });

    const { getRequestActorContext } = await import("@/lib/auth/request-actor-context");
    const first = await getRequestActorContext();
    const second = await getRequestActorContext();

    expect(first).toStrictEqual(second);
    expect(first.kind).toBe("internal");
    expect(second.kind).toBe("internal");
  });
});