import { NextResponse } from "next/server";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import {
  createPlatformSubscriptionCheckoutSession,
  getPlatformBillingAvailability,
} from "@/lib/business/platform-billing-stripe";

export async function POST() {
  const availability = getPlatformBillingAvailability();
  if (!availability.checkoutAvailable) {
    return NextResponse.json(
      {
        error: "Platform subscription checkout is not configured.",
        missingKeys: availability.missingKeys,
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  try {
    const { internalUser } = await requireInternalRole("admin", { supabase });
    const { url } = await createPlatformSubscriptionCheckoutSession({
      accountOwnerUserId: internalUser.account_owner_user_id,
    });

    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = /required|unauthorized|authentication/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}