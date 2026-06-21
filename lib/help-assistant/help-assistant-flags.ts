export const ASK_COMPLIANCE_MATTERS_FLAG = "ENABLE_ASK_COMPLIANCE_MATTERS";

export function isAskComplianceMattersEnabled(env: Pick<NodeJS.ProcessEnv, string> = process.env) {
  const value = String(env[ASK_COMPLIANCE_MATTERS_FLAG] ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
