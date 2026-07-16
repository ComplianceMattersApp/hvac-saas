import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(resolve(__dirname, "../../../app/layout.tsx"), "utf8");
const mobile = readFileSync(resolve(__dirname, "../../../components/layout/MobileShellMenu.tsx"), "utf8");
const count = readFileSync(resolve(__dirname, "../attention-center-count.ts"), "utf8");

describe("Needs Attention sticky navigation", () => {
  it("promotes the hub to desktop and mobile navigation with a count signal", () => {
    expect(layout).toContain('href="/reports/attention"');
    expect(layout).toContain("attentionBadgeLabel");
    expect(mobile).toContain("Needs Attention");
    expect(mobile).toContain("attentionCount > 0");
  });
  it("keeps the signal financial-role gated and tenant scoped", () => {
    expect(layout).toContain("canViewFinancialAttention");
    expect(layout).toContain('role === "billing"');
    expect(count).toContain('.eq("account_owner_user_id", ownerId)');
  });
  it("counts the exception families represented in the hub", () => {
    for (const table of ["internal_invoice_payments", "internal_invoices", "field_payment_collection_reports", "tenant_saved_method_payment_attempts", "qbo_connections"]) expect(count).toContain(table);
  });
});
