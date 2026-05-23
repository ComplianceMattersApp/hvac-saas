"use client";

// app/estimates/[id]/CreateDefaultOptionsForm.tsx
// Internal-only form to trigger creation of default option packages.
// Shows CTA only for eligible draft estimates (no lines, no existing options).

import { createDefaultEstimateOptionsFromForm } from "./actions";
import { Layers3, Sparkles } from "lucide-react";

interface CreateDefaultOptionsFormProps {
  estimateId: string;
  isDraft: boolean;
  isMultiOptionProposal: boolean;
  hasFlatLines: boolean;
  optionsUnavailable?: boolean;
}

export default function CreateDefaultOptionsForm({
  estimateId,
  isDraft,
  isMultiOptionProposal,
  hasFlatLines,
  optionsUnavailable,
}: CreateDefaultOptionsFormProps) {
  // Don't show if not draft
  if (!isDraft) {
    return null;
  }

  // Don't show if already multi-option
  if (isMultiOptionProposal) {
    return null;
  }

  const isEligible = !hasFlatLines && !optionsUnavailable;

  return (
    <div className="rounded-[28px] border border-slate-200/85 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] print:hidden">
      {isEligible ? (
        <>
          <div className="border-b border-emerald-200 bg-emerald-50/80 px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-emerald-200 bg-white text-emerald-700">
                <Layers3 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Build Three Options</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Convert this single estimate into Good, Better, and Best options.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Draft only action
            </p>

            <form action={createDefaultEstimateOptionsFromForm} className="flex gap-2">
              <input type="hidden" name="estimate_id" value={estimateId} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]"
              >
                Create Good / Better / Best Options
              </button>
            </form>
          </div>
        </>
      ) : optionsUnavailable ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
            Not Available
          </div>
          <p className="mt-1 text-sm text-amber-800">
            Option packages are not available in this environment.
          </p>
        </div>
      ) : (
        <div className="rounded-[28px] border border-blue-200 bg-blue-50 px-5 py-4 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-900">
            Options Blocked
          </div>
          <p className="mt-1 text-sm text-blue-800">
            This estimate already has single-estimate line items. Options cannot be created when those lines already exist. To use options, start a new estimate.
          </p>
        </div>
      )}
    </div>
  );
}
