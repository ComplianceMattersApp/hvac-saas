"use server";

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
  type InternalRole,
} from "@/lib/auth/internal-user";
import {
  normalizeAccountWorkshareConnectionRow,
  type AccountWorkshareConnectionRow,
  type AccountWorkshareConnectionStatus,
  type AccountWorkshareServiceType,
} from "@/lib/workflows/account-workshare-connections-read";

type ActionResult =
  | {
      success: true;
      connection: AccountWorkshareConnectionRow;
      inviteToken?: string | null;
      created?: boolean;
    }
  | {
      success: false;
      error: string;
    };

const SERVICE_TYPE_ECC_HERS: AccountWorkshareServiceType = "ecc_hers";
const LIVE_STATUSES: AccountWorkshareConnectionStatus[] = ["pending", "active"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTIONS_PATH = "/ops/admin/connections";
const CONNECTIONS_ANCHOR = "#ecc-hers-connections";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: unknown) {
  const normalized = cleanString(value).toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isUuid(value: string | null | undefined) {
  return UUID_PATTERN.test(cleanString(value));
}

function isAdminOrOwner(role: InternalRole, userId: string, accountOwnerUserId: string) {
  return role === "admin" || userId === accountOwnerUserId;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

function tokenMatchesHash(token: string, expectedHash: string | null) {
  const normalizedToken = cleanString(token);
  const normalizedHash = cleanString(expectedHash);
  if (!normalizedToken || !normalizedHash) return false;

  const actual = Buffer.from(hashToken(normalizedToken), "hex");
  const expected = Buffer.from(normalizedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function withConnectionsNotice(notice: string) {
  return `${CONNECTIONS_PATH}?notice=${encodeURIComponent(notice)}${CONNECTIONS_ANCHOR}`;
}

function failure(error: string): ActionResult {
  return { success: false, error };
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

    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;

    return {
      ok: true as const,
      supabase,
      userId,
      accountOwnerUserId,
      email: normalizeEmail(data?.user?.email),
    };
  } catch (error) {
    if (isInternalAccessError(error)) {
      if (error.code === "AUTH_REQUIRED") {
        return { ok: false as const, error: "Authentication required." };
      }

      return { ok: false as const, error: "Owner/admin access is required." };
    }

    throw error;
  }
}

async function readConnectionById(admin: any, connectionId: string) {
  const { data, error } = await admin
    .from("account_workshare_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  if (error) {
    return { connection: null, error: error.message || "Could not load workshare connection." };
  }

  return { connection: normalizeAccountWorkshareConnectionRow(data), error: null };
}

async function readLiveDirectionalConnection(params: {
  admin: any;
  senderAccountId: string;
  receiverAccountId: string;
}) {
  const { data, error } = await params.admin
    .from("account_workshare_connections")
    .select("*")
    .eq("sender_account_id", params.senderAccountId)
    .eq("receiver_account_id", params.receiverAccountId)
    .eq("service_type", SERVICE_TYPE_ECC_HERS)
    .in("status", LIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { connection: null, error: error.message || "Could not check existing workshare connection." };
  }

  return { connection: normalizeAccountWorkshareConnectionRow(data), error: null };
}

export async function createAccountWorkshareInvite(input: {
  senderAccountId?: string | null;
  inviteEmail?: string | null;
  inviteCompanyName?: string | null;
}): Promise<ActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) return failure(authz.error);

  const senderAccountId = cleanNullableString(input.senderAccountId);
  const inviteEmail = normalizeEmail(input.inviteEmail);
  const inviteCompanyName = cleanNullableString(input.inviteCompanyName);

  if (!senderAccountId && !inviteEmail) {
    return failure("Sender account id or invite email is required.");
  }

  if (senderAccountId && !isUuid(senderAccountId)) {
    return failure("Sender account id must be a valid account id.");
  }

  if (senderAccountId === authz.accountOwnerUserId) {
    return failure("Sender and receiver accounts must be different.");
  }

  const admin = createAdminClient();

  if (senderAccountId) {
    const existing = await readLiveDirectionalConnection({
      admin,
      senderAccountId,
      receiverAccountId: authz.accountOwnerUserId,
    });

    if (existing.error) return failure(existing.error);
    if (existing.connection) {
      return { success: true, connection: existing.connection, inviteToken: null, created: false };
    }
  }

  const inviteToken = senderAccountId ? null : createInviteToken();
  const payload = {
    sender_account_id: senderAccountId,
    receiver_account_id: authz.accountOwnerUserId,
    service_type: SERVICE_TYPE_ECC_HERS,
    status: "pending",
    invite_email: inviteEmail,
    invite_company_name: inviteCompanyName,
    invite_token_hash: inviteToken ? hashToken(inviteToken) : null,
    invited_by_user_id: authz.userId,
  };

  const { data, error } = await admin
    .from("account_workshare_connections")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    return failure(error.message || "Could not create workshare invite.");
  }

  const connection = normalizeAccountWorkshareConnectionRow(data);
  if (!connection) {
    return failure("Could not create workshare invite.");
  }

  return { success: true, connection, inviteToken, created: true };
}

