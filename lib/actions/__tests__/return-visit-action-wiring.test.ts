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
    expect(actionBlock).toContain('const isAddToSchedulingQueueBridge =');
    expect(actionBlock).toContain('const isScheduleReturnNowBridge =');
    expect(actionBlock).toContain('const isServiceFollowUpBridge = isAddToSchedulingQueueBridge || isScheduleReturnNowBridge;');
    expect(actionBlock).toContain('const isExplicitReturnVisitIntent = visitIntentRaw === "return_visit" || isServiceFollowUpBridge;');
    expect(actionBlock).toContain('const childVisitType = isExplicitReturnVisitIntent');
    expect(actionBlock).toContain('? "return_visit"');
    expect(actionBlock).toContain('normalizeServiceVisitType(String(sourceJob.service_visit_type ?? "").trim()) ?? "return_visit";');
  });

  it("keeps return visits unscheduled, office-owned, and continuity-linked", () => {
    const actionBlock = extractCreateNextVisitActionBlock();

    expect(actionBlock).toContain('service_case_id: serviceCaseId');
    expect(actionBlock).toContain('parent_job_id: sourceJobId');
    expect(actionBlock).toContain('scheduled_date: null');
    expect(actionBlock).toContain('status: "open"');
    expect(actionBlock).toContain('ops_status: "need_to_schedule"');
    expect(actionBlock).toContain('service_visit_outcome: "follow_up_required"');
  });

  it("supports schedule-now bridge through existing scheduling semantics", () => {
    const actionBlock = extractCreateNextVisitActionBlock();

    expect(actionBlock).toContain('bridgeModeRaw === "schedule_now"');
    expect(actionBlock).toContain('bridgeActionRaw === "schedule_return_now"');
    expect(actionBlock).toContain("scheduleNowFields = deriveScheduleAndOps(formData);");
    expect(actionBlock).toContain('banner: "schedule_date_required"');
    expect(actionBlock).toContain('scheduleFormData.set("job_id", created.id);');
    expect(actionBlock).toContain('scheduleFormData.set("scheduled_date", scheduleNowFields.scheduled_date);');
    expect(actionBlock).toContain('scheduleFormData.set("no_redirect", "1");');
    expect(actionBlock).toContain("await updateJobScheduleFromForm(scheduleFormData);");
    expect(actionBlock).toContain('redirect(`/jobs/${created.id}?banner=${isScheduleReturnNowBridge ? "return_visit_scheduled" : "next_service_visit_created"}`);');
  });

  it("writes source and child job events with explicit visit intent metadata", () => {
    const actionBlock = extractCreateNextVisitActionBlock();

    expect(actionBlock).toContain('event_type: "service_next_visit_created"');
    expect(actionBlock).toContain('event_type: "created_from_service_visit"');
    expect(actionBlock).toContain('? "add_to_scheduling_queue"');
    expect(actionBlock).toContain('follow_up_bridge_action: isScheduleReturnNowBridge ? "schedule_return_now" : "add_to_scheduling_queue"');
    expect(actionBlock).toContain("continued_through_child_job_id: created.id");
    expect(actionBlock).toContain('visit_intent: isExplicitReturnVisitIntent ? "return_visit" : "next_service_visit"');
    expect(actionBlock).toContain("child_service_visit_type: childVisitType");
    expect(actionBlock).toContain("Follow-up continued through linked return visit");
    expect(actionBlock).toContain("Follow-up continued through linked scheduled return visit");
    expect(actionBlock).toContain("scheduled_date: scheduleNowFields?.scheduled_date ?? null");
    expect(actionBlock).not.toContain("Waiting state resumed through next service visit");
    expect(actionBlock).not.toContain("resumed_through_child_job_id");
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
    expect(jobPageSource).toContain("serviceFollowUpProgressState.bridgeActionLabel");
    expect(jobPageSource).toContain('name="return_creation_mode" value="needs_scheduling"');
    expect(jobPageSource).toContain('name="follow_up_bridge_action" value="add_to_scheduling_queue"');
    expect(jobPageSource).toContain("Schedule Return Visit Now");
    expect(jobPageSource).toContain('name="return_creation_mode" value="schedule_now"');
    expect(jobPageSource).toContain('name="follow_up_bridge_action" value="schedule_return_now"');
    expect(jobPageSource).toContain('name="scheduled_date"');
    expect(jobPageSource).toContain('name="window_start"');
    expect(jobPageSource).toContain('name="window_end"');
    expect(jobPageSource).toContain("Use when the original job is not finished yet and another visit is needed to complete it.");
    expect(jobPageSource).toContain("Examples: waiting on a part, customer approval, or more time needed to complete the same job.");
    expect(jobPageSource).toContain('id="next-service-action"');
  });

  it("adds optional waiting deep-link into the job detail return-visit section", () => {
    expect(waitingQueuePageSource).toContain('followUpProgress.bridgeActionLabel ?? "Create Return Visit"');
    expect(waitingQueuePageSource).toContain("followUpProgress.bridgeActionLabel");
    expect(waitingQueuePageSource).toContain("#next-service-action");
  });
});
