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

const fieldOutcomePanelSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/FieldOutcomePanel.tsx"),
  "utf-8",
);

function extractCreateCallbackVisitActionBlock() {
  const start = jobActionsSource.indexOf("export async function createCallbackVisitFromForm");
  const end = jobActionsSource.indexOf("export async function getContractors", start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Could not find createCallbackVisitFromForm block boundaries.");
  }
  return jobActionsSource.slice(start, end);
}

describe("callback visit creation action wiring", () => {
  it("creates a new unscheduled callback service visit", () => {
    const actionBlock = extractCreateCallbackVisitActionBlock();

    expect(actionBlock).toContain('job_type: "service"');
    expect(actionBlock).toContain('service_visit_type: "callback"');
    expect(actionBlock).toContain('service_visit_outcome: "follow_up_required"');
    expect(actionBlock).toContain('status: "open"');
    expect(actionBlock).toContain('ops_status: "need_to_schedule"');
    expect(actionBlock).toContain('scheduled_date: null');
  });

  it("requires callback report text and keeps service-case continuity", () => {
    const actionBlock = extractCreateCallbackVisitActionBlock();

    expect(actionBlock).toContain('if (!callbackVisitReasonRaw) {');
    expect(actionBlock).toContain('banner: "callback_visit_reason_required"');
    expect(actionBlock).toContain('service_case_id: serviceCaseId');
    expect(actionBlock).toContain('await ensureServiceCaseForJob({ supabase, jobId: sourceJobId })');
  });

  it("writes callback intake plus source and child linkage events", () => {
    const actionBlock = extractCreateCallbackVisitActionBlock();

    expect(actionBlock).toContain('event_type: "callback_reported"');
    expect(actionBlock).toContain('event_type: "callback_visit_created"');
    expect(actionBlock).toContain('event_type: "created_from_callback_report"');
    expect(actionBlock).toContain('const callbackIntakeEventId = await insertJobEvent({');
    expect(actionBlock).toContain('source_action: "callback_visit_created_from_intake"');
    expect(actionBlock).toContain('callback_intake_event_id: callbackIntakeEventId');
  });

  it("does not mutate anchor lifecycle fields directly", () => {
    const actionBlock = extractCreateCallbackVisitActionBlock();

    expect(actionBlock).not.toContain('.from("jobs")\n    .update(');
    expect(actionBlock).not.toContain('field_complete:');
    expect(actionBlock).not.toContain('invoice_complete:');
  });
});

describe("callback visit UI placement", () => {
  it("shows office callback visit control near next service action", () => {
    expect(jobPageSource).toContain('id="next-service-action"');
    expect(jobPageSource).toContain("Create Return Visit");
    expect(jobPageSource).toContain("Create Callback Visit");
    expect(jobPageSource).toContain("Use when the original job is not finished yet and another visit is needed to complete it.");
    expect(jobPageSource).toContain("Use when the customer calls back after the job was believed complete.");
    expect(jobPageSource).toContain("This records the customer report and creates a new unscheduled office/dispatch callback item.");
    expect(jobPageSource).toContain("What did the customer report?");
    expect(jobPageSource).toContain("It will not appear in technician My Work until it is scheduled and assigned.");
    expect(jobPageSource).toContain("createCallbackVisitFromForm");
  });

  it("keeps report-only callback logging out of primary next service workflow", () => {
    expect(jobPageSource).not.toContain("Record report only (no visit creation)");
    expect(jobPageSource).not.toContain("Record Callback Report Only");
    expect(jobPageSource).not.toContain("recordCallbackReportFromForm");
  });

  it("surfaces callback intake/creation banners with explicit guidance", () => {
    expect(jobPageSource).toContain('banner === "callback_report_recorded"');
    expect(jobPageSource).toContain('banner === "callback_visit_created"');
    expect(jobPageSource).toContain(
      "Callback visit created. This is an unscheduled office/dispatch item and will not appear in technician My Work until scheduled and assigned.",
    );
    expect(jobPageSource).toContain('banner === "callback_visit_requires_historical_anchor"');
    expect(jobPageSource).toContain('banner === "callback_report_requires_historical_anchor"');
  });

  it("keeps callback visit creation controls out of FieldOutcomePanel", () => {
    expect(fieldOutcomePanelSource).not.toContain("Create Callback Visit");
  });
});
