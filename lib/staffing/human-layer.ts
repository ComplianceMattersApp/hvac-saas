import { requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveHumanDisplayName } from "@/lib/utils/identity-display";

export type AssignableInternalUser = {
  user_id: string;
  role: "admin" | "office" | "tech";
  is_active: boolean;
  full_name: string | null;
  email: string | null;
  display_name: string;
};

function toDisplayName(input: { full_name?: unknown; email?: unknown }) {
  return resolveHumanDisplayName({
    profileFullName: input.full_name,
    email: input.email,
    fallback: "User",
  });
}

type IdentitySource = {
  full_name: string | null;
  email: string | null;
  metadata_name?: string | null;
  metadata_full_name?: string | null;
  metadata_first_name?: string | null;
  metadata_last_name?: string | null;
  metadata_given_name?: string | null;
};

function identityDisplayName(input: IdentitySource) {
  return resolveHumanDisplayName({
    profileFullName: input.full_name,
    metadataName: input.metadata_name,
    metadataFullName: input.metadata_full_name,
    metadataFirstName: input.metadata_first_name,
    metadataLastName: input.metadata_last_name,
    metadataGivenName: input.metadata_given_name,
    email: input.email,
    fallback: "User",
  });
}

async function resolveIdentitySourceMap(params: {
  userIds: string[];
  supabase?: any;
}): Promise<Map<string, IdentitySource>> {
  const supabase = params.supabase ?? (await createClient());
  const userIds = Array.from(
    new Set(
      (params.userIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const identityById = new Map<string, IdentitySource>();

  if (!userIds.length) return identityById;

  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profileErr) throw profileErr;

  for (const profile of profiles ?? []) {
    const userId = String(profile?.id ?? "").trim();
    if (!userId) continue;

    identityById.set(userId, {
      full_name: profile?.full_name ? String(profile.full_name) : null,
      email: profile?.email ? String(profile.email) : null,
    });
  }

  const unresolvedIds = userIds.filter((userId) => {
    const identity = identityById.get(userId);
    return identityDisplayName(identity ?? { full_name: null, email: null }) === "User";
  });

  if (!unresolvedIds.length) return identityById;

  const admin = createAdminClient();

  for (const userId of unresolvedIds) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) throw error;

    const authUser = data?.user;
    if (!authUser) continue;

    const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const existing = identityById.get(userId) ?? { full_name: null, email: null };

    identityById.set(userId, {
      full_name: existing.full_name,
      email: existing.email ?? (authUser.email ? String(authUser.email).trim() : null),
      metadata_name: metadata.name ? String(metadata.name).trim() : null,
      metadata_full_name: metadata.full_name ? String(metadata.full_name).trim() : null,
      metadata_first_name: metadata.first_name ? String(metadata.first_name).trim() : null,
      metadata_last_name: metadata.last_name ? String(metadata.last_name).trim() : null,
      metadata_given_name: metadata.given_name ? String(metadata.given_name).trim() : null,
    });
  }

  return identityById;
}

async function resolveAccountOwnerScope(params: {
  supabase: any;
  accountOwnerUserId?: string | null;
}) {
  const scoped = String(params.accountOwnerUserId ?? "").trim();
  if (scoped) return scoped;

  const { internalUser } = await requireInternalUser({ supabase: params.supabase });
  return String(internalUser.account_owner_user_id);
}

/**
 * Canonical staffing selector source.
 * Internal membership is the eligibility rule: contractor membership alone
 * never qualifies assignment.
 */
