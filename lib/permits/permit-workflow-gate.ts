const PERMIT_WORKFLOW_ALLOWLIST_ENV = "ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS";

function normalizeAccountOwnerId(value: unknown) {
  return String(value ?? "").trim();
}

export function parsePermitWorkflowEnabledAccountOwnerIds(rawValue?: string | null) {
  const source = rawValue ?? process.env[PERMIT_WORKFLOW_ALLOWLIST_ENV];
  const normalized = String(source ?? "");

  return new Set(
    normalized
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isPermitWorkflowEnabledForAccountOwner(
  accountOwnerUserId: string | null | undefined,
  rawAllowlist?: string | null,
) {
  const normalizedAccountOwnerId = normalizeAccountOwnerId(accountOwnerUserId);
  if (!normalizedAccountOwnerId) return false;

  const allowlist = parsePermitWorkflowEnabledAccountOwnerIds(rawAllowlist);
  if (!allowlist.size) return false;

  return allowlist.has(normalizedAccountOwnerId);
}

export function assertPermitWorkflowEnabledForAccountOwner(
  accountOwnerUserId: string | null | undefined,
  message = "Permit workflow is unavailable for this account.",
  rawAllowlist?: string | null,
) {
  if (!isPermitWorkflowEnabledForAccountOwner(accountOwnerUserId, rawAllowlist)) {
    throw new Error(message);
  }
}

export { PERMIT_WORKFLOW_ALLOWLIST_ENV };