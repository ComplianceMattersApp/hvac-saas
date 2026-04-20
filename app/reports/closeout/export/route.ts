import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  CLOSEOUT_FOLLOW_UP_LEDGER_EXPORT_LIMIT,
  buildCloseoutFollowUpLedgerCsv,
  listCloseoutFollowUpLedgerRows,
  parseCloseoutFollowUpLedgerFilters,
} from "@/lib/reports/closeout-follow-up-ledger";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
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
      return NextResponse.redirect(new URL(redirectTarget, request.url));
    }

    throw error;
  }

  const filters = parseCloseoutFollowUpLedgerFilters(request.nextUrl.searchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const ledger = await listCloseoutFollowUpLedgerRows({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    filters,
    internalBusinessDisplayName: internalBusinessIdentity.display_name,
    limit: CLOSEOUT_FOLLOW_UP_LEDGER_EXPORT_LIMIT,
    includeCount: false,
  });

  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildCloseoutFollowUpLedgerCsv(ledger.rows)}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="closeout-follow-up-ledger-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}