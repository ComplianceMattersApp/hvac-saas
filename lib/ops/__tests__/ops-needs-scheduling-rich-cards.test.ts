import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const richCardStart = opsPageSource.indexOf("function needsSchedulingRichCard(");
const richCardEnd = opsPageSource.indexOf("function compactRow(", richCardStart);
const richCardSource =
  richCardStart > -1 && richCardEnd > richCardStart
    ? opsPageSource.slice(richCardStart, richCardEnd)
    : "";

const workspaceRichCardStart = opsPageSource.indexOf("function workspaceNeedsSchedulingRichCard(");
const workspaceRichCardEnd = opsPageSource.indexOf("const selectedWorkspaceItemCount", workspaceRichCardStart);
const workspaceRichCardSource =
  workspaceRichCardStart > -1 && workspaceRichCardEnd > workspaceRichCardStart
    ? opsPageSource.slice(workspaceRichCardStart, workspaceRichCardEnd)
    : "";

const workspaceListStart = opsPageSource.indexOf("selectedWorkspaceSection.previewRows.map");
const workspaceListEnd = opsPageSource.indexOf("</article>", workspaceListStart);
const workspaceListSource =
  workspaceListStart > -1 && workspaceListEnd > workspaceListStart
    ? opsPageSource.slice(workspaceListStart, workspaceListEnd)
    : "";

const queueRenderStart = opsPageSource.indexOf("sortedBucketJobs.slice(0, 12).map");
const queueRenderEnd = opsPageSource.indexOf("</div>", queueRenderStart);
const queueRenderSource =
  queueRenderStart > -1 && queueRenderEnd > queueRenderStart
    ? opsPageSource.slice(queueRenderStart, queueRenderEnd)
    : "";

describe("/ops Needs Scheduling rich cards", () => {
  it("renders rich action cards in the actual visible workspace Needs Scheduling queue", () => {
    expect(opsPageSource).toContain('pending: "need_to_schedule"');
    expect(opsPageSource).toContain('label: "Needs Scheduling"');
    expect(workspaceRichCardSource).toContain('data-ops-workspace-card-variant="needs-scheduling-rich"');
    expect(workspaceListSource).toContain('if (selectedWorkspaceSection.key === "need_to_schedule")');
    expect(workspaceListSource).toContain("return workspaceNeedsSchedulingRichCard(job, visibleReason);");
  });

  it("keeps the lower focused preview rich branch scoped to the active Needs Scheduling queue", () => {
    expect(richCardSource).toContain('data-ops-card-variant="needs-scheduling-rich"');
    expect(queueRenderSource).toContain('if (bucket === "need_to_schedule")');
    expect(queueRenderSource).toContain("return needsSchedulingRichCard(j, note || undefined);");
    expect(queueRenderSource).toContain("return compactRow(j, true, note || undefined, false, bucket);");
  });

  it("keeps contact timestamp display wired to the existing recent-attempt read model on the workspace cards", () => {
    expect(opsPageSource).toContain("buildLatestCustomerAttemptByJob");
    expect(opsPageSource).toContain('.eq("event_type", "customer_attempt")');
    expect(workspaceRichCardSource).toContain(
      "resolveRecentAttemptDisplay(selectedPreviewLatestCustomerAttemptByJob.get(jobId) ?? null)",
    );
    expect(workspaceRichCardSource).toContain("Last attempt");
  });

  it("wires the workspace scheduler to the existing schedule action with current /ops filters preserved", () => {
    expect(opsPageSource).toContain('import { updateJobScheduleFromForm } from "@/lib/actions";');
    expect(workspaceRichCardSource).toContain("form action={updateJobScheduleFromForm}");
    expect(workspaceRichCardSource).toContain('<details open className="group">');
    expect(workspaceRichCardSource).toContain('name="scheduled_date"');
    expect(workspaceRichCardSource).toContain('name="window_start"');
    expect(workspaceRichCardSource).toContain('name="window_end"');
    expect(workspaceRichCardSource).toContain('name="unschedule"');
    expect(workspaceRichCardSource).toContain('name="return_to" value={activeWorkspaceHref}');
    expect(opsPageSource).toContain("const activeWorkspaceHref");
    expect(opsPageSource).toContain("contractor: contractorScopeFilter");
    expect(opsPageSource).toContain("reason: effectiveBoardReasonFilter");
  });

  it("wires workspace call and text logging to the existing customer contact action", () => {
    expect(opsPageSource).toContain(
      'import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";',
    );
    expect(workspaceRichCardSource).toContain("form action={logCustomerContactAttemptFromForm}");
    expect(workspaceRichCardSource).toContain('name="method" value="call"');
    expect(workspaceRichCardSource).toContain('name="method" value="text"');
    expect(workspaceRichCardSource).toContain("contact_attempt_logged_call");
    expect(workspaceRichCardSource).toContain("contact_attempt_logged_text");
    expect(workspaceRichCardSource).toContain("Open SMS App");
  });

  it("preserves compact workspace card rendering for non-Needs-Scheduling queues", () => {
    expect(workspaceListSource).toMatch(
      /if \(selectedWorkspaceSection\.key === "need_to_schedule"\)[\s\S]+return workspaceNeedsSchedulingRichCard\(job, visibleReason\);[\s\S]+<Link href=\{`\/jobs\/\$\{job\.id\}\?tab=ops`\}[\s\S]+Open Job/,
    );
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "field_work"');
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "waiting"');
    expect(workspaceListSource).not.toContain('selectedWorkspaceSection.key === "closeout"');
  });
});
