import { createAdminClient } from "@/lib/supabase/server";
import { isEstimateProposalLinksEnabled } from "@/lib/estimates/estimate-exposure";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import { findActiveProposalLinkByRawToken } from "@/lib/estimates/estimate-proposal-public-shared";
import { insertInternalProposalApprovedNotification } from "@/lib/estimates/estimate-proposal-approval-notification";

type PublicApprovalErrorCode =
  | "proposal_unavailable"
  | "approver_name_required"
  | "selected_option_required"
  | "selected_option_invalid"
  | "approval_schema_unavailable";

export type ApproveEstimateFromProposalLinkParams = {
  rawToken: string;
  approverName: string;
  selectedOptionSlotIndex?: number | null;
  approvalNote?: string | null;
};

export type ApproveEstimateFromProposalLinkResult =
  | {
      success: true;
      estimateId: string;
      proposalMode: "single_option_flat" | "multi_option_packages";
      approvedAt: string;
      selectedOptionId: string | null;
      selectedOptionLabelSnapshot: string | null;
      selectedOptionTotalCents: number | null;
    }
  | {
      success: false;
      error: PublicApprovalErrorCode;
    };

function isApprovalSchemaUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string | null; message?: string | null };
  const code = String(maybeError.code ?? "").trim();
  const message = String(maybeError.message ?? "").toLowerCase();

  if (code === "42703" || code === "42P01" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("selected_option_id") ||
    message.includes("selected_option_label_snapshot") ||
    message.includes("selected_option_total_cents") ||
    message.includes("response_note") ||
    message.includes("schema cache") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function sanitizeApproverName(rawName: string) {
  return String(rawName ?? "").trim().slice(0, 120);
}

function sanitizeApprovalNote(rawNote: string | null | undefined) {
  const note = String(rawNote ?? "").trim();
  if (!note) return null;
  return note.slice(0, 2000);
}

function parseSelectedOptionSlotIndex(rawValue: number | string | null | undefined) {
  if (typeof rawValue === "number") {
    return Number.isInteger(rawValue) && rawValue > 0 ? rawValue : null;
  }

  const normalized = String(rawValue ?? "").trim();
  if (!normalized) return null;

  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function approveEstimateFromProposalLink(
  params: ApproveEstimateFromProposalLinkParams
): Promise<ApproveEstimateFromProposalLinkResult> {
  if (!isEstimateProposalLinksEnabled()) {
    return { success: false, error: "proposal_unavailable" };
  }

  const approverName = sanitizeApproverName(params.approverName);
  if (!approverName) {
    return { success: false, error: "approver_name_required" };
  }

  const selectedOptionSlotIndex = parseSelectedOptionSlotIndex(params.selectedOptionSlotIndex);
  const approvalNote = sanitizeApprovalNote(params.approvalNote);

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const proposalLink = await findActiveProposalLinkByRawToken({
    admin,
    rawToken: params.rawToken,
    nowIso,
  });
  if (!proposalLink?.id) {
    return { success: false, error: "proposal_unavailable" };
  }

  const internalScope = {
    account_owner_user_id: proposalLink.account_owner_user_id,
  };

  const estimate = await getEstimateById({
    estimateId: proposalLink.estimate_id,
    internalUser: internalScope,
    supabase: admin,
  });
  if (!estimate?.id) {
    return { success: false, error: "proposal_unavailable" };
  }

  if (String(estimate.account_owner_user_id ?? "").trim() !== proposalLink.account_owner_user_id) {
    return { success: false, error: "proposal_unavailable" };
  }

  if (String(estimate.status ?? "").trim().toLowerCase() !== "sent") {
    return { success: false, error: "proposal_unavailable" };
  }

  const optionRows = Array.isArray(estimate.options) ? estimate.options : [];
  const isMultiOption = optionRows.length > 0;

  const proposalMode: "single_option_flat" | "multi_option_packages" = isMultiOption
    ? "multi_option_packages"
    : "single_option_flat";

  let selectedOptionId: string | null = null;
  let selectedOptionLabelSnapshot: string | null = null;
  let selectedOptionTotalCents: number | null = null;

  if (isMultiOption) {
    if (selectedOptionSlotIndex === null) {
      return { success: false, error: "selected_option_required" };
    }

    const selectedOption = optionRows.find(
      (option) => Number(option.slot_index ?? 0) === selectedOptionSlotIndex
    );
    if (!selectedOption?.id) {
      return { success: false, error: "selected_option_invalid" };
    }
    if (!Array.isArray(selectedOption.line_items) || selectedOption.line_items.length === 0) {
      return { success: false, error: "selected_option_invalid" };
    }

    selectedOptionId = String(selectedOption.id ?? "").trim() || null;
    selectedOptionLabelSnapshot = String(selectedOption.label ?? "").trim() || null;
    selectedOptionTotalCents =
      typeof selectedOption.total_cents === "number" ? selectedOption.total_cents : null;

    if (!selectedOptionId || !selectedOptionLabelSnapshot || selectedOptionTotalCents === null) {
      return { success: false, error: "proposal_unavailable" };
    }
  } else if (selectedOptionSlotIndex !== null) {
    return { success: false, error: "selected_option_invalid" };
  }

  const updatePayload: Record<string, unknown> = {
    status: "approved",
    approved_at: nowIso,
    response_note: approvalNote,
    updated_at: nowIso,
    selected_option_id: selectedOptionId,
    selected_option_label_snapshot: selectedOptionLabelSnapshot,
    selected_option_total_cents: selectedOptionTotalCents,
  };

  const { data: updateResult, error: updateError } = await admin
    .from("estimates")
    .update(updatePayload)
    .eq("id", estimate.id)
    .eq("status", "sent")
    .select("id")
    .maybeSingle();

  if (updateError) {
    if (isApprovalSchemaUnavailableError(updateError)) {
      return { success: false, error: "approval_schema_unavailable" };
    }
    throw updateError;
  }

  if (!updateResult?.id) {
    return { success: false, error: "proposal_unavailable" };
  }

  await admin.from("estimate_events").insert({
    estimate_id: estimate.id,
    event_type: "estimate_approved",
    meta: {
      previous_status: "sent",
      next_status: "approved",
      proposal_mode: proposalMode,
      selected_option_id: selectedOptionId,
      selected_option_label_snapshot: selectedOptionLabelSnapshot,
      selected_option_total_cents: selectedOptionTotalCents,
      response_note: approvalNote,
      response_source: "customer_proposal_link",
      proposal_link_id: proposalLink.id,
      approver_name: approverName,
      approved_at: nowIso,
    },
    user_id: null,
  });

  const estimateNumber = String((estimate as { estimate_number?: unknown })?.estimate_number ?? "").trim();
  if (estimateNumber) {
    try {
      await insertInternalProposalApprovedNotification({
        supabase: admin,
        accountOwnerUserId: proposalLink.account_owner_user_id,
        estimateId: estimate.id,
        estimateNumber,
        proposalLinkId: proposalLink.id,
        approverName,
        selectedOptionId,
        selectedOptionLabelSnapshot,
      });
    } catch (error) {
      console.warn("[estimate-proposal-public-approval] Proposal approval notification skipped", {
        estimate_id: estimate.id,
        proposal_link_id: proposalLink.id,
        error_code: String((error as { code?: unknown } | null)?.code ?? ""),
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    success: true,
    estimateId: estimate.id,
    proposalMode,
    approvedAt: nowIso,
    selectedOptionId,
    selectedOptionLabelSnapshot,
    selectedOptionTotalCents,
  };
}
