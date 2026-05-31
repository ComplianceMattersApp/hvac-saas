import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const handoffQueuePageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/handoffs/page.tsx"),
  "utf-8",
);

const workflowActionsSource = readFileSync(
  resolve(__dirname, "../../workflows/actions.ts"),
  "utf-8",
);

describe("/ops handoff queue - Full Page link", () => {
  it("renders a dedicated Handoff Requests link from Ops", () => {
    expect(opsPageSource).toContain("Handoff Requests");
    expect(opsPageSource).toContain('href="/ops/handoffs"');
  });
});

describe("/ops/handoffs page", () => {
  it("redirects unauthenticated users to /login", () => {
    expect(handoffQueuePageSource).toContain('redirect("/login")');
  });

  it("redirects contractor users to /portal", () => {
    expect(handoffQueuePageSource).toContain('redirect("/portal")');
  });

  it("loads only open sent and accepted handoff requests from the workflow read helper", () => {
    expect(handoffQueuePageSource).toContain("listOpenWorkflowHandoffRequestsForInstallerAccount");
    expect(handoffQueuePageSource).not.toContain("listWorkflowHandoffRequestsForMilestone");
    expect(handoffQueuePageSource).not.toContain("getLatestWorkflowHandoffRequestForMilestone");
  });

  it("renders Accept, Mark complete, and Reject controls for open requests", () => {
    expect(handoffQueuePageSource).toMatch(/>\s*Accept\s*</);
    expect(handoffQueuePageSource).toMatch(/>\s*Mark complete\s*</);
    expect(handoffQueuePageSource).toMatch(/>\s*Reject\s*</);
  });

  it("requires a reject note in the UI", () => {
    expect(handoffQueuePageSource).toContain('required');
    expect(handoffQueuePageSource).toContain('name="response_note"');
  });

  it("shows response note and evidence when present", () => {
    expect(handoffQueuePageSource).toContain("Response note:");
    expect(handoffQueuePageSource).toContain("Evidence:");
  });

  it("posts forms through the existing response action wrapper", () => {
    expect(handoffQueuePageSource).toContain("respondToWorkflowHandoffRequestFromForm");
    expect(workflowActionsSource).toContain("respondToWorkflowHandoffRequest({");
  });

  it("renders the queue heading and empty state copy", () => {
    expect(handoffQueuePageSource).toContain(">Handoff Requests<");
    expect(handoffQueuePageSource).toContain("No open handoff requests.");
  });
});