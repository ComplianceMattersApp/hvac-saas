import { describe, expect, it } from "vitest";
import { invoiceBelongsToCustomerReceivable } from "@/lib/business/customer-invoice-balance";

describe("customer invoice receivable ownership", () => {
  it("keeps contractor-billed job invoices out of the service customer's balance", () => {
    expect(invoiceBelongsToCustomerReceivable({
      billToKind: "contractor",
      billingName: "Coaches HVAC",
      customerName: "Sandy Vogtlin",
    })).toBe(false);
  });

  it("includes customer-billed invoices in the customer's balance", () => {
    expect(invoiceBelongsToCustomerReceivable({
      billToKind: "customer",
      billingName: "Sandy Vogtlin",
      customerName: "Sandy Vogtlin",
    })).toBe(true);
  });

  it("uses exact frozen identity for legacy invoices without payer type", () => {
    expect(invoiceBelongsToCustomerReceivable({
      billingEmail: "sandy@example.com",
      customerEmail: "SANDY@example.com",
      billingName: "Different formatting",
      customerName: "Sandy Vogtlin",
    })).toBe(true);
    expect(invoiceBelongsToCustomerReceivable({
      billingEmail: "billing@coaches.example",
      customerEmail: "sandy@example.com",
      billingName: "Coaches HVAC",
      customerName: "Sandy Vogtlin",
    })).toBe(false);
  });
});
