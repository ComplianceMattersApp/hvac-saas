"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";

export type CompleteWorkflowMilestoneFromCompletedHandoffRequestParams = {
  handoffRequestId: string;
  reviewNote?: string | null;
};

export type CompleteWorkflowMilestoneFromCompletedHandoffRequestResult =
  | {
      success: true;
      workflowInstanceId: string;
      milestoneId: string;
      status: "completed";
      statusReason: string;
    }
  | {
      success: false;
      error: string;
    };

  const DEFAULT_INSTALLER_REVIEW_NOTE = "Installer reviewed completed rater handoff.";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalized : null;
}

function isEccHandoffCompletionMilestone(milestone: {
  milestone_key?: unknown;
  milestone_title?: unknown;
}) {
  const milestoneKey = cleanString(milestone.milestone_key).toLowerCase();
  if (milestoneKey) {
    return milestoneKey === "ecc_handoff_completion";
  }

  return cleanString(milestone.milestone_title).toLowerCase().replace(/\s+/g, " ") === "ecc handoff/completion";
}

function formatInstallerReviewCompletionReason(input: {
  recipientDisplayName?: unknown;
  responseNote?: unknown;
  evidenceReference?: unknown;
  reviewNote?: unknown;
}) {
  const reasonParts: string[] = [];
  const recipientDisplayName = cleanString(input.recipientDisplayName);

  reasonParts.push(
    recipientDisplayName
      ? `Rater ${recipientDisplayName} marked ECC complete`
      : "Rater marked ECC complete",
  );

  const responseNote = cleanNullableString(input.responseNote);
  if (responseNote) {
    reasonParts.push(`Response note: ${responseNote}`);
  }

  const evidenceReference = cleanNullableString(input.evidenceReference);
  if (evidenceReference) {
    reasonParts.push(`Evidence: ${evidenceReference}`);
  }

  const reviewNote = cleanNullableString(input.reviewNote);
  if (reviewNote) {
    reasonParts.push(`Installer review note: ${reviewNote}`);
  }

  return reasonParts.join(" | ");
}

function withBanner(returnTo: string, banner: string) {
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/jobs";
  const [pathWithoutHash, hash = ""] = safeReturnTo.split("#", 2);
  const separator = pathWithoutHash.includes("?") ? "&" : "?";
  return `${pathWithoutHash}${separator}banner=${encodeURIComponent(banner)}${hash ? `#${hash}` : ""}`;
}

