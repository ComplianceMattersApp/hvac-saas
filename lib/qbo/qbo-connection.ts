import { decryptToken, encryptToken } from "./qbo-encryption";
import { refreshQboTokens } from "./qbo-oauth-client";
import { randomUUID } from "crypto";

/**
 * QBO connection read/write helpers. Tokens are encrypted before storage and
 * decrypted on read — plaintext tokens never touch the DB.
 *
 * `supabase` is typed `any` to match the house helper convention (callers pass
 * either the user-scoped or admin client). Only `status='active'` rows are
 * surfaced, so a disconnected account reads as "not connected".
 */

export interface QboConnection {
  id: string;
  accountOwnerUserId: string;
  realmId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: string;
  environment: "sandbox" | "production";
  status: "active" | "disconnected" | "error";
  connectedAt: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  refreshLeaseId: string | null;
  refreshLeaseExpiresAt: string | null;
}

function mapRow(row: any): QboConnection {
  return {
    id: row.id,
    accountOwnerUserId: row.account_owner_user_id,
    realmId: row.realm_id,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenExpiresAt: row.token_expires_at,
    environment: row.environment,
    status: row.status,
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at ?? null,
    lastSyncError: row.last_sync_error ?? null,
    refreshLeaseId: row.refresh_lease_id ?? null,
    refreshLeaseExpiresAt: row.refresh_lease_expires_at ?? null,
  };
}

export async function getQboConnectionForAccount(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<QboConnection | null> {
  const { supabase, accountOwnerUserId } = params;
  const { data, error } = await supabase
    .from("qbo_connections")
    .select("*")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Failed to load QBO connection: ${error.message}`);
  if (!data) return null;
  return mapRow(data);
}

export async function getQboConnectionForAccountIncludingInactive(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<QboConnection | null> {
  const { data, error } = await params.supabase
    .from("qbo_connections")
    .select("*")
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load QBO connection: ${error.message}`);
  return data ? mapRow(data) : null;
}

export async function upsertQboConnection(params: {
  supabase: any;
  accountOwnerUserId: string;
  realmId: string;
  accessToken: string; // plaintext — encrypted before storage
  refreshToken: string; // plaintext — encrypted before storage
  expiresAt: Date;
  environment: "sandbox" | "production";
}): Promise<void> {
  const { supabase, accountOwnerUserId, realmId, accessToken, refreshToken, expiresAt, environment } =
    params;
  const nowIso = new Date().toISOString();

  // Preserve the ORIGINAL connect time across reconnects (any status). connected_at
  // is the sync-start cutoff — re-authorizing to fix a token must NOT move it
  // forward, or invoices issued between connects would be orphaned from sync.
  const { data: existingRow } = await supabase
    .from("qbo_connections")
    .select("connected_at")
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();
  const connectedAtIso = existingRow?.connected_at ? String(existingRow.connected_at) : nowIso;

  const { error } = await supabase.from("qbo_connections").upsert(
    {
      account_owner_user_id: accountOwnerUserId,
      realm_id: realmId,
      access_token_encrypted: encryptToken(accessToken),
      refresh_token_encrypted: encryptToken(refreshToken),
      token_expires_at: expiresAt.toISOString(),
      environment,
      status: "active",
      connected_at: connectedAtIso,
      last_sync_error: null,
      refresh_lease_id: null,
      refresh_lease_expires_at: null,
    },
    { onConflict: "account_owner_user_id" },
  );
  if (error) throw new Error(`Failed to store QBO connection: ${error.message}`);
}

