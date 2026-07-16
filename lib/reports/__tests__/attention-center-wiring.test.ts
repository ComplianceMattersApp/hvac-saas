import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(__dirname, "../../../app/reports/attention/page.tsx"), "utf8");
const model = readFileSync(resolve(__dirname, "../attention-center-read-model.ts"), "utf8");
const tabs = readFileSync(resolve(__dirname, "../../../components/reports/ReportCenterTabs.tsx"), "utf8");

describe("Needs Attention center", () => {
  it("is a first-class financial report with tenant authorization", () => {
    expect(page).toContain("requireInternalUser");
    expect(page).toContain("requireFinancialRegisterAccessOrRedirect");
    expect(page).toContain('ReportCenterTabs current="attention"');
    expect(tabs).toContain('href="/reports/attention"');
  });

  it("groups financial system exceptions and existing human review queues", () => {
    expect(model).toContain('"qbo_payment"');
    expect(model).toContain('"qbo_invoice"');
    expect(model).toContain('"stripe_pending"');
    expect(model).toContain("loadFailedPaymentReconciliationItems");
    expect(model).toContain("listFieldPaymentCollectionReportsForReconciliation");
  });

  it("keeps collected truth distinct from failed or unconfirmed money", () => {
    expect(model).toContain("Money is collected in EveryStep");
    expect(model).toContain("not counted as collected money");
    expect(page).toContain("Money was not collected");
    expect(page).toContain("not yet counted as collected");
  });

  it("provides direct recovery destinations", () => {
    expect(page).toContain("Reconnect QuickBooks");
    expect(model).toContain("Retry payment sync");
    expect(model).toContain("Inspect Stripe session");
    expect(page).toContain("syncAttentionPaymentToQboFromForm");
    expect(page).toContain("Retry from hub");
  });
});
