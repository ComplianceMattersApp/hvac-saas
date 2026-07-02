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
  it("selects Desktop V2 and Mobile V2 from the canonical job detail route", () => {
    expect(legacyJobDetailSource).not.toContain("function buildV2JobDetailRedirectPath");
    expect(legacyJobDetailSource).not.toContain("redirect(buildV2JobDetailRedirectPath(jobId, sp));");
    expect(legacyJobDetailSource).toContain('import DesktopJobDetailV2Page from "./v2/page";');
    expect(legacyJobDetailSource).toContain("const MobileJobDetailMobileComponent = forceCurrentMobileLayout");
    expect(legacyJobDetailSource).toContain("? MobileJobDetailCurrent");
    expect(legacyJobDetailSource).toContain(": MobileJobDetailV2Preview");
    expect(legacyJobDetailSource).toContain("const forceCurrentDesktopLayout =");
    expect(legacyJobDetailSource).toContain('desktopLayoutMode === "current"');
    expect(legacyJobDetailSource).toContain('desktopLayoutMode === "classic"');
    expect(legacyJobDetailSource).toContain('legacyMode === "1"');
    expect(legacyJobDetailSource).toContain("<DesktopJobDetailV2Page");
    expect(legacyJobDetailSource).not.toContain("const mobileV2ExplicitPreviewAllowed =");
    expect(legacyJobDetailSource).not.toContain("const mobileV2OwnerDefaultAllowed =");
    expect(legacyJobDetailSource).not.toContain("const mobileV2UniversalDefaultAllowed =");
  });

  it("keeps /jobs/[id]/v2 as the Desktop V2 compatibility route", () => {
    expect(v2JobDetailSource).toContain("export default async function JobDetailV2Page");
    expect(v2JobDetailSource).not.toContain("redirect(`/jobs/${jobId}`");
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
