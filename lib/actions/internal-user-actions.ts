"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveInviteRedirectTo } from "@/lib/utils/resolve-invite-redirect-to";
import {
  requireInternalRole,
  type InternalRole,
} from "@/lib/auth/internal-user";

type InternalUserRecord = {
  user_id: string;
  role: InternalRole;
  is_active: boolean;
  account_owner_user_id: string;
  created_by: string | null;
};

function parseInternalRole(raw: FormDataEntryValue | null): InternalRole {
  const role = String(raw ?? "").trim().toLowerCase();

  if (role === "admin" || role === "office" || role === "tech") {
    return role;
  }

  throw new Error("INVALID_INTERNAL_ROLE");
}

function parseInviteRole(raw: FormDataEntryValue | null): InternalRole {
  const role = String(raw ?? "").trim().toLowerCase();

  if (role === "technician") return "tech";
  return parseInternalRole(raw);
}

function revalidateInternalUserViews() {
  revalidatePath("/ops");
  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/internal-users");
  revalidatePath("/ops/admin/users");
  revalidatePath("/account");
  revalidatePath("/");
}

function normalizeText(raw: FormDataEntryValue | null, maxLength = 120) {
  return String(raw ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function normalizePhone(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").replace(/\u0000/g, "").trim();
  return value.slice(0, 40);
}

function buildInternalUserProfileNoticeHref(userId: string, notice: string) {
  return `/ops/admin/internal-users/${encodeURIComponent(userId)}?profile_status=${encodeURIComponent(notice)}`;
}

function isForeignKeyViolation(error: any) {
  return error?.code === "23503";
}

function isUniqueViolation(error: any) {
  return error?.code === "23505";
}

function isAlreadyExistsAuthError(error: any) {
  const msg = String(error?.message ?? "").toLowerCase();
  return msg.includes("already") || msg.includes("exists") || msg.includes("registered");
}

function isInviteRateLimitError(error: any) {
  const code = String(error?.code ?? "").trim().toLowerCase();
  const status = Number(error?.status ?? 0);
  const msg = String(error?.message ?? "").trim().toLowerCase();

  return (
    code === "over_email_send_rate_limit" ||
    status === 429 ||
    msg.includes("rate limit")
  );
}

function normalizeInternalUserRecord(data: any): InternalUserRecord | null {
  if (!data?.user_id || !data?.account_owner_user_id) return null;
  if (data.role !== "admin" && data.role !== "office" && data.role !== "tech") {
    return null;
  }

  return {
    user_id: data.user_id,
    role: data.role,
    is_active: Boolean(data.is_active),
    account_owner_user_id: data.account_owner_user_id,
    created_by: data.created_by ?? null,
  };
}

async function getInternalUserRecord(
  admin: any,
  userId: string,
): Promise<InternalUserRecord | null> {
  const { data, error } = await admin
    .from("internal_users")
    .select("user_id, role, is_active, account_owner_user_id, created_by")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeInternalUserRecord(data);
}

async function getAuthUserIdByEmail(admin: any, email: string): Promise<string | null> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data?.id) return String(data.id);

  // Fallback to auth-admin user lookup so invite flows are not dependent
  // solely on profile row presence/timing.
  let page = 1;

  while (page <= 5) {
    const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (listErr) throw listErr;

    const users = Array.isArray((listed as any)?.users)
      ? (listed as any).users
      : [];

    const match = users.find((u: any) =>
      String(u?.email ?? "").trim().toLowerCase() === normalized,
    );

    if (match?.id) return String(match.id);
    if (users.length < 200) break;
    page += 1;
  }

  return null;
}

async function requireScopedTarget(
  admin: any,
  accountOwnerUserId: string,
  targetUserId: string,
) {
  const target = await getInternalUserRecord(admin, targetUserId);

  if (!target) {
    throw new Error("TARGET_INTERNAL_USER_NOT_FOUND");
  }

  if (target.account_owner_user_id !== accountOwnerUserId) {
    throw new Error("TARGET_ACCOUNT_OWNER_MISMATCH");
  }

  return target;
}

async function assertTargetNotOwnedByDifferentAccount(params: {
  admin: any;
  accountOwnerUserId: string;
  targetUserId: string;
}) {
  const existing = await getInternalUserRecord(params.admin, params.targetUserId);
  if (!existing) return;

  if (existing.account_owner_user_id !== params.accountOwnerUserId) {
    throw new Error("TARGET_ACCOUNT_OWNER_MISMATCH");
  }

  throw new Error("INTERNAL_USER_ALREADY_EXISTS");
}

async function countActiveAdmins(admin: any, accountOwnerUserId: string) {
  const { count, error } = await admin
    .from("internal_users")
    .select("user_id", { count: "exact", head: true })
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("is_active", true)
    .eq("role", "admin");

  if (error) throw error;
  return count ?? 0;
}

async function assertNotLastActiveAdmin(
  admin: any,
  target: InternalUserRecord,
  nextRole: InternalRole,
  nextIsActive: boolean,
) {
  const isLosingAdminAccess =
    target.role === "admin" &&
    target.is_active &&
    (!nextIsActive || nextRole !== "admin");

  if (!isLosingAdminAccess) return;

  const activeAdminCount = await countActiveAdmins(
    admin,
    target.account_owner_user_id,
  );

  if (activeAdminCount <= 1) {
    throw new Error("LAST_ACTIVE_ADMIN");
  }
}

