import { existsSync, readFileSync } from "node:fs";
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
const middlewarePath = path.join(process.cwd(), "middleware.ts");

describe("job detail V2 entrypoint", () => {
  it("selects Desktop V2 and Mobile V2 from the canonical job detail route", () => {
    const mobileBranchStart = legacyJobDetailSource.indexOf('<div className="block lg:hidden">');
    const desktopBranchStart = legacyJobDetailSource.indexOf('<div className="hidden lg:block">');
    const desktopV2RenderStart = legacyJobDetailSource.indexOf("<DesktopJobDetailV2Page");

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
    expect(mobileBranchStart).toBeGreaterThan(-1);
    expect(desktopBranchStart).toBeGreaterThan(mobileBranchStart);
    expect(desktopV2RenderStart).toBeGreaterThan(desktopBranchStart);
    expect(legacyJobDetailSource.slice(mobileBranchStart, desktopBranchStart)).toContain("<MobileJobDetailMobileComponent");
    expect(legacyJobDetailSource.slice(mobileBranchStart, desktopBranchStart)).not.toContain("<DesktopJobDetailV2Page");
    expect(existsSync(middlewarePath)).toBe(false);
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

  it("keeps the V2 desktop right rail sticky with an internal scroll body", () => {
    expect(v2JobDetailSource).toContain('const DESKTOP_STICKY_HEADER_OFFSET = "72px";');
    expect(v2JobDetailSource).toContain("top: DESKTOP_STICKY_HEADER_OFFSET");
    expect(v2JobDetailSource).toContain("maxHeight: `calc(100dvh - ${DESKTOP_STICKY_HEADER_OFFSET} - 16px)`");
    expect(v2JobDetailSource).toContain('overflow: "hidden"');
    expect(v2JobDetailSource).toContain('flex: "0 0 auto"');
    expect(v2JobDetailSource).toContain('overflowY: "auto"');
    expect(v2JobDetailSource).toContain('overscrollBehavior: "contain"');
    expect(v2JobDetailSource).toContain('scrollbarGutter: "stable"');
    expect(v2JobDetailSource).toContain("scrollMarginTop: DESKTOP_SECTION_SCROLL_MARGIN_TOP");
  });
});
