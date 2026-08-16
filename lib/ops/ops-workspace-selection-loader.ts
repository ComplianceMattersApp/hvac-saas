import {
  buildOpsBoardReasonOptions,
  filterOpsBoardRowsByReason,
  type OpsBoardReasonKey,
  type OpsBoardReasonOption,
} from "@/lib/ops/ops-board-reasons";
import type { OpsBoardSortKey } from "@/lib/ops/ops-board-sorting";
import {
  filterRowsByContractorFocus,
  type ContractorFocusRow,
} from "@/lib/ops/ops-workspace-contractor-facets";
import type { OpsWorkspacePreviewRow } from "@/lib/ops/ops-workspace-data-loader";
import type { OpsWorkspaceJob } from "@/lib/ops/ops-workspace-job-contract";
import {
  getOpsWorkspaceQueueDefinition,
  opsWorkspaceQueueHref,
  resolveOpsWorkspaceQueueKey,
  type OpsWorkspaceQueueBucket,
  type OpsWorkspaceQueueKey,
  type OpsWorkspaceTab,
} from "@/lib/ops/ops-workspace-queues";
import type { ContractorIntakeQueueRow } from "@/lib/ops/contractor-intake-queue";
import type { PermitRequestQueueRow } from "@/lib/permits/permit-requests-read-model";

const OPS_RAIL_QUEUE_ORDER = [
  "need_to_schedule",
  "exceptions",
  "waiting",
  "updates",
  "field_work",
  "follow_ups",
  "contractor_intake",
  "closeout",
  "permits",
  "without_tech",
] as const;

type OpsWorkspaceSelectionSection = OpsWorkspaceTab & {
  previewRows: OpsWorkspacePreviewRow[];
};

export type OpsWorkspaceSelectionQueueLink = {
  active: boolean;
  count: number;
  href: string;
  key: string;
  label: string;
};

export type OpsWorkspaceSelectionSnapshot = {
  clearOpsBoardFiltersHref: string;
  contractorFocusSourceRows: readonly ContractorFocusRow[];
  effectiveBoardReasonFilter: OpsBoardReasonKey | null;
  hasActiveOpsBoardFilters: boolean;
  opsRailQueueRows: OpsWorkspaceSelectionQueueLink[];
  selectedContractorIntakeRows: ContractorIntakeQueueRow[];
  selectedPermitRows: PermitRequestQueueRow[];
  selectedPreviewRows: OpsWorkspaceJob[];
  selectedWorkspaceCountText: string;
  selectedWorkspaceItemNoun: string;
  selectedWorkspaceKey: OpsWorkspaceQueueKey;
  selectedWorkspacePreviewCount: number;
  selectedWorkspaceSection: OpsWorkspaceSelectionSection;
  selectedWorkspaceTab: OpsWorkspaceSelectionSection;
  selectedWorkspaceTotalCount: number;
  workspaceReasonOptions: OpsBoardReasonOption[];
};

