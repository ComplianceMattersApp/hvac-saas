import { describe, expect, it } from "vitest";
import {
  PAYMENTS_REGISTER_METHOD_OPTIONS,
  buildPaymentsRegisterCsv,
  buildPaymentsRegisterSearchParams,
  normalizeMethodForRegister,
  parsePaymentsRegisterFilters,
  type PaymentsRegisterRow,
} from "@/lib/reports/payments-register";

describe("payments register helper", () => {
  it("maps internal payment methods to the simplified register taxonomy", () => {
    expect(normalizeMethodForRegister("card_stripe_online")).toBe("online_stripe");
    expect(normalizeMethodForRegister("card_off_platform")).toBe("card");
    expect(normalizeMethodForRegister("check")).toBe("check");
    expect(normalizeMethodForRegister("cash")).toBe("cash");
    expect(normalizeMethodForRegister("bank_transfer")).toBe("digital");
    expect(normalizeMethodForRegister("ach_off_platform")).toBe("other");
  });

  it("keeps ACH hidden from user-facing taxonomy options", () => {
    const values = PAYMENTS_REGISTER_METHOD_OPTIONS.map((option) => option.value);
    expect(values).toEqual(["online_stripe", "card", "check", "cash", "digital", "other"]);
  });

  it("parses and rebuilds URL filters safely", () => {
    const filters = parsePaymentsRegisterFilters(
      new URLSearchParams({
        status: "failed",
        method: "digital",
        from: "2026-05-01",
        to: "2026-05-24",
        q: "INV-2026",
      }),
    );

    expect(filters).toEqual({
      status: "failed",
      method: "digital",
      fromDate: "2026-05-01",
      toDate: "2026-05-24",
      query: "INV-2026",
    });

    const params = buildPaymentsRegisterSearchParams(filters);
    expect(params.toString()).toContain("status=failed");
    expect(params.toString()).toContain("method=digital");
    expect(params.toString()).toContain("from=2026-05-01");
    expect(params.toString()).toContain("to=2026-05-24");
    expect(params.toString()).toContain("q=INV-2026");
  });

  it("exports recorded payments to CSV with correct headers", () => {
    const rows: PaymentsRegisterRow[] = [
      {
        paymentId: "pay-1",
        paidAtDisplay: "May 24, 2026",
        status: "recorded",
        statusLabel: "Recorded",
        method: "online_stripe",
        methodLabel: "Online / Stripe",
        amountCents: 150000,
        amountDisplay: "$1,500.00",
        customerName: "Acme Corp",
        customerHref: "/customers/cust-1",
        invoiceNumber: "INV-2026-001",
        invoiceHref: "/jobs/job-1/invoice",
        jobReference: "job-abc",
        jobTitle: "HVAC Service",
        jobHref: "/jobs/job-1",
        reference: "stripe_ref_123",
        notes: "Payment received online",
      },
    ];

    const csv = buildPaymentsRegisterCsv(rows);
    const lines = csv.split("\r\n");

    // Verify header
    expect(lines[0]).toContain("Paid Date");
    expect(lines[0]).toContain("Amount");
    expect(lines[0]).toContain("Status");
    expect(lines[0]).toContain("Method");
    expect(lines[0]).toContain("Customer");
    expect(lines[0]).toContain("Invoice");
    expect(lines[0]).toContain("Job Reference");
    expect(lines[0]).toContain("Job Title");
    expect(lines[0]).toContain("Reference");
    expect(lines[0]).toContain("Notes");

    // Verify data row
    expect(lines[1]).toContain("May 24, 2026");
    expect(lines[1]).toContain("$1,500.00");
    expect(lines[1]).toContain("Recorded");
    expect(lines[1]).toContain("Online / Stripe");
    expect(lines[1]).toContain("Acme Corp");
  });

  it("exports failed payments with status field for clear separation", () => {
    const rows: PaymentsRegisterRow[] = [
      {
        paymentId: "pay-failed-1",
        paidAtDisplay: "May 20, 2026",
        status: "failed",
        statusLabel: "Failed",
        method: "online_stripe",
        methodLabel: "Online / Stripe",
        amountCents: 100000,
        amountDisplay: "$1,000.00",
        customerName: "Demo Cust",
        customerHref: "/customers/cust-2",
        invoiceNumber: "INV-2026-002",
        invoiceHref: "/jobs/job-2/invoice",
        jobReference: "job-xyz",
        jobTitle: "Emergency Repair",
        jobHref: "/jobs/job-2",
        reference: "stripe_fail_456",
        notes: "Charge declined",
      },
    ];

    const csv = buildPaymentsRegisterCsv(rows);
    expect(csv).toContain("Failed");
    expect(csv).not.toContain("Recorded");
  });

  it("preserves method taxonomy in CSV without exposing ACH", () => {
    const rows: PaymentsRegisterRow[] = [
      {
        paymentId: "pay-ach",
        paidAtDisplay: "May 15, 2026",
        status: "recorded",
        statusLabel: "Recorded",
        method: "other", // ACH mapped to 'other'
        methodLabel: "Other",
        amountCents: 200000,
        amountDisplay: "$2,000.00",
        customerName: "Large Cust",
        customerHref: "/customers/cust-3",
        invoiceNumber: "INV-2026-003",
        invoiceHref: "/jobs/job-3/invoice",
        jobReference: "job-123",
        jobTitle: "Maintenance",
        jobHref: "/jobs/job-3",
        reference: "stripe_ref_123",
        notes: "Bank transfer received",
      },
    ];

    const csv = buildPaymentsRegisterCsv(rows);
    // Verify the CSV contains "Other" as the method
    expect(csv).toContain(",Other,");
    // Verify built-in method taxonomy matches what we exported
    const methodOptions = PAYMENTS_REGISTER_METHOD_OPTIONS.map((opt) => opt.value);
    expect(methodOptions).toContain("other");
    expect(methodOptions).not.toContain("ach_off_platform");
  });

  it("properly escapes CSV values with special characters", () => {
    const rows: PaymentsRegisterRow[] = [
      {
        paymentId: "pay-escape",
        paidAtDisplay: "May 10, 2026",
        status: "recorded",
        statusLabel: "Recorded",
        method: "check",
        methodLabel: "Check",
        amountCents: 75000,
        amountDisplay: "$750.00",
        customerName: 'Smith, "The Owner"',
        customerHref: "/customers/cust-4",
        invoiceNumber: "INV-2026-004",
        invoiceHref: "/jobs/job-4/invoice",
        jobReference: "job-456",
        jobTitle: "Repair",
        jobHref: "/jobs/job-4",
        reference: "Check #12345",
        notes: 'Quote:\n"Payment received in full"',
      },
    ];

    const csv = buildPaymentsRegisterCsv(rows);
    // Verify that the CSV is properly formatted with quotes around values containing special chars
    expect(csv).toContain('"Smith, ""The Owner"""');
    // Notes field with newline and quote should be escaped
    expect(csv).toContain('"Quote:\n""Payment received in full"""');
  });
});
