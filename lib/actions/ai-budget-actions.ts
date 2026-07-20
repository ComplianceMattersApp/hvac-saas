"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getRequestUser } from "@/lib/auth/request-identity";
import { dollarsToMicrousd } from "@/lib/ai/usage-budget";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { createAdminClient } from "@/lib/supabase/server";

async function requirePlatformOwner() {
  const user = await getRequestUser();
  if (!user) redirect("/login");
  if (!isPlatformOwnerActor({ userId: user.id, email: user.email, env: process.env })) notFound();
  return user;
}

export async function updateGlobalAiBudgetFromForm(formData: FormData) {
  const user = await requirePlatformOwner();
  const monthlyLimitMicrousd = dollarsToMicrousd(formData.get("monthly_limit_dollars"));
  if (monthlyLimitMicrousd === null) {
    redirect("/ops/owner-console?ai_notice=invalid_limit");
  }

  const isEnabled = formData.get("is_enabled") === "on";
  const admin = createAdminClient();
  const { error } = await admin
    .from("ai_global_budget_settings")
    .update({
      monthly_limit_microusd: monthlyLimitMicrousd,
      is_enabled: isEnabled,
      updated_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("singleton_key", "global");

  if (error) redirect("/ops/owner-console?ai_notice=update_failed");
  revalidatePath("/ops/owner-console");
  redirect("/ops/owner-console?ai_notice=updated");
}
