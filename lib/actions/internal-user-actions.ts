"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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

function revalidateInternalUserViews() {
  revalidatePath("/ops");
  revalidatePath("/ops/admin");
  revalidatePath("/ops/admin/internal-users");
}

function isForeignKeyViolation(error: any) {
  return error?.code === "23503";
}

function isUniqueViolation(error: any) {
  return error?.code === "23505";
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

  const existing = await getInternalUserRecord(admin, targetUserId);
  if (existing) {
    throw new Error("INTERNAL_USER_ALREADY_EXISTS");
  }

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