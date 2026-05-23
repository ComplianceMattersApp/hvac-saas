// lib/estimates/estimate-exposure.ts
// Compliance Matters: fail-closed feature exposure guards for estimates routes/actions.

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isEstimatesEnabled(rawValue?: string | null): boolean {
  const source = rawValue ?? process.env.ENABLE_ESTIMATES;
  const normalized = String(source ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return ENABLED_VALUES.has(normalized);
}

/**
 * Fail-closed guard for the estimate email send feature.
 * When disabled, send attempts are recorded as attempt_status='blocked'
 * and no email provider call is made.
 */
export function isEstimateEmailSendEnabled(rawValue?: string | null): boolean {
  const source = rawValue ?? process.env.ENABLE_ESTIMATE_EMAIL_SEND;
  const normalized = String(source ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return ENABLED_VALUES.has(normalized);
}

/**
 * Fail-closed guard for customer-facing proposal email delivery.
 * When disabled, proposal-email actions must not call provider send.
 */
export function isEstimateProposalEmailSendEnabled(rawValue?: string | null): boolean {
  const source = rawValue ?? process.env.ENABLE_ESTIMATE_PROPOSAL_EMAIL_SEND;
  const normalized = String(source ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return ENABLED_VALUES.has(normalized);
}

/**
 * Fail-closed guard for the public estimate proposal link resolver.
 * When disabled, public proposal routes render a generic unavailable shell
 * without revealing whether a link or estimate exists.
 */
export function isEstimateProposalLinksEnabled(rawValue?: string | null): boolean {
  const source = rawValue ?? process.env.ENABLE_ESTIMATE_PROPOSAL_LINKS;
  const normalized = String(source ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return ENABLED_VALUES.has(normalized);
}
