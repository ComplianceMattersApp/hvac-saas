import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEquipmentLabelPhotoCaption,
  EQUIPMENT_LABEL_PHOTO_ATTACHMENT_TAG,
  parseEquipmentLabelPhotoCaption,
} from "@/lib/jobs/refrigerant-charge-evidence";

const jobInfoPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/info/page.tsx"),
  "utf8",
);
const jobV2PageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/v2/page.tsx"),
  "utf8",
);
const completionReportSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/tests/page.tsx"),
  "utf8",
);
const equipmentCreateFormSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/EquipmentCreateForm.tsx"),
  "utf8",
);
const equipmentEditCardSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/EquipmentEditCard.tsx"),
  "utf8",
);
const equipmentPhotoPanelSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/EquipmentLabelPhotoEvidencePanel.tsx"),
  "utf8",
);
const refrigerantEvidenceImageSource = readFileSync(
  resolve(__dirname, "../../../components/jobs/RefrigerantEvidenceImage.tsx"),
  "utf8",
);
const jobActionsSource = readFileSync(
  resolve(__dirname, "../../actions/job-actions.ts"),
  "utf8",
);

describe("equipment label photo evidence", () => {
  it("tags and parses equipment label photo captions with equipment and system context", () => {
    const caption = buildEquipmentLabelPhotoCaption({
      equipmentId: "equipment-1",
      systemId: "system-1",
      caption: "Equipment Label Photo - System 1 - Condenser",
    });

    expect(caption).toContain(EQUIPMENT_LABEL_PHOTO_ATTACHMENT_TAG);
    expect(caption).toContain("[equipment-id:equipment-1]");
    expect(caption).toContain("[system-id:system-1]");
    expect(parseEquipmentLabelPhotoCaption(caption)).toEqual({
      equipmentId: "equipment-1",
      systemId: "system-1",
      caption: "Equipment Label Photo - System 1 - Condenser",
    });
  });

  it("adds take/upload label photo controls to create and edit equipment flows", () => {
    expect(equipmentPhotoPanelSource).toContain("Take Label Photo");
    expect(equipmentPhotoPanelSource).toContain("Upload Label Photo");
    expect(equipmentPhotoPanelSource).toContain("Label photo captured");
    expect(equipmentPhotoPanelSource).toContain('attachmentEvidenceContext: "equipment_label_photo"');
    expect(equipmentCreateFormSource).toContain("<EquipmentLabelPhotoEvidencePanel");
    expect(equipmentCreateFormSource).toContain('name="equipment_id"');
    expect(equipmentCreateFormSource).toContain("hasManualEquipmentDetails || hasLabelPhotoEvidence");
    expect(equipmentCreateFormSource).toContain("onSavedChange={setHasLabelPhotoEvidence}");
    expect(equipmentPhotoPanelSource).toContain("onSavedChange?.(true)");
    expect(equipmentEditCardSource).toContain("<EquipmentLabelPhotoEvidencePanel");
  });

  it("saves a selected label photo through the equipment form's final action", () => {
    expect(equipmentCreateFormSource).toContain("saveWithParentForm");
    expect(equipmentEditCardSource).toContain("saveWithParentForm");
    expect(equipmentPhotoPanelSource).toContain('form.addEventListener("submit", handleSubmit)');
    expect(equipmentPhotoPanelSource).toContain("form.requestSubmit(");
    expect(equipmentPhotoPanelSource).toContain("Photo will save when you complete this step.");
    expect(equipmentPhotoPanelSource).toContain("onSavedChange?.(files.length > 0 || savedCount > 0)");
    expect(equipmentPhotoPanelSource).toContain("onSavedChange?.(savedCount > 0)");
    expect(equipmentCreateFormSource).toContain("showSubmitButton={canSubmitEquipment}");
  });

  it("persists the pending equipment id on equipment creation without changing structured fields", () => {
    expect(jobActionsSource).toContain('const requestedEquipmentId = String(formData.get("equipment_id") || "").trim();');
    expect(jobActionsSource).toContain("...(requestedEquipmentId ? { id: requestedEquipmentId } : {})");
    expect(jobActionsSource).toContain("sanitizeEquipmentFields");
    expect(jobActionsSource).toContain("tonnage");
  });

  it("loads label photos into the equipment workspace and groups them by equipment id", () => {
    expect(jobInfoPageSource).toContain("listJobEquipmentLabelPhotoImages");
    expect(jobInfoPageSource).toContain("labelPhotosByEquipmentId");
    expect(jobInfoPageSource).toContain("labelPhotoAttachments={labelPhotosByEquipmentId[String(eq.id)] ?? []}");
  });

  it("marks photo-captured equipment in the V2 job equipment summaries", () => {
    expect(jobV2PageSource).toContain("listJobEquipmentLabelPhotoImages");
    expect(jobV2PageSource).toContain("equipmentIdsWithLabelPhoto");
    expect(jobV2PageSource).toContain("has_label_photo_evidence");
    expect(jobV2PageSource).toContain("Photo captured");
  });

  it("renders completion report equipment photos under matching equipment blocks with blank fields hidden", () => {
    expect(completionReportSource).toContain("listJobEquipmentLabelPhotoImages");
    expect(completionReportSource).toContain("equipmentLabelPhotosByEquipmentId");
    expect(completionReportSource).toContain("renderEquipmentReportItem");
    expect(completionReportSource).toContain("labelPhotos.map");
    expect(completionReportSource).toContain("Equipment label photo");
    expect(completionReportSource).toContain('variant="equipmentLabel"');
    expect(completionReportSource).toContain("Label photo evidence");
    expect(refrigerantEvidenceImageSource).toContain('href={src}');
    expect(refrigerantEvidenceImageSource).toContain('title="Open full-size image"');
    expect(refrigerantEvidenceImageSource).toContain("group-hover:scale-150");
    expect(completionReportSource).not.toContain("Manufacturer: ${present(eq?.manufacturer) || \"-\"}");
    expect(completionReportSource).not.toContain("Model: ${present(eq?.model) || \"-\"}");
    expect(completionReportSource).not.toContain("Serial: ${present(eq?.serial) || \"-\"}");
  });

  it("keeps report presentation organized as header, CHEERS summary, system sections, and equipment evidence", () => {
    expect(completionReportSource).toContain("CHEERS Completion Report");
    expect(completionReportSource).toContain("CHEERS Entry Summary");
    expect(completionReportSource).toContain("System Sections");
    expect(completionReportSource).toContain("System Section");
    expect(completionReportSource).toContain("renderEquipmentReportItem");
    expect(completionReportSource).toContain("reportFieldRows");
    expect(completionReportSource).toContain("cheersEntrySummaryFields");
    expect(completionReportSource).toContain("reportLogoUrl");
    expect(completionReportSource).toContain("resolveInternalBusinessProfileLogoUrl");
    expect(completionReportSource).toContain("/cm-logo.png");
    expect(completionReportSource).toContain("reportDetailSectionClass");
    expect(completionReportSource).toContain("AHRI Matched System Verification (Office)");
    expect(completionReportSource).toContain("Airflow Summary");
    expect(completionReportSource).toContain("Refrigerant Charge - Full Detailed Result");
  });

  it("preserves real manual equipment fields and required structured values when present", () => {
    expect(completionReportSource).toContain('label: "Manufacturer"');
    expect(completionReportSource).toContain('label: "Model"');
    expect(completionReportSource).toContain('label: "Serial"');
    expect(completionReportSource).toContain("`${formatEquipmentNumber(eq.tonnage)} tons`");
  });
});
