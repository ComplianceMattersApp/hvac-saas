import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cameraInputBlock } from "./camera-input-block";

const root = resolve(__dirname, "../../..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const refrigerantPanelSource = readFileSync(
  resolve(root, "components/jobs/RefrigerantChargePhotoEvidencePanel.tsx"),
  "utf8",
);
const equipmentPanelSource = readFileSync(
  resolve(root, "components/jobs/EquipmentLabelPhotoEvidencePanel.tsx"),
  "utf8",
);
const jobAttachmentsSource = readFileSync(
  resolve(root, "app/jobs/[id]/_components/JobAttachmentsInternal.tsx"),
  "utf8",
);
const testsPageSource = readFileSync(
  resolve(root, "app/jobs/[id]/tests/page.tsx"),
  "utf8",
);

describe("photo evidence capture boundary", () => {
  it("uses the Capacitor Android bridge release that repairs image-capture URI grants", () => {
    for (const packageName of [
      "@capacitor/android",
      "@capacitor/cli",
      "@capacitor/core",
      "@capacitor/ios",
    ]) {
      expect(packageJson.dependencies[packageName]).toBe("^8.4.2");
      expect(packageLock.packages[`node_modules/${packageName}`].version).toBe("8.4.2");
    }
  });

  it.each([
    ["refrigerant charge and asbestos", refrigerantPanelSource],
    ["equipment label", equipmentPanelSource],
  ])("keeps %s camera and library inputs distinct", (_name, source) => {
    const cameraInput = cameraInputBlock(source);
    expect(cameraInput).toContain('accept="image/*"');
    expect(cameraInput).toContain('capture="environment"');
    expect(cameraInput).not.toContain("multiple");

    const libraryInput = source.match(/<input\s+ref=\{uploadPhotoRef\}[\s\S]*?\/>/)?.[0];
    expect(libraryInput).toBeDefined();
    expect(libraryInput).toContain('accept="image/*"');
    expect(libraryInput).toContain("multiple");
    expect(libraryInput).not.toContain("capture=");
  });

  it("wires both test evidence contexts through the repaired shared picker", () => {
    expect(testsPageSource).toContain('evidenceContext="duct_asbestos_photo"');
    expect(testsPageSource).toContain("evidenceAttachments={ductAsbestosPhotoAttachments}");
    expect(testsPageSource).toContain("evidenceAttachments={refrigerantEvidenceAttachments}");
    expect(testsPageSource.match(/<RefrigerantChargePhotoEvidencePanel/g) ?? []).toHaveLength(2);
  });

  it("keeps the full job attachment image picker camera-only while its library picker allows multiples", () => {
    expect(jobAttachmentsSource).toMatch(
      /label: "Take Photo",[\s\S]*?capture: "environment",[\s\S]*?multiple: false/,
    );
    expect(jobAttachmentsSource).toMatch(
      /label: "Upload from Library",[\s\S]*?accept: "image\/\*",[\s\S]*?multiple: true/,
    );
  });
});
