import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const actionsSrc = readFileSync(resolve(__dirname, "../qbo-sync-actions.ts"), "utf-8");
const invoicePageSrc = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/invoice/page.tsx"),
  "utf-8",
);

describe("per-invoice QBO sync (force/retry) wiring", () => {
  it("exposes syncSingleInvoiceToQboFromForm going through the cutoff-free single path", () => {
    expect(actionsSrc).toContain("export async function syncSingleInvoiceToQboFromForm");
    // uses syncInvoiceToQbo (single, no connect-time cutoff), not the bulk run
    expect(actionsSrc).toContain("syncInvoiceToQbo(");
    expect(actionsSrc).toContain('requireInternalRole("admin"');
  });

  it("guards not-configured and not-connected before syncing", () => {
    const start = actionsSrc.indexOf("export async function syncSingleInvoiceToQboFromForm");
    const end = actionsSrc.indexOf("export async function syncAllPendingInvoicesToQboFromForm", start);
    const fn = actionsSrc.slice(start, end);
    expect(fn).toContain("getQboAvailability().available");
    expect(fn).toContain("getQboConnectionForAccount");
    expect(fn).toContain("internal_invoice_qbo_not_connected");
    expect(fn).toContain("internal_invoice_qbo_synced");
  });

  it("renders a Sync to QuickBooks button on issued invoices", () => {
    expect(invoicePageSrc).toContain("syncSingleInvoiceToQboFromForm");
    expect(invoicePageSrc).toContain("Sync to QuickBooks");
    expect(invoicePageSrc).toContain("getQboAvailability().available");
    // banner copy present
    expect(invoicePageSrc).toContain("internal_invoice_qbo_synced");
    expect(invoicePageSrc).toContain("internal_invoice_qbo_not_connected");
  });
});
