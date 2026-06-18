import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
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
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeCsvFile(csv: string, name = "services.csv", type = "text/csv") {
  return new File([csv], name, { type });
}

function makePreviewForm(csv: string) {
  const formData = new FormData();
  formData.set("csv_file", makeCsvFile(csv));
  return formData;
}

function makeConfirmForm(csv: string) {
  const formData = new FormData();
  formData.set("csv_text", csv);
  return formData;
}

function makeSupabase(params?: { existingNames?: string[]; insertError?: string | null }) {
  const insertPayloads: unknown[] = [];

  const supabase = {
    from(table: string) {
      if (table !== "pricebook_items") {
        throw new Error(`UNEXPECTED_TABLE:${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: (params?.existingNames ?? []).map((item_name) => ({ item_name })),
            error: null,
          })),
        })),
        insert: vi.fn(async (payload: unknown) => {
          insertPayloads.push(payload);
          return {
            error: params?.insertError ? { message: params.insertError } : null,
          };
        }),
      };
    },
  };

  return { supabase, insertPayloads };
}

async function importActions() {
  return import("@/lib/actions/pricebook-actions");
}

describe("pricebook import actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "admin-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("previews Ready to add, Already exists, and Needs review sections", async () => {
    const { supabase } = makeSupabase({ existingNames: ["General Cleaning"] });
    createClientMock.mockResolvedValue(supabase);
    const { previewPricebookImportFromForm } = await importActions();
    const csv = [
      "Service Name,Category,Kind,Unit,Price,Active,Description",
      "General Cleaning,Cleaning,Service,Job,0,Yes,Existing",
      "Deep Cleaning,Cleaning,Service,Job,0,Yes,Ready",
      "Bad,Cleaning,Other,Job,0,Yes,Bad",
    ].join("\n");

    const state = await previewPricebookImportFromForm({ status: "idle" }, makePreviewForm(csv));

    expect(requireInternalRoleMock).toHaveBeenCalledWith("admin", expect.anything());
    expect(state.status).toBe("preview");
    expect(state.preview?.readyToAdd).toHaveLength(1);
    expect(state.preview?.alreadyExists).toHaveLength(1);
    expect(state.preview?.needsReview).toHaveLength(1);
  });

  it("rejects non-CSV uploads with a friendly error", async () => {
    const { supabase } = makeSupabase();
    createClientMock.mockResolvedValue(supabase);
    const { previewPricebookImportFromForm } = await importActions();
    const formData = new FormData();
    formData.set("csv_file", makeCsvFile("hello", "services.txt", "text/plain"));

    const state = await previewPricebookImportFromForm({ status: "idle" }, formData);

    expect(state).toEqual({ status: "error", message: "Upload a CSV file." });
  });

  it("confirm import enforces entitlement and inserts only ready rows", async () => {
    const { supabase, insertPayloads } = makeSupabase({ existingNames: ["General Cleaning"] });
    createClientMock.mockResolvedValue(supabase);
    const { confirmPricebookImportFromForm } = await importActions();
    const csv = [
      "Service Name,Category,Kind,Unit,Price,Active,Description",
      "General Cleaning,Cleaning,Service,Job,0,Yes,Existing",
      "Deep Cleaning,Cleaning,Service,Job,0,Yes,Ready",
    ].join("\n");

    const state = await confirmPricebookImportFromForm({ status: "idle" }, makeConfirmForm(csv));

    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
    expect(state.status).toBe("imported");
    expect(state.result).toEqual(
      expect.objectContaining({ added: 1, skippedExisting: 1, needsReview: 0 }),
    );
    expect(insertPayloads[0]).toEqual([
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        item_name: "Deep Cleaning",
        is_starter: false,
        seed_key: null,
      }),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/pricebook");
  });

  it("server actions reject non-admin users before preview/import", async () => {
    const { supabase } = makeSupabase();
    createClientMock.mockResolvedValue(supabase);
    requireInternalRoleMock.mockRejectedValue(new Error("INTERNAL_ROLE_REQUIRED"));
    const { previewPricebookImportFromForm, confirmPricebookImportFromForm } = await importActions();

    await expect(
      previewPricebookImportFromForm({ status: "idle" }, makePreviewForm("Service Name,Category,Kind,Unit,Price,Active,Description")),
    ).rejects.toThrow("INTERNAL_ROLE_REQUIRED");
    await expect(
      confirmPricebookImportFromForm({ status: "idle" }, makeConfirmForm("Service Name,Category,Kind,Unit,Price,Active,Description")),
    ).rejects.toThrow("INTERNAL_ROLE_REQUIRED");
  });
});
