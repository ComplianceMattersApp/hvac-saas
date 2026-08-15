import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const reportPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/invoices/page.tsx"),
  "utf8",
);

// Desktop job detail is rendered by the V2 surface, so the job detail page
// spans the route shell and the V2 page it delegates to.
const jobDetailSource = [
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  resolve(__dirname, "../../../app/jobs/[id]/v2/page.tsx"),
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("invoice ledger send action wiring", () => {
  it("uses the canonical invoice email action from issued invoice report rows", () => {
    expect(reportPageSource).toContain('import { sendInternalInvoiceEmailFromForm } from "@/lib/actions/internal-invoice-actions";');
    expect(reportPageSource).toContain("canManageInvoiceLifecycle");
    expect(reportPageSource).toContain("canSendInvoiceLifecycle && row.invoiceStatus === \"issued\"");
    expect(reportPageSource).toContain("<form action={sendInternalInvoiceEmailFromForm}");
    expect(reportPageSource).toContain('name="job_id" value={row.jobId}');
    expect(reportPageSource).toContain('name="invoice_id" value={row.invoiceId}');
    expect(reportPageSource).toContain('name="recipient_email" value={row.recipientEmail}');
    expect(reportPageSource).toContain('name="return_to" value={reportReturnTo}');
    expect(reportPageSource).toContain("Add recipient");
  });

  it("does not duplicate the invoice send form on the job detail page (handled by the Invoice Workspace)", () => {
    expect(jobDetailSource).not.toContain("sendInternalInvoiceEmailFromForm");
    expect(jobDetailSource).toContain("/invoice#invoice-workspace");
  });
});
