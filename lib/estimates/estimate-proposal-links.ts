import { createHash, randomBytes } from "node:crypto";

import { requireInternalUser } from "@/lib/auth/internal-user";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { createClient } from "@/lib/supabase/server";

const ESTIMATE_PROPOSAL_LINK_TTL_DAYS = 14;
const ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS = "active" as const;
const ESTIMATE_PROPOSAL_LINK_REVOKED_STATUS = "revoked" as const;
const ESTIMATE_PROPOSAL_LINK_EXPIRED_STATUS = "expired" as const;

type EstimateProposalLinkStatus =
  | typeof ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS
  | typeof ESTIMATE_PROPOSAL_LINK_REVOKED_STATUS
  | typeof ESTIMATE_PROPOSAL_LINK_EXPIRED_STATUS;

type EstimateProposalLinkRow = {
  id: string;
  estimate_id: string;
  account_owner_user_id: string;
  token_hash: string;
  recipient_email_snapshot: string | null;
  status: EstimateProposalLinkStatus;
  created_at: string;
  created_by_user_id: string | null;
  expires_at: string;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  last_viewed_at: string | null;
  last_viewed_ip_hash: string | null;
  last_user_agent_hash: string | null;
  sent_at: string | null;
  last_sent_at: string | null;
};

type EstimateProposalLinkSuccess = {
  success: true;
  proposalLinkId: string;
  rawToken: string;
  expiresAt: string;
  recipientEmailSnapshot: string | null;
  status: typeof ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS;
};

export type IssueEstimateProposalLinkResult =
  | EstimateProposalLinkSuccess
  | {
      success: false;
      error: string;
      code?: "already_exists";
      proposalLinkId?: string;
      expiresAt?: string;
      recipientEmailSnapshot?: string | null;
    };

export type RegenerateEstimateProposalLinkResult =
  | EstimateProposalLinkSuccess
  | { success: false; error: string };

export type RevokeEstimateProposalLinkResult =
  | {
      success: true;
      revoked: boolean;
      proposalLinkId: string | null;
      status: typeof ESTIMATE_PROPOSAL_LINK_REVOKED_STATUS | null;
    }
  | { success: false; error: string };

function normalizeRecipientEmail(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function createProposalLinkToken() {
  return randomBytes(32).toString("base64url");
}

function hashProposalLinkToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function buildDefaultExpiryIso(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + ESTIMATE_PROPOSAL_LINK_TTL_DAYS);
  return expiresAt.toISOString();
}

async function loadEligibleSentEstimate(params: {
  supabase: any;
  estimateId: string;
  accountOwnerUserId: string;
}) {
  const { data, error } = await params.supabase
    .from("estimates")
    .select("id, status, account_owner_user_id")
    .eq("id", params.estimateId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    return { success: false as const, error: "Estimate not found in this account." };
  }

  if (String(data.status ?? "").trim().toLowerCase() !== "sent") {
    return {
      success: false as const,
      error: "Proposal links require estimate status 'sent' for V1.",
    };
  }

  return { success: true as const, estimate: data };
}

