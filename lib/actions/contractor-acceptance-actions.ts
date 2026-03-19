"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";

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

  // Find the oldest pending invite linked to this auth user.
  // .limit(1) ensures maybeSingle() never errors on multiple rows.
  const { data: invites, error: inviteErr } = await admin
    .from("contractor_invites")
    .select("id, contractor_id, status")
    .eq("auth_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (inviteErr) return { isContractor: false, error: inviteErr.message };

  const invite = invites?.[0];

  if (!invite) {
    // No pending invite — check if this user already has a membership row.
    const { data: existing } = await admin
      .from("contractor_users")
      .select("contractor_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    return { isContractor: !!existing?.contractor_id };
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
    })
    .eq("id", invite.id);

  return { isContractor: true, error: markErr?.message };
}
