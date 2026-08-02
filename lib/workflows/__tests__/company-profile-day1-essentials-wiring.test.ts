import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("company profile day 1 essentials wiring", () => {
  it("renders compact day 1 guidance copy", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Needs attention");
    expect(pageSource).toContain("Nothing needs your attention right now.");
    expect(pageSource).toContain("Open Training Room");
  });

  it("keeps company details before setup and training content", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource.indexOf("Company Profile")).toBeGreaterThan(-1);
    expect(pageSource.indexOf("Needs attention")).toBeGreaterThan(pageSource.indexOf("Company Profile"));
    expect(pageSource.indexOf("First job training")).toBeGreaterThan(pageSource.indexOf("Company Profile"));
  });

  it("keeps linked section anchors on existing company profile sections", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("id=\"account-billing\"");
    expect(pageSource).toContain("id=\"accept-payments\"");
    expect(pageSource).toContain("\"#identity\"");
    expect(pageSource).toContain("\"#billing\"");
  });

  it("separates invoice workflow settings from online payment collection", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("Choose where your company creates and manages invoices.");
    expect(pageSource).toContain("Company invoice workflow");
    expect(pageSource).toContain("Track billing outside EveryStep FieldWorks");
    expect(pageSource).toContain("use EveryStep for job workflow and closeout");
    expect(pageSource).toContain("Use EveryStep FieldWorks invoices");
    expect(pageSource).toContain("create, send, and track invoices from each job.");
    expect(pageSource).toContain("Let customers pay EveryStep FieldWorks invoices online.");
    expect(pageSource).toContain("Online payments apply to invoices created in EveryStep FieldWorks.");
    expect(pageSource).toContain("Online payments are optional here because invoices are managed outside EveryStep FieldWorks.");
  });

  it("keeps invoice and payment actions wired", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource).toContain("action={saveInvoiceModeFromForm}");
    expect(pageSource).toContain("action={startTenantStripeConnectOnboardingFromForm}");
    expect(pageSource).toContain("action={refreshTenantStripeConnectReadinessFromForm}");
    expect(pageSource).toContain("Refresh payment status");
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

  it("keeps online payments before ECC handoff setup in the owner page rhythm", () => {
    const pageSource = readWorkspaceFile("app/ops/admin/company-profile/page.tsx");

    expect(pageSource.indexOf("<PlatformAccountSection")).toBeLessThan(pageSource.indexOf("Invoice Settings"));
    expect(pageSource.indexOf("<TenantStripePaymentsSection")).toBeGreaterThan(pageSource.indexOf("Invoice Settings"));
    expect(pageSource.indexOf("<TenantStripePaymentsSection")).toBeLessThan(pageSource.indexOf('eyebrow="ECC/HERS Partner Network"'));
    expect(pageSource.indexOf('eyebrow="ECC/HERS Partner Network"')).toBeLessThan(pageSource.indexOf('href="/ops/admin/connections"'));
  });
});
