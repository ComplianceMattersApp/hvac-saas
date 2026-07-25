import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const opsPageSource = fs.readFileSync(path.join(repoRoot, "app", "ops", "page.tsx"), "utf8");
const panelSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsBoardActiveQueuePanel.tsx"),
  "utf8",
);

describe("ops redesign right rail preservation", () => {
  it("builds the desktop queue index from the existing queue destinations", () => {
    expect(opsPageSource).toContain("const opsRailQueueRows = [");
    expect(opsPageSource).toContain("...workspaceQueueChips.map");
    expect(opsPageSource).toContain("...hiddenTodayWorkspaceTabs.map");
    expect(opsPageSource).toContain("href={queue.href}");
    expect(opsPageSource).toContain('aria-current={queue.active ? "page" : undefined}');
  });

  it("keeps zero-count queues navigable and only changes their visual emphasis", () => {
    expect(opsPageSource).toContain('queue.count === 0 ? "opacity-40" : ""');
    expect(opsPageSource).not.toContain("disabled={queue.count === 0}");
    expect(opsPageSource).not.toContain("queue.count > 0 &&");
  });

  it("keeps the compact queue selector below the desktop-ledger breakpoint", () => {
    expect(panelSource).toContain('<div className="xl:hidden">');
    expect(panelSource).toContain(
      'className="mb-3 flex flex-wrap gap-2" aria-label="Operations queue selector"',
    );
    expect(opsPageSource).toContain('<div className="xl:hidden">');
    expect(opsPageSource).toContain(
      'className="mb-3 flex flex-wrap gap-2" aria-label="Operations queue selector"',
    );
    expect(opsPageSource).toContain('aria-label="Operations queue index"');
  });

  it("retains queue health, workshare, time-clock, and export workflows", () => {
    expect(opsPageSource).toContain("queueHealthStats.agingOver30");
    expect(opsPageSource).toContain("queueHealthStats.unassigned");
    expect(opsPageSource).toContain("queueHealthStats.breakdown.map");
    expect(opsPageSource).toContain('href="/ops/workshare/returned"');
    expect(opsPageSource).toContain('href="/ops/workshare/incoming"');
    expect(opsPageSource).toContain('href="/time-clock"');
    expect(opsPageSource).toContain("teamClockStatusRows.slice(0, 8)");
    expect(opsPageSource).toContain('href="#ops-export-menu"');
    expect(panelSource).toContain('<details id="ops-export-menu"');
  });

  it("uses the approved wide-screen rail without removing smaller-screen support", () => {
    expect(opsPageSource).toContain("xl:grid-cols-[minmax(0,1fr)_288px]");
    expect(opsPageSource).toContain("xl:sticky xl:top-44 xl:self-start");
    expect(opsPageSource).toContain("hidden rounded-xl");
    expect(opsPageSource).toContain("xl:block");
  });
});