export async function createInternalUserFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    userId: actorUserId,
    internalUser: actorInternalUser,
  } = await requireInternalRole("admin", { supabase });

  const admin = createAdminClient();

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId) {
    throw new Error("MISSING_TARGET_USER_ID");
  }

  const role = parseInternalRole(formData.get("role"));
  await assertTargetNotOwnedByDifferentAccount({
    admin,
    accountOwnerUserId: actorInternalUser.account_owner_user_id,
    targetUserId,
  });

  const { error } = await admin
    .from("internal_users")
    .insert({
      user_id: targetUserId,
      role,
      is_active: true,
      account_owner_user_id: actorInternalUser.account_owner_user_id,
      created_by: actorUserId,
    })
    .select("user_id")
    .single();

  if (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("TARGET_AUTH_USER_NOT_FOUND");
    }

    if (isUniqueViolation(error)) {
      throw new Error("INTERNAL_USER_ALREADY_EXISTS");
    }

    throw error;
  }

  revalidateInternalUserViews();
}

export async function updateInternalUserRoleFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser: actorInternalUser } = await requireInternalRole(
    "admin",
    { supabase },
  );

  const admin = createAdminClient();

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId) {
    throw new Error("MISSING_TARGET_USER_ID");
  }

  const nextRole = parseInternalRole(formData.get("role"));
  const target = await requireScopedTarget(
    admin,
    actorInternalUser.account_owner_user_id,
    targetUserId,
  );

  await assertNotLastActiveAdmin(
    admin,
    target,
    nextRole,
    target.is_active,
  );

  const { error } = await admin
    .from("internal_users")
    .update({ role: nextRole })
    .eq("user_id", targetUserId)
    .eq("account_owner_user_id", actorInternalUser.account_owner_user_id)
    .select("user_id")
    .single();

  if (error) throw error;

  revalidateInternalUserViews();
}

export async function activateInternalUserFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser: actorInternalUser } = await requireInternalRole(
    "admin",
    { supabase },
  );

  const admin = createAdminClient();

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId) {
    throw new Error("MISSING_TARGET_USER_ID");
  }

  await requireScopedTarget(
    admin,
    actorInternalUser.account_owner_user_id,
    targetUserId,
  );

  const { error } = await admin
    .from("internal_users")
    .update({ is_active: true })
    .eq("user_id", targetUserId)
    .eq("account_owner_user_id", actorInternalUser.account_owner_user_id)
    .select("user_id")
    .single();

  if (error) throw error;

  revalidateInternalUserViews();
}

export async function deactivateInternalUserFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser: actorInternalUser } = await requireInternalRole(
    "admin",
    { supabase },
  );

  const admin = createAdminClient();

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId) {
    throw new Error("MISSING_TARGET_USER_ID");
  }

  const target = await requireScopedTarget(
    admin,
    actorInternalUser.account_owner_user_id,
    targetUserId,
  );

  await assertNotLastActiveAdmin(admin, target, target.role, false);

  const { error } = await admin
    .from("internal_users")
    .update({ is_active: false })
    .eq("user_id", targetUserId)
    .eq("account_owner_user_id", actorInternalUser.account_owner_user_id)
    .select("user_id")
    .single();

  if (error) throw error;

  revalidateInternalUserViews();
}

