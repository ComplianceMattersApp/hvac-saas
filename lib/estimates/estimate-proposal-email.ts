import { createClient } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/internal-user";
import {
  isEstimatesEnabled,
  isEstimateProposalEmailSendEnabled,
  isEstimateProposalLinksEnabled,
} from "@/lib/estimates/estimate-exposure";
import {
  issueEstimateProposalLink,
  regenerateEstimateProposalLink,
  readActiveEstimateProposalLinkForInternal,
  readCachedEstimateProposalLinkRawToken,
} from "@/lib/estimates/estimate-proposal-links";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import { renderOperationalEmailLayout, escapeHtml } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/sendEmail";

type ProposalEmailAttemptStatus = "blocked" | "accepted" | "failed";

type SendEstimateProposalEmailParams = {
  estimateId: string;
  recipientEmail: string;
};

export type SendEstimateProposalEmailResult =
  | {
      success: true;
      attemptStatus: ProposalEmailAttemptStatus;
      communicationId: string;
      proposalLinkId: string;
      providerMessageId: string | null;
      emailDisabled: boolean;
    }
  | {
      success: false;
      error: string;
      code?:
        | "estimates_unavailable"
        | "proposal_links_unavailable"
        | "estimate_not_found"
        | "estimate_status_invalid"
        | "recipient_required"
        | "recipient_invalid"
        | "proposal_link_unavailable"
        | "proposal_link_token_unavailable"
        | "proposal_email_base_url_unavailable"
        | "communication_insert_failed";
    };

function normalizeRecipientEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeProviderError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown send error");
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

function resolveProposalBaseUrl() {
  const candidates = [
    String(process.env.APP_URL ?? "").trim(),
    String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim(),
    String(process.env.SITE_URL ?? "").trim(),
    process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).trim()}` : "",
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      return raw.replace(/\/$/, "");
    } catch {
      // Ignore invalid URL candidates and continue.
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return "https://hvac-saas-xi.vercel.app";
}

function buildProposalEmailHtml(params: {
  companyDisplayName: string;
  companyLogoUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  estimateNumber: string;
  estimateTitle: string;
  proposalUrl: string;
}) {
  const supportDetails = [params.supportEmail, params.supportPhone].filter(Boolean).join(" | ");
  const logoBlock = params.companyLogoUrl
    ? `<p style="margin:0 0 14px 0;"><img src="${escapeHtml(params.companyLogoUrl)}" alt="${escapeHtml(params.companyDisplayName)} logo" width="132" height="52" style="display:inline-block;width:132px;max-width:100%;max-height:52px;height:auto;object-fit:contain;" /></p>`
    : "";

  const bodyHtml = `
    ${logoBlock}
    <p style="margin:0 0 12px 0;font-size:15px;color:#111827;">
      Please review the proposal details and approve online when ready.
    </p>
    <p style="margin:0 0 18px 0;font-size:14px;color:#374151;">
      Proposal <strong>${escapeHtml(params.estimateNumber)}</strong>${
        params.estimateTitle
          ? `: ${escapeHtml(params.estimateTitle)}`
          : ""
      }
    </p>
    <p style="margin:0 0 18px 0;">
      <a href="${escapeHtml(params.proposalUrl)}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
        Review Proposal
      </a>
    </p>
    <p style="margin:0 0 4px 0;font-size:11px;line-height:1.5;color:#6b7280;">
      If the button does not open, use this secure link:
    </p>
    <p style="margin:0;font-size:11px;line-height:1.5;color:#6b7280;word-break:break-all;">
      <a href="${escapeHtml(params.proposalUrl)}" style="color:#1f2937;text-decoration:underline;">${escapeHtml(params.proposalUrl)}</a>
    </p>
    <p style="margin:18px 0 0 0;color:#111827;font-size:13px;">
      ${escapeHtml(params.companyDisplayName)}
    </p>
    ${
      supportDetails
        ? `<p style="margin:4px 0 0 0;color:#4b5563;font-size:12px;">Contact: ${escapeHtml(supportDetails)}</p>`
        : ""
    }
  `;

  return renderOperationalEmailLayout({
    title: "Your proposal is ready",
    bodyHtml,
    companyDisplayName: params.companyDisplayName,
    companyLogoUrl: null,
    supportEmail: params.supportEmail,
    supportPhone: params.supportPhone,
  });
}

function buildProposalEmailText(params: {
  companyDisplayName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  estimateNumber: string;
  estimateTitle: string;
  proposalUrl: string;
}) {
  const support = [params.supportEmail, params.supportPhone].filter(Boolean).join(" | ");

  return [
    `Your proposal from ${params.companyDisplayName} is ready`,
    "",
    `Proposal: ${params.estimateNumber}${params.estimateTitle ? ` - ${params.estimateTitle}` : ""}`,
    "",
    "Please review the proposal details and approve online when ready:",
    params.proposalUrl,
    "",
    support ? `Questions: ${support}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildProposalEmailSubject(params: {
  estimateNumber: string;
  estimateTitle: string;
  companyDisplayName: string;
}) {
  const estimateTitle = String(params.estimateTitle ?? "").trim();
  if (estimateTitle) {
    return `Proposal Ready: ${estimateTitle}`;
  }

  const estimateNumber = String(params.estimateNumber ?? "").trim();
  if (estimateNumber) {
    return `Proposal Ready: ${estimateNumber}`;
  }

  return `Your Proposal from ${String(params.companyDisplayName ?? "").trim() || "Compliance Matters"}`;
}

