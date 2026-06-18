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

const INVALID_PERMIT_NUMBER_VALUES = new Set([
  "pending",
  "not added",
  "not-added",
  "not_applicable",
  "not applicable",
  "n/a",
  "na",
  "none",
  "null",
  "tbd",
  "to be determined",
  "unknown",
]);

export function isValidEccPermitNumber(value: unknown): boolean {
  const normalized = normalize(value);
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (INVALID_PERMIT_NUMBER_VALUES.has(lower)) return false;
  if (/^pending\b/.test(lower)) return false;
  if (/^not\s+(added|available|assigned|provided|recorded|set)\b/.test(lower)) return false;

  return true;
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
  if (isValidEccPermitNumber(input.permit_number)) return false;
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
