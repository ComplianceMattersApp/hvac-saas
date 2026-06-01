"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import type { WorkflowHandoffStatus } from "@/lib/workflows/workflow-handoff-requests-read";

const HANDOFF_KIND_ECC = "ecc" as const;
const SHARED_SCOPE_HANDOFF_REQUEST_ONLY = "handoff_request_only" as const;
const COMPLETED_DEFAULT_NOTE = "ECC completed by connected recipient.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConnectedRecipientResponseStatus = "accepted" | "completed" | "rejected";

type WorkflowHandoffRequestGrantRow = {
  id: string;
  installer_account_owner_user_id: string;
  recipient_account_owner_user_id: string;
  workflow_handoff_request_id: string;
  handoff_kind: "ecc" | "general_future";
  grant_status: "active" | "revoked";
  shared_scope: "handoff_request_only" | string;
};

type WorkflowHandoffRequestResponseRow = {
  id: string;
  handoff_kind: "ecc" | "general_future";
  handoff_status: WorkflowHandoffStatus;
  response_note: string | null;
  evidence_reference: string | null;
};

export type RespondToConnectedRecipientHandoffRequestParams = {
  grantId: string;
  responseStatus: ConnectedRecipientResponseStatus | string;
  responseNote?: string | null;
  evidenceReference?: string | null;
};

export type RespondToConnectedRecipientHandoffRequestResult =
  | {
      success: true;
      handoffRequestId: string;
      grantId: string;
      handoffStatus: ConnectedRecipientResponseStatus;
      responseNote: string | null;
      evidenceReference: string | null;
    }
  | {
      success: false;
      error: string;
    };

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalized : null;
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeConnectedRecipientResponseStatus(value: unknown): ConnectedRecipientResponseStatus | null {
  const normalized = cleanString(value).toLowerCase();
  return normalized === "accepted" || normalized === "completed" || normalized === "rejected"
    ? normalized
    : null;
}

function normalizeGrantRow(value: any): WorkflowHandoffRequestGrantRow | null {
  const id = cleanString(value?.id);
  const installerAccountOwnerUserId = cleanString(value?.installer_account_owner_user_id);
  const recipientAccountOwnerUserId = cleanString(value?.recipient_account_owner_user_id);
  const workflowHandoffRequestId = cleanString(value?.workflow_handoff_request_id);
  const handoffKind = cleanString(value?.handoff_kind).toLowerCase();
  const grantStatus = cleanString(value?.grant_status).toLowerCase();
  const sharedScope = cleanString(value?.shared_scope).toLowerCase();

  if (
    !id
    || !installerAccountOwnerUserId
    || !recipientAccountOwnerUserId
    || !workflowHandoffRequestId
    || (handoffKind !== "ecc" && handoffKind !== "general_future")
    || (grantStatus !== "active" && grantStatus !== "revoked")
    || !sharedScope
  ) {
    return null;
  }

  return {
    id,
    installer_account_owner_user_id: installerAccountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    workflow_handoff_request_id: workflowHandoffRequestId,
    handoff_kind: handoffKind,
    grant_status: grantStatus,
    shared_scope: sharedScope,
  };
}

function normalizeWorkflowHandoffRequestResponseRow(value: any): WorkflowHandoffRequestResponseRow | null {
  const id = cleanString(value?.id);
  const handoffKind = cleanString(value?.handoff_kind).toLowerCase();
  const handoffStatus = cleanString(value?.handoff_status).toLowerCase();

  if (
    !id
    || (handoffKind !== "ecc" && handoffKind !== "general_future")
    || (handoffStatus !== "sent"
      && handoffStatus !== "accepted"
      && handoffStatus !== "completed"
      && handoffStatus !== "rejected"
      && handoffStatus !== "cancelled")
  ) {
    return null;
  }

  return {
    id,
    handoff_kind: handoffKind,
    handoff_status: handoffStatus,
    response_note: cleanNullableString(value?.response_note),
    evidence_reference: cleanNullableString(value?.evidence_reference),
  };
}

function isAllowedHandoffStatusTransition(currentStatus: WorkflowHandoffStatus, nextStatus: ConnectedRecipientResponseStatus) {
  if (currentStatus === "sent") {
    return nextStatus === "accepted" || nextStatus === "completed" || nextStatus === "rejected";
  }

  if (currentStatus === "accepted") {
    return nextStatus === "completed" || nextStatus === "rejected";
  }

  return false;
}

async function resolveRecipientInternalUserContext() {
  const supabase = await createClient();

  try {
    const authz = await requireInternalUser({ supabase });
    const userId = cleanString(authz.userId);
    const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);

    if (!userId || !accountOwnerUserId) {
      return { ok: false as const, error: "Active internal user required." };
    }

    return {
      ok: true as const,
      userId,
      accountOwnerUserId,
    };
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { ok: false as const, error: "Authentication required." };
      }

      return { ok: false as const, error: "Active internal user required." };
    }

    throw error;
  }
}

