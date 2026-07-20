"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import {
  generateEstimateCoachSuggestionsAction,
  type EstimateCoachAiActionResult,
} from "./actions";

export default function EstimateCoachAiSuggestions({ estimateId }: { estimateId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<EstimateCoachAiActionResult | null>(null);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">AI-assisted review</p>
          <p className="mt-0.5 text-sm text-slate-600">Generate optional wording, line, option-package, and conversion guidance from this estimate snapshot.</p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => setResult(await generateEstimateCoachSuggestionsAction({ estimateId })))}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:cursor-wait disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {isPending ? "Reviewing…" : "Generate suggestions"}
        </button>
      </div>

      {result && !result.success ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{result.error}</div>
      ) : null}

      {result?.success ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-indigo-100 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-slate-950">Coach summary</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{result.suggestions.summary}</p>
          </div>
          {result.suggestions.suggestions.map((suggestion, index) => (
            <article key={`${suggestion.kind}-${index}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">{suggestion.title}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{suggestion.confidence} confidence</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-700">{suggestion.detail}</p>
              {suggestion.proposedText ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm italic text-slate-700">“{suggestion.proposedText}”</div>
              ) : null}
            </article>
          ))}
          {result.suggestions.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-950">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {result.suggestions.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-slate-500">Nothing above has been applied. Use existing estimate controls to make any reviewed change.</p>
        </div>
      ) : null}
    </div>
  );
}
