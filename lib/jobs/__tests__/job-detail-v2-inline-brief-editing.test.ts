import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/jobs/[id]/v2/page.tsx"), "utf8");
const editorSource = readFileSync(
  resolve(process.cwd(), "app/jobs/[id]/v2/_components/InlineEditableBriefField.tsx"),
  "utf8",
);
const actionsSource = readFileSync(resolve(process.cwd(), "lib/actions/job-actions.ts"), "utf8");

describe("desktop job brief inline editing", () => {
  it("uses quiet inline editing instead of a permanent title form", () => {
    expect(pageSource).toContain("<InlineEditableBriefField");
    expect(editorSource).toContain("setEditing(true)");
    expect(editorSource).toContain("Cancel");
    expect(editorSource).toContain('pending ? "Saving..." : "Save"');
    expect(pageSource).not.toContain("Save Job Title</button>");
  });

  it("shows a distinct editable visit reason only for service jobs", () => {
    expect(pageSource).toMatch(/\{isServiceJob \? \([\s\S]*label="Visit Reason"/);
    expect(pageSource).toContain("action={updateServiceVisitReasonFromForm}");
    expect(actionsSource).toContain("export async function updateServiceVisitReasonFromForm");
    expect(actionsSource).toContain('job_type, service_visit_reason');
    expect(actionsSource).toContain('!== "service"');
  });

  it("uses Job Status consistently for the sidebar and section heading", () => {
    expect(pageSource).toContain('{ id: "field", label: "Job Status" }');
    expect(pageSource).toContain('<div style={S.sectionLabel}>Job Status</div>');
    expect(pageSource).not.toContain("Field &amp; Finish");
  });
});
