import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../app/reports/stripe-reconciliation/page.tsx"), "utf8");
const inspector = readFileSync(resolve(__dirname, "../../business/stripe-pending-payment-inspector.ts"), "utf8");

describe("Stripe reconciliation diagnostic wiring", () => {
  it("requires internal financial access and explicit inspection", () => {
    expect(source).toContain("requireInternalUser");
    expect(source).toContain("requireFinancialRegisterAccessOrRedirect");
    expect(source).toContain('inspect === "1"');
  });

  it("contains no repair, QBO, email, or database mutation path", () => {
    for (const text of [".insert(", ".update(", ".upsert(", ".delete(", "qbo", "sendEmail", "revalidatePath"]) {
      expect(inspector.toLowerCase()).not.toContain(text.toLowerCase());
    }
    expect(source).toContain("cannot record payments, repair invoices, sync QuickBooks, or send email");
  });

  it("redacts Stripe identities for display", () => {
    expect(inspector).toContain("slice(-8)");
    expect(source).toContain("checkoutSessionSuffix");
  });
});
