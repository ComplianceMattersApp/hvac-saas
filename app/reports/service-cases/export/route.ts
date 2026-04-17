import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  SERVICE_CASE_CONTINUITY_EXPORT_LIMIT,
  buildServiceCaseContinuityCsv,
  listServiceCaseContinuityRows,
  parseServiceCaseContinuityFilters,
} from "@/lib/reports/service-case-continuity";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

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
      return NextResponse.redirect(new URL(contractorUser?.contractor_id ? "/portal" : "/login", request.url));
    }
    throw error;
  }

  const filters = parseServiceCaseContinuityFilters(request.nextUrl.searchParams);
  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });
  const ledger = await listServiceCaseContinuityRows({
    supabase,
    filters,
    internalBusinessDisplayName: internalBusinessIdentity.display_name,
    limit: SERVICE_CASE_CONTINUITY_EXPORT_LIMIT,
    includeCount: false,
  });

  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildServiceCaseContinuityCsv(ledger.rows)}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="service-case-continuity-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}