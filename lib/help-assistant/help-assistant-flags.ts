export const ASK_COMPLIANCE_MATTERS_FLAG = "ENABLE_ASK_COMPLIANCE_MATTERS";
export const HELP_GAP_LOGGING_FLAG = "ENABLE_HELP_GAP_LOGGING";
export const HELP_GAP_REVIEW_QUEUE_FLAG = "ENABLE_HELP_GAP_REVIEW_QUEUE";

function isTruthyFlagValue(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function isAskComplianceMattersEnabled(env: Pick<NodeJS.ProcessEnv, string> = process.env) {
  return isTruthyFlagValue(env[ASK_COMPLIANCE_MATTERS_FLAG]);
}

export function isHelpGapLoggingEnabled(env: Pick<NodeJS.ProcessEnv, string> = process.env) {
  return isTruthyFlagValue(env[HELP_GAP_LOGGING_FLAG]);
}

export function isHelpGapReviewQueueEnabled(env: Pick<NodeJS.ProcessEnv, string> = process.env) {
  return isTruthyFlagValue(env[HELP_GAP_REVIEW_QUEUE_FLAG]);
}

export function isHelpGapPersistenceEnabled(env: Pick<NodeJS.ProcessEnv, string> = process.env) {
  return isAskComplianceMattersEnabled(env) && isHelpGapLoggingEnabled(env);
}
