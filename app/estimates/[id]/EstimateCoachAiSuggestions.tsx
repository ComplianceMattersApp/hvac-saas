"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { generateEstimateCoachSuggestionsAction, type EstimateCoachAiActionResult } from "./actions";

export default function EstimateCoachAiSuggestions({ estimateId }: { estimateId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<EstimateCoachAiActionResult | null>(null);
  const primaryRewrite = result?.success ? result.suggestions.suggestions.find((item) => item.proposedText) : null;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/45 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-950">Polish the whole estimate</p>
          <p className="mt-0.5 text-sm text-slate-600">Get a short customer-ready rewrite and the most important missing details.</p>
        </div>
        <button type="button" disabled={isPending} onClick={() => startTransition(async () => setResult(await generateEstimateCoachSuggestionsAction({ estimateId })))} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-base font-semibold text-white hover:bg-indigo-600 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:text-sm">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {isPending ? "Writing clearly..." : "Review whole estimate"}
        </button>
      </div>

      {result && !result.success ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.error}</p> : null}

      {result?.success ? (
        <div className="mt-4 space-y-3">
          {primaryRewrite?.proposedText ? (
            <div className="rounded-xl border border-indigo-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-700">Suggested wording</p>
              <p className="mt-2 text-base leading-6 text-slate-900">{primaryRewrite.proposedText}</p>
            </div>
          ) : null}
          <div className="rounded-xl border border-indigo-100 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-slate-950">Quick coaching</p>
            <p className="mt-1 text-sm leading-5 text-slate-700">{result.suggestions.summary}</p>
          </div>
          <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">More suggestions</summary>
            <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
              {result.suggestions.suggestions.filter((item) => item !== primaryRewrite).map((item, index) => (
                <div key={`${item.kind}-${index}`}>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-700">{item.detail}</p>
                  {item.proposedText ? <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{item.proposedText}</p> : null}
                </div>
              ))}
              {result.suggestions.warnings.map((warning, index) => <p key={index} className="text-sm leading-5 text-amber-900">• {warning}</p>)}
            </div>
          </details>
          <p className="text-xs text-slate-500">Nothing was changed. Use the estimate controls to apply anything you want.</p>
        </div>
      ) : null}
    </div>
  );
}
