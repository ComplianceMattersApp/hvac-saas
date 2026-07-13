import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const v2JobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/v2/page.tsx"),
  "utf-8",
);

describe("job detail v2 ECC retest bridge wiring", () => {
  it("imports the retest server actions on the canonical v2 desktop page", () => {
    expect(v2JobDetailSource).toContain("confirmEccRetestReadyFromForm");
    expect(v2JobDetailSource).toContain("scheduleRetestNowFromForm");
    expect(v2JobDetailSource).toContain("createRetestJobFromForm");
  });

  it("renders the Confirm Retest Ready → Schedule Retest bridge in-page", () => {
    expect(v2JobDetailSource).toContain("Confirm Retest Ready");
    expect(v2JobDetailSource).toContain("Schedule Retest Now");
    expect(v2JobDetailSource).toContain("Move to Needs Scheduling");
    expect(v2JobDetailSource).toContain('name="parent_job_id"');
    expect(v2JobDetailSource).toContain('name="scheduled_date"');
    expect(v2JobDetailSource).toContain('name="window_start"');
    expect(v2JobDetailSource).toContain('name="window_end"');
    expect(v2JobDetailSource).toContain("formAction={async (formData: FormData) =>");
  });

  it("gates the bridge on the retest surface, ECC job type, ops status, and no active child", () => {
    expect(v2JobDetailSource).toContain("const showConfirmRetestReady =");
    expect(v2JobDetailSource).toContain("const showScheduleRetest =");
    expect(v2JobDetailSource).toContain("retestSurfaceEnabled");
    expect(v2JobDetailSource).toContain("!hasActiveRetestChild");
    expect(v2JobDetailSource).toContain('opsStatus === "retest_needed"');
    expect(v2JobDetailSource).toContain('["failed", "pending_office_review"].includes(opsStatus)');
  });

  it("reads at most one live linked retest child, excluding cancelled/deleted", () => {
    expect(v2JobDetailSource).toContain('.eq("parent_job_id", jobId)');
    expect(v2JobDetailSource).toContain('.neq("status", "cancelled")');
    expect(v2JobDetailSource).toContain('.is("deleted_at", null)');
  });
});
