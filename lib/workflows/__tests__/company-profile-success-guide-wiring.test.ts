import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("company profile first job training wiring", () => {
  it("renders first job training copy and plain-English checklist", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("First job training");
    expect(pageSource).toContain("Open Training Room when you want the step-by-step first job path.");
    expect(pageSource).toContain("Confirm company details");
    expect(pageSource).toContain("Invite your team");
    expect(pageSource).toContain("Create your first customer");
    expect(pageSource).toContain("Create your first job");
    expect(pageSource).toContain("Schedule and assign the job");
    expect(pageSource).toContain("Have the tech add notes from the field");
    expect(pageSource).toContain("Close out the work and handle the invoice");
    expect(pageSource).toContain("Use Today/Ops each morning");
    expect(pageSource).toContain('href="/training"');
  });

  it("renders This can wait guidance and avoids stale 14-day trial copy", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("This can wait");
    expect(pageSource).toContain("service plans unless you use them now");
    expect(pageSource).toContain("payment automation");
    expect(pageSource).toContain("contractor collaboration");
    expect(pageSource).not.toContain("14-day trial");
    expect(pageSource).not.toContain("14 day trial");
  });

  it("shows trial-specific helper only behind trial status and keeps non-trial helper", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain('entitlement.entitlementStatus === "trial"');
    expect(pageSource).toContain("Use your 30-day trial to prove the daily routine.");
    expect(pageSource).toContain("Use this guide to train your team or tighten your daily routine.");
  });

  it("keeps existing setup actions visible on company profile", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("href=\"#company-details\"");
    expect(pageSource).toContain("href=\"/ops/admin/internal-users\"");
    expect(pageSource).toContain("href=\"#account-billing\"");
    expect(pageSource).toContain("href=\"#invoice-settings\"");
  });
});
