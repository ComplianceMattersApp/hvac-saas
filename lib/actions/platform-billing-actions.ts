"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import {
  syncPlatformEntitlementFromStripeForAccountOwner,
} from "@/lib/business/platform-billing-stripe";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";
import { createClient } from "@/lib/supabase/server";

const ACCESS_INACTIVE_PATH = "/access-inactive";

function withNotice(notice: string) {
  return `${ACCESS_INACTIVE_PATH}?notice=${encodeURIComponent(notice)}`;
}

function entitlementStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function refreshPlatformSubscriptionStatusFromForm(): Promise<void> {
  const supabase = await createClient();

  let accountOwnerUserId = "";
  try {
    const { internalUser } = await requireInternalRole("admin", { supabase });
    accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();
  } catch {
    redirect("/forbidden");
  }

  let result: Awaited<ReturnType<typeof syncPlatformEntitlementFromStripeForAccountOwner>>;
  try {
    result = await syncPlatformEntitlementFromStripeForAccountOwner({
      accountOwnerUserId,
    });
  } catch (error) {
    console.warn("platform-billing: subscription status refresh failed", {
      accountOwnerUserId,
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(withNotice("platform_subscription_refresh_failed"));
  }

  revalidatePath(ACCESS_INACTIVE_PATH);
  revalidatePath("/today");
  revalidatePath("/ops/admin/company-profile");

  if (result.skipped) {
    redirect(withNotice(`platform_subscription_refresh_${result.reason}`));
  }

  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId,
    supabase,
  });

  if (access.authorized) {
    redirect("/today");
  }

  redirect(
    withNotice(
      `platform_subscription_refresh_${entitlementStatus(result.entitlement?.stripe_subscription_status) || "synced_inactive"}`,
    ),
  );
}
