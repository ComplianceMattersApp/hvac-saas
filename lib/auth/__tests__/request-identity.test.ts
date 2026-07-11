import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

// Keep entitlement resolution off the network; identity dedup is what we assert.
vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: vi.fn(async () => ({
    authorized: true,
    reason: "allowed_active",
  })),
}));

function makeSupabaseFixture(input: {
  userId?: string | null;
  getUserError?: unknown;
  internalRow?: Record<string, unknown> | null;
}) {
  const getUser = vi.fn(async () => ({
    data: { user: input.userId ? { id: input.userId, email: `${input.userId}@example.com` } : null },
    error: input.getUserError ?? null,
  }));

  const from = vi.fn((table: string) => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      limit: vi.fn(async () => {
        // portal membership reads resolve to "no portal"
        return { data: [], error: null };
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "internal_users") {
          return { data: input.internalRow ?? null, error: null };
        }
        return { data: null, error: null };
      }),
    };
    return query;
  });

  return { auth: { getUser }, from };
}

describe("getRequestUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createAdminClientMock.mockReturnValue(makeSupabaseFixture({ userId: null }));
  });

  it("returns the authenticated user", async () => {
    const supabase = makeSupabaseFixture({ userId: "user-1" });
    createClientMock.mockResolvedValue(supabase);

    const { getRequestUser } = await import("@/lib/auth/request-identity");
    const user = await getRequestUser();

    expect(user?.id).toBe("user-1");
  });

  it("returns the same user object across repeated calls in one request", async () => {
    const supabase = makeSupabaseFixture({ userId: "user-1" });
    createClientMock.mockResolvedValue(supabase);

    const { getRequestUser } = await import("@/lib/auth/request-identity");
    const first = await getRequestUser();
    const second = await getRequestUser();

    expect(first).toStrictEqual(second);
    expect(first?.id).toBe("user-1");
  });

  it("returns null (not throw) on a session-invalid error", async () => {
    const supabase = makeSupabaseFixture({
      userId: null,
      getUserError: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    createClientMock.mockResolvedValue(supabase);

    const { getRequestUser } = await import("@/lib/auth/request-identity");
    await expect(getRequestUser()).resolves.toBeNull();
  });

  it("re-throws a non-session-invalid auth error (does not mask it as a logout)", async () => {
    const supabase = makeSupabaseFixture({
      userId: null,
      getUserError: { name: "FetchError", message: "network down", status: 503 },
    });
    createClientMock.mockResolvedValue(supabase);

    const { getRequestUser } = await import("@/lib/auth/request-identity");
    await expect(getRequestUser()).rejects.toMatchObject({ message: "network down" });
  });
});

describe("getRequestDualContextAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createAdminClientMock.mockReturnValue(makeSupabaseFixture({ userId: null }));
  });

  it("resolves identity via the shared getRequestUser without a second getUser round-trip", async () => {
    const supabase = makeSupabaseFixture({
      userId: "user-9",
      internalRow: {
        user_id: "user-9",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-9",
        created_by: null,
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const { getRequestDualContextAccess } = await import("@/lib/auth/request-identity");
    const access = await getRequestDualContextAccess();

    expect(access.user?.id).toBe("user-9");
    expect(access.hasActiveAppAccess).toBe(true);
    // The user was resolved once (by getRequestUser) and passed into
    // resolveDualContextAccess, so the dual-context chain must NOT re-fetch it.
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });
});
