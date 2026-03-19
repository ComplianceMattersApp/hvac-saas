"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email/smtp";
import { resolveInviteRedirectTo } from "@/lib/utils/resolve-invite-redirect-to";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

  const ownerUserId = user.id;
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
        status: "pending",
      },
      { onConflict: "owner_user_id,contractor_id,email" }
    )
    .select("*")
    .single();

  if (upErr) throw new Error(upErr.message);

  // 3) Generate invite link (admin) but send via SMTP ourselves
  const admin = createAdminClient();
  const redirectTo = resolveInviteRedirectTo();

  let actionLink: string | undefined;
  let authUserId: string | undefined;

  const { data: inviteLinkData, error: inviteLinkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      // Where Supabase sends the user after they click the invite + finish auth
      redirectTo,
      // Trigger reads these values on auth.users insert
      data: {
        contractor_id: contractorId,
        owner_user_id: ownerUserId,
        invite_id: inviteRow.id,
      },
    },
  });

  if (inviteLinkErr) {
    // The email already exists in auth.users — generateLink("invite") tries to INSERT
    // a new user and fails with "Database error saving new user".
    // Fall back to a recovery link so the existing user can access the portal.
    const { data: recoveryData, error: recoveryErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (recoveryErr) {
      // Surface the original invite error plus the recovery fallback error
      throw new Error(
        `Invite failed (${inviteLinkErr.message}) and recovery fallback also failed (${recoveryErr.message})`
      );
    }

    actionLink =
      (recoveryData as any)?.properties?.action_link ||
      (recoveryData as any)?.action_link;
    authUserId = (recoveryData as any)?.user?.id;
  } else {
    actionLink =
      (inviteLinkData as any)?.properties?.action_link ||
      (inviteLinkData as any)?.action_link;
    authUserId = (inviteLinkData as any)?.user?.id;
  }

  if (!actionLink) throw new Error("Invite link missing from generateLink response");

  // 4) Send email
  const subject = "You’ve been invited to Compliance Matters";
  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.4;">
      <h2>Contractor Portal Invite</h2>
      <p>You’ve been invited to join a contractor portal.</p>
      <p><a href="${actionLink}">Accept your invite</a></p>
      <p>If the button doesn’t work, copy/paste this link:</p>
      <p style="word-break: break-all;">${actionLink}</p>
    </div>
  `;

  await sendInviteEmail({ to: email, subject, html });

  // 5) Update tracking fields (also persist auth_user_id if we resolved it)
  const trackUpdate: Record<string, unknown> = {
    sent_count: (inviteRow.sent_count ?? 0) + 1,
    last_sent_at: new Date().toISOString(),
    status: "pending",
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
      status: "pending",
    },
  };
}