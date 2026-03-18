import { requireInternalUser } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

export type AssignableInternalUser = {
  user_id: string;
  role: "admin" | "office" | "tech";
  is_active: boolean;
  full_name: string | null;
  email: string | null;
  display_name: string;
};

function toDisplayName(input: { full_name?: unknown; email?: unknown }) {
  const fullName = String(input.full_name ?? "").trim();
  if (fullName) return fullName;

  const email = String(input.email ?? "").trim();
  if (email) return email;

  return "User";
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

  let profileById = new Map<string, { full_name: string | null; email: string | null }>();

  if (userIds.length) {
    const { data: profiles, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    if (profileErr) throw profileErr;

    profileById = new Map(
      (profiles ?? []).map((p: any) => [
        String(p?.id ?? ""),
        {
          full_name: p?.full_name ? String(p.full_name) : null,
          email: p?.email ? String(p.email) : null,
        },
      ]),
    );
  }

  const rows: AssignableInternalUser[] = (internalRows ?? []).map((row: any) => {
    const userId = String(row?.user_id ?? "");
    const profile = profileById.get(userId);
    const fullName = profile?.full_name ?? null;
    const email = profile?.email ?? null;

    return {
      user_id: userId,
      role: row?.role,
      is_active: Boolean(row?.is_active),
      full_name: fullName,
      email,
      display_name: toDisplayName({ full_name: fullName, email }),
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

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (error) throw error;

  const profileById = new Map<string, { full_name: string | null; email: string | null }>(
    (profiles ?? []).map((p: any) => [
      String(p?.id ?? ""),
      {
        full_name: p?.full_name ? String(p.full_name) : null,
        email: p?.email ? String(p.email) : null,
      },
    ]),
  );

  const map: Record<string, string> = {};
  for (const userId of userIds) {
    const profile = profileById.get(userId);
    map[userId] = toDisplayName({
      full_name: profile?.full_name,
      email: profile?.email,
    });
  }

  return map;
}
