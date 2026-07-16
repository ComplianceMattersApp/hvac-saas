import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const modelSource = readFileSync(resolve(__dirname, "../contractor-financial-history.ts"), "utf8");
const profileSource = readFileSync(resolve(__dirname, "../../../app/contractors/[id]/edit/page.tsx"), "utf8");

describe("contractor financial history 4A", () => {
  it("keeps operational association separate from billed-to truth", () => {
    expect(modelSource).toContain('.eq("contractor_id", params.contractorId)');
    expect(modelSource).toContain("listInvoiceLedgerRows");
    expect(modelSource).toContain('contractor: params.contractorId');
    expect(profileSource).toContain("Operational association only; this does not determine who was billed.");
    expect(profileSource).toContain("Only invoices whose frozen billing recipient is this contractor.");
  });

  it("renders payment balance and delivery context with direct invoice links", () => {
    expect(profileSource).toContain("financialHistory.totalPaidCents");
    expect(profileSource).toContain("financialHistory.totalOpenCents");
    expect(profileSource).toContain("invoice.communicationStateLabel");
    expect(profileSource).toContain("invoice.invoiceHref");
  });
});
