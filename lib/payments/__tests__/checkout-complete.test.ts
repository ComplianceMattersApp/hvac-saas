import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { resolveCheckoutCompleteViewModel } from "@/lib/payments/checkout-complete";

const pageSource = readFileSync(resolve(__dirname, "../../../app/payments/checkout-complete/page.tsx"), "utf-8");
const helperSource = readFileSync(resolve(__dirname, "../../../lib/payments/checkout-complete.ts"), "utf-8");

describe("checkout complete view model", () => {
  it("shows return to invoice and back to job when both job and invoice ids exist", () => {
    const viewModel = resolveCheckoutCompleteViewModel({
      status: "success",
      jobId: "12345678-1234-4234-9234-1234567890ab",
      invoiceId: "22345678-1234-4234-9234-2234567890ab",
      isInternalUser: true,
    });

    expect(viewModel.heading).toBe("Payment checkout complete");
    expect(viewModel.body).toBe(
      "Thank you. Your payment was submitted in Stripe Checkout. Invoice balance updates after Stripe confirms processing.",
    );
    expect(viewModel.actions.map((action) => action.label)).toEqual(["Return to invoice", "Back to job"]);
    expect(viewModel.actions[0].href).toBe(
      "/jobs/12345678-1234-4234-9234-1234567890ab/invoice?payment_return=success",
    );
    expect(viewModel.actions[1].href).toBe(
      "/jobs/12345678-1234-4234-9234-1234567890ab?tab=ops&payment_return=success",
    );
    expect(viewModel.refreshHref).toBe(
      "/jobs/12345678-1234-4234-9234-1234567890ab/invoice?payment_return=success",
    );
  });

  it("shows back to job when only job id exists", () => {
    const viewModel = resolveCheckoutCompleteViewModel({
      status: "success",
      jobId: "12345678-1234-4234-9234-1234567890ab",
      invoiceId: "",
      isInternalUser: true,
    });

    expect(viewModel.actions.some((action) => action.label === "Team sign in")).toBe(false);
    expect(viewModel.actions.map((action) => action.label)).toEqual(["Return to invoice", "Back to job"]);
    expect(viewModel.actions[1].href).toBe(
      "/jobs/12345678-1234-4234-9234-1234567890ab?tab=ops&payment_return=success",
    );
  });

  it("falls back to team sign in when no internal context exists", () => {
    const viewModel = resolveCheckoutCompleteViewModel({
      status: "success",
      jobId: "",
      invoiceId: "",
      isInternalUser: false,
    });

    expect(viewModel.actions).toEqual([
      {
        label: "Team sign in",
        href: "/login",
        variant: "primary",
      },
    ]);
    expect(viewModel.refreshHref).toBeNull();
  });
});

describe("checkout complete page wiring", () => {
  it("renders internal return actions and does not wire payment truth writes", () => {
    expect(pageSource).toContain("resolveCheckoutCompleteViewModel");
    expect(pageSource).toContain("Refresh payment status");
    expect(helperSource).toContain("Return to invoice");
    expect(helperSource).toContain("Back to job");
    expect(helperSource).toContain("Team sign in");
    expect(helperSource).toContain("Invoice balance updates after Stripe confirms processing.");
    expect(pageSource).not.toContain("recordInternalInvoicePaymentFromForm");
    expect(pageSource).not.toContain("internal_invoice_payments");
    expect(pageSource).not.toContain("internal_invoice_payment_allocations");
  });
});
