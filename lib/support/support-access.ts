import { createAdminClient, createClient } from "@/lib/supabase/server";

export type SupportAccessMode = "read_only" | "write";

export type SupportAuditEventType =
  | "session_started"
  | "session_ended"
  | "access_denied"
  | "account_viewed";

export type SupportAuditOutcome = "allowed" | "denied" | "info";

export type SupportAccessErrorCode =
  | "AUTH_REQUIRED"
  | "SUPPORT_USER_NOT_FOUND"
  | "SUPPORT_USER_INACTIVE"
  | "SUPPORT_GRANT_NOT_FOUND"
  | "SUPPORT_GRANT_INACTIVE"
  | "SUPPORT_GRANT_EXPIRED"
  | "SUPPORT_SESSION_NOT_FOUND"
  | "SUPPORT_SESSION_ACCOUNT_MISMATCH"
  | "SUPPORT_SESSION_SUPPORT_USER_MISMATCH"
  | "SUPPORT_SESSION_INACTIVE"
  | "SUPPORT_SESSION_EXPIRED"
  | "SUPPORT_MODE_DENIED"
  | "SUPPORT_MODE_NOT_ALLOWED_V1";

export class SupportAccessError extends Error {
  code: SupportAccessErrorCode;

  constructor(code: SupportAccessErrorCode, message: string) {
    super(message);
    this.name = "SupportAccessError";
    this.code = code;
    Object.setPrototypeOf(this, SupportAccessError.prototype);
  }
}

export function isSupportAccessError(error: unknown): error is SupportAccessError {
  return error instanceof SupportAccessError;
}

type SupportUserRow = {
  id: string;
  auth_user_id: string;
  display_name: string | null;
  default_access_mode: SupportAccessMode;
  is_active: boolean;
};

type SupportAccountGrantRow = {
  id: string;
  support_user_id: string;
  account_owner_user_id: string;
  access_mode: SupportAccessMode;
  status: "active" | "inactive" | "revoked";
  starts_at: string;
  expires_at: string | null;
};