export async function respondToConnectedRecipientHandoffRequest(
  params: RespondToConnectedRecipientHandoffRequestParams,
): Promise<RespondToConnectedRecipientHandoffRequestResult> {
  const authz = await resolveRecipientInternalUserContext();
  if (!authz.ok) {
    return { success: false, error: authz.error };
  }

  const grantId = cleanString(params.grantId);
  const responseStatus = normalizeConnectedRecipientResponseStatus(params.responseStatus);
  const requestedResponseNote = cleanNullableString(params.responseNote);
  const requestedEvidenceReference = cleanNullableString(params.evidenceReference);

  if (!isUuid(grantId)) {
    return { success: false, error: "grant_id is required." };
  }

  if (!responseStatus) {
    return { success: false, error: "response_status must be accepted, completed, or rejected." };
  }

  if (responseStatus === "rejected" && !requestedResponseNote) {
    return { success: false, error: "response_note is required when rejecting a handoff request." };
  }

  const admin = createAdminClient();

  const { data: grantData, error: grantError } = await admin
    .from("workflow_handoff_request_grants")
    .select("id, installer_account_owner_user_id, recipient_account_owner_user_id, workflow_handoff_request_id, handoff_kind, grant_status, shared_scope")
    .eq("id", grantId)
    .maybeSingle();

  if (grantError) {
    return { success: false, error: grantError.message ?? "Failed to load workflow handoff request grant." };
  }

  const grant = normalizeGrantRow(grantData);
  if (!grant) {
    return { success: false, error: "grant_id not found." };
  }

  if (grant.recipient_account_owner_user_id !== authz.accountOwnerUserId) {
    return { success: false, error: "grant_id is out of connected recipient account scope." };
  }

  if (grant.grant_status !== "active") {
    return { success: false, error: "grant_id must be active." };
  }

  if (grant.shared_scope !== SHARED_SCOPE_HANDOFF_REQUEST_ONLY) {
    return { success: false, error: "grant_id shared_scope must be handoff_request_only." };
  }

  if (grant.handoff_kind !== HANDOFF_KIND_ECC) {
    return { success: false, error: "grant_id must be ecc." };
  }

  const { data: handoffRequestData, error: handoffRequestError } = await admin
    .from("workflow_handoff_requests")
    .select("id, handoff_kind, handoff_status, response_note, evidence_reference")
    .eq("id", grant.workflow_handoff_request_id)
    .eq("installer_account_owner_user_id", grant.installer_account_owner_user_id)
    .maybeSingle();

  if (handoffRequestError) {
    return { success: false, error: handoffRequestError.message ?? "Failed to load workflow handoff request." };
  }

  const handoffRequest = normalizeWorkflowHandoffRequestResponseRow(handoffRequestData);
  if (!handoffRequest) {
    return { success: false, error: "workflow_handoff_request_id not found for grant_id." };
  }

  if (handoffRequest.id !== grant.workflow_handoff_request_id) {
    return { success: false, error: "grant_id does not match workflow_handoff_request_id." };
  }

  if (handoffRequest.handoff_kind !== HANDOFF_KIND_ECC) {
    return { success: false, error: "workflow_handoff_request_id must be ecc." };
  }

  if (!isAllowedHandoffStatusTransition(handoffRequest.handoff_status, responseStatus)) {
    return {
      success: false,
      error: `handoff request cannot transition from ${handoffRequest.handoff_status} to ${responseStatus}.`,
    };
  }

  const respondedAt = new Date().toISOString();
  const responseNote = responseStatus === "completed"
    ? requestedResponseNote ?? COMPLETED_DEFAULT_NOTE
    : requestedResponseNote;

  const { data: updatedRequestData, error: updateError } = await admin
    .from("workflow_handoff_requests")
    .update({
      handoff_status: responseStatus,
      responded_by_user_id: authz.userId,
      responded_at: respondedAt,
      response_note: responseNote,
      evidence_reference: requestedEvidenceReference,
      updated_at: respondedAt,
    })
    .eq("id", grant.workflow_handoff_request_id)
    .eq("installer_account_owner_user_id", grant.installer_account_owner_user_id)
    .select("id, handoff_status, response_note, evidence_reference")
    .maybeSingle();

  if (updateError) {
    return { success: false, error: updateError.message ?? "Failed to update workflow handoff request." };
  }

  const updatedRequest = normalizeWorkflowHandoffRequestResponseRow(updatedRequestData);
  if (!updatedRequest) {
    return { success: false, error: "Failed to update workflow handoff request." };
  }

  return {
    success: true,
    handoffRequestId: updatedRequest.id,
    grantId: grant.id,
    handoffStatus: updatedRequest.handoff_status as ConnectedRecipientResponseStatus,
    responseNote: updatedRequest.response_note,
    evidenceReference: updatedRequest.evidence_reference,
  };
}
