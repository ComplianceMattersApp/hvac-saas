import { createAdminClient } from "@/lib/supabase/server";
import {
  isSupportAccessError,
  recordSupportAccessAuditEvent,
  resolveSupportAccessContext,
  type SupportAccessMode,
} from "@/lib/support/support-access";

export type SupportConsoleErrorCode =
  | "INVALID_TARGET_ACCOUNT_OWNER"
  | "SUPPORT_REASON_REQUIRED"
  | "SUPPORT_USER_NOT_FOUND"
  | "SUPPORT_USER_INACTIVE"
  | "SUPPORT_GRANT_NOT_FOUND"
  | "SUPPORT_GRANT_INACTIVE"
  | "SUPPORT_GRANT_EXPIRED"
  | "SUPPORT_MODE_NOT_ALLOWED_V1"
  | "SUPPORT_SESSION_NOT_FOUND"
  | "SUPPORT_SESSION_INACTIVE";

export class SupportConsoleError extends Error {
  code: SupportConsoleErrorCode;

  constructor(code: SupportConsoleErrorCode, message: string) {
    super(message);
    this.name = "SupportConsoleError";
    this.code = code;
    Object.setPrototypeOf(this, SupportConsoleError.prototype);
  }
}

export function isSupportConsoleError(error: unknown): error is SupportConsoleError {
  return error instanceof SupportConsoleError;
}

type SupportUserRow = {
  id: string;
  auth_user_id: string;
  display_name: string | null;
  default_access_mode: SupportAccessMode;
  is_active: boolean;
};

type SupportGrantStatus = {
  id: string;
  support_user_id: string;
  account_owner_user_id: string;
  access_mode: SupportAccessMode;
  status: "active" | "inactive" | "revoked";
  starts_at: string;
  expires_at: string | null;
  created_at: string;
};

export type SupportSessionStatus = {
  id: string;
  support_user_id: string;
  support_account_grant_id: string;
  account_owner_user_id: string;
  access_mode: SupportAccessMode;
  status: "active" | "ended" | "expired" | "revoked";
  started_at: string;
  expires_at: string;
  ended_at: string | null;
};

