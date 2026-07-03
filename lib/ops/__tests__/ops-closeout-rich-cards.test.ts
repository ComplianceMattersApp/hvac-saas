import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
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

const workspaceCloseoutCardStart = opsPageSource.indexOf("function workspaceCloseoutRichCard(");
const workspaceCloseoutCardEnd = opsPageSource.indexOf("function workspaceFieldPaymentReviewCard(", workspaceCloseoutCardStart);
const workspaceCloseoutCardSource =
  workspaceCloseoutCardStart > -1 && workspaceCloseoutCardEnd > workspaceCloseoutCardStart
    ? opsPageSource.slice(workspaceCloseoutCardStart, workspaceCloseoutCardEnd)
    : "";

const workspaceListStart = opsPageSource.indexOf(
  'selectedWorkspaceSection.key === "closeout" && canViewFieldPaymentVerificationAttention',
);
const workspaceListEnd = opsPageSource.indexOf("</article>", workspaceListStart);
const workspaceListSource =
  workspaceListStart > -1 && workspaceListEnd > workspaceListStart
    ? opsPageSource.slice(workspaceListStart, workspaceListEnd)
    : "";

describe("/ops Closeout rich card contractor visibility", () => {
  it("keeps contractor available in the narrow workspace read model", () => {
    expect(workspaceSelectSource).toContain("contractor_id");
    expect(workspaceSelectSource).toContain("contractors(name)");
    expect(loadCloseoutWorkspaceRowsSource).toContain(".select(workspaceSelect)");
  });

  it("renders contractor name in always-visible closeout card metadata when present", () => {
    expect(workspaceCloseoutCardSource).toContain("const contractorName = workspaceContractorName(job);");
    expect(workspaceCloseoutCardSource).toContain('...(contractorName ? [{ label: "Contractor", value: contractorName }] : [])');
    expect(workspaceCloseoutCardSource).toContain('variant="closeout-rich"');
  });

  it("does not duplicate contractor inside the expandable closeout action area", () => {
    const expandedAreaStart = workspaceCloseoutCardSource.indexOf("<QueueCardOpenAndAct>");
    const expandedAreaSource = expandedAreaStart > -1 ? workspaceCloseoutCardSource.slice(expandedAreaStart) : "";

    expect(expandedAreaSource).toContain("<QueueCardOpenAndAct>");
    expect(expandedAreaSource).not.toContain(">Contractor<");
  });

  it("omits contractor metadata quietly when the closeout job has no contractor", () => {
    expect(workspaceCloseoutCardSource).toContain("contractorName ? ");
    expect(workspaceCloseoutCardSource).toContain(": [])");
    expect(workspaceCloseoutCardSource).not.toContain("operationalTenantIdentity.displayName");
    expect(workspaceCloseoutCardSource).not.toContain("Unassigned contractor");
  });

  it("keeps the selected closeout workspace on the rich card path", () => {
    expect(workspaceListSource).toContain('if (selectedWorkspaceSection.key === "closeout")');
    expect(workspaceListSource).toContain("return workspaceCloseoutRichCard(job, visibleReason);");
  });

  it("preserves closeout queue inclusion and count derivation", () => {
    expect(loadCloseoutWorkspaceRowsSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(loadCloseoutWorkspaceRowsSource).toContain("listCloseoutQueueJobs(");
    expect(loadCloseoutWorkspaceRowsSource).toContain("sortOpsBoardRows(");
    expect(closeoutProjectionInputsSource).not.toContain("contractor");
  });
});
