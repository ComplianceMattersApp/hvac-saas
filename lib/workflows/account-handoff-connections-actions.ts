"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
  type InternalRole,
} from "@/lib/auth/internal-user";

type AccountHandoffConnectionStatus = "pending" | "active" | "declined" | "revoked";
type AccountHandoffConnectionHandoffKind = "ecc";

type AccountHandoffConnectionRow = {
  id: string;
  requesting_account_owner_user_id: string;
  recipient_account_owner_user_id: string;
  connection_status: AccountHandoffConnectionStatus;
  handoff_kind: AccountHandoffConnectionHandoffKind;
  requested_by_user_id: string | null;
  approved_by_user_id: string | null;
  declined_by_user_id: string | null;
  revoked_by_user_id: string | null;
  requested_at: string;
  approved_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  connection_note: string | null;
  created_at: string;
  updated_at: string;
};

type AccountHandoffConnectionActionResult =
  | {
      success: true;
      connectionId: string;
      connectionStatus: AccountHandoffConnectionStatus;
    }
  | {
      success: false;
      error: string;
      connectionId: null;
      connectionStatus: null;
    };

const HANDOFF_KIND_ECC: AccountHandoffConnectionHandoffKind = "ecc";
const LIVE_CONNECTION_STATUSES: AccountHandoffConnectionStatus[] = ["pending", "active"];
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

function normalizeHandoffKind(value: unknown): AccountHandoffConnectionHandoffKind | null {
  const normalized = cleanString(value).toLowerCase();
  return normalized === HANDOFF_KIND_ECC ? HANDOFF_KIND_ECC : null;
}

function normalizeStatus(value: unknown): AccountHandoffConnectionStatus | null {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "active") return "active";
  if (normalized === "declined") return "declined";
  if (normalized === "revoked") return "revoked";
  return null;
}

function normalizeConnectionRow(value: any): AccountHandoffConnectionRow | null {
  const id = cleanString(value?.id);
  const requestingAccountOwnerUserId = cleanString(value?.requesting_account_owner_user_id);
  const recipientAccountOwnerUserId = cleanString(value?.recipient_account_owner_user_id);
  const connectionStatus = normalizeStatus(value?.connection_status);
  const handoffKind = normalizeHandoffKind(value?.handoff_kind);
  const requestedAt = cleanString(value?.requested_at);
  const createdAt = cleanString(value?.created_at);
  const updatedAt = cleanString(value?.updated_at);

  if (!id || !requestingAccountOwnerUserId || !recipientAccountOwnerUserId || !connectionStatus || !handoffKind || !requestedAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    requesting_account_owner_user_id: requestingAccountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    connection_status: connectionStatus,
    handoff_kind: handoffKind,
    requested_by_user_id: cleanNullableString(value?.requested_by_user_id),
    approved_by_user_id: cleanNullableString(value?.approved_by_user_id),
    declined_by_user_id: cleanNullableString(value?.declined_by_user_id),
    revoked_by_user_id: cleanNullableString(value?.revoked_by_user_id),
    requested_at: requestedAt,
    approved_at: cleanNullableString(value?.approved_at),
    declined_at: cleanNullableString(value?.declined_at),
    revoked_at: cleanNullableString(value?.revoked_at),
    connection_note: cleanNullableString(value?.connection_note),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function failure(error: string): AccountHandoffConnectionActionResult {
  return {
    success: false,
    error,
    connectionId: null,
    connectionStatus: null,
  };
}

function isAdminOrOwner(role: InternalRole, userId: string, accountOwnerUserId: string) {
  return role === "admin" || userId === accountOwnerUserId;
}

async function resolveAdminOrOwnerContext() {
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

      if (error.code === "INTERNAL_ROLE_REQUIRED") {
        return { ok: false as const, error: "Owner/admin access is required." };
      }

      return { ok: false as const, error: "Active internal user required." };
    }

    throw error;
  }
}

async function readConnectionById(params: {
  admin: any;
  connectionId: string;
}) {
  const { data, error } = await params.admin
    .from("account_handoff_connections")
    .select("*")
    .eq("id", params.connectionId)
    .maybeSingle();

  if (error) {
    return { connection: null, error: error.message || "Could not load connection." };
  }

  const connection = normalizeConnectionRow(data);
  return { connection, error: null };
}

