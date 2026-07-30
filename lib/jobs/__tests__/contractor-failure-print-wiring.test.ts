import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const printPage = readFileSync(
  join(root, "app/portal/jobs/[id]/report/print/page.tsx"),
  "utf8",
);
const printButton = readFileSync(
  join(root, "app/portal/jobs/[id]/report/print/PrintFailureReportButton.tsx"),
  "utf8",
);
const reportPanel = readFileSync(
  join(root, "app/jobs/[id]/_components/ContractorReportPanel.tsx"),
  "utf8",
);

describe("contractor failure print wiring", () => {
  it("locks print output to Letter with bounded evidence and no model/serial library", () => {
    expect(printPage).toContain("@page { size: Letter portrait");
    expect(printPage).toContain("max-h-[3.25in]");
    expect(printPage).toContain("Refrigerant Charge Photo Evidence%");
    expect(printPage).toContain("Model/serial captures and unrelated job attachments are intentionally excluded.");
  });

  it("supports office current-report preview and tenant branding", () => {
    expect(reportPanel).toContain("/report/print?mode=current");
    expect(printPage).toContain("generateContractorReportPreview");
    expect(printPage).toContain("businessIdentity.logo_url");
    expect(printPage).toContain("businessIdentity.support_phone");
    expect(printPage).toContain("businessIdentity.support_email");
  });

  it("records viewed and printed actions from the print control", () => {
    expect(printButton).toContain('action: "viewed"');
    expect(printButton).toContain('action: "printed"');
    expect(printButton).toContain("window.print()");
  });
});