export async function inviteInternalUserFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    userId: actorUserId,
    internalUser: actorInternalUser,
  } = await requireInternalRole("admin", { supabase });

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    redirect("/ops/admin/internal-users?invite_status=invalid_email");
  }

  const role = parseInviteRole(formData.get("role"));
  const admin = createAdminClient();

  let targetUserId: string | null = null;
  let inviteRequested = false;

  const existingAuthUserId = await getAuthUserIdByEmail(admin, email);
  if (existingAuthUserId) {
    const existingAuthInternalUser = await getInternalUserRecord(admin, existingAuthUserId);
    if (
      existingAuthInternalUser &&
      existingAuthInternalUser.account_owner_user_id !== actorInternalUser.account_owner_user_id
    ) {
      redirect("/ops/admin/internal-users?invite_status=already_internal_other_owner");
    }
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: resolveInviteRedirectTo(),
  });

  if (!inviteError) {
    targetUserId = inviteData?.user?.id ? String(inviteData.user.id) : null;
    inviteRequested = true;
  } else if (isInviteRateLimitError(inviteError)) {
    redirect("/ops/admin/internal-users?invite_status=email_rate_limited");
  } else if (isAlreadyExistsAuthError(inviteError)) {
    targetUserId = await getAuthUserIdByEmail(admin, email);

    if (!targetUserId) {
      redirect("/ops/admin/internal-users?invite_status=email_already_invited");
    }
  } else {
    throw inviteError;
  }

  if (!targetUserId) {
    targetUserId = await getAuthUserIdByEmail(admin, email);
  }

  if (!targetUserId) {
    redirect("/ops/admin/internal-users?invite_status=target_auth_user_not_found");
  }

  const existing = await getInternalUserRecord(admin, targetUserId);

  if (existing) {
    if (existing.account_owner_user_id !== actorInternalUser.account_owner_user_id) {
      redirect("/ops/admin/internal-users?invite_status=already_internal_other_owner");
    }

    if (existing.role !== role || !existing.is_active) {
      const { error: updateError } = await admin
        .from("internal_users")
        .update({
          role,
          is_active: true,
          created_by: actorUserId,
        })
        .eq("user_id", targetUserId)
        .eq("account_owner_user_id", actorInternalUser.account_owner_user_id)
        .select("user_id")
        .single();

      if (updateError) throw updateError;
      revalidateInternalUserViews();
      redirect("/ops/admin/internal-users?invite_status=attached_existing_auth");
    }

    redirect("/ops/admin/internal-users?invite_status=already_internal");
  }

  const { error: insertError } = await admin
    .from("internal_users")
    .insert({
      user_id: targetUserId,
      role,
      is_active: true,
      account_owner_user_id: actorInternalUser.account_owner_user_id,
      created_by: actorUserId,
    })
    .select("user_id")
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      redirect("/ops/admin/internal-users?invite_status=already_internal");
    }
    if (isForeignKeyViolation(insertError)) {
      redirect("/ops/admin/internal-users?invite_status=target_auth_user_not_found");
    }
    throw insertError;
  }

  revalidateInternalUserViews();

  redirect(
    inviteRequested
      ? "/ops/admin/internal-users?invite_status=invited"
      : "/ops/admin/internal-users?invite_status=attached_existing_auth",
  );
}

export async function deleteInternalUserFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser: actorInternalUser } = await requireInternalRole(
    "admin",
    { supabase },
  );

  const admin = createAdminClient();

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId) {
    throw new Error("MISSING_TARGET_USER_ID");
  }

  const target = await requireScopedTarget(
    admin,
    actorInternalUser.account_owner_user_id,
    targetUserId,
  );

  // Prevent deletion of last active admin
  if (target.role === "admin" && target.is_active) {
    const activeAdminCount = await countActiveAdmins(
      admin,
      target.account_owner_user_id,
    );
    if (activeAdminCount <= 1) {
      throw new Error("CANNOT_DELETE_LAST_ACTIVE_ADMIN");
    }
  }

  // Check for active assignments
  const { count: activeAssignmentCount, error: assignmentError } = await admin
    .from("job_assignments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", targetUserId)
    .eq("is_active", true);

  if (assignmentError) throw assignmentError;

  if ((activeAssignmentCount ?? 0) > 0) {
    throw new Error(
      "CANNOT_DELETE_USER_WITH_ACTIVE_ASSIGNMENTS",
    );
  }

  // Delete the internal user record
  const { error: deleteError } = await admin
    .from("internal_users")
    .delete()
    .eq("user_id", targetUserId)
    .eq("account_owner_user_id", actorInternalUser.account_owner_user_id)
    .select("user_id")
    .single();

  if (deleteError) throw deleteError;

  revalidateInternalUserViews();
}

export async function updateInternalUserProfileFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser: actorInternalUser } = await requireInternalRole(
    "admin",
    { supabase },
  );

  const admin = createAdminClient();

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId) {
    throw new Error("MISSING_TARGET_USER_ID");
  }

  const displayName = normalizeText(formData.get("display_name"));
  const phone = normalizePhone(formData.get("phone"));

  if (!displayName) {
    redirect(buildInternalUserProfileNoticeHref(targetUserId, "missing_name"));
  }

  await requireScopedTarget(
    admin,
    actorInternalUser.account_owner_user_id,
    targetUserId,
  );

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(targetUserId);
  if (authError || !authData?.user) {
    throw authError ?? new Error("TARGET_AUTH_USER_NOT_FOUND");
  }

  const authUser = authData.user as any;
  const existingMetadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const nextMetadata = {
    ...existingMetadata,
    name: displayName,
    full_name: displayName,
    first_name: displayName.split(/\s+/)[0] ?? displayName,
    phone: phone || null,
    phone_number: phone || null,
  };

  const { data: existingProfile, error: profileReadErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileReadErr) throw profileReadErr;

  if (existingProfile?.id) {
    const { error: profileUpdateErr } = await admin
      .from("profiles")
      .update({ full_name: displayName })
      .eq("id", targetUserId);

    if (profileUpdateErr) throw profileUpdateErr;
  } else {
    const { error: profileInsertErr } = await admin
      .from("profiles")
      .insert({
        id: targetUserId,
        email: String(authUser.email ?? "").trim() || null,
        full_name: displayName,
      });

    if (profileInsertErr) throw profileInsertErr;
  }

  const { error: authUpdateErr } = await admin.auth.admin.updateUserById(targetUserId, {
    user_metadata: nextMetadata,
  });

  if (authUpdateErr) throw authUpdateErr;

  revalidateInternalUserViews();
  redirect(buildInternalUserProfileNoticeHref(targetUserId, "saved"));
}