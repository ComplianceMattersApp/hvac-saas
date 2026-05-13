// lib/maintenance-agreements/agreement-exposure.ts
// Compliance Matters: fail-closed feature exposure guard for maintenance agreements reads.
// The maintenance_agreements table is NOT yet present in production.
// This guard defaults to false so production reads are never attempted until
// both the production migration and this flag are intentionally enabled.

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isMaintenanceAgreementsEnabled(rawValue?: string | null): boolean {
  const source = rawValue ?? process.env.ENABLE_MAINTENANCE_AGREEMENTS;
  const normalized = String(source ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return ENABLED_VALUES.has(normalized);
}
