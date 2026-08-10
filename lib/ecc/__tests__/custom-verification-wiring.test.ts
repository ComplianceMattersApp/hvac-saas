import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { ECC_TEST_REGISTRY } from "@/lib/ecc/test-registry";

const testsPage = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);
const jobActions = readFileSync(resolve(__dirname, "../../actions/job-actions.ts"), "utf8");

/** Body of one exported action, so an assertion cannot be satisfied elsewhere. */
function actionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("custom verification is reachable", () => {
  it("the Add Test drawer no longer collides with the custom test code", () => {
    // Root cause of "selectable but does nothing": the drawer used the sentinel
    // "custom", which is also a real test code in the registry, so focusing a
    // custom run opened the Add Test panel instead of the test.
    expect(ECC_TEST_REGISTRY.custom.code).toBe("custom");
    expect(ECC_TEST_REGISTRY.custom.allowManualAdd).toBe(true);
    expect(testsPage).toContain('focusedType === "add"');
    expect(testsPage).not.toContain('focusedType === "custom"');
  });

  it("custom is not excluded from the focusable test types", () => {
    // The exclusion list that routes a focused type to the generic panel must
    // not name "custom", or the test becomes unreachable again.
    const start = testsPage.indexOf("const focusedCustomTestType");
    const block = testsPage.slice(start, start + 600);
    expect(block).toContain('focusedType !== "add"');
    expect(block).not.toContain('focusedType !== "custom"');
  });
});

describe("custom verification captures a name, findings and a result", () => {
  it("renders all three inputs", () => {
    expect(testsPage).toContain('name="custom_label"');
    expect(testsPage).toContain('name="custom_notes"');
    expect(testsPage).toContain('name="custom_result"');
    expect(testsPage).toContain("saveAndCompleteCustomVerificationFromForm");
  });

  it("persists them and records an explicit pass/fail", () => {
    const body = actionBody(jobActions, "saveAndCompleteCustomVerificationFromForm");
    expect(body).toContain("custom_label");
    expect(body).toContain("custom_notes");
    // The rater's judgement IS the computation here, so it lands on
    // computed_pass rather than override_pass.
    expect(body).toContain("computed_pass: resultRaw === \"pass\"");
    expect(body).toContain("override_pass: null");
    expect(body).toContain("is_completed: true");
  });

  it("refuses to save a nameless, unjudged run", () => {
    // evaluateEccOpsStatus reads both pass columns null as "unknown", which
    // would leave the job unresolved with no visible reason.
    const body = actionBody(jobActions, "saveAndCompleteCustomVerificationFromForm");
    expect(body).toContain("custom_verification_incomplete");
    expect(body).toMatch(/!label \|\| !notes \|\|/);
  });

  it("scopes the update to the custom test type", () => {
    const body = actionBody(jobActions, "saveAndCompleteCustomVerificationFromForm");
    expect(body).toContain('.eq("test_type", "custom")');
  });

  it("re-evaluates ECC status so the result counts toward resolution", () => {
    const body = actionBody(jobActions, "saveAndCompleteCustomVerificationFromForm");
    expect(body).toContain("evaluateEccOpsStatus(jobId)");
  });
});

describe("the custom name is what gets displayed", () => {
  it("labels a custom run by its own name, not the registry label", () => {
    const start = testsPage.indexOf("function getTestDisplayLabel");
    const block = testsPage.slice(start, start + 700);
    expect(block).toContain("custom_label");
    // Every call site must pass the run, or the name cannot be resolved.
    expect(testsPage).not.toMatch(/getTestDisplayLabel\([^)]*packageSystem\)/);
  });
});
