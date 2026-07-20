"use client";

// app/estimates/[id]/CreateDefaultOptionsForm.tsx
// Internal-only form to trigger creation of default option packages.
// Shows CTA only for eligible draft estimates (no lines, no existing options).

import { createDefaultEstimateOptionsFromForm } from "./actions";

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
    <div className="print:hidden">
      {isEligible ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/85 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Proposal Style
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700">
                Single Estimate
              </span>
              <span aria-hidden="true" className="text-slate-300">→</span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                Compare Two or Three Options
              </span>
            </div>
          </div>

          <form action={createDefaultEstimateOptionsFromForm} className="flex gap-2">
              <input type="hidden" name="estimate_id" value={estimateId} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]"
              >
                Start With Two Options
              </button>
            </form>
        </div>
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
