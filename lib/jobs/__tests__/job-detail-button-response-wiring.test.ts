import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const mobileStatusSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobStatusActionSurface.tsx"),
  "utf8",
);

const fieldActionButtonSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/JobFieldActionButton.tsx"),
  "utf8",
);

const pendingRouteLinkSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/PendingRouteLink.tsx"),
  "utf8",
);

const combinedJobDetailSource = `${jobDetailSource}\n${mobileStatusSource}`;

describe("job detail button response wiring", () => {
  it("uses action-specific pending labels without optimistic final lifecycle state", () => {
    expect(fieldActionButtonSource).toContain('"Marking On The Way..."');
    expect(fieldActionButtonSource).toContain('"Starting Work..."');
    expect(fieldActionButtonSource).toContain('"Completing..."');
    expect(fieldActionButtonSource).toContain('"Saving..."');
    expect(fieldActionButtonSource).toContain("const isPending = pending || submitted;");
    expect(fieldActionButtonSource).toContain("disabled={isPending}");
    expect(fieldActionButtonSource).toContain("aria-busy={isPending}");
    expect(fieldActionButtonSource).toContain("currentStatus === \"open\"");
    expect(fieldActionButtonSource).toContain("currentStatus === \"on_the_way\"");
    expect(fieldActionButtonSource).toContain("currentStatus === \"in_process\"");
    expect(fieldActionButtonSource).not.toContain('setCurrentStatus("on_the_way")');
    expect(fieldActionButtonSource).not.toContain('setCurrentStatus("in_process")');
    expect(fieldActionButtonSource).not.toContain('setCurrentStatus("completed")');
  });

  it("preserves lifecycle submit wiring, hidden fields, and field-status return anchors", () => {
    expect(fieldActionButtonSource).toContain("action={advanceJobStatusFromForm}");
    expect(fieldActionButtonSource).toContain('name="job_id"');
    expect(fieldActionButtonSource).toContain('name="current_status"');
    expect(fieldActionButtonSource).toContain('name="tab"');
    expect(fieldActionButtonSource).toContain('name="auto_schedule_confirmed"');
    expect(jobDetailSource).toContain('id="field-status-actions"');
    expect(jobDetailSource).toContain('value={`/jobs/${job.id}?tab=${tab}#field-status-actions`}');
  });

  it("uses immediate pending feedback for on-the-way revert on mobile and desktop", () => {
    expect(combinedJobDetailSource).toContain("revertOnTheWayFromForm");
    expect(combinedJobDetailSource).toContain("<ImmediateSubmitButton");
    expect(combinedJobDetailSource).toContain('pendingText="Reverting..."');
    expect(combinedJobDetailSource).not.toContain('loadingText="Undoing..."');
  });

  it("adds pending feedback to Tests and Equipment route buttons without breaking link behavior", () => {
    expect(jobDetailSource).toContain('import PendingRouteLink from "./_components/PendingRouteLink";');
    expect(combinedJobDetailSource).toContain("<PendingRouteLink");
    expect(combinedJobDetailSource).toContain('href={`/jobs/${job.id}/tests`}');
    expect(jobDetailSource).toContain('href={`/jobs/${job.id}/info?f=equipment`}');
    expect(combinedJobDetailSource).toContain("Open Tests Workspace");
    expect(jobDetailSource).toContain("Manage Equipment");
    expect(pendingRouteLinkSource).toContain("!event.metaKey");
    expect(pendingRouteLinkSource).toContain("!event.ctrlKey");
    expect(pendingRouteLinkSource).toContain('event.currentTarget.target !== "_blank"');
    expect(pendingRouteLinkSource).toContain('!event.currentTarget.hasAttribute("download")');
    expect(pendingRouteLinkSource).toContain("aria-busy={isPending}");
    expect(pendingRouteLinkSource).toContain("aria-disabled={isPending || undefined}");
    expect(pendingRouteLinkSource).toContain("event.preventDefault();");
    expect(pendingRouteLinkSource).toContain('loadingLabel = "Opening..."');
  });

  it("keeps the mobile primary lifecycle action available through the shared button", () => {
    expect(mobileStatusSource).toContain("<JobFieldActionButton");
    expect(mobileStatusSource).toContain('variant="fieldMode"');
    expect(mobileStatusSource).toContain('completeLabel="Mark Work Complete"');
    expect(mobileStatusSource).toContain("PendingRouteLink");
  });
});
