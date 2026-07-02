import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const legacyJobDetailSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "[id]", "page.tsx"),
  "utf8",
);

const middlewareSource = readFileSync(
  path.join(process.cwd(), "middleware.ts"),
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
  it("routes desktop job detail traffic to desktop V2 while preserving original mobile detail", () => {
    expect(legacyJobDetailSource).not.toContain("function buildV2JobDetailRedirectPath");
    expect(legacyJobDetailSource).not.toContain("redirect(buildV2JobDetailRedirectPath(jobId, sp));");
    expect(legacyJobDetailSource).toContain("const MobileJobDetailMobileComponent = useMobileV2Preview");
    expect(legacyJobDetailSource).toContain("? MobileJobDetailV2Preview");
    expect(legacyJobDetailSource).toContain(": MobileJobDetailCurrent");
    expect(middlewareSource).toContain('const JOB_DETAIL_PATH_RE = /^\\/jobs\\/([^/]+)$/;');
    expect(middlewareSource).toContain('const JOB_DETAIL_V2_PATH_RE = /^\\/jobs\\/([^/]+)\\/v2$/;');
    expect(middlewareSource).toContain('url.pathname = `/jobs/${jobDetailMatch[1]}/v2`;');
    expect(middlewareSource).toContain('url.pathname = `/jobs/${jobDetailV2Match[1]}`;');
    expect(middlewareSource).toContain('matcher: ["/jobs/:id", "/jobs/:id/v2"]');
  });

  it("does not offer a stale desktop V2 legacy detail escape", () => {
    expect(v2JobDetailSource).not.toContain('href: `/jobs/${jobId}?legacy=1`');
    expect(v2JobDetailSource).not.toContain('label: "Open Legacy Detail"');
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
