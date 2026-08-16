import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);
const rowViewsSource = readFileSync(
  resolve(__dirname, "../ops-workspace-row-views.ts"),
  "utf-8",
);
const dataLoaderSource = readFileSync(
  resolve(__dirname, "../ops-workspace-data-loader.ts"),
  "utf-8",
);
const rowCardSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsQueueRowCard.tsx"),
  "utf-8",
);
const opsWorkspaceJobContractSource = readFileSync(
  resolve(__dirname, "../ops-workspace-job-contract.ts"),
  "utf-8",
);

const closeoutProjectionInputsStart = dataLoaderSource.indexOf("export function buildCloseoutProjectionInputs(");
const closeoutProjectionInputsEnd = dataLoaderSource.indexOf(
  "export function buildOpsWorkspacePreviewEnrichmentReadModels(",
  closeoutProjectionInputsStart,
);
const closeoutProjectionInputsSource =
  closeoutProjectionInputsStart > -1 && closeoutProjectionInputsEnd > closeoutProjectionInputsStart
    ? dataLoaderSource.slice(closeoutProjectionInputsStart, closeoutProjectionInputsEnd)
    : "";

const loadCloseoutWorkspaceRowsStart = dataLoaderSource.indexOf("async function loadCloseoutWorkspaceRows()");
const loadCloseoutWorkspaceRowsEnd = dataLoaderSource.indexOf(
  "return async function loadWorkspacePreviewRows(",
  loadCloseoutWorkspaceRowsStart,
);
const loadCloseoutWorkspaceRowsSource =
  loadCloseoutWorkspaceRowsStart > -1 && loadCloseoutWorkspaceRowsEnd > loadCloseoutWorkspaceRowsStart
    ? dataLoaderSource.slice(loadCloseoutWorkspaceRowsStart, loadCloseoutWorkspaceRowsEnd)
    : "";

const buildCloseoutStart = rowViewsSource.indexOf("function buildCloseoutRowView(");
const buildCloseoutEnd = rowViewsSource.indexOf("function buildFollowUpRowView(", buildCloseoutStart);
const buildCloseoutSource =
  buildCloseoutStart > -1 && buildCloseoutEnd > buildCloseoutStart
    ? rowViewsSource.slice(buildCloseoutStart, buildCloseoutEnd)
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
    expect(opsWorkspaceJobContractSource).toContain("contractor_id");
    expect(opsWorkspaceJobContractSource).toContain("contractors(name)");
    expect(loadCloseoutWorkspaceRowsSource).toContain(".select(OPS_WORKSPACE_JOB_SELECT)");
  });

  it("renders contractor name in always-visible closeout card metadata when present", () => {
    expect(buildCloseoutSource).toContain("contractorName: workspaceContractorName(job)");
    expect(closeoutCardSource).toContain(
      '{ label: "Contractor", value: view.contractorName || view.assignmentSummary || "Internal work" }',
    );
    expect(closeoutCardSource).toContain("<MobileOpsCard");
  });

  it("uses a compact closeout summary row without an expandable action area", () => {
    expect(closeoutCardSource).not.toContain("<QueueCardOpenAndAct>");
    expect(closeoutCardSource).toContain("grid-cols-2");
    expect(closeoutCardSource).toContain(">Scheduled<");
    expect(closeoutCardSource).toContain(">Assignment<");
    expect(closeoutCardSource).toContain(">Next Step<");
    expect(closeoutCardSource).not.toContain(">View Job<");
    expect(closeoutCardSource).not.toContain(">Call<");
    expect(closeoutCardSource).not.toContain("Open SMS App");
  });

  it("omits contractor metadata quietly when the closeout job has no contractor", () => {
    expect(closeoutCardSource).toContain('view.contractorName || view.assignmentSummary || "Internal work"');
    expect(buildCloseoutSource).not.toContain("operationalTenantIdentity.displayName");
    expect(closeoutCardSource).not.toContain("Unassigned contractor");
  });

  it("keeps the selected closeout workspace on the rich card path", () => {
    expect(rowViewsSource).toContain('if (queueKey === "closeout")');
    expect(rowViewsSource).toContain("return buildCloseoutRowView(job, reason, formattedRecentAttempt);");
    expect(activeQueueRowsSource).toContain("rowViewBuilders.buildJobRowView(typedJob, selectedWorkspaceSection.key)");
  });

  it("preserves closeout queue inclusion and count derivation", () => {
    expect(loadCloseoutWorkspaceRowsSource).toContain("buildBillingTruthCloseoutProjectionMap");
    expect(loadCloseoutWorkspaceRowsSource).toContain("listCloseoutQueueJobs(");
    expect(loadCloseoutWorkspaceRowsSource).toContain("sortOpsBoardRows(");
    expect(closeoutProjectionInputsSource).not.toContain("contractor");
  });
});