async function loadSentEstimate(params: {
  supabase: any;
  estimateId: string;
  accountOwnerUserId: string;
}) {
  const { data, error } = await params.supabase
    .from("estimates")
    .select("id, estimate_number, title, status, account_owner_user_id")
    .eq("id", params.estimateId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    return {
      success: false as const,
      error: "Estimate not found in this account.",
      code: "estimate_not_found" as const,
    };
  }

  const status = String(data.status ?? "").trim().toLowerCase();
  if (status !== "sent") {
    return {
      success: false as const,
      error: "Proposal email is only available for sent estimates.",
      code: "estimate_status_invalid" as const,
    };
  }

  return {
    success: true as const,
    estimate: {
      id: String(data.id),
      estimateNumber: String(data.estimate_number ?? "").trim() || "Estimate",
      title: String(data.title ?? "").trim() || "",
      accountOwnerUserId: String(data.account_owner_user_id ?? "").trim(),
    },
  };
}

async function resolveProposalLinkForEmail(params: {
  supabase: any;
  estimateId: string;
  accountOwnerUserId: string;
  recipientEmail: string;
}) {
  const activeRead = await readActiveEstimateProposalLinkForInternal({
    estimateId: params.estimateId,
    accountOwnerUserId: params.accountOwnerUserId,
    supabase: params.supabase,
  });

  if (!activeRead.schemaAvailable) {
    return {
      success: false as const,
      error: "Proposal link setup is unavailable in this environment.",
      code: "proposal_link_unavailable" as const,
    };
  }

  if (activeRead.activeLink?.proposalLinkId) {
    const cachedRawToken = readCachedEstimateProposalLinkRawToken({
      proposalLinkId: activeRead.activeLink.proposalLinkId,
    });

    if (cachedRawToken) {
      return {
        success: true as const,
        proposalLinkId: activeRead.activeLink.proposalLinkId,
        rawToken: cachedRawToken,
        hadPriorSentAt: Boolean(activeRead.activeLink.sentAt),
      };
    }

    const regenerateResult = await regenerateEstimateProposalLink({
      estimateId: params.estimateId,
      recipientEmailSnapshot: params.recipientEmail,
    });

    if (!regenerateResult.success) {
      return {
        success: false as const,
        error: regenerateResult.error,
        code: "proposal_link_unavailable" as const,
      };
    }

    return {
      success: true as const,
      proposalLinkId: regenerateResult.proposalLinkId,
      rawToken: regenerateResult.rawToken,
      hadPriorSentAt: false,
    };
  }

  const issueResult = await issueEstimateProposalLink({
    estimateId: params.estimateId,
    recipientEmailSnapshot: params.recipientEmail,
  });

  if (!issueResult.success) {
    return {
      success: false as const,
      error: issueResult.error,
      code: "proposal_link_unavailable" as const,
    };
  }

  return {
    success: true as const,
    proposalLinkId: issueResult.proposalLinkId,
    rawToken: issueResult.rawToken,
    hadPriorSentAt: false,
  };
}

