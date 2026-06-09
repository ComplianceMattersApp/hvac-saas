import { NextRequest, NextResponse } from "next/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { requireFinancialExportAccessOrResponse } from "@/lib/auth/financial-access";
import { createClient } from "@/lib/supabase/server";
import {
  buildDepositsSummaryCsv,
  getDepositsLedgerSummary,
  type DepositsLedgerPayoutStatus,
  type DepositsLedgerSyncStatus,
} from "@/lib/reports/deposits-ledger";

function dateParam(searchParams: URLSearchParams, key: string) {
  const value = String(searchParams.get(key) ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function optionParam(searchParams: URLSearchParams, key: string) {
  return String(searchParams.get(key) ?? "").trim().toLowerCase();
}

async function resolveDepositsExportAccess(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { response: NextResponse.redirect(new URL("/login", request.url)) };
  }

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: contractorUser, error: contractorError } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (contractorError) throw contractorError;
      const redirectTarget = contractorUser?.contractor_id ? "/portal" : "/login";
      return { response: NextResponse.redirect(new URL(redirectTarget, request.url)) };
    }

    throw error;
  }

  const financialAccessResponse = requireFinancialExportAccessOrResponse({
    actorUserId: user.id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    requestUrl: request.url,
    unauthorizedRedirectPath: "/reports/invoices?banner=not_authorized",
  });

  if (financialAccessResponse) {
    return { response: financialAccessResponse };
  }

  return { supabase, internalUser };
}

export async function GET(request: NextRequest) {
  const access = await resolveDepositsExportAccess(request);
  if ("response" in access) return access.response;

  const ledger = await getDepositsLedgerSummary({
    supabase: access.supabase,
    accountOwnerUserId: access.internalUser.account_owner_user_id,
    dateFrom: dateParam(request.nextUrl.searchParams, "from") || null,
    dateTo: dateParam(request.nextUrl.searchParams, "to") || null,
    payoutStatus: optionParam(request.nextUrl.searchParams, "payout_status") as DepositsLedgerPayoutStatus,
    syncStatus: optionParam(request.nextUrl.searchParams, "sync_status") as DepositsLedgerSyncStatus,
  });

  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildDepositsSummaryCsv(ledger.rows)}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deposits-summary-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
