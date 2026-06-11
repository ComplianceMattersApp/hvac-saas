import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobActionsSource = readFileSync(
  resolve(__dirname, "../job-actions.ts"),
  "utf-8",
);

function extractScheduleRetestNowBlock() {
  const start = jobActionsSource.indexOf("export async function scheduleRetestNowFromForm");
  const end = jobActionsSource.indexOf("/**\n * CANCEL JOB", start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Could not find scheduleRetestNowFromForm block boundaries.");
  }
  return jobActionsSource.slice(start, end);
}

function extractCreateRetestBlock() {
  const start = jobActionsSource.indexOf("export async function createRetestJobFromForm");
  const end = jobActionsSource.indexOf("export async function scheduleRetestNowFromForm", start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Could not find createRetestJobFromForm block boundaries.");
  }
  return jobActionsSource.slice(start, end);
}

describe("ECC retest schedule-now wiring", () => {
  it("reuses retest child creation and schedules the created child through existing schedule semantics", () => {
    const block = extractScheduleRetestNowBlock();

    expect(block).toContain("await createRetestJobFromForm(createFormData)");
    expect(block).toContain('createFormData.set("no_redirect", "1")');
    expect(block).toContain('createFormData.set("retest_bridge_action", "schedule_retest_now")');
    expect(block).toContain('scheduleFormData.set("job_id", childJobId)');
    expect(block).toContain('scheduleFormData.set("scheduled_date", scheduleFields.scheduled_date)');
    expect(block).toContain('scheduleFormData.set("no_redirect", "1")');
    expect(block).toContain("await updateJobScheduleFromForm(scheduleFormData);");
  });

  it("requires internal scoped operational access and validates a real schedule date", () => {
    const block = extractScheduleRetestNowBlock();

    expect(block).toContain("requireInternalScopedJobAccessOrRedirect");
    expect(block).toContain("requireOperationalScopedJobMutationAccessOrRedirect");
    expect(block).toContain("scheduleFields = deriveScheduleAndOps(formData);");
    expect(block).toContain('banner=schedule_window_invalid');
    expect(block).toContain("if (!scheduleFields.scheduled_date)");
    expect(block).toContain('banner=schedule_date_required');
  });

  it("writes explicit retest scheduled timeline metadata without invoice or payment mutations", () => {
    const block = extractScheduleRetestNowBlock();

    expect(block).toContain('source_action: "schedule_retest_now"');
    expect(block).toContain("child_job_id: childJobId");
    expect(block).toContain("parent_job_id: parentJobId");
    expect(block).toContain("scheduled_date: scheduleFields.scheduled_date");
    expect(block).toContain('event_type: "retest_scheduled"');
    expect(block).not.toContain("invoice");
    expect(block).not.toContain("payment");
    expect(block).not.toContain("certs_complete");
  });

  it("keeps Move to Needs Scheduling on the existing retest child path", () => {
    const block = extractCreateRetestBlock();

    expect(block).toContain('const bridgeAction =');
    expect(block).toContain('"move_to_needs_scheduling"');
    expect(block).toContain('bridge_action: bridgeAction');
    expect(block).toContain('status: "open"');
    expect(block).toContain('ops_status: "need_to_schedule"');
    expect(block).toContain("parent_job_id: parentJobId");
    expect(block).toContain("service_case_id: inheritedServiceCaseId");
    expect(block).toContain("permit_number: parent?.permit_number ?? null");
    expect(block).toContain("jurisdiction: parent?.jurisdiction ?? null");
    expect(block).toContain("permit_date: parent?.permit_date ?? null");
  });

  it("continues guarding against duplicate active retest children", () => {
    const block = extractCreateRetestBlock();

    expect(block).toContain("activeRetestChild");
    expect(block).toContain('.eq("parent_job_id", parentJobId)');
    expect(block).toContain('.neq("ops_status", "closed")');
    expect(block).toContain('.neq("status", "cancelled")');
    expect(block).toContain("retest_already_exists");
  });
});