async function insertProposalEmailAttempt(params: {
  supabase: any;
  estimateId: string;
  accountOwnerUserId: string;
  userId: string;
  recipientEmail: string;
  subject: string;
  attemptStatus: ProposalEmailAttemptStatus;
  providerName: string | null;
  providerMessageId: string | null;
  sanitizedError: string | null;
}) {
  const { data, error } = await params.supabase
    .from("estimate_communications")
    .insert({
      estimate_id: params.estimateId,
      account_owner_user_id: params.accountOwnerUserId,
      initiated_by_user_id: params.userId,
      recipient_email_snapshot: params.recipientEmail,
      subject_snapshot: params.subject,
      body_template_key: "estimate_proposal_email_v1",
      provider_name: params.providerName,
      provider_message_id: params.providerMessageId,
      attempt_status: params.attemptStatus,
      attempt_error: params.sanitizedError,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return {
      success: false as const,
      error: error?.message ?? "Failed to record proposal email attempt.",
      code: "communication_insert_failed" as const,
    };
  }

  return {
    success: true as const,
    communicationId: String(data.id),
  };
}

async function insertEstimateEvent(params: {
  supabase: any;
  estimateId: string;
  userId: string;
  eventType:
    | "estimate_proposal_email_send_attempted"
    | "estimate_proposal_email_sent"
    | "estimate_proposal_email_failed";
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

async function touchProposalLinkSendTimestamps(params: {
  supabase: any;
  proposalLinkId: string;
  accountOwnerUserId: string;
  sentAtIso: string;
  shouldSetInitialSentAt: boolean;
}) {
  const patch: Record<string, unknown> = {
    last_sent_at: params.sentAtIso,
  };
  if (params.shouldSetInitialSentAt) {
    patch.sent_at = params.sentAtIso;
  }

  const { error } = await params.supabase
    .from("estimate_proposal_links")
    .update(patch)
    .eq("id", params.proposalLinkId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("status", "active")
    .is("revoked_at", null);

  if (error) throw error;
}

export async function sendEstimateProposalEmail(
  params: SendEstimateProposalEmailParams
): Promise<SendEstimateProposalEmailResult> {
  if (!isEstimatesEnabled()) {
    return {
      success: false,
      code: "estimates_unavailable",
      error: "Estimates are currently unavailable.",
    };
  }

  if (!isEstimateProposalLinksEnabled()) {
    return {
      success: false,
      code: "proposal_links_unavailable",
      error: "Proposal links are currently unavailable.",
    };
  }

  const estimateId = String(params.estimateId ?? "").trim();
  const recipientEmail = normalizeRecipientEmail(params.recipientEmail);

  if (!estimateId) {
    return { success: false, code: "estimate_not_found", error: "estimate_id is required." };
  }

  if (!recipientEmail) {
    return {
      success: false,
      code: "recipient_required",
      error: "Recipient email is required.",
    };
  }

  if (!isValidEmailAddress(recipientEmail)) {
    return {
      success: false,
      code: "recipient_invalid",
      error: "Recipient email is not a valid email address.",
    };
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  const userId = String(internalUser.user_id ?? "").trim();

  const estimateResult = await loadSentEstimate({
    supabase,
    estimateId,
    accountOwnerUserId,
  });
  if (!estimateResult.success) {
    return estimateResult;
  }

  const linkResult = await resolveProposalLinkForEmail({
    supabase,
    estimateId,
    accountOwnerUserId,
    recipientEmail,
  });
  if (!linkResult.success) {
    return linkResult;
  }

  const baseUrl = resolveProposalBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      code: "proposal_email_base_url_unavailable",
      error: "Proposal email base URL is unavailable.",
    };
  }

  const proposalUrl = `${baseUrl}/proposals/${linkResult.rawToken}`;
  const tenantIdentity = await resolveOperationalTenantIdentity({
    accountOwnerUserId,
    supabase,
  });

  const subject = buildProposalEmailSubject({
    estimateNumber: estimateResult.estimate.estimateNumber,
    estimateTitle: estimateResult.estimate.title,
    companyDisplayName: tenantIdentity.displayName,
  });
  const html = buildProposalEmailHtml({
    companyDisplayName: tenantIdentity.displayName,
    companyLogoUrl: tenantIdentity.logoUrl,
    supportEmail: tenantIdentity.supportEmail,
    supportPhone: tenantIdentity.supportPhone,
    estimateNumber: estimateResult.estimate.estimateNumber,
    estimateTitle: estimateResult.estimate.title,
    proposalUrl,
  });
  const text = buildProposalEmailText({
    companyDisplayName: tenantIdentity.displayName,
    supportEmail: tenantIdentity.supportEmail,
    supportPhone: tenantIdentity.supportPhone,
    estimateNumber: estimateResult.estimate.estimateNumber,
    estimateTitle: estimateResult.estimate.title,
    proposalUrl,
  });

  const emailEnabled = isEstimateProposalEmailSendEnabled();

  let attemptStatus: ProposalEmailAttemptStatus = "blocked";
  let providerName: string | null = null;
  let providerMessageId: string | null = null;
  let sanitizedError: string | null = null;

  if (emailEnabled) {
    providerName = "resend";
    try {
      const providerResult = await sendEmail({
        to: recipientEmail,
        subject,
        html,
        text,
      });
      providerMessageId =
        (providerResult.data as { id?: string } | null | undefined)?.id ?? null;
      attemptStatus = "accepted";
    } catch (error) {
      attemptStatus = "failed";
      sanitizedError = sanitizeProviderError(error);
    }
  }

  const communicationResult = await insertProposalEmailAttempt({
    supabase,
    estimateId,
    accountOwnerUserId,
    userId,
    recipientEmail,
    subject,
    attemptStatus,
    providerName,
    providerMessageId,
    sanitizedError,
  });
  if (!communicationResult.success) {
    return communicationResult;
  }

  const commonMeta = {
    proposal_link_id: linkResult.proposalLinkId,
    communication_id: communicationResult.communicationId,
    recipient_email_snapshot: recipientEmail,
    send_outcome: attemptStatus,
    provider_message_id: providerMessageId,
    sanitized_error: sanitizedError,
    source: "internal",
    delivery_mode: "email",
  } satisfies Record<string, unknown>;

  await insertEstimateEvent({
    supabase,
    estimateId,
    userId,
    eventType: "estimate_proposal_email_send_attempted",
    meta: commonMeta,
  });

  if (attemptStatus === "accepted") {
    const sentAtIso = new Date().toISOString();
    await touchProposalLinkSendTimestamps({
      supabase,
      proposalLinkId: linkResult.proposalLinkId,
      accountOwnerUserId,
      sentAtIso,
      shouldSetInitialSentAt: !linkResult.hadPriorSentAt,
    });

    await insertEstimateEvent({
      supabase,
      estimateId,
      userId,
      eventType: "estimate_proposal_email_sent",
      meta: {
        ...commonMeta,
        sent_at: sentAtIso,
      },
    });
  }

  if (attemptStatus === "failed") {
    await insertEstimateEvent({
      supabase,
      estimateId,
      userId,
      eventType: "estimate_proposal_email_failed",
      meta: commonMeta,
    });
  }

  return {
    success: true,
    attemptStatus,
    communicationId: communicationResult.communicationId,
    proposalLinkId: linkResult.proposalLinkId,
    providerMessageId,
    emailDisabled: !emailEnabled,
  };
}
