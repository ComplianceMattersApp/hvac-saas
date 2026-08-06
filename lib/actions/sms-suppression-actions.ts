"use server";

import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";

/**
 * SMS suppression admin actions — account-scoped.
 *
 * Lifting a suppression is a deliberate manual admin decision (START replies
 * never auto-lift). The write goes through the regular client: the table's
 * UPDATE policy requires lifted_by_user_id = the acting user, which is the
 * audit posture we want.
 */

const COMMUNICATIONS_PATH = "/ops/admin/communications";

function withNotice(notice: string): string {
  return `${COMMUNICATIONS_PATH}?notice=${encodeURIComponent(notice)}`;
}

function asTrimmed(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

export async function liftContactRecipientSuppressionFromForm(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();

  let accountOwnerUserId: string;
  let actingUserId: string;

  try {
    const ctx = await requireInternalRole("admin", { supabase });
    accountOwnerUserId = asTrimmed(ctx.internalUser.account_owner_user_id);
    actingUserId = asTrimmed(ctx.internalUser.user_id);
  } catch {
    redirect(withNotice("admin_required"));
  }

  const suppressionId = asTrimmed(formData.get("suppression_id"));
  const liftReason = asTrimmed(formData.get("lift_reason")).slice(0, 300);

  if (!suppressionId || !liftReason) {
    redirect(withNotice("suppression_lift_invalid"));
  }

  const now = new Date().toISOString();

  const response = await supabase
    .from("contact_recipient_suppressions")
    .update({
      is_active: false,
      lifted_at: now,
      lifted_by_user_id: actingUserId,
      lift_reason: liftReason,
      updated_by_user_id: actingUserId,
    })
    .eq("id", suppressionId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("is_active", true)
    .select("id");

  if (response?.error) {
    redirect(withNotice("suppression_lift_failed"));
  }

  const rows = Array.isArray(response?.data) ? response.data : [];
  if (rows.length === 0) {
    redirect(withNotice("suppression_lift_failed"));
  }

  redirect(withNotice("suppression_lifted"));
}