export async function completeWorkflowMilestoneFromCompletedHandoffRequest(
  params: CompleteWorkflowMilestoneFromCompletedHandoffRequestParams,
): Promise<CompleteWorkflowMilestoneFromCompletedHandoffRequestResult> {
  const handoffRequestId = cleanString(params.handoffRequestId);
  const reviewNote = cleanNullableString(params.reviewNote) ?? DEFAULT_INSTALLER_REVIEW_NOTE;

  if (!handoffRequestId) {
    return { success: false, error: "handoff_request_id is required." };
  }

  const supabase = await createClient();

  let authz: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    authz = await requireInternalUser({ supabase });
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required." };
      }
      return { success: false, error: "Active internal user required." };
    }
    throw error;
  }

  const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
  const actingUserId = cleanString(authz.userId);

  if (!accountOwnerUserId || !actingUserId) {
    return { success: false, error: "Internal account scope is required." };
  }

  const admin = createAdminClient();

  const { data: handoffRequest, error: handoffRequestError } = await admin
    .from("workflow_handoff_requests")
    .select(
      "id, installer_account_owner_user_id, workflow_instance_id, workflow_instance_milestone_id, handoff_kind, handoff_status, recipient_display_name_snapshot, response_note, evidence_reference",
    )
    .eq("id", handoffRequestId)
    .eq("installer_account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (handoffRequestError) {
    return {
      success: false,
      error: handoffRequestError.message ?? "Failed to load workflow handoff request.",
    };
  }

  if (!handoffRequest?.id) {
    return {
      success: false,
      error: "handoff_request_id not found in this account.",
    };
  }

  const handoffKind = cleanString((handoffRequest as { handoff_kind?: string | null }).handoff_kind).toLowerCase();
  if (handoffKind !== "ecc") {
    return {
      success: false,
      error: "handoff_request_id is not an ECC handoff request.",
    };
  }

  const handoffStatus = cleanString((handoffRequest as { handoff_status?: string | null }).handoff_status).toLowerCase();
  if (handoffStatus !== "completed") {
    return {
      success: false,
      error: "handoff_request_id must be completed before installer review can complete the ECC milestone.",
    };
  }

  const workflowInstanceId = cleanString((handoffRequest as { workflow_instance_id?: string | null }).workflow_instance_id);
  const workflowInstanceMilestoneId = cleanString((handoffRequest as { workflow_instance_milestone_id?: string | null }).workflow_instance_milestone_id);

  const { data: workflowInstance, error: workflowInstanceError } = await admin
    .from("workflow_instances")
    .select("id, account_owner_user_id")
    .eq("id", workflowInstanceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (workflowInstanceError) {
    return {
      success: false,
      error: workflowInstanceError.message ?? "Failed to load workflow instance.",
    };
  }

  if (!workflowInstance?.id) {
    return {
      success: false,
      error: "workflow_instance_id not found in this account.",
    };
  }

  const { data: milestoneRow, error: milestoneReadError } = await admin
    .from("workflow_instance_milestones")
    .select("id, account_owner_user_id, workflow_instance_id, milestone_key, milestone_title")
    .eq("id", workflowInstanceMilestoneId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (milestoneReadError) {
    return {
      success: false,
      error: milestoneReadError.message ?? "Failed to load workflow milestone.",
    };
  }

  if (!milestoneRow?.id) {
    return {
      success: false,
      error: "milestone_id not found in this account.",
    };
  }

  if (cleanString(milestoneRow.workflow_instance_id) !== workflowInstanceId) {
    return {
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    };
  }

  if (!isEccHandoffCompletionMilestone(milestoneRow)) {
    return {
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    };
  }

  const statusReason = formatInstallerReviewCompletionReason({
    recipientDisplayName: (handoffRequest as { recipient_display_name_snapshot?: string | null }).recipient_display_name_snapshot,
    responseNote: (handoffRequest as { response_note?: string | null }).response_note,
    evidenceReference: (handoffRequest as { evidence_reference?: string | null }).evidence_reference,
    reviewNote,
  });

  const reviewedAt = new Date().toISOString();
  const { data: updatedMilestone, error: milestoneUpdateError } = await admin
    .from("workflow_instance_milestones")
    .update({
      milestone_status: "completed",
      status_reason: statusReason,
      updated_by_user_id: actingUserId,
      updated_at: reviewedAt,
    })
    .eq("id", milestoneRow.id)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("workflow_instance_id", workflowInstanceId)
    .select("id, milestone_status")
    .maybeSingle();

  if (milestoneUpdateError || !updatedMilestone?.id) {
    return {
      success: false,
      error: milestoneUpdateError?.message ?? "Failed to complete workflow milestone from completed handoff request.",
    };
  }

  return {
    success: true,
    workflowInstanceId,
    milestoneId: cleanString(updatedMilestone.id),
    status: "completed",
    statusReason,
  };
}

export async function completeWorkflowMilestoneFromCompletedHandoffRequestFromForm(formData: FormData) {
  const handoffRequestId = cleanString(formData.get("handoff_request_id"));
  const reviewNote = cleanNullableString(formData.get("review_note"));
  const sourceJobId = cleanString(formData.get("source_job_id"));
  const returnTo = cleanString(formData.get("return_to")) || "/jobs";

  const result = await completeWorkflowMilestoneFromCompletedHandoffRequest({
    handoffRequestId,
    reviewNote,
  });

  if (!result.success) {
    redirect(withBanner(returnTo, "handoff_review_failed"));
  }

  if (sourceJobId) {
    revalidatePath(`/jobs/${sourceJobId}`);
  }

  redirect(withBanner(returnTo, "handoff_review_completed"));
}