async function readLiveConnectionByPair(params: {
  admin: any;
  leftAccountOwnerUserId: string;
  rightAccountOwnerUserId: string;
  handoffKind: AccountHandoffConnectionHandoffKind;
}) {
  const { data, error } = await params.admin
    .from("account_handoff_connections")
    .select("*")
    .in("requesting_account_owner_user_id", [params.leftAccountOwnerUserId, params.rightAccountOwnerUserId])
    .in("recipient_account_owner_user_id", [params.leftAccountOwnerUserId, params.rightAccountOwnerUserId])
    .eq("handoff_kind", params.handoffKind)
    .in("connection_status", LIVE_CONNECTION_STATUSES)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return { connection: null, error: error.message || "Could not check existing connection." };
  }

  const rows = (Array.isArray(data) ? data : [])
    .map((entry) => normalizeConnectionRow(entry))
    .filter((entry): entry is AccountHandoffConnectionRow => entry !== null);

  const connection = rows.find((entry) => {
    const direct = entry.requesting_account_owner_user_id === params.leftAccountOwnerUserId
      && entry.recipient_account_owner_user_id === params.rightAccountOwnerUserId;
    const reverse = entry.requesting_account_owner_user_id === params.rightAccountOwnerUserId
      && entry.recipient_account_owner_user_id === params.leftAccountOwnerUserId;
    return direct || reverse;
  }) ?? null;

  return { connection, error: null };
}

export async function requestAccountHandoffConnection(input: {
  recipientAccountOwnerUserId: string;
  handoffKind?: string | null;
  connectionNote?: string | null;
}): Promise<AccountHandoffConnectionActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) {
    return failure(authz.error);
  }

  const recipientAccountOwnerUserId = cleanString(input.recipientAccountOwnerUserId);
  const handoffKind = normalizeHandoffKind(input.handoffKind ?? HANDOFF_KIND_ECC);

  if (!isUuid(recipientAccountOwnerUserId)) {
    return failure("Recipient account owner id is required.");
  }

  if (!handoffKind) {
    return failure("Only ecc handoff connections are supported.");
  }

  if (recipientAccountOwnerUserId === authz.accountOwnerUserId) {
    return failure("Requesting and recipient account owners must be different.");
  }

  const admin = createAdminClient();
  const live = await readLiveConnectionByPair({
    admin,
    leftAccountOwnerUserId: authz.accountOwnerUserId,
    rightAccountOwnerUserId: recipientAccountOwnerUserId,
    handoffKind,
  });

  if (live.error) {
    return failure(live.error);
  }

  if (live.connection) {
    return {
      success: true,
      connectionId: live.connection.id,
      connectionStatus: live.connection.connection_status,
    };
  }

  const nowIso = new Date().toISOString();
  const payload = {
    requesting_account_owner_user_id: authz.accountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    connection_status: "pending",
    handoff_kind: handoffKind,
    requested_by_user_id: authz.userId,
    requested_at: nowIso,
    connection_note: cleanNullableString(input.connectionNote),
  };

  const { data, error } = await admin
    .from("account_handoff_connections")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    return failure(error.message || "Could not request handoff connection.");
  }

  const connection = normalizeConnectionRow(data);
  if (!connection) {
    return failure("Could not request handoff connection.");
  }

  return {
    success: true,
    connectionId: connection.id,
    connectionStatus: connection.connection_status,
  };
}

