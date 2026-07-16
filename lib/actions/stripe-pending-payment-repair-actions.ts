"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageInvoiceLifecycle } from "@/lib/auth/financial-access";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { repairVerifiedStripePendingPayment } from "@/lib/business/stripe-pending-payment-repair";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function repairStripePendingPaymentFromForm(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const confirmed = formData.get("confirm_repair") === "yes";
  const supabase = await createClient();
  const { internalUser, userId } = await requireInternalUser({ supabase });
  const ownerId = String(internalUser.account_owner_user_id ?? "").trim();
  if (!UUID_RE.test(paymentId) || !confirmed || !canManageInvoiceLifecycle({ actorUserId: userId, internalUser, resourceAccountOwnerUserId: ownerId })) {
    redirect("/reports/stripe-reconciliation?inspect=1&repair=denied");
  }
  const result = await repairVerifiedStripePendingPayment({ admin: createAdminClient(), accountOwnerUserId: ownerId, paymentId });
  revalidatePath("/reports/stripe-reconciliation");
  revalidatePath("/reports/payments");
  redirect(`/reports/stripe-reconciliation?inspect=1&repair=${result.repaired ? "complete" : encodeURIComponent(result.reason)}`);
}
