export type JobTypeDefault = "ecc" | "service";

export function resolveDefaultJobTypeForNewJobForm(params: {
  contractorId: string | null | undefined;
  initialJobType: JobTypeDefault | null | undefined;
}): JobTypeDefault {
  if (String(params.contractorId ?? "").trim()) return "ecc";
  return params.initialJobType ?? "service";
}

export function resolveRestoredDraftJobType(params: {
  draftJobType: JobTypeDefault | null | undefined;
  defaultJobType: JobTypeDefault;
}): JobTypeDefault {
  return params.draftJobType ?? params.defaultJobType;
}
