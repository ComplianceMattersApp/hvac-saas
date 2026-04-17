import Link from "next/link";
import type {
  OperationalReportingMetric,
  OperationalReportingReadModel,
} from "@/lib/ops/operational-reporting";

type Props = {
  reporting: OperationalReportingReadModel;
  scopeLabel: string;
  contractorId?: string | null;
  sort?: string;
};

function buildQueryString(params: Record<string, string | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim() !== "") {
      sp.set(key, String(value));
    }
  }
  const query = sp.toString();
  return query ? `?${query}` : "";
}

function getDrillHref(
  metric: OperationalReportingMetric,
  filters: { contractorId?: string | null; sort?: string }
) {
  const bucket =
    metric.key === "scheduled_visits"
      ? "scheduled"
      : metric.key === "need_to_schedule"
        ? "need_to_schedule"
        : metric.key === "closeout_queue"
          ? "closeout"
          : null;

  if (!bucket) return null;

  return `/ops${buildQueryString({
    bucket,
    contractor: filters.contractorId ?? "",
    sort: filters.sort && filters.sort !== "default" ? filters.sort : "",
    q: "",
    signal: "",
    panel: "",
  })}#ops-queues`;
}

function snapshotMetricCard(
  metric: OperationalReportingMetric,
  filters: { contractorId?: string | null; sort?: string }
) {
  const toneClass = metric.key === "closeout_queue"
    ? "border-amber-200/80 bg-amber-50/75"
    : "border-slate-200/90 bg-white/92";

  const href = getDrillHref(metric, filters);
  const className = `rounded-xl border px-3 py-2.5 shadow-[0_10px_20px_-26px_rgba(15,23,42,0.2)] ${toneClass}${
    href
      ? " transition-[border-color,box-shadow,transform,background-color] hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:shadow-[0_14px_26px_-24px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
      : ""
  }`;

  const content = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">{metric.label}</div>
      <div className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-slate-950">{metric.value}</div>
    </>
  );

  if (href) {
    return (
      <Link key={metric.label} href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <div key={metric.label} className={className}>
      {content}
    </div>
  );
}

export default function OperationalReportingSection({ reporting, scopeLabel, contractorId, sort }: Props) {
  const drillFilters = { contractorId, sort };

  return (
    <section className="rounded-2xl border border-slate-300/75 bg-slate-50/78 p-3 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.24)] sm:p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">Internal</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">Operational Snapshot</div>
        </div>
        <div className="text-right text-[12px] leading-5 text-slate-600 sm:text-[11px] sm:leading-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">Scope</div>
          <div className="font-medium text-slate-800">{scopeLabel}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {reporting.workload.map((metric) => snapshotMetricCard(metric, drillFilters))}
      </div>
    </section>
  );
}