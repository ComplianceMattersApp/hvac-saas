// lib/estimates/estimate-exposure.ts
// Compliance Matters: fail-closed feature exposure guard for estimates routes/actions.

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isEstimatesEnabled(rawValue?: string | null): boolean {
  const source = rawValue ?? process.env.ENABLE_ESTIMATES;
  const normalized = String(source ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return ENABLED_VALUES.has(normalized);
}
