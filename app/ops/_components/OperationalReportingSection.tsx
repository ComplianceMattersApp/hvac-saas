import type {
  OperationalReportingMetric,
  OperationalReportingReadModel,
} from "@/lib/ops/operational-reporting";

type Props = {
  reporting: OperationalReportingReadModel;
  scopeLabel: string;
};

function metricCard(metric: OperationalReportingMetric, tone: "default" | "warning" = "default") {
  const toneClass =
    tone === "warning"
      ? "border-amber-200/80 bg-amber-50/80"
      : "border-slate-300/80 bg-white/94";

  return (
    <div
      key={metric.label}
      className={`rounded-2xl border p-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.34)] ring-1 ring-white/70 ${toneClass}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">{metric.label}</div>
      <div className="mt-1 text-[1.65rem] font-semibold tracking-[-0.03em] text-slate-950">{metric.value}</div>
      <div className="mt-1 text-[12px] leading-5 text-slate-600 sm:text-[11px] sm:leading-4">{metric.note}</div>
    </div>
  );
}

function compactMetricRow(metric: OperationalReportingMetric) {
  return (
    <div
      key={metric.label}
      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/92 px-3 py-2.5 shadow-[0_8px_20px_-24px_rgba(15,23,42,0.3)]"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 sm:text-[12px]">{metric.label}</div>
        <div className="mt-0.5 text-[12px] leading-5 text-slate-600 sm:text-[11px] sm:leading-4">{metric.note}</div>
      </div>
      <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-slate-700 sm:text-[11px]">
        {metric.value}
      </div>
    </div>
  );
}

export default function OperationalReportingSection({ reporting, scopeLabel }: Props) {
  return (
    <section className="rounded-2xl border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-3 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.34)] sm:p-4">
      <div className="mb-3 flex flex-col gap-2 border-b border-slate-200/80 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">Internal reporting</div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-950">Operational Reporting V1</div>
          <div className="mt-1 max-w-3xl text-[12.5px] leading-5 text-slate-600 sm:text-[12px] sm:leading-4">
            Read-only reporting from jobs.ops_status, service_cases, and job_events only. No billing, invoice, or payment totals.
          </div>
        </div>
        <div className="text-right text-[12px] leading-5 text-slate-600 sm:text-[11px] sm:leading-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">Scope</div>
          <div className="font-medium text-slate-800">{scopeLabel}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-2 text-[13px] font-semibold text-slate-900 sm:text-[12px]">Current workload</div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            {reporting.workload.map((metric) => metricCard(metric))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold text-slate-900 sm:text-[12px]">Operational buckets</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {reporting.opsBuckets.map((metric) => compactMetricRow(metric))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold text-slate-900 sm:text-[12px]">Aging and stuck work</div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            {reporting.aging.map((metric) => metricCard(metric, "warning"))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-2 text-[13px] font-semibold text-slate-900 sm:text-[12px]">Recent throughput</div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {reporting.throughput.map((metric) => metricCard(metric))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[13px] font-semibold text-slate-900 sm:text-[12px]">Service continuity</div>
            <div className="grid grid-cols-1 gap-2">
              {reporting.continuity.map((metric) => compactMetricRow(metric))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold text-slate-900 sm:text-[12px]">Service visit outcomes (30d)</div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {reporting.serviceOutcomes.map((metric) => metricCard(metric))}
          </div>
        </div>
      </div>
    </section>
  );
}