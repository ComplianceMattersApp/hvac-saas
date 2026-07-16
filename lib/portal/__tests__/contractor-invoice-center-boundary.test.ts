import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const model = readFileSync(resolve(__dirname, "../contractor-invoice-center.ts"), "utf8");
const listPage = readFileSync(resolve(__dirname, "../../../app/portal/invoices/page.tsx"), "utf8");
const detailPage = readFileSync(resolve(__dirname, "../../../app/portal/invoices/[id]/page.tsx"), "utf8");
const printPage = readFileSync(resolve(__dirname, "../../../app/portal/invoices/[id]/print/page.tsx"), "utf8");

describe("contractor invoice center authorization boundary", () => {
  it("requires frozen contractor billing identity on list and detail reads", () => {
    expect(model.match(/\.eq\("bill_to_kind", "contractor"\)/g)).toHaveLength(2);
    expect(model.match(/\.eq\("bill_to_contractor_id", portal\.contractorId\)/g)).toHaveLength(2);
    expect(model.match(/\.eq\("account_owner_user_id", portal\.accountOwnerUserId\)/g)).toHaveLength(2);
    expect(model.match(/\.eq\("status", "issued"\)/g)).toHaveLength(2);
  });

  it("does not derive visibility from jobs or customers", () => {
    expect(model).not.toContain('.from("jobs")');
    expect(model).not.toContain('.from("customers")');
    expect(model).not.toContain('.eq("contractor_id"');
  });

  it("reuses the same scoped detail loader for screen and printable record", () => {
    expect(detailPage).toContain("loadContractorBilledInvoice");
    expect(printPage).toContain("loadContractorBilledInvoice");
    expect(detailPage).toContain("createTenantInvoicePaymentLink");
    expect(listPage).toContain("Only invoices where your company is the billing recipient appear here.");
  });
});
