import { describe, expect, it } from "vitest";
import { resolveProductSurfaceProfile } from "@/lib/business/product-surface-profile";

describe("product surface profile", () => {
  it("uses cleaning-native labels and hides HVAC/ECC-native surfaces", () => {
    const profile = resolveProductSurfaceProfile("cleaning_services");

    expect(profile.labels).toMatchObject({
      job: "Cleaning Job",
      fieldUser: "Cleaner",
      fieldTeam: "Crew",
      visitScope: "Cleaning Scope",
      workItems: "Cleaning Tasks",
      finishComplete: "Cleaning Completed",
      needParts: "Supplies Needed",
      siteDetails: "Site Details",
    });
    expect(profile.surfaces).toMatchObject({
      equipment: false,
      eccTests: false,
      permits: false,
      certs: false,
      retest: false,
      contractorRaterHandoff: false,
      cleaningChecklistPlaceholder: true,
      cleaningQualityPlaceholder: true,
      siteInstructionsPlaceholder: true,
      crewLanguage: true,
    });
  });

  it("keeps existing HVAC and ECC surface posture unchanged", () => {
    expect(resolveProductSurfaceProfile("hvac_service").surfaces.equipment).toBe(true);
    expect(resolveProductSurfaceProfile("hvac_service").surfaces.eccTests).toBe(false);
    expect(resolveProductSurfaceProfile("hvac_service").surfaces.permits).toBe(true);
    expect(resolveProductSurfaceProfile("hvac_service").surfaces.contractorRaterHandoff).toBe(false);
    expect(resolveProductSurfaceProfile("ecc_hers").surfaces.eccTests).toBe(true);
    expect(resolveProductSurfaceProfile("ecc_hers").surfaces.permits).toBe(true);
    expect(resolveProductSurfaceProfile("ecc_hers").surfaces.certs).toBe(true);
    expect(resolveProductSurfaceProfile("ecc_hers").surfaces.contractorRaterHandoff).toBe(true);
    expect(resolveProductSurfaceProfile("hybrid").surfaces.eccTests).toBe(true);
    expect(resolveProductSurfaceProfile("hybrid").surfaces.equipment).toBe(true);
    expect(resolveProductSurfaceProfile("hybrid").surfaces.permits).toBe(true);
    expect(resolveProductSurfaceProfile("hybrid").surfaces.contractorRaterHandoff).toBe(true);
  });
});
