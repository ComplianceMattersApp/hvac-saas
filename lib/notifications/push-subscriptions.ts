import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const SAFE_PUSH_SUBSCRIPTION_SELECT =
  "id, account_owner_user_id, user_id, endpoint, user_agent, device_label, permission_state, is_active, last_seen_at, last_success_at, last_failure_at, last_failure_code, created_at, updated_at";

export type PushSubscriptionPermissionState = "granted" | "denied" | "default" | "unknown";

export type PushSubscriptionSafeRow = {
  id: string;
  account_owner_user_id: string;
  user_id: string;
  endpoint: string;
  user_agent: string | null;
  device_label: string | null;
  permission_state: PushSubscriptionPermissionState;
  is_active: boolean;
  last_seen_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_code: string | null;
  created_at: string;
  updated_at: string;
};

export type RegisterCurrentUserPushSubscriptionInput = {
  endpoint?: string | null;
  p256dh?: string | null;
  auth?: string | null;
  userAgent?: string | null;
  deviceLabel?: string | null;
  permissionState?: PushSubscriptionPermissionState | string | null;
};

export type DeactivateCurrentUserPushSubscriptionInput = {
  id?: string | null;
  endpoint?: string | null;
};

type HelperParams = {
  supabase?: any;
  adminSupabase?: any;
};

type CurrentInternalPushContext = {
  supabase: any;
  userId: string;
  accountOwnerUserId: string;
};

type RegisterResult =
  | { status: "registered" | "updated"; subscription: PushSubscriptionSafeRow }
  | { status: "not_internal" | "invalid_input"; subscription: null };

type DeactivateResult = {
  deactivated: boolean;
  count: number;
};

