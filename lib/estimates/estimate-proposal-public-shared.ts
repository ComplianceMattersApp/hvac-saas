import { hashEstimateProposalLinkToken } from "@/lib/estimates/estimate-proposal-links";

export type ProposalLinkRow = {
  id: string;
  estimate_id: string;
  account_owner_user_id: string;
  status: string;
  expires_at: string;
  revoked_at: string | null;
};

export function normalizeProposalLinkToken(rawToken: string) {
  return String(rawToken ?? "").trim();
}

export function isLikelyProposalLinkToken(rawToken: string) {
  return /^[A-Za-z0-9_-]{32,}$/.test(rawToken);
}

export function isMissingProposalLinkSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string | null; message?: string | null };
  const code = String(maybeError.code ?? "").trim();
  const message = String(maybeError.message ?? "").toLowerCase();

  if (code === "42P01" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("estimate_proposal_links") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

export async function findActiveProposalLinkByRawToken(params: {
  admin: any;
  rawToken: string;
  nowIso: string;
}) {
  const token = normalizeProposalLinkToken(params.rawToken);
  if (!token || !isLikelyProposalLinkToken(token)) return null;

  const tokenHash = hashEstimateProposalLinkToken(token);

  try {
    const { data, error } = await params.admin
      .from("estimate_proposal_links")
      .select("id, estimate_id, account_owner_user_id, status, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      if (isMissingProposalLinkSchemaError(error)) return null;
      throw error;
    }

    const proposalLink = (data ?? null) as ProposalLinkRow | null;
    if (!proposalLink?.id) return null;

    if (String(proposalLink.status ?? "").trim().toLowerCase() !== "active") return null;
    if (proposalLink.revoked_at) return null;
    if (String(proposalLink.expires_at ?? "").trim() <= params.nowIso) return null;

    return proposalLink;
  } catch (error) {
    if (isMissingProposalLinkSchemaError(error)) return null;
    throw error;
  }
}
