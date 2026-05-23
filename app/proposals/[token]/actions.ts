"use server";

import { approveEstimateFromProposalLink } from "@/lib/estimates/estimate-proposal-public-approval";
import { type ProposalApprovalActionState } from "./proposal-approval-action-state";

export async function approveEstimateFromProposalLinkForm(
  _previousState: ProposalApprovalActionState,
  formData: FormData
): Promise<ProposalApprovalActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const approverName = String(formData.get("approver_name") ?? "").trim();
  const selectedOptionSlotRaw = String(formData.get("selected_option_slot_index") ?? "").trim();
  const approvalNote = String(formData.get("approval_note") ?? "").trim();

  const selectedOptionSlotIndex = selectedOptionSlotRaw
    ? Number.parseInt(selectedOptionSlotRaw, 10)
    : null;

  const result = await approveEstimateFromProposalLink({
    rawToken: token,
    approverName,
    selectedOptionSlotIndex,
    approvalNote,
  });

  if (!result.success) {
    switch (result.error) {
      case "approver_name_required":
        return {
          status: "error",
          message: "Type your name to approve this proposal.",
        };
      case "selected_option_required":
        return {
          status: "error",
          message: "Select one option before submitting approval.",
        };
      case "selected_option_invalid":
      case "proposal_unavailable":
      case "approval_schema_unavailable":
      default:
        return {
          status: "error",
          message: "This proposal is no longer available.",
        };
    }
  }

  return {
    status: "success",
    message: "Thank you. Your proposal approval has been recorded.",
  };
}
