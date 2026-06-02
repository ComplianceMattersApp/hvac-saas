type ResolveContractorResponsibleDisplayParams = {
  contractorName?: string | null;
  internalBusinessDisplayName?: string | null;
  requiresExternalContractor?: boolean;
};

export type ContractorResponsibleDisplayResolution = {
  label: string;
  state: "contractor_assigned" | "internal_fallback" | "missing_required_contractor";
};

const INTERNAL_FALLBACK_LABEL = "Handled by your company";
const REQUIRED_CONTRACTOR_LABEL = "Contractor assignment required";

export function resolveContractorResponsibleDisplay(
  params: ResolveContractorResponsibleDisplayParams,
): ContractorResponsibleDisplayResolution {
  const contractorName = String(params.contractorName ?? "").trim();
  if (contractorName) {
    return {
      label: contractorName,
      state: "contractor_assigned",
    };
  }

  if (params.requiresExternalContractor) {
    return {
      label: REQUIRED_CONTRACTOR_LABEL,
      state: "missing_required_contractor",
    };
  }

  const internalBusinessDisplayName = String(params.internalBusinessDisplayName ?? "").trim();
  return {
    label: internalBusinessDisplayName || INTERNAL_FALLBACK_LABEL,
    state: "internal_fallback",
  };
}
