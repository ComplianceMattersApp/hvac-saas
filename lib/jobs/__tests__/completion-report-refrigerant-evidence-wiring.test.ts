import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const completionReportSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);
const evidenceImageSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/RefrigerantEvidenceImage.tsx"),
  "utf8",
);

describe("completion report refrigerant evidence wiring", () => {
  it("loads tagged refrigerant evidence images for the Completion Report path", () => {
    expect(completionReportSource).toContain("isCompletionReportFocused");
    expect(completionReportSource).toContain("listJobRefrigerantChargeEvidenceImages");
    expect(completionReportSource).toContain('focusedType === "refrigerant_charge" || isCompletionReportFocused');
  });

  it("uses compact evidence-first rendering when structured refrigerant detail is empty", () => {
    expect(completionReportSource).toContain("hasMeaningfulRefrigerantChargeDetail");
    expect(completionReportSource).toContain("showCompactRefrigerantEvidenceOnly");
    expect(completionReportSource).toContain("!hasStructuredRefrigerantDetail");
    expect(completionReportSource).toContain("renderRefrigerantEvidenceSection(true)");
    expect(completionReportSource).toContain(
      "Structured refrigerant values were not entered for this run; the attached image is included as supporting evidence.",
    );
  });

  it("renders evidence inline inside the Refrigerant Charge report section", () => {
    expect(completionReportSource).toContain("Refrigerant Charge Evidence");
    expect(completionReportSource).toContain("Photo evidence attached for refrigerant-side measurements.");
    expect(completionReportSource).toContain("<RefrigerantEvidenceImage");
    expect(completionReportSource).toContain("refrigerantEvidenceAttachments.map");
    expect(completionReportSource).toContain("renderRefrigerantEvidenceSection(false)");
    expect(completionReportSource).toContain("break-inside-avoid");
  });

  it("keeps display failure behavior in the image component", () => {
    expect(evidenceImageSource).toContain(
      "Refrigerant evidence photo is on file but could not be displayed in this report view.",
    );
    expect(evidenceImageSource).toContain("onError={() => setFailed(true)}");
    expect(evidenceImageSource).toContain("object-contain");
  });
});
