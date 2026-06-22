import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("company profile day 1 essentials wiring", () => {
  it("renders compact day 1 guidance copy", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Setup attention");
    expect(pageSource).toContain("Finish only the items that need attention.");
    expect(pageSource).toContain("Open Training Room");
  });

  it("keeps company details before setup and training content", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource.indexOf('id="company-details"')).toBeGreaterThan(-1);
    expect(pageSource.indexOf("Setup attention")).toBeGreaterThan(pageSource.indexOf('id="company-details"'));
    expect(pageSource.indexOf("First job training")).toBeGreaterThan(pageSource.indexOf('id="company-details"'));
  });

  it("keeps linked section anchors on existing company profile sections", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("id=\"company-details\"");
    expect(pageSource).toContain("id=\"invoice-settings\"");
    expect(pageSource).toContain("id=\"account-billing\"");
  });

  it("keeps subscription and payment diagnostics behind advanced details", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Compliance Matters Subscription");
    expect(pageSource).toContain("Advanced subscription details");
    expect(pageSource).toContain("Payment method for subscription");
    expect(pageSource).toContain("Online Payments");
    expect(pageSource).toContain("Advanced payment details");
    expect(pageSource).toContain("Payment provider account");
  });
});
