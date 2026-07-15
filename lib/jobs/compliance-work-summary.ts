type EccRunSummaryInput = {
  is_completed?: boolean | null;
  computed_pass?: boolean | null;
  override_pass?: boolean | null;
};

export type ComplianceWorkSummary = {
  equipment: string;
  tests: string;
  permit: string;
  completionReport: string;
};

export function buildComplianceWorkSummary(input: {
  equipmentCount: number;
  eccRuns: EccRunSummaryInput[];
  hasValidPermit: boolean;
  permitNeeded: boolean;
}): ComplianceWorkSummary {
  const equipmentCount = Math.max(0, Math.trunc(Number(input.equipmentCount) || 0));
  const completedRuns = input.eccRuns.filter((run) => run?.is_completed === true);
  const failedRuns = completedRuns.filter((run) =>
    run?.override_pass === false || (run?.override_pass == null && run?.computed_pass === false),
  );

  return {
    equipment: equipmentCount > 0 ? `${equipmentCount} item${equipmentCount === 1 ? "" : "s"}` : "Missing",
    tests: failedRuns.length > 0
      ? `${failedRuns.length} failed`
      : completedRuns.length > 0
      ? `${completedRuns.length} complete`
      : "Not started",
    permit: input.hasValidPermit ? "Recorded" : input.permitNeeded ? "Needed" : "Not recorded",
    completionReport: completedRuns.length > 0 ? "Ready" : "Needs tests",
  };
}
