import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

describe("job detail V2 Pulse brief card wiring", () => {
  it("uses the V2 Pulse brief read model for the operational Job Brief card", () => {
    expect(jobPageSource).toContain(
      'import {\n  buildV2PulseJobBriefContinuityLine,\n  buildV2PulseJobBriefPrimaryLine,\n} from "@/lib/jobs/job-detail-v2-brief-card";',
    );
    expect(jobPageSource).toContain("const pulseJobBriefPrimaryLine = buildV2PulseJobBriefPrimaryLine({");
    expect(jobPageSource).toContain("contractorName,");
    expect(jobPageSource).toContain("city: serviceCity,");
    expect(jobPageSource).toContain("const pulseJobBriefContinuityLine = buildV2PulseJobBriefContinuityLine({");
    expect(jobPageSource).toContain("pulseJobBriefCardContent={pulseJobBriefCardContent}");
  });

  it("keeps the V2 Pulse Service Location card present and separate from Job Brief", () => {
    expect(jobPageSource).toContain("pulseServiceLocationCardContent={pulseServiceLocationCardContent}");
    expect(jobPageSource).toContain('data-v2-zone="pulse-service-location-card"');
    expect(jobPageSource).toContain("Correct address");
    expect(jobPageSource).toContain("Add new location");
  });

  it("keeps the Pulse Job Brief card as a solid statement block without the old metadata chip array", () => {
    expect(jobPageSource).toContain('data-v2-zone="pulse-job-brief-card"');
    expect(jobPageSource).toContain("bg-blue-600");
    expect(jobPageSource).not.toContain("pulseJobBriefMetaItems");
    expect(jobPageSource).not.toContain("View full brief");
  });
});
