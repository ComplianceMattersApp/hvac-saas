"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";

type PendingInviteRow = {
  id: string;
  contractor_id: string;
  owner_user_id: string;
  auth_user_id: string | null;
  email: string | null;
  status: string | null;
  created_at: string | null;
};

type ScopedInviteResolution = {
  invite: PendingInviteRow | null;
  denied: boolean;
  denialReason?: string;
};

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveDeterministicInviteScope(rows: PendingInviteRow[]): ScopedInviteResolution {
  if (rows.length === 0) {
    return { invite: null, denied: false };
  }

  const scopedRows = rows.filter((row) => {
    const contractorId = String(row?.contractor_id ?? "").trim();
    const ownerUserId = String(row?.owner_user_id ?? "").trim();
    return Boolean(contractorId && ownerUserId);
  });

  if (scopedRows.length === 0) {
    return {
      invite: null,
      denied: true,
      denialReason: "INVITE_SCOPE_INVALID",
    };
  }

  const uniqueScopes = new Set(
    scopedRows.map((row) => `${String(row.owner_user_id)}::${String(row.contractor_id)}`),
  );

  if (uniqueScopes.size !== 1) {
    return {
      invite: null,
      denied: true,
      denialReason: "INVITE_SCOPE_AMBIGUOUS",
    };
  }

  return {
    invite: scopedRows[0],
    denied: false,
  };
}

async function assertScopedInviteContractorBoundary(params: {
  admin: any;
  invite: PendingInviteRow;
}) {
  const { admin, invite } = params;

  const { data: contractor, error: contractorErr } = await admin
    .from("contractors")
    .select("id, owner_user_id, lifecycle_state")
    .eq("id", invite.contractor_id)
    .maybeSingle();

  if (contractorErr) {
    throw contractorErr;
  }

  const contractorOwnerUserId = String((contractor as any)?.owner_user_id ?? "").trim();
  const inviteOwnerUserId = String(invite.owner_user_id ?? "").trim();
  const lifecycleState = String((contractor as any)?.lifecycle_state ?? "active")
    .trim()
    .toLowerCase();

  if (!contractor?.id || !contractorOwnerUserId || contractorOwnerUserId !== inviteOwnerUserId) {
    throw new Error("INVITE_SCOPE_INVALID");
  }

  if (lifecycleState !== "active") {
    throw new Error("INVITE_CONTRACTOR_ARCHIVED");
  }
}

async function resolveScopedPendingInviteForAcceptance(params: {
  admin: any;
  userId: string;
  email: string;
}): Promise<ScopedInviteResolution> {
  const { admin, userId, email } = params;

  const normalizedEmail = normalizeEmail(email);

  const { data: invitesByUserId, error: byUserIdErr } = await admin
    .from("contractor_invites")
    .select("id, contractor_id, owner_user_id, auth_user_id, email, status, created_at")
    .eq("auth_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);

  if (byUserIdErr) {
    throw byUserIdErr;
  }

  const userScopedRows = (invitesByUserId ?? []) as PendingInviteRow[];
  const userScopedResolution = resolveDeterministicInviteScope(userScopedRows);

  if (userScopedResolution.denied || userScopedResolution.invite) {
    return userScopedResolution;
  }

  if (!normalizedEmail) {
    return { invite: null, denied: false };
  }

  const { data: invitesByEmail, error: byEmailErr } = await admin
    .from("contractor_invites")
    .select("id, contractor_id, owner_user_id, auth_user_id, email, status, created_at")
    .eq("status", "pending")
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: true })
    .limit(20);

  if (byEmailErr) {
    throw byEmailErr;
  }

  const emailRows = ((invitesByEmail ?? []) as PendingInviteRow[]).filter((row) => {
    return normalizeEmail(row.email) === normalizedEmail;
  });

  if (emailRows.length === 0) {
    return { invite: null, denied: false };
  }

  const hasRowsBoundToOtherUsers = emailRows.some((row) => {
    const rowAuthUserId = String(row.auth_user_id ?? "").trim();
    return Boolean(rowAuthUserId && rowAuthUserId !== userId);
  });

  if (hasRowsBoundToOtherUsers) {
    return {
      invite: null,
      denied: true,
      denialReason: "INVITE_SCOPE_AMBIGUOUS",
    };
  }

  const unboundEmailRows = emailRows.filter((row) => {
    return !String(row.auth_user_id ?? "").trim();
  });

  const fallbackResolution = resolveDeterministicInviteScope(unboundEmailRows);

  if (fallbackResolution.denied || !fallbackResolution.invite) {
    return fallbackResolution;
  }

  return fallbackResolution;
}

/**
 * Called once immediately after a contractor successfully sets their password.
 *
 * - Finds any pending contractor_invites row where auth_user_id = current user
 * - Inserts contractor_users membership if missing (idempotent via PK conflict)
 * - Marks the invite as accepted and sets accepted_at
 * - Returns isContractor: true so the caller can route to /portal
 *
 * Uses the admin client for contractor_invites reads/writes because the
 * table's RLS UPDATE policy is restricted to admin internal users. The session
 * is verified explicitly via auth.getUser() before any admin write is performed.
 *
 * Safe to call more than once — does not create duplicate rows or regress state.
 */
export async function ensureContractorMembershipFromInvite(): Promise<{
  isContractor: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return { isContractor: false };

  const admin = createAdminClient();

  let scopedInviteResolution: ScopedInviteResolution;

  try {
    scopedInviteResolution = await resolveScopedPendingInviteForAcceptance({
      admin,
      userId: user.id,
      email: String(user.email ?? ""),
    });
  } catch (error) {
    return {
      isContractor: false,
      error: error instanceof Error ? error.message : "INVITE_SCOPE_RESOLUTION_FAILED",
    };
  }

  if (scopedInviteResolution.denied) {
    return {
      isContractor: false,
      error: scopedInviteResolution.denialReason ?? "INVITE_SCOPE_DENIED",
    };
  }

  const invite = scopedInviteResolution.invite;

  if (!invite) {
    // No pending invite — check if this user already has a membership row.
    const { data: existing } = await admin
      .from("contractor_users")
      .select("contractor_id, contractors ( lifecycle_state )")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const lifecycleState = String((existing as any)?.contractors?.lifecycle_state ?? "active")
      .trim()
      .toLowerCase();

    return {
      isContractor: !!existing?.contractor_id && lifecycleState === "active",
      error:
        existing?.contractor_id && lifecycleState !== "active"
          ? "INVITE_CONTRACTOR_ARCHIVED"
          : undefined,
    };
  }

  try {
    await assertScopedInviteContractorBoundary({ admin, invite });
  } catch (error) {
    return {
      isContractor: false,
      error:
        error instanceof Error && error.message === "INVITE_CONTRACTOR_ARCHIVED"
          ? "INVITE_CONTRACTOR_ARCHIVED"
          : "INVITE_SCOPE_INVALID",
    };
  }

  // Upsert contractor_users membership (idempotent via composite PK).
  const { error: memberErr } = await admin
    .from("contractor_users")
    .upsert(
      { contractor_id: invite.contractor_id, user_id: user.id, role: "member" },
      { onConflict: "contractor_id,user_id" }
    );

  if (memberErr) return { isContractor: false, error: memberErr.message };

  // Mark invite accepted. Failure here does not block the user — membership
  // already exists. We still return isContractor: true.
  const { error: markErr } = await admin
    .from("contractor_invites")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      auth_user_id: user.id,
    })
    .eq("id", invite.id)
    .eq("status", "pending");

  return { isContractor: true, error: markErr?.message };
}
