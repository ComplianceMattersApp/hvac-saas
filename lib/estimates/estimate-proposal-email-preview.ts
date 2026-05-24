const PROPOSAL_EMAIL_PREVIEW_ROUTE = "/dev/email-preview/proposal";

function isEnabledFlag(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function isProductionRuntime() {
  const vercelEnv = String(process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv === "production") return true;
  return String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export function isProposalEmailPreviewViewerEnabled() {
  if (isProductionRuntime()) return false;

  const rawMode = String(process.env.EMAIL_DELIVERY_MODE ?? "").trim().toLowerCase();
  return rawMode === "preview" || isEnabledFlag(process.env.ENABLE_EMAIL_PREVIEW_OUTBOX);
}

export function resolveProposalEmailPreviewUrl() {
  if (!isProposalEmailPreviewViewerEnabled()) return null;
  return PROPOSAL_EMAIL_PREVIEW_ROUTE;
}
