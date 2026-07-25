import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const rowSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsQueueRowCard.tsx"),
  "utf8",
);
const panelSource = fs.readFileSync(
  path.join(repoRoot, "app", "ops", "_components", "OpsBoardActiveQueuePanel.tsx"),
  "utf8",
);
const opsPageSource = fs.readFileSync(path.join(repoRoot, "app", "ops", "page.tsx"), "utf8");

describe("ops redesign ledger preservation", () => {
  it("centers the desktop ledger action column and its primary action", () => {
    expect(panelSource).toContain(
      'border-l border-slate-200 px-3 py-2.5 text-center">Actions',
    );
    expect(rowSource).toContain(
      "content-center items-center justify-center gap-1.5 border-l",
    );
  });

  it("keeps contact shortcuts on the mobile scheduling card but not the desktop ledger", () => {
    const desktopStart = rowSource.indexOf("function DesktopLedgerRow");
    const desktopEnd = rowSource.indexOf("function LedgerDetail", desktopStart);
    const mobileStart = rowSource.indexOf("function NeedsSchedulingCard");
    const mobileEnd = rowSource.indexOf("function CloseoutCard", mobileStart);

    const desktopSource = rowSource.slice(desktopStart, desktopEnd);
    const mobileSource = rowSource.slice(mobileStart, mobileEnd);

    expect(desktopSource).not.toContain(">Call</a>");
    expect(desktopSource).not.toContain(">Text</a>");
    expect(mobileSource).toContain(">Call</a>");
    expect(mobileSource).toContain(">Text</a>");
  });

  it("keeps the desktop ledger and mobile rich cards as separate presentations", () => {
    expect(rowSource).toContain('<div className="xl:hidden">{richCard}</div>');
    expect(rowSource).toContain("<DesktopLedgerRow view={view} />");
    expect(rowSource).toContain('data-ops-ledger-row={view.kind}');
    expect(rowSource).toContain("hidden border-b");
    expect(rowSource).not.toContain("absolute inset-y-0 right-0");
    expect(rowSource).not.toContain("group-hover/ledger:opacity-100");
  });

  it("retains the approved age thresholds and does not introduce mockup thresholds", () => {
    expect(rowSource).toContain("ageDays > 30");
    expect(rowSource).toContain("ageDays > 14");
    expect(rowSource).not.toContain("ageDays >= 13");
    expect(rowSource).not.toContain("ageDays >= 6");
  });

  it("preserves queue-specific desktop details and actions", () => {
    expect(rowSource).toContain('view.kind === "need_to_schedule"');
    expect(rowSource).toContain('view.kind === "closeout"');
    expect(rowSource).toContain("Open Follow Up");
    expect(rowSource).toContain("view.nextStepText");
    expect(rowSource).toContain("view.note");
    expect(rowSource).toContain("telHref(view.phone)");
    expect(rowSource).toContain("smsHref(view.phone)");
    expect(rowSource).toContain("view.stateChips");
  });

  it("does not revive action trays removed from the latest visible Ops cards", () => {
    expect(rowSource).not.toContain("Details &amp; actions");
    expect(rowSource).not.toContain('label="Schedule"');
    expect(rowSource).not.toContain('label="Permit"');
    expect(rowSource).not.toContain("DesktopVisibleSummary");
    expect(rowSource).toContain("normalizeLedgerComparison");
    expect(rowSource).toContain("showCloseoutNeeds");
    expect(rowSource).toContain("showCloseoutNext");
    expect(rowSource).toContain('<span className="text-slate-400">Needs </span>');
    expect(rowSource).toContain('<span className="text-slate-400">Next </span>');
    expect(rowSource).toContain('<span className="text-slate-400">Due </span>');
    expect(rowSource).toContain('view.scheduledText || "Not scheduled"');
  });

  it("keeps field-payment forms specialized and outside the generic ledger", () => {
    expect(rowSource).toContain(
      'if (view.kind === "field_payment_review") return <FieldPaymentReviewCard view={view} />',
    );
    expect(rowSource).toContain("verifyFieldPaymentCollectionReportFromForm");
    expect(rowSource).toContain("rejectFieldPaymentCollectionReportFromForm");
    expect(rowSource).toContain("data-ops-field-payment-review");
    expect(rowSource).toContain("Field Payment Review");
    expect(rowSource).not.toContain("<QueueCardOpenAndAct>");
  });

  it("renders aligned desktop headings and supplies last-attempt data to every job row family", () => {
    expect(panelSource).toContain("Customer / Job");
    expect(panelSource).toContain("Last Action");
    expect(panelSource).toContain("Last Attempt");
    expect(opsPageSource.match(/recentAttemptText:/g)?.length).toBe(4);
  });
});
