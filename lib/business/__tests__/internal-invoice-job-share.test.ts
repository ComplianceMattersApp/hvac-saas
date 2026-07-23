import { describe, expect, it } from "vitest";
import { resolveInternalInvoiceJobShareCents } from "@/lib/business/internal-invoice";

describe("job-scoped consolidated invoice totals", () => {
  it("returns only the current job's consolidated line-item share", () => {
    expect(resolveInternalInvoiceJobShareCents({
      job_id: "job-1",
      total_cents: 50_000,
      member_job_ids: ["job-1", "job-2"],
      line_items: [
        { source_job_id: "job-1", line_subtotal: 25_000 },
        { source_job_id: "job-2", line_subtotal: 25_000 },
      ],
    } as any, "job-2")).toBe(25_000);
  });

  it("preserves the invoice total for an ordinary single-job invoice", () => {
    expect(resolveInternalInvoiceJobShareCents({
      job_id: "job-1",
      total_cents: 50_000,
      member_job_ids: ["job-1"],
      line_items: [{ source_job_id: "job-1", line_subtotal: 25_000 }],
    } as any, "job-1")).toBe(50_000);
  });
});