export async function updateQboConnectionTokens(params: {
  supabase: any;
  accountOwnerUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshLeaseId?: string | null;
}): Promise<void> {
  const { supabase, accountOwnerUserId, accessToken, refreshToken, expiresAt, refreshLeaseId } = params;
  let query = supabase
    .from("qbo_connections")
    .update({
      access_token_encrypted: encryptToken(accessToken),
      refresh_token_encrypted: encryptToken(refreshToken),
      token_expires_at: expiresAt.toISOString(),
      refresh_lease_id: null,
      refresh_lease_expires_at: null,
      status: "active",
      last_sync_error: null,
    })
    .eq("account_owner_user_id", accountOwnerUserId);
  if (refreshLeaseId) query = query.eq("refresh_lease_id", refreshLeaseId);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Failed to update QBO tokens: ${error.message}`);
  if (!data?.id) throw new Error("QBO refresh lease was lost before the rotated token could be stored.");
}

function accessTokenIsFresh(connection: QboConnection) {
  return new Date(connection.tokenExpiresAt).getTime() - Date.now() > 5 * 60 * 1000;
}

function isInvalidRefreshTokenError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  return message.includes("refresh token is invalid") || message.includes("invalid_grant") || message.includes("authorize again");
}

async function waitForConcurrentQboRefresh(params: { supabase: any; accountOwnerUserId: string }) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const connection = await getQboConnectionForAccount(params);
    if (!connection) return null;
    if (accessTokenIsFresh(connection)) {
      return { accessToken: decryptToken(connection.accessTokenEncrypted), realmId: connection.realmId };
    }
  }
  throw new Error("QuickBooks token refresh is still in progress. Try the sync again in a moment.");
}

async function releaseQboRefreshLease(params: {
  supabase: any;
  accountOwnerUserId: string;
  refreshLeaseId: string;
  reauthorizationRequired?: boolean;
}) {
  const patch: Record<string, unknown> = {
    refresh_lease_id: null,
    refresh_lease_expires_at: null,
  };
  if (params.reauthorizationRequired) {
    patch.status = "error";
    patch.last_sync_error = "QuickBooks authorization expired. Reconnect QuickBooks to resume syncing.";
  }
  await params.supabase
    .from("qbo_connections")
    .update(patch)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("refresh_lease_id", params.refreshLeaseId);
}

export async function disconnectQboConnection(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<void> {
  const { supabase, accountOwnerUserId } = params;
  const { error } = await supabase
    .from("qbo_connections")
    .update({ status: "disconnected" })
    .eq("account_owner_user_id", accountOwnerUserId);
  if (error) throw new Error(`Failed to disconnect QBO: ${error.message}`);
}

/**
 * Returns a valid access token, refreshing (and persisting) if the stored token
 * is within 5 minutes of expiry. Returns null if there is no active connection.
 */
export async function getValidQboAccessToken(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<{ accessToken: string; realmId: string } | null> {
  const { supabase, accountOwnerUserId } = params;
  const connection = await getQboConnectionForAccount({ supabase, accountOwnerUserId });
  if (!connection) return null;

  if (accessTokenIsFresh(connection)) {
    return {
      accessToken: decryptToken(connection.accessTokenEncrypted),
      realmId: connection.realmId,
    };
  }

  const refreshLeaseId = randomUUID();
  const { data: acquired, error: leaseError } = await supabase.rpc("acquire_qbo_refresh_lease", {
    p_account_owner_user_id: accountOwnerUserId,
    p_lease_id: refreshLeaseId,
    p_lease_seconds: 30,
  });
  if (leaseError) throw new Error(`Failed to coordinate QBO token refresh: ${leaseError.message}`);
  if (!acquired) {
    return waitForConcurrentQboRefresh({ supabase, accountOwnerUserId });
  }

  const leasedConnection = await getQboConnectionForAccount({ supabase, accountOwnerUserId });
  if (!leasedConnection) return null;
  if (accessTokenIsFresh(leasedConnection)) {
    await releaseQboRefreshLease({ supabase, accountOwnerUserId, refreshLeaseId });
    return { accessToken: decryptToken(leasedConnection.accessTokenEncrypted), realmId: leasedConnection.realmId };
  }

  try {
    const refreshToken = decryptToken(leasedConnection.refreshTokenEncrypted);
    const refreshed = await refreshQboTokens(refreshToken);
    await updateQboConnectionTokens({
      supabase,
      accountOwnerUserId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      refreshLeaseId,
    });
    return { accessToken: refreshed.accessToken, realmId: leasedConnection.realmId };
  } catch (error) {
    await releaseQboRefreshLease({
      supabase,
      accountOwnerUserId,
      refreshLeaseId,
      reauthorizationRequired: isInvalidRefreshTokenError(error),
    });
    throw error;
  }
}

export async function recordQboConnectionSyncOutcome(params: {
  supabase: any;
  accountOwnerUserId: string;
  lastSyncError: string | null;
}): Promise<void> {
  const { supabase, accountOwnerUserId, lastSyncError } = params;
  await supabase
    .from("qbo_connections")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: lastSyncError })
    .eq("account_owner_user_id", accountOwnerUserId);
}