type EndpointOwnershipRow = {
  id: string;
  account_owner_user_id: string | null;
  user_id: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function normalizePermissionState(value: unknown): PushSubscriptionPermissionState {
  const text = cleanText(value).toLowerCase();
  if (text === "granted" || text === "denied" || text === "default") return text;
  return "unknown";
}

async function resolveCurrentInternalPushContext(
  params: HelperParams = {},
): Promise<CurrentInternalPushContext | null> {
  const supabase = params.supabase ?? (await createClient());

  try {
    const { userId, internalUser } = await requireInternalUser({ supabase });
    const accountOwnerUserId = cleanText(internalUser.account_owner_user_id);
    const resolvedUserId = cleanText(userId);
    if (!resolvedUserId || !accountOwnerUserId) return null;

    return {
      supabase,
      userId: resolvedUserId,
      accountOwnerUserId,
    };
  } catch (error) {
    if (isInternalAccessError(error)) return null;
    throw error;
  }
}

function mapSafeRow(row: any): PushSubscriptionSafeRow {
  return {
    id: String(row.id),
    account_owner_user_id: String(row.account_owner_user_id),
    user_id: String(row.user_id),
    endpoint: String(row.endpoint),
    user_agent: row.user_agent ?? null,
    device_label: row.device_label ?? null,
    permission_state: normalizePermissionState(row.permission_state),
    is_active: Boolean(row.is_active),
    last_seen_at: row.last_seen_at ?? null,
    last_success_at: row.last_success_at ?? null,
    last_failure_at: row.last_failure_at ?? null,
    last_failure_code: row.last_failure_code ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listCurrentInternalUserPushSubscriptions(
  params: HelperParams = {},
): Promise<PushSubscriptionSafeRow[]> {
  const context = await resolveCurrentInternalPushContext(params);
  if (!context) return [];

  const { data, error } = await context.supabase
    .from("push_subscriptions")
    .select(SAFE_PUSH_SUBSCRIPTION_SELECT)
    .eq("account_owner_user_id", context.accountOwnerUserId)
    .eq("user_id", context.userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapSafeRow);
}

export async function registerCurrentInternalUserPushSubscription(
  input: RegisterCurrentUserPushSubscriptionInput,
  params: HelperParams = {},
): Promise<RegisterResult> {
  const context = await resolveCurrentInternalPushContext(params);
  if (!context) return { status: "not_internal", subscription: null };

  const endpoint = cleanText(input.endpoint);
  const p256dh = cleanText(input.p256dh);
  const auth = cleanText(input.auth);
  if (!endpoint || !p256dh || !auth) {
    return { status: "invalid_input", subscription: null };
  }

  const now = new Date().toISOString();
  const adminSupabase = params.adminSupabase ?? createAdminClient();
  const basePatch = {
    p256dh,
    auth,
    user_agent: cleanNullableText(input.userAgent),
    device_label: cleanNullableText(input.deviceLabel),
    permission_state: normalizePermissionState(input.permissionState ?? "granted"),
    is_active: true,
    last_seen_at: now,
    last_failure_at: null,
    last_failure_code: null,
  };

  const { data: endpointRows, error: endpointLookupError } = await adminSupabase
    .from("push_subscriptions")
    .select("id, account_owner_user_id, user_id, is_active, updated_at")
    .eq("endpoint", endpoint);

  if (endpointLookupError) throw endpointLookupError;

  const matchingRows = ((endpointRows ?? []) as EndpointOwnershipRow[]).filter(
    (row) =>
      cleanText(row.account_owner_user_id) === context.accountOwnerUserId &&
      cleanText(row.user_id) === context.userId,
  );

  const canonicalRow = [...matchingRows].sort((left, right) => {
    const leftActive = left.is_active ? 1 : 0;
    const rightActive = right.is_active ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;
    return cleanText(right.updated_at).localeCompare(cleanText(left.updated_at));
  })[0];

  const rowsToDeactivate = ((endpointRows ?? []) as EndpointOwnershipRow[]).filter((row) => {
    if (!row.is_active) return false;

    const rowAccountOwnerUserId = cleanText(row.account_owner_user_id);
    const rowUserId = cleanText(row.user_id);
    const isCurrentOwnerRow =
      rowAccountOwnerUserId === context.accountOwnerUserId && rowUserId === context.userId;

    if (!isCurrentOwnerRow) return true;
    return canonicalRow ? cleanText(row.id) !== cleanText(canonicalRow.id) : false;
  });

  for (const row of rowsToDeactivate) {
    const rowId = cleanText(row.id);
    if (!rowId) continue;

    const { error: deactivateError } = await adminSupabase
      .from("push_subscriptions")
      .update({
        is_active: false,
        last_seen_at: now,
      })
      .eq("id", rowId)
      .eq("endpoint", endpoint)
      .eq("is_active", true);

    if (deactivateError) throw deactivateError;
  }

  const existingId = cleanText(canonicalRow?.id);
  if (existingId) {
    const { data, error } = await context.supabase
      .from("push_subscriptions")
      .update(basePatch)
      .eq("account_owner_user_id", context.accountOwnerUserId)
      .eq("user_id", context.userId)
      .eq("id", existingId)
      .select(SAFE_PUSH_SUBSCRIPTION_SELECT)
      .single();

    if (error) throw error;
    return { status: "updated", subscription: mapSafeRow(data) };
  }

  const { data, error } = await context.supabase
    .from("push_subscriptions")
    .insert({
      account_owner_user_id: context.accountOwnerUserId,
      user_id: context.userId,
      endpoint,
      ...basePatch,
    })
    .select(SAFE_PUSH_SUBSCRIPTION_SELECT)
    .single();

  if (error) throw error;
  return { status: "registered", subscription: mapSafeRow(data) };
}

export async function deactivateCurrentInternalUserPushSubscription(
  input: DeactivateCurrentUserPushSubscriptionInput,
  params: HelperParams = {},
): Promise<DeactivateResult> {
  const context = await resolveCurrentInternalPushContext(params);
  if (!context) return { deactivated: false, count: 0 };

  const id = cleanText(input.id);
  const endpoint = cleanText(input.endpoint);
  if (!id && !endpoint) return { deactivated: false, count: 0 };

  let query = context.supabase
    .from("push_subscriptions")
    .update({
      is_active: false,
      last_seen_at: new Date().toISOString(),
    })
    .eq("account_owner_user_id", context.accountOwnerUserId)
    .eq("user_id", context.userId)
    .eq("is_active", true);

  query = id ? query.eq("id", id) : query.eq("endpoint", endpoint);

  const { data, error } = await query.select("id");
  if (error) throw error;

  const count = Array.isArray(data) ? data.length : 0;
  return { deactivated: count > 0, count };
}
