import { CircleAlert, CircleCheck, Sparkles } from "lucide-react";
import type { EstimateCoachReport } from "@/lib/estimates/estimate-coach";

export default function EstimateCoachPanel({ report }: { report: EstimateCoachReport }) {
  const attentionItems = report.suggestions.filter((item) => item.severity === "attention");
  const guidanceItems = report.suggestions.filter((item) => item.severity === "guidance");

  return (
    <section className="overflow-hidden rounded-[28px] border border-indigo-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(49,46,129,0.42)] print:hidden" aria-labelledby="estimate-coach-title">
      <div className="border-b border-indigo-100 bg-indigo-50/70 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Internal assistant
            </p>
            <h2 id="estimate-coach-title" className="mt-1 text-base font-semibold text-slate-950">Estimate Coach</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Deterministic, read-only guidance. Review every suggestion; the estimate record and existing app actions remain authoritative.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${report.attentionCount > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
            {report.attentionCount > 0 ? `${report.attentionCount} item${report.attentionCount === 1 ? "" : "s"} to review` : "Ready for operator review"}
          </span>
        </div>
      </div>

      <div className="space-y-3 px-5 py-5">
        {attentionItems.length === 0 ? (
          <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <div><p className="text-sm font-semibold text-emerald-900">No deterministic readiness gaps found</p><p className="mt-0.5 text-sm text-emerald-800">An operator should still verify scope, pricing, wording, and delivery details.</p></div>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {attentionItems.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/55 px-4 py-3">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-0.5 text-sm leading-5 text-slate-600">{item.detail}</p></div>
              </li>
            ))}
          </ul>
        )}

        {guidanceItems.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/75 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
            <p className="mt-0.5 text-sm leading-5 text-slate-600">{item.detail}</p>
          </div>
        ))}

        <p className="text-xs text-slate-500">Suggestion-only: no AI provider call, database write, send, approval, conversion, invoice, payment, QBO, or SMS action occurs here.</p>
      </div>
    </section>
  );
}
