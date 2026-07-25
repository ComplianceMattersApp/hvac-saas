import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { OPS_BOARD_SORT_OPTIONS } from "@/lib/ops/ops-board-sorting";

const repoRoot = process.cwd();
const globalsSource = fs.readFileSync(path.join(repoRoot, "app", "globals.css"), "utf8");
const opsPageSource = fs.readFileSync(path.join(repoRoot, "app", "ops", "page.tsx"), "utf8");
const panelSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsBoardActiveQueuePanel.tsx"),
  "utf8",
);
const contractorFocusSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "ContractorFocusSelector.tsx"),
  "utf8",
);
const rootLayoutSource = fs.readFileSync(path.join(repoRoot, "app", "layout.tsx"), "utf8");

describe("ops redesign visual scope", () => {
  it("defines the approved paper-neutral palette without changing the global body background", () => {
    expect(globalsSource).toContain("--color-sand-50: #faf9f5");
    expect(globalsSource).toContain("--color-sand-100: #f5f4f0");
    expect(globalsSource).toContain("--color-sand-150: #f2f1ec");
    expect(globalsSource).toContain("--color-sand-200: #e5e3dc");
    expect(globalsSource).toContain("background: var(--background)");
  });

  it("applies the canvas only at the operations workspace boundary", () => {
    expect(opsPageSource).toContain("data-ops-visual-scope");
    expect(opsPageSource).toContain("bg-sand-100");
    expect(rootLayoutSource).not.toContain("bg-sand-100");
    expect(rootLayoutSource).not.toContain("data-ops-visual-scope");
  });

  it("does not replace the operations navigation and action contract", () => {
    expect(opsPageSource).toContain("<OpsBoardActiveQueuePanel");
    expect(opsPageSource).toContain("verifyFieldPaymentCollectionReportFromForm");
    expect(opsPageSource).toContain("rejectFieldPaymentCollectionReportFromForm");
    expect(opsPageSource).toContain("createManualPermitRequestFromOps");
    expect(opsPageSource).toContain("createJobAndMarkPermitCreatedFromOps");
  });

  it("uses one sticky header band while retaining conditional operational notices", () => {
    expect(opsPageSource).toContain("data-ops-sticky-header");
    expect(opsPageSource).toContain("sticky top-14 z-30");
    expect(opsPageSource).toContain("border-b border-slate-200 bg-sand-100");
    expect(opsPageSource).toContain("notice === \"estimates_unavailable\"");
    expect(opsPageSource.match(/Operations Workspace/g)?.length).toBe(1);
  });

  it("removes the duplicate Today link while keeping returned work in the header band", () => {
    const headerStart = opsPageSource.indexOf("data-ops-sticky-header");
    const headerEnd = opsPageSource.indexOf("</header>", headerStart);
    const headerSource = opsPageSource.slice(headerStart, headerEnd);

    expect(headerSource).not.toContain('href="/today"');
    expect(headerSource).not.toContain("Go to Today");
    expect(headerSource).toContain("returnedWorkshareCount > 0");
    expect(headerSource).toContain('href="/ops/workshare/returned"');
  });

  it("uses warm-neutral interaction fills on the redesigned Ops surfaces", () => {
    expect(opsPageSource).not.toContain("hover:bg-slate-50");
    expect(panelSource).not.toContain("hover:bg-slate-50");
    expect(contractorFocusSource).not.toContain("hover:bg-slate-50");
    expect(opsPageSource).toContain("hover:bg-sand-50");
    expect(panelSource).toContain("bg-sand-150");
    expect(contractorFocusSource).toContain("bg-sand-50");
  });
});

describe("ops redesign filter parity", () => {
  it("keeps the complete current Ops sort menu", () => {
    expect(OPS_BOARD_SORT_OPTIONS).toEqual([
      { key: "oldest", label: "Oldest first" },
      { key: "newest", label: "Newest first" },
      { key: "scheduled_soonest", label: "Scheduled soonest" },
      { key: "contractor_az", label: "Contractor A-Z" },
      { key: "customer_az", label: "Customer A-Z" },
    ]);
  });

  it("keeps Contractor Focus visibly identified at desktop widths", () => {
    expect(contractorFocusSource).toContain(
      'uppercase tracking-[0.11em] opacity-70">Contractor Focus',
    );
    expect(contractorFocusSource).not.toContain(
      'opacity-70 sm:hidden">Contractor Focus',
    );
  });
});
