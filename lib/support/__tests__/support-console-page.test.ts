import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const getSupportConsoleSnapshotMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/link", () => ({
  default: (props: Record<string, unknown>) => props,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  isInternalAccessError: () => false,
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/support/support-console", () => ({
  getSupportConsoleSnapshot: (...args: unknown[]) => getSupportConsoleSnapshotMock(...args),
}));

vi.mock("@/lib/actions/support-console-actions", () => ({
  startSupportSessionFromForm: vi.fn(),
  endSupportSessionFromForm: vi.fn(),
}));

describe("support console page exposure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ENABLE_SUPPORT_CONSOLE;

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "admin-1" } } })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
        })),
      })),
    });

    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "admin-1",
        role: "admin",
        is_active: true,
      },
    });

    getSupportConsoleSnapshotMock.mockResolvedValue({
      operator: {
        authUserId: "admin-1",
        supportUserId: null,
        displayName: null,
        isSupportUserActive: false,
      },
      accountOwnerUserId: "owner-1",
      grant: null,
      session: null,
      recentAuditEvents: [],
    });
  });

  it("redirects admin away when feature flag is disabled", async () => {
    const pageModule = await import("@/app/ops/admin/users/support/page");

    await expect(
      pageModule.default({
        searchParams: Promise.resolve({ account_owner_user_id: "owner-1" }),
      }),
    ).rejects.toThrow("REDIRECT:/ops/admin/users?notice=support_console_unavailable");

    expect(getSupportConsoleSnapshotMock).not.toHaveBeenCalled();
  });

  it("loads for admin when feature flag is enabled", async () => {
    process.env.ENABLE_SUPPORT_CONSOLE = "true";
    const pageModule = await import("@/app/ops/admin/users/support/page");

    const result = await pageModule.default({
      searchParams: Promise.resolve({ account_owner_user_id: "owner-1" }),
    });

    expect(result).toBeTruthy();
    expect(getSupportConsoleSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        accountOwnerUserId: "owner-1",
      }),
    );
  });
});
