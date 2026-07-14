import { decryptToken, encryptToken } from "./qbo-encryption";
import { refreshQboTokens } from "./qbo-oauth-client";

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
}): Promise<void> {
  const { supabase, accountOwnerUserId, accessToken, refreshToken, expiresAt } = params;
  const { error } = await supabase
    .from("qbo_connections")
    .update({
      access_token_encrypted: encryptToken(accessToken),
      refresh_token_encrypted: encryptToken(refreshToken),
      token_expires_at: expiresAt.toISOString(),
    })
    .eq("account_owner_user_id", accountOwnerUserId);
  if (error) throw new Error(`Failed to update QBO tokens: ${error.message}`);
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

  const expiresAtMs = new Date(connection.tokenExpiresAt).getTime();
  const fiveMinutesMs = 5 * 60 * 1000;
  if (expiresAtMs - Date.now() > fiveMinutesMs) {
    return {
      accessToken: decryptToken(connection.accessTokenEncrypted),
      realmId: connection.realmId,
    };
  }

  const refreshToken = decryptToken(connection.refreshTokenEncrypted);
  const refreshed = await refreshQboTokens(refreshToken);
  await updateQboConnectionTokens({
    supabase,
    accountOwnerUserId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  });
  return { accessToken: refreshed.accessToken, realmId: connection.realmId };
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
