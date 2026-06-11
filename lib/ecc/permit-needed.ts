export const ECC_PERMIT_NEEDED_REASON = "Permit Needed";

const ECC_PERMIT_BLOCKER_PROTECTED_STATUSES = new Set([
  "closed",
  "failed",
  "retest_needed",
  "pending_office_review",
  "on_hold",
]);

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

export function isEccPermitNeededReason(value: unknown): boolean {
  return normalize(value).toLowerCase() === ECC_PERMIT_NEEDED_REASON.toLowerCase();
}

export function isEccPermitNeededBlocker(input: {
  job_type?: string | null;
  ops_status?: string | null;
  pending_info_reason?: string | null;
}): boolean {
  return (
    normalize(input.job_type).toLowerCase() === "ecc" &&
    normalize(input.ops_status).toLowerCase() === "pending_info" &&
    isEccPermitNeededReason(input.pending_info_reason)
  );
}

export function shouldApplyEccPermitNeededBlocker(input: {
  job_type?: string | null;
  status?: string | null;
  field_complete?: boolean | null;
  certs_complete?: boolean | null;
  permit_number?: string | null;
  ops_status?: string | null;
  pending_info_reason?: string | null;
}): boolean {
  if (normalize(input.job_type).toLowerCase() !== "ecc") return false;
  if (normalize(input.permit_number)) return false;
  if (Boolean(input.certs_complete)) return false;

  const fieldComplete =
    Boolean(input.field_complete) ||
    normalize(input.status).toLowerCase() === "completed";
  if (!fieldComplete) return false;

  const opsStatus = normalize(input.ops_status).toLowerCase();
  if (ECC_PERMIT_BLOCKER_PROTECTED_STATUSES.has(opsStatus)) return false;

  const existingPendingReason = normalize(input.pending_info_reason);
  if (existingPendingReason && !isEccPermitNeededReason(existingPendingReason)) {
    return false;
  }

  return true;
}
