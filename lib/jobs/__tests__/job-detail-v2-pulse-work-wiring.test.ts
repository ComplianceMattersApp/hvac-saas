import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("job detail V2 Pulse work to perform wiring", () => {
  it("uses the V2 Pulse work read model for the operational Work to Perform card", () => {
    expect(jobPageSource).toContain('import { buildV2PulseWorkToPerformCardModel } from "@/lib/jobs/job-detail-v2-work-card";');
    expect(jobPageSource).toContain("const pulseWorkToPerformModel = buildV2PulseWorkToPerformCardModel({");
    expect(jobPageSource).toContain("summary: visitScopeSummary,");
    expect(jobPageSource).toContain("items: visitScopeItems,");
    expect(jobPageSource).toContain("pulseWorkToPerformCardContent={pulseWorkToPerformCardContent}");
    expect(jobPageSource).toContain('data-v2-zone="pulse-work-to-perform-card"');
  });

  it("removes placeholder work copy and keeps Service Location separate", () => {
    expect(jobPageSource).not.toContain("5 placeholder items");
    expect(jobPageSource).not.toContain("Diagnose cooling issue, inspect compressor, verify airflow, and confirm performance.");
    expect(jobPageSource).toContain('data-v2-zone="pulse-service-location-card"');
    expect(jobPageSource).toContain("Correct address");
    expect(jobPageSource).toContain("Add new location");
  });

  it("keeps the work card read-only with the neutral empty fallback", () => {
    expect(jobPageSource).toContain("No work scope recorded.");
    expect(jobPageSource).toContain("Read only");
    expect(jobPageSource).not.toContain("View scope");
  });
});
