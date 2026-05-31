import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const revalidatePathMock = vi.fn();
const listActiveRecipientConnectionsForAccountMock = vi.fn();

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
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
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

vi.mock("@/lib/workflows/account-handoff-connections-read", () => ({
  listActiveRecipientConnectionsForAccount: (...args: unknown[]) =>
    listActiveRecipientConnectionsForAccountMock(...args),
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
    listActiveRecipientConnectionsForAccountMock.mockResolvedValue([]);
    createAdminClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
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

  it("adds connected account rater when active requester-side connection exists", async () => {
    const { createConnectedAccountAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    const adminFromMock = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
    }));
    createAdminClientMock.mockReturnValue({ from: adminFromMock });

    listActiveRecipientConnectionsForAccountMock.mockResolvedValue([
      {
        id: "connection-1",
        requesting_account_owner_user_id: "owner-1",
        recipient_account_owner_user_id: "22222222-2222-4222-8222-222222222222",
        connection_status: "active",
        handoff_kind: "ecc",
      },
    ]);

    const formData = new FormData();
    formData.set("connection_id", "connection-1");
    formData.set("is_default", "1");

    await expect(createConnectedAccountAuthorizedEccRaterFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=connected_rater_added#authorized-ecc-raters",
    );

    expect(listActiveRecipientConnectionsForAccountMock).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "ecc",
    );
    expect(createAuthorizedHandoffRecipientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientType: "connected_account_future",
        handoffKind: "ecc",
        connectedAccountOwnerUserId: "22222222-2222-4222-8222-222222222222",
        isDefault: true,
        isActive: true,
      }),
    );
    expect(adminFromMock).toHaveBeenCalledWith("authorized_handoff_recipients");
  });

  it("rejects when selected connection is not active requester-side connection", async () => {
    const { createConnectedAccountAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    listActiveRecipientConnectionsForAccountMock.mockResolvedValue([
      {
        id: "different-connection",
        requesting_account_owner_user_id: "owner-1",
        recipient_account_owner_user_id: "22222222-2222-4222-8222-222222222222",
        connection_status: "active",
        handoff_kind: "ecc",
      },
    ]);

    const formData = new FormData();
    formData.set("connection_id", "missing-connection");

    await expect(createConnectedAccountAuthorizedEccRaterFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=connected_rater_error#authorized-ecc-raters",
    );
    expect(createAuthorizedHandoffRecipientMock).not.toHaveBeenCalled();
  });

  it("returns already configured notice when duplicate active connected recipient exists", async () => {
    const { createConnectedAccountAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    listActiveRecipientConnectionsForAccountMock.mockResolvedValue([
      {
        id: "connection-1",
        requesting_account_owner_user_id: "owner-1",
        recipient_account_owner_user_id: "22222222-2222-4222-8222-222222222222",
        connection_status: "active",
        handoff_kind: "ecc",
      },
    ]);

    createAdminClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: { id: "recipient-existing" },
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
    });

    const formData = new FormData();
    formData.set("connection_id", "connection-1");

    await expect(createConnectedAccountAuthorizedEccRaterFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=connected_rater_exists#authorized-ecc-raters",
    );
    expect(createAuthorizedHandoffRecipientMock).not.toHaveBeenCalled();
  });

  it("redirects forbidden for connected rater add when non-admin", async () => {
    requireInternalRoleMock.mockRejectedValue({
      name: "InternalAccessError",
      code: "INTERNAL_ROLE_REQUIRED",
      message: "Required internal role: admin",
    });

    const { createConnectedAccountAuthorizedEccRaterFromForm } = await import(
      "@/lib/actions/authorized-handoff-recipient-actions"
    );

    const formData = new FormData();
    formData.set("connection_id", "connection-1");

    await expect(createConnectedAccountAuthorizedEccRaterFromForm(formData)).rejects.toThrow(
      "REDIRECT:/forbidden",
    );
  });
});
