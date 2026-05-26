import { describe, expect, it } from "vitest";

import {
  REFRIGERANT_CHARGE_ATTACHMENT_TAG,
  buildAttachmentCaptionWithEvidenceContext,
  isRefrigerantChargeEvidenceCaption,
  normalizeJobAttachmentEvidenceContext,
  stripRefrigerantChargeEvidenceTag,
} from "@/lib/jobs/refrigerant-charge-evidence";

describe("refrigerant charge evidence helpers", () => {
  it("normalizes supported evidence context", () => {
    expect(normalizeJobAttachmentEvidenceContext("refrigerant_charge_photo")).toBe(
      "refrigerant_charge_photo",
    );
    expect(normalizeJobAttachmentEvidenceContext("unknown")).toBeNull();
  });

  it("tags caption for refrigerant charge evidence context", () => {
    const tagged = buildAttachmentCaptionWithEvidenceContext({
      context: "refrigerant_charge_photo",
      caption: "Gauge manifold at stable readings",
    });

    expect(tagged).toBe(`${REFRIGERANT_CHARGE_ATTACHMENT_TAG} Gauge manifold at stable readings`);
  });

  it("uses the tag alone when caption is empty", () => {
    const tagged = buildAttachmentCaptionWithEvidenceContext({
      context: "refrigerant_charge_photo",
      caption: "   ",
    });

    expect(tagged).toBe(REFRIGERANT_CHARGE_ATTACHMENT_TAG);
  });

  it("does not tag caption without evidence context", () => {
    const caption = buildAttachmentCaptionWithEvidenceContext({
      caption: "Job note",
      context: null,
    });

    expect(caption).toBe("Job note");
  });

  it("detects and strips evidence tag", () => {
    const caption = `${REFRIGERANT_CHARGE_ATTACHMENT_TAG} Gauge photo`;
    expect(isRefrigerantChargeEvidenceCaption(caption)).toBe(true);
    expect(stripRefrigerantChargeEvidenceTag(caption)).toBe("Gauge photo");
  });
});
