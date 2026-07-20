import { CircleAlert, CircleCheck, Sparkles } from "lucide-react";
import type { EstimateCoachReport } from "@/lib/estimates/estimate-coach";
import EstimateCoachAiSuggestions from "./EstimateCoachAiSuggestions";

export default function EstimateCoachPanel({ report, estimateId, aiEnabled }: { report: EstimateCoachReport; estimateId: string; aiEnabled: boolean }) {
  const attentionItems = report.suggestions.filter((item) => item.severity === "attention");
  const guidanceItems = report.suggestions.filter((item) => item.severity === "guidance");

  return (
    <section className="overflow-hidden rounded-[28px] border border-indigo-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(49,46,129,0.42)] print:hidden" aria-labelledby="estimate-coach-title">
      <div className="border-b border-indigo-100 bg-indigo-50/70 px-4 py-4 sm:px-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Internal assistant</p>
        <h2 id="estimate-coach-title" className="mt-1 text-lg font-semibold text-slate-950">Estimate Coach</h2>
        <p className="mt-1 text-sm text-slate-600">Clearer wording and a quick final check.</p>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
        {aiEnabled ? <EstimateCoachAiSuggestions estimateId={estimateId} /> : null}

        <details>
          <summary className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            Estimate checks {report.attentionCount > 0 ? `(${report.attentionCount} to review)` : "(ready)"}
          </summary>
          <div className="mt-3 space-y-3">
            {attentionItems.length === 0 ? (
              <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                <p className="text-sm font-semibold text-emerald-900">No basic readiness gaps found.</p>
              </div>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {attentionItems.map((item) => (
                  <li key={item.id} className="flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/55 px-4 py-3">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    <div><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-0.5 text-sm leading-5 text-slate-600">{item.detail}</p></div>
                  </li>
                ))}
              </ul>
            )}
            {guidanceItems.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/75 px-4 py-3"><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-0.5 text-sm leading-5 text-slate-600">{item.detail}</p></div>)}
          </div>
        </details>

        <p className="text-xs text-slate-500">AI suggestions never change or send the estimate automatically.</p>
      </div>
    </section>
  );
}
