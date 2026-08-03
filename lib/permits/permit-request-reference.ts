/** Ops workspace destination for the permit queue. */
export const PERMIT_REQUEST_QUEUE_PATH = "/ops?bucket=permits#ops-workspace";

/**
 * Short, human-quotable reference for a permit request. Contractors read this
 * back over the phone, so keep it stable and derived only from the row id.
 */
export function buildPermitRequestReferenceCode(permitRequestId: string) {
  const normalized = String(permitRequestId ?? "").replace(/-/g, "").trim();
  if (!normalized) return "";
  return `PR-${normalized.slice(0, 8).toUpperCase()}`;
}