type SupportAccessSessionRow = {
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

export type ResolvedSupportAccessContext = {
  actorUserId: string;
  supportUserId: string;
  supportDisplayName: string | null;
  accountOwnerUserId: string;
  supportAccountGrantId: string;
  supportAccessSessionId: string;
  accessMode: "read_only";
};

export type ResolveSupportAccessContextInput = {
  accountOwnerUserId: string;
  supportAccessSessionId: string;
  requestedMode?: SupportAccessMode;
  now?: Date;
  supabase?: any;
  admin?: any;
  userId?: string | null;
};

export type SupportAccessAuditPayload = {
  support_user_id: string | null;
  account_owner_user_id: string | null;
  support_access_session_id: string | null;
  event_type: SupportAuditEventType;
  outcome: SupportAuditOutcome;
  reason_code: string | null;
  metadata: Record<string, unknown>;
};

export type RecordSupportAccessAuditEventInput = {
  supportUserId?: string | null;
  accountOwnerUserId?: string | null;
  supportAccessSessionId?: string | null;
  eventType: SupportAuditEventType;
  outcome?: SupportAuditOutcome;
  reasonCode?: string | null;
  metadata?: Record<string, unknown>;
  admin?: any;
};

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

function modeRank(mode: SupportAccessMode): number {
  return mode === "write" ? 2 : 1;
}

async function resolveActorUserId(input: { supabase: any; userId?: string | null }): Promise<string> {
  const explicitUserId = String(input.userId ?? "").trim();
  if (explicitUserId) return explicitUserId;

  const {
    data: { user },
    error,
  } = await input.supabase.auth.getUser();

  if (error) throw error;

  const actorUserId = String(user?.id ?? "").trim();
  if (!actorUserId) {
    throw new SupportAccessError("AUTH_REQUIRED", "Authentication required for support access.");
  }

  return actorUserId;
}

async function getSupportUserByAuthUserId(admin: any, authUserId: string): Promise<SupportUserRow | null> {
  const { data, error } = await admin
    .from("support_users")
    .select("id, auth_user_id, display_name, default_access_mode, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return {
    id: String(data.id),
    auth_user_id: String(data.auth_user_id),
    display_name: String(data.display_name ?? "").trim() || null,
    default_access_mode: normalizeMode(data.default_access_mode),
    is_active: Boolean(data.is_active),
  };
}

async function getLatestSupportGrant(admin: any, params: {
  supportUserId: string;
  accountOwnerUserId: string;
}): Promise<SupportAccountGrantRow | null> {
  const { data, error } = await admin
    .from("support_account_grants")
    .select("id, support_user_id, account_owner_user_id, access_mode, status, starts_at, expires_at")
    .eq("support_user_id", params.supportUserId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return {
    id: String(data.id),
    support_user_id: String(data.support_user_id),
    account_owner_user_id: String(data.account_owner_user_id),
    access_mode: normalizeMode(data.access_mode),
    status: String(data.status ?? "inactive").trim().toLowerCase() as SupportAccountGrantRow["status"],
    starts_at: String(data.starts_at ?? ""),
    expires_at: String(data.expires_at ?? "").trim() || null,
  };
}

async function getSupportSessionById(admin: any, sessionId: string): Promise<SupportAccessSessionRow | null> {
  const { data, error } = await admin
    .from("support_access_sessions")
    .select("id, support_user_id, support_account_grant_id, account_owner_user_id, access_mode, status, started_at, expires_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return {
    id: String(data.id),
    support_user_id: String(data.support_user_id),
    support_account_grant_id: String(data.support_account_grant_id),
    account_owner_user_id: String(data.account_owner_user_id),
    access_mode: normalizeMode(data.access_mode),
    status: String(data.status ?? "inactive").trim().toLowerCase() as SupportAccessSessionRow["status"],
    started_at: String(data.started_at ?? ""),
    expires_at: String(data.expires_at ?? ""),
    ended_at: String(data.ended_at ?? "").trim() || null,
  };
}

export async function resolveSupportAccessContext(
  input: ResolveSupportAccessContextInput,
): Promise<ResolvedSupportAccessContext> {
  const accountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  const supportAccessSessionId = String(input.supportAccessSessionId ?? "").trim();
  const requestedMode = normalizeMode(input.requestedMode ?? "read_only");
  const now = input.now ?? new Date();

  if (requestedMode !== "read_only") {
    throw new SupportAccessError(
      "SUPPORT_MODE_NOT_ALLOWED_V1",
      "Support mutation mode is not allowed in V1.",
    );
  }

  if (!accountOwnerUserId) {
    throw new SupportAccessError("SUPPORT_GRANT_NOT_FOUND", "Missing account owner scope for support access.");
  }

  if (!supportAccessSessionId) {
    throw new SupportAccessError("SUPPORT_SESSION_NOT_FOUND", "Missing support access session.");
  }

  const supabase = input.supabase ?? (await createClient());
  const admin = input.admin ?? createAdminClient();

  const actorUserId = await resolveActorUserId({ supabase, userId: input.userId });
  const supportUser = await getSupportUserByAuthUserId(admin, actorUserId);

  if (!supportUser) {
    throw new SupportAccessError("SUPPORT_USER_NOT_FOUND", "Authenticated user is not a support user.");
  }

  if (!supportUser.is_active) {
    throw new SupportAccessError("SUPPORT_USER_INACTIVE", "Support user is inactive.");
  }

  const grant = await getLatestSupportGrant(admin, {
    supportUserId: supportUser.id,
    accountOwnerUserId,
  });

  if (!grant) {
    throw new SupportAccessError("SUPPORT_GRANT_NOT_FOUND", "No support grant exists for this account.");
  }

  const grantStartsAt = toIsoDateOrNull(grant.starts_at);
  const grantExpiresAt = toIsoDateOrNull(grant.expires_at);

  if (grant.status !== "active") {
    throw new SupportAccessError("SUPPORT_GRANT_INACTIVE", "Support grant is inactive.");
  }

  if (grantStartsAt && grantStartsAt.getTime() > now.getTime()) {
    throw new SupportAccessError("SUPPORT_GRANT_INACTIVE", "Support grant is not active yet.");
  }

  if (grantExpiresAt && grantExpiresAt.getTime() <= now.getTime()) {
    throw new SupportAccessError("SUPPORT_GRANT_EXPIRED", "Support grant has expired.");
  }

  if (modeRank(requestedMode) > modeRank(grant.access_mode)) {
    throw new SupportAccessError("SUPPORT_MODE_DENIED", "Requested support mode is not allowed by grant.");
  }

  const session = await getSupportSessionById(admin, supportAccessSessionId);

  if (!session) {
    throw new SupportAccessError("SUPPORT_SESSION_NOT_FOUND", "Support session was not found.");
  }

  if (session.support_user_id !== supportUser.id) {
    throw new SupportAccessError(
      "SUPPORT_SESSION_SUPPORT_USER_MISMATCH",
      "Support session does not belong to the authenticated support user.",
    );
  }

  if (session.account_owner_user_id !== accountOwnerUserId) {
    throw new SupportAccessError(
      "SUPPORT_SESSION_ACCOUNT_MISMATCH",
      "Support session account does not match requested account scope.",
    );
  }

  if (session.support_account_grant_id !== grant.id) {
    throw new SupportAccessError(
      "SUPPORT_GRANT_INACTIVE",
      "Support session is not bound to the current active grant.",
    );
  }

  if (session.status !== "active" || session.ended_at) {
    throw new SupportAccessError("SUPPORT_SESSION_INACTIVE", "Support session is not active.");
  }

  const sessionExpiresAt = toIsoDateOrNull(session.expires_at);
  if (!sessionExpiresAt || sessionExpiresAt.getTime() <= now.getTime()) {
    throw new SupportAccessError("SUPPORT_SESSION_EXPIRED", "Support session has expired.");
  }

  if (modeRank(requestedMode) > modeRank(session.access_mode)) {
    throw new SupportAccessError("SUPPORT_MODE_DENIED", "Requested support mode is not allowed by session.");
  }

  return {
    actorUserId,
    supportUserId: supportUser.id,
    supportDisplayName: supportUser.display_name,
    accountOwnerUserId,
    supportAccountGrantId: grant.id,
    supportAccessSessionId: session.id,
    accessMode: "read_only",
  };
}

export function buildSupportAccessAuditPayload(
  input: RecordSupportAccessAuditEventInput,
): SupportAccessAuditPayload {
  return {
    support_user_id: String(input.supportUserId ?? "").trim() || null,
    account_owner_user_id: String(input.accountOwnerUserId ?? "").trim() || null,
    support_access_session_id: String(input.supportAccessSessionId ?? "").trim() || null,
    event_type: input.eventType,
    outcome: input.outcome ?? "info",
    reason_code: String(input.reasonCode ?? "").trim() || null,
    metadata: input.metadata ?? {},
  };
}

export async function recordSupportAccessAuditEvent(
  input: RecordSupportAccessAuditEventInput,
): Promise<SupportAccessAuditPayload> {
  const payload = buildSupportAccessAuditPayload(input);
  const admin = input.admin ?? createAdminClient();

  const { error } = await admin
    .from("support_access_audit_events")
    .insert(payload);

  if (error) throw error;
  return payload;
}
