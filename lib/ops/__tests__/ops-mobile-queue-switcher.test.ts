import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const opsPageSource = fs.readFileSync(path.join(repoRoot, "app", "ops", "page.tsx"), "utf8");
const switcherSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsMobileQueueSwitcher.tsx"),
  "utf8",
);
const panelSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsBoardActiveQueuePanel.tsx"),
  "utf8",
);
const rowCardSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsQueueRowCard.tsx"),
  "utf8",
);
const queueCardSource = fs.readFileSync(
  path.join(repoRoot, "components", "ops", "QueueCard.tsx"),
  "utf8",
);
const globalStylesSource = fs.readFileSync(path.join(repoRoot, "app", "globals.css"), "utf8");
const desktopContractSource = fs.readFileSync(
  path.join(repoRoot, "docs", "OPS_DESKTOP_QUEUE_CONTRACT.md"),
  "utf8",
);
const mobileResolutionSource = fs.readFileSync(
  path.join(repoRoot, "docs", "OPS_MOBILE_ENGINEERING_RESOLUTION.md"),
  "utf8",
);

describe("Ops mobile queue switcher", () => {
  it("projects the same server queue links used by the frozen desktop rail", () => {
    expect(opsPageSource).toContain("const opsRailQueueRows = [");
    expect(opsPageSource).toContain("<OpsMobileQueueSwitcher queues={opsRailQueueRows} />");
    expect(switcherSource).toContain("href={queue.href}");
    expect(switcherSource).toContain('aria-current={queue.active ? "page" : undefined}');
    expect(switcherSource).not.toContain("setActiveQueue");
    expect(switcherSource).not.toContain("fetch(");
  });

  it("keeps empty queues reachable while grouping them under Clear", () => {
    expect(switcherSource).toContain("const emptyQueues = queues.filter");
    expect(switcherSource).toContain("emptyQueues.map(queueRow)");
    expect(switcherSource).toContain("Clear");
    expect(switcherSource).not.toContain("disabled");
    expect(switcherSource).not.toContain("pointer-events-none");
  });

  it("keeps touch controls at least 44px and the sheet mobile-only", () => {
    expect(switcherSource).toContain('className="xl:hidden"');
    expect(switcherSource).toContain("min-h-11");
    expect(switcherSource).toContain("min-h-12");
    expect(switcherSource).toContain('aria-modal="true"');
    expect(switcherSource).toContain('aria-expanded={open}');
  });

  it("keeps the mobile export intentional and inline without changing its workflow", () => {
    expect(panelSource).toContain('grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]');
    expect(panelSource).toContain('<details id="ops-export-menu-mobile"');
    expect(panelSource).toContain('<details id="ops-export-menu"');
    expect(panelSource).toContain("min-h-11");
    expect(panelSource).toContain("href={internalExportHref}");
    expect(panelSource).toContain("href={contractorSafeExportHref}");
    expect(panelSource).toContain("panel?.canExportContractorSafeCsv");
    expect(panelSource).toContain("mb-3 hidden justify-end xl:flex");
  });

  it("raises mobile card readability and touch targets without replacing card data", () => {
    expect(queueCardSource).toContain("text-base font-semibold");
    expect(queueCardSource).toContain("inline-flex min-h-11 items-center text-base");
    expect(queueCardSource).toContain("xl:min-h-0");
    expect(queueCardSource).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(queueCardSource).toContain("contents xl:flex");
    expect(queueCardSource).toContain("col-span-2 inline-flex min-h-11 w-full");
    expect(queueCardSource).toContain('text-[11px] font-semibold uppercase');
    expect(queueCardSource).toContain("inline-flex min-h-11");
    expect(rowCardSource).toContain('className="xl:hidden">{richCard}</div>');
    expect(rowCardSource).toContain("compactContactActionClass");
    expect(rowCardSource).toContain("min-h-11 min-w-14");
    expect(rowCardSource).toContain("xl:min-h-8");
    expect(rowCardSource).toContain('{ label: "Last Attempt", value: view.recentAttemptText }');
    expect(rowCardSource).toContain('{ label: "Reason", value: view.reasonLabel');
  });

  it("renders the complete mobile card identity and attempt projection for every standard card kind", () => {
    expect(queueCardSource).toContain("eyebrow?: ReactNode");
    expect(rowCardSource.match(/eyebrow=\{view\.jobTypeLabel\}/g)).toHaveLength(4);
    expect(rowCardSource.match(/title=\{view\.customerName\}/g)).toHaveLength(4);
    expect(rowCardSource.match(/subtitle=\{view\.address\}/g)).toHaveLength(4);
    expect(rowCardSource.match(/\{ label: "Job", value: view\.title \}/g)).toHaveLength(4);
    expect(rowCardSource.match(/\{ label: "Last Attempt", value: view\.recentAttemptText \}/g)).toHaveLength(4);
  });

  it("suppresses duplicate closeout Needs and Next Step text on mobile", () => {
    expect(rowCardSource).toContain("const showNeeds =");
    expect(rowCardSource).toContain("const showNext =");
    expect(rowCardSource).toContain("!reasonComparison.includes(needsComparison)");
    expect(rowCardSource).toContain("!reasonComparison.includes(nextStepComparison)");
    expect(rowCardSource).toContain("nextStepComparison !== needsComparison");
  });

  it("removes duplicate mobile workspace framing while retaining queue actions", () => {
    expect(opsPageSource).toContain("border-0 bg-transparent p-0 shadow-none ring-0 xl:rounded-3xl");
    expect(opsPageSource).toContain("hidden flex-wrap items-center justify-between gap-2 border-b");
    expect(panelSource).toContain("border-0 bg-transparent p-0 shadow-none ring-0 xl:rounded-2xl");
    expect(panelSource).toContain("mb-2 hidden flex-wrap items-center justify-between");
    expect(panelSource).toContain("headerRightAction.href");
    expect(panelSource).toContain("min-h-11 w-full");
    expect(panelSource).toContain("xl:hidden");
  });

  it("scopes the 44px touch floor to specialized mobile queues without rewriting their actions", () => {
    expect(opsPageSource).toContain('data-ops-specialized-mobile={canShowJobQueueExport ? undefined : ""}');
    expect(globalStylesSource).toContain("@media (max-width: 1279px)");
    expect(globalStylesSource).toContain("[data-ops-specialized-mobile]");
    expect(globalStylesSource).toContain("min-height: 44px");
    expect(globalStylesSource).toContain("min-height: 88px");
    expect(globalStylesSource).toContain(':not([type="checkbox"]):not([type="radio"])');
    expect(opsPageSource).toContain("form action={createManualPermitRequestFromOps}");
    expect(opsPageSource).toContain("form action={markPermitCreatedFromOps}");
    expect(opsPageSource).toContain("form action={createJobAndMarkPermitCreatedFromOps}");
  });

  it("keeps mobile utility workflows touch-safe and targets the visible export menu", () => {
    expect(opsPageSource).toContain('href="/ops/workshare/returned" className="flex min-h-11');
    expect(opsPageSource).toContain('href="/ops/workshare/incoming" className="flex min-h-11');
    expect(opsPageSource).toContain('href="/time-clock" className="flex min-h-11');
    expect(opsPageSource).toContain('href="#ops-export-menu-mobile"');
    expect(opsPageSource).toContain('href="#ops-export-menu"');
    expect(opsPageSource).toContain("flex min-h-11 cursor-pointer");
  });

  it("records the frozen desktop and rejected mobile behavior", () => {
    expect(desktopContractSource).toContain("frozen at `xl` and wider");
    expect(mobileResolutionSource).toContain("The concept's proposed 1024px breakpoint is rejected");
    expect(mobileResolutionSource).toContain("No disabled zero-count rows");
    expect(mobileResolutionSource).toContain("cross-queue contractor mode");
    expect(mobileResolutionSource).toContain("Approved post-mobile desktop backlog");
  });
});