export function buildOpsWorkspaceQueryString(
  params: Record<string, string | undefined | null>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim() !== "") {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function requireSelectedWorkspaceTab(params: {
  selectedWorkspaceKey: OpsWorkspaceQueueKey;
  workspaceTabs: readonly OpsWorkspaceTab[];
}) {
  const tab =
    params.workspaceTabs.find((item) => item.key === params.selectedWorkspaceKey)
    ?? params.workspaceTabs[0];
  if (!tab) {
    throw new Error("OPS_WORKSPACE_TAB_REQUIRED");
  }
  return tab;
}

function itemNounForWorkspace(workspaceKey: OpsWorkspaceQueueKey) {
  if (workspaceKey === "permits") return "permit requests";
  if (workspaceKey === "contractor_intake") return "intake submissions";
  if (workspaceKey === "follow_ups") return "follow ups";
  return "jobs";
}

export function buildOpsWorkspaceSelection(params: {
  activePermitRequestRows: readonly PermitRequestQueueRow[];
  boardReasonFilter: OpsBoardReasonKey | null;
  boardSort: OpsBoardSortKey;
  closeoutQueueRowsFull: readonly OpsWorkspaceJob[];
  contractorFocusFilter: string | null;
  contractorFocusIdSet: ReadonlySet<string>;
  coreBoardWorkspaceKeys: readonly OpsWorkspaceQueueKey[];
  effectiveBoardBucketFilter: OpsWorkspaceQueueBucket;
  previewRows: readonly OpsWorkspacePreviewRow[];
  workspaceTabs: readonly OpsWorkspaceTab[];
}): OpsWorkspaceSelectionSnapshot {
  const selectedWorkspaceKey = resolveOpsWorkspaceQueueKey(
    params.effectiveBoardBucketFilter,
  );
  const selectedTab = requireSelectedWorkspaceTab({
    selectedWorkspaceKey,
    workspaceTabs: params.workspaceTabs,
  });
  const selectedWorkspaceUsesJobRows =
    selectedWorkspaceKey !== "permits" && selectedWorkspaceKey !== "contractor_intake";
  const reasonSourceRows = selectedWorkspaceUsesJobRows
    ? (params.previewRows as OpsWorkspaceJob[])
    : [];
  const workspaceReasonOptions = buildOpsBoardReasonOptions(reasonSourceRows, {
    queueKey: selectedWorkspaceKey,
  });
  const effectiveBoardReasonFilter =
    params.boardReasonFilter
    && workspaceReasonOptions.some((option) => option.key === params.boardReasonFilter)
      ? params.boardReasonFilter
      : null;
  const reasonFilteredRows = selectedWorkspaceUsesJobRows
    ? filterOpsBoardRowsByReason(reasonSourceRows, effectiveBoardReasonFilter, {
        queueKey: selectedWorkspaceKey,
      })
    : [...params.previewRows];
  const visiblePreviewRows = filterRowsByContractorFocus(
    reasonFilteredRows,
    params.contractorFocusIdSet,
  );
  const selectedWorkspaceSection: OpsWorkspaceSelectionSection = {
    ...selectedTab,
    previewRows: visiblePreviewRows,
  };
  const selectedPermitRows =
    selectedWorkspaceKey === "permits"
      ? filterRowsByContractorFocus(
          params.activePermitRequestRows,
          params.contractorFocusIdSet,
        )
      : [];
  const selectedContractorIntakeRows =
    selectedWorkspaceKey === "contractor_intake"
      ? (visiblePreviewRows as ContractorIntakeQueueRow[])
      : [];
  const selectedPreviewRows =
    selectedWorkspaceUsesJobRows ? (visiblePreviewRows as OpsWorkspaceJob[]) : [];
  const selectedWorkspacePreviewCount =
    selectedWorkspaceKey === "permits"
      ? selectedPermitRows.length
      : selectedWorkspaceKey === "contractor_intake"
        ? selectedContractorIntakeRows.length
        : visiblePreviewRows.length;
  const selectedWorkspaceTotalCount =
    selectedWorkspaceKey === "permits" || selectedWorkspaceKey === "contractor_intake"
      ? selectedWorkspacePreviewCount
      : selectedWorkspaceSection.count;
  const selectedWorkspaceTab = {
    ...selectedWorkspaceSection,
    count: selectedWorkspaceTotalCount,
  };

  const workspaceQueueLinks = params.coreBoardWorkspaceKeys.map((workspaceKey) => {
    const definition = getOpsWorkspaceQueueDefinition(workspaceKey);
    const tab =
      workspaceKey === selectedWorkspaceKey
        ? selectedWorkspaceSection
        : params.workspaceTabs.find((item) => item.key === workspaceKey) ?? selectedTab;

    return {
      active: workspaceKey === selectedWorkspaceKey,
      count: tab.count,
      href: opsWorkspaceQueueHref(definition.bucket, {
        contractor: params.contractorFocusFilter ?? "",
        sort: params.boardSort === "oldest" ? "" : params.boardSort,
      }),
      key: workspaceKey,
      label: tab.label,
    };
  });
  const hiddenTodayQueueLinks = params.workspaceTabs
    .filter((tab) => tab.key === "without_tech" || tab.key === "updates")
    .map((tab) => ({
      active: tab.key === selectedWorkspaceKey,
      count: tab.count,
      href: tab.href,
      key: tab.key,
      label: tab.label,
    }));
  const queueOrder = new Map<string, number>(
    OPS_RAIL_QUEUE_ORDER.map((key, index) => [key, index]),
  );
  const opsRailQueueRows = [...workspaceQueueLinks, ...hiddenTodayQueueLinks].sort(
    (left, right) =>
      (queueOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER)
      - (queueOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER),
  );
  const selectedWorkspaceItemNoun = itemNounForWorkspace(selectedWorkspaceKey);

  return {
    clearOpsBoardFiltersHref: `/ops${buildOpsWorkspaceQueryString({
      bucket: params.effectiveBoardBucketFilter,
      sort: params.boardSort === "oldest" ? "" : params.boardSort,
    })}#ops-workspace`,
    contractorFocusSourceRows: (
      selectedWorkspaceKey === "permits"
        ? params.activePermitRequestRows
        : selectedWorkspaceKey === "closeout"
          ? params.closeoutQueueRowsFull
          : params.previewRows
    ) as readonly ContractorFocusRow[],
    effectiveBoardReasonFilter,
    hasActiveOpsBoardFilters:
      params.contractorFocusIdSet.size > 0 || Boolean(effectiveBoardReasonFilter),
    opsRailQueueRows,
    selectedContractorIntakeRows,
    selectedPermitRows,
    selectedPreviewRows,
    selectedWorkspaceCountText:
      selectedWorkspacePreviewCount === selectedWorkspaceTotalCount
        ? `${selectedWorkspaceTotalCount} ${selectedWorkspaceItemNoun}`
        : `Showing ${selectedWorkspacePreviewCount} of ${selectedWorkspaceTotalCount} ${selectedWorkspaceItemNoun}`,
    selectedWorkspaceItemNoun,
    selectedWorkspaceKey,
    selectedWorkspacePreviewCount,
    selectedWorkspaceSection,
    selectedWorkspaceTab,
    selectedWorkspaceTotalCount,
    workspaceReasonOptions,
  };
}

export async function loadOpsWorkspaceSelection(
  params: Omit<Parameters<typeof buildOpsWorkspaceSelection>[0], "previewRows"> & {
    loadWorkspacePreviewRows: (
      workspaceKey: OpsWorkspaceQueueKey,
    ) => Promise<OpsWorkspacePreviewRow[]>;
  },
) {
  const selectedWorkspaceKey = resolveOpsWorkspaceQueueKey(
    params.effectiveBoardBucketFilter,
  );
  const previewRows = await params.loadWorkspacePreviewRows(selectedWorkspaceKey);

  return buildOpsWorkspaceSelection({
    ...params,
    previewRows,
  });
}
