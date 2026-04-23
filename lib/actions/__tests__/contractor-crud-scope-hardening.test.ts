import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
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
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
  requireInternalUser: vi.fn(),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/actions/contractor-invite-actions", () => ({
  inviteContractor: vi.fn(async () => undefined),
}));

function makeAdminContractorScopeFixture(ownerUserId: string | null) {
  return {
    from(table: string) {
      if (table !== "contractors") throw new Error(`Unexpected admin table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: ownerUserId
                ? { id: "contractor-1", owner_user_id: ownerUserId }
                : null,
              error: null,
            })),
          })),
        })),
      };
    },
  };
}

function makeSessionWriteTrackingFixture() {
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

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("contractor CRUD same-account hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
  });

  it("denies cross-account internal updateContractorFromForm before contractor write", async () => {
    const { supabase, updatePayloads } = makeSessionWriteTrackingFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminContractorScopeFixture("owner-2"));

    const { updateContractorFromForm } = await import("@/lib/actions/contractor-actions");

    await expect(
      updateContractorFromForm(
        makeFormData({
          contractor_id: "contractor-1",
          name: "Scoped Name",
        }),
      ),
    ).rejects.toThrow("Access denied");

    expect(updatePayloads).toHaveLength(0);
  });

  it("allows same-account internal updateContractorFromForm past scope preflight", async () => {
    const { supabase } = makeSessionWriteTrackingFixture();
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(makeAdminContractorScopeFixture("owner-1"));

    const { updateContractorFromForm } = await import("@/lib/actions/contractor-actions");

    await expect(
      updateContractorFromForm(
        makeFormData({
          contractor_id: "contractor-1",
          name: "Scoped Name",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/contractors/contractor-1/edit?saved=1");
  });

  it("denies cross-account internal legacy createContractorFromForm before contractor insert", async () => {
    const { supabase, insertPayloads } = makeSessionWriteTrackingFixture();
    createClientMock.mockResolvedValue(supabase);

    const { createContractorFromForm: legacyCreateContractorFromForm } = await import(
      "@/lib/actions/job-actions"
    );

    await expect(
      legacyCreateContractorFromForm(
        makeFormData({
          name: "Legacy Contractor",
          owner_user_id: "owner-2",
        }),
      ),
    ).rejects.toThrow("Access denied");

    expect(insertPayloads).toHaveLength(0);
  });

  it("allows same-account internal legacy createContractorFromForm and stamps actor account owner", async () => {
    const { supabase, insertPayloads } = makeSessionWriteTrackingFixture();
    createClientMock.mockResolvedValue(supabase);

    const { createContractorFromForm: legacyCreateContractorFromForm } = await import(
      "@/lib/actions/job-actions"
    );

    const result = await legacyCreateContractorFromForm(
      makeFormData({
        name: "Legacy Contractor",
        phone: "555-1010",
      }),
    );

    expect(result).toEqual({ id: "contractor-1", name: "Legacy Contractor" });
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toMatchObject({
      name: "Legacy Contractor",
      owner_user_id: "owner-1",
    });
  });
});
