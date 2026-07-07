import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const portalDashboardSource = readFileSync(
  resolve(__dirname, "../../../app/portal/page.tsx"),
  "utf8"
);

describe("portal dashboard contractor-safe status parity", () => {
  it("selects closeout and accepted-correction event inputs used by the jobs list projection", () => {
    expect(portalDashboardSource).toContain("field_complete");
    expect(portalDashboardSource).toContain("certs_complete");
    expect(portalDashboardSource).toContain("invoice_complete");
    expect(portalDashboardSource).toContain("failure_resolved_by_correction_review");
  });

  it("passes closeout completion fields into resolveContractorIssues", () => {
    expect(portalDashboardSource).toContain("field_complete: Boolean(job.field_complete)");
    expect(portalDashboardSource).toContain("certs_complete: Boolean(job.certs_complete)");
    expect(portalDashboardSource).toContain("invoice_complete: Boolean(job.invoice_complete)");
  });
});
