import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const jobActionsSource = readFileSync(
  resolve(__dirname, "../job-actions.ts"),
  "utf-8",
);

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf-8",
);

const waitingQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"),
  "utf-8",
);

function extractCreateNextVisitActionBlock() {
  const start = jobActionsSource.indexOf("export async function createNextServiceVisitFromForm");
  const end = jobActionsSource.indexOf("export async function createCallbackVisitFromForm", start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Could not find createNextServiceVisitFromForm block boundaries.");
  }
  return jobActionsSource.slice(start, end);
}

describe("return visit action wiring", () => {
  it("supports explicit return_visit intent while preserving existing next-visit behavior", () => {
    const actionBlock = extractCreateNextVisitActionBlock();

    expect(actionBlock).toContain('const visitIntentRaw = String(formData.get("visit_intent") || "").trim().toLowerCase();');
    expect(actionBlock).toContain('const isExplicitReturnVisitIntent = visitIntentRaw === "return_visit";');
    expect(actionBlock).toContain('const childVisitType = isExplicitReturnVisitIntent');
    expect(actionBlock).toContain('? "return_visit"');
    expect(actionBlock).toContain('normalizeServiceVisitType(String(sourceJob.service_visit_type ?? "").trim()) ?? "return_visit";');
  });

  it("keeps return visits unscheduled, office-owned, and continuity-linked", () => {
    const actionBlock = extractCreateNextVisitActionBlock();

    expect(actionBlock).toContain('service_case_id: serviceCaseId');
    expect(actionBlock).toContain('scheduled_date: null');
    expect(actionBlock).toContain('status: "open"');
    expect(actionBlock).toContain('ops_status: "need_to_schedule"');
    expect(actionBlock).toContain('service_visit_outcome: "follow_up_required"');
  });

  it("writes source and child job events with explicit visit intent metadata", () => {
    const actionBlock = extractCreateNextVisitActionBlock();

    expect(actionBlock).toContain('event_type: "service_next_visit_created"');
    expect(actionBlock).toContain('event_type: "created_from_service_visit"');
    expect(actionBlock).toContain('visit_intent: isExplicitReturnVisitIntent ? "return_visit" : "next_service_visit"');
    expect(actionBlock).toContain("child_service_visit_type: childVisitType");
  });

  it("does not add callback creation wiring in return-visit action surfaces", () => {
    const actionBlock = extractCreateNextVisitActionBlock();

    expect(actionBlock).not.toContain('service_visit_type: "callback"');
    expect(jobPageSource).toContain('name="visit_intent" value="return_visit"');
    expect(jobPageSource).not.toContain('name="visit_intent" value="callback"');
  });
});

describe("office return visit entry points", () => {
  it("uses explicit office-facing return visit copy on job detail", () => {
    expect(jobPageSource).toContain("Create Return Visit");
    expect(jobPageSource).toContain("This creates an unscheduled office/dispatch item.");
    expect(jobPageSource).toContain('id="next-service-action"');
  });

  it("adds optional waiting deep-link into the job detail return-visit section", () => {
    expect(waitingQueuePageSource).toContain("Create Return Visit");
    expect(waitingQueuePageSource).toContain("#next-service-action");
  });
});