export async function approveAccountHandoffConnection(input: {
  connectionId: string;
  connectionNote?: string | null;
}): Promise<AccountHandoffConnectionActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) {
    return failure(authz.error);
  }

  const connectionId = cleanString(input.connectionId);
  if (!isUuid(connectionId)) {
    return failure("Connection id is required.");
  }

  const admin = createAdminClient();
  const loaded = await readConnectionById({ admin, connectionId });
  if (loaded.error) {
    return failure(loaded.error);
  }

  if (!loaded.connection) {
    return failure("Connection not found.");
  }

  const connection = loaded.connection;
  if (connection.recipient_account_owner_user_id !== authz.accountOwnerUserId) {
    return failure("Only the recipient account admin/owner can approve this connection.");
  }

  if (connection.connection_status !== "pending") {
    return failure("Only pending connections can be approved.");
  }

  const updates: Record<string, unknown> = {
    connection_status: "active",
    approved_by_user_id: authz.userId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (input.connectionNote !== undefined) {
    updates.connection_note = cleanNullableString(input.connectionNote);
  }

  const { data, error } = await admin
    .from("account_handoff_connections")
    .update(updates)
    .eq("id", connection.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return failure(error.message || "Could not approve handoff connection.");
  }

  const updated = normalizeConnectionRow(data);
  if (!updated) {
    return failure("Could not approve handoff connection.");
  }

  return {
    success: true,
    connectionId: updated.id,
    connectionStatus: updated.connection_status,
  };
}

export async function declineAccountHandoffConnection(input: {
  connectionId: string;
  connectionNote?: string | null;
}): Promise<AccountHandoffConnectionActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) {
    return failure(authz.error);
  }

  const connectionId = cleanString(input.connectionId);
  if (!isUuid(connectionId)) {
    return failure("Connection id is required.");
  }

  const admin = createAdminClient();
  const loaded = await readConnectionById({ admin, connectionId });
  if (loaded.error) {
    return failure(loaded.error);
  }

  if (!loaded.connection) {
    return failure("Connection not found.");
  }

  const connection = loaded.connection;
  if (connection.recipient_account_owner_user_id !== authz.accountOwnerUserId) {
    return failure("Only the recipient account admin/owner can decline this connection.");
  }

  if (connection.connection_status !== "pending") {
    return failure("Only pending connections can be declined.");
  }

  const updates: Record<string, unknown> = {
    connection_status: "declined",
    declined_by_user_id: authz.userId,
    declined_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (input.connectionNote !== undefined) {
    updates.connection_note = cleanNullableString(input.connectionNote);
  }

  const { data, error } = await admin
    .from("account_handoff_connections")
    .update(updates)
    .eq("id", connection.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return failure(error.message || "Could not decline handoff connection.");
  }

  const updated = normalizeConnectionRow(data);
  if (!updated) {
    return failure("Could not decline handoff connection.");
  }

  return {
    success: true,
    connectionId: updated.id,
    connectionStatus: updated.connection_status,
  };
}

export async function revokeAccountHandoffConnection(input: {
  connectionId: string;
  connectionNote?: string | null;
}): Promise<AccountHandoffConnectionActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) {
    return failure(authz.error);
  }

  const connectionId = cleanString(input.connectionId);
  if (!isUuid(connectionId)) {
    return failure("Connection id is required.");
  }

  const admin = createAdminClient();
  const loaded = await readConnectionById({ admin, connectionId });
  if (loaded.error) {
    return failure(loaded.error);
  }

  if (!loaded.connection) {
    return failure("Connection not found.");
  }

  const connection = loaded.connection;
  const isRequester = connection.requesting_account_owner_user_id === authz.accountOwnerUserId;
  const isRecipient = connection.recipient_account_owner_user_id === authz.accountOwnerUserId;
  if (!isRequester && !isRecipient) {
    return failure("Only a connected account admin/owner can revoke this connection.");
  }

  if (connection.connection_status !== "active") {
    return failure("Only active connections can be revoked.");
  }

  const updates: Record<string, unknown> = {
    connection_status: "revoked",
    revoked_by_user_id: authz.userId,
    revoked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (input.connectionNote !== undefined) {
    updates.connection_note = cleanNullableString(input.connectionNote);
  }

  const { data, error } = await admin
    .from("account_handoff_connections")
    .update(updates)
    .eq("id", connection.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return failure(error.message || "Could not revoke handoff connection.");
  }

  const updated = normalizeConnectionRow(data);
  if (!updated) {
    return failure("Could not revoke handoff connection.");
  }

  return {
    success: true,
    connectionId: updated.id,
    connectionStatus: updated.connection_status,
  };
}