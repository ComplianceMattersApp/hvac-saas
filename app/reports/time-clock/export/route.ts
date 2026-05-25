import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError } from "@/lib/auth/internal-user";
import {
  TIME_CLOCK_REPORT_EXPORT_LIMIT,
  buildTimeClockReportCsv,
  listTimeClockReportEntriesForAccount,
  parseTimeClockReportFilters,
  requireAdminReportActor,
} from "@/lib/reports/time-clock-report";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let internalUser: Awaited<ReturnType<typeof requireAdminReportActor>>["internalUser"];
  try {
    ({ internalUser } = await requireAdminReportActor({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: contractorUser, error: contractorError } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (contractorError) throw contractorError;
      const redirectTarget = contractorUser?.contractor_id ? "/portal" : "/ops";
      return NextResponse.redirect(new URL(redirectTarget, request.url));
    }
    throw error;
  }

  const filters = parseTimeClockReportFilters(request.nextUrl.searchParams);
  const report = await listTimeClockReportEntriesForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    filters,
    limit: TIME_CLOCK_REPORT_EXPORT_LIMIT,
    includeCount: false,
  });

  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildTimeClockReportCsv(report.rows)}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="time-clock-report-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}