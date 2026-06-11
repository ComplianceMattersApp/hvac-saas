export type EccWorkflowDisplayContext = "internal" | "ops" | "portal";

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isEccJobType(value: unknown): boolean {
  return normalize(value) === "ecc";
}

export function formatEccOpsStatusLabel(
  opsStatus: unknown,
  context: EccWorkflowDisplayContext = "internal",
): string | null {
  const status = normalize(opsStatus);

  if (status === "failed") return "Failed / Correction Required";
  if (status === "retest_needed") return "Retest Needed";
  if (status === "pending_office_review") {
    return context === "portal" ? "Under Review" : "Corrections Submitted / Under Review";
  }

  return null;
}

export function formatEccEventLabel(eventType: unknown): string | null {
  const type = normalize(eventType);

  if (type === "retest_ready_requested") return "Retest Ready Requested";
  if (type === "contractor_correction_submission") return "Corrections Submitted";
  if (type === "failure_resolved_by_correction_review") return "Correction Accepted";

  return null;
}

export function formatEccRetestReadySignalLabel(): string {
  return "Retest Ready Requested";
}
