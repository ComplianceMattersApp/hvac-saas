"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email/smtp";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function requireAppUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_APP_URL");
  return url.replace(/\/$/, "");
}

export async function inviteContractor(args: {
  email: string;
  contractorId?: string;       // preferred if inviting from contractor page
  contractorName?: string;     // used only if contractorId missing
  role?: "member" | "owner";   // default member
}) {
  const email = normalizeEmail(args.email);
  if (!email.includes("@")) throw new Error("Invalid email");

  const supabase = await createClient();
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();

  if (sessErr) throw new Error(sessErr.message);
  if (!session) throw new Error("Not authenticated");

  const ownerUserId = session.user.id;
  const invitedBy = session.user.id;
  const role = args.role ?? "member";

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
        role,
        status: "pending",
      },
      { onConflict: "owner_user_id,contractor_id,lower(email)" as any }
    )
    .select("*")
    .single();

  // Note: supabase-js doesn’t natively accept expression indexes in onConflict typing.
  // If this complains in TS, we’ll switch to: select existing -> update/insert manually.
  if (upErr) throw new Error(upErr.message);

  // 3) Generate invite link (admin) but send via SMTP ourselves
  const admin = createAdminClient();
  const appUrl = requireAppUrl();

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      // Where Supabase sends the user after they click the invite + finish auth
      redirectTo: `${appUrl}/auth/callback`,
      // This is the magic: trigger reads these values on auth.users insert
      data: {
        contractor_id: contractorId,
        owner_user_id: ownerUserId,
        invite_id: inviteRow.id,
      },
    },
  });

  if (linkErr) throw new Error(linkErr.message);

  const actionLink =
    (linkData as any)?.properties?.action_link || (linkData as any)?.action_link;

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

  // 5) Update tracking fields
  const { error: tErr } = await supabase
    .from("contractor_invites")
    .update({
      sent_count: (inviteRow.sent_count ?? 0) + 1,
      last_sent_at: new Date().toISOString(),
      status: "pending",
    })
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
      role,
    },
  };
}