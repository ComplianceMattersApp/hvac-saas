import { describe, expect, it } from "vitest";
import { buildPaymentReceivedEmail } from "@/lib/payments/payment-received-email";

describe("payment received internal email", () => {
  it("renders payment, invoice, balance, method, and QBO boundary", () => {
    const message = buildPaymentReceivedEmail({ businessName: "Test HVAC", amountCents: 25000, balanceDueCents: 10000, invoiceNumber: "1728", billingName: "Coaches", paymentMethod: "check", reference: "55", paidAt: "2026-07-15T12:00:00Z", invoiceHref: "https://app.test/jobs/1/invoice" });
    expect(message.subject).toContain("$250.00");
    expect(message.html).toContain("#1728");
    expect(message.html).toContain("$100.00");
    expect(message.html).toContain("Check");
    expect(message.html).toContain("QuickBooks synchronization is tracked separately");
    expect(message.text).toContain("Reference: 55");
  });

  it("escapes recipient-controlled content", () => {
    const message = buildPaymentReceivedEmail({ businessName: "<script>", amountCents: 100, balanceDueCents: 0, invoiceNumber: "1", billingName: "A&B", paymentMethod: "other", reference: null, paidAt: "", invoiceHref: "https://app.test" });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("A&amp;B");
  });
});
