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

  it("uses immediate pending feedback for on-the-way revert on mobile and desktop primary action areas", () => {
    const desktopActionsStart = jobDetailSource.indexOf('id="field-status-actions"');
    const desktopActionsEnd = jobDetailSource.indexOf("{showFieldOutcomePanel ? (", desktopActionsStart);
    const desktopActionsSource = jobDetailSource.slice(desktopActionsStart, desktopActionsEnd);
    const mobileActionsStart = mobileStatusSource.indexOf("<JobFieldActionButton");
    const mobileActionsEnd = mobileStatusSource.indexOf("</div>", mobileStatusSource.indexOf("{onTheWayUndoEligibility.eligible ?", mobileActionsStart));
    const mobileActionsSlice = mobileStatusSource.slice(mobileActionsStart, mobileActionsEnd);

    expect(desktopActionsSource).toContain("{onTheWayUndoEligibility.eligible ? (");
    expect(desktopActionsSource).toContain("revertOnTheWayFromForm");
    expect(desktopActionsSource).toContain("<ImmediateSubmitButton");
    expect(desktopActionsSource).toContain('pendingText="Reverting..."');
    expect(desktopActionsSource).toContain("Undo On the Way");
    expect(mobileActionsSlice).toContain("{onTheWayUndoEligibility.eligible ? (");
    expect(mobileActionsSlice).toContain("revertOnTheWayFromForm");
    expect(mobileActionsSlice).toContain('pendingText="Reverting..."');
    expect(mobileActionsSlice).toContain("Undo On the Way");
    expect(combinedJobDetailSource).toContain("revertOnTheWayFromForm");
    expect(combinedJobDetailSource).toContain("<ImmediateSubmitButton");
    expect(combinedJobDetailSource).toContain('pendingText="Reverting..."');
    expect(combinedJobDetailSource).not.toContain('loadingText="Undoing..."');
  });

  it("confirms only unscheduled Mark On The Way submits before using the existing auto-schedule path", () => {
    expect(fieldActionButtonSource).toContain("const needsScheduleConfirm = currentStatus === \"open\" && !hasFullSchedule;");
    expect(fieldActionButtonSource).toContain("if (!needsScheduleConfirm)");
    expect(fieldActionButtonSource).toContain("window.confirm(");
    expect(fieldActionButtonSource).toContain(
      "This job is not scheduled. Marking On The Way will add a short schedule window around now so the visit has a time block. Continue?",
    );
    expect(fieldActionButtonSource).toContain('input[name="auto_schedule_confirmed"]');
    expect(fieldActionButtonSource).toContain('if (hidden) hidden.value = "1";');
    expect(fieldActionButtonSource).toContain('<input type="hidden" name="auto_schedule_confirmed" value="0" />');
    expect(jobDetailSource).toContain("hasFullSchedule={hasFullSchedule}");
    expect(mobileStatusSource).toContain("hasFullSchedule={hasFullSchedule}");
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
