import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";
import {
  buildDashboardTechWorkloadCsv,
  buildReportCenterDashboardReadModel,
} from "@/lib/reports/report-center-dashboard";
import { parseReportCenterKpiFilters } from "@/lib/reports/kpi-foundation";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await requireInternalUser({ supabase, userId: user.id });
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

  const filters = parseReportCenterKpiFilters(request.nextUrl.searchParams);
  const dashboard = await buildReportCenterDashboardReadModel({ supabase, filters });
  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildDashboardTechWorkloadCsv(dashboard.techWorkload.rows)}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dashboard-tech-workload-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}