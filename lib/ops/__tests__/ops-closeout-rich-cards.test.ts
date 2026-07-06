import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);
const rowCardSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsQueueRowCard.tsx"),
  "utf-8",
);

const workspaceSelectStart = opsPageSource.indexOf("const workspaceSelect =");
const workspaceSelectEnd = opsPageSource.indexOf("const scheduledSnapshotSelect", workspaceSelectStart);
const workspaceSelectSource =
  workspaceSelectStart > -1 && workspaceSelectEnd > workspaceSelectStart
    ? opsPageSource.slice(workspaceSelectStart, workspaceSelectEnd)
    : "";

const closeoutProjectionInputsStart = opsPageSource.indexOf("function closeoutProjectionInputs(");
const closeoutProjectionInputsEnd = opsPageSource.indexOf("const _t_workspaceCounts", closeoutProjectionInputsStart);
const closeoutProjectionInputsSource =
  closeoutProjectionInputsStart > -1 && closeoutProjectionInputsEnd > closeoutProjectionInputsStart
    ? opsPageSource.slice(closeoutProjectionInputsStart, closeoutProjectionInputsEnd)
    : "";

const loadCloseoutWorkspaceRowsStart = opsPageSource.indexOf("async function loadCloseoutWorkspaceRows()");
const loadCloseoutWorkspaceRowsEnd = opsPageSource.indexOf("async function loadWorkspacePreviewRows(", loadCloseoutWorkspaceRowsStart);
const loadCloseoutWorkspaceRowsSource =
  loadCloseoutWorkspaceRowsStart > -1 && loadCloseoutWorkspaceRowsEnd > loadCloseoutWorkspaceRowsStart
    ? opsPageSource.slice(loadCloseoutWorkspaceRowsStart, loadCloseoutWorkspaceRowsEnd)
    : "";

const buildCloseoutStart = opsPageSource.indexOf("function buildCloseoutRowView(");
const buildCloseoutEnd = opsPageSource.indexOf("function formatFollowUpOwner", buildCloseoutStart);
const buildCloseoutSource =
  buildCloseoutStart > -1 && buildCloseoutEnd > buildCloseoutStart
    ? opsPageSource.slice(buildCloseoutStart, buildCloseoutEnd)
    : "";

const closeoutCardStart = rowCardSource.indexOf("function CloseoutCard(");
const closeoutCardEnd = rowCardSource.indexOf("function FollowUpCard(", closeoutCardStart);
const closeoutCardSource =
  closeoutCardStart > -1 && closeoutCardEnd > closeoutCardStart
    ? rowCardSource.slice(closeoutCardStart, closeoutCardEnd)
    : "";

const activeQueueRowsStart = opsPageSource.indexOf("const activeQueueRows: OpsBoardActiveQueueRow[]");
const activeQueueRowsEnd = opsPageSource.indexOf("const activeQueuePinnedViews", activeQueueRowsStart);
const activeQueueRowsSource =
  activeQueueRowsStart > -1 && activeQueueRowsEnd > activeQueueRowsStart
    ? opsPageSource.slice(activeQueueRowsStart, activeQueueRowsEnd)
    : "";

describe("/ops Closeout rich card contractor visibility", () => {
  it("keeps contractor available in the narrow workspace read model", () => {
    expect(workspaceSelectSource).toContain("contractor_id");
    expect(workspaceSelectSource).toContain("contractors(name)");
    expect(loadCloseoutWorkspaceRowsSource).toContain(".select(workspaceSelect)");
  });

  it("renders contractor name in always-visible closeout card metadata when present", () => {
    expect(buildCloseoutSource).toContain("contractorName: workspaceContractorName(job)");
    expect(closeoutCardSource).toContain('...(view.contractorName ? [{ label: "Contractor", value: view.contractorName }] : [])');
    expect(closeoutCardSource).toContain('variant="closeout-rich"');
  });

  it("does not duplicate contractor inside the expandable closeout action area", () => {
    const expandedAreaStart = closeoutCardSource.indexOf("<QueueCardOpenAndAct>");
    const expandedAreaSource = expandedAreaStart > -1 ? closeoutCardSource.slice(expandedAreaStart) : "";

    expect(expandedAreaSource).toContain("<QueueCardOpenAndAct>");
    expect(expandedAreaSource).not.toContain(">Contractor<");
  });

  it("omits contractor metadata quietly when the closeout job has no contractor", () => {
    expect(closeoutCardSource).toContain("view.contractorName ? ");
    expect(closeoutCardSource).toContain(": [])");
    expect(buildCloseoutSource).not.toContain("operationalTenantIdentity.displayName");
    expect(closeoutCardSource).not.toContain("Unassigned contractor");
  });

  it("keeps the selected closeout workspace on the rich card path", () => {
    expect(activeQueueRowsSource).toContain('selectedWorkspaceSection.key === "closeout"');
    expect(activeQueueRowsSource).toContain("buildCloseoutRowView(job, visibleReason)");
  });

  it("preserves closeout queue inclusion and count derivation", () => {
    expect(loadCloseoutWorkspaceRowsSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(loadCloseoutWorkspaceRowsSource).toContain("listCloseoutQueueJobs(");
    expect(loadCloseoutWorkspaceRowsSource).toContain("sortOpsBoardRows(");
    expect(closeoutProjectionInputsSource).not.toContain("contractor");
  });
});
