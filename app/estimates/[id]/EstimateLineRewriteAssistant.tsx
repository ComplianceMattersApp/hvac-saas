"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { rewriteEstimateLineDescriptionAction, type EstimateLineRewriteActionResult } from "./actions";

export default function EstimateLineRewriteAssistant(props: {
  estimateId: string;
  itemName: string;
  itemType: string;
  roughDescription: string;
  onUseRewrite: (value: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<EstimateLineRewriteActionResult | null>(null);

  function requestRewrite() {
    startTransition(async () => {
      setResult(await rewriteEstimateLineDescriptionAction({
        estimateId: props.estimateId,
        itemName: props.itemName,
        itemType: props.itemType,
        roughDescription: props.roughDescription,
      }));
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={isPending || (!props.itemName.trim() && props.roughDescription.trim().length < 3)}
        onClick={requestRewrite}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-base font-semibold text-indigo-900 active:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:text-sm"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Writing it clearly..." : "Rewrite for customer"}
      </button>

      {result && !result.success ? (
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">{result.error}</p>
      ) : null}

      {result?.success ? (
        <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-700">Customer-ready rewrite</p>
          <p className="mt-2 text-base leading-6 text-slate-900">{result.rewrite.rewrittenDescription}</p>
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <button type="button" onClick={() => { props.onUseRewrite(result.rewrite.rewrittenDescription); setResult(null); }} className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2.5 text-base font-semibold text-white active:bg-indigo-800 sm:text-sm">Use rewrite</button>
            <button type="button" onClick={requestRewrite} disabled={isPending} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-800 sm:text-sm">Try again</button>
            <button type="button" onClick={() => setResult(null)} className="min-h-11 rounded-xl border border-transparent px-4 py-2.5 text-base font-semibold text-slate-600 sm:text-sm">Keep mine</button>
          </div>
          {result.rewrite.missingSpecifics.length > 0 ? (
            <div className="mt-3 border-t border-indigo-200 pt-3">
              <p className="text-sm font-semibold text-slate-900">For a stronger estimate, add:</p>
              <ul className="mt-1 space-y-1 text-sm leading-5 text-slate-700">
                {result.rewrite.missingSpecifics.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
