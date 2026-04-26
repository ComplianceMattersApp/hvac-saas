"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email/smtp";
import { resolveInviteRedirectTo } from "@/lib/utils/resolve-invite-redirect-to";
import { requireInternalRole } from "@/lib/auth/internal-user";

// Mirrors the isAlreadyExistsAuthError helper used in internal-user-actions.ts
function isAlreadyExistsError(err: any): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    msg.includes("already") ||
    msg.includes("exists") ||
    msg.includes("registered") ||
    msg.includes("database error saving new user") // Supabase wraps dupe-email as this
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getAuthUserIdByEmail(admin: any, email: string): Promise<string | null> {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return String(data.id);

  // Fallback to auth-admin lookup to avoid relying only on profiles.
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

export async function inviteContractor(args: {
  email: string;
  contractorId?: string;       // preferred if inviting from contractor page
  contractorName?: string;     // used only if contractorId missing
}) {
  const email = normalizeEmail(args.email);
  if (!email.includes("@")) throw new Error("Invalid email");

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error("Not authenticated");

  const { internalUser } = await requireInternalRole(["admin", "office"], {
    supabase,
    userId: user.id,
  });

  const ownerUserId = internalUser.account_owner_user_id;
  const invitedBy = user.id;

  // 1) Resolve contractor (create if missing)
  let contractorId = args.contractorId;

  if (!contractorId) {
    const name = (args.contractorName ?? "").trim() || email;

    const { data: created, error: cErr } = await supabase
      .from("contractors")
      .insert({
        owner_user_id: ownerUserId,
        name,
        email: null,
        phone: null,
        notes: null,
        billing_name: null,
        billing_email: null,
        billing_phone: null,
        billing_address_line1: null,
        billing_address_line2: null,
        billing_city: null,
        billing_state: null,
        billing_zip: null,
      })
      .select("id")
      .single();

    if (cErr) throw new Error(cErr.message);
    contractorId = created.id;
  } else {
    // Ensure this contractor belongs to current owner (RLS will enforce too)
    const { error: vErr } = await supabase
      .from("contractors")
      .select("id")
      .eq("id", contractorId)
      .eq("owner_user_id", ownerUserId)
      .single();

    if (vErr) throw new Error(vErr.message);
  }

  const { data: existingInvite, error: existingInviteErr } = await supabase
    .from("contractor_invites")
    .select("id, status, sent_count")
    .eq("owner_user_id", ownerUserId)
    .eq("contractor_id", contractorId)
    .eq("email", email)
    .maybeSingle();

  if (existingInviteErr) throw new Error(existingInviteErr.message);

  const nextInviteStatus = existingInvite?.status === "accepted" ? "accepted" : "pending";

  // 2) Upsert invite row (status tracking + resend support)
  // We store one invite row per (owner, contractor, email). Resends just update it.
  const { data: inviteRow, error: upErr } = await supabase
    .from("contractor_invites")
    .upsert(
      {
        owner_user_id: ownerUserId,
        contractor_id: contractorId,
        email,
        invited_by: invitedBy,
        status: nextInviteStatus,
      },
      { onConflict: "owner_user_id,contractor_id,email" }
    )
    .select("*")
    .single();

  if (upErr) throw new Error(upErr.message);

  // 3) Create the auth user without sending a Supabase system email.
  //    admin.createUser (not inviteUserByEmail) avoids the Supabase-auto-sent
  //    invite email, which creates a conflicting first-time CTA for the contractor.
  //    The Supabase system invite email and our branded SMTP email both arriving
  //    creates a token-collision hazard: the contractor may click the system email
  //    first (which, in PKCE mode, bypasses /set-password), while the recovery
  //    token from step 4 may have superseded the invite token.
  //
  //    email_confirm:true marks the email as confirmed so generateLink("recovery")
  //    works immediately. The branded SMTP email below (step 5) is the sole
  //    first-time contractor onboarding CTA. For already-existing users (resend
  //    path), we fall through to the existing-user recovery path unchanged.
  const admin = createAdminClient();
  const redirectTo = resolveInviteRedirectTo();

  let authUserId: string | undefined;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!createErr) {
    // Fresh user created successfully — no Supabase system email was sent.
    authUserId = createData?.user?.id ? String(createData.user.id) : undefined;
  } else if (isAlreadyExistsError(createErr)) {
    // User already exists in auth.users — look up their id for the recovery path.
    const found = await getAuthUserIdByEmail(admin, email);
    authUserId = found ?? undefined;
  } else {
    // Genuine unexpected failure — surface the real message.
    throw new Error(`User creation failed: ${createErr.message}`);
  }

  // 4) Generate a recovery link for our custom branded email.
  //    Recovery links are handled by hashType==="recovery" in auth/callback, which
  //    routes to /set-password?mode=invite — same destination as an invite link.
  //    generateLink("recovery") works for both newly-created and existing users.
  const { data: recoveryData, error: recoveryErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (recoveryErr) {
    throw new Error(`Could not generate invite link: ${recoveryErr.message}`);
  }

  const actionLink =
    (recoveryData as any)?.properties?.action_link ||
    (recoveryData as any)?.action_link;

  if (!actionLink) throw new Error("Invite link missing from generateLink response");

  if (!authUserId) {
    authUserId = (recoveryData as any)?.user?.id;
  }

  // 5) Send our branded SMTP email with the recovery link.
  const subject = "You've been invited to Compliance Matters";
  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.4;">
      <h2>Contractor Portal Invite</h2>
      <p>You have been invited to join a contractor portal.</p>
      <p><a href="${actionLink}">Accept your invite</a></p>
      <p>If the button does not work, copy/paste this link:</p>
      <p style="word-break: break-all;">${actionLink}</p>
    </div>
  `;

  await sendInviteEmail({ to: email, subject, html });

  // 6) Update tracking fields.
  //    auth_user_id column added via migration 20260319_contractor_invites_auth_user_column.sql
  const trackUpdate: Record<string, unknown> = {
    sent_count: (existingInvite?.sent_count ?? inviteRow.sent_count ?? 0) + 1,
    last_sent_at: new Date().toISOString(),
    status: nextInviteStatus,
  };
  if (authUserId) trackUpdate.auth_user_id = authUserId;

  const { error: tErr } = await supabase
    .from("contractor_invites")
    .update(trackUpdate)
    .eq("id", inviteRow.id)
    .eq("owner_user_id", ownerUserId);

  if (tErr) throw new Error(tErr.message);

  return {
    ok: true as const,
    invite: {
      id: inviteRow.id,
      contractor_id: contractorId,
      email,
      status: nextInviteStatus,
    },
  };
}
