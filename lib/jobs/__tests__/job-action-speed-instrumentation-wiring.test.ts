import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-actions.ts"),
  "utf8",
);

const jobInfoPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/info/page.tsx"),
  "utf8",
);

const jobTestsPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);

describe("job action speed instrumentation wiring", () => {
  it("emits SMS intent timing in the existing advance-status timing payload", () => {
    expect(jobActionsSource).toContain('process.env.FIELD_ACTION_TIMING_DEBUG === "true"');
    expect(jobActionsSource).toContain('"[advance-status-timing]"');
    expect(jobActionsSource).toContain('"eventBreadcrumb.smsOnTheWayIntentCreate"');
    expect(jobActionsSource).toContain('createOnTheWayIntentFromEvent({');
  });

  it("keeps revert on-the-way timing env-gated and label-only", () => {
    const revertStart = jobActionsSource.indexOf("export async function revertOnTheWayFromForm");
    const revertEnd = jobActionsSource.indexOf("async function applyJobScheduleUpdate", revertStart);
    const revertSource = jobActionsSource.slice(revertStart, revertEnd);

    expect(revertSource).toContain('process.env.FIELD_ACTION_TIMING_DEBUG === "true"');
    expect(revertSource).toContain('"[revert-on-the-way-timing]"');
    expect(revertSource).toContain('action: "revert_on_the_way"');
    expect(revertSource).toContain("totalMs: Date.now() - _rtStart");
    expect(revertSource).toContain("authActorScope");
    expect(revertSource).toContain("eligibilityRead");
    expect(revertSource).toContain("guardedJobUpdate");
    expect(revertSource).toContain("revertEventInsert");
    expect(revertSource).toContain("revalidation");
    expect(revertSource).toContain("eligibility.eligibilityJobRead");
    expect(revertSource).toContain("eligibility.latestEventRead");
    expect(revertSource).not.toContain("customer_email");
    expect(revertSource).not.toContain("customer_phone");
  });

  it("adds env-gated timing to the equipment route without logging row payloads", () => {
    expect(jobInfoPageSource).toContain('process.env.JOB_DETAIL_TIMING_DEBUG === "true"');
    expect(jobInfoPageSource).toContain('"[job-equipment-route-timing]"');
    expect(jobInfoPageSource).toContain('route: "/jobs/[id]/info"');
    expect(jobInfoPageSource).toContain("authInternalAccess");
    expect(jobInfoPageSource).toContain("jobEquipmentRead");
    expect(jobInfoPageSource).toContain("jobSystemsRead");
    expect(jobInfoPageSource).toContain("systemFiltersRead");
    expect(jobInfoPageSource).toContain("renderPrep");
    expect(jobInfoPageSource).toContain("totalServerRenderBeforeResponse");
    expect(jobInfoPageSource).not.toContain("JSON.stringify(job)");
    expect(jobInfoPageSource).not.toContain("JSON.stringify(systems)");
    expect(jobInfoPageSource).not.toContain("JSON.stringify(systemFilters)");
  });

  it("adds env-gated timing to the tests route without logging row payloads", () => {
    expect(jobTestsPageSource).toContain('process.env.JOB_DETAIL_TIMING_DEBUG === "true"');
    expect(jobTestsPageSource).toContain('"[job-tests-route-timing]"');
    expect(jobTestsPageSource).toContain('route: "/jobs/[id]/tests"');
    expect(jobTestsPageSource).toContain("authInternalAccess");
    expect(jobTestsPageSource).toContain("mainJobTestPayloadRead");
    expect(jobTestsPageSource).toContain("systemsEquipmentEccPayloadReads");
    expect(jobTestsPageSource).toContain("correctionResolutionEventRead");
    expect(jobTestsPageSource).toContain("businessIdentityRead");
    expect(jobTestsPageSource).toContain("contractorRead");
    expect(jobTestsPageSource).toContain("parentRetestPayloadRead");
    expect(jobTestsPageSource).toContain("renderPrep");
    expect(jobTestsPageSource).toContain("totalServerRenderBeforeResponse");
    expect(jobTestsPageSource).not.toContain("JSON.stringify(job)");
    expect(jobTestsPageSource).not.toContain("JSON.stringify(parentJob)");
  });
});
