import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { reconcileStaleStripeSuccessfulPayments } from "@/lib/business/stripe-successful-payment-reconciliation";

export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await reconcileStaleStripeSuccessfulPayments({ admin: createAdminClient(), limit: 25 });
  const outcomes = results.reduce<Record<string, number>>((all, result) => ({ ...all, [result.outcome]: (all[result.outcome] ?? 0) + 1 }), {});
  return NextResponse.json({ checked: results.length, outcomes });
}
