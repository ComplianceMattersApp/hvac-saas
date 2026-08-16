import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { OPS_BOARD_SORT_OPTIONS } from "@/lib/ops/ops-board-sorting";
import { resolveVisibleOpsWorkspaceQueueKeys } from "@/lib/ops/ops-workspace-queues";
import { EXCEPTION_QUEUE_STATUSES } from "@/lib/ops/queue-status-contracts";

const repoRoot = process.cwd();
const bootstrapLoaderSource = fs.readFileSync(
  path.join(repoRoot, "lib", "ops", "ops-workspace-bootstrap-loader.ts"),
  "utf8",
);
const utilityRailSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsWorkspaceUtilityRail.tsx"),
  "utf8",
);
const waitingExceptionLoaderSource = fs.readFileSync(
  path.join(repoRoot, "lib", "ops", "waiting-exception-loader.ts"),
  "utf8",
);
const rowSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsQueueRowCard.tsx"),
  "utf8",
);
const panelSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsBoardActiveQueuePanel.tsx"),
  "utf8",
);
const contractSource = fs.readFileSync(
  path.join(repoRoot, "docs", "OPS_DESKTOP_QUEUE_CONTRACT.md"),
  "utf8",
);

describe("frozen Ops desktop contract", () => {
  it("keeps Exceptions available to service accounts and zero-count links reachable", () => {
    expect(
      resolveVisibleOpsWorkspaceQueueKeys({
        productMode: "hvac_service",
        permitRequestsSchemaAvailable: false,
      }),
    ).toContain("exceptions");
    expect(EXCEPTION_QUEUE_STATUSES).toEqual([
      "failed",
      "retest_needed",
      "pending_office_review",
      "problem",
    ]);
    expect(waitingExceptionLoaderSource).toContain("EXCEPTION_QUEUE_STATUSES");
    expect(waitingExceptionLoaderSource).toContain("excludeHistoricalRetestParents");
    expect(utilityRailSource).toContain('queue.count === 0 ? "opacity-40" : ""');
    expect(utilityRailSource).not.toContain("disabled={queue.count === 0}");
  });

  it("pins current sorting and Contractor Focus gates", () => {
    expect(OPS_BOARD_SORT_OPTIONS.map((option) => option.key)).toEqual([
      "oldest",
      "newest",
      "scheduled_soonest",
      "contractor_az",
      "customer_az",
    ]);
    expect(bootstrapLoaderSource).toContain(
      'const showContractorFocusSelection = productMode === "ecc_hers" || productMode === "hybrid";',
    );
  });

  it("pins the approved desktop action treatment without changing mobile cards", () => {
    const desktopStart = rowSource.indexOf("function DesktopLedgerRow");
    const desktopEnd = rowSource.indexOf("function LedgerDetail", desktopStart);
    const mobileStart = rowSource.indexOf("function MobileOpsCard");
    const mobileEnd = rowSource.indexOf("function NeedsSchedulingCard", mobileStart);
    const schedulingStart = mobileEnd;
    const schedulingEnd = rowSource.indexOf("function CloseoutCard", schedulingStart);
    const desktopSource = rowSource.slice(desktopStart, desktopEnd);
    const mobileSource = rowSource.slice(mobileStart, mobileEnd);
    const schedulingSource = rowSource.slice(schedulingStart, schedulingEnd);

    expect(desktopSource).toContain("justify-center");
    expect(desktopSource).not.toContain(">Call</a>");
    expect(desktopSource).not.toContain(">Text</a>");
    expect(mobileSource).toContain(">Call</a>");
    expect(mobileSource).toContain(">Text</a>");
    expect(schedulingSource).toContain("phoneHref={phoneHref}");
    expect(schedulingSource).toContain("textHref={textHref}");
    expect(panelSource).toContain('text-center">Actions');
  });

  it("rejects known legacy desktop fallbacks", () => {
    expect(rowSource).not.toContain("Details &amp; actions");
    expect(rowSource).not.toContain("DesktopVisibleSummary");
    expect(rowSource).not.toContain("absolute inset-y-0 right-0");
    expect(rowSource).not.toContain("group-hover/ledger:opacity-100");
    expect(rowSource).not.toContain("<QueueCardOpenAndAct>");
  });

  it("keeps the final authority and mobile boundary documented", () => {
    expect(contractSource).toContain("authoritative handoff for future `/ops` desktop work");
    expect(contractSource).toContain("Exceptions are available to `hvac_service`");
    expect(contractSource).toContain("Desktop Needs Scheduling does not show Call or Text buttons");
    expect(contractSource).toContain("Mobile is not frozen by this document");
  });
});
