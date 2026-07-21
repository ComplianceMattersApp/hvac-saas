import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "app/billing/ready-to-bill/page.tsx"), "utf8");
const selection = readFileSync(resolve(process.cwd(), "app/billing/ready-to-bill/ReadyToBillSelection.tsx"), "utf8");
const invoiceReport = readFileSync(resolve(process.cwd(), "app/reports/invoices/page.tsx"), "utf8");

describe("Ready to Bill page wiring", () => {
  it("is discoverable from invoices without adding work to ops or today", () => {
    expect(invoiceReport).toContain('href="/billing/ready-to-bill"');
    expect(invoiceReport).toContain("Ready to Bill");
  });

  it("groups first and requires deliberate job selection", () => {
    expect(page).toContain("groups.map");
    expect(page).toContain("selectedGroup");
    expect(selection).toContain('type="checkbox"');
    expect(selection).toContain("selected.size < 2");
    expect(selection).toContain("Combined expected total");
  });

  it("creates a draft through the consolidated action without automatic issue or send controls", () => {
    expect(selection).toContain("createConsolidatedInvoiceDraftFromForm");
    expect(selection).toContain("Create Consolidated Draft Invoice");
    expect(selection).not.toContain("Issue Invoice");
    expect(selection).not.toContain("Send Invoice");
    expect(selection).not.toContain("Charge");
  });

  it("collects per-job manual invoice details when Work Items are unavailable", () => {
    expect(page).toContain("invoiceDetailsJobCount");
    expect(selection).toContain("manualDetailsRequired");
    expect(selection).toContain("manual_title_");
    expect(selection).toContain("manual_quantity_");
    expect(selection).toContain("manual_unit_price_");
  });

  it("excludes legacy billed and closed jobs as well as modern billing dispositions", () => {
    const readModel = readFileSync(resolve(process.cwd(), "lib/business/ready-to-bill.ts"), "utf8");
    expect(readModel).toContain('invoice_complete.is.null,invoice_complete.eq.false');
    expect(readModel).toContain('ops_status.is.null,ops_status.neq.closed');
    expect(readModel).toContain('.is("billing_disposition", null)');
  });
});
