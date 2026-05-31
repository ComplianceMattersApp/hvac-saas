"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
  type InternalRole,
} from "@/lib/auth/internal-user";
import {
  WORKFLOW_HANDOFF_REQUEST_GRANT_SHARED_SCOPES,
  WORKFLOW_HANDOFF_REQUEST_GRANT_STATUSES,
  type WorkflowHandoffRequestGrantRow,
  type WorkflowHandoffRequestGrantStatus,
  type WorkflowHandoffRequestGrantHandoffKind,
  type WorkflowHandoffRequestGrantSharedScope,
} from "@/lib/workflows/workflow-handoff-request-grants-read";

type WorkflowHandoffRequestRow = {
  id: string;
  installer_account_owner_user_id: string;
  authorized_handoff_recipient_id: string;
  handoff_kind: "ecc" | "general_future";
};

type AccountHandoffConnectionRow = {
  id: string;
  requesting_account_owner_user_id: string;
  recipient_account_owner_user_id: string;
  connection_status: "pending" | "active" | "declined" | "revoked";
  handoff_kind: "ecc";
};

type AuthorizedHandoffRecipientValidationRow = {
  id: string;
  account_owner_user_id: string;
  handoff_kind: "ecc" | "general_future";
  recipient_type: string;
  connected_account_owner_user_id: string | null;
  is_active: boolean;
  archived_at: string | null;
};

export type CreateWorkflowHandoffRequestGrantParams = {
  workflowHandoffRequestId: string;
  accountHandoffConnectionId: string;
  recipientAccountOwnerUserId: string;
  authorizedHandoffRecipientId?: string | null;
  grantReason?: string | null;
};

export type RevokeWorkflowHandoffRequestGrantParams = {
  grantId: string;
  revokeReason?: string | null;
};

export type WorkflowHandoffRequestGrantCreateResult =
  | {
      success: true;
      grantId: string;
      grantStatus: WorkflowHandoffRequestGrantStatus;
      created: boolean;
    }
  | {
      success: false;
      error: string;
    };

export type WorkflowHandoffRequestGrantRevokeResult =
  | {
      success: true;
      grantId: string;
      grantStatus: WorkflowHandoffRequestGrantStatus;
      revoked: boolean;
    }
  | {
      success: false;
      error: string;
    };

const HANDOFF_KIND_ECC: WorkflowHandoffRequestGrantHandoffKind = "ecc";
const SHARED_SCOPE_HANDOFF_REQUEST_ONLY: WorkflowHandoffRequestGrantSharedScope = "handoff_request_only";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isAdminOrOwner(role: InternalRole, userId: string, accountOwnerUserId: string) {
  return role === "admin" || userId === accountOwnerUserId;
}

function normalizeGrantStatus(value: unknown): WorkflowHandoffRequestGrantStatus | null {
  const normalized = cleanString(value).toLowerCase();
  return WORKFLOW_HANDOFF_REQUEST_GRANT_STATUSES.includes(normalized as WorkflowHandoffRequestGrantStatus)
    ? (normalized as WorkflowHandoffRequestGrantStatus)
    : null;
}

function normalizeSharedScope(value: unknown): WorkflowHandoffRequestGrantSharedScope | null {
  const normalized = cleanString(value).toLowerCase();
  return WORKFLOW_HANDOFF_REQUEST_GRANT_SHARED_SCOPES.includes(normalized as WorkflowHandoffRequestGrantSharedScope)
    ? (normalized as WorkflowHandoffRequestGrantSharedScope)
    : null;
}

