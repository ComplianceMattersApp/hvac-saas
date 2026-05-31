import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const revalidatePathMock = vi.fn();

const createAuthorizedHandoffRecipientMock = vi.fn();
const updateAuthorizedHandoffRecipientMock = vi.fn();
const archiveAuthorizedHandoffRecipientMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error)
    && typeof error === "object"
    && (error as any).name === "InternalAccessError",
}));

vi.mock("@/lib/workflows/authorized-handoff-recipients-actions", () => ({
  createAuthorizedHandoffRecipient: (...args: unknown[]) =>
    createAuthorizedHandoffRecipientMock(...args),
  updateAuthorizedHandoffRecipient: (...args: unknown[]) =>
    updateAuthorizedHandoffRecipientMock(...args),
  archiveAuthorizedHandoffRecipient: (...args: unknown[]) =>
    archiveAuthorizedHandoffRecipientMock(...args),
}));

describe("authorized handoff recipient admin form actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: {
        account_owner_user_id: "owner-1",
        role: "admin",
      },
    });

    createAuthorizedHandoffRecipientMock.mockResolvedValue({
      success: true,
      recipient: { id: "recipient-1" },
    });
    updateAuthorizedHandoffRecipientMock.mockResolvedValue({
      success: true,
      recipient: { id: "recipient-1" },
    });
    archiveAuthorizedHandoffRecipientMock.mockResolvedValue({
      success: true,
      recipient: { id: "recipient-1" },
    });
  });

  it("creates external/manual ECC rater from company profile form", async () => {
    const { createAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    const formData = new FormData();
    formData.set("recipient_type", "external_manual");
    formData.set("handoff_kind", "ecc");
    formData.set("display_name", "Central Valley Rater");
    formData.set("external_email", "rater@example.com");
    formData.set("is_default", "1");

    await expect(createAuthorizedEccRaterFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=authorized_ecc_rater_saved#authorized-ecc-raters",
    );

    expect(createAuthorizedHandoffRecipientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientType: "external_manual",
        handoffKind: "ecc",
        displayName: "Central Valley Rater",
        externalEmail: "rater@example.com",
        isDefault: true,
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/company-profile");
  });

  it("requires display name for create form", async () => {
    const { createAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    const formData = new FormData();
    formData.set("recipient_type", "external_manual");
    formData.set("handoff_kind", "ecc");

    await expect(createAuthorizedEccRaterFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=authorized_ecc_rater_display_name_required#authorized-ecc-raters",
    );

    expect(createAuthorizedHandoffRecipientMock).not.toHaveBeenCalled();
  });

  it("wires set-default form to recipient update", async () => {
    const { setAuthorizedEccRaterDefaultFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    const formData = new FormData();
    formData.set("recipient_id", "11111111-1111-4111-8111-111111111111");

    await expect(setAuthorizedEccRaterDefaultFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=authorized_ecc_rater_default_saved#authorized-ecc-raters",
    );

    expect(updateAuthorizedHandoffRecipientMock).toHaveBeenCalledWith({
      recipientId: "11111111-1111-4111-8111-111111111111",
      isDefault: true,
      isActive: true,
    });
  });

  it("wires archive form to recipient archive", async () => {
    const { archiveAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    const formData = new FormData();
    formData.set("recipient_id", "11111111-1111-4111-8111-111111111111");

    await expect(archiveAuthorizedEccRaterFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=authorized_ecc_rater_archived#authorized-ecc-raters",
    );

    expect(archiveAuthorizedHandoffRecipientMock).toHaveBeenCalledWith({
      recipientId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("redirects forbidden when role guard fails", async () => {
    requireInternalRoleMock.mockRejectedValue({
      name: "InternalAccessError",
      code: "INTERNAL_ROLE_REQUIRED",
      message: "Required internal role: admin",
    });

    const { createAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    const formData = new FormData();
    formData.set("display_name", "Blocked");

    await expect(createAuthorizedEccRaterFromForm(formData)).rejects.toThrow("REDIRECT:/forbidden");
  });
});