export async function getAssignableInternalUsers(params: {
  supabase?: any;
  accountOwnerUserId?: string | null;
} = {}): Promise<AssignableInternalUser[]> {
  const supabase = params.supabase ?? (await createClient());
  const accountOwnerUserId = await resolveAccountOwnerScope({
    supabase,
    accountOwnerUserId: params.accountOwnerUserId,
  });

  const { data: internalRows, error: internalErr } = await supabase
    .from("internal_users")
    .select("user_id, role, is_active, account_owner_user_id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("is_active", true);

  if (internalErr) throw internalErr;

  const userIds = (internalRows ?? [])
    .map((r: any) => String(r?.user_id ?? "").trim())
    .filter(Boolean);

  const identityById = await resolveIdentitySourceMap({
    supabase,
    userIds,
  });

  const rows: AssignableInternalUser[] = (internalRows ?? []).map((row: any) => {
    const userId = String(row?.user_id ?? "");
    const identity = identityById.get(userId);
    const fullName = identity?.full_name ?? null;
    const email = identity?.email ?? null;

    return {
      user_id: userId,
      role: row?.role,
      is_active: Boolean(row?.is_active),
      full_name: fullName,
      email,
      display_name: identityDisplayName(identity ?? { full_name: fullName, email }),
    } as AssignableInternalUser;
  });

  rows.sort((a: AssignableInternalUser, b: AssignableInternalUser) =>
    a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
  );

  return rows;
}

/**
 * Canonical write-side staffing guard.
 * Valid assignable user = active internal user.
 */
export async function assertAssignableInternalUser(params: {
  userId: string;
  supabase?: any;
  accountOwnerUserId?: string | null;
}) {
  const supabase = params.supabase ?? (await createClient());
  const userId = String(params.userId ?? "").trim();
  if (!userId) throw new Error("MISSING_USER_ID");

  const accountOwnerUserId = params.accountOwnerUserId
    ? String(params.accountOwnerUserId).trim()
    : null;

  let query = supabase
    .from("internal_users")
    .select("user_id, role, is_active, account_owner_user_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (accountOwnerUserId) {
    query = query.eq("account_owner_user_id", accountOwnerUserId);
  }

  const { data: internalRow, error: internalErr } = await query.maybeSingle();

  if (internalErr) throw internalErr;

  if (!internalRow?.user_id) {
    throw new Error("ASSIGNABLE_INTERNAL_USER_REQUIRED");
  }

  return internalRow;
}

/**
 * Batch display-name resolver for events/assignments.
 */
export async function resolveUserDisplayMap(params: {
  userIds: string[];
  supabase?: any;
}): Promise<Record<string, string>> {
  const supabase = params.supabase ?? (await createClient());

  const userIds = Array.from(
    new Set(
      (params.userIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (!userIds.length) return {};

  const identityById = await resolveIdentitySourceMap({
    supabase,
    userIds,
  });

  const map: Record<string, string> = {};
  for (const userId of userIds) {
    const identity = identityById.get(userId) ?? { full_name: null, email: null };
    map[userId] = identityDisplayName(identity);
  }

  return map;
}

export type ActiveJobAssignmentDisplay = {
  job_id: string;
  user_id: string;
  display_name: string;
  is_primary: boolean;
  created_at: string;
};

export async function getActiveJobAssignmentDisplayMap(params: {
  jobIds: string[];
  supabase?: any;
}): Promise<Record<string, ActiveJobAssignmentDisplay[]>> {
  const supabase = params.supabase ?? (await createClient());

  const jobIds = Array.from(
    new Set(
      (params.jobIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (!jobIds.length) return {};

  const { data: rows, error } = await supabase
    .from("job_assignments")
    .select("job_id, user_id, is_primary, created_at")
    .in("job_id", jobIds)
    .eq("is_active", true);

  if (error) throw error;

  const userDisplayMap = await resolveUserDisplayMap({
    supabase,
    userIds: (rows ?? [])
      .map((row: any) => String(row?.user_id ?? "").trim())
      .filter(Boolean),
  });

  const map: Record<string, ActiveJobAssignmentDisplay[]> = {};

  for (const row of rows ?? []) {
    const jobId = String(row?.job_id ?? "").trim();
    const userId = String(row?.user_id ?? "").trim();
    if (!jobId || !userId) continue;

    if (!map[jobId]) map[jobId] = [];

    const resolved = String(userDisplayMap[userId] ?? "").trim();

    map[jobId].push({
      job_id: jobId,
      user_id: userId,
      display_name: resolved && resolved !== "User" ? resolved : "Unknown User",
      is_primary: Boolean(row?.is_primary),
      created_at: String(row?.created_at ?? ""),
    });
  }

  for (const jobId of Object.keys(map)) {
    map[jobId].sort((left, right) => {
      const primaryDiff = Number(right.is_primary) - Number(left.is_primary);
      if (primaryDiff !== 0) return primaryDiff;

      const createdDiff = String(left.created_at).localeCompare(String(right.created_at));
      if (createdDiff !== 0) return createdDiff;

      return left.display_name.localeCompare(right.display_name, undefined, {
        sensitivity: "base",
      });
    });
  }

  return map;
}
