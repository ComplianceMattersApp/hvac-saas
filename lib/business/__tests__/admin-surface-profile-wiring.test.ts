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
    expect(adminPageSource).toContain("office staff, cleaners, and crew setup");
    expect(adminPageSource).toContain("Find team members, invites, and account access recovery actions.");
    expect(adminPageSource).toContain("Manage employees, cleaners, and crew members inside your company.");
  });
});
