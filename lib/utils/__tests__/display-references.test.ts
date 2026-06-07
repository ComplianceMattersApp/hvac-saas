import { describe, expect, it } from "vitest";
import {
  formatInvoiceDisplayReference,
  formatJobDisplayReference,
} from "@/lib/utils/display-references";

describe("display-references helper", () => {
  it("job display number renders as Job #1001", () => {
    expect(
      formatJobDisplayReference({
        jobDisplayNumber: "1001",
        jobId: "1a52288c-78ae-4e79-9472-d00ed928f32f",
      })
    ).toBe("Job #1001");
  });

  it("job fallback uses short UUID/reference when display number is missing", () => {
    expect(
      formatJobDisplayReference({
        jobDisplayNumber: null,
        jobId: "1a52288c-78ae-4e79-9472-d00ed928f32f",
      })
    ).toBe("Job 1a52288c");
  });

  it("invoice display number renders as Invoice #2001", () => {
    expect(
      formatInvoiceDisplayReference({
        invoiceDisplayNumber: "2001",
        invoiceNumber: "INV-LEGACY-77",
        invoiceId: "4dd932ce-8ee9-4287-95c5-f9a48bfbbe37",
      })
    ).toBe("Invoice #2001");
  });

  it("invoice fallback uses short UUID/reference when display number is missing", () => {
    expect(
      formatInvoiceDisplayReference({
        invoiceDisplayNumber: undefined,
        invoiceNumber: "INV-LEGACY-77",
        invoiceId: "4dd932ce-8ee9-4287-95c5-f9a48bfbbe37",
      })
    ).toBe("Invoice 4dd932ce");
  });

  it("invoice display ignores legacy-shaped display numbers", () => {
    expect(
      formatInvoiceDisplayReference({
        invoiceDisplayNumber: "INV-20260607-1F79D164",
        invoiceNumber: "INV-LEGACY-77",
        invoiceId: "4dd932ce-8ee9-4287-95c5-f9a48bfbbe37",
      })
    ).toBe("Invoice 4dd932ce");
  });

  it("invoice fallback uses short UUID/reference only when no display or legacy number exists", () => {
    expect(
      formatInvoiceDisplayReference({
        invoiceDisplayNumber: "",
        invoiceNumber: "  ",
        invoiceId: "4dd932ce-8ee9-4287-95c5-f9a48bfbbe37",
      })
    ).toBe("Invoice 4dd932ce");
  });

  it("null/undefined/invalid display numbers do not produce broken labels", () => {
    expect(
      formatJobDisplayReference({
        jobDisplayNumber: { bad: "value" },
        jobId: "1a52288c-78ae-4e79-9472-d00ed928f32f",
      })
    ).toBe("Job 1a52288c");

    expect(
      formatInvoiceDisplayReference({
        invoiceDisplayNumber: { bad: "value" },
        invoiceNumber: undefined,
        invoiceId: "4dd932ce-8ee9-4287-95c5-f9a48bfbbe37",
      })
    ).toBe("Invoice 4dd932ce");

    expect(
      formatJobDisplayReference({
        jobDisplayNumber: null,
        jobId: null,
      })
    ).toBe("Job -");

    expect(
      formatInvoiceDisplayReference({
        invoiceDisplayNumber: undefined,
        invoiceNumber: null,
        invoiceId: undefined,
      })
    ).toBe("Invoice -");
  });
});
