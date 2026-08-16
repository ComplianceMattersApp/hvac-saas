import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it, vi } from "vitest";

import {
  buildOpsWorkspaceQueryString,
  buildOpsWorkspaceSelection,
  loadOpsWorkspaceSelection,
} from "@/lib/ops/ops-workspace-selection-loader";
import type { OpsWorkspaceJob } from "@/lib/ops/ops-workspace-job-contract";
import type {
  OpsWorkspaceQueueKey,
  OpsWorkspaceTab,
} from "@/lib/ops/ops-workspace-queues";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf8",
);
const selectionLoaderSource = readFileSync(
  resolve(__dirname, "../ops-workspace-selection-loader.ts"),
  "utf8",
);

const CORE_KEYS: OpsWorkspaceQueueKey[] = [
  "need_to_schedule",
  "field_work",
  "waiting",
  "exceptions",
  "follow_ups",
  "closeout",
];

function tab(
  key: OpsWorkspaceTab["key"],
  label: string,
  count: number,
): OpsWorkspaceTab {
  return { key, label, count, href: `/ops?bucket=${key}` };
}

function workspaceTabs(): OpsWorkspaceTab[] {
  return [
    tab("need_to_schedule", "Needs Scheduling", 3),
    tab("field_work", "Field Work", 2),
    tab("without_tech", "Needs Assignment", 1),
    tab("waiting", "Waiting / Pending Info", 4),
    tab("exceptions", "Exceptions", 5),
    tab("follow_ups", "Follow Ups", 6),
    tab("closeout", "Closeout & Review", 7),
    tab("updates", "Updates", 8),
  ];
}

function job(id: string, contractorId: string | null): OpsWorkspaceJob {
  return {
    id,
    contractor_id: contractorId,
    ops_status: "need_to_schedule",
    status: "open",
  };
}

describe("Operations workspace selection loader", () => {
  it("applies reason and contractor filters while retaining unfiltered facet truth", () => {
    const first = job("job-1", "contractor-1");
    const second = job("job-2", "contractor-2");
    const snapshot = buildOpsWorkspaceSelection({
      activePermitRequestRows: [],
      boardReasonFilter: "needs_scheduling",
      boardSort: "newest",
      closeoutQueueRowsFull: [],
      contractorFocusFilter: "contractor-1",
      contractorFocusIdSet: new Set(["contractor-1"]),
      coreBoardWorkspaceKeys: CORE_KEYS,
      effectiveBoardBucketFilter: "pending",
      previewRows: [first, second],
      workspaceTabs: workspaceTabs(),
    });

    expect(snapshot.selectedWorkspaceKey).toBe("need_to_schedule");
    expect(snapshot.selectedPreviewRows.map((row) => row.id)).toEqual(["job-1"]);
    expect(snapshot.contractorFocusSourceRows).toEqual([first, second]);
    expect(snapshot.effectiveBoardReasonFilter).toBe("needs_scheduling");
    expect(snapshot.selectedWorkspacePreviewCount).toBe(1);
    expect(snapshot.selectedWorkspaceTotalCount).toBe(3);
    expect(snapshot.selectedWorkspaceCountText).toBe("Showing 1 of 3 jobs");
    expect(snapshot.hasActiveOpsBoardFilters).toBe(true);
    expect(snapshot.clearOpsBoardFiltersHref).toBe(
      "/ops?bucket=pending&sort=newest#ops-workspace",
    );
  });

  it("builds one ordered queue-link projection for desktop and mobile", () => {
    const snapshot = buildOpsWorkspaceSelection({
      activePermitRequestRows: [],
      boardReasonFilter: null,
      boardSort: "oldest",
      closeoutQueueRowsFull: [],
      contractorFocusFilter: null,
      contractorFocusIdSet: new Set(),
      coreBoardWorkspaceKeys: CORE_KEYS,
      effectiveBoardBucketFilter: "waiting",
      previewRows: [job("waiting-job", null)],
      workspaceTabs: workspaceTabs(),
    });

    expect(snapshot.opsRailQueueRows.map((row) => row.key)).toEqual([
      "need_to_schedule",
      "exceptions",
      "waiting",
      "updates",
      "field_work",
      "follow_ups",
      "closeout",
      "without_tech",
    ]);
    expect(snapshot.opsRailQueueRows.filter((row) => row.active)).toEqual([
      expect.objectContaining({ key: "waiting", count: 4 }),
    ]);
    expect(snapshot.opsRailQueueRows.find((row) => row.key === "waiting")?.href).toBe(
      "/ops?bucket=waiting#ops-workspace",
    );
  });

  it("uses the full closeout set as contractor-facet truth", () => {
    const closeoutRows = [job("full-1", "contractor-1"), job("full-2", "contractor-2")];
    const snapshot = buildOpsWorkspaceSelection({
      activePermitRequestRows: [],
      boardReasonFilter: null,
      boardSort: "oldest",
      closeoutQueueRowsFull: closeoutRows,
      contractorFocusFilter: null,
      contractorFocusIdSet: new Set(),
      coreBoardWorkspaceKeys: CORE_KEYS,
      effectiveBoardBucketFilter: "closeout",
      previewRows: [job("preview", "contractor-1")],
      workspaceTabs: workspaceTabs(),
    });

    expect(snapshot.contractorFocusSourceRows).toEqual(closeoutRows);
  });

  it("loads only the selected preview queue", async () => {
    const loadWorkspacePreviewRows = vi.fn(async () => [job("job-1", null)]);

    await loadOpsWorkspaceSelection({
      activePermitRequestRows: [],
      boardReasonFilter: null,
      boardSort: "oldest",
      closeoutQueueRowsFull: [],
      contractorFocusFilter: null,
      contractorFocusIdSet: new Set(),
      coreBoardWorkspaceKeys: CORE_KEYS,
      effectiveBoardBucketFilter: "exceptions",
      loadWorkspacePreviewRows,
      workspaceTabs: workspaceTabs(),
    });

    expect(loadWorkspacePreviewRows).toHaveBeenCalledTimes(1);
    expect(loadWorkspacePreviewRows).toHaveBeenCalledWith("exceptions");
  });

  it("keeps query serialization and shared presentation ownership out of the page", () => {
    expect(buildOpsWorkspaceQueryString({ bucket: "waiting", q: "roof leak", sort: "" })).toBe(
      "?bucket=waiting&q=roof+leak",
    );
    expect(opsPageSource).toContain("loadOpsWorkspaceSelection({");
    expect(opsPageSource).not.toContain("filterOpsBoardRowsByReason(");
    expect(opsPageSource).not.toContain("filterRowsByContractorFocus(");
    expect(opsPageSource).not.toContain("workspacePreviewEntries");
    expect(selectionLoaderSource).toContain("const opsRailQueueRows =");
    expect(opsPageSource).toContain("<OpsMobileQueueSwitcher queues={opsRailQueueRows} />");
    expect(opsPageSource).toContain("queues={opsRailQueueRows}");
  });
});
