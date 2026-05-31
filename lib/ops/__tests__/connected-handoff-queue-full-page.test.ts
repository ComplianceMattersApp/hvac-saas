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
  it("is read-only and uses the connected recipient projection helper", () => {
    expect(connectedHandoffsPageSource).toContain("listActiveConnectedRecipientHandoffProjectionsForAccount");
    expect(connectedHandoffsPageSource).not.toContain("respondToWorkflowHandoffRequestFromForm");
    expect(connectedHandoffsPageSource).not.toContain("/jobs/");
    expect(connectedHandoffsPageSource).not.toContain("service_case");
    expect(connectedHandoffsPageSource).not.toContain("customer");
    expect(connectedHandoffsPageSource).toContain("Connected Handoff Requests");
    expect(connectedHandoffsPageSource).toContain("This view is read-only");
  });
});