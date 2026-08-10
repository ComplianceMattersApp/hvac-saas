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
 */
export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const windowDays = Number(new URL(request.url).searchParams.get("windowDays") ?? 90);

  // Only accounts with a QBO connection or Stripe activity are worth checking.
  const { data: connections } = await admin
    .from("qbo_connections")
    .select("account_owner_user_id")
    .eq("status", "active");
  const accountIds = [
    ...new Set((connections ?? []).map((row: any) => String(row.account_owner_user_id ?? "").trim()).filter(Boolean)),
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
