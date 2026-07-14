import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const actionsSrc = readFileSync(
  resolve(__dirname, "../internal-invoice-actions.ts"),
  "utf-8",
);
const invoicePageSrc = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf-8",
);

describe("Bill To control + re-pull wiring", () => {
  it("exposes updateInvoiceBillToFromForm and shares the snapshot helper with draft creation", () => {
    expect(actionsSrc).toContain("export async function updateInvoiceBillToFromForm");
    expect(actionsSrc).toContain("function buildDraftBillingSnapshot");
    // both draft creation and re-pull build the snapshot via the shared helper
    const helperCalls = actionsSrc.match(/buildDraftBillingSnapshot\(\{/g) ?? [];
    expect(helperCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("only re-pulls DRAFT invoices and validates the recipient", () => {
    const start = actionsSrc.indexOf("export async function updateInvoiceBillToFromForm");
    const end = actionsSrc.indexOf("export async function createInternalInvoiceDraftFromForm", start);
    const fn = actionsSrc.slice(start, end);

    expect(fn).toContain("context.invoice.status !== 'draft'");
    expect(fn).toContain("requested !== 'customer' && requested !== 'contractor' && requested !== 'other'");
    // contractor billing requires an assigned contractor
    expect(fn).toContain("requested === 'contractor' && !String(context.job.contractor_id");
    // it updates the job classification AND re-pulls the invoice snapshot
    expect(fn).toContain(".from('jobs')");
    expect(fn).toContain("billing_recipient: requested");
    expect(fn).toContain(".from('internal_invoices')");
  });

  it("renders the Bill To selector on the invoice workspace wired to the action", () => {
    expect(invoicePageSrc).toContain("updateInvoiceBillToFromForm");
    expect(invoicePageSrc).toContain("action={updateInvoiceBillToFromForm}");
    expect(invoicePageSrc).toContain('name="billing_recipient"');
    expect(invoicePageSrc).toContain(">Customer<");
    expect(invoicePageSrc).toContain(">Other / third party<");
  });

  it("maps the Bill To banners to human copy", () => {
    expect(invoicePageSrc).toContain("internal_invoice_bill_to_updated");
    expect(invoicePageSrc).toContain("internal_invoice_bill_to_no_contractor");
  });
});