async function expireStaleProposalLinks(params: {
  supabase: any;
  estimateId: string;
  accountOwnerUserId: string;
  nowIso: string;
}) {
  const { error } = await params.supabase
    .from("estimate_proposal_links")
    .update({ status: ESTIMATE_PROPOSAL_LINK_EXPIRED_STATUS })
    .eq("estimate_id", params.estimateId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("status", ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS)
    .is("revoked_at", null)
    .lte("expires_at", params.nowIso);

  if (error) {
    return { success: false as const, error: error.message ?? "Failed to expire stale proposal links." };
  }

  return { success: true as const };
}

async function findActiveProposalLink(params: {
  supabase: any;
  estimateId: string;
  accountOwnerUserId: string;
  nowIso: string;
}) {
  const { data, error } = await params.supabase
    .from("estimate_proposal_links")
    .select(
      "id, estimate_id, account_owner_user_id, token_hash, recipient_email_snapshot, status, created_at, created_by_user_id, expires_at, revoked_at, revoked_by_user_id, last_viewed_at, last_viewed_ip_hash, last_user_agent_hash, sent_at, last_sent_at"
    )
    .eq("estimate_id", params.estimateId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("status", ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS)
    .is("revoked_at", null)
    .gt("expires_at", params.nowIso)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as EstimateProposalLinkRow | null;
}

async function insertProposalLink(params: {
  supabase: any;
  estimateId: string;
  accountOwnerUserId: string;
  userId: string;
  tokenHash: string;
  recipientEmailSnapshot: string | null;
  expiresAt: string;
}) {
  const { data, error } = await params.supabase
    .from("estimate_proposal_links")
    .insert({
      estimate_id: params.estimateId,
      account_owner_user_id: params.accountOwnerUserId,
      token_hash: params.tokenHash,
      recipient_email_snapshot: params.recipientEmailSnapshot,
      status: ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS,
      created_by_user_id: params.userId,
      expires_at: params.expiresAt,
    })
    .select("id, recipient_email_snapshot, status, expires_at")
    .single();

  if (error || !data?.id) {
    return {
      success: false as const,
      error: error?.message ?? "Failed to create estimate proposal link.",
    };
  }

  return {
    success: true as const,
    proposalLink: {
      id: String(data.id),
      recipientEmailSnapshot:
        String((data as { recipient_email_snapshot?: string | null }).recipient_email_snapshot ?? "").trim() ||
        null,
      status: ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS,
      expiresAt: String((data as { expires_at?: string | null }).expires_at ?? params.expiresAt),
    },
  };
}

async function revokeProposalLinkById(params: {
  supabase: any;
  proposalLinkId: string;
  accountOwnerUserId: string;
  userId: string;
  revokedAt: string;
}) {
  const { error } = await params.supabase
    .from("estimate_proposal_links")
    .update({
      status: ESTIMATE_PROPOSAL_LINK_REVOKED_STATUS,
      revoked_at: params.revokedAt,
      revoked_by_user_id: params.userId,
    })
    .eq("id", params.proposalLinkId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("status", ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS)
    .is("revoked_at", null);

  if (error) {
    return { success: false as const, error: error.message ?? "Failed to revoke proposal link." };
  }

  return { success: true as const };
}

async function writeProposalLinkEvent(params: {
  supabase: any;
  estimateId: string;
  userId: string;
  eventType:
    | "estimate_proposal_link_issued"
    | "estimate_proposal_link_regenerated"
    | "estimate_proposal_link_revoked";
  meta: Record<string, unknown>;
}) {
  const { error } = await params.supabase.from("estimate_events").insert({
    estimate_id: params.estimateId,
    event_type: params.eventType,
    meta: params.meta,
    user_id: params.userId,
  });

  if (error) throw error;
}

export async function issueEstimateProposalLink(params: {
  estimateId: string;
  recipientEmailSnapshot?: string | null;
}): Promise<IssueEstimateProposalLinkResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) {
    return { success: false, error: "estimate_id is required." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  const userId = String(internalUser.user_id ?? "").trim();
  const estimate = await loadEligibleSentEstimate({
    supabase,
    estimateId,
    accountOwnerUserId,
  });
  if (!estimate.success) return estimate;

  const nowIso = new Date().toISOString();
  const expireResult = await expireStaleProposalLinks({
    supabase,
    estimateId,
    accountOwnerUserId,
    nowIso,
  });
  if (!expireResult.success) return expireResult;

  const activeLink = await findActiveProposalLink({
    supabase,
    estimateId,
    accountOwnerUserId,
    nowIso,
  });

  if (activeLink) {
    return {
      success: false,
      error: "An active proposal link already exists for this estimate.",
      code: "already_exists",
      proposalLinkId: activeLink.id,
      expiresAt: activeLink.expires_at,
      recipientEmailSnapshot: activeLink.recipient_email_snapshot,
    };
  }

  const rawToken = createProposalLinkToken();
  const tokenHash = hashProposalLinkToken(rawToken);
  const recipientEmailSnapshot = normalizeRecipientEmail(params.recipientEmailSnapshot);
  const expiresAt = buildDefaultExpiryIso();

  const insertResult = await insertProposalLink({
    supabase,
    estimateId,
    accountOwnerUserId,
    userId,
    tokenHash,
    recipientEmailSnapshot,
    expiresAt,
  });
  if (!insertResult.success) return insertResult;

  await writeProposalLinkEvent({
    supabase,
    estimateId,
    userId,
    eventType: "estimate_proposal_link_issued",
    meta: {
      proposal_link_id: insertResult.proposalLink.id,
      recipient_email_snapshot: insertResult.proposalLink.recipientEmailSnapshot,
      expires_at: insertResult.proposalLink.expiresAt,
      issued_by_user_id: userId,
      proposal_link_status_snapshot: ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS,
      source: "internal",
      link_delivery_mode: "manual_link_foundation",
    },
  });

  return {
    success: true,
    proposalLinkId: insertResult.proposalLink.id,
    rawToken,
    expiresAt: insertResult.proposalLink.expiresAt,
    recipientEmailSnapshot: insertResult.proposalLink.recipientEmailSnapshot,
    status: ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS,
  };
}

export async function regenerateEstimateProposalLink(params: {
  estimateId: string;
  recipientEmailSnapshot?: string | null;
}): Promise<RegenerateEstimateProposalLinkResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) {
    return { success: false, error: "estimate_id is required." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  const userId = String(internalUser.user_id ?? "").trim();
  const estimate = await loadEligibleSentEstimate({
    supabase,
    estimateId,
    accountOwnerUserId,
  });
  if (!estimate.success) return estimate;

  const nowIso = new Date().toISOString();
  const expireResult = await expireStaleProposalLinks({
    supabase,
    estimateId,
    accountOwnerUserId,
    nowIso,
  });
  if (!expireResult.success) return expireResult;

  const activeLink = await findActiveProposalLink({
    supabase,
    estimateId,
    accountOwnerUserId,
    nowIso,
  });

  if (activeLink) {
    const revokeResult = await revokeProposalLinkById({
      supabase,
      proposalLinkId: activeLink.id,
      accountOwnerUserId,
      userId,
      revokedAt: nowIso,
    });
    if (!revokeResult.success) return revokeResult;
  }

  const rawToken = createProposalLinkToken();
  const tokenHash = hashProposalLinkToken(rawToken);
  const recipientEmailSnapshot = normalizeRecipientEmail(
    params.recipientEmailSnapshot ?? activeLink?.recipient_email_snapshot ?? null
  );
  const expiresAt = buildDefaultExpiryIso();

  const insertResult = await insertProposalLink({
    supabase,
    estimateId,
    accountOwnerUserId,
    userId,
    tokenHash,
    recipientEmailSnapshot,
    expiresAt,
  });
  if (!insertResult.success) return insertResult;

  await writeProposalLinkEvent({
    supabase,
    estimateId,
    userId,
    eventType: "estimate_proposal_link_regenerated",
    meta: {
      proposal_link_id: insertResult.proposalLink.id,
      recipient_email_snapshot: insertResult.proposalLink.recipientEmailSnapshot,
      expires_at: insertResult.proposalLink.expiresAt,
      issued_by_user_id: userId,
      revoked_previous_link_id: activeLink?.id ?? null,
      proposal_link_status_snapshot: ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS,
      source: "internal",
      link_delivery_mode: "manual_link_foundation",
    },
  });

  return {
    success: true,
    proposalLinkId: insertResult.proposalLink.id,
    rawToken,
    expiresAt: insertResult.proposalLink.expiresAt,
    recipientEmailSnapshot: insertResult.proposalLink.recipientEmailSnapshot,
    status: ESTIMATE_PROPOSAL_LINK_ACTIVE_STATUS,
  };
}

export async function revokeEstimateProposalLink(params: {
  estimateId: string;
}): Promise<RevokeEstimateProposalLinkResult> {
  if (!isEstimatesEnabled()) {
    return { success: false, error: "Estimates are currently unavailable." };
  }

  const estimateId = String(params.estimateId ?? "").trim();
  if (!estimateId) {
    return { success: false, error: "estimate_id is required." };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  const userId = String(internalUser.user_id ?? "").trim();
  const { data: estimate, error: estimateError } = await supabase
    .from("estimates")
    .select("id, account_owner_user_id")
    .eq("id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (estimateError) throw estimateError;
  if (!estimate?.id) {
    return { success: false, error: "Estimate not found in this account." };
  }

  const nowIso = new Date().toISOString();
  const expireResult = await expireStaleProposalLinks({
    supabase,
    estimateId,
    accountOwnerUserId,
    nowIso,
  });
  if (!expireResult.success) return expireResult;

  const activeLink = await findActiveProposalLink({
    supabase,
    estimateId,
    accountOwnerUserId,
    nowIso,
  });

  if (!activeLink) {
    return {
      success: true,
      revoked: false,
      proposalLinkId: null,
      status: null,
    };
  }

  const revokeResult = await revokeProposalLinkById({
    supabase,
    proposalLinkId: activeLink.id,
    accountOwnerUserId,
    userId,
    revokedAt: nowIso,
  });
  if (!revokeResult.success) return revokeResult;

  await writeProposalLinkEvent({
    supabase,
    estimateId,
    userId,
    eventType: "estimate_proposal_link_revoked",
    meta: {
      proposal_link_id: activeLink.id,
      recipient_email_snapshot: activeLink.recipient_email_snapshot,
      expires_at: activeLink.expires_at,
      revoked_by_user_id: userId,
      proposal_link_status_snapshot: ESTIMATE_PROPOSAL_LINK_REVOKED_STATUS,
      source: "internal",
      link_delivery_mode: "manual_link_foundation",
    },
  });

  return {
    success: true,
    revoked: true,
    proposalLinkId: activeLink.id,
    status: ESTIMATE_PROPOSAL_LINK_REVOKED_STATUS,
  };
}

export const __private__ = {
  ESTIMATE_PROPOSAL_LINK_TTL_DAYS,
  buildDefaultExpiryIso,
  createProposalLinkToken,
  hashProposalLinkToken,
  normalizeRecipientEmail,
};