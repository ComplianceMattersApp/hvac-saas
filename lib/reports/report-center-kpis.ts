import {
  buildReportCenterKpiBuckets,
  type ReportCenterKpiFamilyReadModel,
  type ReportCenterKpiFilters,
} from "@/lib/reports/kpi-foundation";
import { buildOperationalKpiReadModel } from "@/lib/reports/operational-kpis";
import { buildContinuityKpiReadModel } from "@/lib/reports/continuity-kpis";

export async function listReportCenterKpiFamilies(params: {
  supabase: any;
  accountOwnerUserId: string;
  filters: ReportCenterKpiFilters;
}): Promise<ReportCenterKpiFamilyReadModel[]> {
  const buckets = buildReportCenterKpiBuckets(params.filters);

  const [operational, continuity] = await Promise.all([
    buildOperationalKpiReadModel({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
      filters: params.filters,
      buckets,
    }),
    buildContinuityKpiReadModel({
      supabase: params.supabase,
      filters: params.filters,
      buckets,
    }),
  ]);

  return [operational, continuity];
}