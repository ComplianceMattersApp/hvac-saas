import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const startReadOnlySupportSessionMock = vi.fn();
const endSupportSessionMock = vi.fn();

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

vi.mock("@/lib/support/support-console", () => ({
  startReadOnlySupportSession: (...args: unknown[]) => startReadOnlySupportSessionMock(...args),
  endSupportSession: (...args: unknown[]) => endSupportSessionMock(...args),
  isSupportConsoleError: (error: unknown) => {
    const code = String((error as any)?.code ?? "").trim();
    return Boolean(code);
  },
}));

function buildStartFormData() {
  const formData = new FormData();
  formData.set("return_to", "/ops/admin/users/support");
  formData.set("account_owner_user_id", "owner-1");
  return formData;
}

function buildEndFormData() {
  const formData = new FormData();
  formData.set("return_to", "/ops/admin/users/support");
  formData.set("account_owner_user_id", "owner-1");
  formData.set("support_access_session_id", "session-1");
  return formData;
}

describe("support console actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: {
        user_id: "admin-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-admin",
      },
    });

    startReadOnlySupportSessionMock.mockResolvedValue({ id: "session-1" });
    endSupportSessionMock.mockResolvedValue({ id: "session-1" });
  });

  it("denies non-admin before support session start helper is reached", async () => {
    requireInternalRoleMock.mockRejectedValueOnce(new Error("INTERNAL_ROLE_REQUIRED"));

    const { startSupportSessionFromForm } = await import("@/lib/actions/support-console-actions");

    await expect(startSupportSessionFromForm(buildStartFormData())).rejects.toThrow(
      "INTERNAL_ROLE_REQUIRED",
    );
    expect(startReadOnlySupportSessionMock).not.toHaveBeenCalled();
  });

  it("redirects with success notice when start succeeds", async () => {
    const { startSupportSessionFromForm } = await import("@/lib/actions/support-console-actions");

    await expect(startSupportSessionFromForm(buildStartFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/users/support?account_owner_user_id=owner-1&notice=session_started",
    );
  });

  it("redirects with denied notice when support start helper rejects with known error", async () => {
    startReadOnlySupportSessionMock.mockRejectedValueOnce({ code: "SUPPORT_GRANT_NOT_FOUND" });

    const { startSupportSessionFromForm } = await import("@/lib/actions/support-console-actions");

    await expect(startSupportSessionFromForm(buildStartFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/users/support?account_owner_user_id=owner-1&notice=access_denied",
    );
  });

  it("ends session via matching helper and redirects with success", async () => {
    const { endSupportSessionFromForm } = await import("@/lib/actions/support-console-actions");

    await expect(endSupportSessionFromForm(buildEndFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/users/support?account_owner_user_id=owner-1&notice=session_ended",
    );
    expect(endSupportSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        accountOwnerUserId: "owner-1",
        supportAccessSessionId: "session-1",
      }),
    );
  });
});
