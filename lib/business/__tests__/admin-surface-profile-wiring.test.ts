import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminPageSource = readFileSync(resolve(__dirname, "../../../app/ops/admin/page.tsx"), "utf8");

describe("admin surface profile wiring", () => {
  it("uses the product surface profile to decide contractor collaboration visibility", () => {
    expect(adminPageSource).toContain('resolveProductSurfaceProfile(productMode)');
    expect(adminPageSource).toContain("surfaceProfile.surfaces.contractorRaterHandoff");
    expect(adminPageSource).toContain("const showContractorCollaboration = surfaceProfile.surfaces.contractorRaterHandoff;");
    expect(adminPageSource).toContain("item.key === \"contractor_directory\" && !showContractorCollaboration");
  });

  it("keeps cleaning admin landing copy team and crew oriented", () => {
    expect(adminPageSource).toContain("office staff, cleaners, and crew organized");
    expect(adminPageSource).toContain("Invite users, manage roles, recover access, and keep office staff, cleaners, and crew organized.");
    expect(adminPageSource).toContain("Team & Access");
  });

  it("renders the admin hub as focused workspace entry cards", () => {
    expect(adminPageSource).toContain("Admin workspaces");
    expect(adminPageSource).toContain("Choose a setup area");
    expect(adminPageSource).toContain("Company Profile");
    expect(adminPageSource).toContain("Team & Access");
    expect(adminPageSource).toContain("Invoices & Online Payments");
    expect(adminPageSource).toContain("Field Setup");
    expect(adminPageSource).toContain("Open workspace");
  });

  it("keeps focused admin destinations on existing routes and anchors", () => {
    expect(adminPageSource).toContain('href: "/ops/admin/company-profile#company-details"');
    expect(adminPageSource).toContain('href: "/ops/admin/company-profile#accept-payments"');
    expect(adminPageSource).toContain('href: "/ops/admin/users"');
    expect(adminPageSource).toContain('href: "/ops/admin/internal-users"');
    expect(adminPageSource).toContain('href: "/ops/admin/pricebook"');
    expect(adminPageSource).toContain('href: "/account"');
    expect(adminPageSource).toContain('href: "/ops/notifications"');
  });

  it("keeps advanced areas secondary and links the training room workspace", () => {
    expect(adminPageSource).toContain("Advanced / Technical");
    expect(adminPageSource).toContain("Training Room");
    expect(adminPageSource).toContain("Role-based training, daily rhythms, and the First Job Mission");
    expect(adminPageSource).toContain('href: "/training"');
    expect(adminPageSource).not.toContain('href: "#training-room-planned"');
  });
});
