import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../customer-saved-payment-method-actions.ts"),
  "utf8",
);

describe("customer saved payment method actions wiring", () => {
  it("gates setup start by internal auth and financial authority", () => {
    expect(source).toContain("requireInternalUser");
    expect(source).toContain("canManageInvoiceLifecycle");
    expect(source).toContain("saved_payment_method_setup_denied");
  });

  it("verifies customer and optional agreement account scope", () => {
    expect(source).toContain('.from("customers")');
    expect(source).toContain('.from("maintenance_agreements")');
    expect(source).toContain("saved_payment_method_setup_invalid");
  });

  it("requires tenant connect readiness before starting checkout setup mode", () => {
    expect(source).toContain("resolveTenantStripeConnectReadiness");
    expect(source).toContain("saved_payment_method_setup_connect_not_ready");
    expect(source).toContain("startTenantSavedCardSetupCheckoutSession");
  });

  it("redirects to stripe checkout and uses failure banner on setup creation errors", () => {
    // redirect() must be called OUTSIDE the try/catch so NEXT_REDIRECT is not swallowed
    expect(source).toContain("redirect(checkoutSessionUrl");
    expect(source).not.toContain("redirect(result.checkoutSessionUrl)");
    expect(source).toContain("saved_payment_method_setup_failed");
  });
});
