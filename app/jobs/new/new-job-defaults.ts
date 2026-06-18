export type JobTypeDefault = "ecc" | "service";
export type ProductMode = "hybrid" | "ecc_hers" | "hvac_service" | "cleaning_services";

function resolveLockedInternalJobType(productMode: ProductMode): JobTypeDefault | null {
  if (productMode === "hvac_service" || productMode === "cleaning_services") return "service";
  if (productMode === "ecc_hers") return "ecc";
  return null;
}

export function resolveModeSafeJobType(params: {
  requestedJobType: JobTypeDefault | null | undefined;
  productMode: ProductMode;
  isInternalMode: boolean;
}): JobTypeDefault {
  const requestedJobType = params.requestedJobType ?? null;
  if (!params.isInternalMode) return requestedJobType ?? "ecc";

  const lockedJobType = resolveLockedInternalJobType(params.productMode);
  if (lockedJobType) return lockedJobType;

  return requestedJobType ?? "service";
}

export function resolveDefaultJobTypeForNewJobForm(params: {
  contractorId: string | null | undefined;
  initialJobType: JobTypeDefault | null | undefined;
  productMode: ProductMode;
  isInternalMode: boolean;
}): JobTypeDefault {
  const hasContractorId = Boolean(String(params.contractorId ?? "").trim());
  if (hasContractorId) return "ecc";
  return resolveModeSafeJobType({
    requestedJobType: params.initialJobType,
    productMode: params.productMode,
    isInternalMode: params.isInternalMode,
  });
}

export function resolveRestoredDraftJobType(params: {
  draftJobType: JobTypeDefault | null | undefined;
  defaultJobType: JobTypeDefault;
  productMode: ProductMode;
  isInternalMode: boolean;
}): JobTypeDefault {
  return resolveModeSafeJobType({
    requestedJobType: params.draftJobType ?? params.defaultJobType,
    productMode: params.productMode,
    isInternalMode: params.isInternalMode,
  });
}
