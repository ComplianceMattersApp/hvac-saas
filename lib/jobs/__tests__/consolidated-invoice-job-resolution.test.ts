import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const invoiceBusiness = readFileSync(resolve(process.cwd(), "lib/business/internal-invoice.ts"), "utf8");
const billingState = readFileSync(resolve(process.cwd(), "lib/business/job-billing-state.ts"), "utf8");
const jobPage = readFileSync(resolve(process.cwd(), "app/jobs/[id]/page.tsx"), "utf8");
const invoicePage = readFileSync(resolve(process.cwd(), "app/jobs/[id]/invoice/page.tsx"), "utf8");
const invoiceActions = readFileSync(resolve(process.cwd(), "lib/actions/internal-invoice-actions.ts"), "utf8");

describe("consolidated invoice job compatibility", () => {
  it("resolves active and void invoice history through durable membership", () => {
    expect(invoiceBusiness).toContain('.from("internal_invoice_jobs")');
    expect(invoiceBusiness).toContain('.eq("job_id", jobId)');
    expect(invoiceBusiness).toContain('resolveLatestVoidedInternalInvoiceByJobId');
    expect(invoiceBusiness).toContain("member_job_ids");
  });

  it("extends closeout invoice status to non-anchor member jobs", () => {
    expect(billingState).toContain("unresolvedJobIds");
    expect(billingState).toContain('internal_invoices!inner(status, invoice_number, issued_at, invoice_kind)');
    expect(billingState).toContain('internalInvoiceByJobId.set(jobId');
  });

  it("opens the same workspace from any included job and shows consolidated context", () => {
    expect(invoicePage).toContain("requestedInvoice.member_job_ids?.length");
    expect(jobPage).toContain("resolveInternalInvoiceByJobId({ supabase, jobId })");
    expect(jobPage).toContain("Consolidated contractor invoice - included with");
  });

  it("applies issue and void lifecycle projection to all included jobs", () => {
    expect(invoiceActions).toContain("context.invoiceJobIds.length > 1");
    expect(invoiceActions).toContain("Every consolidated invoice job must remain completed before issue.");
    expect(invoiceActions).toContain("included_job_count: context.invoiceJobIds.length");
    expect(invoiceActions).toContain("jobUpdate.in('id', context.invoiceJobIds)");
  });
});
