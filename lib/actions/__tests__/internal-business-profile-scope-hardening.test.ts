import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const revalidatePathMock = vi.fn();

type FixtureOptions = {
  preflightAllowed?: boolean;
  existingLogoUrl?: string | null;
};

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
}));

function buildFixture(options: FixtureOptions = {}) {
  const preflightAllowed = options.preflightAllowed !== false;
  const existingLogoUrl = options.existingLogoUrl ?? "storage://attachments/company-profile/owner-1/existing-logo.png";

  const profileWrites: Array<Record<string, unknown>> = [];
  const profileUpdates: Array<Record<string, unknown>> = [];
  const storageUploads: Array<{ path: string }> = [];
  const storageRemoves: Array<{ paths: string[] }> = [];

  const admin = {
    from(table: string) {
      if (table === "internal_users") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (!preflightAllowed) return { data: null, error: null };
            return {
              data: {
                user_id: "admin-1",
                role: "admin",
                is_active: true,
                account_owner_user_id: "owner-1",
              },
              error: null,
            };
          }),
        };
        return query;
      }

      if (table === "internal_business_profiles") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: { logo_url: existingLogoUrl },
            error: null,
          })),
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            profileWrites.push(payload);
            return { error: null };
          }),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async () => {
              profileUpdates.push(payload);
              return { error: null };
            }),
          })),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          storageUploads.push({ path });
          return { error: null };
        }),
        remove: vi.fn(async (paths: string[]) => {
          storageRemoves.push({ paths });
          return { error: null };
        }),
      })),
    },
  };

  return {
    admin,
    profileWrites,
    profileUpdates,
    storageUploads,
    storageRemoves,
  };
}

function buildLogoFormData(file: File) {
  const formData = new FormData();
  formData.set("display_name", "Compliance Matters");
  formData.set("logo_file", file);
  return formData;
}

function buildFormData(includeLogo = false) {
  const formData = new FormData();
  formData.set("display_name", "Compliance Matters");
  formData.set("support_email", "support@example.com");
  formData.set("support_phone", "555-1212");
  formData.set("billing_mode", "internal_invoice");

  if (includeLogo) {
    const file = new File(["logo-bytes"], "logo.png", { type: "image/png" });
    formData.set("logo_file", file);
  }

  return formData;
}

function buildInvoiceModeFormData() {
  const formData = new FormData();
  formData.set("billing_mode", "internal_invoicing");
  return formData;
}

describe("internal business profile scope hardening", () => {
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
        account_owner_user_id: "owner-1",
        created_by: null,
      },
    });
  });

  it("allows same-account admin saveInternalBusinessProfileFromForm and reaches profile/storage mutation path", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInternalBusinessProfileFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(saveInternalBusinessProfileFromForm(buildFormData(true))).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=saved",
    );

    expect(fixture.profileWrites).toHaveLength(1);
    expect(fixture.storageUploads).toHaveLength(1);
  });

  it("denies cross-account or invalid scope before internal_business_profiles and storage mutations", async () => {
    const fixture = buildFixture({ preflightAllowed: false });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInternalBusinessProfileFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(saveInternalBusinessProfileFromForm(buildFormData(true))).rejects.toThrow(
      "REDIRECT:/forbidden",
    );

    expect(fixture.profileWrites).toHaveLength(0);
    expect(fixture.storageUploads).toHaveLength(0);
    expect(fixture.storageRemoves).toHaveLength(0);
  });

  it("denies non-admin/non-internal before internal_business_profiles and storage mutations", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);
    requireInternalRoleMock.mockRejectedValueOnce(new Error("Active internal user required."));

    const { saveInternalBusinessProfileFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(saveInternalBusinessProfileFromForm(buildFormData(true))).rejects.toThrow(
      "Active internal user required.",
    );

    expect(fixture.profileWrites).toHaveLength(0);
    expect(fixture.storageUploads).toHaveLength(0);
    expect(fixture.storageRemoves).toHaveLength(0);
  });

  it("allows same-account admin saveInvoiceModeFromForm without requiring company profile fields", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInvoiceModeFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(saveInvoiceModeFromForm(buildInvoiceModeFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=invoice_settings_saved",
    );

    expect(fixture.profileWrites).toHaveLength(1);
    expect(fixture.storageUploads).toHaveLength(0);
    expect(fixture.storageRemoves).toHaveLength(0);
    expect(fixture.profileWrites[0]?.billing_mode).toBe("internal_invoicing");
  });

  it("denies cross-account saveInvoiceModeFromForm before profile mutation", async () => {
    const fixture = buildFixture({ preflightAllowed: false });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInvoiceModeFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(saveInvoiceModeFromForm(buildInvoiceModeFormData())).rejects.toThrow(
      "REDIRECT:/forbidden",
    );

    expect(fixture.profileWrites).toHaveLength(0);
    expect(fixture.storageUploads).toHaveLength(0);
    expect(fixture.storageRemoves).toHaveLength(0);
  });

  it("rejects a disallowed logo type (gif) before any profile or storage mutation", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInternalBusinessProfileFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    const gif = new File(["gif-bytes"], "logo.gif", { type: "image/gif" });
    await expect(saveInternalBusinessProfileFromForm(buildLogoFormData(gif))).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=invalid_logo_file",
    );

    expect(fixture.profileWrites).toHaveLength(0);
    expect(fixture.storageUploads).toHaveLength(0);
  });

  it("rejects an image/* MIME spoof with a non-image extension", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInternalBusinessProfileFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    const spoof = new File(["<html>"], "payload.html", { type: "image/png" });
    await expect(saveInternalBusinessProfileFromForm(buildLogoFormData(spoof))).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=invalid_logo_file",
    );

    expect(fixture.profileWrites).toHaveLength(0);
    expect(fixture.storageUploads).toHaveLength(0);
  });

  it("rejects a script-bearing SVG logo before any profile or storage mutation", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInternalBusinessProfileFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    const unsafeSvg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
      "logo.svg",
      { type: "image/svg+xml" },
    );
    await expect(saveInternalBusinessProfileFromForm(buildLogoFormData(unsafeSvg))).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=unsafe_logo_file",
    );

    expect(fixture.profileWrites).toHaveLength(0);
    expect(fixture.storageUploads).toHaveLength(0);
  });

  it("accepts a clean SVG logo and reaches the storage upload path", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { saveInternalBusinessProfileFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    const cleanSvg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>'],
      "logo.svg",
      { type: "image/svg+xml" },
    );
    await expect(saveInternalBusinessProfileFromForm(buildLogoFormData(cleanSvg))).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?notice=saved",
    );

    expect(fixture.profileWrites).toHaveLength(1);
    expect(fixture.storageUploads).toHaveLength(1);
  });

  it("allows same-account admin confirmTeamSetupFromForm to stamp team_reviewed_at", async () => {
    const fixture = buildFixture({ preflightAllowed: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { confirmTeamSetupFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(confirmTeamSetupFromForm()).rejects.toThrow(
      "REDIRECT:/ops/admin/internal-users?team_confirm=confirmed",
    );

    expect(fixture.profileUpdates).toHaveLength(1);
    expect(fixture.profileUpdates[0]).toHaveProperty("team_reviewed_at");
  });

  it("denies cross-account confirmTeamSetupFromForm before the profile update", async () => {
    const fixture = buildFixture({ preflightAllowed: false });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { confirmTeamSetupFromForm } = await import(
      "@/lib/actions/internal-business-profile-actions"
    );

    await expect(confirmTeamSetupFromForm()).rejects.toThrow("REDIRECT:/forbidden");

    expect(fixture.profileUpdates).toHaveLength(0);
  });
});
