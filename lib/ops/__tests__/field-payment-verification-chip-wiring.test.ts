import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

describe("/ops field payment verification chip wiring", () => {
  it("loads field payment reconciliation count from existing B7-Q read model", () => {
    expect(opsPageSource).toContain("listFieldPaymentCollectionReportsForReconciliation");
    expect(opsPageSource).toContain('limit: 1');
  });

  it("uses B7-Q permission gate for dashboard visibility", () => {
    expect(opsPageSource).toContain("canViewFieldPaymentVerificationAttention");
    expect(opsPageSource).toContain("canViewFinancialRegister");
    expect(opsPageSource).toContain("resolveFieldBillingCapabilities");
    expect(opsPageSource).toContain("loadFieldBillingExplicitCapabilitiesForUser");
    expect(opsPageSource).toContain("explicitCapabilities: explicitFieldBillingCapabilities");
    expect(opsPageSource).toContain("fieldBillingCapabilities.can_verify_non_card_collection");
  });

  it("does not expose verify/reject/correct/void actions from the dashboard chip", () => {
    expect(opsPageSource).not.toMatch(/>\s*Verify\s*</);
    expect(opsPageSource).not.toMatch(/>\s*Reject\s*</);
    expect(opsPageSource).not.toMatch(/>\s*Correct\s*</);
    expect(opsPageSource).not.toMatch(/>\s*Void\s*</);
  });

  it("introduces no payment truth mutation paths in the chip wiring", () => {
    expect(opsPageSource).not.toContain("internal_invoice_payments");
    expect(opsPageSource).not.toContain("internal_invoice_payment_allocations");
    expect(opsPageSource).not.toContain("updateInvoicePaidState");
    expect(opsPageSource).not.toContain("stripe.");
    expect(opsPageSource).not.toContain("webhook");
  });
});
