import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const reportPageSource = readFileSync(
  resolve(__dirname, "../../../app/reports/invoices/page.tsx"),
  "utf8",
);

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

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

  it("keeps the job detail invoice send form pinned to the concrete invoice id", () => {
    expect(jobDetailSource).toContain("<form action={sendInternalInvoiceEmailFromForm}");
    expect(jobDetailSource).toContain('name="invoice_id" value={internalInvoiceTruth.id}');
  });
});
