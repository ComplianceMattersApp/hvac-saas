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

  it("keeps inspection read-only while exposing the privileged reconciliation fallback", () => {
    for (const text of [".insert(", ".update(", ".upsert(", ".delete(", "qbo", "sendEmail", "revalidatePath"]) {
      expect(inspector.toLowerCase()).not.toContain(text.toLowerCase());
    }
    expect(source).toContain("Exact confirmed matches are normally recovered automatically");
    expect(source).toContain("Reconcile confirmed payment");
  });

  it("redacts Stripe identities for display", () => {
    expect(inspector).toContain("slice(-8)");
    expect(source).toContain("checkoutSessionSuffix");
  });
});