export async function acceptAccountWorkshareInvite(input: {
  connectionId: string;
  inviteToken?: string | null;
}): Promise<ActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) return failure(authz.error);

  const connectionId = cleanString(input.connectionId);
  if (!isUuid(connectionId)) {
    return failure("Connection id is required.");
  }

  const admin = createAdminClient();
  const loaded = await readConnectionById(admin, connectionId);
  if (loaded.error) return failure(loaded.error);
  if (!loaded.connection) return failure("Connection not found.");

  const connection = loaded.connection;
  if (connection.status !== "pending") {
    return failure("Only pending workshare invites can be accepted.");
  }

  if (connection.sender_account_id) {
    if (connection.sender_account_id !== authz.accountOwnerUserId) {
      return failure("Only the intended sender account can accept this invite.");
    }
  } else {
    if (!connection.invite_email || connection.invite_email !== authz.email) {
      return failure("Only the invited email can accept this invite.");
    }

    if (!tokenMatchesHash(cleanString(input.inviteToken), connection.invite_token_hash)) {
      return failure("A valid invite token is required.");
    }
  }

  if (connection.receiver_account_id === authz.accountOwnerUserId) {
    return failure("Sender and receiver accounts must be different.");
  }

  const existing = await readLiveDirectionalConnection({
    admin,
    senderAccountId: authz.accountOwnerUserId,
    receiverAccountId: connection.receiver_account_id,
  });
  if (existing.error) return failure(existing.error);
  if (existing.connection && existing.connection.id !== connection.id) {
    return failure("A live workshare connection already exists for these accounts.");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("account_workshare_connections")
    .update({
      sender_account_id: authz.accountOwnerUserId,
      status: "active",
      accepted_by_user_id: authz.userId,
      accepted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", connection.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return failure(error.message || "Could not accept workshare invite.");
  }

  const updated = normalizeAccountWorkshareConnectionRow(data);
  if (!updated) {
    return failure("Could not accept workshare invite.");
  }

  return { success: true, connection: updated };
}

export async function disableAccountWorkshareConnection(input: {
  connectionId: string;
}): Promise<ActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) return failure(authz.error);

  const connectionId = cleanString(input.connectionId);
  if (!isUuid(connectionId)) return failure("Connection id is required.");

  const admin = createAdminClient();
  const loaded = await readConnectionById(admin, connectionId);
  if (loaded.error) return failure(loaded.error);
  if (!loaded.connection) return failure("Connection not found.");

  const connection = loaded.connection;
  if (connection.receiver_account_id !== authz.accountOwnerUserId) {
    return failure("Only the receiver account owner/admin can disable this connection.");
  }

  if (connection.status !== "active") {
    return failure("Only active workshare connections can be disabled.");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("account_workshare_connections")
    .update({
      status: "disabled",
      disabled_by_user_id: authz.userId,
      disabled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", connection.id)
    .select("*")
    .maybeSingle();

  if (error) return failure(error.message || "Could not disable workshare connection.");

  const updated = normalizeAccountWorkshareConnectionRow(data);
  if (!updated) return failure("Could not disable workshare connection.");

  return { success: true, connection: updated };
}

export async function revokeAccountWorkshareConnection(input: {
  connectionId: string;
}): Promise<ActionResult> {
  const authz = await resolveAdminOrOwnerContext();
  if (!authz.ok) return failure(authz.error);

  const connectionId = cleanString(input.connectionId);
  if (!isUuid(connectionId)) return failure("Connection id is required.");

  const admin = createAdminClient();
  const loaded = await readConnectionById(admin, connectionId);
  if (loaded.error) return failure(loaded.error);
  if (!loaded.connection) return failure("Connection not found.");

  const connection = loaded.connection;
  const isSender = connection.sender_account_id === authz.accountOwnerUserId;
  const isReceiver = connection.receiver_account_id === authz.accountOwnerUserId;
  if (!isSender && !isReceiver) {
    return failure("Only a connected sender or receiver account can revoke this connection.");
  }

  if (connection.status !== "pending" && connection.status !== "active") {
    return failure("Only pending or active workshare connections can be revoked.");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("account_workshare_connections")
    .update({
      status: "revoked",
      revoked_by_user_id: authz.userId,
      revoked_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", connection.id)
    .select("*")
    .maybeSingle();

  if (error) return failure(error.message || "Could not revoke workshare connection.");

  const updated = normalizeAccountWorkshareConnectionRow(data);
  if (!updated) return failure("Could not revoke workshare connection.");

  return { success: true, connection: updated };
}

export async function createAccountWorkshareInviteFromForm(formData: FormData): Promise<void> {
  const result = await createAccountWorkshareInvite({
    senderAccountId: cleanNullableString(formData.get("sender_account_id")),
    inviteEmail: cleanNullableString(formData.get("invite_email")),
    inviteCompanyName: cleanNullableString(formData.get("invite_company_name")),
  });

  if (!result.success) {
    redirect(withConnectionsNotice("workshare_connection_error"));
  }

  revalidatePath(CONNECTIONS_PATH);
  redirect(withConnectionsNotice("workshare_connection_invited"));
}

export async function acceptAccountWorkshareInviteFromForm(formData: FormData): Promise<void> {
  const result = await acceptAccountWorkshareInvite({
    connectionId: cleanString(formData.get("connection_id")),
    inviteToken: cleanNullableString(formData.get("invite_token")),
  });

  if (!result.success) {
    redirect(withConnectionsNotice("workshare_connection_error"));
  }

  revalidatePath(CONNECTIONS_PATH);
  redirect(withConnectionsNotice("workshare_connection_accepted"));
}

export async function disableAccountWorkshareConnectionFromForm(formData: FormData): Promise<void> {
  const result = await disableAccountWorkshareConnection({
    connectionId: cleanString(formData.get("connection_id")),
  });

  if (!result.success) {
    redirect(withConnectionsNotice("workshare_connection_error"));
  }

  revalidatePath(CONNECTIONS_PATH);
  redirect(withConnectionsNotice("workshare_connection_disabled"));
}

export async function revokeAccountWorkshareConnectionFromForm(formData: FormData): Promise<void> {
  const result = await revokeAccountWorkshareConnection({
    connectionId: cleanString(formData.get("connection_id")),
  });

  if (!result.success) {
    redirect(withConnectionsNotice("workshare_connection_error"));
  }

  revalidatePath(CONNECTIONS_PATH);
  redirect(withConnectionsNotice("workshare_connection_revoked"));
}
