"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { resolveInviteRedirectTo } from "@/lib/utils/resolve-invite-redirect-to";
import { sendInviteEmail } from "@/lib/email/smtp";
import { inviteContractor } from "@/lib/actions/contractor-invite-actions";

function safeReturnTo(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed.startsWith("/")) return "/ops/admin/users";
  if (trimmed.startsWith("//")) return "/ops/admin/users";
  return trimmed;
}

function withNotice(path: string, notice: string): string {
  const url = new URL(`http://local${path}`);
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}

function normalizeEmail(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").trim().toLowerCase();
}

function parseInternalRoleForInvite(raw: FormDataEntryValue | null): "admin" | "office" | "tech" {
  const role = String(raw ?? "").trim().toLowerCase();
  if (role === "admin" || role === "office" || role === "tech") return role;
  if (role === "technician") return "tech";
  return "office";
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

async function assertOwnerScopedInternalTargetByEmail(params: {
  admin: any;
  email: string;
  accountOwnerUserId: string;
}) {
  const { admin, email, accountOwnerUserId } = params;

  const targetUserId = await getAuthUserIdByEmail(admin, email);
  if (!targetUserId) {
    throw new Error("OUT_OF_SCOPE_TARGET");
  }

  const { data: scopedInternalUser, error: scopedInternalUserErr } = await admin
    .from("internal_users")
    .select("user_id")
    .eq("user_id", targetUserId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (scopedInternalUserErr) throw scopedInternalUserErr;
  if (!scopedInternalUser?.user_id) {
    throw new Error("OUT_OF_SCOPE_TARGET");
  }
}

function createPasswordRecoveryClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

async function sendRecoveryEmail(params: {
  admin: any;
  email: string;
  subject: string;
  headline: string;
  body: string;
}) {
  const { admin, email, subject, headline, body } = params;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: resolveInviteRedirectTo(),
    },
  });

  if (error) throw error;

  const actionLink =
    (data as any)?.properties?.action_link || (data as any)?.action_link;

  if (!actionLink) {
    throw new Error("RECOVERY_LINK_MISSING");
  }

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.4;">
      <h2>${headline}</h2>
      <p>${body}</p>
      <p><a href="${actionLink}">Continue</a></p>
      <p>If the button does not work, copy/paste this link:</p>
      <p style="word-break: break-all;">${actionLink}</p>
    </div>
  `;

  await sendInviteEmail({ to: email, subject, html });
}

export async function resendInternalInviteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });

  const returnTo = safeReturnTo(String(formData.get("return_to") ?? ""));
  const email = normalizeEmail(formData.get("email"));
  const role = parseInternalRoleForInvite(formData.get("role"));

  if (!email || !email.includes("@")) {
    redirect(withNotice(returnTo, "invalid_email"));
  }

  const admin = createAdminClient();

  try {
    await assertOwnerScopedInternalTargetByEmail({
      admin,
      email,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    redirect(returnTo);
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: resolveInviteRedirectTo(),
    data: {
      internal_role: role,
    },
  });

  if (!inviteError) {
    redirect(withNotice(returnTo, "invite_resent"));
  }

  // Existing users may not accept invite resend; send a recovery link fallback.
  await sendRecoveryEmail({
    admin,
    email,
    subject: "Complete your Compliance Matters account setup",
    headline: "Complete your account setup",
    body: "Use the link below to finish account setup and set your password.",
  });

  redirect(withNotice(returnTo, "recovery_sent"));
}

export async function sendPasswordResetFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });

  const returnTo = safeReturnTo(String(formData.get("return_to") ?? ""));
  const email = normalizeEmail(formData.get("email"));

  if (!email || !email.includes("@")) {
    redirect(withNotice(returnTo, "invalid_email"));
  }

  const admin = createAdminClient();

  try {
    await assertOwnerScopedInternalTargetByEmail({
      admin,
      email,
      accountOwnerUserId: internalUser.account_owner_user_id,
    });
  } catch {
    redirect(returnTo);
  }

  // Use the same implicit-flow initiation strategy as /login forgot-password.
  const recoveryClient = createPasswordRecoveryClient();
  const { error } = await recoveryClient.auth.resetPasswordForEmail(email, {
    redirectTo: resolveInviteRedirectTo(),
  });

  if (error) {
    redirect(withNotice(returnTo, "password_reset_failed"));
  }

  redirect(withNotice(returnTo, "password_reset_sent"));
}

export async function resendContractorInviteFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireInternalRole("admin", { supabase });

  const returnTo = safeReturnTo(String(formData.get("return_to") ?? ""));
  const contractorId = String(formData.get("contractor_id") ?? "").trim();
  const email = normalizeEmail(formData.get("email"));

  if (!contractorId || !email || !email.includes("@")) {
    redirect(withNotice(returnTo, "invalid_invite_target"));
  }

  await inviteContractor({
    contractorId,
    email,
  });

  redirect(withNotice(returnTo, "invite_resent"));
}

export async function inviteContractorUserFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireInternalRole("admin", { supabase });

  const returnTo = safeReturnTo(String(formData.get("return_to") ?? ""));
  const contractorId = String(formData.get("contractor_id") ?? "").trim();
  const email = normalizeEmail(formData.get("email"));

  if (!contractorId || !email || !email.includes("@")) {
    redirect(withNotice(returnTo, "invalid_invite_target"));
  }

  await inviteContractor({
    contractorId,
    email,
  });

  redirect(withNotice(returnTo, "invite_sent"));
}
