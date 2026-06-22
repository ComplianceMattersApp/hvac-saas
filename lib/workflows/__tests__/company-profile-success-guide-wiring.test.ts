import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("company profile first job training wiring", () => {
  it("renders compact first job training card", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("First job training");
    expect(pageSource).toContain("Open Training Room for the step-by-step first job path.");
    expect(pageSource).toContain('href="/training"');
    expect(pageSource).not.toContain("<ol");
  });

  it("keeps training content out of the primary profile flow", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource.indexOf('id="company-details"')).toBeLessThan(pageSource.indexOf("First job training"));
    expect(pageSource).not.toContain("14-day trial");
    expect(pageSource).not.toContain("14 day trial");
  });

  it("does not keep old trial-guide helper copy in Company Profile", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).not.toContain("Use your 30-day trial to prove the daily routine.");
    expect(pageSource).not.toContain("Use this guide to train your team or tighten your daily routine.");
  });

  it("keeps training room action visible on company profile", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Open Training Room");
  });
});
