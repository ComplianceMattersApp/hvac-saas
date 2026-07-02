import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const legacyJobDetailSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "page.tsx"),
  "utf8",
);

const v2JobDetailSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "v2", "page.tsx"),
  "utf8",
);

const v2SchedulePanelSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "v2", "_components", "SchedulePanel.tsx"),
  "utf8",
);

describe("job detail V2 entrypoint", () => {
  it("routes normal legacy job detail traffic to V2 while preserving a legacy fallback flag", () => {
    expect(legacyJobDetailSource).toContain("function buildV2JobDetailRedirectPath");
    expect(legacyJobDetailSource).toContain('if (key === "legacy") continue;');
    expect(legacyJobDetailSource).toContain('legacyRaw === "1"');
    expect(legacyJobDetailSource).toContain("redirect(buildV2JobDetailRedirectPath(jobId, sp));");
    expect(legacyJobDetailSource).toContain('/jobs/${encodeURIComponent(jobId)}/v2');
  });

  it("keeps an escape hatch from V2 back to the original detail page", () => {
    expect(v2JobDetailSource).toContain('href: `/jobs/${jobId}?legacy=1`');
    expect(v2JobDetailSource).toContain('label: "Open Legacy Detail"');
  });

  it("uses full-width schedule action wording in the V2 right rail", () => {
    expect(v2SchedulePanelSource).toContain('width: "100%"');
    expect(v2SchedulePanelSource).toContain('height: "42px"');
    expect(v2SchedulePanelSource).toContain('{hasSchedule ? "Reschedule" : "Schedule Job"}');
  });

  it("does not duplicate the top toolbar Back to Ops link in V2 quick links", () => {
    expect(v2JobDetailSource).not.toContain('label: "Back to Ops"');
  });
});
