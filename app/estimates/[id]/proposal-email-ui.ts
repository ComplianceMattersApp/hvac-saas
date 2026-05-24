import type { ProposalEmailActionState } from "./proposal-email-action-state";

export function canRenderProposalEmailControls(estimateStatus: string) {
  return String(estimateStatus ?? "").trim().toLowerCase() === "sent";
}

export function resolveCopyableProposalUrl(
  proposalUrl: string | null | undefined
): string | null {
  const normalized = String(proposalUrl ?? "").trim();
  if (!normalized) return null;
  if (!/^https?:\/\//i.test(normalized)) return null;
  if (normalized.toLowerCase().includes("token_hash")) return null;
  return normalized;
}

export function resolveDevEmailPreviewUrl(
  previewUrl: string | null | undefined
): string | null {
  const normalized = String(previewUrl ?? "").trim();
  if (!normalized) return null;
  if (!normalized.startsWith("/dev/email-preview/")) return null;
  if (normalized.includes("?")) return null;
  return normalized;
}

export function resolveProposalEmailNotice(
  state: ProposalEmailActionState | null | undefined,
  options?: { isPending?: boolean }
): { tone: "success" | "warning" | "error"; message: string } | null {
  if (!state) return null;
  if (options?.isPending) return null;

  const isIdleState =
    !state.error &&
    !state.code &&
    !state.attemptStatus &&
    !state.communicationId &&
    !state.proposalLinkId &&
    !state.providerMessageId;
  if (isIdleState) return null;

  if (state.success) {
    if (state.attemptStatus === "accepted" && state.deliveryMode === "preview") {
      return {
        tone: "success",
        message: "Proposal email preview generated.",
      };
    }

    if (state.attemptStatus === "accepted") {
      return {
        tone: "success",
        message: "Proposal email sent. The customer can review and approve using the secure link.",
      };
    }

    if (state.attemptStatus === "blocked" || state.emailDisabled) {
      return {
        tone: "warning",
        message:
          "Email delivery must be enabled before messages are sent. You can still copy the proposal link and share it manually.",
      };
    }

    if (state.attemptStatus === "failed") {
      return {
        tone: "error",
        message:
          "Unable to send proposal email right now. You can retry, or copy the proposal link and share it manually.",
      };
    }
  }

  if (!state.success) {
    if (state.code === "recipient_required") {
      return { tone: "error", message: "Recipient email is required." };
    }

    if (state.code === "recipient_invalid") {
      return { tone: "error", message: "Enter a valid recipient email address." };
    }

    if (state.code === "recipient_not_allowlisted") {
      return {
        tone: "warning",
        message:
          "Recipient is not allowlisted for non-production provider mode.",
      };
    }

    if (state.code === "preview_mode_unavailable") {
      return {
        tone: "warning",
        message: "Email preview mode is unavailable in production.",
      };
    }

    if (
      state.code === "proposal_links_unavailable" ||
      state.code === "proposal_link_unavailable" ||
      state.code === "proposal_link_token_unavailable"
    ) {
      return {
        tone: "warning",
        message:
          "Proposal link setup is unavailable in this environment. You can still copy the proposal link and share it manually.",
      };
    }

    if (state.code === "estimates_unavailable") {
      return {
        tone: "warning",
        message: "Estimates are currently unavailable in this environment.",
      };
    }

    return {
      tone: "error",
      message:
        "Unable to send proposal email right now. You can retry, or copy the proposal link and share it manually.",
    };
  }

  return null;
}