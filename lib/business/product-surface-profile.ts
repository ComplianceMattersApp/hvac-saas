import type { ProductMode } from "@/lib/business/product-mode-defaults";

export type ProductSurfaceProfile = {
  mode: ProductMode;
  labels: {
    job: string;
    fieldUser: string;
    fieldTeam: string;
    visitScope: string;
    workItems: string;
    finishComplete: string;
    needParts: string;
    siteDetails: string;
    quality: string;
  };
  surfaces: {
    equipment: boolean;
    eccTests: boolean;
    permits: boolean;
    certs: boolean;
    retest: boolean;
    contractorRaterHandoff: boolean;
    cleaningChecklistPlaceholder: boolean;
    cleaningQualityPlaceholder: boolean;
    siteInstructionsPlaceholder: boolean;
    crewLanguage: boolean;
  };
};

const DEFAULT_PROFILE: ProductSurfaceProfile = {
  mode: "hybrid",
  labels: {
    job: "Job",
    fieldUser: "Technician",
    fieldTeam: "Team",
    visitScope: "Visit Scope",
    workItems: "Work Items",
    finishComplete: "Work Completed",
    needParts: "Need Parts",
    siteDetails: "Equipment",
    quality: "Quality Review",
  },
  surfaces: {
    equipment: true,
    eccTests: true,
    permits: true,
    certs: true,
    retest: true,
    contractorRaterHandoff: true,
    cleaningChecklistPlaceholder: false,
    cleaningQualityPlaceholder: false,
    siteInstructionsPlaceholder: false,
    crewLanguage: false,
  },
};

export function resolveProductSurfaceProfile(mode: ProductMode): ProductSurfaceProfile {
  if (mode === "cleaning_services") {
    return {
      mode,
      labels: {
        job: "Cleaning Job",
        fieldUser: "Cleaner",
        fieldTeam: "Crew",
        visitScope: "Cleaning Scope",
        workItems: "Cleaning Tasks",
        finishComplete: "Cleaning Completed",
        needParts: "Supplies Needed",
        siteDetails: "Site Details",
        quality: "Quality Review",
      },
      surfaces: {
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
      },
    };
  }

  if (mode === "hvac_service") {
    return {
      ...DEFAULT_PROFILE,
      mode,
      surfaces: {
        ...DEFAULT_PROFILE.surfaces,
        eccTests: false,
        certs: false,
        retest: false,
        contractorRaterHandoff: false,
      },
    };
  }

  if (mode === "ecc_hers") {
    return {
      ...DEFAULT_PROFILE,
      mode,
      labels: {
        ...DEFAULT_PROFILE.labels,
        job: "ECC Job",
        quality: "Correction Review",
      },
    };
  }

  return DEFAULT_PROFILE;
}