function normalizeGrantRow(value: any): WorkflowHandoffRequestGrantRow | null {
  const id = cleanString(value?.id);
  const installerAccountOwnerUserId = cleanString(value?.installer_account_owner_user_id);
  const recipientAccountOwnerUserId = cleanString(value?.recipient_account_owner_user_id);
  const accountHandoffConnectionId = cleanString(value?.account_handoff_connection_id);
  const workflowHandoffRequestId = cleanString(value?.workflow_handoff_request_id);
  const grantStatus = normalizeGrantStatus(value?.grant_status);
  const handoffKind = cleanString(value?.handoff_kind).toLowerCase();
  const sharedScope = normalizeSharedScope(value?.shared_scope);
  const grantedByUserId = cleanString(value?.granted_by_user_id);
  const grantedAt = cleanString(value?.granted_at);
  const createdAt = cleanString(value?.created_at);
  const updatedAt = cleanString(value?.updated_at);

  if (
    !id
    || !installerAccountOwnerUserId
    || !recipientAccountOwnerUserId
    || !accountHandoffConnectionId
    || !workflowHandoffRequestId
    || !grantStatus
    || handoffKind !== HANDOFF_KIND_ECC
    || !sharedScope
    || !grantedByUserId
    || !grantedAt
    || !createdAt
    || !updatedAt
  ) {
    return null;
  }

  return {
    id,
    installer_account_owner_user_id: installerAccountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    account_handoff_connection_id: accountHandoffConnectionId,
    workflow_handoff_request_id: workflowHandoffRequestId,
    authorized_handoff_recipient_id: cleanNullableString(value?.authorized_handoff_recipient_id),
    handoff_kind: HANDOFF_KIND_ECC,
    grant_status: grantStatus,
    shared_scope: sharedScope,
    granted_by_user_id: grantedByUserId,
    granted_at: grantedAt,
    revoked_by_user_id: cleanNullableString(value?.revoked_by_user_id),
    revoked_at: cleanNullableString(value?.revoked_at),
    revoke_reason: cleanNullableString(value?.revoke_reason),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeWorkflowHandoffRequestRow(value: any): WorkflowHandoffRequestRow | null {
  const id = cleanString(value?.id);
  const installerAccountOwnerUserId = cleanString(value?.installer_account_owner_user_id);
  const authorizedHandoffRecipientId = cleanString(value?.authorized_handoff_recipient_id);
  const handoffKind = cleanString(value?.handoff_kind).toLowerCase();

  if (
    !id
    || !installerAccountOwnerUserId
    || !authorizedHandoffRecipientId
    || (handoffKind !== "ecc" && handoffKind !== "general_future")
  ) {
    return null;
  }

  return {
    id,
    installer_account_owner_user_id: installerAccountOwnerUserId,
    authorized_handoff_recipient_id: authorizedHandoffRecipientId,
    handoff_kind: handoffKind,
  };
}

function normalizeConnectionRow(value: any): AccountHandoffConnectionRow | null {
  const id = cleanString(value?.id);
  const requestingAccountOwnerUserId = cleanString(value?.requesting_account_owner_user_id);
  const recipientAccountOwnerUserId = cleanString(value?.recipient_account_owner_user_id);
  const handoffKind = cleanString(value?.handoff_kind).toLowerCase();
  const connectionStatus = cleanString(value?.connection_status).toLowerCase();

  if (
    !id
    || !requestingAccountOwnerUserId
    || !recipientAccountOwnerUserId
    || handoffKind !== HANDOFF_KIND_ECC
    || (connectionStatus !== "pending" && connectionStatus !== "active" && connectionStatus !== "declined" && connectionStatus !== "revoked")
  ) {
    return null;
  }

  return {
    id,
    requesting_account_owner_user_id: requestingAccountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    handoff_kind: HANDOFF_KIND_ECC,
    connection_status: connectionStatus,
  };
}

function normalizeAuthorizedRecipientValidationRow(value: any): AuthorizedHandoffRecipientValidationRow | null {
  const id = cleanString(value?.id);
  const accountOwnerUserId = cleanString(value?.account_owner_user_id);
  const handoffKind = cleanString(value?.handoff_kind).toLowerCase();
  const recipientType = cleanString(value?.recipient_type).toLowerCase();

  if (!id || !accountOwnerUserId || (handoffKind !== "ecc" && handoffKind !== "general_future") || !recipientType) {
    return null;
  }

  return {
    id,
    account_owner_user_id: accountOwnerUserId,
    handoff_kind: handoffKind,
    recipient_type: recipientType,
    connected_account_owner_user_id: cleanNullableString(value?.connected_account_owner_user_id),
    is_active: Boolean(value?.is_active),
    archived_at: cleanNullableString(value?.archived_at),
  };
}

async function resolveInstallerAdminOrOwnerContext() {
  const supabase = await createClient();

  try {
    const authz = await requireInternalUser({ supabase });
    const userId = cleanString(authz.userId);
    const accountOwnerUserId = cleanString(authz.internalUser.account_owner_user_id);
    const role = authz.internalUser.role;

    if (!userId || !accountOwnerUserId) {
      return { ok: false as const, error: "Active internal user required." };
    }

    if (!isAdminOrOwner(role, userId, accountOwnerUserId)) {
      return { ok: false as const, error: "Owner/admin access is required." };
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

export async function createWorkflowHandoffRequestGrant(
  params: CreateWorkflowHandoffRequestGrantParams,
): Promise<WorkflowHandoffRequestGrantCreateResult> {
  const authz = await resolveInstallerAdminOrOwnerContext();
  if (!authz.ok) {
    return { success: false, error: authz.error };
  }

  const workflowHandoffRequestId = cleanString(params.workflowHandoffRequestId);
  const accountHandoffConnectionId = cleanString(params.accountHandoffConnectionId);
  const recipientAccountOwnerUserId = cleanString(params.recipientAccountOwnerUserId);
  const requestedAuthorizedRecipientId = cleanNullableString(params.authorizedHandoffRecipientId);

  if (!isUuid(workflowHandoffRequestId)) {
    return { success: false, error: "workflow_handoff_request_id is required." };
  }

  if (!isUuid(accountHandoffConnectionId)) {
    return { success: false, error: "account_handoff_connection_id is required." };
  }

  if (!isUuid(recipientAccountOwnerUserId)) {
    return { success: false, error: "recipient_account_owner_user_id is required." };
  }

  const admin = createAdminClient();

  const { data: handoffRequestData, error: handoffRequestError } = await admin
    .from("workflow_handoff_requests")
    .select("id, installer_account_owner_user_id, authorized_handoff_recipient_id, handoff_kind")
    .eq("id", workflowHandoffRequestId)
    .maybeSingle();

  if (handoffRequestError) {
    return { success: false, error: handoffRequestError.message ?? "Failed to load workflow handoff request." };
  }

  const handoffRequest = normalizeWorkflowHandoffRequestRow(handoffRequestData);
  if (!handoffRequest) {
    return { success: false, error: "workflow_handoff_request_id not found." };
  }

  if (handoffRequest.installer_account_owner_user_id !== authz.accountOwnerUserId) {
    return { success: false, error: "workflow_handoff_request_id is out of installer account scope." };
  }

  if (handoffRequest.handoff_kind !== HANDOFF_KIND_ECC) {
    return { success: false, error: "Only ecc handoff request grants are supported." };
  }

  const { data: connectionData, error: connectionError } = await admin
    .from("account_handoff_connections")
    .select("id, requesting_account_owner_user_id, recipient_account_owner_user_id, connection_status, handoff_kind")
    .eq("id", accountHandoffConnectionId)
    .maybeSingle();

  if (connectionError) {
    return { success: false, error: connectionError.message ?? "Failed to load account handoff connection." };
  }

  const connection = normalizeConnectionRow(connectionData);
  if (!connection) {
    return { success: false, error: "account_handoff_connection_id not found." };
  }

  if (connection.requesting_account_owner_user_id !== authz.accountOwnerUserId) {
    return { success: false, error: "account_handoff_connection_id is out of installer account scope." };
  }

  if (connection.handoff_kind !== HANDOFF_KIND_ECC) {
    return { success: false, error: "account_handoff_connection_id must be ecc." };
  }

  if (connection.connection_status !== "active") {
    return { success: false, error: "account_handoff_connection_id must be active." };
  }

  if (connection.recipient_account_owner_user_id !== recipientAccountOwnerUserId) {
    return { success: false, error: "recipient_account_owner_user_id does not match account_handoff_connection_id." };
  }

  const { data: existingGrantData, error: existingGrantError } = await admin
    .from("workflow_handoff_request_grants")
    .select("*")
    .eq("workflow_handoff_request_id", workflowHandoffRequestId)
    .eq("recipient_account_owner_user_id", recipientAccountOwnerUserId)
    .eq("grant_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingGrantError) {
    return { success: false, error: existingGrantError.message ?? "Failed to load existing workflow handoff request grant." };
  }

  const existingGrant = normalizeGrantRow(existingGrantData);
  if (existingGrant) {
    return {
      success: true,
      grantId: existingGrant.id,
      grantStatus: existingGrant.grant_status,
      created: false,
    };
  }

  const resolvedAuthorizedRecipientId = requestedAuthorizedRecipientId ?? handoffRequest.authorized_handoff_recipient_id;

  if (requestedAuthorizedRecipientId && requestedAuthorizedRecipientId !== handoffRequest.authorized_handoff_recipient_id) {
    return { success: false, error: "authorized_handoff_recipient_id does not match workflow_handoff_request_id." };
  }

  if (resolvedAuthorizedRecipientId) {
    const { data: recipientData, error: recipientError } = await admin
      .from("authorized_handoff_recipients")
      .select("id, account_owner_user_id, handoff_kind, recipient_type, connected_account_owner_user_id, is_active, archived_at")
      .eq("id", resolvedAuthorizedRecipientId)
      .maybeSingle();

    if (recipientError) {
      return { success: false, error: recipientError.message ?? "Failed to load authorized handoff recipient." };
    }

    const recipient = normalizeAuthorizedRecipientValidationRow(recipientData);
    if (!recipient) {
      return { success: false, error: "authorized_handoff_recipient_id not found." };
    }

    if (recipient.account_owner_user_id !== authz.accountOwnerUserId) {
      return { success: false, error: "authorized_handoff_recipient_id is out of installer account scope." };
    }

    if (recipient.handoff_kind !== HANDOFF_KIND_ECC) {
      return { success: false, error: "authorized_handoff_recipient_id must be ecc." };
    }

    if (recipient.recipient_type !== "connected_account_future") {
      return { success: false, error: "authorized_handoff_recipient_id must be connected_account_future." };
    }

    if (!recipient.is_active || recipient.archived_at) {
      return { success: false, error: "authorized_handoff_recipient_id must be active." };
    }

    if (cleanString(recipient.connected_account_owner_user_id) !== recipientAccountOwnerUserId) {
      return {
        success: false,
        error: "authorized_handoff_recipient_id connected account must match recipient_account_owner_user_id.",
      };
    }
  }

  const nowIso = new Date().toISOString();

  const insertPayload = {
    installer_account_owner_user_id: authz.accountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    account_handoff_connection_id: accountHandoffConnectionId,
    workflow_handoff_request_id: workflowHandoffRequestId,
    authorized_handoff_recipient_id: resolvedAuthorizedRecipientId,
    handoff_kind: HANDOFF_KIND_ECC,
    grant_status: "active",
    shared_scope: SHARED_SCOPE_HANDOFF_REQUEST_ONLY,
    granted_by_user_id: authz.userId,
    granted_at: nowIso,
  };

  void params.grantReason;

  const { data: insertedGrantData, error: insertGrantError } = await admin
    .from("workflow_handoff_request_grants")
    .insert(insertPayload)
    .select("*")
    .maybeSingle();

  if (insertGrantError) {
    return { success: false, error: insertGrantError.message ?? "Failed to create workflow handoff request grant." };
  }

  const insertedGrant = normalizeGrantRow(insertedGrantData);
  if (!insertedGrant) {
    return { success: false, error: "Failed to create workflow handoff request grant." };
  }

  return {
    success: true,
    grantId: insertedGrant.id,
    grantStatus: insertedGrant.grant_status,
    created: true,
  };
}

export async function revokeWorkflowHandoffRequestGrant(
  params: RevokeWorkflowHandoffRequestGrantParams,
): Promise<WorkflowHandoffRequestGrantRevokeResult> {
  const authz = await resolveInstallerAdminOrOwnerContext();
  if (!authz.ok) {
    return { success: false, error: authz.error };
  }

  const grantId = cleanString(params.grantId);
  if (!isUuid(grantId)) {
    return { success: false, error: "grant_id is required." };
  }

  const admin = createAdminClient();

  const { data: grantData, error: grantError } = await admin
    .from("workflow_handoff_request_grants")
    .select("*")
    .eq("id", grantId)
    .maybeSingle();

  if (grantError) {
    return { success: false, error: grantError.message ?? "Failed to load workflow handoff request grant." };
  }

  const grant = normalizeGrantRow(grantData);
  if (!grant) {
    return { success: false, error: "grant_id not found." };
  }

  if (grant.installer_account_owner_user_id !== authz.accountOwnerUserId) {
    return { success: false, error: "grant_id is out of installer account scope." };
  }

  if (grant.grant_status === "revoked") {
    return {
      success: true,
      grantId: grant.id,
      grantStatus: grant.grant_status,
      revoked: false,
    };
  }

  const nowIso = new Date().toISOString();

  const { data: revokedGrantData, error: revokeError } = await admin
    .from("workflow_handoff_request_grants")
    .update({
      grant_status: "revoked",
      revoked_by_user_id: authz.userId,
      revoked_at: nowIso,
      revoke_reason: cleanNullableString(params.revokeReason),
      updated_at: nowIso,
    })
    .eq("id", grant.id)
    .eq("installer_account_owner_user_id", authz.accountOwnerUserId)
    .select("*")
    .maybeSingle();

  if (revokeError) {
    return { success: false, error: revokeError.message ?? "Failed to revoke workflow handoff request grant." };
  }

  const revokedGrant = normalizeGrantRow(revokedGrantData);
  if (!revokedGrant) {
    return { success: false, error: "Failed to revoke workflow handoff request grant." };
  }

  return {
    success: true,
    grantId: revokedGrant.id,
    grantStatus: revokedGrant.grant_status,
    revoked: true,
  };
}
