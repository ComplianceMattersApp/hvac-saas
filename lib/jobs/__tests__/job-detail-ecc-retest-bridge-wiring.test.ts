import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf-8",
);

const serviceChainSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/DeferredServiceChainPanelBody.tsx"),
  "utf-8",
);

describe("job detail ECC retest bridge wiring", () => {
  it("wires confirmed Retest Ready before moving a linked retest to scheduling", () => {
    expect(jobDetailSource).toContain("confirmEccRetestReadyFromForm");
    expect(jobDetailSource).toContain("scheduleRetestNowFromForm");
    expect(jobDetailSource).toContain("Confirm Retest Ready");
    expect(jobDetailSource).toContain("Retest Ready");
    expect(jobDetailSource).toContain("Creates the linked retest job and schedules it immediately.");
    expect(jobDetailSource).toContain("Creates a linked retest job and places it in the scheduling queue.");
    expect(jobDetailSource).toContain("Schedule Retest Now");
    expect(jobDetailSource).toContain("Move to Needs Scheduling");
    expect(jobDetailSource).toContain('name="scheduled_date"');
    expect(jobDetailSource).toContain('name="window_start"');
    expect(jobDetailSource).toContain('name="window_end"');
    expect(jobDetailSource).toContain('id="next-service-action"');
    expect(jobDetailSource).not.toContain(">Create Retest Job<");
  });

  it("only exposes schedule-now for confirmed Retest Ready parents without an active child", () => {
    expect(jobDetailSource).toContain("const showRetestSection =");
    expect(jobDetailSource).toContain("!hasActiveRetestChild");
    expect(jobDetailSource).toContain('normalizedJobOpsStatus === "retest_needed"');
    expect(jobDetailSource).not.toContain('event_type === "retest_ready_requested" && showRetestSection');
  });

  it("shows continued parents as passive once a linked retest child exists", () => {
    expect(jobDetailSource).toContain("showLinkedRetestCreated");
    expect(jobDetailSource).toContain("Linked Retest Created");
    expect(jobDetailSource).toContain("Retest Scheduled");
    expect(jobDetailSource).toContain("activeRetestChildScheduled");
    expect(jobDetailSource).toContain("Open Linked Retest");
    expect(serviceChainSource).toContain("retestParentIdsWithActiveChild");
    expect(serviceChainSource).toContain("Linked Retest Created");
  });
});
