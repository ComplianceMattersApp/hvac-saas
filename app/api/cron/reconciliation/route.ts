import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";
import {
  persistReconciliationFindings,
  runThreeWayReconciliation,
} from "@/lib/reconciliation/three-way-reconciliation";

/**
 * Nightly three-way reconciliation across every connected account.
 *
 * Report-only: it writes findings and nothing else. Runs per account so one
 * account's provider outage cannot abort the others.
 *
 * Scheduled from vercel.json at 09:00 UTC (early morning Pacific), so a run
 * covers a full day of activity and finishes before anyone is working.
 */

// Paginated QBO and Stripe reads across every account — well beyond the default
// function timeout once more than a couple of accounts are connected.
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const windowDays = Number(new URL(request.url).searchParams.get("windowDays") ?? 90);

  // Check both populations independently. A Stripe-only account can still have
  // an unrecorded charge and must not disappear merely because QBO is absent.
  const [{ data: connections, error: connectionError }, { data: stripeProfiles, error: stripeProfileError }] = await Promise.all([
    admin.from("qbo_connections").select("account_owner_user_id").eq("status", "active"),
    admin.from("internal_business_profiles").select("account_owner_user_id").not("stripe_connected_account_id", "is", null),
  ]);
  if (connectionError) return NextResponse.json({ error: `Failed to enumerate QuickBooks accounts: ${connectionError.message}` }, { status: 500 });
  if (stripeProfileError) return NextResponse.json({ error: `Failed to enumerate Stripe accounts: ${stripeProfileError.message}` }, { status: 500 });
  const accountIds = [
    ...new Set([...(connections ?? []), ...(stripeProfiles ?? [])].map((row: any) => String(row.account_owner_user_id ?? "").trim()).filter(Boolean)),
  ];

  const summaries: Array<Record<string, unknown>> = [];
  for (const accountOwnerUserId of accountIds) {
    try {
      const result = await runThreeWayReconciliation({ admin, accountOwnerUserId, windowDays });
      const persisted = await persistReconciliationFindings({ admin, result });
      summaries.push({
        account: accountOwnerUserId.slice(-6),
        invoices: result.checkedInvoices,
        payments: result.checkedPayments,
        findings: result.findings.length,
        ...persisted,
        skipped: result.skipped,
      });
    } catch (error) {
      summaries.push({
        account: accountOwnerUserId.slice(-6),
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ accounts: accountIds.length, windowDays, summaries });
}
