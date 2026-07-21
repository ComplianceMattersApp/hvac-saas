import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "lib/actions/consolidated-invoice-actions.ts"),
  "utf8",
);

describe("consolidated invoice action wiring", () => {
  it("requires current financial authority and internal invoicing mode", () => {
    expect(source).toContain("canManageInvoiceLifecycle");
    expect(source).toContain('billingMode !== "internal_invoicing"');
    expect(source).toContain("requireInternalUser");
  });

  it("uses one transactional RPC and does not independently insert financial rows", () => {
    expect(source).toContain('supabase.rpc("create_consolidated_invoice_draft_v1"');
    expect(source).not.toMatch(/\.from\(["']internal_invoices["']\)\s*\.insert/);
    expect(source).not.toMatch(/\.from\(["']internal_invoice_jobs["']\)\s*\.insert/);
    expect(source).not.toMatch(/\.from\(["']internal_invoice_line_items["']\)\s*\.insert/);
  });

  it("has no issue, send, payment, stripe, or qbo side effects", () => {
    expect(source).not.toContain("autoSyncIssuedInvoiceToQbo");
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("internal_invoice_payments");
    expect(source).not.toContain("stripe");
  });

  it("passes selected manual job lines into the same atomic creation payload", () => {
    expect(source).toContain("manualLineBySelectedJob");
    expect(source).toContain("manualLineByJobId");
    expect(source).toContain("manual_unit_price_");
  });
});