export type SupportAuditEventStatus = {
  id: string;
  support_user_id: string | null;
  account_owner_user_id: string | null;
  support_access_session_id: string | null;
  event_type: "session_started" | "session_ended" | "access_denied" | "account_viewed";
  outcome: "allowed" | "denied" | "info";
  reason_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SupportConsoleSnapshot = {
  operator: {
    authUserId: string;
    supportUserId: string | null;
    displayName: string | null;
    isSupportUserActive: boolean;
  };
  accountOwnerUserId: string | null;
  grant: SupportGrantStatus | null;
  session: SupportSessionStatus | null;
  recentAuditEvents: SupportAuditEventStatus[];
};

export type SupportOperatorStatus = {
  authUserId: string;
  supportUserId: string | null;
  displayName: string | null;
  isSupportUserActive: boolean;
};

export type StartReadOnlySupportSessionInput = {
  actorUserId: string;
  accountOwnerUserId: string;
  operatorReason: string;
  reasonCategory?: string | null;
  now?: Date;
  sessionDurationMinutes?: number;
  admin?: any;
};

export type EndSupportSessionInput = {
  actorUserId: string;
  accountOwnerUserId: string;
  supportAccessSessionId: string;
  now?: Date;
  admin?: any;
};

const DEFAULT_SESSION_DURATION_MINUTES = 30;
const SUPPORT_CONSOLE_ROUTE = "/ops/admin/users/support";
const ACCOUNT_VIEWED_COOLDOWN_MS = 60 * 1000;

function toIsoDateOrNull(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function normalizeMode(value: unknown): SupportAccessMode {
  return String(value ?? "").trim().toLowerCase() === "write" ? "write" : "read_only";
}

function asSupportUserRow(row: any): SupportUserRow {
  return {
    id: String(row.id),
    auth_user_id: String(row.auth_user_id),
    display_name: String(row.display_name ?? "").trim() || null,
    default_access_mode: normalizeMode(row.default_access_mode),
    is_active: Boolean(row.is_active),
  };
}

function asSupportGrantRow(row: any): SupportGrantStatus {
  return {
    id: String(row.id),
    support_user_id: String(row.support_user_id),
    account_owner_user_id: String(row.account_owner_user_id),
    access_mode: normalizeMode(row.access_mode),
    status: String(row.status ?? "inactive").trim().toLowerCase() as SupportGrantStatus["status"],
    starts_at: String(row.starts_at ?? ""),
    expires_at: String(row.expires_at ?? "").trim() || null,
    created_at: String(row.created_at ?? ""),
  };
}

function asSupportSessionRow(row: any): SupportSessionStatus {
  return {
    id: String(row.id),
    support_user_id: String(row.support_user_id),
    support_account_grant_id: String(row.support_account_grant_id),
    account_owner_user_id: String(row.account_owner_user_id),
    access_mode: normalizeMode(row.access_mode),
    status: String(row.status ?? "inactive").trim().toLowerCase() as SupportSessionStatus["status"],
    started_at: String(row.started_at ?? ""),
    expires_at: String(row.expires_at ?? ""),
    ended_at: String(row.ended_at ?? "").trim() || null,
  };
}

function asSupportAuditEventRow(row: any): SupportAuditEventStatus {
  return {
    id: String(row.id),
    support_user_id: String(row.support_user_id ?? "").trim() || null,
    account_owner_user_id: String(row.account_owner_user_id ?? "").trim() || null,
    support_access_session_id: String(row.support_access_session_id ?? "").trim() || null,
    event_type: String(row.event_type ?? "access_denied").trim().toLowerCase() as SupportAuditEventStatus["event_type"],
    outcome: String(row.outcome ?? "info").trim().toLowerCase() as SupportAuditEventStatus["outcome"],
    reason_code: String(row.reason_code ?? "").trim() || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    created_at: String(row.created_at ?? ""),
  };
}

function clampSessionExpiry(args: {
  now: Date;
  sessionDurationMinutes: number;
  grantExpiresAt: Date | null;
}): Date {
  const baseExpiry = new Date(args.now.getTime() + Math.max(1, args.sessionDurationMinutes) * 60 * 1000);
  if (!args.grantExpiresAt) return baseExpiry;
  return args.grantExpiresAt.getTime() < baseExpiry.getTime() ? args.grantExpiresAt : baseExpiry;
}

async function getSupportUserByAuthUserId(admin: any, authUserId: string): Promise<SupportUserRow | null> {
  const { data, error } = await admin
    .from("support_users")
    .select("id, auth_user_id, display_name, default_access_mode, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;
  return asSupportUserRow(data);
}

async function getLatestGrant(admin: any, params: {
  supportUserId: string;
  accountOwnerUserId: string;
}): Promise<SupportGrantStatus | null> {
  const { data, error } = await admin
    .from("support_account_grants")
    .select("id, support_user_id, account_owner_user_id, access_mode, status, starts_at, expires_at, created_at")
    .eq("support_user_id", params.supportUserId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;
  return asSupportGrantRow(data);
}

async function getLatestActiveSession(admin: any, params: {
  supportUserId: string;
  accountOwnerUserId: string;
}): Promise<SupportSessionStatus | null> {
  const { data, error } = await admin
    .from("support_access_sessions")
    .select("id, support_user_id, support_account_grant_id, account_owner_user_id, access_mode, status, started_at, expires_at, ended_at")
    .eq("support_user_id", params.supportUserId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("status", "active")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;
  return asSupportSessionRow(data);
}

async function listRecentAuditEvents(admin: any, params: {
  accountOwnerUserId?: string | null;
  supportAccessSessionId?: string | null;
  limit?: number;
}): Promise<SupportAuditEventStatus[]> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const supportAccessSessionId = String(params.supportAccessSessionId ?? "").trim();
  const limit = Math.min(Math.max(Number(params.limit ?? 15) || 15, 1), 50);

  if (!accountOwnerUserId && !supportAccessSessionId) return [];

  let query = admin
    .from("support_access_audit_events")
    .select("id, support_user_id, account_owner_user_id, support_access_session_id, event_type, outcome, reason_code, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (supportAccessSessionId) {
    query = query.eq("support_access_session_id", supportAccessSessionId);
  } else if (accountOwnerUserId) {
    query = query.eq("account_owner_user_id", accountOwnerUserId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(asSupportAuditEventRow);
}

async function writeDeniedAuditEvent(input: {
  admin: any;
  supportUserId?: string | null;
  accountOwnerUserId?: string | null;
  supportAccessSessionId?: string | null;
  reasonCode: string;
  metadata?: Record<string, unknown>;
}) {
  await recordSupportAccessAuditEvent({
    admin: input.admin,
    supportUserId: input.supportUserId ?? null,
    accountOwnerUserId: input.accountOwnerUserId ?? null,
    supportAccessSessionId: input.supportAccessSessionId ?? null,
    eventType: "access_denied",
    outcome: "denied",
    reasonCode: input.reasonCode,
    metadata: input.metadata ?? {},
  });
}

export async function getSupportOperatorStatus(input: {
  actorUserId: string;
  admin?: any;
}): Promise<SupportOperatorStatus> {
  const admin = input.admin ?? createAdminClient();
  const actorUserId = String(input.actorUserId ?? "").trim();
  const supportUser = actorUserId ? await getSupportUserByAuthUserId(admin, actorUserId) : null;

  return {
    authUserId: actorUserId,
    supportUserId: supportUser?.id ?? null,
    displayName: supportUser?.display_name ?? null,
    isSupportUserActive: Boolean(supportUser?.is_active),
  };
}

async function hasRecentAccountViewedEvent(input: {
  admin: any;
  supportUserId: string;
  accountOwnerUserId: string;
  now: Date;
  cooldownMs?: number;
}): Promise<boolean> {
  const cooldownMs = Math.max(1000, Number(input.cooldownMs ?? ACCOUNT_VIEWED_COOLDOWN_MS));

  const { data, error } = await input.admin
    .from("support_access_audit_events")
    .select("id, created_at")
    .eq("event_type", "account_viewed")
    .eq("support_user_id", input.supportUserId)
    .eq("account_owner_user_id", input.accountOwnerUserId)
    .contains("metadata", { route: SUPPORT_CONSOLE_ROUTE })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const createdAt = toIsoDateOrNull(String(data?.created_at ?? "").trim() || null);
  if (!createdAt) return false;

  return input.now.getTime() - createdAt.getTime() < cooldownMs;
}

async function recordAccountViewedAuditEvent(input: {
  admin: any;
  supportUserId: string;
  accountOwnerUserId: string;
  now: Date;
}) {
  const isDuplicate = await hasRecentAccountViewedEvent({
    admin: input.admin,
    supportUserId: input.supportUserId,
    accountOwnerUserId: input.accountOwnerUserId,
    now: input.now,
  });

  if (isDuplicate) return;

  await recordSupportAccessAuditEvent({
    admin: input.admin,
    supportUserId: input.supportUserId,
    accountOwnerUserId: input.accountOwnerUserId,
    eventType: "account_viewed",
    outcome: "info",
    reasonCode: null,
    metadata: {
      source: "support_console_v1b",
      route: SUPPORT_CONSOLE_ROUTE,
    },
  });
}

export async function getSupportConsoleSnapshot(input: {
  actorUserId: string;
  accountOwnerUserId?: string | null;
  now?: Date;
  admin?: any;
}): Promise<SupportConsoleSnapshot> {
  const admin = input.admin ?? createAdminClient();
  const actorUserId = String(input.actorUserId ?? "").trim();
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim() || null;

  const now = input.now ?? new Date();
  const operator = await getSupportOperatorStatus({ actorUserId, admin });

  let grant: SupportGrantStatus | null = null;
  let session: SupportSessionStatus | null = null;
  let recentAuditEvents: SupportAuditEventStatus[] = [];

  if (operator.supportUserId && operator.isSupportUserActive && accountOwnerUserId) {
    grant = await getLatestGrant(admin, {
      supportUserId: operator.supportUserId,
      accountOwnerUserId,
    });

    session = await getLatestActiveSession(admin, {
      supportUserId: operator.supportUserId,
      accountOwnerUserId,
    });

    await recordAccountViewedAuditEvent({
      admin,
      supportUserId: operator.supportUserId,
      accountOwnerUserId,
      now,
    });

    recentAuditEvents = await listRecentAuditEvents(admin, {
      accountOwnerUserId,
      supportAccessSessionId: session?.id ?? null,
    });
  }

  return {
    operator,
    accountOwnerUserId,
    grant,
    session,
    recentAuditEvents,
  };
}

export async function startReadOnlySupportSession(
  input: StartReadOnlySupportSessionInput,
): Promise<SupportSessionStatus> {
  const admin = input.admin ?? createAdminClient();
  const actorUserId = String(input.actorUserId ?? "").trim();
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  const operatorReason = String(input.operatorReason ?? "").trim();
  const reasonCategory = String(input.reasonCategory ?? "").trim() || null;
  const now = input.now ?? new Date();
  const sessionDurationMinutes = Number(input.sessionDurationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES);

  if (!accountOwnerUserId) {
    throw new SupportConsoleError("INVALID_TARGET_ACCOUNT_OWNER", "Target account owner is required.");
  }

  if (!operatorReason) {
    throw new SupportConsoleError("SUPPORT_REASON_REQUIRED", "Support session reason is required.");
  }

  const supportUser = await getSupportUserByAuthUserId(admin, actorUserId);
  if (!supportUser) {
    await writeDeniedAuditEvent({
      admin,
      accountOwnerUserId,
      reasonCode: "SUPPORT_USER_NOT_FOUND",
      metadata: { source: "support_console_v1b", actorUserId },
    });
    throw new SupportConsoleError("SUPPORT_USER_NOT_FOUND", "Authenticated user is not a support user.");
  }

  if (!supportUser.is_active) {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      reasonCode: "SUPPORT_USER_INACTIVE",
      metadata: { source: "support_console_v1b", actorUserId },
    });
    throw new SupportConsoleError("SUPPORT_USER_INACTIVE", "Support user is inactive.");
  }

  const grant = await getLatestGrant(admin, {
    supportUserId: supportUser.id,
    accountOwnerUserId,
  });

  if (!grant) {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      reasonCode: "SUPPORT_GRANT_NOT_FOUND",
      metadata: { source: "support_console_v1b" },
    });
    throw new SupportConsoleError("SUPPORT_GRANT_NOT_FOUND", "No support grant exists for this account.");
  }

  const grantStartsAt = toIsoDateOrNull(grant.starts_at);
  const grantExpiresAt = toIsoDateOrNull(grant.expires_at);

  if (grant.status !== "active" || (grantStartsAt && grantStartsAt.getTime() > now.getTime())) {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      reasonCode: "SUPPORT_GRANT_INACTIVE",
      metadata: { source: "support_console_v1b", supportAccountGrantId: grant.id },
    });
    throw new SupportConsoleError("SUPPORT_GRANT_INACTIVE", "Support grant is inactive.");
  }

  if (grant.access_mode !== "read_only") {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      reasonCode: "SUPPORT_MODE_NOT_ALLOWED_V1",
      metadata: { source: "support_console_v1b", supportAccountGrantId: grant.id, grantAccessMode: grant.access_mode },
    });
    throw new SupportConsoleError("SUPPORT_MODE_NOT_ALLOWED_V1", "V1 support sessions must be read-only.");
  }

  if (grantExpiresAt && grantExpiresAt.getTime() <= now.getTime()) {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      reasonCode: "SUPPORT_GRANT_EXPIRED",
      metadata: { source: "support_console_v1b", supportAccountGrantId: grant.id },
    });
    throw new SupportConsoleError("SUPPORT_GRANT_EXPIRED", "Support grant has expired.");
  }

  const existingSession = await getLatestActiveSession(admin, {
    supportUserId: supportUser.id,
    accountOwnerUserId,
  });

  const existingExpiresAt = toIsoDateOrNull(existingSession?.expires_at ?? null);
  if (existingSession?.id && existingExpiresAt && existingExpiresAt.getTime() > now.getTime()) {
    await resolveSupportAccessContext({
      admin,
      userId: actorUserId,
      accountOwnerUserId,
      supportAccessSessionId: existingSession.id,
      requestedMode: "read_only",
      now,
    });

    return existingSession;
  }

  const expiresAt = clampSessionExpiry({
    now,
    sessionDurationMinutes,
    grantExpiresAt,
  });

  if (expiresAt.getTime() <= now.getTime()) {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      reasonCode: "SUPPORT_GRANT_EXPIRED",
      metadata: { source: "support_console_v1b", supportAccountGrantId: grant.id },
    });
    throw new SupportConsoleError("SUPPORT_GRANT_EXPIRED", "Support grant does not allow a valid session window.");
  }

  const { data: inserted, error: insertError } = await admin
    .from("support_access_sessions")
    .insert({
      support_user_id: supportUser.id,
      support_account_grant_id: grant.id,
      account_owner_user_id: accountOwnerUserId,
      access_mode: "read_only",
      status: "active",
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      started_by_user_id: actorUserId,
      ended_at: null,
      ended_reason: null,
      ended_by_user_id: null,
    })
    .select("id, support_user_id, support_account_grant_id, account_owner_user_id, access_mode, status, started_at, expires_at, ended_at")
    .single();

  if (insertError) throw insertError;
  const session = asSupportSessionRow(inserted);

  await resolveSupportAccessContext({
    admin,
    userId: actorUserId,
    accountOwnerUserId,
    supportAccessSessionId: session.id,
    requestedMode: "read_only",
    now,
  });

  await recordSupportAccessAuditEvent({
    admin,
    supportUserId: supportUser.id,
    accountOwnerUserId,
    supportAccessSessionId: session.id,
    eventType: "session_started",
    outcome: "allowed",
    reasonCode: null,
    metadata: {
      source: "support_console_v1b",
      supportAccountGrantId: grant.id,
      sessionExpiresAt: session.expires_at,
      operator_reason: operatorReason,
      reason_category: reasonCategory,
    },
  });

  return session;
}

