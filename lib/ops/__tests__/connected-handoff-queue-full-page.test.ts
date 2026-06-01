import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const connectedHandoffsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/connected-handoffs/page.tsx"),
  "utf-8",
);

describe("/ops connected handoff queue - Full Page link", () => {
  it("renders a dedicated Connected Handoffs link from Ops", () => {
    expect(opsPageSource).toContain("Connected Handoffs");
    expect(opsPageSource).toContain('href="/ops/connected-handoffs"');
  });
});

describe("/ops/connected-handoffs page", () => {
  it("uses projection helper and connected recipient response wrapper without broad data exposure", () => {
    expect(connectedHandoffsPageSource).toContain("listActiveConnectedRecipientHandoffProjectionsForAccount");
    expect(connectedHandoffsPageSource).toContain("respondToConnectedRecipientHandoffRequestFromForm");
    expect(connectedHandoffsPageSource).not.toContain("respondToWorkflowHandoffRequestFromForm");
    expect(connectedHandoffsPageSource).not.toContain("/jobs/");
    expect(connectedHandoffsPageSource).not.toContain("/customers/");
    expect(connectedHandoffsPageSource).not.toContain("service_case");
    expect(connectedHandoffsPageSource).not.toContain("workflow_instances");
    expect(connectedHandoffsPageSource).not.toContain("workflow_instance_milestones");
    expect(connectedHandoffsPageSource).not.toContain("job_events");
    expect(connectedHandoffsPageSource).not.toContain("internal_invoices");
    expect(connectedHandoffsPageSource).toContain("Connected Handoff Requests");
    expect(connectedHandoffsPageSource).toContain("updates request status only");
  });
});