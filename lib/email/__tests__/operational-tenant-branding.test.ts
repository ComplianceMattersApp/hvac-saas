import { describe, expect, it, vi } from "vitest";

const resolveInternalBusinessIdentityByAccountOwnerIdMock = vi.fn();
const resolveInternalBusinessProfileLogoUrlMock = vi.fn();

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveInternalBusinessIdentityByAccountOwnerId: (...args: unknown[]) =>
    resolveInternalBusinessIdentityByAccountOwnerIdMock(...args),
  resolveInternalBusinessProfileLogoUrl: (...args: unknown[]) =>
    resolveInternalBusinessProfileLogoUrlMock(...args),
}));

import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";

describe("resolveOperationalTenantIdentity", () => {
  it("resolves tenant display/support fields and signed logo URL", async () => {
    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValueOnce({
      display_name: "Acme HVAC",
      support_email: "support@acme.test",
      support_phone: "555-1000",
      logo_url: "storage://attachments/company-profile/owner-1/logo.png",
    });
    resolveInternalBusinessProfileLogoUrlMock.mockResolvedValueOnce(
      "https://cdn.example.test/logo-signed.png",
    );

    const result = await resolveOperationalTenantIdentity({
      accountOwnerUserId: "owner-1",
      supabase: {},
    });

    expect(result).toEqual({
      displayName: "Acme HVAC",
      supportEmail: "support@acme.test",
      supportPhone: "555-1000",
      logoUrl: "https://cdn.example.test/logo-signed.png",
    });
  });

  it("falls back to neutral platform display when tenant display is blank", async () => {
    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValueOnce({
      display_name: "",
      support_email: null,
      support_phone: null,
      logo_url: null,
    });
    resolveInternalBusinessProfileLogoUrlMock.mockResolvedValueOnce(null);

    const result = await resolveOperationalTenantIdentity({
      accountOwnerUserId: "owner-2",
      supabase: {},
    });

    expect(result.displayName).toBe("Compliance Matters");
    expect(result.logoUrl).toBeNull();
  });
});
