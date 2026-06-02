import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("company profile day 1 essentials wiring", () => {
  it("renders compact day 1 guidance copy", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("14-day trial: Day 1 essentials");
    expect(pageSource).toContain("Start with these areas first.");
    expect(pageSource).toContain("create your first customer, create your first job");
  });

  it("wires day 1 guidance links to existing setup sections/actions", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("href=\"#company-details\"");
    expect(pageSource).toContain("href=\"/ops/admin/internal-users\"");
    expect(pageSource).toContain("href=\"#account-billing\"");
    expect(pageSource).toContain("href=\"#invoice-settings\"");
  });

  it("keeps linked section anchors on existing company profile sections", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("id=\"company-details\"");
    expect(pageSource).toContain("id=\"invoice-settings\"");
    expect(pageSource).toContain("id=\"account-billing\"");
  });
});