export async function endSupportSession(
  input: EndSupportSessionInput,
): Promise<SupportSessionStatus> {
  const admin = input.admin ?? createAdminClient();
  const actorUserId = String(input.actorUserId ?? "").trim();
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  const supportAccessSessionId = String(input.supportAccessSessionId ?? "").trim();
  const now = input.now ?? new Date();

  if (!accountOwnerUserId) {
    throw new SupportConsoleError("INVALID_TARGET_ACCOUNT_OWNER", "Target account owner is required.");
  }

  if (!supportAccessSessionId) {
    throw new SupportConsoleError("SUPPORT_SESSION_NOT_FOUND", "Support session is required.");
  }

  const supportUser = await getSupportUserByAuthUserId(admin, actorUserId);
  if (!supportUser) {
    await writeDeniedAuditEvent({
      admin,
      accountOwnerUserId,
      supportAccessSessionId,
      reasonCode: "SUPPORT_USER_NOT_FOUND",
      metadata: { source: "support_console_v1b", actorUserId },
    });
    throw new SupportConsoleError("SUPPORT_USER_NOT_FOUND", "Authenticated user is not a support user.");
  }

  if (!supportUser.is_active) {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      supportAccessSessionId,
      reasonCode: "SUPPORT_USER_INACTIVE",
      metadata: { source: "support_console_v1b", actorUserId },
    });
    throw new SupportConsoleError("SUPPORT_USER_INACTIVE", "Support user is inactive.");
  }

  try {
    await resolveSupportAccessContext({
      admin,
      userId: actorUserId,
      accountOwnerUserId,
      supportAccessSessionId,
      requestedMode: "read_only",
      now,
    });
  } catch (error) {
    if (isSupportAccessError(error)) {
      await writeDeniedAuditEvent({
        admin,
        supportUserId: supportUser.id,
        accountOwnerUserId,
        supportAccessSessionId,
        reasonCode: error.code,
        metadata: { source: "support_console_v1b", action: "end_session" },
      });

      if (error.code === "SUPPORT_SESSION_NOT_FOUND") {
        throw new SupportConsoleError("SUPPORT_SESSION_NOT_FOUND", error.message);
      }

      throw new SupportConsoleError("SUPPORT_SESSION_INACTIVE", error.message);
    }

    throw error;
  }

  const { data: ended, error: endError } = await admin
    .from("support_access_sessions")
    .update({
      status: "ended",
      ended_at: now.toISOString(),
      ended_reason: "ended_by_support_operator",
      ended_by_user_id: actorUserId,
      updated_at: now.toISOString(),
    })
    .eq("id", supportAccessSessionId)
    .eq("support_user_id", supportUser.id)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("status", "active")
    .is("ended_at", null)
    .select("id, support_user_id, support_account_grant_id, account_owner_user_id, access_mode, status, started_at, expires_at, ended_at")
    .maybeSingle();

  if (endError) throw endError;

  if (!ended?.id) {
    await writeDeniedAuditEvent({
      admin,
      supportUserId: supportUser.id,
      accountOwnerUserId,
      supportAccessSessionId,
      reasonCode: "SUPPORT_SESSION_INACTIVE",
      metadata: { source: "support_console_v1b", action: "end_session" },
    });
    throw new SupportConsoleError("SUPPORT_SESSION_INACTIVE", "Support session is not active.");
  }

  const endedSession = asSupportSessionRow(ended);

  await recordSupportAccessAuditEvent({
    admin,
    supportUserId: supportUser.id,
    accountOwnerUserId,
    supportAccessSessionId,
    eventType: "session_ended",
    outcome: "allowed",
    reasonCode: null,
    metadata: {
      source: "support_console_v1b",
      endedAt: endedSession.ended_at,
    },
  });

  return endedSession;
}
