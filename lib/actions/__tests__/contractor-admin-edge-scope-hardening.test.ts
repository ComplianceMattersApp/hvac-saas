import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const loadScopedInternalContractorForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
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

vi.mock("@/lib/auth/internal-contractor-scope", () => ({
  loadScopedInternalContractorForMutation: (...args: unknown[]) =>
    loadScopedInternalContractorForMutationMock(...args),
}));

vi.mock("@/lib/actions/contractor-invite-actions", () => ({
  inviteContractor: vi.fn(async () => undefined),
}));

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function makeContractorWriteFixture() {
  const insertPayloads: Array<Record<string, unknown>> = [];
  const updatePayloads: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table !== "contractors") throw new Error(`Unexpected table ${table}`);

      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertPayloads.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "contractor-1", name: payload.name ?? "Contractor" },
                error: null,
              })),
            })),
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
      };
    },
  };

  return { supabase, insertPayloads, updatePayloads };
}

describe("contractor admin edge same-account hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "admin-user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    loadScopedInternalContractorForMutationMock.mockResolvedValue({
      id: "contractor-1",
      owner_user_id: "owner-1",
    });
  });

  it("allows same-account internal/admin updateContractorNameAndEmailFromForm past scoped preflight", async () => {
    const { supabase, updatePayloads } = makeContractorWriteFixture();
    createClientMock.mockResolvedValue(supabase);

    const { updateContractorNameAndEmailFromForm } = await import("@/lib/actions/contractor-actions");

    await updateContractorNameAndEmailFromForm(
      makeFormData({
        contractor_id: "contractor-1",
        name: "Scoped Name",
        email: "scoped@example.com",
      }),
    );

    expect(loadScopedInternalContractorForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", contractorId: "contractor-1" }),
    );
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toMatchObject({
      name: "Scoped Name",
      email: "scoped@example.com",
    });
  });

  it("allows same-account internal/admin createQuickContractorFromForm and stamps actor owner", async () => {
    const { supabase, insertPayloads } = makeContractorWriteFixture();
    createClientMock.mockResolvedValue(supabase);

    const { createQuickContractorFromForm } = await import("@/lib/actions/contractor-actions");

    await expect(
      createQuickContractorFromForm(
        makeFormData({
          name: "Scoped Quick Contractor",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/ops/admin/contractors?notice=contractor_created_no_email");

    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toMatchObject({
      name: "Scoped Quick Contractor",
      owner_user_id: "owner-1",
    });
  });

  it("denies cross-account internal/admin updateContractorNameAndEmailFromForm before write", async () => {
    const { supabase, updatePayloads } = makeContractorWriteFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalContractorForMutationMock.mockResolvedValue(null);

    const { updateContractorNameAndEmailFromForm } = await import("@/lib/actions/contractor-actions");

    await expect(
      updateContractorNameAndEmailFromForm(
        makeFormData({
          contractor_id: "contractor-1",
          name: "Scoped Name",
        }),
      ),
    ).rejects.toThrow("Access denied");

    expect(updatePayloads).toHaveLength(0);
  });

  it("denies cross-account internal/admin createQuickContractorFromForm before write", async () => {
    const { supabase, insertPayloads } = makeContractorWriteFixture();
    createClientMock.mockResolvedValue(supabase);

    const { createQuickContractorFromForm } = await import("@/lib/actions/contractor-actions");

    await expect(
      createQuickContractorFromForm(
        makeFormData({
          name: "Scoped Quick Contractor",
          owner_user_id: "owner-2",
        }),
      ),
    ).rejects.toThrow("Access denied");

    expect(insertPayloads).toHaveLength(0);
  });

  it("denies non-internal updateContractorNameAndEmailFromForm before write", async () => {
    const { supabase, updatePayloads } = makeContractorWriteFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalRoleMock.mockRejectedValue(new Error("Access denied"));

    const { updateContractorNameAndEmailFromForm } = await import("@/lib/actions/contractor-actions");

    await expect(
      updateContractorNameAndEmailFromForm(
        makeFormData({
          contractor_id: "contractor-1",
          name: "Scoped Name",
        }),
      ),
    ).rejects.toThrow("Access denied");

    expect(updatePayloads).toHaveLength(0);
  });

  it("denies non-internal createQuickContractorFromForm before write", async () => {
    const { supabase, insertPayloads } = makeContractorWriteFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalRoleMock.mockRejectedValue(new Error("Access denied"));

    const { createQuickContractorFromForm } = await import("@/lib/actions/contractor-actions");

    await expect(
      createQuickContractorFromForm(
        makeFormData({
          name: "Scoped Quick Contractor",
        }),
      ),
    ).rejects.toThrow("Access denied");

    expect(insertPayloads).toHaveLength(0);
  });
});