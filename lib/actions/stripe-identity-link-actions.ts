"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { linkVerifiedStripePaymentIdentity } from "@/lib/reconciliation/link-stripe-payment-identity";

export async function linkVerifiedStripePaymentIdentityFromForm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { internalUser } = await requireInternalRole("admin", { supabase });
  const findingId = String(formData.get("finding_id") ?? "").trim();
  if (!findingId) redirect("/reports/attention?stripe_link=failed");

  let outcome: "complete" | "blocked" | "failed" = "failed";
  try {
    const result = await linkVerifiedStripePaymentIdentity({
      admin: createAdminClient(),
      accountOwnerUserId: internalUser.account_owner_user_id,
      findingId,
    });
    revalidatePath("/reports/attention");
    revalidatePath("/reports/payments");
    outcome = result.status === "linked" ? "complete" : "blocked";
  } catch {}
  redirect(`/reports/attention?stripe_link=${outcome}`);
}
