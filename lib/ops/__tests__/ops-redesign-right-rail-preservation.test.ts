import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const opsPageSource = fs.readFileSync(path.join(repoRoot, "app", "ops", "page.tsx"), "utf8");
const panelSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsBoardActiveQueuePanel.tsx"),
  "utf8",
);
const mobileSwitcherSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsMobileQueueSwitcher.tsx"),
  "utf8",
);
const utilityRailSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsWorkspaceUtilityRail.tsx"),
  "utf8",
);

describe("ops redesign right rail preservation", () => {
  it("keeps rail presentation behind one typed page boundary", () => {
    expect(opsPageSource).toContain('import OpsWorkspaceUtilityRail from "./_components/OpsWorkspaceUtilityRail";');
    expect(opsPageSource).toContain("<OpsWorkspaceUtilityRail");
    expect(opsPageSource).not.toContain('aria-label="Operations queue index"');
    expect(opsPageSource).not.toContain("Queue Health</div>");
    expect(utilityRailSource).toContain("export type OpsWorkspaceUtilityRailProps");
  });

  it("builds the desktop queue index from the existing queue destinations", () => {
    expect(opsPageSource).toContain("const opsRailQueueRows = [");
    expect(opsPageSource).toContain("...workspaceQueueChips.map");
    expect(opsPageSource).toContain("...hiddenTodayWorkspaceTabs.map");
    expect(opsPageSource).toContain("queues={opsRailQueueRows}");
    expect(utilityRailSource).toContain("href={queue.href}");
    expect(utilityRailSource).toContain('aria-current={queue.active ? "page" : undefined}');
  });

  it("keeps zero-count queues navigable and only changes their visual emphasis", () => {
    expect(utilityRailSource).toContain('queue.count === 0 ? "opacity-40" : ""');
    expect(utilityRailSource).not.toContain("disabled={queue.count === 0}");
    expect(utilityRailSource).not.toContain("queue.count > 0 &&");
  });

  it("uses the mobile queue sheet below the desktop-ledger breakpoint", () => {
    expect(opsPageSource).toContain("<OpsMobileQueueSwitcher queues={opsRailQueueRows} />");
    expect(mobileSwitcherSource).toContain('className="xl:hidden"');
    expect(mobileSwitcherSource).toContain('aria-label="Switch queue"');
    expect(mobileSwitcherSource).toContain("populatedQueues.map(queueRow)");
    expect(mobileSwitcherSource).toContain("emptyQueues.map(queueRow)");
    expect(utilityRailSource).toContain('aria-label="Operations queue index"');
  });

  it("retains queue health, workshare, time-clock, and export workflows", () => {
    expect(utilityRailSource).toContain("queueHealth.agingOver30");
    expect(utilityRailSource).toContain("queueHealth.unassigned");
    expect(utilityRailSource).toContain("queueHealth.breakdown.map");
    expect(utilityRailSource).toContain('href="/ops/workshare/returned"');
    expect(utilityRailSource).toContain('href="/ops/workshare/incoming"');
    expect(utilityRailSource).toContain('href="/time-clock"');
    expect(utilityRailSource).toContain("teamClockRows.slice(0, 8)");
    expect(utilityRailSource).toContain('href="#ops-export-menu"');
    expect(panelSource).toContain('<details id="ops-export-menu"');
  });

  it("uses the approved wide-screen rail without removing smaller-screen support", () => {
    expect(opsPageSource).toContain("xl:grid-cols-[minmax(0,1fr)_304px]");
    expect(utilityRailSource).toContain("xl:sticky xl:top-44 xl:self-start");
    expect(utilityRailSource).toContain("hidden rounded-xl");
    expect(utilityRailSource).toContain("xl:block");
  });
});
